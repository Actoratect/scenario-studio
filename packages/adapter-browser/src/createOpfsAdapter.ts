import type { ProjectHandle } from '@scenario-studio/core';
import { BrowserFileSystemAdapter } from './BrowserFileSystemAdapter.js';

// Origin Private File System (OPFS) を root にする factory。
// FS Access API 未対応の Safari / Firefox 用 fallback (16_security.md §2)。
// 詳細: ../../../Documentation/ScenarioEditor/15_cross-platform.md

export async function createOpfsAdapter(
  projectName: string,
): Promise<{ adapter: BrowserFileSystemAdapter; handle: ProjectHandle }> {
  const opfsRoot = await navigator.storage.getDirectory();
  // OPFS は origin 全体で 1 つなので、project ごとに subdir を切る
  const projectRoot = await opfsRoot.getDirectoryHandle(`project_${slugify(projectName)}`, {
    create: true,
  });
  const adapter = new BrowserFileSystemAdapter();
  const handle = adapter.register(projectRoot, projectName);
  return { adapter, handle };
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'unnamed'
  );
}
