// 送信前のトークン数見積り (11_ai-workflow.md §0.2, §6.3, §7)。
// 正確な tokenizer は Provider / model 依存なので、UI の事前表示用の
// 粗いヒューリスティックに留める (ベンダー固定を避ける)。

/**
 * テキストの推定トークン数を返す。
 * 日本語主体のテキストでは「1 token ≒ 2 文字」が経験則
 * (英数字主体なら 1 token ≒ 4 文字だが、コスト見積りは過小より
 * 過大側に倒すほうが安全なので chars/2 で統一)。
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 2);
}
