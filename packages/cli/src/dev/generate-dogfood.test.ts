import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as nodePath from 'node:path';
import { generateDogfoodProject } from './generate-dogfood.js';
import { stats } from '../commands/stats.js';
import { validate } from '../commands/validate.js';

// dogfood fixture を縮小サイズで生成 → CLI commands で検証する end-to-end smoke。
// 実際のドッグフード (50 / 30 / 5,000) は CI 時間節約のため使わず、ローカル手動。

describe('generateDogfoodProject (smoke)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(nodePath.join(tmpdir(), 'dogfood-smoke-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('generates a project that validate + stats can read', async () => {
    await generateDogfoodProject({
      outDir: dir,
      characters: 4,
      locations: 2,
      items: 1,
      factions: 1,
      chapters: 2,
      scenesPerChapter: 2,
      linesPerScene: 6,
    });

    const v = await validate({ projectPath: dir, format: 'json' });
    // info-only (orphan) は許容、error が無ければ exit 0
    expect(v.exitCode).toBe(0);

    const s = await stats({ projectPath: dir, format: 'json' });
    expect(s.report.nodeCount).toBe(8); // 4+2+1+1
    expect(s.report.chapterCount).toBe(2);
    expect(s.report.sceneCount).toBe(4); // 2 chapters * 2 scenes
    expect(s.report.totalCharacters).toBeGreaterThan(0);
  });
});
