import type { TextSuggestionPreset } from './types.js';

// PR-AR: テキスト欄右クリック AI 提案のプリセット。
// 詳細: ../../../../Documentation/ScenarioEditor/22_ux_feature_review.md §G2

/**
 * 標準プリセット 5 件。
 * UI 側で右クリックメニューに「natural / short / character-voice」の 3 つを
 * デフォルト表示する想定。`translation-context` と `fix-glossary` は
 * 用途別メニュー (翻訳・用語統一) で出す。
 *
 * 案 1 / 案 2 / 案 3 のラベルは AiCandidateOverlay 側で固定の
 * 3 種 ("自然に" / "短く" / "口調強め") を生成するか、
 * 単一プリセットで 3 案 (temperature 違い) を出すか UI で切替。
 */
export const TEXT_SUGGESTION_PRESETS: readonly TextSuggestionPreset[] = [
  {
    id: 'natural',
    label: '自然に',
    instruction: '与えられたテキストを自然な日本語に整える。意味は保ち、過度な書き換えを避ける。',
  },
  {
    id: 'short',
    label: '短く',
    instruction: '与えられたテキストを 30〜50% 短く要約する。重要な情報は残す。',
  },
  {
    id: 'character-voice',
    label: 'キャラ口調強め',
    instruction:
      '与えられたテキストをキャラクターの口調 (一人称・語尾・話し方) を強調して書き換える。' +
      'projectContext.displayName / nodeSlug が指すキャラの個性を反映する。',
  },
  {
    id: 'translation-context',
    label: '翻訳コンテキスト',
    instruction:
      '与えられたテキストを翻訳する際に必要な背景・文脈・代名詞解釈を箇条書きで補足する。' +
      'テキスト本体は書き換えない (注釈生成のみ)。',
  },
  {
    id: 'fix-glossary',
    label: '用語修正',
    instruction:
      'projectContext.glossaryTerms に従い、表記揺れを正式表記に統一する。それ以外は変えない。',
  },
];
