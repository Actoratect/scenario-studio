import { createMemo, createResource, createSignal } from 'solid-js';
import {
  BUILTIN_LINT_RULES,
  LintEngine,
  parseSceneYaml,
  type LintIssue,
  type ScriptScene,
} from '@scenario-studio/core';
import { ProjectService } from './ProjectService';

// Lint Engine のインスタンスを singleton で持ち、
// 現在 project に対する LintIssue[] を Solid 派生 signal として公開する。
// Console Panel が `LintService.issues()` を購読してリアルタイム表示。
// PR-AB: 全 scene を非同期に load して script-aware rule (連続発話) も走らせる。
// 詳細: ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M7

const engine = new LintEngine(BUILTIN_LINT_RULES);

// Script ファイルが変わるたびに scene 配列を再 load するための tick
const [scriptVersion, setScriptVersion] = createSignal(0);

/** ScriptPanel.save が呼ばれたら ScriptLint を再評価 */
export function bumpScriptLintVersion(): void {
  setScriptVersion((v) => v + 1);
}

const sceneSource = createMemo(() => {
  const ctx = ProjectService.currentProject();
  return { ctx, version: scriptVersion() };
});

const [scenesResource] = createResource(sceneSource, async (src) => {
  if (!src.ctx) return [] as readonly ScriptScene[];
  const out: ScriptScene[] = [];
  for (const ch of src.ctx.project.scenario.chapters) {
    for (const sc of ch.scenes) {
      const path = `Scenarios/${ch.slug}/${sc.relativePath}`;
      try {
        if (!(await src.ctx.adapter.exists(src.ctx.handle, path))) continue;
        const text = await src.ctx.adapter.read(src.ctx.handle, path);
        const parsed = parseSceneYaml(text);
        out.push({
          chapterSlug: ch.slug,
          sceneSlug: sc.slug,
          label: `${ch.title} / ${sc.title}`,
          blocks: parsed.blocks,
        });
      } catch {
        // YAML 壊れ等は無視 (ScriptPanel 側で表示)
      }
    }
  }
  return out;
});

const issues = createMemo<readonly LintIssue[]>(() => {
  const ctx = ProjectService.currentProject();
  if (!ctx) return [];
  const scenes = scenesResource();
  return engine.run({
    nodes: ctx.project.nodes,
    templates: ctx.templates,
    scenes: scenes ?? [],
  });
});

export const LintService = {
  issues,
  registeredRuleIds: engine.registeredRuleIds,
  /** PR-AW: 他コンポーネントが scene blocks を読むための公開アクセサ (load 中は undefined)。 */
  scenes: (): readonly ScriptScene[] | undefined => scenesResource(),
};
