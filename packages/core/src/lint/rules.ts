import type { LintIssue, LintRule } from './types.js';
import type { NodeId } from '../domain/era.js';
import {
  CHARACTER_TEMPLATE,
  FACTION_TEMPLATE,
  LOCATION_TEMPLATE,
} from '../domain/templates/index.js';

// builtin lint rules (M7 で 5 件、PR-AB +1、PR-AO で +3)。各ルールは pure function、UI に依存しない。
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

/** ルール 7: missing-thumbnail (PR-AO) — キャラ / 場所 / 勢力 にサムネ画像が無い。
 * テンプレ別に「視覚的に表示されるノード」だけが対象 (Item は意図的に除外)。
 * info severity — 強制ではないが視覚化を促す。 */
const MISSING_THUMBNAIL: LintRule = {
  id: 'missing-thumbnail',
  description: 'キャラ / 場所 / 勢力 にサムネ画像が未登録 (Inspector / Graph で識別性が下がる)',
  defaultSeverity: 'info',
  check(ctx) {
    const issues: LintIssue[] = [];
    const targetTemplates: ReadonlySet<string> = new Set([
      CHARACTER_TEMPLATE.id,
      LOCATION_TEMPLATE.id,
      FACTION_TEMPLATE.id,
    ]);
    for (const node of ctx.nodes.values()) {
      if (!targetTemplates.has(node.templateId)) continue;
      if (node.thumbnail) continue;
      issues.push({
        ruleId: 'missing-thumbnail',
        severity: 'info',
        message: `Node "${node.slug}" にサムネ画像が未登録`,
        nodeId: node.id,
      });
    }
    return issues;
  },
};

/** ルール 8: empty-script (PR-AO) — シーンの script: 配列が空。
 * 章を立てたが中身を書き始めていないシーンを info で。
 * scenes が ctx に無ければ no-op。 */
const EMPTY_SCRIPT: LintRule = {
  id: 'empty-script',
  description: 'シーンの脚本ブロックが 0 件 (まだ書き始めていない)',
  defaultSeverity: 'info',
  check(ctx) {
    const scenes = ctx.scenes;
    if (!scenes) return [];
    const issues: LintIssue[] = [];
    for (const scene of scenes) {
      if (scene.blocks.length === 0) {
        issues.push({
          ruleId: 'empty-script',
          severity: 'info',
          message: `[${scene.label}] 脚本がまだ書かれていません (Script タブで追加可能)`,
        });
      }
    }
    return issues;
  },
};

/** ルール 9: script-unknown-who (PR-AO) — line / action の who: が
 * project 内のキャラに該当しない (slug でも dev_name でも見つからない)。
 * タイポや消したキャラの参照を検出。
 * scenes が ctx に無ければ no-op。 */
const SCRIPT_UNKNOWN_WHO: LintRule = {
  id: 'script-unknown-who',
  description: 'script の who: がプロジェクト内のキャラに該当しない',
  defaultSeverity: 'warning',
  check(ctx) {
    const scenes = ctx.scenes;
    if (!scenes) return [];
    // 有効識別子: slug + dev_name の和集合
    const validIds = new Set<string>();
    for (const node of ctx.nodes.values()) {
      if (node.templateId !== CHARACTER_TEMPLATE.id) continue;
      validIds.add(node.slug);
      const dev = node.fields['dev_name'];
      if (typeof dev === 'string' && dev !== '') validIds.add(dev);
    }
    const issues: LintIssue[] = [];
    // 同 scene 内で同 who: が複数ヒットしてもノイズなので 1 件に集約
    const seen = new Set<string>();
    for (const scene of scenes) {
      for (const block of scene.blocks) {
        if (block.kind !== 'line' && block.kind !== 'action') continue;
        if (!block.who) continue;
        if (validIds.has(block.who)) continue;
        const key = `${scene.sceneSlug}::${block.who}`;
        if (seen.has(key)) continue;
        seen.add(key);
        issues.push({
          ruleId: 'script-unknown-who',
          severity: 'warning',
          message: `[${scene.label}] who: "${block.who}" に該当するキャラがプロジェクト内にありません (typo か削除された参照)`,
        });
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
  MISSING_THUMBNAIL,
  EMPTY_SCRIPT,
  SCRIPT_UNKNOWN_WHO,
];
