import { NAME_FIELDS, templateId } from './types.js';
import type { TemplateDefinition } from './types.js';

export const FACTION_TEMPLATE: TemplateDefinition = {
  id: templateId('template.faction'),
  directory: 'factions',
  displayName: '勢力',
  icon: 'builtin:shield',
  defaultThumbnailColor: '#b97a8a',
  fields: [
    ...NAME_FIELDS,
    {
      id: 'founded_year',
      label: '創設年',
      type: 'int',
      group: '基本情報',
    },
    {
      id: 'banner_color',
      label: '旗色',
      type: 'string',
      description: 'CSS カラー (例: "#bb1133")',
      group: '基本情報',
    },
    {
      id: 'is_active',
      label: '活動中',
      type: 'bool',
      defaultValue: true,
      group: '基本情報',
    },
    {
      id: 'description',
      label: '説明',
      type: 'multiline_string',
      group: '描写',
    },
    {
      id: 'leader',
      label: '指導者',
      type: 'node_ref',
      referencesTemplateId: templateId('template.character'),
      group: '関係',
    },
  ],
};
