import type { EraIndex } from '../domain/era.js';
import type { ScenarioNode } from '../domain/node.js';
import type { ProjectSettings } from './ProjectSettings.js';
import type { NodeId } from '../domain/era.js';

// プロジェクトのインメモリ表現。M1 では skeleton として最低限の shape を確定。
// M2 以降で nodes / scenarios / templates / glossary を充実させる。
// 詳細: ../../../../Documentation/ScenarioEditor/12_architecture.md §1, §5,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M1, M2

export interface ProjectModel {
  /** プロジェクトの設定 (`ProjectSettings.yaml` の hydrate)。 */
  settings: ProjectSettings;
  /** id → ScenarioNode の Map。M2 で NodeRepository から hydrate。 */
  nodes: ReadonlyMap<NodeId, ScenarioNode>;
  /** Era 階層 index。M4 で本格化、M1 では空 index でも良い。 */
  eras: EraIndex;
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
