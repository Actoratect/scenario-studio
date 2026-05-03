import { templateId } from './types.js';
import type { TemplateDefinition } from './types.js';

export const LOCATION_TEMPLATE: TemplateDefinition = {
  id: templateId('template.location'),
  directory: 'locations',
  displayName: { ja: '場所', en: 'Location' },
  icon: 'builtin:map-pin',
  defaultThumbnailColor: '#7ab98a',
  fields: [
    {
      id: 'display_name',
      label: { ja: '表示名', en: 'Display Name' },
      type: 'localized_string',
      required: true,
    },
    {
      id: 'region',
      label: { ja: '地域', en: 'Region' },
      type: 'string',
    },
    {
      id: 'climate',
      label: { ja: '気候', en: 'Climate' },
      type: 'enum',
      values: ['tropical', 'temperate', 'cold', 'arid', 'magical'],
    },
    {
      id: 'population',
      label: { ja: '人口', en: 'Population' },
      type: 'int',
      min: 0,
    },
    {
      id: 'description',
      label: { ja: '説明', en: 'Description' },
      type: 'multiline_string',
    },
    {
      id: 'parent_location',
      label: { ja: '親 location', en: 'Parent Location' },
      type: 'node_ref',
      referencesTemplateId: templateId('template.location'),
    },
  ],
};
