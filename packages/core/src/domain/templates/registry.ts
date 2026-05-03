import { CHARACTER_TEMPLATE } from './character.js';
import { FACTION_TEMPLATE } from './faction.js';
import { ITEM_TEMPLATE } from './item.js';
import { LOCATION_TEMPLATE } from './location.js';
import type { TemplateDefinition, TemplateId } from './types.js';

// Template の lookup と一覧。MVP は 4 builtin が `BUILTIN_TEMPLATES` に固定登録。
// Phase 3 で「ユーザ定義テンプレート」を `Templates/<custom>.yaml` から動的追加。

export const BUILTIN_TEMPLATES: readonly TemplateDefinition[] = [
  CHARACTER_TEMPLATE,
  LOCATION_TEMPLATE,
  ITEM_TEMPLATE,
  FACTION_TEMPLATE,
];

export class TemplateRegistry {
  private readonly templates = new Map<TemplateId, TemplateDefinition>();

  constructor(initial: Iterable<TemplateDefinition> = BUILTIN_TEMPLATES) {
    for (const t of initial) this.register(t);
  }

  register(template: TemplateDefinition): void {
    if (this.templates.has(template.id)) {
      throw new Error(`Template already registered: ${template.id}`);
    }
    this.templates.set(template.id, template);
  }

  get(id: TemplateId): TemplateDefinition {
    const t = this.templates.get(id);
    if (!t) throw new Error(`Template not registered: ${id}`);
    return t;
  }

  tryGet(id: TemplateId): TemplateDefinition | undefined {
    return this.templates.get(id);
  }

  list(): readonly TemplateDefinition[] {
    return Array.from(this.templates.values());
  }

  /** templateId に紐づく `directory` (例: characters / locations / items / factions) を返す。 */
  directoryOf(id: TemplateId): string {
    return this.get(id).directory;
  }
}
