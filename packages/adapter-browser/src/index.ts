// Browser 用 Adapter (FS Access API / OPFS / IndexedDB)。
// 詳細: ../../../Documentation/ScenarioEditor/12_architecture.md §1
export { BrowserFileSystemAdapter } from './BrowserFileSystemAdapter.js';
export { createOpfsAdapter } from './createOpfsAdapter.js';
export type { PickedProject } from './pickers.js';
export {
  pickProjectDirectory,
  restoreProjectDirectory,
  supportsFileSystemAccess,
} from './pickers.js';
