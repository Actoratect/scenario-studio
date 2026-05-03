#!/usr/bin/env node
// Bin script — workspace 内の TS ソースを tsx 経由で直接実行する。
// MVP 用の dev runner: スタンドアロン配布バイナリは Phase 2 で esbuild bundle 化予定。
// vitest 経由の end-to-end テストは src/run.test.ts と src/dev/generate-dogfood.test.ts。
// 詳細: ../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M8

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as nodePath from 'node:path';

const here = nodePath.dirname(fileURLToPath(import.meta.url));
const entry = nodePath.resolve(here, '../src/cli-main.ts');
const tsxBin = nodePath.resolve(here, '../node_modules/.bin/tsx');

const child = spawn(tsxBin, [entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 1));
