import type { FileSystemAdapter, ProjectHandle } from '@scenario-studio/core';

// P1: シーン / ノード削除のソフトデリート化。
// adapter.delete で物理削除する前に、削除対象の内容を `.editor/trash/` へ退避する。
// git を使わない個人ライターにとって削除が完全に不可逆だった問題への対処
// (プロットボードのカード削除は Ctrl+Z で戻せるため、「削除は戻せる」という
//  メンタルモデルが既に学習されており、シーン削除だけ裏切る状態だった)。
//
// 保存形式: 1 エントリ = 1 ファイル。先頭に YAML 風のメタ行 + 区切り行、以降が原文。
//   originalPath: Scenarios/ch1/scene.scn.yaml
//   deletedAt: 2026-07-10T12:34:56.789Z
//   label: 章タイトル / シーンタイトル
//   ---8<---
//   <元ファイルの全文>
// index ファイル方式にしないのは、削除のたびに read-modify-write が要る index は
// 外部エージェントとの並行編集で壊れやすいため (1 エントリ 1 ファイルなら追記だけ)。

const TRASH_DIR = '.editor/trash';
const SEPARATOR = '\n---8<---\n';
/** 直近 N 件だけ保持し、古いものは退避時に自動パージする。 */
const MAX_ENTRIES = 20;

export interface TrashEntry {
  /** `.editor/trash/` 内の退避ファイルパス。 */
  trashPath: string;
  /** 元のプロジェクト相対パス。 */
  originalPath: string;
  /** 退避時刻 (ISO 8601)。 */
  deletedAt: string;
  /** UI 表示用ラベル。 */
  label: string;
}

let seq = 0;

function nextTrashPath(): string {
  seq += 1;
  return `${TRASH_DIR}/${Date.now().toString(36)}-${seq.toString(36)}.trash`;
}

function serializeEntry(originalPath: string, label: string, content: string): string {
  // メタ行は素朴な key: value (originalPath は assertSafePath 済みで改行を含まない)
  return (
    `originalPath: ${originalPath}\n` +
    `deletedAt: ${new Date().toISOString()}\n` +
    `label: ${label.replace(/\r?\n/g, ' ')}` +
    SEPARATOR +
    content
  );
}

function parseEntry(trashPath: string, raw: string): (TrashEntry & { content: string }) | null {
  const sep = raw.indexOf(SEPARATOR);
  if (sep < 0) return null;
  const head = raw.slice(0, sep);
  const content = raw.slice(sep + SEPARATOR.length);
  const meta = new Map<string, string>();
  for (const line of head.split('\n')) {
    const idx = line.indexOf(': ');
    if (idx > 0) meta.set(line.slice(0, idx), line.slice(idx + 2));
  }
  const originalPath = meta.get('originalPath');
  if (!originalPath) return null;
  return {
    trashPath,
    originalPath,
    deletedAt: meta.get('deletedAt') ?? '',
    label: meta.get('label') ?? originalPath,
    content,
  };
}

export const TrashService = {
  /**
   * 削除対象の内容をゴミ箱へ退避する。呼び出し側はこの後に実際の削除を行う。
   * 退避自体が失敗した場合は throw する (退避できないのに削除だけ進むのを防ぐ)。
   */
  async stash(
    adapter: FileSystemAdapter,
    handle: ProjectHandle,
    originalPath: string,
    label: string,
  ): Promise<void> {
    if (!(await adapter.exists(handle, originalPath))) return; // まだ書かれていない = 退避不要
    const content = await adapter.read(handle, originalPath);
    await adapter.write(handle, nextTrashPath(), serializeEntry(originalPath, label, content));
    await TrashService.purgeOld(adapter, handle);
  },

  /** ゴミ箱の一覧 (新しい順)。 */
  async list(adapter: FileSystemAdapter, handle: ProjectHandle): Promise<readonly TrashEntry[]> {
    const paths = await adapter.list(handle, `${TRASH_DIR}/*.trash`);
    const out: TrashEntry[] = [];
    for (const p of paths) {
      try {
        const parsed = parseEntry(p, await adapter.read(handle, p));
        if (parsed) {
          const { content: _content, ...entry } = parsed;
          out.push(entry);
        }
      } catch {
        // 壊れたエントリは一覧から黙って外す (復元対象が無いだけで実害なし)
      }
    }
    return out.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  },

  /**
   * 1 件を元のパスへ復元する。復元先に既にファイルがある場合は上書きしない
   * (呼び出し側が確認してから force を立てる)。復元成功でゴミ箱から消す。
   */
  async restore(
    adapter: FileSystemAdapter,
    handle: ProjectHandle,
    trashPath: string,
    options?: { overwrite?: boolean },
  ): Promise<{ ok: boolean; reason?: 'not-found' | 'exists'; originalPath?: string }> {
    let raw: string;
    try {
      raw = await adapter.read(handle, trashPath);
    } catch {
      return { ok: false, reason: 'not-found' };
    }
    const parsed = parseEntry(trashPath, raw);
    if (!parsed) return { ok: false, reason: 'not-found' };
    if (!options?.overwrite && (await adapter.exists(handle, parsed.originalPath))) {
      return { ok: false, reason: 'exists', originalPath: parsed.originalPath };
    }
    await adapter.write(handle, parsed.originalPath, parsed.content);
    await adapter.delete(handle, trashPath);
    return { ok: true, originalPath: parsed.originalPath };
  },

  /** 上限を超えた古いエントリを削除する。 */
  async purgeOld(adapter: FileSystemAdapter, handle: ProjectHandle): Promise<void> {
    const entries = await TrashService.list(adapter, handle);
    for (const e of entries.slice(MAX_ENTRIES)) {
      try {
        await adapter.delete(handle, e.trashPath);
      } catch {
        // パージ失敗は無害 (次回また試す)
      }
    }
  },
};
