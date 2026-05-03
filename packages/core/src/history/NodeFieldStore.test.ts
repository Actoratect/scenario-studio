import { afterEach, describe, expect, it } from 'vitest';
import { NodeFieldStore } from './NodeFieldStore.js';

describe('NodeFieldStore', () => {
  let store: NodeFieldStore | undefined;
  afterEach(() => {
    store?.destroy();
    store = undefined;
  });

  it('initial fields are loaded as the starting state', () => {
    store = new NodeFieldStore({ a: 'x', b: 42 });
    expect(store.toRecord()).toEqual({ a: 'x', b: 42 });
    expect(store.get('a')).toBe('x');
    expect(store.get('missing')).toBeUndefined();
  });

  it('set updates the field and is reflected in toRecord', () => {
    store = new NodeFieldStore({ a: 'x' });
    store.set('a', 'y');
    expect(store.toRecord()).toEqual({ a: 'y' });
  });

  it('delete removes the field', () => {
    store = new NodeFieldStore({ a: 'x', b: 1 });
    store.delete('a');
    expect(store.toRecord()).toEqual({ b: 1 });
  });

  it('undo reverts the latest set', () => {
    store = new NodeFieldStore({ a: 'x' });
    store.set('a', 'y');
    expect(store.undo()).toBe(true);
    expect(store.get('a')).toBe('x');
  });

  it('redo replays the undone set', () => {
    store = new NodeFieldStore({ a: 'x' });
    store.set('a', 'y');
    store.undo();
    expect(store.redo()).toBe(true);
    expect(store.get('a')).toBe('y');
  });

  it('undo across multiple edits is LIFO when boundaries are marked', () => {
    // Yjs UndoManager は captureTimeout (default 500ms) で連続 set を 1 step に纏める。
    // 明示的に markUndoBoundary() で区切れば独立した undo step になる。
    store = new NodeFieldStore({ a: '0' });
    store.set('a', '1');
    store.markUndoBoundary();
    store.set('a', '2');
    store.markUndoBoundary();
    store.set('a', '3');
    expect(store.undo()).toBe(true); // -> '2'
    expect(store.get('a')).toBe('2');
    expect(store.undo()).toBe(true); // -> '1'
    expect(store.get('a')).toBe('1');
    expect(store.undo()).toBe(true); // -> '0'
    expect(store.get('a')).toBe('0');
    expect(store.undo()).toBe(false); // 空履歴
  });

  it('without boundary, fast successive sets collapse into one undo step', () => {
    // captureTimeout の挙動を明示的に検証。UI で「タイピング中は 1 step」を実現するため。
    store = new NodeFieldStore({ a: '0' });
    store.set('a', '1');
    store.set('a', '2');
    store.set('a', '3');
    expect(store.undo()).toBe(true);
    expect(store.get('a')).toBe('0'); // 一気に最初に戻る
    expect(store.undo()).toBe(false);
  });

  it('initial seed is NOT undoable', () => {
    // 初期 fields 投入は seedOrigin で行うため Undo の対象に入らない。
    // ユーザが起動直後に Ctrl+Z しても空マップに戻らないことを保証する。
    store = new NodeFieldStore({ a: 'x', b: 'y' });
    expect(store.undo()).toBe(false);
    expect(store.toRecord()).toEqual({ a: 'x', b: 'y' });
  });

  it('batch groups multiple sets into one undo action', () => {
    store = new NodeFieldStore({});
    store.batch(() => {
      store!.set('a', 1);
      store!.set('b', 2);
      store!.set('c', 3);
    });
    expect(store.toRecord()).toEqual({ a: 1, b: 2, c: 3 });
    expect(store.undo()).toBe(true);
    // 1 アクションでまとめて消える
    expect(store.toRecord()).toEqual({});
  });

  it('observe fires after a local set with origin = local', () => {
    store = new NodeFieldStore({ a: 'x' });
    const events: Array<{ keys: string[]; isLocal: boolean }> = [];
    const localOriginIsNotRemote = (origin: symbol): boolean =>
      origin !== NodeFieldStore.REMOTE_ORIGIN;
    const dispose = store.observe((e) => {
      events.push({ keys: [...e.changedKeys], isLocal: localOriginIsNotRemote(e.origin) });
    });
    store.set('a', 'y');
    store.set('b', 'z');
    expect(events).toEqual([
      { keys: ['a'], isLocal: true },
      { keys: ['b'], isLocal: true },
    ]);
    dispose();
  });

  it('observe stops firing after dispose', () => {
    store = new NodeFieldStore({});
    let count = 0;
    const dispose = store.observe(() => count++);
    store.set('a', 1);
    expect(count).toBe(1);
    dispose();
    store.set('a', 2);
    expect(count).toBe(1);
  });

  it('applyUpdate from another store is observable as remote and not tracked by undo', () => {
    // SaaS 同期 / マルチタブのリアル想定: 片方を canonical にして、もう片方は applyUpdate で受ける。
    // 両方を独立に seed すると Y.Doc の client ID が異なり conflict resolution の結果が
    // 非決定的になるため、b は空 store にして a から sync させる。
    const a = new NodeFieldStore({ x: 1 });
    const b = new NodeFieldStore();
    try {
      // 初期 sync: b は a の state を取り込む
      b.applyUpdate(a.encodeState());
      expect(b.get('x')).toBe(1);

      const events: Array<{ isRemote: boolean }> = [];
      b.observe((e) => events.push({ isRemote: e.origin === NodeFieldStore.REMOTE_ORIGIN }));

      a.set('x', 99);
      b.applyUpdate(a.encodeState());

      expect(b.get('x')).toBe(99);
      expect(events.some((e) => e.isRemote)).toBe(true);
      // remote-applied の変更は undo 対象に入らない
      expect(b.undo()).toBe(false);
    } finally {
      a.destroy();
      b.destroy();
    }
  });
});
