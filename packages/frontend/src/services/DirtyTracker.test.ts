import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DirtyTracker, type SaveResult } from './DirtyTracker';

function deferred() {
  let resolve!: (result?: SaveResult) => void;
  const promise = new Promise<SaveResult>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('DirtyTracker', () => {
  beforeEach(() => DirtyTracker.reset());

  it('retains a newer edit after the old version finishes saving', async () => {
    const write = deferred();
    DirtyTracker.mark({ key: 'scene', label: 'scene', saveFn: () => write.promise });
    const saving = DirtyTracker.flushAll();
    await Promise.resolve();
    const latest = vi.fn();
    DirtyTracker.mark({ key: 'scene', label: 'scene', saveFn: latest });
    write.resolve();
    expect(await saving).toMatchObject({ saved: 1 });
    expect(DirtyTracker.count()).toBe(1);
    await DirtyTracker.flushAll();
    expect(latest).toHaveBeenCalledOnce();
    expect(DirtyTracker.count()).toBe(0);
  });

  it('coalesces repeated commands for the same version', async () => {
    const write = deferred();
    const saveFn = vi.fn(() => write.promise);
    DirtyTracker.mark({ key: 'scene', label: 'scene', saveFn });
    const first = DirtyTracker.flushAll();
    const second = DirtyTracker.flushAll();
    await Promise.resolve();
    expect(saveFn).toHaveBeenCalledOnce();
    write.resolve();
    await Promise.all([first, second]);
    expect(DirtyTracker.count()).toBe(0);
  });

  it('serializes different versions of the same file', async () => {
    const write = deferred();
    const order: string[] = [];
    DirtyTracker.mark({
      key: 'scene',
      label: 'scene',
      saveFn: async () => {
        await write.promise;
        order.push('old');
      },
    });
    const first = DirtyTracker.flushAll();
    DirtyTracker.mark({
      key: 'scene',
      label: 'scene',
      saveFn: () => {
        order.push('new');
      },
    });
    const second = DirtyTracker.flushAll();
    expect(order).toEqual([]);
    write.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(['old', 'new']);
    expect(DirtyTracker.count()).toBe(0);
  });

  it('preserves a new project entry when an earlier project write completes', async () => {
    const write = deferred();
    DirtyTracker.mark({ key: 'scene', label: 'old project', saveFn: () => write.promise });
    const saving = DirtyTracker.flushAll();
    await Promise.resolve();
    DirtyTracker.reset();
    DirtyTracker.mark({ key: 'scene', label: 'new project', saveFn: vi.fn() });
    write.resolve();
    await saving;
    expect(DirtyTracker.dirty().get('scene')?.label).toBe('new project');
  });

  it('serializes script and plot writes even when separate save commands overlap', async () => {
    const write = deferred();
    const order: string[] = [];
    DirtyTracker.mark({
      key: 'scene',
      label: 'script',
      saveFn: async () => {
        await write.promise;
        order.push('script');
      },
    });
    DirtyTracker.mark({
      key: 'scene\u0000plot',
      label: 'plot',
      saveFn: () => {
        order.push('plot');
      },
    });
    const script = DirtyTracker.flushAll(['scene']);
    const plot = DirtyTracker.flushAll(['scene\u0000plot']);
    await Promise.resolve();
    expect(order).toEqual([]);
    write.resolve();
    await Promise.all([script, plot]);
    expect(order).toEqual(['script', 'plot']);
  });

  it('flushes only selected keys and retains failed or skipped entries', async () => {
    DirtyTracker.mark({ key: 'other', label: 'other', saveFn: vi.fn() });
    DirtyTracker.mark({ key: 'skip', label: 'skip', saveFn: () => 'skipped' });
    DirtyTracker.mark({
      key: 'fail',
      label: 'fail',
      saveFn: () => {
        throw new Error('read only');
      },
    });
    expect(await DirtyTracker.flushAll(['skip', 'fail'])).toEqual({
      saved: 0,
      failed: 1,
      skipped: 1,
      errors: ['fail: read only'],
    });
    expect(DirtyTracker.count()).toBe(3);
  });
});
