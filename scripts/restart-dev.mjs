#!/usr/bin/env node
// dev server を「楽に再起動」するためのワンコマンド。
// 既存の vite プロセス (5173 を listen している node) を kill してから dev を起動する。
// 使い方: `npm run restart` (どのフォルダからでも可、ルート package.json から呼ばれる)

import { spawn, execSync } from 'node:child_process';
import { platform } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const isWin = platform() === 'win32';

function killOnPort(port) {
  try {
    if (isWin) {
      const out = execSync(`netstat -ano -p tcp | findstr :${port}`, {
        encoding: 'utf8',
      });
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        const m = line.trim().match(/\s(\d+)$/);
        if (m && m[1] !== '0') pids.add(m[1]);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          console.log(`[restart] killed PID ${pid} (port ${port})`);
        } catch {
          /* already gone */
        }
      }
    } else {
      const out = execSync(`lsof -ti :${port}`, { encoding: 'utf8' });
      for (const pid of out.split(/\s+/).filter(Boolean)) {
        try {
          execSync(`kill -9 ${pid}`);
          console.log(`[restart] killed PID ${pid} (port ${port})`);
        } catch {
          /* already gone */
        }
      }
    }
  } catch {
    // listen している process が無いだけなので無視
  }
}

console.log('[restart] vite dev (port 5173) を停止しています...');
killOnPort(5173);

console.log('[restart] vite dev を起動します...');
const child = spawn('npm', ['--prefix', 'packages/frontend', 'run', 'dev'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));

child.on('exit', (code) => process.exit(code ?? 0));
