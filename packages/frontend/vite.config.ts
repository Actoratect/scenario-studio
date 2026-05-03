import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

// SolidJS + Vite。dev server 起動と production build を担当。
// Dockview 等の DOM ライブラリは ESM で読み込むため、CJS interop は使わない。
// 詳細: ../../Documentation/ScenarioEditor/12_architecture.md §3.1
export default defineConfig({
  plugins: [solid()],
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
