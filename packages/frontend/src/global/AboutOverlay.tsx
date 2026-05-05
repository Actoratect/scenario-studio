import { createSignal, Show } from 'solid-js';
import type { Component } from 'solid-js';

// Help / About overlay (PR-AF)。version + リンク + クレジット。
// Workspace header の `?` ボタンから開く。
// 詳細: ../../../../Documentation/ScenarioEditor/00_README.md

const [open, setOpen] = createSignal(false);

export const AboutOverlay = {
  open,
  show(): void {
    setOpen(true);
  },
  hide(): void {
    setOpen(false);
  },
  toggle(): void {
    setOpen(!open());
  },
};

// vite-plugin-pwa の generated client から build時刻 / Git commit 取れるが、
// 開発簡略化のため __APP_VERSION__ + __BUILD_TIME__ を vite define で注入。
// (vite.config.ts で define: { __APP_VERSION__: ..., __BUILD_TIME__: ... })
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
const VERSION = (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev') as string;
const BUILD = (typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'unknown') as string;

const AboutUi: Component = () => {
  return (
    <div class="ss-modal-backdrop" onClick={() => AboutOverlay.hide()}>
      <div class="ss-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Scenario Studio</h3>
        <p class="ss-modal-caption">
          multi-target scenario editor — Phase 1 MVP (Browser standalone)
        </p>
        <dl class="ss-about-meta">
          <dt>Version</dt>
          <dd>
            <code>{VERSION}</code>
          </dd>
          <dt>Build</dt>
          <dd>
            <code>{BUILD}</code>
          </dd>
          <dt>Engine</dt>
          <dd>SolidJS + Vite + Dockview / TypeScript strict</dd>
        </dl>
        <h4>機能の探し方</h4>
        <ul class="ss-about-list">
          <li>
            <code>⌘ /</code> でショートカット一覧
          </li>
          <li>
            <code>⌘ K</code> でコマンドパレット (検索 + 全機能を呼び出し)
          </li>
          <li>
            <code>⌘ F</code> で全文検索 (ノード fields + 脚本 text)
          </li>
          <li>
            <code>⌘ I</code> で ID 一覧 (全ノードの ID コピー / jump)
          </li>
        </ul>
        <h4>クレジット</h4>
        <p class="ss-about-credits">
          設計: <code>Documentation/ScenarioEditor/</code> 内に全章。 コード: TypeScript / SolidJS /
          pnpm monorepo。 色彩:{' '}
          <a href="https://jfly.uni-koeln.de/colorset/" target="_blank" rel="noreferrer">
            CUDO カラーユニバーサルデザイン
          </a>
          。
        </p>
        <p class="ss-about-credits">開発支援: Claude Code (Anthropic Opus 4.7)。</p>
        <div class="ss-modal-actions">
          <span class="ss-modal-spacer" />
          <button type="button" data-variant="primary" onClick={() => AboutOverlay.hide()}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

export const AboutOverlayRoot: Component = () => {
  return (
    <Show when={open()}>
      <AboutUi />
    </Show>
  );
};
