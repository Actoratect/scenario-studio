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
      id: 'gender',
      label: '性別',
      type: 'enum',
      values: ['male', 'female', 'nonbinary', 'unknown'],
      defaultValue: 'unknown',
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
      id: 'tone',
      label: '口調',
      type: 'enum',
      values: ['casual', 'polite', 'formal', 'rough', 'archaic'],
      defaultValue: 'casual',
      group: '話し方',
    },
    {
      id: 'appearance',
      label: '外見',
      type: 'multiline_string',
      group: '描写',
    },
    {
      id: 'personality',
      label: '性格',
      type: 'multiline_string',
      group: '描写',
    },
    {
      id: 'faction',
      label: '所属',
      type: 'node_ref',
      referencesTemplateId: templateId('template.faction'),
      group: '関係',
    },
  ],
};
