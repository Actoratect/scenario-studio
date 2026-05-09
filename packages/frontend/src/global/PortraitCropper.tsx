import { createEffect, createMemo, createResource, createSignal, onCleanup, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { ScenarioNode, ThumbnailRect } from '@scenario-studio/core';
import { ThumbnailService } from '../services/ThumbnailService';

// PR-AC: 立ち絵 (full portrait) を表示し、その上に正方形クロップ枠を被せる。
// ドラッグで枠を動かし、四隅でリサイズ可能。確定すると onChange に正規化座標 (0..1) を返す。
// node.thumbnail (画像パス) が無ければ「画像をクリック / drop してください」プレースホルダ。

export interface PortraitCropperProps {
  node: ScenarioNode;
  /** プレビューの最大幅 (px)。実際の高さは画像のアスペクト比に従う。 */
  width: number;
  /** crop 確定時に呼ばれる (0..1 normalized)。 */
  onChange: (rect: ThumbnailRect) => void;
  /** 「画像 drop してください」状態でファイルが drop されたときに upload する。 */
  onUpload?: (file: File) => void;
}

type DragMode = 'move' | 'resize-br' | undefined;

export const PortraitCropper: Component<PortraitCropperProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  const [dragMode, setDragMode] = createSignal<DragMode>(undefined);
  const [hoverDrop, setHoverDrop] = createSignal(false);
  const [imgSize, setImgSize] = createSignal<{ w: number; h: number } | undefined>(undefined);
  // PR (ux-overhaul): 通常は読み取り専用 (画像 + サムネ枠グレー線のみ)。
  // 「✎ サムネ範囲を調整」を押した時だけ crop UI (マスク・ドラッグ可) になる。
  const [editing, setEditing] = createSignal(false);

  // node.thumbnail を URL に解決。
  // 注意: createResource は source が falsy だと fetcher を呼ばず前回値を保持する。
  // 「画像ありキャラ → なしキャラ」切替で前の URL が残るバグの原因なので、
  // source は常に object を返し、fetcher 内で thumbnail 不在を分岐する。
  const source = createMemo(() => ({
    id: props.node.id,
    thumbnail: props.node.thumbnail ?? '',
  }));
  const [url] = createResource(source, async (src) => {
    if (!src.thumbnail) return undefined;
    return ThumbnailService.resolveUrl(src.thumbnail);
  });

  // crop rect (0..1 normalized)。空 default で開始し、node 切替 / image load で sync。
  const [rect, setRect] = createSignal<ThumbnailRect>({ x: 0, y: 0, size: 1 });

  /**
   * 画像 dims が判明している時点で rect を **真の正方形が image 内に収まる範囲** に
   * クランプする。size は image WIDTH の 0..1 で、square 高さ = size / aspectWH。
   * 縦長画像 (aspectWH < 1) で size=1 のままだと sizeInH > 1 になり、Y 移動が
   * マイナス領域に clamp されて「下に動かない」「resize で一気に縮む」バグになる。
   * 初期化時に必ず通すことで両症状を絶つ。
   */
  function clampRectToImage(raw: ThumbnailRect, img: { w: number; h: number }): ThumbnailRect {
    const aspectWH = img.w / img.h; // 縦長 → < 1, 横長 → > 1
    // size を maxFitSize にすると square が image 高さ / 幅いっぱいになり、
    // y / x の移動余地が 0 になる → 「下に動かせない」「resize で広げられない」
    // 症状になる。デフォルト未指定の場合は意図的に小さくして余地を残す。
    const maxFitSize = Math.max(0.05, Math.min(1, aspectWH));
    const isUninit = raw.size >= 0.999 && raw.x <= 0.001 && raw.y <= 0.001;
    let size: number;
    let xRaw: number;
    let yRaw: number;
    if (isUninit) {
      // 中央 50% 幅の square + 上寄せ (= 顔位置の目安) を初期値に
      size = Math.min(maxFitSize, 0.5);
      xRaw = (1 - size) / 2;
      yRaw = 0.08;
    } else {
      size = Math.max(0.05, Math.min(raw.size, maxFitSize));
      xRaw = raw.x;
      yRaw = raw.y;
    }
    const sizeInH = size / aspectWH;
    const maxX = Math.max(0, 1 - size);
    const maxY = Math.max(0, 1 - sizeInH);
    return {
      x: Math.max(0, Math.min(maxX, xRaw)),
      y: Math.max(0, Math.min(maxY, yRaw)),
      size,
    };
  }

  // node が切り替わったら rect を再 initialize
  createEffect(() => {
    const _id = props.node.id;
    void _id;
    const stored = props.node.thumbnailRect ?? { x: 0, y: 0, size: 1 };
    const img = imgSize();
    setRect(img ? clampRectToImage(stored, img) : stored);
  });

  // 描画サイズ計算: width に揃え、画像アスペクトで height を決定
  const displaySize = createMemo<{ w: number; h: number } | undefined>(() => {
    const img = imgSize();
    if (!img) return undefined;
    const ratio = img.h / img.w;
    return { w: props.width, h: props.width * ratio };
  });

  function onImgLoad(e: Event): void {
    const img = e.currentTarget as HTMLImageElement;
    const dims = { w: img.naturalWidth, h: img.naturalHeight };
    setImgSize(dims);
    // image dims が判明したタイミングで rect も再クランプ
    setRect((cur) => clampRectToImage(cur, dims));
  }

  // crop rect の意味: x/y は画像 (width/height) の 0..1。
  // size は画像 WIDTH の 0..1 (= 正方形の 1 辺、pixel ベースで真の正方形)。
  // 表示時の正方形高さ = size * displayWidth (= size * imgW * displayScale)。
  // → display での縦 fraction は size * (imgW / imgH)。
  function startDrag(e: MouseEvent, mode: NonNullable<DragMode>): void {
    e.preventDefault();
    e.stopPropagation();
    setDragMode(mode);
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = rect();
    const sz = displaySize();
    const img = imgSize();
    if (!sz || !img) return;
    const aspectWH = img.w / img.h; // 画像の幅÷高さ

    // image 内に収まる正方形の最大 size (= image WIDTH の 0..1)
    const absoluteMaxSize = Math.max(0.05, Math.min(1, aspectWH));

    function onMove(ev: MouseEvent): void {
      // dx は表示幅基準 = 画像幅基準 (width fraction)
      const dxW = (ev.clientX - startX) / sz!.w;
      const dyH = (ev.clientY - startY) / sz!.h;
      if (mode === 'move') {
        // 正方形高さ (height fraction) = size / aspectWH
        const sizeInH = startRect.size / aspectWH;
        const nx = clamp01(startRect.x + dxW, 0, Math.max(0, 1 - startRect.size));
        const ny = clamp01(startRect.y + dyH, 0, Math.max(0, 1 - sizeInH));
        setRect({ x: nx, y: ny, size: startRect.size });
      } else if (mode === 'resize-br') {
        // 正方形を維持: dx (width 単位) を採用。
        // 上限は absoluteMaxSize (= image 内に square が必ず収まる絶対値)。
        // 大きくしたら image 端を超える場合は x/y を auto-adjust して残す。
        const delta = dxW;
        const newSize = Math.max(0.1, Math.min(absoluteMaxSize, startRect.size + delta));
        const newSizeInH = newSize / aspectWH;
        const newX = Math.min(startRect.x, Math.max(0, 1 - newSize));
        const newY = Math.min(startRect.y, Math.max(0, 1 - newSizeInH));
        setRect({ x: newX, y: newY, size: newSize });
      }
    }
    function onUp(): void {
      setDragMode(undefined);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      props.onChange(rect());
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  onCleanup(() => {
    setDragMode(undefined);
  });

  function onDragOver(e: DragEvent): void {
    if (!props.onUpload) return;
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setHoverDrop(true);
  }
  function onDragLeave(): void {
    setHoverDrop(false);
  }
  function onDrop(e: DragEvent): void {
    setHoverDrop(false);
    if (!props.onUpload) return;
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    e.preventDefault();
    props.onUpload(file);
  }

  function resetRect(): void {
    const next: ThumbnailRect = { x: 0, y: 0, size: 1 };
    setRect(next);
    props.onChange(next);
  }

  return (
    <div
      ref={containerRef}
      class="ss-portrait-cropper"
      classList={{ 'ss-portrait-cropper--drop': hoverDrop() }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <Show
        when={url()}
        fallback={
          <div class="ss-portrait-empty" style={{ width: `${props.width}px` }}>
            <span class="ss-portrait-empty-icon">🖼</span>
            <span class="ss-portrait-empty-label">立ち絵をクリックまたは drop でアップロード</span>
          </div>
        }
      >
        {(u) => (
          <div
            class="ss-portrait-frame"
            style={{
              width: `${displaySize()?.w ?? props.width}px`,
              height: displaySize() ? `${displaySize()!.h}px` : 'auto',
            }}
          >
            <img src={u()} alt="" class="ss-portrait-img" onLoad={onImgLoad} draggable={false} />
            <Show when={displaySize()}>
              {(sz) => (
                // crop は **真の正方形** (pixel ベースで w === h)。
                // size は image WIDTH の 0..1 → display 幅 = size * sz.w px、
                // 高さも同じ px (= 正方形)。これでグラフ・脚本サムネで歪まない。
                <div
                  class="ss-portrait-crop"
                  classList={{
                    'ss-portrait-crop--dragging': dragMode() !== undefined,
                    'ss-portrait-crop--editing': editing(),
                    'ss-portrait-crop--readonly': !editing(),
                  }}
                  style={{
                    left: `${rect().x * sz().w}px`,
                    top: `${rect().y * sz().h}px`,
                    width: `${rect().size * sz().w}px`,
                    height: `${rect().size * sz().w}px`,
                  }}
                  onMouseDown={(e) => editing() && startDrag(e, 'move')}
                  title={editing() ? 'ドラッグでサムネ位置を移動' : '✎ ボタンで調整モードへ'}
                >
                  <Show when={editing()}>
                    <div
                      class="ss-portrait-crop-handle"
                      onMouseDown={(e) => startDrag(e, 'resize-br')}
                      title="ドラッグでサムネサイズを変更 (正方形を維持)"
                    />
                  </Show>
                </div>
              )}
            </Show>
          </div>
        )}
      </Show>
      <div class="ss-portrait-actions">
        <Show when={url()}>
          <button
            type="button"
            class="ss-portrait-action"
            classList={{ 'ss-portrait-action--active': editing() }}
            onClick={() => setEditing((b) => !b)}
            title={editing() ? '調整モード終了' : 'サムネ範囲を調整'}
          >
            {editing() ? '✓ 調整完了' : '✎ サムネ範囲を調整'}
          </button>
          <Show when={editing()}>
            <button
              type="button"
              class="ss-portrait-action"
              onClick={resetRect}
              title="サムネ範囲を画像全体にリセット"
            >
              ⟲ 全体に戻す
            </button>
          </Show>
        </Show>
        <Show when={editing()}>
          <span class="ss-portrait-hint">
            枠 drag で位置、右下ハンドルでサイズ変更 (正方形維持)。確定はヘッダの「💾 保存」。
          </span>
        </Show>
      </div>
    </div>
  );
};

function clamp01(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
