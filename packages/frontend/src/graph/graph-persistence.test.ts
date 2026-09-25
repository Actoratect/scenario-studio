import { afterEach, describe, expect, it, vi } from 'vitest';
import { GraphPersistence } from './graph-persistence';
import { SaveStatus } from '../services/SaveStatus';
import { Toast } from '../services/Toast';

afterEach(() => {
  SaveStatus.reset();
  Toast.clear();
  vi.useRealTimers();
});

describe('GraphPersistence', () => {
  it('破棄後に古い保存が失敗しても再試行対象へ戻さない', async () => {
    const queue = new GraphPersistence();
    let reject!: (error: Error) => void;
    queue.schedule(
      'old',
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        }),
      true,
    );
    const nextWrite = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    queue.schedule('pending', nextWrite);
    queue.discardPending();
    reject(new Error('late failure'));
    await queue.flushPending();
    expect(nextWrite).not.toHaveBeenCalled();
    expect(queue.hasPending()).toBe(false);
  });
  it('保存中の変更を順番に書き、古い完了で最新内容を上書きしない', async () => {
    const queue = new GraphPersistence();
    const writes: string[] = [];
    let release!: () => void;
    queue.schedule(
      'project',
      async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        writes.push('old');
      },
      true,
    );
    queue.schedule('project', async () => {
      writes.push('intermediate');
    });
    queue.schedule('project', async () => {
      writes.push('latest');
    });
    expect(queue.hasPending()).toBe(true);
    const flushing = queue.flushPending();
    release();
    expect(await flushing).toEqual({ saved: 2, failed: 0 });
    expect(writes).toEqual(['old', 'latest']);
    expect(queue.hasPending()).toBe(false);
  });

  it('失敗した保存を保持し、別プロジェクトの保存を妨げず再試行する', async () => {
    const queue = new GraphPersistence();
    const old = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValue(undefined);
    const next = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    queue.schedule('old-project', old);
    queue.schedule('new-project', next);
    expect(await queue.flushPending()).toEqual({ saved: 1, failed: 1 });
    expect(queue.hasPending()).toBe(true);
    expect(await queue.flushPending()).toEqual({ saved: 1, failed: 0 });
    expect(queue.hasPending()).toBe(false);
    expect(old).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
