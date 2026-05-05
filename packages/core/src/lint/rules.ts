import type { LintIssue, LintRule } from './types.js';
import type { NodeId } from '../domain/era.js';

// 5 builtin lint rules (M7)。各ルールは pure function、UI に依存しない。
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md,
//       ../../../../Documentation/ScenarioEditor/03_data-model.md,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M7

/** ルール 1: node_ref フィールドの参照先がプロジェクト内に存在する。 */
const RELATION_TARGET_EXISTS: LintRule = {
  id: 'relation-target-exists',
  description: 'node_ref フィールドの参照先がプロジェクト内に存在すること',
  defaultSeverity: 'error',
  check(ctx) {
    const issues: LintIssue[] = [];
    const ids = new Set(ctx.nodes.keys());
    for (const node of ctx.nodes.values()) {
      const tmpl = ctx.templates.tryGet(node.templateId as never);
      if (!tmpl) continue;
      for (const field of tmpl.fields) {
        if (field.type !== 'node_ref') continue;
        const v = node.fields[field.id];
        if (typeof v !== 'string' || v === '') continue;
        if (!ids.has(v as NodeId)) {
          issues.push({
            ruleId: 'relation-target-exists',
            severity: 'error',
            message: `Node "${node.slug}" の field "${field.id}" が存在しないノード ${JSON.stringify(v)} を参照`,
            nodeId: node.id,
            fieldId: field.id,
          });
        }
      }
    }
    return issues;
  },
};

/** ルール 2: orphan-node — どこからも参照されていないノードを info で。 */
const ORPHAN_NODE: LintRule = {
  id: 'orphan-node',
  description: 'どこからも node_ref されていないノード (削除候補) を検出',
  defaultSeverity: 'info',
  check(ctx) {
    const referenced = new Set<NodeId>();
    for (const node of ctx.nodes.values()) {
      const tmpl = ctx.templates.tryGet(node.templateId as never);
      if (!tmpl) continue;
      for (const field of tmpl.fields) {
        if (field.type !== 'node_ref') continue;
        const v = node.fields[field.id];
        if (typeof v === 'string' && v !== '') referenced.add(v as NodeId);
      }
    }
    const issues: LintIssue[] = [];
    for (const node of ctx.nodes.values()) {
      if (!referenced.has(node.id)) {
        issues.push({
          ruleId: 'orphan-node',
          severity: 'info',
          message: `Node "${node.slug}" はどのノードからも参照されていない (孤児)`,
          nodeId: node.id,
        });
      }
    }
    return issues;
  },
};

/** ルール 3: circular-relation — parent / child / member_of などで循環参照を検知。
 * MVP は templates/character の `faction` を例として、`leader` 経由で循環があれば warning。
 * Phase 3 で関係グラフ全体に対する SCC 検出に拡張。 */
const CIRCULAR_RELATION: LintRule = {
  id: 'circular-relation',
  description: 'node_ref の循環参照を検出 (MVP は同 field 名を辿る単純検査)',
  defaultSeverity: 'warning',
  check(ctx) {
    const issues: LintIssue[] = [];
    for (const startNode of ctx.nodes.values()) {
      const startTmpl = ctx.templates.tryGet(startNode.templateId as never);
      if (!startTmpl) continue;
      for (const field of startTmpl.fields) {
        if (field.type !== 'node_ref') continue;
        if (hasCycle(startNode.id, field.id, ctx.nodes)) {
          issues.push({
            ruleId: 'circular-relation',
            severity: 'warning',
            message: `Node "${startNode.slug}" を起点に field "${field.id}" の連鎖で循環を検出`,
            nodeId: startNode.id,
            fieldId: field.id,
          });
          break; // 同じ start からは 1 つで十分
        }
      }
    }
    return issues;
  },
};

function hasCycle(
  startId: NodeId,
  fieldId: string,
  nodes: ReadonlyMap<NodeId, import('../domain/node.js').ScenarioNode>,
): boolean {
  const seen = new Set<NodeId>();
  let cursor: NodeId | undefined = startId;
  while (cursor !== undefined) {
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    const node = nodes.get(cursor);
    if (!node) return false;
    const v = node.fields[fieldId];
    cursor = typeof v === 'string' && v !== '' ? (v as NodeId) : undefined;
    // 自分自身に戻ってきた瞬間に true (上の seen.has で検知)
  }
  return false;
}

