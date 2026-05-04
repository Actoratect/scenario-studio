import { NAME_FIELDS, templateId } from './types.js';
import type { TemplateDefinition } from './types.js';

export const ITEM_TEMPLATE: TemplateDefinition = {
  id: templateId('template.item'),
  directory: 'items',
  displayName: 'アイテム',
  icon: 'builtin:package',
  defaultThumbnailColor: '#c9a35b',
  fields: [
    ...NAME_FIELDS,
    {
      id: 'category',
      label: '分類',
      type: 'enum',
      values: ['weapon', 'armor', 'consumable', 'key_item', 'currency', 'misc'],
      defaultValue: 'misc',
      group: '基本情報',
    },
    {
      id: 'rarity',
      label: '稀少度',
      type: 'enum',
      values: ['common', 'uncommon', 'rare', 'legendary', 'unique'],
      defaultValue: 'common',
      group: '基本情報',
    },
    {
      id: 'description',
      label: '説明',
      type: 'multiline_string',
      group: '描写',
    },
    {
      id: 'owner',
      label: '所有者',
      type: 'node_ref',
      referencesTemplateId: templateId('template.character'),
      group: '関係',
    },
  ],
};
