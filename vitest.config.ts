import { defineConfig } from 'vitest/config';

// Workspace 全体の `*.test.ts` を一括収集。Vitest 2.x の単一 config モード。
// 個別 package で jsdom 等の環境が必要になったら projects 機能に切替。
// 詳細: ../Documentation/ScenarioEditor/12_architecture.md §10
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.{ts,tsx}'],
    passWithNoTests: false,
  },
});
