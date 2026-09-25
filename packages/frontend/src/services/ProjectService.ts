import { createSignal } from 'solid-js';
import {
  initializeProject,
  loadProject,
  ProjectAlreadyInitializedError,
  ProjectHistory,
  ProjectNotInitializedError,
  PROJECT_SETTINGS_FILE,
  serializeProjectSettings,
  type FileSystemAdapter,
  type FsEraRepository,
  type FsGlossaryRepository,
  type FsPlotBoardRepository,
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
import { MEROS_SAMPLE } from 'virtual:meros-sample';
import {
  rememberProject,
  forgetProject,
  listRecentProjects,
  pinProject,
} from './recent-projects.js';
import type { RecentProject } from './recent-projects.js';
import { GraphComments } from '../graph/graph-comments.js';
import { GraphPositions } from '../graph/graph-positions.js';
import { PlotFlowEdges } from '../graph/plot-flow-edges.js';
import { ThumbnailService } from './ThumbnailService.js';
import { ConflictDetector } from './ConflictDetector.js';
import { GlobalHistoryService } from './GlobalHistoryService.js';
import { ScriptHistoryService } from './ScriptHistoryService.js';
import { PlotBoardService } from './PlotBoardService.js';
import { RelationsService } from './RelationsService.js';
import { DirtyTracker } from './DirtyTracker.js';
import { useSaveScheduler } from './save-scheduler-binding.js';
import { Toast } from './Toast.js';

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
  plotBoardRepository: FsPlotBoardRepository;
  templates: TemplateRegistry;
  history: ProjectHistory;
  /** Browser FS Access 経由なら raw handle を持つ。OPFS 等は undefined。 */
  rawDirectoryHandle?: FileSystemDirectoryHandle | undefined;
}

/**
 * P1: openWithPicker が未初期化フォルダに当たったときに投げる。選択済み handle を保持するので、
 * UI 側は「ここに新規作成しますか?」確認 → initializePicked() へ picker を再表示せずに進める。
 */
export class PickedFolderNotInitializedError extends Error {
  constructor(readonly picked: PickedProject) {
    super(`Folder "${picked.handle.name}" is not initialized`);
    this.name = 'PickedFolderNotInitializedError';
  }
}

/**
 * P1: createWithPicker が既存プロジェクト入りフォルダに当たったときに投げる。選択済み handle を
 * 保持するので、UI 側は「既存として開き直しますか?」確認 → openPickedExisting() へ進める。
 */
export class PickedFolderAlreadyProjectError extends Error {
  constructor(readonly picked: PickedProject) {
    super(`Folder "${picked.handle.name}" already contains a project`);
    this.name = 'PickedFolderAlreadyProjectError';
  }
}

const [currentProject, setCurrentProject] = createSignal<OpenProjectContext | undefined>(undefined);
const [opening, setOpening] = createSignal(false);
const [recentProjects, setRecentProjects] = createSignal<readonly RecentProject[]>([]);
const [lastError, setLastError] = createSignal<Error | undefined>(undefined);
let disposeGlobalProjectHistory: (() => void) | undefined;

function resetGlobalProjectHistory(): void {
  disposeGlobalProjectHistory?.();
  disposeGlobalProjectHistory = undefined;
  GlobalHistoryService.clear();
  ScriptHistoryService.clear();
}

