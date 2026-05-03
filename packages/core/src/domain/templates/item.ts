import { templateId } from './types.js';
import type { TemplateDefinition } from './types.js';

export const ITEM_TEMPLATE: TemplateDefinition = {
  id: templateId('template.item'),
  directory: 'items',
  displayName: { ja: 'アイテム', en: 'Item' },
  icon: 'builtin:package',
  defaultThumbnailColor: '#c9a35b',
  fields: [
    {
      id: 'display_name',
      label: { ja: '表示名', en: 'Display Name' },
      type: 'localized_string',
      required: true,
    },
    {
      id: 'category',
      label: { ja: '分類', en: 'Category' },
      type: 'enum',
      values: ['weapon', 'armor', 'consumable', 'key_item', 'currency', 'misc'],
      defaultValue: 'misc',
    },
    {
      id: 'rarity',
      label: { ja: '稀少度', en: 'Rarity' },
      type: 'enum',
      values: ['common', 'uncommon', 'rare', 'legendary', 'unique'],
      defaultValue: 'common',
    },
    {
      id: 'description',
      label: { ja: '説明', en: 'Description' },
      type: 'multiline_string',
    },
    {
      id: 'owner',
      label: { ja: '所有者', en: 'Owner' },
      type: 'node_ref',
      referencesTemplateId: templateId('template.character'),
    },
  ],
};
