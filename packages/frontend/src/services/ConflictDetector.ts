import type { FileSystemAdapter, ProjectHandle } from '@scenario-studio/core';

// PR-AH: Auto-save 競合検知。
// 「前回 自分が書いた内容」を path ごとに記憶しておき、次回 save 直前に
// 現在の disk 上の内容と比較。一致しない (= 外部ツールが書き換えた) なら
// 上書き前にユーザに確認 prompt を出す。
//
// 詳細: ../../../../Documentation/ScenarioEditor/12_architecture.md §9.3 (concurrent edit)
//
// 限界:
//   - file の作成は知らない (snapshot 無しなので check 通過 → 上書き)
//   - 連続編集中に外部書き換え → 内部 buffer と diff が出るが、
//     conflict の判定は「最後の self-write 内容」基準
//   - mtime ベースより遅い (毎回 1 read を増やす) が、ノード単位で 500ms
//     debounce + 通常 < 1KB の YAML なので影響 < 数 ms
//
// 設計判断:
//   - "external modification ignored" を選ぶ既存ツール (VSCode の hot exit)
//     と違い、シナリオ作成は手元 git 履歴と並行作業が多い前提。
//   - confirm() で同期的に止めて UX を破壊するのは積極的な判断:
//     "気付かず上書き" の方が遥かに痛手。

const snapshots = new Map<string, string>(); // key: handle.id::path

function key(handle: ProjectHandle, path: string): string {
  return `${handle.id}::${path}`;
}

export const ConflictDetector = {
  /**
   * 書き込み直前に呼ぶ。snapshot が無い (初回) または disk 内容と一致するなら true。
   * disk が snapshot から drift していたら window.confirm で OK/Cancel を返す。
   */
  async checkBeforeWrite(
    adapter: FileSystemAdapter,
    handle: ProjectHandle,
    path: string,
  ): Promise<boolean> {
    const snap = snapshots.get(key(handle, path));
    if (snap === undefined) return true; // never wrote here, no conflict possible
    if (!(await adapter.exists(handle, path))) return true; // file deleted externally → write recreates
    let onDisk: string;
    try {
      onDisk = await adapter.read(handle, path);
    } catch {
      // read 失敗時は黙って書く (read 不能は別問題として後続が拾う)
      return true;
    }
    if (onDisk === snap) return true;
    // 競合: ユーザに判断を仰ぐ
    return window.confirm(
      `${path} は外部で変更されています。\n` +
        `\n` +
        `[OK] 自分の変更で上書きする\n` +
        `[キャンセル] 保存を中止 (外部変更を温存、リロードで取り込み)`,
    );
  },

  /** 書き込み成功後に呼ぶ。「次に check したときの基準」になる。 */
  recordSnapshot(handle: ProjectHandle, path: string, content: string): void {
    snapshots.set(key(handle, path), content);
  },

  /** project close 時に呼ぶ (handle が再利用されないので memory leak 防止)。 */
  clear(handle: ProjectHandle): void {
    const prefix = `${handle.id}::`;
    for (const k of Array.from(snapshots.keys())) {
      if (k.startsWith(prefix)) snapshots.delete(k);
    }
  },

  /** テスト / 全消去 */
  _clearAll(): void {
    snapshots.clear();
  },
};
