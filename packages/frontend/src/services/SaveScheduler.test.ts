import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveScheduler } from './SaveScheduler.js';
import { nodeId } from '@scenario-studio/core';

describe('SaveScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('flushes after debounceMs idle', () => {
    const flush = vi.fn();
    const s = new SaveScheduler({ debounceMs: 500, flush });
    s.schedule(nodeId('a'));
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(499);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledOnce();
    expect(flush).toHaveBeenCalledWith(nodeId('a'));
  });

  it('multiple schedules within debounceMs collapse into one flush', () => {
    const flush = vi.fn();
    const s = new SaveScheduler({ debounceMs: 500, flush });
    s.schedule(nodeId('a'));
    vi.advanceTimersByTime(200);
    s.schedule(nodeId('a')); // reset timer
    vi.advanceTimersByTime(400);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(flush).toHaveBeenCalledOnce();
  });

  it('schedules per-node are independent', () => {
    const flush = vi.fn();
    const s = new SaveScheduler({ debounceMs: 500, flush });
    s.schedule(nodeId('a'));
    vi.advanceTimersByTime(100);
    s.schedule(nodeId('b'));
    vi.advanceTimersByTime(400); // a の 500ms 経過
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(nodeId('a'));
    vi.advanceTimersByTime(100); // b の 500ms 経過
    expect(flush).toHaveBeenCalledTimes(2);
    expect(flush).toHaveBeenLastCalledWith(nodeId('b'));
  });

  it('flushNow runs immediately and clears the timer', () => {
    const flush = vi.fn();
    const s = new SaveScheduler({ debounceMs: 500, flush });
    s.schedule(nodeId('a'));
    s.flushNow(nodeId('a'));
    expect(flush).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1000);
    expect(flush).toHaveBeenCalledOnce(); // 二度走らない
  });

  it('flushAll empties all pending', () => {
    const flush = vi.fn();
    const s = new SaveScheduler({ debounceMs: 500, flush });
    s.schedule(nodeId('a'));
    s.schedule(nodeId('b'));
    s.schedule(nodeId('c'));
    expect(s.pendingCount).toBe(3);
    s.flushAll();
    expect(flush).toHaveBeenCalledTimes(3);
    expect(s.pendingCount).toBe(0);
  });

  it('destroy cancels pending timers without flushing', () => {
    const flush = vi.fn();
    const s = new SaveScheduler({ debounceMs: 500, flush });
    s.schedule(nodeId('a'));
    s.destroy();
    vi.advanceTimersByTime(1000);
    expect(flush).not.toHaveBeenCalled();
    expect(s.pendingCount).toBe(0);
  });

  it('forwards async flush errors to onError', async () => {
    const onError = vi.fn();
    const flush = vi.fn(() => Promise.reject(new Error('boom')));
    const s = new SaveScheduler({ debounceMs: 100, flush, onError });
    s.schedule(nodeId('a'));
    vi.advanceTimersByTime(100);
    // microtask flush
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(nodeId('a'), expect.any(Error));
  });
});
