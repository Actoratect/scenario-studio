import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { createStore, produce, reconcile, unwrap } from 'solid-js/store';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import {
  CHARACTER_TEMPLATE,
  parseSceneYaml,
  serializeSceneYaml,
  type ParsedScene,
  type ScriptBlock,
} from '@scenario-studio/core';
import { Spinner } from '@scenario-studio/ui-kit';
import { createScriptEditor } from '../codemirror/createScriptEditor';
import { insertSnippet, SNIPPETS, type SnippetKind } from '../codemirror/scriptSnippets';
import { ScriptContextRail } from '../script/ScriptContextRail';
import { ScriptVisualEditor } from '../script/ScriptVisualEditor';
import { KNOWN_EMOTIONS } from '../script/emotions';
import { preserveScrollDuringMutation } from '../script/scrollPreservation';
import { bumpScriptLintVersion } from '../services/LintService';
import { ProjectService } from '../services/ProjectService';
import { SceneSelection } from '../services/SceneSelection';
import { Toast } from '../services/Toast';
import { DirtyTracker } from '../services/DirtyTracker';
import { ConflictDetector } from '../services/ConflictDetector';
import { SceneAppearanceIndex } from '../services/SceneAppearanceIndex';
import { GlobalHistoryService } from '../services/GlobalHistoryService';
import { ScriptHistoryService } from '../services/ScriptHistoryService';
import { PanelPinService } from '../services/PanelPinService';
import { PanelFocus } from '../services/PanelFocus';

// 脚本エディタ Panel。
// PR-AA: 既定は「視覚編集モード (visual)」— YAML を見せず、各ブロックをカードで描画。
//        「raw YAML モード (raw)」も切替可で CodeMirror を表示 (上級ユーザ向け)。
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §5
// 感情ラベルは ../script/emotions.ts に集約 (日本語化)。

interface SceneRef {
  chapterSlug: string;
  sceneSlug: string;
  /** Scenarios/<chapter>/<scene>.scn.yaml */
  path: string;
  /** UI label (chapter title / scene title) */
  label: string;
}

type EditorMode = 'visual' | 'raw';

const MODE_STORAGE = 'scenario-studio:script-mode';

function loadModePref(): EditorMode {
  if (typeof localStorage === 'undefined') return 'visual';
  const v = localStorage.getItem(MODE_STORAGE);
  return v === 'raw' ? 'raw' : 'visual';
}

// PR (ux-overhaul-4): per-scene staging を Solid Store で管理する。
//   - createStore: ネストしたフィールド単位で fine-grained reactivity
//   - produce(): mutate-style API で ストアを書き換え (Immer 風)
//   - これでブロック内の text 変更は textarea の `value` 1 つだけ更新する
//     (= 他のブロックは無関係、Solid が DOM を再 mount しない)
// シーン切替えで前 scene の staging は残るので「タブ切替で破棄される」苦情も解消。
const sceneStaging = new Map<string, ParsedScene>();
// raw モード (生 YAML) で編集された scene の storageKey。raw は全文が編集対象なので
// 保存時に full write する。visual 編集のみの scene は blocks だけを disk へマージ書きし、
// PlotDetailRail 側の plot 編集 (別 DirtyTracker キー) を上書きしないようにする。
const sceneRawEdited = new Set<string>();
// Store proxy を unwrap してから JSON-clone する共通 helper。
const cloneScene = ScriptHistoryService.cloneScene;

