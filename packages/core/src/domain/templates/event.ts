import { NAME_FIELDS, templateId } from './types.js';
import type { TemplateDefinition } from './types.js';

// 出来事・その他テンプレ。Glossary 廃止 (PR: ux-overhaul) で「用語のためだけのデータ」が
// 行き場を失ったため、シナリオ内の出来事・概念・呼称・自由メモ などを汎用的に格納する箱。
// 用語属性 (aliases / forbidden_aliases / description) は NAME_FIELDS で共通化。

export const EVENT_TEMPLATE: TemplateDefinition = {
  id: templateId('template.event'),
  directory: 'events',
  displayName: '出来事・その他',
  icon: 'builtin:bookmark',
  defaultThumbnailColor: '#cba',
  fields: [
    ...NAME_FIELDS,
    {
      id: 'when',
      label: '時期',
      type: 'string',
      description: '出来事が起きた時期。任意 (例: 「序盤」「Era: 暦701」)',
      group: '基本情報',
    },
    {
      id: 'where',
      label: '場所',
      type: 'node_ref',
      referencesTemplateId: templateId('template.location'),
      description: '出来事が起きた場所 (任意)',
      group: '基本情報',
    },
    {
      id: 'summary',
      label: '概要',
      type: 'multiline_string',
      description: '何があったか・どんなものか',
      group: '描写',
    },
    {
      id: 'memo',
      label: 'メモ',
      type: 'multiline_string',
      description: '自由記入欄。仮置きアイデア / 検討事項',
      group: 'メモ',
    },
  ],
};
