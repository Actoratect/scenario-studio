import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';

// 「Smart 入力モード」(M6) の最小実装。
// `who: ` の右で character ノード slug を補完、`emotion: ` の右で 既知 emotion を補完。
// 完全な Smart shorthand (`:` で話者選択 / `!` ト書き / `?` 選択肢) は Phase 1 後半で。
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §5.4,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M6

export interface ScriptCompletionSources {
  /** project 内のキャラ slug。who: 補完で候補に出す。 */
  characterSlugs: () => readonly string[];
  /** 定義済 emotion 一覧 (UI 表示順)。 */
  emotionTags: () => readonly string[];
}

const KNOWN_KINDS: readonly string[] = [
  'stage',
  'action',
  'line',
  'choice',
  'sfx',
  'bgm',
  'voice',
  'var_set',
  'goto',
  'comment',
];

export function scriptAutocomplete(sources: ScriptCompletionSources): Extension {
  return autocompletion({
    override: [
      (context: CompletionContext): CompletionResult | null => {
        const before = context.state.doc.sliceString(Math.max(0, context.pos - 200), context.pos);

        // 直前が `who: ` または `who: <部分入力>` の場合
        const whoMatch = /who:\s*([A-Za-z0-9_-]*)$/.exec(before);
        if (whoMatch) {
          const partial = whoMatch[1] ?? '';
          const fromPos = context.pos - partial.length;
          return {
            from: fromPos,
            options: sources.characterSlugs().map((slug) => ({
              label: slug,
              type: 'variable',
            })),
            validFor: /^[A-Za-z0-9_-]*$/,
          };
        }

        // emotion: 補完 (日本語値もある = Unicode 文字を許容)
        const emoMatch = /emotion:\s*([^\s,}]*)$/.exec(before);
        if (emoMatch) {
          const partial = emoMatch[1] ?? '';
          const fromPos = context.pos - partial.length;
          return {
            from: fromPos,
            options: sources.emotionTags().map((tag) => ({
              label: tag,
              type: 'enum',
            })),
            validFor: /^[^\s,}]*$/,
          };
        }

        // kind: 補完
        const kindMatch = /kind:\s*([A-Za-z0-9_-]*)$/.exec(before);
        if (kindMatch) {
          const partial = kindMatch[1] ?? '';
          const fromPos = context.pos - partial.length;
          return {
            from: fromPos,
            options: KNOWN_KINDS.map((k) => ({ label: k, type: 'keyword' })),
            validFor: /^[A-Za-z0-9_-]*$/,
          };
        }

        return null;
      },
    ],
  });
}
