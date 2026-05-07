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

  /**
   * ノードの「正方形サムネ画像」を canvas で pre-render し、blob URL を返す。
   * thumbnailRect が未設定 / 画像全体を指す場合は元画像 URL をそのまま返す。
   * グラフ / 脚本 / Inspector で同じ正方形を共有させるためのエントリポイント。
   */
  async resolveCroppedUrl(node: ScenarioNode): Promise<string | undefined> {
    if (!node.thumbnail) return undefined;
    const ctx = ProjectService.currentProject();
    if (!ctx) return undefined;
    const baseUrl = await ThumbnailService.resolveUrl(node.thumbnail);
    if (!baseUrl) return undefined;
    const rect = node.thumbnailRect;
    // rect 未設定 / 全画面 → 元画像をそのまま (object-fit:cover で center-crop)
    if (!rect || (rect.size >= 0.999 && rect.x <= 0.001 && rect.y <= 0.001)) return baseUrl;

    // cache hit?
    const cacheId = `cropped::${ctx.handle.id}::${node.thumbnail}::${rect.x}::${rect.y}::${rect.size}`;
    const cached = urlCache().get(cacheId);
    if (cached) return cached;

    try {
      const cropped = await renderSquareCrop(baseUrl, rect);
      if (!cropped) return baseUrl;
      const next = new Map(urlCache());
      next.set(cacheId, cropped);
      setUrlCache(next);
      return cropped;
    } catch {
      return baseUrl;
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

/**
 * 元画像 URL + rect から「正方形 256×256」の crop 画像を canvas で生成 → blob URL。
 * rect.size は **画像 WIDTH の 0..1** (= 真の正方形が横幅基準で size×imgW px)。
 * x/y は image width/height それぞれの 0..1。
 */
async function renderSquareCrop(
  baseUrl: string,
  rect: { x: number; y: number; size: number },
): Promise<string | undefined> {
  const img = await loadImage(baseUrl);
  if (!img) return undefined;
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  const sidePx = Math.max(1, Math.round(rect.size * srcW));
  const sx = Math.max(0, Math.min(srcW - 1, Math.round(rect.x * srcW)));
  const sy = Math.max(0, Math.min(srcH - 1, Math.round(rect.y * srcH)));
  // 画像端を超えないようクランプ
  const sw = Math.min(sidePx, srcW - sx);
  const sh = Math.min(sidePx, srcH - sy);
  const target = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = target;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  // 背景透過 (PNG)
  ctx.clearRect(0, 0, target, target);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, target, target);
  return new Promise<string | undefined>((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) resolve(undefined);
      else resolve(URL.createObjectURL(blob));
    }, 'image/png');
  });
}

function loadImage(url: string): Promise<HTMLImageElement | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(undefined);
    img.src = url;
  });
}

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
