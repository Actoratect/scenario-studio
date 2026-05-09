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
import { SAMPLE_SCRIPT } from '../codemirror/sampleScript';
import { insertSnippet, SNIPPETS, type SnippetKind } from '../codemirror/scriptSnippets';
import { ScriptContextRail } from '../script/ScriptContextRail';
import { ScriptVisualEditor } from '../script/ScriptVisualEditor';
import { KNOWN_EMOTIONS } from '../script/emotions';
import { bumpScriptLintVersion } from '../services/LintService';
import { ProjectService } from '../services/ProjectService';
import { SceneSelection } from '../services/SceneSelection';
import { Toast } from '../services/Toast';
import { DirtyTracker } from '../services/DirtyTracker';
import { SceneAppearanceIndex } from '../services/SceneAppearanceIndex';

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
// per-scene Undo / Redo スタック (ParsedScene snapshot, 構造クローン)。最大 100 件。
const HISTORY_LIMIT = 100;
const sceneHistory = new Map<string, { undo: ParsedScene[]; redo: ParsedScene[] }>();

function getHistory(path: string): { undo: ParsedScene[]; redo: ParsedScene[] } {
  let h = sceneHistory.get(path);
  if (!h) {
    h = { undo: [], redo: [] };
    sceneHistory.set(path, h);
  }
  return h;
}

/** 純粋な複製 (history snapshot 用)。Store proxy を unwrap してから JSON-clone。 */
function cloneScene(s: ParsedScene): ParsedScene {
  const raw = unwrap(s) as ParsedScene;
  return JSON.parse(JSON.stringify(raw)) as ParsedScene;
}

