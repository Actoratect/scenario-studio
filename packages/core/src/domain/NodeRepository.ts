import { ulid } from 'ulid';
import type { FileSystemAdapter, ProjectHandle } from '../platform.js';
import { parseYaml, sanitizeYamlTree, stringifyYaml } from '../yaml/index.js';
import type { YamlValue } from '../yaml/index.js';
import { nodeId, type NodeId } from './era.js';
import type { ScenarioNode, NodeVariant } from './node.js';
import type { TemplateId, TemplateRegistry } from './templates/index.js';
import { defaultFields } from './template-engine.js';

// Node 永続化 (`Nodes/<directory>/<slug>.yaml`) の入出力。
// 1 ノード = 1 ファイル原則 (L-2 確定方針、Phase 1 着手前チェック §6)。
// 詳細: ../../../../Documentation/ScenarioEditor/03_data-model.md §1, §1.3,
//       ../../../../Documentation/ScenarioEditor/08_file-format.md §3,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M2

const NODES_ROOT = 'Nodes';

export interface NodeRepository {
  /** プロジェクト内の全ノードを load して Map を返す。 */
  loadAll(): Promise<ReadonlyMap<NodeId, ScenarioNode>>;
  /** 1 ノードを `Nodes/<directory>/<slug>.yaml` に書き戻す。 */
  save(node: ScenarioNode): Promise<void>;
  /** slug を変更してファイル名追従。 */
  rename(id: NodeId, newSlug: string): Promise<void>;
  /** ノードを削除 (参照孤児はここでは検査せず Lint 側で警告)。 */
  delete(id: NodeId): Promise<void>;
  /** PR-AH: node を保存するときの相対パス (Nodes/<dir>/<slug>.yaml)。 */
  pathFor(node: ScenarioNode): string;
  /** PR-AH: 現在の node 内容を YAML 文字列にシリアライズ (write されるはずの内容)。 */
  serializeForSave(node: ScenarioNode): string;
}

export interface CreateNodeOptions {
  templateId: TemplateId;
  slug: string;
  fields?: { readonly [key: string]: YamlValue };
  variants?: readonly NodeVariant[];
}

/**
 * 新規 ScenarioNode のひな形を作る (id は ULID)。
 * テンプレートの defaultValue が fields の base になる。
 */
export function createNode(templates: TemplateRegistry, options: CreateNodeOptions): ScenarioNode {
  const template = templates.get(options.templateId);
  const base = defaultFields(template);
  // YamlValue は FieldValue より広いので、知っているキーのみ採用する型ナロー
  const merged: { [key: string]: import('./node.js').FieldValue } = { ...base };
  if (options.fields) {
    for (const [k, v] of Object.entries(options.fields)) {
      const narrowed = v as import('./node.js').FieldValue;
      merged[k] = narrowed;
    }
  }
  const node: ScenarioNode = {
    id: nodeId(`01${ulid()}`),
    templateId: options.templateId,
    slug: options.slug,
    fields: merged,
  };
  if (options.variants !== undefined) {
    return { ...node, variants: options.variants };
  }
  return node;
}

export class FsNodeRepository implements NodeRepository {
  constructor(
    private readonly adapter: FileSystemAdapter,
    private readonly handle: ProjectHandle,
    private readonly templates: TemplateRegistry,
  ) {}

  async loadAll(): Promise<ReadonlyMap<NodeId, ScenarioNode>> {
    const out = new Map<NodeId, ScenarioNode>();
    for (const template of this.templates.list()) {
      const glob = `${NODES_ROOT}/${template.directory}/*.yaml`;
      const files = await this.adapter.list(this.handle, glob);
      for (const file of files) {
        // ファイル名 = slug (拡張子 .yaml を取った部分)。`.gitkeep` 等の特殊ファイルは除外。
        const segs = file.split('/');
        const last = segs[segs.length - 1];
        if (!last || !last.endsWith('.yaml')) continue;
        const text = await this.adapter.read(this.handle, file);
        const node = this.parseNode(text, template.id, last.replace(/\.yaml$/, ''));
        out.set(node.id, node);
      }
    }
    return out;
  }

  async save(node: ScenarioNode): Promise<void> {
    await this.adapter.write(this.handle, this.pathFor(node), this.serializeNode(node));
  }

  pathFor(node: ScenarioNode): string {
    const directory = this.templates.directoryOf(node.templateId as TemplateId);
    return `${NODES_ROOT}/${directory}/${node.slug}.yaml`;
  }

  serializeForSave(node: ScenarioNode): string {
    return this.serializeNode(node);
  }

