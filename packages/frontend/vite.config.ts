import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { VitePWA } from 'vite-plugin-pwa';

// SolidJS + Vite + PWA。
// PWA は M1 で skeleton (manifest + service worker registration) を入れ、
// 本格的なキャッシュ戦略 (Stale-While-Revalidate / Cache-First) は M8 で詳細化。
// 詳細: ../../Documentation/ScenarioEditor/12_architecture.md §3.1, §8,
//       ../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M1, M8
export default defineConfig({
  plugins: [
    solid(),
    VitePWA({
      registerType: 'prompt',
      // M8 で生成戦略を詳細化。M1 では generateSW のデフォルト + minimal manifest。
      manifest: {
        name: 'Scenario Studio',
        short_name: 'ScenarioStudio',
        description: 'Multi-target scenario editor (Phase 1 MVP)',
        lang: 'ja',
        theme_color: '#1f2937',
        background_color: '#f8f9fb',
        display: 'standalone',
        // M8 で実 icon に差替。今は sandbox 用に空配列でも動くが、最小 1 件は欲しい
        icons: [],
      },
      workbox: {
        // M8 で本格化。今は SW を登録するだけで実キャッシュは置かない (空 globPatterns)。
        globPatterns: [],
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
    // chunk size 警告閾値は M8 で再調整。
    chunkSizeWarningLimit: 600,
  },
});
