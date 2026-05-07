import type { GlossaryTerm, ProjectModel, ScenarioNode } from '@scenario-studio/core';
import { AiPatchQueue } from './AiPatchQueue';

// PR-AY: Glossary 由来の用語表記修正を AiPatchQueue に積むスキャナ。
// LLM 不要 (= 課金なし)、決定論的、副作用は queue 投入のみ。
// 「forbidden に含まれる別表記が node の string field に出現する」
//   → 「正式 term への置換」の patch を生成。
// 注意: substring match は誤検知が出るので、
//   - 4 文字未満の forbidden は対象外 (e.g. "AI" / "PC" の暴発防止)
//   - 単語境界が曖昧な日本語向けに「前後が空白/句読点 or 文末」かを軽くチェック
//     しつつ、最終承認は人間 (queue) に委ねる。
// 詳細: ../../../../Documentation/ScenarioEditor/22_ux_feature_review.md UX-6

export interface ScanResult {
  proposedCount: number;
  scannedFields: number;
  scannedNodes: number;
}

const MIN_FORBIDDEN_LENGTH = 2;

export function scanGlossaryFixes(project: ProjectModel): ScanResult {
  let proposedCount = 0;
  let scannedFields = 0;
  let scannedNodes = 0;

  const replacements = buildReplacementTable(project.glossary);
  if (replacements.length === 0) {
    return { proposedCount: 0, scannedFields: 0, scannedNodes: 0 };
  }

  for (const node of project.nodes.values()) {
    scannedNodes += 1;
    const updates = scanNode(node, replacements);
    for (const u of updates) {
      scannedFields += 1;
      const enqueued = AiPatchQueue.enqueue({
        target: {
          kind: 'node-field',
          nodeId: node.id,
          fieldId: u.fieldId,
          nodeSlug: node.slug,
          nodeLabel: getNodeLabel(node),
        },
        before: u.before,
        after: u.after,
        summary: u.summary,
        source: 'glossary-fix',
        rationale: u.rationale,
      });
      if (enqueued) proposedCount += 1;
    }
  }

  return { proposedCount, scannedFields, scannedNodes };
}

interface Replacement {
  /** 禁止別表記 (検索する文字列)。 */
  forbidden: string;
  /** 正式 term に置換。 */
  canonical: string;
}

function buildReplacementTable(glossary: readonly GlossaryTerm[]): Replacement[] {
  const out: Replacement[] = [];
  for (const term of glossary) {
    for (const f of term.forbidden) {
      if (f.length < MIN_FORBIDDEN_LENGTH) continue;
      // 正式表記と同じものは無視
      if (f === term.term) continue;
      out.push({ forbidden: f, canonical: term.term });
    }
  }
  // 長い禁止語から先に当てる (短い語の部分一致で先に消えないように)
  out.sort((a, b) => b.forbidden.length - a.forbidden.length);
  return out;
}

interface FieldUpdate {
  fieldId: string;
  before: string;
  after: string;
  summary: string;
  rationale: string;
}

function scanNode(node: ScenarioNode, table: readonly Replacement[]): FieldUpdate[] {
  const updates: FieldUpdate[] = [];
  for (const [fieldId, value] of Object.entries(node.fields)) {
    if (typeof value !== 'string' || value === '') continue;
    let next = value;
    const hits: string[] = [];
    for (const r of table) {
      if (!next.includes(r.forbidden)) continue;
      // 重複置換を避けるため canonical が既に含まれている箇所は対象外にしたいが、
      // 文字列単位 includes だと境界判定が難しいため最終承認を人間に委ねる。
      next = next.split(r.forbidden).join(r.canonical);
      hits.push(`「${r.forbidden}」→「${r.canonical}」`);
    }
    if (next !== value) {
      updates.push({
        fieldId,
        before: value,
        after: next,
        summary: `${fieldId}: ${hits[0] ?? '用語修正'}${hits.length > 1 ? ` 他 ${hits.length - 1} 件` : ''}`,
        rationale: `Glossary forbidden → canonical: ${hits.join(', ')}`,
      });
    }
  }
  return updates;
}

function getNodeLabel(node: ScenarioNode): string {
  const display = node.fields['display_name'];
  if (typeof display === 'string' && display !== '') return display;
  return node.slug;
}