  async rename(id: NodeId, newSlug: string): Promise<void> {
    if (!isValidSlug(newSlug)) {
      throw new Error(`rename: invalid slug "${newSlug}" (must match /^[a-z0-9_-]+$/)`);
    }
    const all = await this.loadAll();
    const target = all.get(id);
    if (!target) throw new Error(`rename: node ${id} not found`);
    if (target.slug === newSlug) return;

    const directory = this.templates.directoryOf(target.templateId as TemplateId);
    const oldPath = `${NODES_ROOT}/${directory}/${target.slug}.yaml`;
    const newPath = `${NODES_ROOT}/${directory}/${newSlug}.yaml`;
    if (await this.adapter.exists(this.handle, newPath)) {
      throw new Error(`rename: target slug "${newSlug}" already exists at ${newPath}`);
    }
    const renamed: ScenarioNode = { ...target, slug: newSlug };
    await this.adapter.write(this.handle, newPath, this.serializeNode(renamed));
    await this.adapter.delete(this.handle, oldPath);
  }

  async delete(id: NodeId): Promise<void> {
    const all = await this.loadAll();
    const target = all.get(id);
    if (!target) return; // idempotent
    const directory = this.templates.directoryOf(target.templateId as TemplateId);
    const path = `${NODES_ROOT}/${directory}/${target.slug}.yaml`;
    await this.adapter.delete(this.handle, path);
  }

  private parseNode(text: string, templateId: TemplateId, slug: string): ScenarioNode {
    const { value } = parseYaml(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`parseNode: ${slug}.yaml top-level must be a mapping`);
    }
    const v = value as { [key: string]: YamlValue };
    const idStr = typeof v['id'] === 'string' ? v['id'] : `01${ulid()}`;
    const fields =
      typeof v['fields'] === 'object' && v['fields'] !== null && !Array.isArray(v['fields'])
        ? (v['fields'] as { [key: string]: import('./node.js').FieldValue })
        : {};
    const node: ScenarioNode = {
      id: nodeId(idStr),
      templateId,
      slug,
      fields,
    };
    let result: ScenarioNode = node;
    if (typeof v['thumbnail'] === 'string') {
      result = Object.assign({}, result, { thumbnail: v['thumbnail'] });
    }
    // PR-AC: thumbnailRect (x / y / size, 0..1)
    if (
      typeof v['thumbnailRect'] === 'object' &&
      v['thumbnailRect'] !== null &&
      !Array.isArray(v['thumbnailRect'])
    ) {
      const r = v['thumbnailRect'] as { [k: string]: YamlValue };
      const x = typeof r['x'] === 'number' ? r['x'] : 0;
      const y = typeof r['y'] === 'number' ? r['y'] : 0;
      const size = typeof r['size'] === 'number' ? r['size'] : 1;
      result = Object.assign({}, result, { thumbnailRect: { x, y, size } });
    }
    return result;
  }

  private serializeNode(node: ScenarioNode): string {
    const out: { [key: string]: YamlValue } = {
      schemaVersion: 1,
      kind: 'node',
      id: node.id,
      templateId: node.templateId,
      slug: node.slug,
    };
    if (node.thumbnail !== undefined) out['thumbnail'] = node.thumbnail;
    // PR-AC: thumbnailRect (clamp 0..1)
    if (node.thumbnailRect !== undefined) {
      const r = node.thumbnailRect;
      out['thumbnailRect'] = {
        x: clamp01(r.x),
        y: clamp01(r.y),
        size: clamp01(r.size),
      };
    }
    // FieldValue (Scalar | FieldArray | FieldRecord) は YamlValue の subset だが、
    // 索引署名の不変性ゆえに TS は構造的代入を認めない → as 経由でナロー
    out['fields'] = { ...node.fields } as YamlValue;
    if (node.variants !== undefined && node.variants.length > 0) {
      out['variants'] = node.variants.map((v) => {
        const obj: { [key: string]: YamlValue } = { eraId: v.eraId };
        if (v.fieldsOverride !== undefined)
          obj['fieldsOverride'] = { ...v.fieldsOverride } as YamlValue;
        if (v.thumbnailOverride !== undefined) obj['thumbnailOverride'] = v.thumbnailOverride;
        if (v.isAlive !== undefined && v.isAlive !== null) obj['isAlive'] = v.isAlive;
        return obj;
      });
    }
    // M8 セキュリティ: 書き出す直前に C0 制御文字を除去 (キー / 値の両方)
    return stringifyYaml(sanitizeYamlTree(out));
  }
}

const SLUG_PATTERN = /^[a-z0-9_-]+$/;
export function isValidSlug(s: string): boolean {
  return SLUG_PATTERN.test(s);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
