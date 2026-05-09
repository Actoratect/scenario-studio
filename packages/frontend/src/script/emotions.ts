// 感情ラベル定義 — UI 表示と保存値を日本語化 (PR: ux-overhaul)。
// 既存 YAML には英語値 (happy / sad / ...) が混在するので、display 表示時に
// 日本語に変換するためのテーブルを併設している。新規入力は日本語値で書き込む。

export const KNOWN_EMOTIONS: readonly string[] = [
  '喜び',
  '悲しみ',
  '怒り',
  '疲労',
  '不審',
  '驚き',
  '照れ',
  '穏やか',
  '優しい',
  '丁寧',
  '友好',
  '思案',
  '興奮',
  '困惑',
  '真剣',
];

/**
 * 既存データの英語値も日本語ラベルとして表示できるよう変換する。
 * 該当無しなら値をそのまま返す (= 自由入力された日本語 / 独自タグはそのまま表示)。
 */
const ENGLISH_TO_JP: Readonly<Record<string, string>> = {
  happy: '喜び',
  sad: '悲しみ',
  angry: '怒り',
  tired: '疲労',
  suspicious: '不審',
  surprised: '驚き',
  embarrassed: '照れ',
  calm: '穏やか',
  gentle: '優しい',
  polite: '丁寧',
  friendly: '友好',
  pleased: '満足',
  thoughtful: '思案',
  small: '小声',
  warm: '温和',
  excited: '興奮',
  confused: '困惑',
  serious: '真剣',
};

export function emotionLabel(value: string): string {
  if (!value) return '';
  return ENGLISH_TO_JP[value] ?? value;
}
