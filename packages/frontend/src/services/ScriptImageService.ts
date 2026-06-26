import { ProjectService } from './ProjectService';
import { ThumbnailService } from './ThumbnailService';
import { Toast } from './Toast';

const SUPPORTED_EXT: ReadonlyMap<string, string> = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
  ['image/svg+xml', 'svg'],
]);

const MAX_BYTES = 12 * 1024 * 1024;

export const ScriptImageService = {
  async upload(file: File): Promise<string | undefined> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return undefined;
    if (file.size > MAX_BYTES) {
      Toast.error(`画像が大きすぎます (${(file.size / 1024 / 1024).toFixed(1)} MB > 12 MB)`);
      return undefined;
    }
    const ext = guessExt(file.type, file.name);
    if (!ext) {
      Toast.error(`未対応の画像形式です: ${file.type || file.name}`);
      return undefined;
    }

    const base = sanitizeBaseName(file.name.replace(/\.[^.]+$/, '')) || 'image';
    const stamp = Date.now().toString(36);
    const path = await findAvailablePath(base, stamp, ext);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await ctx.adapter.writeBytes(ctx.handle, path, bytes);
      Toast.success(`画像を追加: ${path}`);
      return path;
    } catch (e) {
      Toast.error(`画像の保存に失敗: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  },

  async resolveUrl(path: string): Promise<string | undefined> {
    return ThumbnailService.resolveUrl(path);
  },
};

async function findAvailablePath(base: string, stamp: string, ext: string): Promise<string> {
  const ctx = ProjectService.currentProject();
  if (!ctx) return `Media/script/${base}-${stamp}.${ext}`;
  for (let i = 0; i < 100; i++) {
    const suffix = i === 0 ? '' : `-${i}`;
    const path = `Media/script/${base}-${stamp}${suffix}.${ext}`;
    if (!(await ctx.adapter.exists(ctx.handle, path))) return path;
  }
  return `Media/script/${base}-${stamp}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

function guessExt(mime: string, name: string): string | undefined {
  const fromMime = SUPPORTED_EXT.get(mime);
  if (fromMime) return fromMime;
  const fromName = name.split('.').pop()?.toLowerCase();
  if (fromName && ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }
  return undefined;
}

function sanitizeBaseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
