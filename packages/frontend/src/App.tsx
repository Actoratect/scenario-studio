import { Show, Suspense } from 'solid-js';
import type { Component } from 'solid-js';
import { ProjectPicker } from './panels/ProjectPicker';
import { WorkspaceShell } from './WorkspaceShell';
import { CommandPaletteRoot } from './global/CommandPalette';
import { ExportDialogRoot } from './global/ExportDialog';
import { ShortcutsOverlayRoot } from './global/ShortcutsOverlay';
import { Toaster } from './global/Toaster';
import { ProjectService } from './services/ProjectService';

// 既存の `index.ts` が再エクスポートしている VERSION 識別子を保持。
export const FRONTEND_VERSION = '0.0.0';

// プロジェクトが open されているかでルーティング。
// router (`@solidjs/router`) は M3+ で deep link が必要になった時に導入予定。
// 詳細: ../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M1
export const App: Component = () => {
  return (
    <>
      <Suspense fallback={<div class="app-loading">Loading…</div>}>
        <Show when={ProjectService.currentProject()} fallback={<ProjectPicker />}>
          <WorkspaceShell />
        </Show>
      </Suspense>
      <Toaster />
      <CommandPaletteRoot />
      <ExportDialogRoot />
      <ShortcutsOverlayRoot />
    </>
  );
};
