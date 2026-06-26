import { ulid } from 'ulid';
import type { FileSystemAdapter, ProjectHandle } from '../platform.js';
import { parseYaml, sanitizeYamlTree, stringifyYaml } from '../yaml/index.js';
import type { YamlValue } from '../yaml/index.js';
import { nodeId } from './era.js';
import type { Relation } from './Relation.js';
import { relationId } from './Relation.js';

// `Relations/relations.yaml` の load / save。
// MVP は単一ファイル + array モデル。書込みは「全件 dump」(size 数百で問題なし)。
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md §2

const RELATIONS_FILE = 'Relations/relations.yaml';

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
      // source/target は from/to も別名として受け付ける (外部変換データ互換)。
      const source = pickString(r['source']) ?? pickString(r['from']);
      const target = pickString(r['target']) ?? pickString(r['to']);
      // text が本体。旧スキーマ (type / label / description / label_from) からもフォールバックで拾う。
      const text =
        pickNonEmpty(r['text']) ??
        pickNonEmpty(r['type']) ??
        pickNonEmpty(r['label']) ??
        pickNonEmpty(r['description']) ??
        pickNonEmpty(r['labelFrom']) ??
        pickNonEmpty(r['label_from']);
      if (
        typeof r['id'] !== 'string' ||
        source === undefined ||
        target === undefined ||
        text === undefined
      ) {
        continue;
      }
      out.push({
        id: relationId(r['id']),
        source: nodeId(source),
        target: nodeId(target),
        text,
      });
    }
    return out;
  }

  async save(relations: readonly Relation[]): Promise<void> {
    const out: { [k: string]: YamlValue } = {
      schemaVersion: 1,
      kind: 'relations',
      relations: relations.map((r) => ({
        id: r.id,
        source: r.source,
        target: r.target,
        text: r.text,
      })),
    };
    await this.adapter.write(this.handle, RELATIONS_FILE, stringifyYaml(sanitizeYamlTree(out)));
  }
}

function pickString(v: YamlValue | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function pickNonEmpty(v: YamlValue | undefined): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

/** 新規 Relation のひな形 (id 自動生成)。 */
export function createRelation(input: Omit<Relation, 'id'>): Relation {
  return { id: relationId(`rel.${ulid()}`), ...input };
}
