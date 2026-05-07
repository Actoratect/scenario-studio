import type { ScenarioNode } from '@scenario-studio/core';
import { ProjectService } from './ProjectService';
import { SceneSelection } from './SceneSelection';
import { SelectionContext } from './SelectionContext';

// PR-AU: Local Agent Handoff (UX-8)。
// 選択中ノード / シーンの context package (Markdown) を作って、
// Codex / Claude Code / Cursor / Aider などのローカル AI に渡す。
//
// Browser 環境では CLI spawn できないため、Phase 1 では:
//   - prompt をクリップボードコピー
//   - prompt を `.editor/ai-context/<timestamp>.md` に保存
//   - ChatGPT / Claude.ai / Gemini のウェブ UI を deep link で開く (短い場合)
//
// 詳細: ../../../../Documentation/ScenarioEditor/22_ux_feature_review.md §E2

export type HandoffScope =
  | { kind: 'node'; nodeId: string }
  | { kind: 'scene'; chapterSlug: string; sceneSlug: string }
  | { kind: 'project' };

export interface HandoffPackage {
  scope: HandoffScope;
  /** scope の人間向けラベル (例: "Cloud (キャラ)", "ch01 / s01_train_arrival") */
  scopeLabel: string;
  /** AI に渡す Markdown prompt 全体 */
  promptMarkdown: string;
  /** 関連ファイル一覧 (相対パス)。AI 側に「この辺を見て」と伝える用。 */
  relatedFiles: readonly string[];
}

const TASK_TEMPLATE = `## タスク
ここに具体的な依頼を書いてください。例:
- このキャラクターの背景を 3 段落で書き直す
- このシーンの太郎の口調を整え、緊張感を上げる
- 用語集の表記揺れを正式表記に統一する

ローカル AI (codex / claude code / cursor / aider 等) はこのリポジトリ
ファイルを直接編集できます。完了後 \`git diff\` で結果を確認してください。
`;

function nodeLabel(node: ScenarioNode): string {
  const display = node.fields['display_name'];
  if (typeof display === 'string' && display !== '') return `${display} (${node.slug})`;
  return node.slug;
}

function templateLabel(node: ScenarioNode): string {
  return node.templateId.replace(/^template\./, '');
}

