import { createSignal } from 'solid-js';
import type { ProjectModel } from '@scenario-studio/core';
import {
  initializeProject,
  loadProject,
  ProjectNotInitializedError,
  type FileSystemAdapter,
  type ProjectHandle,
} from '@scenario-studio/core';
import {
  pickProjectDirectory,
  restoreProjectDirectory,
  supportsFileSystemAccess,
  type PickedProject,
} from '@scenario-studio/adapter-browser';
import { rememberProject, forgetProject, listRecentProjects } from './recent-projects.js';
import type { RecentProject } from './recent-projects.js';

// 「現在開いているプロジェクト」を持つ singleton service。
// frontend 全体が `currentProject()` シグナルを購読してリレンダ。
// 詳細: ../../../../Documentation/ScenarioEditor/12_architecture.md §1, §4.1,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M1

export interface OpenProjectContext {
  adapter: FileSystemAdapter;
  handle: ProjectHandle;
  project: ProjectModel;
  /** Browser FS Access 経由なら raw handle を持つ。OPFS 等は undefined。 */
  rawDirectoryHandle?: FileSystemDirectoryHandle;
}

const [currentProject, setCurrentProject] = createSignal<OpenProjectContext | undefined>(undefined);
const [recentProjects, setRecentProjects] = createSignal<readonly RecentProject[]>([]);
const [lastError, setLastError] = createSignal<Error | undefined>(undefined);

export const ProjectService = {
  currentProject,
  recentProjects,
  lastError,

  async refreshRecent(): Promise<void> {
    setRecentProjects(await listRecentProjects());
  },

  /**
   * 既存プロジェクトをユーザに選んでもらってロード。
   * 未初期化フォルダに当たった場合は ProjectNotInitializedError を投げ、
   * 呼び出し側で「初期化しますか?」確認ダイアログ → openOrInitialize() に進める想定。
   */
  async openWithPicker(): Promise<OpenProjectContext> {
    setLastError(undefined);
    const picked = await pickProjectDirectory({});
    return await openPicked(picked);
  },

  /**
   * 新規プロジェクトをユーザに選んでもらって作成。
   * 既に ProjectSettings.yaml がある場合は initializeProject が拒否する。
   */
  async createWithPicker(name: string): Promise<OpenProjectContext> {
    setLastError(undefined);
    const picked = await pickProjectDirectory({ name });
    const project = await initializeProject(picked.adapter, picked.handle, { name });
    const ctx: OpenProjectContext = {
      adapter: picked.adapter,
      handle: picked.handle,
      project,
      rawDirectoryHandle: picked.rawDirectoryHandle,
    };
    setCurrentProject(ctx);
    await rememberProject({
      id: picked.handle.id,
      name: project.settings.name,
      directoryHandle: picked.rawDirectoryHandle,
    });
    await ProjectService.refreshRecent();
    return ctx;
  },

  /**
   * Recent リストの 1 件を再 open。permission 拒否や未初期化なら null を返す。
   */
  async openRecent(recent: RecentProject): Promise<OpenProjectContext | null> {
    setLastError(undefined);
    const restored = await restoreProjectDirectory(recent.directoryHandle, { name: recent.name });
    if (!restored) {
      setLastError(new Error('Permission denied for the selected folder.'));
      return null;
    }
    try {
      return await openPicked(restored);
    } catch (e) {
      if (e instanceof ProjectNotInitializedError) {
        setLastError(e);
        return null;
      }
      throw e;
    }
  },

  async forget(id: string): Promise<void> {
    await forgetProject(id);
    await ProjectService.refreshRecent();
  },

  close(): void {
    setCurrentProject(undefined);
    setLastError(undefined);
  },

  supportsNativeFs(): boolean {
    return supportsFileSystemAccess();
  },
};

async function openPicked(picked: PickedProject): Promise<OpenProjectContext> {
  const project = await loadProject(picked.adapter, picked.handle);
  const ctx: OpenProjectContext = {
    adapter: picked.adapter,
    handle: picked.handle,
    project,
    rawDirectoryHandle: picked.rawDirectoryHandle,
  };
  setCurrentProject(ctx);
  await rememberProject({
    id: picked.handle.id,
    name: project.settings.name,
    directoryHandle: picked.rawDirectoryHandle,
  });
  await ProjectService.refreshRecent();
  return ctx;
}
