export interface ScrollTarget {
  scrollTop: number;
  scrollLeft: number;
  isConnected?: boolean;
}

export interface ScrollSnapshot<T extends ScrollTarget = ScrollTarget> {
  element: T;
  top: number;
  left: number;
}

export interface ScrollRestoreScheduler {
  queueMicrotask(callback: () => void): void;
  requestAnimationFrame(callback: () => void): void;
  setTimeout(callback: () => void, delayMs: number): void;
}

function defaultScheduler(): ScrollRestoreScheduler {
  return {
    queueMicrotask: (callback) => queueMicrotask(callback),
    requestAnimationFrame: (callback) => requestAnimationFrame(callback),
    setTimeout: (callback, delayMs) => {
      window.setTimeout(callback, delayMs);
    },
  };
}

export function captureScrollSnapshots<T extends ScrollTarget>(
  elements: readonly (T | null | undefined)[],
): ScrollSnapshot<T>[] {
  const out: ScrollSnapshot<T>[] = [];
  for (const element of elements) {
    if (!element) continue;
    if (out.some((snapshot) => snapshot.element === element)) continue;
    out.push({
      element,
      top: element.scrollTop,
      left: element.scrollLeft,
    });
  }
  return out;
}

export function restoreScrollSnapshots(snapshots: readonly ScrollSnapshot[]): void {
  for (const snapshot of snapshots) {
    if (snapshot.element.isConnected === false) continue;
    snapshot.element.scrollTop = snapshot.top;
    snapshot.element.scrollLeft = snapshot.left;
  }
}

export function preserveScrollDuringMutation<T extends ScrollTarget>(
  elements: readonly (T | null | undefined)[],
  run: () => void,
  scheduler: ScrollRestoreScheduler = defaultScheduler(),
): void {
  const snapshots = captureScrollSnapshots(elements);
  run();
  if (snapshots.length === 0) return;

  const restore = () => restoreScrollSnapshots(snapshots);
  restore();
  scheduler.queueMicrotask(restore);
  scheduler.requestAnimationFrame(() => {
    restore();
    scheduler.requestAnimationFrame(restore);
  });
  scheduler.setTimeout(restore, 0);
  scheduler.setTimeout(restore, 80);
}
