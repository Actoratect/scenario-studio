import { describe, expect, it } from 'vitest';
import type { FieldSchema } from '@scenario-studio/core';
import { fieldIsVisible, hasFieldContent, textMapEntries, updateTextMap } from './inspector-fields';

describe('Inspectorの任意項目', () => {
  const field: FieldSchema = {
    id: 'custom',
    label: '任意設定',
    type: 'string',
    hiddenWhenEmpty: true,
  };

  it('未記入は隠し、追加した空欄と既存値は表示する', () => {
    expect(fieldIsVisible(field, undefined, new Set())).toBe(false);
    expect(fieldIsVisible(field, '', new Set(['custom']))).toBe(true);
    expect(fieldIsVisible(field, '既存の設定', new Set())).toBe(true);
    expect(fieldIsVisible({ ...field, required: true }, undefined, new Set())).toBe(true);
  });

  it('falseや0の入力済み設定を隠さない', () => {
    expect(hasFieldContent(false)).toBe(true);
    expect(hasFieldContent(0)).toBe(true);
    expect(hasFieldContent({ 消した台詞: null })).toBe(false);
  });
});

describe('台詞mapの編集', () => {
  it('未知のmap値を勝手に消さず、編集対象だけを更新する', () => {
    const source = { 待機: '一行目\n二行目', 未知の値: 7 };
    expect(updateTextMap(source, '攻撃', 'そこだ！')).toEqual({ ...source, 攻撃: 'そこだ！' });
    expect(textMapEntries(source)).toEqual([['待機', '一行目\n二行目']]);
    expect(source).toEqual({ 待機: '一行目\n二行目', 未知の値: 7 });
  });

  it('削除した項目をnullとして保持し、空文字の編集中項目は残す', () => {
    const next = updateTextMap({ 待機: '台詞', 攻撃: '' }, '待機', null);
    expect(next).toEqual({ 待機: null, 攻撃: '' });
    expect(textMapEntries(next)).toEqual([['攻撃', '']]);
  });
});
