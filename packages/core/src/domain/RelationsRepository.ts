import { ulid } from 'ulid';
import type { FileSystemAdapter, ProjectHandle } from '../platform.js';
import { parseYaml, sanitizeYamlTree, stringifyYaml } from '../yaml/index.js';
import type { YamlValue } from '../yaml/index.js';
import { nodeId } from './era.js';
import type { Relation } from './Relation.js';
import { relationId } from './Relation.js';
import type { RelationType } from './relations.js';
import { RELATION_TYPES } from './relations.js';

// `Relations/relations.yaml` の load / save。
// MVP は単一ファイル + array モデル。書込みは「全件 dump」(size 数百で問題なし)。
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md §2

const RELATIONS_FILE = 'Relations/relations.yaml';

const VALID_TYPES = new Set<RelationType>(RELATION_TYPES.map((r) => r.id));

export class FsRelationsRepository {
  constructor(
    private readonly adapter: FileSystemAdapter,
    private readonly handle: ProjectHandle,
  ) {}

  async load(): Promise<readonly Relation[]> {
    if (!(await this.adapter.exists(this.handle, RELATIONS_FILE))) return [];
    const text = await this.adapter.read(this.handle, RELATIONS_FILE);
    const { value } = parseYaml(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
    const items = (value as { [k: string]: YamlValue })['relations'];
    if (!Array.isArray(items)) return [];
    const out: Relation[] = [];
    for (const item of items) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
      const r = item as { [k: string]: YamlValue };
      if (
        typeof r['id'] !== 'string' ||
        typeof r['source'] !== 'string' ||
        typeof r['target'] !== 'string' ||
        typeof r['type'] !== 'string' ||
        !VALID_TYPES.has(r['type'] as RelationType)
      ) {
        continue;
      }
      const rel: Relation = {
        id: relationId(r['id']),
        source: nodeId(r['source']),
        target: nodeId(r['target']),
        type: r['type'] as RelationType,
      };
      if (typeof r['label'] === 'string') {
        out.push({ ...rel, label: r['label'] });
      } else {
        out.push(rel);
      }
    }
    return out;
  }

  async save(relations: readonly Relation[]): Promise<void> {
    const out: { [k: string]: YamlValue } = {
      schemaVersion: 1,
      kind: 'relations',
      relations: relations.map((r) => {
        const obj: { [k: string]: YamlValue } = {
          id: r.id,
          source: r.source,
          target: r.target,
          type: r.type,
        };
        if (r.label !== undefined && r.label !== '') obj['label'] = r.label;
        return obj;
      }),
    };
    await this.adapter.write(this.handle, RELATIONS_FILE, stringifyYaml(sanitizeYamlTree(out)));
  }
}

/** 新規 Relation のひな形 (id 自動生成)。 */
export function createRelation(input: Omit<Relation, 'id'>): Relation {
  return { id: relationId(`rel.${ulid()}`), ...input };
}
