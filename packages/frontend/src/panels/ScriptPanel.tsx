import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
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

export const ScriptPanel: Component<GroupPanelPartInitParameters> = (params) => {
  const [scene, setScene] = createSignal<SceneRef | undefined>(undefined);
  const [doc, setDoc] = createSignal<string>(SAMPLE_SCRIPT);
  const [saving, setSaving] = createSignal(false);
  const [mode, setMode] = createSignal<EditorMode>(loadModePref());
  let host: HTMLDivElement | undefined;
  let view: ReturnType<typeof createScriptEditor> | undefined;

  function setModeAndPersist(m: EditorMode): void {
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

  // doc を parse した結果 (visual mode で使う)。parse 失敗時は最小 ParsedScene を返す。
  const parsed = createMemo<ParsedScene>(() => {
    try {
      return parseSceneYaml(doc());
    } catch {
      return { meta: {}, title: '', cast: [], blocks: [] };
    }
  });

  async function loadScene(ref: SceneRef): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const exists = await ctx.adapter.exists(ctx.handle, ref.path);
    const text = exists
      ? await ctx.adapter.read(ctx.handle, ref.path)
      : starterSceneYaml(ref.sceneSlug);
    setScene(ref);
    setDoc(text);
    if (view) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      });
    }
  }

  /** PR (ux-overhaul): 自動保存廃止。dirty マークだけ立てて、保存は明示 (Cmd+S / 保存ボタン)。 */
  function scheduleSave(text: string): void {
    setDoc(text);
    const target = scene();
    if (!target) return;
    DirtyTracker.mark({
      key: target.path,
      label: target.label,
      saveFn: () => saveNow(target, doc()),
    });
  }

  async function saveNow(ref: SceneRef, text: string): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    setSaving(true);
    try {
      await ctx.adapter.write(ctx.handle, ref.path, text);
      DirtyTracker.clear(ref.path);
      // 連続発話 lint を再評価
      bumpScriptLintVersion();
    } catch (e) {
      console.error('script save failed', e);
      Toast.error(`脚本の保存に失敗: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    } finally {
      setSaving(false);
    }
  }

  /** Visual mode の編集 → ParsedScene を再 serialize → doc を更新 + save。 */
  function commitParsed(next: ParsedScene): void {
    const yaml = serializeSceneYaml(next);
    scheduleSave(yaml);
    // CodeMirror に反映 (raw mode に切り替えた時のため)
    if (view && view.state.doc.toString() !== yaml) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: yaml },
      });
    }
  }

  function onChangeBlock(idx: number, next: ScriptBlock): void {
    const cur = parsed();
    const blocks = cur.blocks.map((b, i) => (i === idx ? next : b));
    commitParsed({ ...cur, blocks });
  }
  function onDeleteBlock(idx: number): void {
    const cur = parsed();
    const blocks = cur.blocks.filter((_, i) => i !== idx);
    commitParsed({ ...cur, blocks });
  }
  function onMoveBlock(idx: number, delta: -1 | 1): void {
    const cur = parsed();
    const blocks = [...cur.blocks];
    const target = idx + delta;
    if (target < 0 || target >= blocks.length) return;
    [blocks[idx]!, blocks[target]!] = [blocks[target]!, blocks[idx]!];
    commitParsed({ ...cur, blocks });
  }
  function onAppendBlock(kind: ScriptBlock['kind']): void {
    const cur = parsed();
    const defaultWho = characterSlugs()[0] ?? '';
    const blocks = [...cur.blocks, defaultBlock(kind, defaultWho)];
    commitParsed({ ...cur, blocks });
  }
  function onInsertBlock(index: number, kind: ScriptBlock['kind']): void {
    const cur = parsed();
    const defaultWho = characterSlugs()[0] ?? '';
    const blocks = [...cur.blocks];
    const clamped = Math.max(0, Math.min(index, blocks.length));
    blocks.splice(clamped, 0, defaultBlock(kind, defaultWho));
    commitParsed({ ...cur, blocks });
  }

  onMount(() => {
    if (!host) return;
    view = createScriptEditor({
      parent: host,
      initialDoc: doc(),
      sources: {
        characterSlugs: () => characterSlugs(),
        emotionTags: () => KNOWN_EMOTIONS,
      },
      onChange: (text) => scheduleSave(text),
    });
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
    // PR (ux-overhaul): 自動保存廃止。close 時の dirty は DirtyTracker に残し、
    // 「閉じる時にユーザに保存を促す」のはヘッダ側の責務に集約。
    view?.destroy();
  });

  function onInsert(kind: SnippetKind): void {
    if (!view) return;
    const defaultWho = characterSlugs()[0] ?? 'cloud';
    insertSnippet(view, kind, defaultWho);
  }

  return (
    <div class="panel-content panel-script">
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
          <Show when={parsed().title}>
            <span class="panel-script-scene-title">{parsed().title}</span>
          </Show>
          <Show when={parsed().cast.length > 0}>
            <span class="panel-script-scene-cast">
              キャスト:{' '}
              <For each={parsed().cast}>
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
            parsed={parsed()}
            onChangeBlock={onChangeBlock}
            onDeleteBlock={onDeleteBlock}
            onMoveBlock={onMoveBlock}
            onAppendBlock={onAppendBlock}
            onInsertBlock={onInsertBlock}
          />
        </div>
        <ScriptContextRail
          parsed={parsed()}
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