/** ルール 4: required-field-missing — テンプレで required:true なフィールドが空。 */
const REQUIRED_FIELD_MISSING: LintRule = {
  id: 'required-field-missing',
  description: 'テンプレートで必須宣言された field が空',
  defaultSeverity: 'error',
  check(ctx) {
    const issues: LintIssue[] = [];
    for (const node of ctx.nodes.values()) {
      const tmpl = ctx.templates.tryGet(node.templateId as never);
      if (!tmpl) continue;
      for (const field of tmpl.fields) {
        if (!field.required) continue;
        const v = node.fields[field.id];
        if (v === undefined || v === null || v === '') {
          issues.push({
            ruleId: 'required-field-missing',
            severity: 'error',
            message: `Node "${node.slug}" の必須 field "${field.id}" が未入力`,
            nodeId: node.id,
            fieldId: field.id,
          });
        }
      }
    }
    return issues;
  },
};

/** ルール 5: duplicate-slug — テンプレ別ディレクトリ内で slug 重複。
 * (現在の NodeRepository は 1 ノード 1 ファイルなので OS 上は重複できないが、
 *  ファイル外で同 slug を持つノードを生成する API ミスを検知する念のための保険。) */
const DUPLICATE_SLUG: LintRule = {
  id: 'duplicate-slug',
  description: '同テンプレ内で slug が重複',
  defaultSeverity: 'error',
  check(ctx) {
    const seen = new Map<string, NodeId>(); // key: `${templateId}\0${slug}`
    const issues: LintIssue[] = [];
    for (const node of ctx.nodes.values()) {
      const key = `${node.templateId}\0${node.slug}`;
      const existing = seen.get(key);
      if (existing) {
        issues.push({
          ruleId: 'duplicate-slug',
          severity: 'error',
          message: `Slug "${node.slug}" がテンプレ "${node.templateId}" 内で重複 (id: ${node.id} / 既存: ${existing})`,
          nodeId: node.id,
        });
      } else {
        seen.set(key, node.id);
      }
    }
    return issues;
  },
};

/** ルール 6: consecutive-same-speaker — 同一キャラの line が 2 つ連続。
 * 1 セリフが長すぎ / 不要に分割されているサインで、人間に「束ねる or stage を挟む」を促す。
 * `aside` `stage` `action` `sfx` `bgm` `choice` を挟むと連続と見做さない。
 * scenes 配列が ctx に無ければ no-op。 */
const CONSECUTIVE_SAME_SPEAKER: LintRule = {
  id: 'consecutive-same-speaker',
  description: '同一キャラの dialogue が連続している (分割しすぎ / 束ねた方が読みやすい目安)',
  defaultSeverity: 'info',
  check(ctx) {
    const scenes = ctx.scenes;
    if (!scenes || scenes.length === 0) return [];
    const issues: LintIssue[] = [];
    for (const scene of scenes) {
      let prevWho: string | undefined;
      let runStartIdx = -1;
      let runCount = 0;
      for (let i = 0; i < scene.blocks.length; i++) {
        const b = scene.blocks[i]!;
        if (b.kind === 'line') {
          if (b.who && b.who === prevWho) {
            runCount++;
            if (runCount === 2) {
              issues.push({
                ruleId: 'consecutive-same-speaker',
                severity: 'info',
                message: `[${scene.label}] 同一キャラ "${b.who}" のセリフが連続 (block #${runStartIdx + 1}〜${i + 1})。stage/aside で挟むか、1 行に束ねることを検討`,
              });
            }
          } else {
            prevWho = b.who;
            runStartIdx = i;
            runCount = 1;
          }
        } else {
          // line 以外は run を打ち切る (stage / aside で区切れば連続扱いしない)
          prevWho = undefined;
          runStartIdx = -1;
          runCount = 0;
        }
      }
    }
    return issues;
  },
};

export const BUILTIN_LINT_RULES: readonly LintRule[] = [
  RELATION_TARGET_EXISTS,
  ORPHAN_NODE,
  CIRCULAR_RELATION,
  REQUIRED_FIELD_MISSING,
  DUPLICATE_SLUG,
  CONSECUTIVE_SAME_SPEAKER,
];
