import { promises as fs } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
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

/**
 * PR-AE: FF7 サンプル (`sample-projects/ff7/`) を仮想 module として bundle。
 * frontend は `import { FF7_SAMPLE } from 'virtual:ff7-sample'` で参照し、
 * Welcome 画面の「FF7 サンプルを開く」が選択フォルダにコピーする。
 *
 * 出力構造: { files: { '<rel-path>': { kind: 'text' | 'binary', text?: string, base64?: string } } }
 * バイナリ (画像など) は base64、それ以外は raw text。
 */
function ff7SamplePlugin(): Plugin {
  const VIRTUAL_ID = 'virtual:ff7-sample';
  const RESOLVED_ID = '\0' + VIRTUAL_ID;
  const SAMPLE_ROOT = join(__dirname, '..', '..', 'sample-projects', 'ff7');
  const TEXT_EXT = new Set(['.yaml', '.yml', '.md', '.txt', '.json']);

  async function build(): Promise<string> {
    type Entry = { kind: 'text'; text: string } | { kind: 'binary'; base64: string };
    const files: Record<string, Entry> = {};
    async function walk(dir: string): Promise<void> {
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const it of items) {
        const full = join(dir, it.name);
        if (it.isDirectory()) {
          await walk(full);
        } else if (it.isFile()) {
          const rel = relative(SAMPLE_ROOT, full).split(sep).join(posix.sep);
          const dot = it.name.lastIndexOf('.');
          const ext = dot >= 0 ? it.name.slice(dot).toLowerCase() : '';
          if (TEXT_EXT.has(ext)) {
            files[rel] = { kind: 'text', text: await fs.readFile(full, 'utf8') };
          } else {
            files[rel] = { kind: 'binary', base64: (await fs.readFile(full)).toString('base64') };
          }
        }
      }
    }
    try {
      await walk(SAMPLE_ROOT);
    } catch (e) {
      // sample-projects/ff7 が無い (CI 等) なら空 manifest
      console.warn('[ff7SamplePlugin] sample dir not found, exporting empty manifest', e);
    }
    return `export const FF7_SAMPLE = ${JSON.stringify({ files })};\n`;
  }

  return {
    name: 'scenario-studio:ff7-sample',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
      return null;
    },
    async load(id) {
      if (id === RESOLVED_ID) return await build();
      return null;
    },
  };
}

// SolidJS + Vite + PWA。
// M8: 本格的なキャッシュ戦略 — JS/CSS は SWR (新版を即座に学習しつつ古版で起動高速化)、
// 画像は Cache-First (めったに変わらない)、index.html は NetworkFirst (新ビルド即反映)。
// 詳細: ../../Documentation/ScenarioEditor/12_architecture.md §3.1, §8,
//       ../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M8
//
// PR-AK: GitHub Pages サブパス配信用に base / PWA scope を VITE_BASE_PATH で
// 切替可能に。dev / Tauri ビルドでは未指定 → '/' のまま。
const BASE_PATH = process.env['VITE_BASE_PATH'] ?? '/';

export default defineConfig({
  base: BASE_PATH,
  plugins: [
    solid(),
    cspPlugin(),
    ff7SamplePlugin(),
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
        start_url: BASE_PATH,
        scope: BASE_PATH,
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
  define: {
    // PR-AF: Help / About 用に build 時刻と version を埋め込む。
    __APP_VERSION__: JSON.stringify(process.env['npm_package_version'] ?? '0.0.0'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
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
