import { NAME_FIELDS, templateId } from './types.js';
import type { TemplateDefinition } from './types.js';

// 03_data-model.md §2 のサンプルキャラクターテンプレート (MVP 縮小版)。
// PR-B: full_name (LocalizedString) を NAME_FIELDS (display_name + reading + dev_name) に置換。
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
      label: '生年',
      type: 'int',
      description: '物語現在 (0 年) からの相対値',
    },
    {
      id: 'gender',
      label: '性別',
      type: 'enum',
      values: ['male', 'female', 'nonbinary', 'unknown'],
      defaultValue: 'unknown',
    },
    {
      id: 'height',
      label: '身長',
      type: 'number',
      unit: 'cm',
      min: 0,
    },
    {
      id: 'appearance',
      label: '外見',
      type: 'multiline_string',
    },
    {
      id: 'personality',
      label: '性格',
      type: 'multiline_string',
    },
    {
      id: 'first_person',
      label: '一人称',
      type: 'string',
      maxLength: 8,
    },
    {
      id: 'tone',
      label: '口調',
      type: 'enum',
      values: ['casual', 'polite', 'formal', 'rough', 'archaic'],
      defaultValue: 'casual',
    },
    {
      id: 'faction',
      label: '所属',
      type: 'node_ref',
      referencesTemplateId: templateId('template.faction'),
    },
  ],
};
