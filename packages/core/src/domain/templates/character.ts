import { NAME_FIELDS, templateId } from './types.js';
import type { TemplateDefinition } from './types.js';

// Character テンプレ。フィールドは Inspector の見やすさのため group 付きで宣言。
export const CHARACTER_TEMPLATE: TemplateDefinition = {
  id: templateId('template.character'),
  directory: 'characters',
  displayName: 'キャラクター',
  icon: 'builtin:user',
  defaultThumbnailColor: '#88aacc',
  fields: [
    ...NAME_FIELDS,
    {
      id: 'birth_year',
      label: '年齢',
      type: 'int',
      description: '見た目の年齢 (歳)。物語時系列の相対年でも可',
      group: '基本情報',
    },
    {
      // 性別は作品によって表現幅が広いため自由入力。
      // 旧 enum (male / female / nonbinary / unknown) も書けるが、独自値も許容。
      id: 'gender',
      label: '性別',
      type: 'string',
      description: '自由入力 (例: male / female / 中性 / 不明)',
      group: '基本情報',
    },
    {
      id: 'height',
      label: '身長',
      type: 'number',
      unit: 'cm',
      min: 0,
      group: '基本情報',
    },
    {
      id: 'first_person',
      label: '一人称',
      type: 'string',
      maxLength: 8,
      group: '話し方',
    },
    {
      // 口調は作品ごとの語感差が大きいため自由入力。
      // 旧 enum (casual / polite / formal / rough / archaic) も書けるが、独自値も許容。
      id: 'tone',
      label: '口調',
      type: 'string',
      description: '自由入力 (例: casual / 丁寧 / 武人風 / 古風)',
      group: '話し方',
    },
    {
      id: 'tagline',
      label: '一言でいえば...',
      type: 'string',
      description: 'キャラを一言で要約 (例: 厳しく育った剣士従者、しかし年頃の少女)',
      group: '描写',
    },
    {
      id: 'personality',
      label: '性格',
      type: 'multiline_string',
      description: '性格・気質・行動原理の説明',
      group: '描写',
    },
    {
      id: 'keywords',
      label: 'キーワード',
      type: 'multiline_string',
      description: '読点 / カンマ区切りでキャラを表すキーワード (例: 天然、好奇心、真剣)',
      group: '描写',
    },
    {
      id: 'dialogue_sample',
      label: 'セリフイメージ',
      type: 'multiline_string',
      description: '口調がわかるサンプルセリフ。1 行 1 セリフ',
      group: '描写',
    },
    {
      id: 'possessions',
      label: '所持品',
      type: 'multiline_string',
      description: '・ で始める箇条書きが見やすい',
      group: '描写',
    },
    {
      // PR-AC 以前に書かれた既存データの保護用。新規入力は「描写」群を使う想定。
      // データが入っていなければ Inspector では空表示。
      id: 'appearance',
      label: '外見 (旧)',
      type: 'multiline_string',
      description: 'PR 旧版で使っていた外見欄。互換のため残置',
      group: '補足',
    },
    {
      id: 'faction',
      label: '所属',
      type: 'node_ref',
      referencesTemplateId: templateId('template.faction'),
      group: '関係',
    },
    {
      id: 'memo',
      label: 'メモ',
      type: 'multiline_string',
      description: '自由記入欄。打合せメモ / 設定の TODO / 仮置きアイデアなど',
      group: 'メモ',
    },
  ],
};
