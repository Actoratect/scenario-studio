import type { ThumbnailRect } from '@scenario-studio/core';

// 立ち絵サムネの「真の正方形」crop 幾何 (PortraitCropper から分離してテスト可能に)。
// aspectWH = imgW / imgH (縦長 < 1, 横長 > 1)。size は image WIDTH 基準の 0..1。
// 正方形なので pixel 高さ = pixel 幅 = size * imgW、よって画像 HEIGHT に対する
// 占有率 = size * imgW / imgH = size * aspectWH。
// 旧実装は size / aspectWH と逆数を使っており、縦長立ち絵で縦移動・リサイズ範囲が
// 潰れて「下に動かせない / 一気に縮む」不自然な挙動になっていた。

export function squareHeightFraction(size: number, aspectWH: number): number {
  return size * aspectWH;
}

/** 画像内に高さも含めて収まる正方形 size の上限 (image WIDTH 基準 0..1)。 */
export function maxSquareSize(aspectWH: number): number {
  return Math.max(0.05, Math.min(1, 1 / aspectWH));
}

/**
 * rect を「真の正方形が画像内に収まる範囲」にクランプする。
 * 画像 dims 判明時 (node 切替 / image load) に必ず通すことで、未初期化値や
 * 縦長画像での座標破綻を防ぐ。
 */
export function clampRectToImage(raw: ThumbnailRect, img: { w: number; h: number }): ThumbnailRect {
  const aspectWH = img.w / img.h;
  const maxFitSize = maxSquareSize(aspectWH);
  const isUninit = raw.size >= 0.999 && raw.x <= 0.001 && raw.y <= 0.001;
  let size: number;
  let xRaw: number;
  let yRaw: number;
  if (isUninit) {
    // 中央 50% 幅の square + 上寄せ (顔位置の目安) を初期値に。
    size = Math.min(maxFitSize, 0.5);
    xRaw = (1 - size) / 2;
    yRaw = 0.08;
  } else {
    size = Math.max(0.05, Math.min(raw.size, maxFitSize));
    xRaw = raw.x;
    yRaw = raw.y;
  }
  const sizeInH = squareHeightFraction(size, aspectWH);
  const maxX = Math.max(0, 1 - size);
  const maxY = Math.max(0, 1 - sizeInH);
  return {
    x: Math.max(0, Math.min(maxX, xRaw)),
    y: Math.max(0, Math.min(maxY, yRaw)),
    size,
  };
}
