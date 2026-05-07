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

/**
 * 章 / シーン load 時に発生した非致命的エラー (= 1 ファイル壊れていても他は読める)。
 * ProjectLoader 経由で UI 層に渡され、Toast / Console で警告表示される。
 */
export interface ChapterLoadError {
  /** 失敗した章 / scene の slug (chapter slug or `chapter/scene` 形式)。 */
  scope: string;
  /** どのファイルで起きたか (相対 path)。 */
  path: string;
  /** ユーザー向けの 1 行メッセージ (parser のエラーメッセージ等)。 */
  message: string;
}

export interface ScenarioStructure {
  /** プロジェクト全体の synopsis.md (なければ空文字)。 */
  projectSynopsis: string;
  /** order 順に並んだ章 (`_project.yaml` の chapters で管理)。 */
  chapters: readonly Chapter[];
  /** 読込中に発生した非致命的エラー (= 該当章 / scene を skip した)。
   *  プロジェクト自体は load 成功扱いとする。 */
  errors: readonly ChapterLoadError[];
}