export const LocalAgentHandoff = {
  /** 現在の SelectionContext / SceneSelection から最適な scope を推定。 */
  inferCurrentScope(): HandoffScope {
    const sel = SelectionContext.selectedNodeId();
    if (sel) return { kind: 'node', nodeId: sel };
    const scene = SceneSelection.selected();
    if (scene) return { kind: 'scene', chapterSlug: scene.chapterSlug, sceneSlug: scene.sceneSlug };
    return { kind: 'project' };
  },

  build(scope: HandoffScope): HandoffPackage | undefined {
    const ctx = ProjectService.currentProject();
    if (!ctx) return undefined;
    const projectName = ctx.project.settings.name;
    const lines: string[] = [];
    const related: string[] = [];

    lines.push(`# Local Agent Handoff — ${projectName}`);
    lines.push('');
    lines.push(
      'このプロンプトは Scenario Studio から、ローカル コーディング AI への引き継ぎ用に生成されました。',
    );
    lines.push(
      '生成された Markdown を Codex / Claude Code / Cursor / Aider などに貼り付けてください。',
    );
    lines.push('');
    lines.push('---');
    lines.push('');

    let scopeLabel = 'プロジェクト全体';
    if (scope.kind === 'node') {
      const node = ctx.project.nodes.get(scope.nodeId as never);
      if (!node) return undefined;
      scopeLabel = `${nodeLabel(node)} — ${templateLabel(node)}`;
      const directory = ctx.templates.tryGet(node.templateId as never)?.directory ?? 'unknown';
      const path = `Nodes/${directory}/${node.slug}.yaml`;
      related.push(path);
      lines.push(`## 対象ノード`);
      lines.push(`- 種別: ${templateLabel(node)}`);
      lines.push(`- slug: \`${node.slug}\``);
      lines.push(`- 表示名: ${nodeLabel(node)}`);
      lines.push(`- ファイル: \`${path}\``);
      lines.push('');
      lines.push('### 現在の fields');
      lines.push('```yaml');
      for (const [k, v] of Object.entries(node.fields)) {
        lines.push(`${k}: ${JSON.stringify(v)}`);
      }
      lines.push('```');
      lines.push('');
      // variants
      if (node.variants && node.variants.length > 0) {
        lines.push('### Era variants');
        for (const v of node.variants) {
          lines.push(
            `- ${v.eraId} ${v.fieldsOverride ? `(${Object.keys(v.fieldsOverride).length} field override)` : ''}`,
          );
        }
        lines.push('');
      }
    } else if (scope.kind === 'scene') {
      scopeLabel = `${scope.chapterSlug} / ${scope.sceneSlug}`;
      const path = `Scenarios/${scope.chapterSlug}/${scope.sceneSlug}.scn.yaml`;
      related.push(path);
      lines.push('## 対象シーン');
      lines.push(`- 章: \`${scope.chapterSlug}\``);
      lines.push(`- シーン: \`${scope.sceneSlug}\``);
      lines.push(`- ファイル: \`${path}\``);
      lines.push('');
      lines.push('AI 側でファイルを直接読み書きできます。脚本本体は YAML の `script:` 配列。');
      lines.push('');
    } else {
      lines.push('## スコープ');
      lines.push('- プロジェクト全体');
      lines.push('');
    }

    // glossary 抜粋
    if (ctx.project.glossary.length > 0) {
      lines.push('## 用語集 (抜粋 — 表記揺れに注意)');
      for (const t of ctx.project.glossary.slice(0, 30)) {
        const aliases = t.aliases.length > 0 ? ` (alias: ${t.aliases.join(', ')})` : '';
        const forbidden = t.forbidden.length > 0 ? ` ❌${t.forbidden.join(', ')}` : '';
        lines.push(`- **${t.term}**${aliases}${forbidden}`);
      }
      lines.push('');
      related.push('Glossary/terms.yaml');
    }

    // 関連 character の参考一覧 (scope=scene 時)
    if (scope.kind === 'scene') {
      const chars: { slug: string; display: string }[] = [];
      for (const node of ctx.project.nodes.values()) {
        if (node.templateId !== 'template.character') continue;
        const display =
          typeof node.fields['display_name'] === 'string' && node.fields['display_name'] !== ''
            ? (node.fields['display_name'] as string)
            : node.slug;
        chars.push({ slug: node.slug, display });
      }
      if (chars.length > 0) {
        lines.push('## プロジェクト内のキャラ (参考)');
        for (const c of chars.slice(0, 30)) {
          lines.push(`- ${c.display} (\`${c.slug}\`)`);
        }
        lines.push('');
      }
    }

    // タスク雛形
    lines.push('---');
    lines.push('');
    lines.push(TASK_TEMPLATE);
    lines.push('');
    lines.push('---');
    lines.push('## 出力形式');
    lines.push('- ファイル変更は通常通りリポジトリに直接編集して保存してください。');
    lines.push('- 完了後、`git diff` の変更概要を 3〜5 行で報告してください。');
    lines.push('- スキーマ違反 (YAML 文法 / 必須 field 欠落) を起こさないよう注意。');
    lines.push('- Glossary の禁止表記 (❌ 印) は使わない。');

    return {
      scope,
      scopeLabel,
      promptMarkdown: lines.join('\n'),
      relatedFiles: related,
    };
  },

  /**
   * `.editor/ai-context/<timestamp>.md` に保存。Tauri / Browser 両対応 (writeBytes)。
   * Browser FS Access の場合はユーザの選んだプロジェクトフォルダ内に作る。
   */
  async saveToProject(pkg: HandoffPackage): Promise<string | undefined> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return undefined;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = '.editor/ai-context';
    const path = `${dir}/${ts}.md`;
    await ctx.adapter.write(ctx.handle, path, pkg.promptMarkdown);
    return path;
  },
};
