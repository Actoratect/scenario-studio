import { createMemo } from 'solid-js';
import { CHARACTER_TEMPLATE } from '@scenario-studio/core';
import { LintService } from './LintService';
import { ProjectService } from './ProjectService';

// PR-AW: Unity Readiness。
// Phase 2 の Unity 連携の前に「ゲーム実装へ流す準備状況」を一覧化する。
// Browser standalone でも動く Unity Export Dry-run の役割。
//
// 詳細: ../../../../Documentation/ScenarioEditor/22_ux_feature_review.md §F

export interface ReadinessIssue {
  severity: 'error' | 'warning' | 'info';
  category: 'thumbnail' | 'audio' | 'flow' | 'localization' | 'metadata';
  title: string;
  detail: string;
  /** ジャンプ用の hint (実装は overlay 側)。 */
  jump?:
    | { kind: 'node'; nodeId: string }
    | { kind: 'scene'; chapterSlug: string; sceneSlug: string }
    | undefined;
}

export interface ReadinessSummary {
  totalScenes: number;
  totalNodes: number;
  totalCharacters: number;
  totalLines: number;
  totalSfxCues: number;
  totalBgmCues: number;
  /** scene の unreachable 件数 (PlotFlowAnalysis 結果)。 */
  unreachableScenes: number;
}

export interface ReadinessReport {
  summary: ReadinessSummary;
  issues: readonly ReadinessIssue[];
}

const EMPTY: ReadinessReport = {
  summary: {
    totalScenes: 0,
    totalNodes: 0,
    totalCharacters: 0,
    totalLines: 0,
    totalSfxCues: 0,
    totalBgmCues: 0,
    unreachableScenes: 0,
  },
  issues: [],
};

const report = createMemo<ReadinessReport>(() => compute());

export const UnityReadiness = {
  /** 主スナップショット (Solid signal)。プロジェクト / scene 反応で再計算。 */
  report,
};

function compute(): ReadinessReport {
  const ctx = ProjectService.currentProject();
  if (!ctx) return EMPTY;

  const issues: ReadinessIssue[] = [];

  // metadata: 未設定 display_name / dev_name (キャラのみ — 脚本の who: で参照される)
  for (const node of ctx.project.nodes.values()) {
    if (node.templateId === CHARACTER_TEMPLATE.id) {
      const display = node.fields['display_name'];
      const dev = node.fields['dev_name'];
      if (typeof display !== 'string' || display === '') {
        issues.push({
          severity: 'warning',
          category: 'metadata',
          title: '表示名未設定',
          detail: `キャラ "${node.slug}" の display_name が空です`,
          jump: { kind: 'node', nodeId: node.id },
        });
      }
      if (typeof dev !== 'string' || dev === '') {
        issues.push({
          severity: 'warning',
          category: 'metadata',
          title: 'dev_name 未設定',
          detail: `キャラ "${node.slug}" の dev_name が空 — 脚本の who: 参照が壊れる可能性`,
          jump: { kind: 'node', nodeId: node.id },
        });
      }
    }
    // thumbnail (scene サムネは別件)
    if (
      !node.thumbnail &&
      (node.templateId === CHARACTER_TEMPLATE.id ||
        node.templateId === 'template.location' ||
        node.templateId === 'template.faction')
    ) {
      issues.push({
        severity: 'info',
        category: 'thumbnail',
        title: 'サムネ未設定',
        detail: `${node.templateId.replace(/^template\./, '')} "${node.slug}" は Unity 出力時に画像が無い`,
        jump: { kind: 'node', nodeId: node.id },
      });
    }
  }

  // scene blocks 解析 (audio cue / unknown who / flow)
  const scenes = LintService.scenes() ?? [];
  let totalLines = 0;
  const sfxCues = new Set<string>();
  const bgmCues = new Set<string>();
  for (const scene of scenes) {
    for (const block of scene.blocks) {
      if (block.kind === 'line' || block.kind === 'action') {
        totalLines++;
        // unknown who はすでに lint で出ているので Unity Readiness では再掲しない
      } else if (block.kind === 'sfx') {
        if (block.name) sfxCues.add(block.name);
        else {
          issues.push({
            severity: 'warning',
            category: 'audio',
            title: 'SFX 名未設定',
            detail: `[${scene.label}] sfx ブロックの name が空`,
            jump: { kind: 'scene', chapterSlug: scene.chapterSlug, sceneSlug: scene.sceneSlug },
          });
        }
      } else if (block.kind === 'bgm') {
        if (block.cue) bgmCues.add(block.cue);
        else {
          issues.push({
            severity: 'warning',
            category: 'audio',
            title: 'BGM cue 未設定',
            detail: `[${scene.label}] bgm ブロックの cue が空`,
            jump: { kind: 'scene', chapterSlug: scene.chapterSlug, sceneSlug: scene.sceneSlug },
          });
        }
      }
    }
  }

  // flow: 到達不能シーンの検出は PR-AV (Plot Flow Lens) でやっているので
  // ここでは件数 0 のまま (unreachableScenes summary も 0)。
  // 将来 PR-AV merge 後に computePlotFlowLens を呼ぶ形に拡張する。

  // localization placeholder: scene 数 (= StringTable エントリ目安)
  if (scenes.length > 0) {
    issues.push({
      severity: 'info',
      category: 'localization',
      title: 'StringTable エントリ目安',
      detail: `Unity 側で ${scenes.length} シーン × 平均行数の Localization key が必要 (Phase 2 で算定)`,
    });
  }

  // summary
  let totalCharacters = 0;
  for (const node of ctx.project.nodes.values()) {
    if (node.templateId === CHARACTER_TEMPLATE.id) totalCharacters++;
  }

  return {
    summary: {
      totalScenes: scenes.length,
      totalNodes: ctx.project.nodes.size,
      totalCharacters,
      totalLines,
      totalSfxCues: sfxCues.size,
      totalBgmCues: bgmCues.size,
      unreachableScenes: 0,
    },
    issues,
  };
}
