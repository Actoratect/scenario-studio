import { templateId } from './types.js';
import type { TemplateDefinition } from './types.js';

// 03_data-model.md §2 のサンプルキャラクターテンプレート (MVP 縮小版)。
export const CHARACTER_TEMPLATE: TemplateDefinition = {
  id: templateId('template.character'),
  directory: 'characters',
  displayName: { ja: 'キャラクター', en: 'Character' },
  icon: 'builtin:user',
  defaultThumbnailColor: '#88aacc',
  fields: [
    {
      id: 'full_name',
      label: { ja: 'フルネーム', en: 'Full Name' },
      type: 'localized_string',
      required: true,
    },
    {
      id: 'birth_year',
      label: { ja: '生年', en: 'Birth Year' },
      type: 'int',
      description: '物語現在 (0 年) からの相対値',
    },
    {
      id: 'gender',
      label: { ja: '性別', en: 'Gender' },
      type: 'enum',
      values: ['male', 'female', 'nonbinary', 'unknown'],
      defaultValue: 'unknown',
    },
    {
      id: 'height',
      label: { ja: '身長', en: 'Height' },
      type: 'number',
      unit: 'cm',
      min: 0,
    },
    {
      id: 'appearance',
      label: { ja: '外見', en: 'Appearance' },
      type: 'multiline_string',
    },
    {
      id: 'personality',
      label: { ja: '性格', en: 'Personality' },
      type: 'multiline_string',
    },
    {
      id: 'first_person',
      label: { ja: '一人称', en: 'First Person' },
      type: 'string',
      maxLength: 8,
    },
    {
      id: 'tone',
      label: { ja: '口調', en: 'Tone' },
      type: 'enum',
      values: ['casual', 'polite', 'formal', 'rough', 'archaic'],
      defaultValue: 'casual',
    },
    {
      id: 'faction',
      label: { ja: '所属', en: 'Faction' },
      type: 'node_ref',
      referencesTemplateId: templateId('template.faction'),
    },
  ],
};
