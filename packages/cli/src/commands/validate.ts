import * as nodePath from 'node:path';
import { NodeFileSystemAdapter } from '@scenario-studio/adapter-node';
import { BUILTIN_LINT_RULES, LintEngine, loadProject } from '@scenario-studio/core';
import type { LintIssue } from '@scenario-studio/core';

// `scenario validate <project-path>` — 5 builtin lint rules を CLI で実行。
// exit code: error あり=1, warning/info のみ=0。
// 詳細: ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M8

export interface ValidateOptions {
  projectPath: string;
  /** 出力フォーマット。`json` は CI で食いやすい形に。 */
  format?: 'text' | 'json';
}

export interface ValidateResult {
  exitCode: 0 | 1;
  output: string;
  issues: readonly LintIssue[];
}

export async function validate(options: ValidateOptions): Promise<ValidateResult> {
  const abs = nodePath.resolve(options.projectPath);
  const adapter = new NodeFileSystemAdapter();
  const handle = adapter.register(abs, nodePath.basename(abs));
  const loaded = await loadProject(adapter, handle);
  const engine = new LintEngine(BUILTIN_LINT_RULES);
  const issues = engine.run({ nodes: loaded.project.nodes, templates: loaded.templates });
  const exitCode = issues.some((i) => i.severity === 'error') ? 1 : 0;
  const output = options.format === 'json' ? renderJson(issues) : renderText(issues, abs);
  return { exitCode, output, issues };
}

function renderText(issues: readonly LintIssue[], projectPath: string): string {
  const lines = [`Validating project: ${projectPath}`];
  if (issues.length === 0) {
    lines.push('✓ No issues found.');
    return lines.join('\n');
  }
  const counts = { error: 0, warning: 0, info: 0 };
  for (const i of issues) counts[i.severity]++;
  lines.push(
    `Found ${issues.length} issue(s): ${counts.error} error / ${counts.warning} warning / ${counts.info} info`,
  );
  lines.push('');
  for (const i of issues) {
    const tag = i.severity.toUpperCase().padEnd(7);
    const ref = i.nodeId ? ` [${i.nodeId}${i.fieldId ? `.${i.fieldId}` : ''}]` : '';
    lines.push(`${tag} ${i.ruleId}${ref}: ${i.message}`);
  }
  return lines.join('\n');
}

function renderJson(issues: readonly LintIssue[]): string {
  return JSON.stringify({ issues }, null, 2);
}
