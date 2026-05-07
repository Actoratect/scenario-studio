import { createMemo } from 'solid-js';
import { CHARACTER_TEMPLATE, type LintIssue, type LintSeverity } from '@scenario-studio/core';
import { LintService } from './LintService';
import { ProjectService } from './ProjectService';

// PR-AT: Project Health の集約。
// LintService の issues + ProjectModel から「次に直すべき項目」を計算する。
//
// 詳細: ../../../../Documentation/ScenarioEditor/22_ux_feature_review.md §A

export interface HealthCounts {
  error: number;
  warning: number;
  info: number;
}

export type HealthIssueKind =
  | { kind: 'lint'; issue: LintIssue }
  | {
      kind: 'missing-thumbnail';
      nodeId: string;
      slug: string;
      display: string;
      templateLabel: string;
    }
  | {
      kind: 'scene-empty-cast';
      chapterSlug: string;
      sceneSlug: string;
      label: string;
    }
  | {
      kind: 'unset-display-name';
      nodeId: string;
      slug: string;
      templateLabel: string;
    };

export interface ChapterProgress {
  slug: string;
  title: string;
  totalScenes: number;
  emptyScenes: number; // script blocks 0 件のもの (近似 — Scene cache が無い場合 0 と仮定)
}

export interface HealthSnapshot {
  counts: HealthCounts;
  /** Lint top issues (severity 順 → ruleId 順)。 */
  topIssues: readonly LintIssue[];
  /** 「直すべき項目」のキュレート版。 */
  curatedIssues: readonly HealthIssueKind[];
  chapterProgress: readonly ChapterProgress[];
  /** AI が unlock されているか / 設定済みか。 */
  aiStatus: 'unlocked' | 'locked' | 'no-key' | 'no-project';
}

const SEVERITY_RANK: Record<LintSeverity, number> = { error: 0, warning: 1, info: 2 };

const snapshot = createMemo<HealthSnapshot>(() => compute());

export const ProjectHealth = {
  /** 主スナップショット (Solid signal)。Lint + project 反応で再計算。 */
  snapshot,
};

function compute(): HealthSnapshot {
  const ctx = ProjectService.currentProject();
  if (!ctx) {
    return {
      counts: { error: 0, warning: 0, info: 0 },
      topIssues: [],
      curatedIssues: [],
      chapterProgress: [],
      aiStatus: 'no-project',
    };
  }
  const issues = LintService.issues();
  const counts: HealthCounts = { error: 0, warning: 0, info: 0 };
  for (const i of issues) counts[i.severity]++;

  // top issues — severity 順、同 severity 内は ruleId アルファベット順、上限 12
  const topIssues = [...issues]
    .sort((a, b) => {
      const r = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (r !== 0) return r;
      return a.ruleId.localeCompare(b.ruleId);
    })
    .slice(0, 12);

  // curated: missing-thumbnail / scene-empty-cast / unset-display-name
  const curated: HealthIssueKind[] = [];
  for (const node of ctx.project.nodes.values()) {
    const tmpl = ctx.templates.tryGet(node.templateId as never);
    const tmplLabel = tmpl?.displayName ?? node.templateId;
    if (
      !node.thumbnail &&
      (node.templateId === CHARACTER_TEMPLATE.id ||
        node.templateId === 'template.location' ||
        node.templateId === 'template.faction')
    ) {
      curated.push({
        kind: 'missing-thumbnail',
        nodeId: node.id,
        slug: node.slug,
        display:
          typeof node.fields['display_name'] === 'string' && node.fields['display_name'] !== ''
            ? (node.fields['display_name'] as string)
            : node.slug,
        templateLabel: tmplLabel,
      });
    }
    const display = node.fields['display_name'];
    if (typeof display !== 'string' || display === '') {
      curated.push({
        kind: 'unset-display-name',
        nodeId: node.id,
        slug: node.slug,
        templateLabel: tmplLabel,
      });
    }
  }
  // 章ごとの scene 数 + 名前付け済み
  const chapterProgress: ChapterProgress[] = ctx.project.scenario.chapters.map((c) => ({
    slug: c.slug,
    title: c.title,
    totalScenes: c.scenes.length,
    emptyScenes: 0, // 近似 — Lint の empty-script は scene 単位で出ているのでそちら参照可
  }));
  // empty-script lint の発生数を chapter にカウント (message に scene slug を含む実装に基づく)
  for (const issue of issues) {
    if (issue.ruleId !== 'empty-script') continue;
    for (const cp of chapterProgress) {
      // scene が含まれるかは Lint の message に scene slug が入っている前提
      // FIX: 本来は LintIssue に sceneSlug を持たせるべき。Phase 2 で改修。
      for (const sc of ctx.project.scenario.chapters.find((c) => c.slug === cp.slug)?.scenes ??
        []) {
        if (issue.message.includes(sc.slug)) cp.emptyScenes++;
      }
    }
  }

  // AI status は overlay 側で AiService.status() を読んで表示する
  // (集約サービスから AiService を参照すると import 循環の懸念があるため)
  return {
    counts,
    topIssues,
    curatedIssues: curated.slice(0, 50),
    chapterProgress,
    aiStatus: 'locked',
  };
}
