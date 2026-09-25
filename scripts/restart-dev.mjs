#!/usr/bin/env node
// このワークスペースの Vite listener だけを停止し、開発サーバを起動する。
import { spawn, execFileSync } from 'node:child_process';
import { platform } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { isWorkspaceVite } from './dev-processes.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWin = platform() === 'win32';

function listeners() {
  if (isWin) {
    const script = [
      '$ErrorActionPreference = "Stop"',
      '$ids = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -ge 5173 -and $_.LocalPort -le 5180 } | Select-Object -ExpandProperty OwningProcess -Unique)',
      '@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -in $ids } | Select-Object ProcessId, CommandLine) | ConvertTo-Json -Compress',
    ].join('\n');
    const raw = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        encoding: 'utf8',
        windowsHide: true,
      },
    ).trim();
    const result = raw ? JSON.parse(raw) : [];
    return (Array.isArray(result) ? result : [result]).map((p) => ({
      pid: Number(p.ProcessId),
      command: p.CommandLine ?? '',
    }));
  }
  let output;
  try {
    output = execFileSync('lsof', ['-nP', '-sTCP:LISTEN', '-tiTCP:5173-5180'], {
      encoding: 'utf8',
    });
  } catch (error) {
    if (error.status === 1) return [];
    throw error;
  }
  return [...new Set(output.split(/\s+/).filter(Boolean))].map((pid) => ({
    pid: Number(pid),
    command: execFileSync('ps', ['-p', pid, '-o', 'command='], { encoding: 'utf8' }),
  }));
}

try {
  for (const { pid, command } of listeners()) {
    if (!Number.isSafeInteger(pid) || pid <= 0 || !isWorkspaceVite(command, root)) continue;
    try {
      process.kill(pid);
      console.log(`[restart] stopped workspace Vite (PID ${pid})`);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
} catch (error) {
  console.error(`[restart] Could not inspect/stop the workspace server: ${error.message}`);
  process.exit(1);
}

if (!process.argv.includes('--stop-only')) {
  const child = spawn(
    process.execPath,
    [resolve(root, 'packages/frontend/node_modules/vite/bin/vite.js'), '--open'],
    {
      cwd: resolve(root, 'packages/frontend'),
      stdio: 'inherit',
      windowsHide: true,
    },
  );
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? 0;
  });
}
