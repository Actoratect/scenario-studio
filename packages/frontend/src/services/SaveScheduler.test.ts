import { describe, expect, it, vi } from 'vitest';
import { SaveScheduler } from './SaveScheduler.js';
import { nodeId } from '@scenario-studio/core';

// PR (ux-overhaul): 自動 debounce flush は廃止し、手動 flush ベースに変更。
// schedule() は dirty マークだけ、flush は flushAll() / flushNow() 呼び出し時のみ走る。

describe('SaveScheduler (manual mode)', () => {
  it('schedule does not auto-flush', () => {
    const flush = vi.fn();
    const s = new SaveScheduler({ flush });
    s.schedule(nodeId('a'));
    expect(flush).not.toHaveBeenCalled();
    expect(s.pendingCount).toBe(1);
  });

  it('multiple schedules collapse into single dirty entry', () => {
    const flush = vi.fn();
    const s = new SaveScheduler({ flush });
    s.schedule(nodeId('a'));
    s.schedule(nodeId('a'));
    expect(s.pendingCount).toBe(1);
  });

  it('schedules per-node are independent', () => {
    const flush = vi.fn();
    const s = new SaveScheduler({ flush });
    s.schedule(nodeId('a'));
    s.schedule(nodeId('b'));
    expect(s.pendingCount).toBe(2);
    expect(s.pendingIds()).toContain(nodeId('a'));
    expect(s.pendingIds()).toContain(nodeId('b'));
  });

  it('flushNow runs the handler and clears dirty (sync)', () => {
    const flush = vi.fn();
    const s = new SaveScheduler({ flush });
    s.schedule(nodeId('a'));
    s.flushNow(nodeId('a'));
    expect(flush).toHaveBeenCalledOnce();
    expect(s.pendingCount).toBe(0);
  });

  it('flushAll empties all pending (sync)', () => {
    const flush = vi.fn();
    const s = new SaveScheduler({ flush });
    s.schedule(nodeId('a'));
    s.schedule(nodeId('b'));
    s.schedule(nodeId('c'));
    expect(s.pendingCount).toBe(3);
    s.flushAll();
    expect(flush).toHaveBeenCalledTimes(3);
    expect(s.pendingCount).toBe(0);
  });

  it('destroy clears dirty without flushing', () => {
    const flush = vi.fn();
    const s = new SaveScheduler({ flush });
    s.schedule(nodeId('a'));
    s.destroy();
    expect(flush).not.toHaveBeenCalled();
    expect(s.pendingCount).toBe(0);
  });

  it('forwards async flush errors to onError', async () => {
    const onError = vi.fn();
    const flush = vi.fn(() => Promise.reject(new Error('boom')));
    const s = new SaveScheduler({ flush, onError });
    s.schedule(nodeId('a'));
    s.flushNow(nodeId('a'));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(nodeId('a'), expect.any(Error));
  });

  it('keeps edits made while an asynchronous save is running', async () => {
    let complete!: () => void;
    const flush = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const s = new SaveScheduler({ flush });
    s.schedule(nodeId('a'));
    const pending = s.flushAllAsync();
    s.schedule(nodeId('a'));
    complete();
    expect(await pending).toMatchObject({ saved: 1, failed: 0 });
    expect(s.pendingIds()).toEqual([nodeId('a')]);
    const next = s.flushAllAsync();
    complete();
    await next;
    expect(s.pendingCount).toBe(0);
  });

  it('shares an in-flight save between repeated save commands', async () => {
    let complete!: () => void;
    const flush = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const s = new SaveScheduler({ flush });
    s.schedule(nodeId('a'));
    s.flushNow(nodeId('a'));
    const pending = s.flushAllAsync();
    expect(flush).toHaveBeenCalledOnce();
    complete();
    await pending;
    expect(s.pendingCount).toBe(0);
  });

  it('retains failed and skipped writes and reports them separately', async () => {
    const onError = vi.fn();
    const s = new SaveScheduler({
      onError,
      flush: (id) => {
        if (id === nodeId('failed')) throw new Error('disk unavailable');
        if (id === nodeId('skipped')) return 'skipped';
      },
    });
    for (const id of ['saved', 'failed', 'skipped']) s.schedule(nodeId(id));
    expect(await s.flushAllAsync()).toEqual({
      saved: 1,
      failed: 1,
      skipped: 1,
      errors: ['disk unavailable'],
    });
    expect(s.pendingIds()).toEqual([nodeId('failed'), nodeId('skipped')]);
  });
});
