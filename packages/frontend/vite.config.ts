import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import solid from 'vite-plugin-solid';
import { VitePWA } from 'vite-plugin-pwa';

// production build 時にだけ strict CSP meta を注入する。
// dev 時に注入すると HMR の WebSocket (ws://localhost:*) が 'self' に含まれず HMR が壊れる。
// 詳細: ../../Documentation/ScenarioEditor/16_security.md §2.2
const PROD_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://api.anthropic.com https://api.openai.com http://localhost:11434; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none';";

function cspPlugin(): Plugin {
  return {
    name: 'scenario-studio:csp',
    apply: 'build',
    transformIndexHtml(html) {
      const tag = `<meta http-equiv="Content-Security-Policy" content="${PROD_CSP}">`;
      return html.replace('</head>', `  ${tag}\n  </head>`);
    },
  };
}

// SolidJS + Vite + PWA。
// M8: 本格的なキャッシュ戦略 — JS/CSS は SWR (新版を即座に学習しつつ古版で起動高速化)、
// 画像は Cache-First (めったに変わらない)、index.html は NetworkFirst (新ビルド即反映)。
// 詳細: ../../Documentation/ScenarioEditor/12_architecture.md §3.1, §8,
//       ../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M8
export default defineConfig({
  plugins: [
    solid(),
    cspPlugin(),
    VitePWA({
      registerType: 'prompt',
      // 開発時に SW をオフ (HMR 干渉回避)。本番ビルドのみ有効。
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Scenario Studio',
        short_name: 'ScenarioStudio',
        description: 'Multi-target scenario editor (Phase 1 MVP)',
        lang: 'ja',
        theme_color: '#1f2937',
        background_color: '#f8f9fb',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // ビルド成果物 (precache) — 1 度ロードしたら version 更新まで強キャッシュ。
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // 5 MB を超える bundle は precache しない (Phase 1 MVP では超えない想定)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // index.html — 新ビルドを即時反映するため NetworkFirst
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages-cache',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            // JS/CSS — SWR で起動高速化 + 裏で更新
            urlPattern: ({ request }) =>
              request.destination === 'script' || request.destination === 'style',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'asset-cache',
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // 画像 / フォント — Cache-First (滅多に変わらない)
            urlPattern: ({ request }) =>
              request.destination === 'image' || request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'media-cache',
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
        ],
        // SW 自身を即時 activate (古い SW を待たない)
        clientsClaim: true,
        skipWaiting: false, // ユーザに promptで通知してから更新
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // 動的 import 分割により ScriptPanel / BenchmarkPanel が別 chunk に。
    chunkSizeWarningLimit: 600,
  },
});
