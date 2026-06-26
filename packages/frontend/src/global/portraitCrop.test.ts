import { describe, expect, it } from 'vitest';
import { clampRectToImage, maxSquareSize, squareHeightFraction } from './portraitCrop';

// 縦長立ち絵: 幅512 高さ1024 → aspectWH = 0.5。
const TALL = { w: 512, h: 1024 };
// 横長: 幅1024 高さ512 → aspectWH = 2。
const WIDE = { w: 1024, h: 512 };

describe('portraitCrop geometry', () => {
  it('square height fraction uses size * aspectWH (true pixel square)', () => {
    // 縦長で幅半分 (size=0.5) の正方形 → 高さは画像の 1/4 を占める。
    expect(squareHeightFraction(0.5, 0.5)).toBeCloseTo(0.25);
    // 横長で幅半分 → 高さは画像の 1.0 を占める。
    expect(squareHeightFraction(0.5, 2)).toBeCloseTo(1.0);
  });

  it('max square size leaves room on the constrained axis', () => {
    // 縦長: 幅いっぱい (size=1) でも高さ 0.5 で収まる → 上限は 1。
    expect(maxSquareSize(0.5)).toBeCloseTo(1);
    // 横長: 幅 0.5 でちょうど高さいっぱい → それ以上は入らない。
    expect(maxSquareSize(2)).toBeCloseTo(0.5);
  });

  it('keeps a vertical move range on tall portraits (regression: was locked to y=0)', () => {
    // 旧実装は sizeInH = size / aspectWH = 1.0 となり maxY=0 で「下に動かせない」。
    const clamped = clampRectToImage({ x: 0.25, y: 0.5, size: 0.5 }, TALL);
    expect(clamped.size).toBeCloseTo(0.5);
    // 高さ占有率 0.25 → maxY = 0.75。y=0.5 はそのまま保持される。
    expect(clamped.y).toBeCloseTo(0.5);
    expect(clamped.x).toBeCloseTo(0.25);
  });

  it('clamps y to the real fit range, not zero', () => {
    // size=0.5 の正方形は高さ 0.25 → y は 0..0.75。範囲外 0.9 は 0.75 に丸める。
    const clamped = clampRectToImage({ x: 0, y: 0.9, size: 0.5 }, TALL);
    expect(clamped.y).toBeCloseTo(0.75);
  });

  it('initializes uninitialized rect to a centered upper square', () => {
    const init = clampRectToImage({ x: 0, y: 0, size: 1 }, TALL);
    expect(init.size).toBeCloseTo(0.5);
    expect(init.x).toBeCloseTo(0.25);
    expect(init.y).toBeCloseTo(0.08);
  });

  it('caps size so a wide image square fits vertically', () => {
    const clamped = clampRectToImage({ x: 0, y: 0, size: 0.9 }, WIDE);
    // 横長は最大 0.5 までしか正方形が入らない。
    expect(clamped.size).toBeCloseTo(0.5);
  });
});
