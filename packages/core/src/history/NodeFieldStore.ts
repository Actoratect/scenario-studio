import * as Y from 'yjs';
import type { FieldValue } from '../domain/node.js';

// PoC-H: Yjs CRDT を使ったローカル Undo/Redo の最小ストア。
//
// 設計上の位置付け (12_architecture.md §3.1, 13_roadmap.md PoC-H):
//   - Phase 4 までは **ローカル Undo/Redo の中核** として活用 (一般的な Command スタックより
//     spans 操作のスコープ管理が安定)。
//   - Phase X (SaaS) でリアルタイム共著への布石 (Y.Doc を WebSocket で同期するだけで
//     差分マージ完備)。
//
// 詳細: ../../../../Documentation/ScenarioEditor/13_roadmap.md PoC-H,
//       ../../../../Documentation/ScenarioEditor/12_architecture.md §3.1, §6.1

export type NodeFieldChangeOrigin = symbol;

export interface NodeFieldChangeEvent {
  /** 今回の transact で値が変わった key 集合。 */
  readonly changedKeys: ReadonlySet<string>;
  /**
   * 変更元の origin。`set()/delete()` 経由なら NodeFieldStore のローカル symbol、
   * `applyUpdate()` 経由 (= 外部 Y.Update) なら "remote" symbol。
   */
  readonly origin: NodeFieldChangeOrigin;
}

const REMOTE_ORIGIN: NodeFieldChangeOrigin = Symbol('NodeFieldStore.remote');

export class NodeFieldStore {
  /** 内部 Y.Doc。同期したければ encodeStateAsUpdate() / applyUpdate() を使う。 */
  readonly doc: Y.Doc;
  /** Undo/Redo 履歴。public にしておくので、UI 側で size 監視や clear() も可能。 */
  readonly undoManager: Y.UndoManager;

  private readonly fields: Y.Map<FieldValue>;
  private readonly localOrigin: NodeFieldChangeOrigin;
  private readonly listeners = new Set<(event: NodeFieldChangeEvent) => void>();

  constructor(initialFields: { readonly [key: string]: FieldValue } = {}) {
    this.doc = new Y.Doc();
    this.fields = this.doc.getMap<FieldValue>('fields');
    this.localOrigin = Symbol('NodeFieldStore.local');

    // 初期 fields の流し込みは undo 対象から外したい (起動時に Ctrl+Z で空 map に戻ると驚くため)。
    // localOrigin と区別された symbol で transact し、UndoManager の trackedOrigins に含めない。
    const seedOrigin = Symbol('NodeFieldStore.seed');
    this.doc.transact(() => {
      for (const [k, v] of Object.entries(initialFields)) {
        this.fields.set(k, v);
      }
    }, seedOrigin);

    this.undoManager = new Y.UndoManager(this.fields, {
      trackedOrigins: new Set([this.localOrigin]),
    });

    this.fields.observe((event, transaction) => {
      const origin: NodeFieldChangeOrigin =
        transaction.origin === this.localOrigin ? this.localOrigin : REMOTE_ORIGIN;
      const changedKeys: Set<string> = new Set(event.keysChanged);
      for (const cb of this.listeners) {
        cb({ changedKeys, origin });
      }
    });
  }

  /** 現在の fields を plain object として返す (resolveNode への入力に使える)。 */
  toRecord(): { readonly [key: string]: FieldValue } {
    return this.fields.toJSON() as { readonly [key: string]: FieldValue };
  }

  get(key: string): FieldValue | undefined {
    return this.fields.get(key);
  }

  /**
   * key を value で上書き。trackedOrigins により Undo 対象になる。
   * 同一 transaction 内の複数 set は 1 アクションとしてまとめて undo される。
   */
  set(key: string, value: FieldValue): void {
    this.doc.transact(() => this.fields.set(key, value), this.localOrigin);
  }

  /** key を削除。 */
  delete(key: string): void {
    this.doc.transact(() => this.fields.delete(key), this.localOrigin);
  }

  /**
   * 複数 set/delete を 1 アクションにまとめる。
   * @example store.batch(() => { store.set('a', 1); store.set('b', 2); }) — Ctrl+Z 1 回で両方戻る
   */
  batch(mutator: () => void): void {
    this.doc.transact(mutator, this.localOrigin);
  }

  undo(): boolean {
    return this.undoManager.undo() !== null;
  }

  redo(): boolean {
    return this.undoManager.redo() !== null;
  }

  /**
   * UndoManager の captureTimeout (default 500ms) で連続 set が 1 アクションにまとめられる。
   * UI 側で「明示的な区切り」(例: フォーカス変更、別フィールドへ移動) を境界にしたい時に呼ぶ。
   * 直後の set は新しい undo step を作る。
   */
  markUndoBoundary(): void {
    this.undoManager.stopCapturing();
  }

  /** 監視を解除する関数を返す。 */
  observe(listener: (event: NodeFieldChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 外部から流れてきた Y.Update を取り込む (Phase X SaaS / マルチタブ同期で利用)。 */
  applyUpdate(update: Uint8Array): void {
    Y.applyUpdate(this.doc, update, REMOTE_ORIGIN);
  }

  /** 現在の状態を Y.Update で吐き出す (永続化や同期相手への送信用)。 */
  encodeState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  destroy(): void {
    this.undoManager.destroy();
    this.doc.destroy();
    this.listeners.clear();
  }

  static get REMOTE_ORIGIN(): NodeFieldChangeOrigin {
    return REMOTE_ORIGIN;
  }
}