export const ScriptPanel: Component<GroupPanelPartInitParameters> = (params) => {
  const [scene, setScene] = createSignal<SceneRef | undefined>(undefined);
  const [doc, setDoc] = createSignal<string>(SAMPLE_SCRIPT);
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
  const [mode, setMode] = createSignal<EditorMode>(loadModePref());
  const [historyRevision, setHistoryRevision] = createSignal(0);
  let host: HTMLDivElement | undefined;
  let view: ReturnType<typeof createScriptEditor> | undefined;

  function setModeAndPersist(m: EditorMode): void {
    // visual → raw 切替時に CodeMirror へ最新の serialized YAML を流し込む
    if (m === 'raw' && view) {
      const text = serializeSceneYaml(unwrap(parsedStore) as ParsedScene);
      if (view.state.doc.toString() !== text) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      }
      setDoc(text);
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
    const out: string[] = [];
    for (const node of ctx.project.nodes.values()) {
      if (node.templateId === CHARACTER_TEMPLATE.id) out.push(node.slug);
    }
    return out.sort();
  });

  // visual mode の View は parsedStore を直接使う。下位互換のため parsed = parsedStore。
  const parsed = parsedStore;

  /** History snapshot を積む共通処理 (undo/redo 中以外)。 */
  function touchHistory(): void {
    setHistoryRevision((v) => v + 1);
  }

  const activeHistory = createMemo(() => {
    historyRevision();
    const target = scene();
    return target ? getHistory(target.path) : undefined;
  });
  const canUndo = createMemo(() => (activeHistory()?.undo.length ?? 0) > 0);
  const canRedo = createMemo(() => (activeHistory()?.redo.length ?? 0) > 0);

  function pushHistory(targetPath: string): void {
    if (suppressHistory) return;
    const h = getHistory(targetPath);
    h.undo.push(cloneScene(parsedStore));
    if (h.undo.length > HISTORY_LIMIT) h.undo.shift();
    h.redo.length = 0;
    touchHistory();
  }

  /** dirty 化 (毎 mutation 後に呼ぶ)。staging を最新の store snapshot で更新。 */
  function markDirty(target: SceneRef): void {
    sceneStaging.set(target.path, cloneScene(parsedStore));
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
    // staging に既存があればそれを優先 (タブ切替で破棄しないため)
    const staged = sceneStaging.get(ref.path);
    if (staged) {
      setParsedStore(reconcile(cloneScene(staged)));
      const text = serializeSceneYaml(staged);
      setDoc(text);
      if (view) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      }
      return;
    }
    const exists = await ctx.adapter.exists(ctx.handle, ref.path);
    const text = exists
      ? await ctx.adapter.read(ctx.handle, ref.path)
      : starterSceneYaml(ref.sceneSlug);
    let p: ParsedScene;
    try {
      p = parseSceneYaml(text);
    } catch {
      p = { meta: {}, title: '', cast: [], blocks: [] };
    }
    setParsedStore(reconcile(p));
    setDoc(text);
    if (view) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      });
    }
  }

  /** raw mode (CodeMirror) で edit された text を staging に反映。 */
  function commitRawText(text: string): void {
    setDoc(text);
    const target = scene();
    if (!target) return;
    let next: ParsedScene;
    try {
      next = parseSceneYaml(text);
    } catch {
      // YAML parse 失敗時は staging 更新せず警告だけ
      return;
    }
    pushHistory(target.path);
    setParsedStore(reconcile(next));
    markDirty(target);
  }

  async function saveNow(ref: SceneRef): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const text = serializeSceneYaml(unwrap(parsedStore) as ParsedScene);
    setSaving(true);
    try {
      await ctx.adapter.write(ctx.handle, ref.path, text);
      DirtyTracker.clear(ref.path);
      sceneStaging.delete(ref.path);
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

  function undo(): void {
    const target = scene();
    if (!target) return;
    const h = getHistory(target.path);
    const prev = h.undo.pop();
    if (!prev) return;
    h.redo.push(cloneScene(parsedStore));
    if (h.redo.length > HISTORY_LIMIT) h.redo.shift();
    touchHistory();
    suppressHistory = true;
    try {
      setParsedStore(reconcile(prev));
      markDirty(target);
    } finally {
      suppressHistory = false;
    }
  }

  function redo(): void {
    const target = scene();
    if (!target) return;
    const h = getHistory(target.path);
    const next = h.redo.pop();
    if (!next) return;
    h.undo.push(cloneScene(parsedStore));
    if (h.undo.length > HISTORY_LIMIT) h.undo.shift();
    touchHistory();
    suppressHistory = true;
    try {
      setParsedStore(reconcile(next));
      markDirty(target);
    } finally {
      suppressHistory = false;
    }
  }

  function onChangeBlock(idx: number, next: ScriptBlock): void {
    const target = scene();
    if (!target) return;
    pushHistory(target.path);
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
    setParsedStore(
      produce((s) => {
        (s.blocks as ScriptBlock[]).splice(idx, 1);
      }),
    );
    markDirty(target);
  }
  function onMoveBlock(idx: number, delta: -1 | 1): void {
    const target = scene();
    if (!target) return;
    const swapTo = idx + delta;
    if (swapTo < 0 || swapTo >= parsedStore.blocks.length) return;
    pushHistory(target.path);
    setParsedStore(
      produce((s) => {
        const blocks = s.blocks as ScriptBlock[];
        [blocks[idx]!, blocks[swapTo]!] = [blocks[swapTo]!, blocks[idx]!];
      }),
    );
    markDirty(target);
  }
  function onAppendBlock(kind: ScriptBlock['kind']): void {
    const target = scene();
    if (!target) return;
    const defaultWho = characterSlugs()[0] ?? '';
    pushHistory(target.path);
    setParsedStore(
      produce((s) => {
        (s.blocks as ScriptBlock[]).push(defaultBlock(kind, defaultWho));
      }),
    );
    markDirty(target);
  }
  function onInsertBlock(index: number, kind: ScriptBlock['kind']): void {
    const target = scene();
    if (!target) return;
    const defaultWho = characterSlugs()[0] ?? '';
    pushHistory(target.path);
    const clamped = Math.max(0, Math.min(index, parsedStore.blocks.length));
    setParsedStore(
      produce((s) => {
        (s.blocks as ScriptBlock[]).splice(clamped, 0, defaultBlock(kind, defaultWho));
      }),
    );
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

  /** Ctrl/Cmd+Z / Ctrl/Cmd+Y を script panel スコープで先取り (capture phase で window) */
  function onPanelKey(e: KeyboardEvent): void {
    const meta = e.ctrlKey || e.metaKey;
    if (!meta || e.isComposing) return;
    if (!panelRoot || !(e.target instanceof Node) || !panelRoot.contains(e.target)) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      undo();
    } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      redo();
    }
  }

  let panelRoot: HTMLDivElement | undefined;

  onMount(() => {
    if (!host) return;
    view = createScriptEditor({
      parent: host,
      initialDoc: doc(),
      sources: {
        characterSlugs: () => characterSlugs(),
        emotionTags: () => KNOWN_EMOTIONS,
      },
      onChange: (text) => commitRawText(text),
    });
    // capture-phase で window に attach すると WorkspaceShell の global Ctrl+Z より先に動く
    window.addEventListener('keydown', onPanelKey, true);
    const sel = SceneSelection.selected();
    if (sel) {
      const ref = availableScenes().find(
        (s) => s.chapterSlug === sel.chapterSlug && s.sceneSlug === sel.sceneSlug,
      );
      if (ref) void loadScene(ref);
    }
  });

  createEffect(() => {
    const sel = SceneSelection.selected();
    if (!sel) return;
    const cur = scene();
    if (cur && cur.chapterSlug === sel.chapterSlug && cur.sceneSlug === sel.sceneSlug) return;
    const ref = availableScenes().find(
      (s) => s.chapterSlug === sel.chapterSlug && s.sceneSlug === sel.sceneSlug,
    );
    if (ref) void loadScene(ref);
  });

  onCleanup(() => {
    window.removeEventListener('keydown', onPanelKey, true);
    view?.destroy();
  });

  function onInsert(kind: SnippetKind): void {
    if (!view) return;
    const defaultWho = characterSlugs()[0] ?? 'cloud';
    insertSnippet(view, kind, defaultWho);
  }

  return (
    <div class="panel-content panel-script" ref={panelRoot}>
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
              SceneSelection.select({
                chapterSlug: ref.chapterSlug,
                sceneSlug: ref.sceneSlug,
                label: ref.label,
              });
            }
          }}
        >
          <option value="">— サンプル脚本 —</option>
          <For each={availableScenes()}>{(s) => <option value={s.path}>{s.label}</option>}</For>
        </select>
        <Show when={scene()}>
          <button
            type="button"
            class="panel-script-rename"
            onClick={() => void renameCurrentScene()}
            title="シーンの名前 / slug を変更"
          >
            ✎
          </button>
          <button
            type="button"
            class="panel-script-rename"
            onClick={undo}
            disabled={!canUndo()}
            title="Undo (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            type="button"
            class="panel-script-rename"
            onClick={redo}
            disabled={!canRedo()}
            title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
          >
            Redo
          </button>
        </Show>
        <Show when={saving()}>
          <span class="panel-script-saving">
            <Spinner /> 保存中…
          </span>
        </Show>
        <span class="panel-script-mode-toggle">
          <button
            type="button"
            classList={{ active: mode() === 'visual' }}
            onClick={() => setModeAndPersist('visual')}
            title="ブロックカード表示"
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

      {/* visual モード: 上部にシーンメタ */}
      <Show when={mode() === 'visual'}>
        <div class="panel-script-scene-meta">
          <Show when={parsed.title}>
            <span class="panel-script-scene-title">{parsed.title}</span>
          </Show>
          <Show when={parsed.cast.length > 0}>
            <span class="panel-script-scene-cast">
              キャスト:{' '}
              <For each={parsed.cast}>
                {(c) => <code class="panel-script-scene-cast-chip">{c}</code>}
              </For>
            </span>
          </Show>
        </div>
      </Show>

      {/* raw モード: snippet toolbar */}
      <Show when={mode() === 'raw'}>
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
        style={{ display: mode() === 'visual' ? 'flex' : 'none' }}
      >
        <div class="panel-script-content-main">
          <ScriptVisualEditor
            parsed={parsed}
            onChangeBlock={onChangeBlock}
            onDeleteBlock={onDeleteBlock}
            onMoveBlock={onMoveBlock}
            onAppendBlock={onAppendBlock}
            onInsertBlock={onInsertBlock}
          />
        </div>
        <ScriptContextRail
          parsed={parsed}
          chapterSlug={scene()?.chapterSlug}
          sceneSlug={scene()?.sceneSlug}
        />
      </div>

      {/* raw モード: CodeMirror */}
      <div
        class="panel-script-host"
        ref={host}
        style={{ display: mode() === 'raw' ? 'block' : 'none' }}
      />
    </div>
  );
};

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
