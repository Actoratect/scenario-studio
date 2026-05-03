import { describe, expect, it } from 'vitest';
import { ProjectHistory } from './ProjectHistory.js';
import { nodeId } from '../domain/era.js';
import type { ScenarioNode } from '../domain/node.js';

describe('ProjectHistory', () => {
  function node(id: string, fields: Record<string, string | number>): ScenarioNode {
    return {
      id: nodeId(id),
      templateId: 'template.character',
      slug: id,
      fields,
    };
  }

  it('register returns a NodeFieldStore for that node', () => {
    const h = new ProjectHistory();
    const a = node('a', { x: 1 });
    const store = h.register(a);
    expect(store.get('x')).toBe(1);
    h.destroy();
  });

  it('register on duplicate id returns the same store (no replacement)', () => {
    const h = new ProjectHistory();
    const s1 = h.register(node('a', { x: 1 }));
    const s2 = h.register(node('a', { x: 999 }));
    expect(s1).toBe(s2);
    expect(s2.get('x')).toBe(1); // 元の store の値が残る
    h.destroy();
  });

  it('global undo reverts the last edit across nodes', () => {
    const h = new ProjectHistory();
    const sa = h.register(node('a', { x: 1 }));
    const sb = h.register(node('b', { y: 1 }));

    sa.set('x', 2);
    sb.set('y', 99);
    expect(h.pendingUndo).toBe(2);

    expect(h.undo()).toBe(true);
    expect(sb.get('y')).toBe(1); // 直近編集 (b) が戻る
    expect(sa.get('x')).toBe(2); // a はそのまま

    expect(h.undo()).toBe(true);
    expect(sa.get('x')).toBe(1);

    expect(h.undo()).toBe(false);
    h.destroy();
  });

  it('redo replays the last undone edit (LIFO)', () => {
    const h = new ProjectHistory();
    const sa = h.register(node('a', { x: 1 }));
    const sb = h.register(node('b', { y: 1 }));
    sa.set('x', 2);
    sb.set('y', 99);
    h.undo(); // b: 99 -> 1
    h.undo(); // a: 2 -> 1
    expect(sa.get('x')).toBe(1);
    expect(sb.get('y')).toBe(1);

    expect(h.redo()).toBe(true);
    expect(sa.get('x')).toBe(2);
    expect(h.redo()).toBe(true);
    expect(sb.get('y')).toBe(99);
    expect(h.redo()).toBe(false);
    h.destroy();
  });

  it('new edit after undo clears the redo stack', () => {
    const h = new ProjectHistory();
    const s = h.register(node('a', { x: 1 }));
    s.set('x', 2);
    h.undo();
    expect(h.pendingRedo).toBe(1);
    s.set('x', 3); // 新しい編集
    expect(h.pendingRedo).toBe(0);
    h.destroy();
  });

  it('unregister destroys store and undo skips its missing entries', () => {
    const h = new ProjectHistory();
    const sa = h.register(node('a', { x: 1 }));
    const sb = h.register(node('b', { y: 1 }));
    sa.set('x', 2);
    sb.set('y', 99);
    h.unregister(nodeId('b'));
    // 直近編集が b だが b は消えたので、a の undo にフォールスルー
    expect(h.undo()).toBe(true);
    expect(sa.get('x')).toBe(1);
    h.destroy();
  });
});
