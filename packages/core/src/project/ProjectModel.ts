import type { EraIndex } from '../domain/era.js';
import type { ScenarioNode } from '../domain/node.js';
import type { ScenarioStructure } from '../domain/scenario.js';
import type { GlossaryTerm } from '../domain/GlossaryRepository.js';
import type { Relation } from '../domain/Relation.js';
import type { ProjectSettings } from './ProjectSettings.js';
import type { NodeId } from '../domain/era.js';

// プロジェクトのインメモリ表現。
// 詳細: ../../../../Documentation/ScenarioEditor/12_architecture.md §1, §5,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M1, M2, M4, M7

export interface ProjectModel {
  /** プロジェクトの設定 (`ProjectSettings.yaml` の hydrate)。 */
  settings: ProjectSettings;
  /** id → ScenarioNode の Map (M2)。 */
  nodes: ReadonlyMap<NodeId, ScenarioNode>;
  /** Era 階層 index (M4 で実 hydrate)。 */
  eras: EraIndex;
  /** 章 / シーン階層と全体 synopsis (M4)。 */
  scenario: ScenarioStructure;
  /** 用語集 (M7、Glossary/terms.yaml hydrate)。 */
  glossary: readonly GlossaryTerm[];
  /** 明示的なノード間関係 (PR-E、Relations/relations.yaml hydrate)。 */
  relations: readonly Relation[];
}

/**
 * プロジェクト直下に作る最小ディレクトリ構造 (新規作成時のみ)。
 * 詳細: 03_data-model.md
 */
export const PROJECT_DIRS: readonly string[] = [
  'Nodes',
  'Nodes/characters',
  'Nodes/locations',
  'Nodes/items',
  'Nodes/factions',
  'Scenarios',
  'Eras',
  'Templates',
  'Variables',
  'Glossary',
  'Localization',
  'Media',
  'Relations',
];

/**
 * 新規プロジェクトに置く .gitignore の初期値。
 * `.editor/` 以下に AI 履歴 / レイアウト等のローカル状態が入るため、
 * 開発側 AI ツール (Claude Code / Cursor) のセッションファイルとともに無視。
 */
export const PROJECT_GITIGNORE = `# Scenario Studio editor local state
.editor/

# AI tool session data (per-developer)
.claude/
.aider*
`;
