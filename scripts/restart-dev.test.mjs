import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWorkspaceVite } from './dev-processes.mjs';

test('このプロジェクトの Vite だけを停止対象にする', () => {
  const root = 'D:\\Works\\Scenario Studio';
  assert.equal(
    isWorkspaceVite(
      'node "D:\\Works\\Scenario Studio\\packages\\frontend\\node_modules\\vite\\bin\\vite.js" --open',
      root,
    ),
    true,
  );
  assert.equal(
    isWorkspaceVite(
      'node D:/Works/Scenario Studio/node_modules/.pnpm/vite@5/node_modules/vite/bin/vite.js',
      root,
    ),
    true,
  );
  assert.equal(isWorkspaceVite('node D:/Other/node_modules/vite/bin/vite.js', root), false);
  assert.equal(isWorkspaceVite('chrome.exe --url=http://localhost:5173', root), false);
  assert.equal(
    isWorkspaceVite(
      'node D:/Works/Scenario Studio/packages/frontend/node_modules/other/server.js',
      root,
    ),
    false,
  );
  assert.equal(
    isWorkspaceVite(
      'node /srv/studio/packages/frontend/node_modules/vite/bin/vite.js',
      '/srv/studio',
    ),
    true,
  );
  assert.equal(
    isWorkspaceVite(
      'node /srv/studio-other/packages/frontend/node_modules/vite/bin/vite.js',
      '/srv/studio',
    ),
    false,
  );
});
