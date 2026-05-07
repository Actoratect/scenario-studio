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

  // crop rect (0..1 normalized)。空 default で開始し、node 切替で createEffect 経由 sync。
  const [rect, setRect] = createSignal<ThumbnailRect>({ x: 0, y: 0, size: 1 });

  // node が切り替わったら rect を再 initialize
  createEffect(() => {
    // props.node.id を tracked dependency にして node 切替を検知
    const _id = props.node.id;
    void _id;
    setRect(props.node.thumbnailRect ?? { x: 0, y: 0, size: 1 });
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
    setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
  }

  function startDrag(e: MouseEvent, mode: NonNullable<DragMode>): void {
    e.preventDefault();
    e.stopPropagation();
    setDragMode(mode);
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = rect();
    const sz = displaySize();
    if (!sz) return;

    function onMove(ev: MouseEvent): void {
      const dx = (ev.clientX - startX) / sz!.w;
      const dy = (ev.clientY - startY) / sz!.h;
      if (mode === 'move') {
        const nx = clamp01(startRect.x + dx, 0, 1 - startRect.size);
        const ny = clamp01(startRect.y + dy, 0, 1 - startRect.size);
        setRect({ x: nx, y: ny, size: startRect.size });
      } else if (mode === 'resize-br') {
        // 拡大は dx + dy の平均で。最小 0.1、最大 1 - rect.x or 1 - rect.y
        const delta = (dx + dy) / 2;
        const maxSize = Math.min(1 - startRect.x, 1 - startRect.y);
        const newSize = clamp01(startRect.size + delta, 0.1, maxSize);
        setRect({ x: startRect.x, y: startRect.y, size: newSize });
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

  function squareRect(): void {
    // 中央に 60% の正方形クロップを置く
    const next: ThumbnailRect = { x: 0.2, y: 0.05, size: 0.5 };
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
                // 注意: rect() / sz() は style 属性式の中で読むことで、
                // ドラッグ中の setRect に反応して left/top/width/height が更新される。
                // 関数本体で `const r = rect()` と先に読んでしまうと、Show の children は
                // 一度しか再評価されず drag 中に位置が更新されなくなる (bug 1)。
                <div
                  class="ss-portrait-crop"
                  classList={{ 'ss-portrait-crop--dragging': dragMode() !== undefined }}
                  style={{
                    left: `${rect().x * sz().w}px`,
                    top: `${rect().y * sz().h}px`,
                    width: `${rect().size * sz().w}px`,
                    height: `${rect().size * sz().h}px`,
                  }}
                  onMouseDown={(e) => startDrag(e, 'move')}
                  title="ドラッグでサムネ位置を移動"
                >
                  <div
                    class="ss-portrait-crop-handle"
                    onMouseDown={(e) => startDrag(e, 'resize-br')}
                    title="ドラッグでサムネサイズを変更"
                  />
                </div>
              )}
            </Show>
          </div>
        )}
      </Show>
      <div class="ss-portrait-actions">
        <span class="ss-portrait-actions-label">サムネ登録:</span>
        <button
          type="button"
          class="ss-portrait-action"
          onClick={resetRect}
          title="画像全体をサムネとして登録"
        >
          📐 全身
        </button>
        <button
          type="button"
          class="ss-portrait-action"
          onClick={squareRect}
          title="顔まわりサイズのプリセットでサムネ登録"
        >
          🙂 顔
        </button>
        <span class="ss-portrait-hint">枠を drag で位置、右下ハンドルでサイズ調整</span>
      </div>
    </div>
  );
};

function clamp01(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
