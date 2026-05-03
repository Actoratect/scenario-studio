import type { FileSystemAdapter, ProjectHandle } from '../platform.js';
import { parseYaml, stringifyYaml } from '../yaml/index.js';
import type { YamlValue } from '../yaml/index.js';

// Glossary (用語集) — Glossary/terms.yaml に集約。
// MVP は単一ファイル + 配列。Phase 3 でカテゴリ別ファイル分割を検討。
// 詳細: ../../../../Documentation/ScenarioEditor/03_data-model.md,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M7

const GLOSSARY_FILE = 'Glossary/terms.yaml';

export interface GlossaryTerm {
  /** 正式表記 (例: "アクトラテクト")。 */
  term: string;
  /** 認められた別表記。空配列なら他に許容なし。 */
  aliases: readonly string[];
  /** 表記揺れ防止: 使ってはいけない別表記 (例: "アクトラ" / "Actra")。 */
  forbidden: readonly string[];
  /** 説明 / 注釈。 */
  description?: string | undefined;
}

export class FsGlossaryRepository {
  constructor(
    private readonly adapter: FileSystemAdapter,
    private readonly handle: ProjectHandle,
  ) {}

  async load(): Promise<readonly GlossaryTerm[]> {
    if (!(await this.adapter.exists(this.handle, GLOSSARY_FILE))) return [];
    const text = await this.adapter.read(this.handle, GLOSSARY_FILE);
    const { value } = parseYaml(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
    const terms = (value as { [k: string]: YamlValue })['terms'];
    if (!Array.isArray(terms)) return [];
    const out: GlossaryTerm[] = [];
    for (const item of terms) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
      const t = item as { [k: string]: YamlValue };
      if (typeof t['term'] !== 'string') continue;
      const term: GlossaryTerm = {
        term: t['term'],
        aliases: stringArray(t['aliases']),
        forbidden: stringArray(t['forbidden']),
      };
      if (typeof t['description'] === 'string') {
        out.push({ ...term, description: t['description'] });
      } else {
        out.push(term);
      }
    }
    return out;
  }

  async save(terms: readonly GlossaryTerm[]): Promise<void> {
    const out: { [k: string]: YamlValue } = {
      schemaVersion: 1,
      kind: 'glossary',
      terms: terms.map((t) => {
        const obj: { [k: string]: YamlValue } = {
          term: t.term,
          aliases: [...t.aliases],
          forbidden: [...t.forbidden],
        };
        if (t.description !== undefined) obj['description'] = t.description;
        return obj;
      }),
    };
    await this.adapter.write(this.handle, GLOSSARY_FILE, stringifyYaml(out));
  }
}

function stringArray(v: YamlValue | undefined): readonly string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}
