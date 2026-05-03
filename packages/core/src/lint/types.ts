// Lint 抽象 (M7)。
// 実 rule は ./rules/ 以下、5 builtin を `BUILTIN_LINT_RULES` で登録する。
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md (orphan / 整合性),
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M7

import type { NodeId } from '../domain/era.js';
import type { ScenarioNode } from '../domain/node.js';
import type { TemplateRegistry } from '../domain/templates/index.js';

export type LintSeverity = 'error' | 'warning' | 'info';

export interface LintIssue {
  ruleId: string;
  severity: LintSeverity;
  message: string;
  /** 関連ノードがあれば。Inspector でジャンプするため。 */
  nodeId?: NodeId | undefined;
  /** 該当 field id (ノード内の) があれば。 */
  fieldId?: string | undefined;
}

export interface LintContext {
  nodes: ReadonlyMap<NodeId, ScenarioNode>;
  templates: TemplateRegistry;
}

export interface LintRule {
  id: string;
  description: string;
  defaultSeverity: LintSeverity;
  check(ctx: LintContext): readonly LintIssue[];
}

export class LintEngine {
  constructor(private readonly rules: readonly LintRule[]) {}

  run(ctx: LintContext): readonly LintIssue[] {
    const out: LintIssue[] = [];
    for (const rule of this.rules) {
      try {
        for (const issue of rule.check(ctx)) {
          out.push(issue);
        }
      } catch (e) {
        out.push({
          ruleId: rule.id,
          severity: 'error',
          message: `Rule "${rule.id}" threw: ${(e as Error).message}`,
        });
      }
    }
    return out;
  }

  get registeredRuleIds(): readonly string[] {
    return this.rules.map((r) => r.id);
  }
}
