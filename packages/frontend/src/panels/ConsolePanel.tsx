import { For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import type { LintIssue, LintSeverity } from '@scenario-studio/core';
import { LintService } from '../services/LintService';
import { SelectionContext } from '../services/SelectionContext';

// Console — Lint / AI / 汎用通知の出力先 (M7)。
// MVP は LintService.issues() を表示。M7+ で AI ログ / Show prompt も併設。
// 詳細: ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M7

const SEVERITY_ICON: Record<LintSeverity, string> = {
  error: '⛔',
  warning: '⚠️',
  info: 'ℹ️',
};

export const ConsolePanel: Component<GroupPanelPartInitParameters> = (params) => {
  const issues = LintService.issues;
  const counts = () => {
    const c: Record<LintSeverity, number> = { error: 0, warning: 0, info: 0 };
    for (const i of issues()) c[i.severity]++;
    return c;
  };

  return (
    <div class="panel-content panel-console">
      <header class="panel-console-header">
        <span>
          Console · <code>{params.api.id}</code>
        </span>
        <span class="panel-console-stats">
          {SEVERITY_ICON.error} {counts().error}
          {'  '}
          {SEVERITY_ICON.warning} {counts().warning}
          {'  '}
          {SEVERITY_ICON.info} {counts().info}
        </span>
      </header>
      <div class="panel-console-list">
        <Show when={issues().length > 0} fallback={<p class="panel-console-empty">No issues.</p>}>
          <ul>
            <For each={issues()}>{(issue) => <IssueRow issue={issue} />}</For>
          </ul>
        </Show>
      </div>
    </div>
  );
};

const IssueRow: Component<{ issue: LintIssue }> = (props) => {
  function jump(): void {
    if (props.issue.nodeId) {
      SelectionContext.selectNode(props.issue.nodeId);
    }
  }
  return (
    <li
      class="panel-console-issue"
      classList={{ [`panel-console-issue--${props.issue.severity}`]: true }}
    >
      <button
        class="panel-console-issue-button"
        disabled={!props.issue.nodeId}
        onClick={jump}
        title={props.issue.nodeId ? 'クリックで Inspector にジャンプ' : ''}
      >
        <span class="panel-console-issue-icon">{SEVERITY_ICON[props.issue.severity]}</span>
        <span class="panel-console-issue-rule">[{props.issue.ruleId}]</span>
        <span class="panel-console-issue-msg">{props.issue.message}</span>
      </button>
    </li>
  );
};
