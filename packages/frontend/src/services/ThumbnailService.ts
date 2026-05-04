import { createSignal } from 'solid-js';
import type { NodeId, ScenarioNode } from '@scenario-studio/core';
import { ProjectService } from './ProjectService';
import { Toast } from './Toast';

// ノードサムネイル管理 (PR-Q)。
// - File / Blob を Media/<slug>.<ext> として保存
// - ScenarioNode.thumbnail にパスを書く + NodeRepository.save
// - 表示用に object URL の cache を持つ (revoke は project close 時)
// 詳細: ../../../../Documentation/ScenarioEditor/03_data-model.md

const SUPPORTED_EXT: ReadonlyMap<string, string> = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
  ['image/svg+xml', 'svg'],
]);

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB

const [urlCache, setUrlCache] = createSignal<ReadonlyMap<string, string>>(new Map());

function cacheKey(handleId: string, path: string): string {
  return `${handleId}::${path}`;
}

export const ThumbnailService = {
  /**
   * File から画像を Media/ に保存し、node.thumbnail を更新。
   * 拡張子は MIME type から決定 (svg / png / jpg / webp / gif のみ)。
   */
  async uploadForNode(node: ScenarioNode, file: File | Blob, originalName?: string): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    if (file.size > MAX_BYTES) {
      Toast.error(`画像が大きすぎます (${(file.size / 1024 / 1024).toFixed(1)} MB > 4 MB)`);
      return;
    }
    const ext = guessExt(file.type, originalName ?? '');
    if (!ext) {
      Toast.error(`未対応の画像形式: ${file.type}`);
      return;
    }
    const path = `Media/${node.slug}.${ext}`;
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      await ctx.adapter.writeBytes(ctx.handle, path, buf);
      const updated: ScenarioNode = { ...node, thumbnail: path };
      await ctx.nodeRepository.save(updated);
      const next = new Map(ctx.project.nodes);
      next.set(node.id, updated);
      Object.assign(ctx.project, { nodes: next });
      // cache を invalidate (新画像で URL を再生成)
      const key = cacheKey(ctx.handle.id, path);
      const cur = urlCache().get(key);
      if (cur) URL.revokeObjectURL(cur);
      const updatedCache = new Map(urlCache());
      updatedCache.delete(key);
      setUrlCache(updatedCache);
      Toast.success(`サムネイル更新: ${node.slug}`);
    } catch (e) {
      Toast.error(`サムネイル保存に失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  },

  /** node.thumbnail のパスから object URL を取得 (キャッシュ) */
  async resolveUrl(thumbnail: string): Promise<string | undefined> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return undefined;
    const key = cacheKey(ctx.handle.id, thumbnail);
    const cached = urlCache().get(key);
    if (cached) return cached;
    if (!(await ctx.adapter.exists(ctx.handle, thumbnail))) return undefined;
    try {
      const bytes = await ctx.adapter.readBytes(ctx.handle, thumbnail);
      const ext = thumbnail.split('.').pop()?.toLowerCase() ?? 'png';
      const mime = extToMime(ext);
      const blob = new Blob([new Uint8Array(bytes)], { type: mime });
      const url = URL.createObjectURL(blob);
      const next = new Map(urlCache());
      next.set(key, url);
      setUrlCache(next);
      return url;
    } catch {
      return undefined;
    }
  },

  /** ノードのサムネイルを削除 (Media/ ファイル + node.thumbnail を消す)。 */
  async clearForNode(node: ScenarioNode): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx || !node.thumbnail) return;
    try {
      if (await ctx.adapter.exists(ctx.handle, node.thumbnail)) {
        await ctx.adapter.delete(ctx.handle, node.thumbnail);
      }
      const updated: ScenarioNode = { ...node };
      delete (updated as { thumbnail?: string }).thumbnail;
      await ctx.nodeRepository.save(updated);
      const next = new Map(ctx.project.nodes);
      next.set(node.id, updated);
      Object.assign(ctx.project, { nodes: next });
      Toast.success(`サムネイル削除: ${node.slug}`);
    } catch (e) {
      Toast.error(`サムネイル削除に失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  },

  /** Project close 時に URL を revoke。 */
  clearAll(): void {
    for (const url of urlCache().values()) URL.revokeObjectURL(url);
    setUrlCache(new Map());
  },

  urlCache,
};

function guessExt(mime: string, name: string): string | undefined {
  const m = SUPPORTED_EXT.get(mime);
  if (m) return m;
  // fallback: ファイル名拡張子
  const fromName = name.split('.').pop()?.toLowerCase();
  if (fromName && ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }
  return undefined;
}

function extToMime(ext: string): string {
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

/** ScenarioNode の helper alias for ProjectService consumers. */
export type { NodeId };
