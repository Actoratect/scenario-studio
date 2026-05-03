import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import { CHARACTER_TEMPLATE } from '@scenario-studio/core';
import { createScriptEditor } from '../codemirror/createScriptEditor';
import { SAMPLE_SCRIPT } from '../codemirror/sampleScript';
import { ProjectService } from '../services/ProjectService';

// 脚本エディタ Panel (M6 本実装)。
// - シーン file (.scn.yaml) を chapter / scene 選択で load / save
// - 編集 → 500ms デバウンスで自動保存
// - inline widget は character / emotion / aside / sfx / bgm / choice (M6 で拡張)
// - autocomplete: who: / emotion: / kind: 候補
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §5,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M6

const KNOWN_EMOTIONS: readonly string[] = [
  'happy',
  'sad',
  'angry',
  'tired',
  'suspicious',
  'surprised',
  'embarrassed',
  'calm',
];

interface SceneRef {
  chapterSlug: string;
  sceneSlug: string;
  /** Scenarios/<chapter>/<scene>.scn.yaml */
  path: string;
  /** UI label (chapter title / scene title) */
  label: string;
}

export const ScriptPanel: Component<GroupPanelPartInitParameters> = (params) => {
  const [scene, setScene] = createSignal<SceneRef | undefined>(undefined);
  const [doc, setDoc] = createSignal<string>(SAMPLE_SCRIPT);
  const [saving, setSaving] = createSignal(false);
  let host: HTMLDivElement | undefined;
  let view: ReturnType<typeof createScriptEditor> | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

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

  function scheduleSave(text: string): void {
    setDoc(text);
    if (saveTimer) clearTimeout(saveTimer);
    const target = scene();
    if (!target) return;
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      void saveNow(target, text);
    }, 500);
  }

  async function saveNow(ref: SceneRef, text: string): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    setSaving(true);
    try {
      await ctx.adapter.write(ctx.handle, ref.path, text);
    } catch (e) {
      console.error('script save failed', e);
    } finally {
      setSaving(false);
    }
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
  });

  onCleanup(() => {
    if (saveTimer) clearTimeout(saveTimer);
    const ref = scene();
    const text = doc();
    if (ref) void saveNow(ref, text); // last flush
    view?.destroy();
  });

  return (
    <div class="panel-content panel-script">
      <div class="panel-script-meta">
        <span>Scene:</span>
        <select
          class="panel-script-scene-select"
          value={scene()?.path ?? ''}
          onChange={(e) => {
            const path = e.currentTarget.value;
            const ref = availableScenes().find((s) => s.path === path);
            if (ref) void loadScene(ref);
          }}
        >
          <option value="">— サンプル脚本 (PoC-D)</option>
          <For each={availableScenes()}>{(s) => <option value={s.path}>{s.label}</option>}</For>
        </select>
        <Show when={saving()}>
          <span class="panel-script-saving"> saving…</span>
        </Show>
        <span class="panel-script-panel-id">
          · <code>{params.api.id}</code>
        </span>
      </div>
      <div class="panel-script-host" ref={host} />
    </div>
  );
};

function starterSceneYaml(slug: string): string {
  return `schemaVersion: 1
sceneId: scene.${slug}
plot:
  title: ${slug}
  pov: character.tarou
  cast: []

script:
  - { kind: stage, text: "ここに状況を…" }
`;
}
