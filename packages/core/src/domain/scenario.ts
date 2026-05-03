// Scenario 階層 (Project → 章 → シーン) の domain types。
// Scene 本体 (script: array) は M6 で本格化。M4 はメタ + synopsis のみ扱う。
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §1, §4,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M4

export type ChapterId = string & { readonly __brand: 'ChapterId' };
export type SceneId = string & { readonly __brand: 'SceneId' };

export const chapterId = (s: string): ChapterId => s as ChapterId;
export const sceneId = (s: string): SceneId => s as SceneId;

export interface SceneMeta {
  id: SceneId;
  /** 章ディレクトリ内の slug (= ファイル名)。 */
  slug: string;
  title: string;
  /** 章ディレクトリからの相対パス (例: `s01_opening.scn.yaml`)。 */
  relativePath: string;
}

export interface Chapter {
  id: ChapterId;
  /** Scenarios/ 直下の章ディレクトリ名 (例: `ch01_meeting`)。 */
  slug: string;
  title: string;
  summary?: string | undefined;
  /** order 順に並んだシーン (`_scene_index.yaml` で管理)。 */
  scenes: readonly SceneMeta[];
}

export interface ScenarioStructure {
  /** プロジェクト全体の synopsis.md (なければ空文字)。 */
  projectSynopsis: string;
  /** order 順に並んだ章 (`_project.yaml` の chapters で管理)。 */
  chapters: readonly Chapter[];
}
