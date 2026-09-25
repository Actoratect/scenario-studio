import { describe, expect, it } from 'vitest';
import { estimateTokens } from './token-estimate.js';

describe('estimateTokens', () => {
  it('空文字は 0 tokens', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('日本語はおおよそ chars/2 (切り上げ)', () => {
    expect(estimateTokens('こんにちは')).toBe(3); // 5 文字 → ceil(2.5)
    expect(estimateTokens('あいうえおかきくけこ')).toBe(5); // 10 文字
  });

  it('1 文字でも最低 1 token', () => {
    expect(estimateTokens('a')).toBe(1);
  });
});
