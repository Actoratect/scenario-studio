import { createEffect, createMemo, createSignal, onMount, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import { marked } from 'marked';
import { Spinner } from '@scenario-studio/ui-kit';
import { ProjectService } from '../services/ProjectService';
import { Toast } from '../services/Toast';

// プロジェクト全体の synopsis (Scenarios/synopsis.md) を編集する panel。
// PR-I: Markdown プレビュー (split view) を追加。marked で Markdown→HTML、
// CSP で外部 script を弾いているのと、SynopsisPanel は ProjectModel 内のテキストのみ
// 扱うため XSS 経路は限定的。それでも future-proof のため許可タグを最小化。
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §3.1,
//       ../../../../Documentation/ScenarioEditor/16_security.md §2.4 (sanitize)

type ViewMode = 'edit' | 'split' | 'preview';

async function loadAndMergeImages(
  adapter: import('@scenario-studio/core').FileSystemAdapter,
  handle: import('@scenario-studio/core').ProjectHandle,
  paths: readonly string[],
  setCache: (fn: (prev: ReadonlyMap<string, string>) => ReadonlyMap<string, string>) => void,
): Promise<void> {
  const results = await Promise.all(
    paths.map(async (p) => {
      try {
        if (!(await adapter.exists(handle, p))) return undefined;
        const bytes = await adapter.readBytes(handle, p);
        const ext = p.split('.').pop()?.toLowerCase() ?? '';
        const mime =
          ext === 'svg'
            ? 'image/svg+xml'
            : ext === 'jpg' || ext === 'jpeg'
              ? 'image/jpeg'
              : ext === 'png'
                ? 'image/png'
                : ext === 'webp'
                  ? 'image/webp'
                  : ext === 'gif'
                    ? 'image/gif'
                    : 'application/octet-stream';
        const blob = new Blob([new Uint8Array(bytes)], { type: mime });
        return { path: p, url: URL.createObjectURL(blob) };
      } catch {
        return undefined;
      }
    }),
  );
  setCache((prev) => {
    const next = new Map(prev);
    let any = false;
    for (const r of results) {
      if (r && !next.has(r.path)) {
        next.set(r.path, r.url);
        any = true;
      }
    }
    return any ? next : prev;
  });
}

// marked の安全側設定: GFM ON、HTML 通すが <script> 等は CSP で禁止。
marked.setOptions({ gfm: true, breaks: true });

const IMAGE_DIR = 'Scenarios/synopsis-images';
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

export const SynopsisPanel: Component<GroupPanelPartInitParameters> = (params) => {
  const [text, setText] = createSignal<string>('');
  const [saving, setSaving] = createSignal(false);
  const [uploading, setUploading] = createSignal(false);
  const [mode, setMode] = createSignal<ViewMode>('split');
  // PR-AH: Markdown 中の `synopsis-images/foo.png` 等を blob: URL に解決した cache。
  // key = path (Markdown が書いた相対パス)、value = blob URL
  const [imgCache, setImgCache] = createSignal<ReadonlyMap<string, string>>(new Map());
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;
  let fileInputRef: HTMLInputElement | undefined;

  onMount(() => {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    setText(ctx.project.scenario.projectSynopsis);
  });

  function scheduleSave(value: string): void {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      void flush(value);
    }, 500);
  }

  async function flush(value: string): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    setSaving(true);
    try {
      await ctx.scenarioRepository.saveSynopsis(value);
      const next = { ...ctx.project.scenario, projectSynopsis: value };
      Object.assign(ctx.project, { scenario: next });
    } catch (e) {
      console.error('synopsis save failed', e);
      Toast.error(`Synopsis 保存に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const html = createMemo<string>(() => {
    try {
      const raw = marked.parse(text(), { async: false }) as string;
      // PR-AH: <img src="synopsis-images/foo.png"> を blob: URL に置換。
      //        絶対 URL (http / data / blob) はそのまま。
      const cache = imgCache();
      return raw.replace(/<img\s+([^>]*?)src="([^"]+)"([^>]*)>/g, (full, pre, src, post) => {
        if (/^(https?:|data:|blob:|\/)/.test(src)) return full;
        const blob = cache.get(src);
        if (!blob) return full; // load 中 — alt だけ見える
        return `<img ${pre}src="${blob}"${post}>`;
      });
    } catch {
      return '<p><em>Markdown パース失敗</em></p>';
    }
  });

  /**
   * Markdown 中に登場する相対 image path を抽出 (重複除去)。
   * effect で adapter から readBytes → blob URL 化して imgCache に登録。
   */
  const referencedImagePaths = createMemo<readonly string[]>(() => {
    const paths = new Set<string>();
    const md = text();
    // Markdown image: ![alt](path) と HTML <img src="...">
    for (const m of md.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
      const p = m[1];
      if (p && !/^(https?:|data:|blob:|\/)/.test(p)) paths.add(p);
    }
    for (const m of md.matchAll(/<img\s+[^>]*?src="([^"]+)"/g)) {
      const p = m[1];
      if (p && !/^(https?:|data:|blob:|\/)/.test(p)) paths.add(p);
    }
    return [...paths];
  });

  createEffect(() => {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const wanted = referencedImagePaths();
    const cache = imgCache();
    const next = new Map(cache);
    let changed = false;
    // 不要になった blob を revoke
    for (const [k, v] of cache) {
      if (!wanted.includes(k)) {
        URL.revokeObjectURL(v);
        next.delete(k);
        changed = true;
      }
    }
    if (changed) setImgCache(next);
    // 新規 path を非同期 load (resolved 後に setImgCache で merge)
    const toLoad = wanted.filter((p) => !next.has(p));
    if (toLoad.length === 0) return;
    void loadAndMergeImages(ctx.adapter, ctx.handle, toLoad, setImgCache);
  });

  /** PR-AH: file picker から画像を Scenarios/synopsis-images/ に保存し、Markdown を挿入 */
  async function uploadImage(file: File): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    if (file.size > MAX_IMAGE_BYTES) {
      Toast.error(`画像が大きすぎます (${(file.size / 1024 / 1024).toFixed(1)} MB > 4 MB)`);
      return;
    }
    const ext = EXT_BY_MIME[file.type];
    if (!ext || !SUPPORTED_IMAGE_TYPES.has(file.type)) {
      Toast.error(`未対応の画像形式: ${file.type}`);
      return;
    }
    const base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-') || 'image';
    const stamp = Date.now().toString(36);
    const path = `${IMAGE_DIR}/${base}-${stamp}.${ext}`;
    setUploading(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      await ctx.adapter.writeBytes(ctx.handle, path, buf);
      // 相対パス (synopsis-images/...) で挿入
      const relative = path.replace(/^Scenarios\//, '');
      insertAtCursor(`![${base}](${relative})`);
      Toast.success(`画像を挿入: ${relative}`);
    } catch (e) {
      Toast.error(`画像保存に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUploading(false);
    }
  }

  function insertAtCursor(snippet: string): void {
    const ta = textareaRef;
    if (!ta) {
      const cur = text();
      const next = cur + (cur.endsWith('\n') ? '' : '\n') + snippet + '\n';
      setText(next);
      scheduleSave(next);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const cur = text();
    const next = cur.slice(0, start) + snippet + cur.slice(end);
    setText(next);
    scheduleSave(next);
    // restore caret after snippet
    queueMicrotask(() => {
      ta.focus();
      const pos = start + snippet.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  function onFileChange(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void uploadImage(file);
    input.value = '';
  }

  function onDropImage(e: DragEvent): void {
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    e.preventDefault();
    void uploadImage(file);
  }

  return (
    <div class="panel-content panel-synopsis">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />
      <div class="panel-synopsis-meta">
        <span>
          Project Synopsis · <code>{params.api.id}</code>
        </span>
        <Show when={saving() || uploading()}>
          <span class="panel-synopsis-saving">
            <Spinner /> {uploading() ? '画像アップロード中…' : '保存中…'}
          </span>
        </Show>
        <button
          type="button"
          class="panel-synopsis-upload"
          onClick={() => fileInputRef?.click()}
          disabled={uploading()}
          title="画像をアップロード (Markdown image を挿入)"
        >
          🖼 画像
        </button>
        <span class="panel-synopsis-mode">
          <button
            type="button"
            classList={{ active: mode() === 'edit' }}
            onClick={() => setMode('edit')}
            title="編集のみ"
          >
            ✎
          </button>
          <button
            type="button"
            classList={{ active: mode() === 'split' }}
            onClick={() => setMode('split')}
            title="編集 + プレビュー"
          >
            ⇆
          </button>
          <button
            type="button"
            classList={{ active: mode() === 'preview' }}
            onClick={() => setMode('preview')}
            title="プレビューのみ"
          >
            👁
          </button>
        </span>
      </div>
      <div class="panel-synopsis-body" data-mode={mode()}>
        <Show when={mode() !== 'preview'}>
          <textarea
            ref={textareaRef}
            class="panel-synopsis-textarea"
            value={text()}
            placeholder="プロジェクト全体のあらすじを Markdown で… (画像を drop で挿入)"
            onInput={(e) => {
              const v = e.currentTarget.value;
              setText(v);
              scheduleSave(v);
            }}
            onDragOver={(e) => {
              if (e.dataTransfer?.types.includes('Files')) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }
            }}
            onDrop={onDropImage}
          />
        </Show>
        <Show when={mode() !== 'edit'}>
          {/* eslint-disable-next-line solid/no-innerhtml */}
          <div class="panel-synopsis-preview" innerHTML={html()} />
        </Show>
      </div>
    </div>
  );
};
