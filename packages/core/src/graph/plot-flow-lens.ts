import type { Chapter } from '../domain/scenario.js';
import { nodeId, type NodeId } from '../domain/era.js';
import type { ScriptScene } from '../lint/types.js';
import type { LensEdge, LensNode, LensPayload } from './relationship-lens.js';

// PR-AV: Plot Flow Lens (UX-3)。
// 章 / シーンをノードに、暗黙の next と choice / goto をエッジにした
// scene transition graph を計算する。
//
// 既存の RelationshipLens と同じ LensPayload 形式を返すので、LensCanvas
// にそのまま流せる。templateId は仮想 'plot.scene' を割り当てる
// (NodeThumbnail / colorForTemplate は default grey になる)。
//
// 詳細: ../../../../Documentation/ScenarioEditor/22_ux_feature_review.md §C

const SCENE_TEMPLATE_ID = 'plot.scene';

export interface PlotFlowOptions {
  chapters: readonly Chapter[];
  /** PR-AB と同じ ScriptScene 配列。前 LintService が load 済の想定。 */
  scenes: readonly ScriptScene[];
}

export interface PlotFlowAnalysis {
  payload: LensPayload;
  /** 到達不能シーン (chapter 0 の先頭以外で、in-edge が無いもの)。 */
  unreachable: readonly NodeId[];
  /** 終端なし分岐 (choice option の then が解決できない)。 */
  unresolvedTransitions: readonly { fromSceneId: string; targetText: string }[];
}

function makeNodeId(chapterSlug: string, sceneSlug: string): NodeId {
  return nodeId(`plot.${chapterSlug}.${sceneSlug}`);
}

/**
 * choice の then 値を「scene 識別子」として解釈する。
 * 受理する形式:
 *   - "scene.<sceneSlug>"  (sceneId 規約)
 *   - "<chapterSlug>/<sceneSlug>"
 *   - "<sceneSlug>" (project 内に slug が一意なら)
 */
function resolveTransition(
  raw: string,
  scenes: readonly ScriptScene[],
): { chapterSlug: string; sceneSlug: string } | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  // "scene.<slug>" → drop prefix
  const sceneIdMatch = /^scene\.(.+)$/.exec(trimmed);
  if (sceneIdMatch && sceneIdMatch[1]) {
    const slug = sceneIdMatch[1];
    const found = scenes.find((s) => s.sceneSlug === slug);
    if (found) return { chapterSlug: found.chapterSlug, sceneSlug: found.sceneSlug };
  }
  // "<chapter>/<scene>"
  const slashIdx = trimmed.indexOf('/');
  if (slashIdx > 0) {
    const chapterSlug = trimmed.slice(0, slashIdx);
    const sceneSlug = trimmed.slice(slashIdx + 1);
    const found = scenes.find((s) => s.chapterSlug === chapterSlug && s.sceneSlug === sceneSlug);
    if (found) return { chapterSlug, sceneSlug };
  }
  // bare slug — 一意なら
  const matches = scenes.filter((s) => s.sceneSlug === trimmed);
  if (matches.length === 1) {
    const m = matches[0]!;
    return { chapterSlug: m.chapterSlug, sceneSlug: m.sceneSlug };
  }
  return undefined;
}

export function computePlotFlowLens(options: PlotFlowOptions): PlotFlowAnalysis {
  const sceneByKey = new Map<string, ScriptScene>();
  for (const s of options.scenes) sceneByKey.set(`${s.chapterSlug}::${s.sceneSlug}`, s);

  const nodes: LensNode[] = [];
  const edges: LensEdge[] = [];
  const unresolvedTransitions: { fromSceneId: string; targetText: string }[] = [];

  // chapters の宣言順 = scene の暗黙 next 順
  for (const ch of options.chapters) {
    for (let i = 0; i < ch.scenes.length; i++) {
      const sc = ch.scenes[i]!;
      const id = makeNodeId(ch.slug, sc.slug);
      nodes.push({
        id,
        templateId: SCENE_TEMPLATE_ID,
        label: sc.title,
      });
      // 暗黙 next: 同章内の次 scene
      const next = ch.scenes[i + 1];
      if (next) {
        const nextId = makeNodeId(ch.slug, next.slug);
        edges.push({
          id: `flow:${ch.slug}:${sc.slug}->${next.slug}`,
          source: id,
          target: nextId,
          label: '次へ',
          kind: 'implicit',
        });
      }
    }
  }

  // choice の then を解析して edge 追加
  for (const scene of options.scenes) {
    const fromId = makeNodeId(scene.chapterSlug, scene.sceneSlug);
    for (const block of scene.blocks) {
      if (block.kind !== 'choice' || !block.options) continue;
      for (const opt of block.options) {
        if (!opt.then) continue;
        const target = resolveTransition(opt.then, options.scenes);
        if (!target) {
          unresolvedTransitions.push({
            fromSceneId: `${scene.chapterSlug}/${scene.sceneSlug}`,
            targetText: opt.then,
          });
          continue;
        }
        const targetId = makeNodeId(target.chapterSlug, target.sceneSlug);
        edges.push({
          id: `choice:${scene.chapterSlug}:${scene.sceneSlug}->${target.sceneSlug}:${opt.text}`,
          source: fromId,
          target: targetId,
          label: opt.text,
          kind: 'explicit',
        });
      }
    }
  }

  // 到達不能 = 章 0 / scene 0 以外で、入次数が 0 のシーン
  const inDegree = new Map<NodeId, number>();
  for (const e of edges) inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  const unreachable: NodeId[] = [];
  let isFirst = true;
  for (const ch of options.chapters) {
    for (let i = 0; i < ch.scenes.length; i++) {
      const sc = ch.scenes[i]!;
      const id = makeNodeId(ch.slug, sc.slug);
      if (isFirst) {
        isFirst = false;
        continue;
      }
      if ((inDegree.get(id) ?? 0) === 0) {
        unreachable.push(id);
      }
    }
  }

  return {
    payload: { nodes, edges },
    unreachable,
    unresolvedTransitions,
  };
}