export const ProjectService = {
  currentProject,
  opening,
  recentProjects,
  lastError,

  async refreshRecent(): Promise<void> {
    setRecentProjects(await listRecentProjects());
  },

  /**
   * 既存プロジェクトをユーザに選んでもらってロード。
   * 未初期化フォルダに当たった場合は選択済み handle 入りの PickedFolderNotInitializedError を
   * 投げるので、呼び出し側は「初期化しますか?」確認 → initializePicked() に進める (P1)。
   */
  async openWithPicker(): Promise<OpenProjectContext> {
    setLastError(undefined);
    const picked = await pickProjectDirectory({});
    try {
      return await openPicked(picked, await loadProject(picked.adapter, picked.handle));
    } catch (e) {
      if (e instanceof ProjectNotInitializedError) {
        throw new PickedFolderNotInitializedError(picked);
      }
      throw e;
    }
  },

  /**
   * 新規プロジェクトをユーザに選んでもらって作成。
   * 既に ProjectSettings.yaml がある場合は選択済み handle 入りの
   * PickedFolderAlreadyProjectError を投げるので、呼び出し側は
   * 「既存として開き直しますか?」確認 → openPickedExisting() に進める (P1)。
   */
  async createWithPicker(name: string): Promise<OpenProjectContext> {
    setLastError(undefined);
    const picked = await pickProjectDirectory({ name });
    try {
      const result = await initializeProject(picked.adapter, picked.handle, { name });
      return await openPicked(picked, result);
    } catch (e) {
      if (e instanceof ProjectAlreadyInitializedError) {
        throw new PickedFolderAlreadyProjectError(picked);
      }
      throw e;
    }
  },

  /** P1: picker で選択済みの未初期化フォルダを、そのまま初期化して開く (openWithPicker の救済導線)。 */
  async initializePicked(picked: PickedProject, name: string): Promise<OpenProjectContext> {
    setLastError(undefined);
    const result = await initializeProject(picked.adapter, picked.handle, { name });
    return openPicked(picked, result);
  },

  /** P1: picker で選択済みの既存プロジェクトフォルダを、そのまま開く (createWithPicker の救済導線)。 */
  async openPickedExisting(picked: PickedProject): Promise<OpenProjectContext> {
    setLastError(undefined);
    return openPicked(picked, await loadProject(picked.adapter, picked.handle));
  },

  /**
   * P1: 走れメロス サンプルプロジェクトをユーザの選んだ空フォルダに展開して開く。
   * Vite plugin (merosSamplePlugin) が `virtual:meros-sample` で渡してくる
   * ファイルツリーを adapter.write* で書き出してから loadProject() する。
   * (PR-AE の openFf7Sample と同方式。FF7 版は著作権配慮で削除、走れメロスで復活。)
   */
  async openMerosSample(): Promise<OpenProjectContext> {
    setLastError(undefined);
    const picked = await pickProjectDirectory({ name: '走れメロス (sample)' });
    if ((await picked.adapter.list(picked.handle, '**')).length > 0) {
      throw new Error('サンプルの展開先には空のフォルダーを選択してください');
    }

    const entries = Object.entries(MEROS_SAMPLE.files);
    if (entries.length === 0) {
      throw new Error(
        '走れメロス サンプルが bundle されていません (vite ビルドの sample-projects/meros を確認)',
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
    resetGlobalProjectHistory();
    PlotBoardService.reset();
    RelationsService.discardPending();
    if (ctx) {
      ctx.history.destroy();
      ConflictDetector.clear(ctx.handle);
    }
    setCurrentProject(undefined);
    setLastError(undefined);
    GraphPositions.clear();
    GraphComments.clear();
    PlotFlowEdges.clear();
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

  /**
   * `ctx.project` 配下を Object.assign で in-place 更新したあとに呼ぶ。
   * Solid signal は ctx の参照変化を見るため、{ ...ctx } を set し直すことで
   * ProjectModel に依存する全 memo (Inspector / Outline / Graph / Glossary 等) を
   * 再評価させる。
   */
  touch(): void {
    const ctx = currentProject();
    if (!ctx) return;
    setCurrentProject({ ...ctx });
  },

  /**
   * P1 (ゴミ箱復元用): 現在のプロジェクトを同じ handle で開き直す。
   * ディスク側の変化 (復元されたノード / シーン) を in-memory の
   * nodes / scenario / history へ反映する最短経路。未保存 staging には
   * 配慮しないので、呼び出し側で dirty が無いことを確認してから呼ぶこと。
   */
  async reload(): Promise<void> {
    const ctx = currentProject();
    if (!ctx) return;
    setLastError(undefined);
    // 先にloadすると旧ディスク内容がプロット/関係の最新版を置き換えてしまう。
    const scheduler = useSaveScheduler();
    const graphServices = [
      PlotBoardService,
      RelationsService,
      GraphPositions,
      GraphComments,
      PlotFlowEdges,
    ];
    const results = await Promise.all([
      scheduler.flushAllAsync(),
      DirtyTracker.flushAll(),
      ...graphServices.map((service) => service.flushPending()),
    ]);
    if (currentProject()?.project !== ctx.project) return;
    if (
      results.some((result) => result.failed > 0 || ('skipped' in result && result.skipped > 0)) ||
      scheduler.pendingCount > 0 ||
      DirtyTracker.isDirty() ||
      graphServices.some((service) => service.hasPending())
    ) {
      throw new Error('未保存の変更があります。保存を完了してから再読込してください');
    }
    // 読込中に旧画面から新たな編集を始めないよう、保存後に作業画面を閉じる。
    setOpening(true);
    setCurrentProject(undefined);
    ctx.history.destroy();
    ConflictDetector.clear(ctx.handle);
    try {
      await openPicked(
        { adapter: ctx.adapter, handle: ctx.handle, rawDirectoryHandle: ctx.rawDirectoryHandle },
        await loadProject(ctx.adapter, ctx.handle),
      );
    } finally {
      setOpening(false);
    }
  },
};

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * openPicked が必要とする最小限の情報。PickedProject はこれに代入可能。
 * reload() は raw handle を持たない可能性があるため optional にしている。
 */
interface OpenProjectSource {
  adapter: FileSystemAdapter;
  handle: ProjectHandle;
  rawDirectoryHandle?: FileSystemDirectoryHandle | undefined;
}

async function openPicked(
  picked: OpenProjectSource,
  loaded: LoadProjectResult,
): Promise<OpenProjectContext> {
  setOpening(true);
  try {
    // 既に open 中だった場合の history 解放
    const prev = currentProject();
    // 再読込でも旧Workspaceを閉じ、破棄済みhistoryを編集中の画面から参照させない。
    if (prev) setCurrentProject(undefined);
    resetGlobalProjectHistory();
    // 旧プロジェクトのプロットボード保留保存を flush + モジュール状態をクリア
    // (debounce タイマーが新プロジェクトへ書き込むのを防ぐ)。
    PlotBoardService.reset();
    if (prev) {
      prev.history.destroy();
      ConflictDetector.clear(prev.handle);
    }

    const history = new ProjectHistory();
    for (const node of loaded.project.nodes.values()) {
      history.register(node);
    }
    const unregisterProjectController = GlobalHistoryService.registerProjectController({
      canUndo: () => history.pendingUndo > 0,
      canRedo: () => history.pendingRedo > 0,
      undo: () => history.undo(),
      redo: () => history.redo(),
    });
    const unregisterProjectHistoryObserver = history.observe((event) => {
      // Undo 通知用に「どのノードの編集か」をラベルとして残す。
      const node = loaded.project.nodes.get(event.nodeId);
      const display = node?.fields['display_name'];
      const name =
        typeof display === 'string' && display !== '' ? display : (node?.slug ?? 'ノード');
      GlobalHistoryService.recordProject(`ノード「${name}」の編集`);
    });
    disposeGlobalProjectHistory = () => {
      unregisterProjectHistoryObserver();
      unregisterProjectController();
    };

    const ctx: OpenProjectContext = {
      adapter: picked.adapter,
      handle: picked.handle,
      project: loaded.project,
      nodeRepository: loaded.nodeRepository,
      eraRepository: loaded.eraRepository,
      scenarioRepository: loaded.scenarioRepository,
      glossaryRepository: loaded.glossaryRepository,
      relationsRepository: loaded.relationsRepository,
      plotBoardRepository: loaded.plotBoardRepository,
      templates: loaded.templates,
      history,
      rawDirectoryHandle: picked.rawDirectoryHandle,
    };
    await Promise.all([
      GraphPositions.switchProject(picked.adapter, picked.handle),
      GraphComments.switchProject(picked.adapter, picked.handle),
      PlotFlowEdges.switchProject(picked.adapter, picked.handle),
      primeConflictBaseline(ctx),
    ]);
    setCurrentProject(ctx);
    // PR-AH: 各ノードの「現在の disk 内容」を ConflictDetector の baseline に登録
    // (load 時点の内容 = 我々が知っている内容)
    // 章単位で発生した非致命的 load エラーを Toast で警告。
    // (壊れた章は ScenarioStructure.errors に積まれており、他の章は load 済み)
    const loadErrors = loaded.project.scenario.errors;
    if (loadErrors.length > 0) {
      const head = loadErrors.slice(0, 3);
      const rest = loadErrors.length - head.length;
      const summary = head.map((e) => `${e.scope}: ${e.message}`).join(' / ');
      const tail = rest > 0 ? ` … 他 ${rest} 件` : '';
      Toast.error(
        `${loadErrors.length} 件の章を読み込めませんでした (skip): ${summary}${tail}`,
        8000,
      );
      console.warn('[ProjectService] chapter load errors:', loadErrors);
    }
    const rawHandle = picked.rawDirectoryHandle;
    if (rawHandle) {
      void rememberProject({
        id: picked.handle.id,
        name: loaded.project.settings.name,
        directoryHandle: rawHandle,
      })
        .then(() => ProjectService.refreshRecent())
        .catch((e) => {
          console.warn('[ProjectService] recent project update failed', e);
        });
    }
    return ctx;
  } finally {
    setOpening(false);
  }
}

async function primeConflictBaseline(ctx: OpenProjectContext): Promise<void> {
  for (const node of ctx.project.nodes.values()) {
    const path = ctx.nodeRepository.pathFor(node);
    try {
      if (await ctx.adapter.exists(ctx.handle, path)) {
        const text = await ctx.adapter.read(ctx.handle, path);
        ConflictDetector.recordSnapshot(ctx.handle, path, text);
      }
    } catch {
      // 読み込み失敗は無視 (load 自体は成功しているはずなので例外的)
    }
  }
}
