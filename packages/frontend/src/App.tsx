import { ErrorBoundary, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { ContextMenuRoot } from '@scenario-studio/ui-kit';
import { ProjectPicker } from './panels/ProjectPicker';
import { WorkspaceShell } from './WorkspaceShell';
import { AboutOverlayRoot } from './global/AboutOverlay';
import { AiCandidateOverlayRoot } from './global/AiCandidateOverlay';
import { AiPatchQueueOverlayRoot } from './global/AiPatchQueueOverlay';
import { AiSummaryOverlayRoot } from './global/AiSummaryOverlay';
import { BulkVariantOverlayRoot } from './global/BulkVariantOverlay';
import { CommandPaletteRoot } from './global/CommandPalette';
import { LocalAgentHandoffOverlayRoot } from './global/LocalAgentHandoffOverlay';
import { ProjectHealthOverlayRoot } from './global/ProjectHealthOverlay';
import { ExportDialogRoot } from './global/ExportDialog';
import { IdListOverlayRoot } from './global/IdListOverlay';
import { SearchOverlayRoot } from './global/SearchOverlay';
import { ShortcutsOverlayRoot } from './global/ShortcutsOverlay';
import { UnityReadinessOverlayRoot } from './global/UnityReadinessOverlay';
import { Toaster } from './global/Toaster';
import { ProjectService } from './services/ProjectService';

// 既存の `index.ts` が再エクスポートしている VERSION 識別子を保持。
export const FRONTEND_VERSION = '0.0.0';

// プロジェクトが open されているかでルーティング。
// router (`@solidjs/router`) は M3+ で deep link が必要になった時に導入予定。
// 詳細: ../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M1
// 描画例外の受け皿。捕捉しないと Solid は reactive root ごと落ちて全画面が白くなる。
// クラッシュ復帰機構が入るまでは未保存変更が消える恐れがあるため、リロード前に
// 控えるよう促し、まずは副作用の無い「再描画」を提示する。
function CrashFallback(err: unknown, reset: () => void) {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  return (
    <div class="ss-crash-screen" role="alert">
      <div class="ss-crash-card">
        <h1 class="ss-crash-title">⚠ 画面の描画でエラーが発生しました</h1>
        <p class="ss-crash-lead">
          アプリの一部が想定外の状態になりました。
          <strong>未保存の変更はまだメモリ上に残っている可能性があります。</strong>
          リロードする前に、可能なら重要な作業内容を別の場所に控えてください。
        </p>
        <pre class="ss-crash-detail">{message}</pre>
        <div class="ss-crash-actions">
          <button type="button" onClick={reset}>
            再描画を試みる
          </button>
          <button type="button" data-variant="primary" onClick={() => location.reload()}>
            リロード (未保存は失われます)
          </button>
        </div>
      </div>
    </div>
  );
}

export const App: Component = () => {
  return (
    <>
      <ErrorBoundary fallback={CrashFallback}>
        <Show when={ProjectService.currentProject()} fallback={<ProjectPicker />}>
          <WorkspaceShell />
        </Show>
      </ErrorBoundary>
      <Toaster />
      <CommandPaletteRoot />
      <ExportDialogRoot />
      <SearchOverlayRoot />
      <IdListOverlayRoot />
      <ShortcutsOverlayRoot />
      <AboutOverlayRoot />
      <AiSummaryOverlayRoot />
      <LocalAgentHandoffOverlayRoot />
      <ProjectHealthOverlayRoot />
      <UnityReadinessOverlayRoot />
      <AiPatchQueueOverlayRoot />
      <BulkVariantOverlayRoot />
      <AiCandidateOverlayRoot />
      <ContextMenuRoot />
    </>
  );
};
