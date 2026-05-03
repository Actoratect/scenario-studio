// Template (ノード型定義) — 03_data-model.md §2 / 20_phase1_implementation_plan.md M2
export type {
  BoolFieldSchema,
  EnumFieldSchema,
  FieldSchema,
  FieldType,
  MediaRefFieldSchema,
  NodeRefFieldSchema,
  NumericFieldSchema,
  StringFieldSchema,
  TemplateDefinition,
  TemplateId,
} from './types.js';
export { NAME_FIELDS, templateId } from './types.js';
export { CHARACTER_TEMPLATE } from './character.js';
export { FACTION_TEMPLATE } from './faction.js';
export { ITEM_TEMPLATE } from './item.js';
export { LOCATION_TEMPLATE } from './location.js';
export { BUILTIN_TEMPLATES, TemplateRegistry } from './registry.js';
