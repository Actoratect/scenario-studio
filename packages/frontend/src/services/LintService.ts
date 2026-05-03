import { createMemo } from 'solid-js';
import { BUILTIN_LINT_RULES, LintEngine, type LintIssue } from '@scenario-studio/core';
import { ProjectService } from './ProjectService';

// Lint Engine のインスタンスを singleton で持ち、
// 現在 project に対する LintIssue[] を Solid 派生 signal として公開する。
// Console Panel が `LintService.issues()` を購読してリアルタイム表示。
// 詳細: ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M7

const engine = new LintEngine(BUILTIN_LINT_RULES);

const issues = createMemo<readonly LintIssue[]>(() => {
  const ctx = ProjectService.currentProject();
  if (!ctx) return [];
  return engine.run({ nodes: ctx.project.nodes, templates: ctx.templates });
});

export const LintService = {
  issues,
  registeredRuleIds: engine.registeredRuleIds,
};
