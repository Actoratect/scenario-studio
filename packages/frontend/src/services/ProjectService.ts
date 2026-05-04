import { createSignal } from 'solid-js';
import {
  initializeProject,
  loadProject,
  ProjectHistory,
  ProjectNotInitializedError,
  PROJECT_SETTINGS_FILE,
  serializeProjectSettings,
  type FileSystemAdapter,
  type FsEraRepository,
  type FsGlossaryRepository,
  type FsRelationsRepository,
  type FsScenarioRepository,
  type LoadProjectResult,
  type NodeRepository,
  type ProjectHandle,
  type ProjectModel,
  type ProjectSettings,
  type TemplateRegistry,
} from '@scenario-studio/core';
import {
  pickProjectDirectory,
  restoreProjectDirectory,
  supportsFileSystemAccess,
  type PickedProject,
} from '@scenario-studio/adapter-browser';
import { FF7_SAMPLE } from 'virtual:ff7-sample';
import {
  rememberProject,
  forgetProject,
  listRecentProjects,
  pinProject,
} from './recent-projects.js';
import type { RecentProject } from './recent-projects.js';
import { GraphPositions } from '../graph/graph-positions.js';
import { ThumbnailService } from './ThumbnailService.js';

// 「現在開いているプロジェクト」を持つ singleton service。
// frontend 全体が `currentProject()` シグナルを購読してリレンダ。
// M2: nodeRepository / templates / history を context に追加。
// 詳細: ../../../../Documentation/ScenarioEditor/12_architecture.md §1, §4.1,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M1, M2

export interface OpenProjectContext {
  adapter: FileSystemAdapter;
  handle: ProjectHandle;
  project: ProjectModel;
  nodeRepository: NodeRepository;
  eraRepository: FsEraRepository;
  scenarioRepository: FsScenarioRepository;
  glossaryRepository: FsGlossaryRepository;
  relationsRepository: FsRelationsRepository;
  templates: TemplateRegistry;
  history: ProjectHistory;
  /** Browser FS Access 経由なら raw handle を持つ。OPFS 等は undefined。 */
  rawDirectoryHandle?: FileSystemDirectoryHandle | undefined;
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
    return await openPicked(picked, await loadProject(picked.adapter, picked.handle));
  },

  /**
   * 新規プロジェクトをユーザに選んでもらって作成。
   * 既に ProjectSettings.yaml がある場合は initializeProject が拒否する。
   */
  async createWithPicker(name: string): Promise<OpenProjectContext> {
    setLastError(undefined);
    const picked = await pickProjectDirectory({ name });
    const result = await initializeProject(picked.adapter, picked.handle, { name });
    return openPicked(picked, result);
  },

  /**
   * PR-AE: FF7 サンプルプロジェクトをユーザの選んだ空フォルダに展開して開く。
   * Vite plugin (ff7SamplePlugin) が `virtual:ff7-sample` で渡してくる
   * ファイルツリーを adapter.write* で書き出してから loadProject() する。
   */
  async openFf7Sample(): Promise<OpenProjectContext> {
    setLastError(undefined);
    const picked = await pickProjectDirectory({ name: 'FF7 (sample)' });

    const entries = Object.entries(FF7_SAMPLE.files);
    if (entries.length === 0) {
      throw new Error(
        'FF7 サンプルが bundle されていません (vite ビルドの sample-projects/ff7 を確認)',
      );
    }
    for (const [path, entry] of entries) {
      if (entry.kind === 'text') {
        await picked.adapter.write(picked.handle, path, entry.text);
      } else {
        const bin = base64ToBytes(entry.base64);
        await picked.adapter.writeBytes(picked.handle, path, bin);
      }
    }
    return await openPicked(picked, await loadProject(picked.adapter, picked.handle));
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
      return await openPicked(restored, await loadProject(restored.adapter, restored.handle));
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

  /** PR-AE: 最近リストの 1 件を pin / unpin する。 */
  async setPinned(id: string, pinned: boolean): Promise<void> {
    await pinProject(id, pinned);
    await ProjectService.refreshRecent();
  },

  close(): void {
    const ctx = currentProject();
    if (ctx) ctx.history.destroy();
    setCurrentProject(undefined);
    setLastError(undefined);
    GraphPositions.clear();
    ThumbnailService.clearAll();
  },

  supportsNativeFs(): boolean {
    return supportsFileSystemAccess();
  },

  /**
   * ProjectSettings.yaml を更新 (PR-M)。次回起動時に反映される。
   * Workspace title もリアクティブ更新するため ProjectModel.settings も差替え。
   */
  async updateSettings(next: ProjectSettings): Promise<void> {
    const ctx = currentProject();
    if (!ctx) return;
    await ctx.adapter.write(ctx.handle, PROJECT_SETTINGS_FILE, serializeProjectSettings(next));
    Object.assign(ctx.project, { settings: next });
    // currentProject signal を再 set して subscriber に変更を伝える
    setCurrentProject({ ...ctx });
  },
};

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function openPicked(picked: PickedProject, loaded: LoadProjectResult): Promise<OpenProjectContext> {
  // 既に open 中だった場合の history 解放
  const prev = currentProject();
  if (prev) prev.history.destroy();

  const history = new ProjectHistory();
  for (const node of loaded.project.nodes.values()) {
    history.register(node);
  }

  const ctx: OpenProjectContext = {
    adapter: picked.adapter,
    handle: picked.handle,
    project: loaded.project,
    nodeRepository: loaded.nodeRepository,
    eraRepository: loaded.eraRepository,
    scenarioRepository: loaded.scenarioRepository,
    glossaryRepository: loaded.glossaryRepository,
    relationsRepository: loaded.relationsRepository,
    templates: loaded.templates,
    history,
    rawDirectoryHandle: picked.rawDirectoryHandle,
  };
  setCurrentProject(ctx);
  GraphPositions.switchProject(picked.handle.id);
  return rememberProject({
    id: picked.handle.id,
    name: loaded.project.settings.name,
    directoryHandle: picked.rawDirectoryHandle,
  })
    .then(() => ProjectService.refreshRecent())
    .then(() => ctx);
}
