import type { FileSystemAdapter, ProjectHandle } from '../platform.js';
import { buildEraIndex } from '../domain/era.js';
import type { NodeId } from '../domain/era.js';
import type { ScenarioNode } from '../domain/node.js';
import {
  defaultProjectSettings,
  parseProjectSettings,
  PROJECT_SETTINGS_FILE,
  serializeProjectSettings,
} from './ProjectSettings.js';
import type { ProjectSettings } from './ProjectSettings.js';
import { PROJECT_DIRS, PROJECT_GITIGNORE } from './ProjectModel.js';
import type { ProjectModel } from './ProjectModel.js';

// プロジェクトの「初期化」と「ロード」を Adapter 経由で行う。
// M1 範囲: Nodes / Scenarios の本格 hydrate は M2、ここでは settings + 空構造で OK。
// 詳細: ../../../../Documentation/ScenarioEditor/12_architecture.md §4.1,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M1

/**
 * 既存プロジェクトを Adapter 経由でロードする。
 * `ProjectSettings.yaml` 必須。なければ「未初期化プロジェクト」エラー。
 */
export async function loadProject(
  adapter: FileSystemAdapter,
  handle: ProjectHandle,
): Promise<ProjectModel> {
  const settingsExists = await adapter.exists(handle, PROJECT_SETTINGS_FILE);
  if (!settingsExists) {
    throw new ProjectNotInitializedError(handle.name);
  }
  const settingsText = await adapter.read(handle, PROJECT_SETTINGS_FILE);
  const settings = parseProjectSettings(settingsText);

  // M2 で hydrate。M1 では空。
  const nodes = new Map<NodeId, ScenarioNode>();
  const eras = buildEraIndex([]);
  return { settings, nodes, eras };
}

/**
 * 空フォルダにプロジェクト構造を初期化する。既存の `ProjectSettings.yaml` があれば上書きせず throw。
 */
export async function initializeProject(
  adapter: FileSystemAdapter,
  handle: ProjectHandle,
  options: { name: string; settings?: Partial<ProjectSettings> } = { name: handle.name },
): Promise<ProjectModel> {
  const exists = await adapter.exists(handle, PROJECT_SETTINGS_FILE);
  if (exists) {
    throw new Error(
      `${PROJECT_SETTINGS_FILE} already exists at handle ${handle.id} — refusing to overwrite`,
    );
  }
  const settings: ProjectSettings = {
    ...defaultProjectSettings(options.name),
    ...(options.settings ?? {}),
  };
  // ProjectSettings.yaml を最初に書く (これがプロジェクト初期化の "完了マーカー")
  await adapter.write(handle, PROJECT_SETTINGS_FILE, serializeProjectSettings(settings));
  // ディレクトリ構造を marker ファイル (.gitkeep) で作成
  for (const dir of PROJECT_DIRS) {
    await adapter.write(handle, `${dir}/.gitkeep`, '');
  }
  // .gitignore を root に置く (リポジトリ化時の基本 hygiene)
  await adapter.write(handle, '.gitignore', PROJECT_GITIGNORE);

  return loadProject(adapter, handle);
}

export class ProjectNotInitializedError extends Error {
  constructor(readonly projectName: string) {
    super(
      `Project "${projectName}" is not initialized (missing ${PROJECT_SETTINGS_FILE}). Use initializeProject() first.`,
    );
    this.name = 'ProjectNotInitializedError';
  }
}