export const ScriptPanel: Component<GroupPanelPartInitParameters> = (params) => {
  const [scene, setScene] = createSignal<SceneRef | undefined>(undefined);
  const pinnedScene = createMemo(() => PanelPinService.scriptScene(params.api.id));
  // シーン未選択時は空。旧: SAMPLE_SCRIPT を初期表示していたが、「編集できるように
  // 見えるのに編集が黙って破棄される」罠だったため廃止 (専用の空状態を表示する)。
  const [doc, setDoc] = createSignal<string>('');
  // PR (ux-overhaul-4): visual mode の真の source of truth は Solid Store。
  // ブロックの text 変更などは produce() で in-place mutate → 該当 path のみ更新。
  // textarea の value は store の最末端パスを直接読むので、無関係な再 mount が起きない。
  const [parsedStore, setParsedStore] = createStore<ParsedScene>({
    meta: {},
    title: '',
    cast: [],
    blocks: [],
  });
  // 履歴操作中フラグ (undo/redo 中は新規 history を積まない)
  let suppressHistory = false;
  const [saving, setSaving] = createSignal(false);
  // YAML パース失敗の詳細 (undefined = 正常)。値がある間は原本を壊さないよう
  // 保存対象へ積まず (commitRawText が early return)、visual 切替も封じてバナーで警告する。
  const [parseError, setParseError] = createSignal<string | undefined>(undefined);
  const [mode, setMode] = createSignal<EditorMode>(loadModePref());
  let host: HTMLDivElement | undefined;
  let view: ReturnType<typeof createScriptEditor> | undefined;
  let suppressRawChange = false;

  function sceneStorageKey(path: string): string {
    const projectId = ProjectService.currentProject()?.handle.id ?? 'no-project';
    return `${projectId}\u0000${path}`;
  }

  function replaceEditorDoc(text: string): void {
    if (!view || view.state.doc.toString() === text) return;
    suppressRawChange = true;
    try {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    } finally {
      suppressRawChange = false;
    }
  }

  function syncDocFromScene(snapshot: ParsedScene): void {
    const text = serializeSceneYaml(snapshot);
    setDoc(text);
    replaceEditorDoc(text);
  }

  function setModeAndPersist(m: EditorMode): void {
    // visual → raw 切替時に CodeMirror へ最新の serialized YAML を流し込む
    if (m === 'raw' && view) {
      const text = serializeSceneYaml(unwrap(parsedStore) as ParsedScene);
      setDoc(text);
      replaceEditorDoc(text);
    }
    setMode(m);
    if (typeof localStorage !== 'undefined') localStorage.setItem(MODE_STORAGE, m);
  }

  const availableScenes = createMemo<readonly SceneRef[]>(() => {
    const ctx = ProjectService.currentProject();
    if (!ctx) return [];
    const out: SceneRef[] = [];
    for (const ch of ctx.project.scenario.chapters) {
      for (const sc of ch.scenes) {
        out.push({
          chapterSlug: ch.slug,
          sceneSlug: sc.slug,
          path: `Scenarios/${ch.slug}/${sc.relativePath}`,
          label: `${ch.title} / ${sc.title}`,
        });
      }
    }
    return out;
  });

  const characterSlugs = createMemo<readonly string[]>(() => {
    const ctx = ProjectService.currentProject();
    if (!ctx) return [];
    const out = new Set<string>();
    for (const node of ctx.project.nodes.values()) {
      if (node.templateId !== CHARACTER_TEMPLATE.id) continue;
      out.add(node.slug);
      const devName = node.fields['dev_name'];
      if (typeof devName === 'string' && devName.trim() !== '') out.add(devName.trim());
      const display = node.fields['display_name'];
      if (typeof display === 'string' && display.trim() !== '') out.add(display.trim());
    }
    return [...out].sort();
  });

  const defaultCharacterIdentifier = createMemo<string>(() => {
    const ctx = ProjectService.currentProject();
    if (!ctx) return '';
    const chars: { identifier: string; display: string }[] = [];
    for (const node of ctx.project.nodes.values()) {
      if (node.templateId !== CHARACTER_TEMPLATE.id) continue;
      const devName = node.fields['dev_name'];
      const display = node.fields['display_name'];
      chars.push({
        identifier:
          typeof devName === 'string' && devName.trim() !== '' ? devName.trim() : node.slug,
        display: typeof display === 'string' && display.trim() !== '' ? display.trim() : node.slug,
      });
    }
    chars.sort((a, b) => a.display.localeCompare(b.display));
    return chars[0]?.identifier ?? '';
  });

  function pushHistory(targetPath: string, mergeKey?: string): void {
    if (suppressHistory) return;
    const shouldMerge =
      mergeKey !== undefined && GlobalHistoryService.canMergeScript(targetPath, mergeKey);
    if (shouldMerge) {
      ScriptHistoryService.push(targetPath, parsedStore, { mergeKey });
    } else {
      ScriptHistoryService.push(targetPath, parsedStore);
    }
    if (!shouldMerge) {
      // Undo 通知用にシーンのラベル (章 / シーン名) を残す。
      GlobalHistoryService.recordScript(
        targetPath,
        mergeKey,
        `脚本「${scene()?.label ?? targetPath}」の編集`,
      );
    }
  }

  /** dirty 化 (毎 mutation 後に呼ぶ)。staging を最新の store snapshot で更新。 */
  function markDirty(target: SceneRef): void {
    sceneStaging.set(sceneStorageKey(target.path), cloneScene(parsedStore));
    DirtyTracker.mark({
      key: target.path,
      label: target.label,
      saveFn: () => saveNow(target),
    });
  }

  async function loadScene(ref: SceneRef): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    setScene(ref);
    PanelPinService.setCurrentScript(params.api.id, ref);
    ScriptHistoryService.setActivePath(ref.path);
    // staging に既存があればそれを優先 (タブ切替で破棄しないため)
    const staged = sceneStaging.get(sceneStorageKey(ref.path));
    if (staged) {
      setParseError(undefined);
      setParsedStore(reconcile(cloneScene(staged)));
      const text = serializeSceneYaml(staged);
      setDoc(text);
      replaceEditorDoc(text);
      return;
    }
    // staging 無し = disk から読み直すので raw 編集フラグもクリーンにする。
    sceneRawEdited.delete(sceneStorageKey(ref.path));
    const exists = await ctx.adapter.exists(ctx.handle, ref.path);
    const text = exists
      ? await ctx.adapter.read(ctx.handle, ref.path)
      : starterSceneYaml(ref.sceneSlug);
    // 競合検知の baseline を「今 disk で見た内容」に設定。外部エージェント (Claude Code 等)
    // が後からこのシーンを書き換えたら、保存直前の checkBeforeWrite で検知できる。
    if (exists) ConflictDetector.recordSnapshot(ctx.handle, ref.path, text);
    let p: ParsedScene;
    try {
      p = parseSceneYaml(text);
    } catch (e) {
      // パース不能。空シーンへ置換すると 1 ブロック編集 + 保存で原本を空で上書きしてしまう。
      // raw モード固定で disk のテキストをそのまま見せ、markDirty を積まないことで
      // 保存対象からも外し、バナーで修正を促す (パースが通れば commitRawText で解除)。
      setParseError(e instanceof Error ? e.message : String(e));
      setMode('raw');
      setDoc(text);
      replaceEditorDoc(text);
      return;
    }
    setParseError(undefined);
    setParsedStore(reconcile(p));
    setDoc(text);
    replaceEditorDoc(text);
  }

  /** raw mode (CodeMirror) で edit された text を staging に反映。 */
  function commitRawText(text: string): void {
    setDoc(text);
    const target = scene();
    if (!target) return;
    let next: ParsedScene;
    try {
      next = parseSceneYaml(text);
    } catch (e) {
      // YAML parse 失敗: staging を更新せず、原本を壊さないため保存対象からも外す。
      // バナーで「壊れている・このままでは保存されない」ことを明示する
      // (旧実装はコメントに反して無言 return で、ライターは気付けなかった)。
      setParseError(e instanceof Error ? e.message : String(e));
      return;
    }
    setParseError(undefined);
    sceneRawEdited.add(sceneStorageKey(target.path));
    pushHistory(target.path, 'raw');
    setParsedStore(reconcile(next));
    markDirty(target);
  }

  async function saveNow(ref: SceneRef): Promise<'skipped' | void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const key = sceneStorageKey(ref.path);
    const staged = sceneStaging.get(key);
    const current = scene()?.path === ref.path ? (unwrap(parsedStore) as ParsedScene) : undefined;
    const snapshot = staged ?? current;
    if (!snapshot) return;
    setSaving(true);
    try {
      // 上書き前に外部変更 (AI エージェント等) がないか確認。ユーザが温存を選んだら
      // 書かずに 'skipped' を返し、staging / dirty を残す (⟳ 再読込で取り込める)。
      const ok = await ConflictDetector.checkBeforeWrite(ctx.adapter, ctx.handle, ref.path);
      if (!ok) {
        Toast.info(`保存スキップ: ${ref.label} (外部変更を温存)`, 4000);
        return 'skipped';
      }
      const text = await mergedSceneYaml(ctx, ref.path, snapshot, sceneRawEdited.has(key));
      await ctx.adapter.write(ctx.handle, ref.path, text);
      ConflictDetector.recordSnapshot(ctx.handle, ref.path, text);
      DirtyTracker.clear(ref.path);
      sceneStaging.delete(key);
      sceneRawEdited.delete(key);
      bumpScriptLintVersion();
      SceneAppearanceIndex.invalidate();
    } catch (e) {
      console.error('script save failed', e);
      Toast.error(`脚本の保存に失敗: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    } finally {
      setSaving(false);
    }
  }

  async function ensureSceneLoaded(path: string): Promise<SceneRef | undefined> {
    const current = scene();
    if (current?.path === path) return current;
    const ref = availableScenes().find((s) => s.path === path);
    if (!ref) return undefined;
    await loadScene(ref);
    SceneSelection.select({
      chapterSlug: ref.chapterSlug,
      sceneSlug: ref.sceneSlug,
      label: ref.label,
    });
    return ref;
  }

  async function undoPath(path: string): Promise<boolean> {
    const target = await ensureSceneLoaded(path);
    if (!target) return false;
    const prev = ScriptHistoryService.takeUndo(target.path, parsedStore);
    if (!prev) return false;
    suppressHistory = true;
    try {
      setParsedStore(reconcile(prev));
      syncDocFromScene(prev);
      markDirty(target);
    } finally {
      suppressHistory = false;
    }
    return true;
  }

  async function redoPath(path: string): Promise<boolean> {
    const target = await ensureSceneLoaded(path);
    if (!target) return false;
    const next = ScriptHistoryService.takeRedo(target.path, parsedStore);
    if (!next) return false;
    suppressHistory = true;
    try {
      setParsedStore(reconcile(next));
      syncDocFromScene(next);
      markDirty(target);
    } finally {
      suppressHistory = false;
    }
    return true;
  }

  function onChangeBlock(idx: number, next: ScriptBlock): void {
    const target = scene();
    if (!target) return;
    pushHistory(target.path, `block:${idx}`);
    // PR (ux-overhaul-5): block を REPLACE せず in-place mutation で path-level patch。
    // これで store proxy の block 参照が保たれ、Index の signal が発火せず textarea
    // が再 mount されない。同一 kind の field-by-field 差分だけを書き込む。
    setParsedStore(
      produce((s) => {
        const cur = s.blocks[idx];
        if (cur && cur.kind === next.kind) {
          // 同じ kind: プロパティ単位で patch
          const curRec = cur as unknown as Record<string, unknown>;
          const nextRec = next as unknown as Record<string, unknown>;
          for (const k of Object.keys(nextRec)) {
            if (curRec[k] !== nextRec[k]) curRec[k] = nextRec[k];
          }
          for (const k of Object.keys(curRec)) {
            if (!(k in nextRec)) delete curRec[k];
          }
        } else {
          // kind が変わった → 全置換 (新しい proxy が作られる)
          (s.blocks as ScriptBlock[])[idx] = next;
        }
      }),
    );
    markDirty(target);
  }
  function onDeleteBlock(idx: number): void {
    const target = scene();
    if (!target) return;
    pushHistory(target.path);
    preserveVisualScroll(() => {
      setParsedStore(
        produce((s) => {
          (s.blocks as ScriptBlock[]).splice(idx, 1);
        }),
      );
    });
    markDirty(target);
  }
  function onMoveBlock(idx: number, delta: -1 | 1): void {
    const target = scene();
    if (!target) return;
    const swapTo = idx + delta;
    if (swapTo < 0 || swapTo >= parsedStore.blocks.length) return;
    pushHistory(target.path);
    preserveVisualScroll(() => {
      setParsedStore(
        produce((s) => {
          const blocks = s.blocks as ScriptBlock[];
          [blocks[idx]!, blocks[swapTo]!] = [blocks[swapTo]!, blocks[idx]!];
        }),
      );
    });
    markDirty(target);
  }
  function onAppendBlock(kind: ScriptBlock['kind']): void {
    const target = scene();
    if (!target) return;
    const defaultWho = defaultCharacterIdentifier();
    pushHistory(target.path);
    preserveVisualScroll(() => {
      setParsedStore(
        produce((s) => {
          (s.blocks as ScriptBlock[]).push(defaultBlock(kind, defaultWho));
        }),
      );
    });
    markDirty(target);
  }
  function onInsertBlock(index: number, kind: ScriptBlock['kind']): void {
    const target = scene();
    if (!target) return;
    const defaultWho = defaultCharacterIdentifier();
    pushHistory(target.path);
    const clamped = Math.max(0, Math.min(index, parsedStore.blocks.length));
    preserveVisualScroll(() => {
      setParsedStore(
        produce((s) => {
          (s.blocks as ScriptBlock[]).splice(clamped, 0, defaultBlock(kind, defaultWho));
        }),
      );
    });
    markDirty(target);
  }
  /** Ctrl+D: ブロックを複製して直下に挿入 (キーボード執筆フロー用)。 */
  function onDuplicateBlock(idx: number): void {
    const target = scene();
    if (!target) return;
    const cur = (unwrap(parsedStore) as ParsedScene).blocks[idx];
    if (!cur) return;
    pushHistory(target.path);
    const clone = JSON.parse(JSON.stringify(cur)) as ScriptBlock;
    preserveVisualScroll(() => {
      setParsedStore(
        produce((s) => {
          (s.blocks as ScriptBlock[]).splice(idx + 1, 0, clone);
        }),
      );
    });
    markDirty(target);
  }
  /**
   * Ctrl+Enter: 直下に同種の空ブロックを挿入。会話劇の執筆リズムを止めないよう
   * line/action は話者 (line は感情も) を引き継ぐ。
   */
  function onInsertNextBlock(idx: number): void {
    const target = scene();
    if (!target) return;
    const cur = (unwrap(parsedStore) as ParsedScene).blocks[idx];
    if (!cur) return;
    const kind = cur.kind === 'unknown' ? 'line' : cur.kind;
    pushHistory(target.path);
    const block = defaultBlock(kind, defaultCharacterIdentifier());
    if (
      (block.kind === 'line' || block.kind === 'action') &&
      (cur.kind === 'line' || cur.kind === 'action')
    ) {
      block.who = cur.who;
      if (block.kind === 'line' && cur.kind === 'line' && cur.emotion !== undefined) {
        block.emotion = cur.emotion;
      }
    }
    preserveVisualScroll(() => {
      setParsedStore(
        produce((s) => {
          (s.blocks as ScriptBlock[]).splice(idx + 1, 0, block);
        }),
      );
    });
    markDirty(target);
  }

  /** 現在表示中の scene の title / slug をプロンプトで変更し、ファイルを rename。 */
  async function renameCurrentScene(): Promise<void> {
    const cur = scene();
    const ctx = ProjectService.currentProject();
    if (!cur || !ctx) {
      Toast.info('シーンを選択してください');
      return;
    }
    const newTitle = window.prompt('シーンのタイトル:', cur.label.split(' / ').slice(-1)[0] ?? '');
    if (newTitle === null) return;
    const newSlug = window.prompt(
      'シーンの slug (英小文字 / 数字 / _ / -, 空欄で変更しない):',
      cur.sceneSlug,
    );
    if (newSlug === null) return;
    const trimmedSlug = newSlug.trim();
    const trimmedTitle = newTitle.trim();
    if (trimmedSlug === '' || !/^[a-z0-9_-]+$/i.test(trimmedSlug)) {
      Toast.error(`不正な slug: ${trimmedSlug}`);
      return;
    }
    try {
      const result = await ctx.scenarioRepository.renameScene({
        chapterSlug: cur.chapterSlug,
        oldSlug: cur.sceneSlug,
        newSlug: trimmedSlug,
        newTitle: trimmedTitle === '' ? undefined : trimmedTitle,
      });
      const nextChapters = ctx.project.scenario.chapters.map((c) =>
        c.slug === cur.chapterSlug
          ? {
              ...c,
              scenes: c.scenes.map((s) =>
                s.slug === cur.sceneSlug
                  ? {
                      ...s,
                      slug: result.slug,
                      title: result.title,
                      relativePath: `${result.slug}.scn.yaml`,
                    }
                  : s,
              ),
            }
          : c,
      );
      Object.assign(ctx.project, {
        scenario: { ...ctx.project.scenario, chapters: nextChapters },
      });
      ProjectService.touch();
      // 表示中の scene 参照も更新 (新しい path に追従)
      const newRef: SceneRef = {
        chapterSlug: cur.chapterSlug,
        sceneSlug: result.slug,
        path: `Scenarios/${cur.chapterSlug}/${result.slug}.scn.yaml`,
        label: cur.label.split(' / ').slice(0, -1).concat(result.title).join(' / '),
      };
      setScene(newRef);
      SceneSelection.select({
        chapterSlug: cur.chapterSlug,
        sceneSlug: result.slug,
        label: result.title,
      });
      Toast.success(`シーン名変更: ${cur.sceneSlug} → ${result.slug}`);
    } catch (e) {
      Toast.error(`シーン名変更に失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function activateHistoryTarget(): void {
    ScriptHistoryService.setActivePath(scene()?.path);
  }

  function visualScrollElements(): HTMLElement[] {
    const elements: HTMLElement[] = [];
    for (const selector of ['.panel-script-content-main', '.panel-script-content']) {
      const el = panelRoot?.querySelector(selector) as HTMLElement | null;
      if (el && !elements.includes(el)) elements.push(el);
    }
    return elements;
  }

  function preserveVisualScroll(run: () => void): void {
    preserveScrollDuringMutation(visualScrollElements(), run);
  }

  let panelRoot: HTMLDivElement | undefined;
  let unregisterGlobalHistoryController: (() => void) | undefined;

  onMount(() => {
    if (!host) return;
    view = createScriptEditor({
      parent: host,
      initialDoc: doc(),
      sources: {
        characterSlugs: () => characterSlugs(),
        emotionTags: () => KNOWN_EMOTIONS,
      },
      onChange: (text) => {
        if (!suppressRawChange) commitRawText(text);
      },
    });
    unregisterGlobalHistoryController = GlobalHistoryService.registerScriptController({
      canUndo: (path) => ScriptHistoryService.canUndo(path),
      canRedo: (path) => ScriptHistoryService.canRedo(path),
      undo: (path) => undoPath(path),
      redo: (path) => redoPath(path),
    });
    const sel = pinnedScene() ?? SceneSelection.selected();
    if (sel) {
      const ref = availableScenes().find(
        (s) => s.chapterSlug === sel.chapterSlug && s.sceneSlug === sel.sceneSlug,
      );
      if (ref) void loadScene(ref);
    }
  });

  createEffect(() => {
    const sel = pinnedScene() ?? SceneSelection.selected();
    if (!sel) return;
    const cur = scene();
    if (cur && cur.chapterSlug === sel.chapterSlug && cur.sceneSlug === sel.sceneSlug) return;
    const ref = availableScenes().find(
      (s) => s.chapterSlug === sel.chapterSlug && s.sceneSlug === sel.sceneSlug,
    );
    if (ref) void loadScene(ref);
  });

  onCleanup(() => {
    unregisterGlobalHistoryController?.();
    PanelPinService.clearCurrentScript(params.api.id);
    view?.destroy();
  });

  function onInsert(kind: SnippetKind): void {
    if (!view) return;
    const defaultWho = defaultCharacterIdentifier() || 'cloud';
    insertSnippet(view, kind, defaultWho);
  }

  return (
    <div
      class="panel-content panel-script"
      ref={panelRoot}
      onFocusIn={activateHistoryTarget}
      onPointerDown={activateHistoryTarget}
    >
      <div class="panel-script-meta">
        <span>シーン:</span>
        <select
          class="panel-script-scene-select"
          value={scene()?.path ?? ''}
          onChange={(e) => {
            const path = e.currentTarget.value;
            const ref = availableScenes().find((s) => s.path === path);
            if (ref) {
              void loadScene(ref);
              const nextSelection = {
                chapterSlug: ref.chapterSlug,
                sceneSlug: ref.sceneSlug,
                label: ref.label,
              };
              if (PanelPinService.isScriptPinned(params.api.id)) {
                PanelPinService.pinScript(params.api.id, nextSelection);
              } else {
                SceneSelection.select(nextSelection);
              }
            }
          }}
        >
          <option value="">— シーンを選択 —</option>
          <For each={availableScenes()}>{(s) => <option value={s.path}>{s.label}</option>}</For>
        </select>
        <button
          type="button"
          class="panel-script-rename"
          disabled={!scene()}
          onClick={() => void renameCurrentScene()}
          title="シーン名 / slug を変更"
        >
          ✎ 名前変更
        </button>
        <Show when={saving()}>
          <span class="panel-script-saving">
            <Spinner /> 保存中…
          </span>
        </Show>
        <Show when={PanelPinService.isScriptPinned(params.api.id)}>
          <span class="panel-script-pin-tag">📌 pinned</span>
        </Show>
        <span class="panel-script-mode-toggle">
          <button
            type="button"
            classList={{ active: mode() === 'visual' }}
            disabled={!!parseError()}
            onClick={() => setModeAndPersist('visual')}
            title={
              parseError() ? 'YAML を修正するとビジュアル編集に戻れます' : 'ブロックカード表示'
            }
          >
            🎨 ビジュアル
          </button>
          <button
            type="button"
            classList={{ active: mode() === 'raw' }}
            onClick={() => setModeAndPersist('raw')}
            title="生 YAML 表示 (上級者向け)"
          >
            {} YAML
          </button>
        </span>
        <span class="panel-script-panel-id">
          · <code>{params.api.id}</code>
        </span>
      </div>

      {/* YAML パース失敗の警告 (原本破壊を防ぐため保存・visual 切替を封じている旨を明示) */}
      <Show when={parseError()}>
        {(msg) => (
          <div class="panel-script-parse-error" role="alert">
            <strong>⚠ YAML が壊れています</strong> — 修正されるまでこのシーンは保存されません。
            <br />
            <code>{msg()}</code>
          </div>
        )}
      </Show>

      {/* シーン未選択: 編集できない罠 UI を出さず、専用の空状態で導線を示す */}
      <Show when={!scene()}>
        <div class="panel-script-empty">
          <p class="panel-script-empty-title">シーンがまだ選択されていません</p>
          <p class="panel-script-empty-lead">
            📚 アウトラインで「+ チャプター」→「+ シーン」を作成し、
            上の「シーン:」から選ぶと執筆を始められます。
          </p>
          <button
            type="button"
            data-variant="primary"
            onClick={() => PanelFocus.focusComponent('outline')}
          >
            📚 アウトラインを開く
          </button>
        </div>
      </Show>

      {/* visual モード: 上部にシーンメタ */}
      <Show when={mode() === 'visual' && scene()}>
        <div class="panel-script-scene-meta">
          <Show when={parsedStore.title}>
            <span class="panel-script-scene-title">{parsedStore.title}</span>
          </Show>
          <Show when={parsedStore.cast.length > 0}>
            <span class="panel-script-scene-cast">
              キャスト:{' '}
              <For each={parsedStore.cast}>
                {(c) => <code class="panel-script-scene-cast-chip">{c}</code>}
              </For>
            </span>
          </Show>
        </div>
      </Show>

      {/* raw モード: snippet toolbar */}
      <Show when={mode() === 'raw' && scene()}>
        <div class="panel-script-toolbar">
          <span class="panel-script-toolbar-label">挿入:</span>
          <For each={SNIPPETS}>
            {(s) => (
              <button
                type="button"
                class="panel-script-snippet"
                data-kind={s.kind}
                onClick={() => onInsert(s.kind)}
                title={`${s.label} ブロックを挿入`}
              >
                + {s.label}
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* visual モード: ScriptVisualEditor + 右側 rail (PR-AS) */}
      <div
        class="panel-script-content panel-script-content--rail"
        style={{ display: mode() === 'visual' && scene() ? 'flex' : 'none' }}
      >
        <div class="panel-script-content-main">
          <ScriptVisualEditor
            parsed={parsedStore}
            chapterSlug={scene()?.chapterSlug}
            sceneSlug={scene()?.sceneSlug}
            onChangeBlock={onChangeBlock}
            onDeleteBlock={onDeleteBlock}
            onMoveBlock={onMoveBlock}
            onAppendBlock={onAppendBlock}
            onInsertBlock={onInsertBlock}
            onDuplicateBlock={onDuplicateBlock}
            onInsertNextBlock={onInsertNextBlock}
          />
        </div>
        <ScriptContextRail
          parsed={parsedStore}
          chapterSlug={scene()?.chapterSlug}
          sceneSlug={scene()?.sceneSlug}
        />
      </div>

      {/* raw モード: CodeMirror (host は CodeMirror の mount 先なので DOM には常に残す) */}
      <div
        class="panel-script-host"
        ref={host}
        style={{ display: mode() === 'raw' && scene() ? 'block' : 'none' }}
      />
    </div>
  );
};

// 保存時に「自分が編集した domain だけ」をディスクへ反映する。
// visual モードで ScriptPanel が所有するのは blocks のみ。plot/title/cast は
// PlotDetailRail の担当なので、書き込み直前にディスクの最新を読み直して blocks だけ
// 差し替える。これで同一シーンを両パネルで未保存編集しても保存順に依らず双方の
// 変更が残る (DirtyTracker キー衝突 / stale コピー上書きによる silent data loss の解消)。
// raw モードは全文が編集対象なので full write。ディスクが壊れてマージ不能な場合も full write。
async function mergedSceneYaml(
  ctx: NonNullable<ReturnType<typeof ProjectService.currentProject>>,
  path: string,
  staged: ParsedScene,
  rawEdited: boolean,
): Promise<string> {
  if (!rawEdited && (await ctx.adapter.exists(ctx.handle, path))) {
    try {
      const disk = parseSceneYaml(await ctx.adapter.read(ctx.handle, path));
      return serializeSceneYaml({ ...disk, blocks: staged.blocks });
    } catch {
      // ディスク側が壊れている等でマージ不能 → staged を full write
    }
  }
  return serializeSceneYaml(staged);
}

function defaultBlock(kind: ScriptBlock['kind'], defaultWho: string): ScriptBlock {
  switch (kind) {
    case 'line':
      return { kind: 'line', who: defaultWho, emotion: '穏やか', text: '' };
    case 'stage':
      return { kind: 'stage', text: '' };
    case 'aside':
      return { kind: 'aside', text: '' };
    case 'action':
      return { kind: 'action', who: defaultWho, text: '' };
    case 'sfx':
      return { kind: 'sfx', name: '' };
    case 'bgm':
      return { kind: 'bgm', cue: '', fade: 1.0 };
    case 'choice':
      return { kind: 'choice', prompt: '', options: [{ text: '選択 A' }] };
    case 'image':
      return { kind: 'image', src: '' };
    case 'comment':
      return { kind: 'comment', text: '' };
    case 'unknown':
      return { kind: 'unknown', raw: null };
  }
}

function starterSceneYaml(slug: string): string {
  return `schemaVersion: 1
sceneId: scene.${slug}
plot:
  title: ${slug}
  cast: []

script:
  - { kind: stage, text: "ここに状況を…" }
`;
}
