import type { FileSystemAdapter, ProjectHandle } from '../platform.js';
import { parseYaml, sanitizeYamlTree, stringifyYaml } from '../yaml/index.js';
import type { YamlValue } from '../yaml/index.js';
import { buildEraIndex, eraId, type EraDefinition, type EraId, type EraIndex } from './era.js';

// Era 永続化 — Eras/*.yaml に 1 ファイル = 1 Era で保存。
// 詳細: ../../../../Documentation/ScenarioEditor/05_timeline.md §1,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M4

const ERAS_ROOT = 'Eras';

export class FsEraRepository {
  constructor(
    private readonly adapter: FileSystemAdapter,
    private readonly handle: ProjectHandle,
  ) {}

  /** Eras/*.yaml を全部読んで EraIndex を構築。空ディレクトリなら空 index。 */
  async loadAll(): Promise<EraIndex> {
    const files = await this.adapter.list(this.handle, `${ERAS_ROOT}/*.yaml`);
    const eras: EraDefinition[] = [];
    for (const file of files) {
      const last = file.split('/').pop();
      if (!last || !last.endsWith('.yaml')) continue;
      const text = await this.adapter.read(this.handle, file);
      const era = this.parseEra(text, last.replace(/\.yaml$/, ''));
      eras.push(era);
    }
    return buildEraIndex(eras);
  }

  /** 1 Era を Eras/<id>.yaml に保存。id にスラッシュ等は含まれない前提。 */
  async save(era: EraDefinition): Promise<void> {
    const fileName = sanitizeEraIdForFile(era.id);
    const path = `${ERAS_ROOT}/${fileName}.yaml`;
    await this.adapter.write(this.handle, path, this.serializeEra(era));
  }

  async delete(id: EraId): Promise<void> {
    const fileName = sanitizeEraIdForFile(id);
    const path = `${ERAS_ROOT}/${fileName}.yaml`;
    await this.adapter.delete(this.handle, path);
  }

  private parseEra(text: string, fileBase: string): EraDefinition {
    const { value } = parseYaml(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`parseEra: ${fileBase}.yaml top-level must be a mapping`);
    }
    const v = value as { [key: string]: YamlValue };
    const id = typeof v['id'] === 'string' ? eraId(v['id']) : eraId(`era.${fileBase}`);
    const label = typeof v['label'] === 'string' ? v['label'] : fileBase;
    const era: EraDefinition = { id, label };
    if (typeof v['parent'] === 'string') {
      era.parent = eraId(v['parent']);
    }
    if (
      Array.isArray(v['yearRange']) &&
      v['yearRange'].length === 2 &&
      typeof v['yearRange'][0] === 'number' &&
      typeof v['yearRange'][1] === 'number'
    ) {
      era.yearRange = [v['yearRange'][0], v['yearRange'][1]];
    }
    return era;
  }

  private serializeEra(era: EraDefinition): string {
    const out: { [key: string]: YamlValue } = {
      schemaVersion: 1,
      kind: 'era',
      id: era.id,
      label: era.label,
    };
    if (era.parent !== undefined) out['parent'] = era.parent;
    if (era.yearRange !== undefined) {
      out['yearRange'] = [era.yearRange[0], era.yearRange[1]];
    }
    return stringifyYaml(sanitizeYamlTree(out));
  }
}

/** EraId から `era.` プレフィックスを残しつつファイル名安全に。 */
function sanitizeEraIdForFile(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_');
}
