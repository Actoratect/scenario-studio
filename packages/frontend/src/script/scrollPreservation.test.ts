import { describe, expect, it } from 'vitest';
import {
  preserveScrollDuringMutation,
  type ScrollRestoreScheduler,
  type ScrollTarget,
} from './scrollPreservation';

function createScheduler(): {
  scheduler: ScrollRestoreScheduler;
  microtasks: (() => void)[];
  animationFrames: (() => void)[];
  timers: { callback: () => void; delayMs: number }[];
} {
  const microtasks: (() => void)[] = [];
  const animationFrames: (() => void)[] = [];
  const timers: { callback: () => void; delayMs: number }[] = [];
  return {
    microtasks,
    animationFrames,
    timers,
    scheduler: {
      queueMicrotask: (callback) => microtasks.push(callback),
      requestAnimationFrame: (callback) => animationFrames.push(callback),
      setTimeout: (callback, delayMs) => timers.push({ callback, delayMs }),
    },
  };
}

describe('preserveScrollDuringMutation', () => {
  it('restores scroll immediately and after delayed browser layout passes', () => {
    const target: ScrollTarget = { scrollTop: 240, scrollLeft: 12, isConnected: true };
    const { scheduler, microtasks, animationFrames, timers } = createScheduler();

    preserveScrollDuringMutation(
      [target],
      () => {
        target.scrollTop = 0;
        target.scrollLeft = 0;
      },
      scheduler,
    );

    expect(target.scrollTop).toBe(240);
    expect(target.scrollLeft).toBe(12);

    target.scrollTop = 0;
    microtasks.shift()?.();
    expect(target.scrollTop).toBe(240);

    target.scrollTop = 0;
    animationFrames.shift()?.();
    expect(target.scrollTop).toBe(240);

    target.scrollTop = 0;
    animationFrames.shift()?.();
    expect(target.scrollTop).toBe(240);

    expect(timers.map((timer) => timer.delayMs)).toEqual([0, 80]);
    target.scrollTop = 0;
    timers[1]?.callback();
    expect(target.scrollTop).toBe(240);
  });

  it('does not restore disconnected elements', () => {
    const target: ScrollTarget = { scrollTop: 80, scrollLeft: 0, isConnected: false };
    const { scheduler } = createScheduler();

    preserveScrollDuringMutation(
      [target],
      () => {
        target.scrollTop = 0;
      },
      scheduler,
    );

    expect(target.scrollTop).toBe(0);
  });
});
