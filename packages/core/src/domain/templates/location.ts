import { NAME_FIELDS, templateId } from './types.js';
import type { TemplateDefinition } from './types.js';

export const LOCATION_TEMPLATE: TemplateDefinition = {
  id: templateId('template.location'),
  directory: 'locations',
  displayName: '場所',
  icon: 'builtin:map-pin',
  defaultThumbnailColor: '#7ab98a',
  fields: [
    ...NAME_FIELDS,
    {
      id: 'region',
      label: '地域',
      type: 'string',
      group: '地理',
    },
    {
      id: 'climate',
      label: '気候',
      type: 'enum',
      values: ['tropical', 'temperate', 'cold', 'arid', 'magical'],
      group: '地理',
    },
    {
      id: 'population',
      label: '人口',
      type: 'int',
      min: 0,
      group: '地理',
    },
    {
      id: 'description',
      label: '説明',
      type: 'multiline_string',
      group: '描写',
    },
    {
      id: 'parent_location',
      label: '親 location',
      type: 'node_ref',
      referencesTemplateId: templateId('template.location'),
      group: '関係',
    },
  ],
};
