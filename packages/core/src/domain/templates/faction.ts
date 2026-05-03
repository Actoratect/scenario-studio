import { templateId } from './types.js';
import type { TemplateDefinition } from './types.js';

export const FACTION_TEMPLATE: TemplateDefinition = {
  id: templateId('template.faction'),
  directory: 'factions',
  displayName: { ja: '勢力', en: 'Faction' },
  icon: 'builtin:shield',
  defaultThumbnailColor: '#b97a8a',
  fields: [
    {
      id: 'display_name',
      label: { ja: '表示名', en: 'Display Name' },
      type: 'localized_string',
      required: true,
    },
    {
      id: 'founded_year',
      label: { ja: '創設年', en: 'Founded Year' },
      type: 'int',
    },
    {
      id: 'leader',
      label: { ja: '指導者', en: 'Leader' },
      type: 'node_ref',
      referencesTemplateId: templateId('template.character'),
    },
    {
      id: 'banner_color',
      label: { ja: '旗色', en: 'Banner Color' },
      type: 'string',
      description: 'CSS カラー (例: "#bb1133")',
    },
    {
      id: 'description',
      label: { ja: '説明', en: 'Description' },
      type: 'multiline_string',
    },
    {
      id: 'is_active',
      label: { ja: '活動中', en: 'Active' },
      type: 'bool',
      defaultValue: true,
    },
  ],
};
