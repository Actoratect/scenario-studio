// Project layer (M1) — settings / model skeleton / loader / initializer。
// 詳細: ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M1

export type { ProjectModel } from './ProjectModel.js';
export { PROJECT_DIRS, PROJECT_GITIGNORE } from './ProjectModel.js';
export type { ProjectSettings } from './ProjectSettings.js';
export {
  CURRENT_PROJECT_SCHEMA_VERSION,
  defaultProjectSettings,
  parseProjectSettings,
  PROJECT_SETTINGS_FILE,
  serializeProjectSettings,
} from './ProjectSettings.js';
export { initializeProject, loadProject, ProjectNotInitializedError } from './ProjectLoader.js';
