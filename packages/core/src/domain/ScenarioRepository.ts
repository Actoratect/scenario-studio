import type { FileSystemAdapter, ProjectHandle } from '../platform.js';
import { parseYaml, sanitizeYamlTree, stringifyYaml } from '../yaml/index.js';
import type { YamlValue } from '../yaml/index.js';
import {
  chapterId,
  sceneId,
  type Chapter,
  type ScenarioStructure,
  type SceneMeta,
} from './scenario.js';

// Scenarios/ ディレクトリの load/save。
// MVP は `_project.yaml` の chapters 順 + 各章ディレクトリの `_scene_index.yaml` で
// シーン順を管理。Scene 本体 (script: array) は M6。
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §1,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M4

const SCENARIOS_ROOT = 'Scenarios';
const PROJECT_FILE = `${SCENARIOS_ROOT}/_project.yaml`;
const SYNOPSIS_FILE = `${SCENARIOS_ROOT}/synopsis.md`;

export class FsScenarioRepository {
  constructor(
    private readonly adapter: FileSystemAdapter,
    private readonly handle: ProjectHandle,
  ) {}

  async load(): Promise<ScenarioStructure> {
    const synopsis = (await this.adapter.exists(this.handle, SYNOPSIS_FILE))
      ? await this.adapter.read(this.handle, SYNOPSIS_FILE)
      : '';

    const projectExists = await this.adapter.exists(this.handle, PROJECT_FILE);
    if (!projectExists) {
      // 未初期化プロジェクト: 空の Scenarios。M4 では Outline 側に「章を追加」UI を出す。
      return { projectSynopsis: synopsis, chapters: [] };
    }
    const projectText = await this.adapter.read(this.handle, PROJECT_FILE);
    const { value } = parseYaml(projectText);
    const v = expectMapping(value, '_project.yaml');
    const chapterSlugs = expectStringArray(v, 'chapters');

    const chapters: Chapter[] = [];
    for (const slug of chapterSlugs) {
      const chapter = await this.loadChapter(slug);
      if (chapter) chapters.push(chapter);
    }
    return { projectSynopsis: synopsis, chapters };
  }

  async saveSynopsis(text: string): Promise<void> {
    await this.adapter.write(this.handle, SYNOPSIS_FILE, text);
  }

  /**
   * 章一覧を _project.yaml に書き込む。chapters は順序を保持する。
   * 章ファイル本体 (`_index.yaml`) の作成は addChapter() で。
   */
  async saveProjectIndex(chapters: ReadonlyArray<{ slug: string }>): Promise<void> {
    const out: { [key: string]: YamlValue } = {
      schemaVersion: 1,
      kind: 'scenario_project',
      chapters: chapters.map((c) => c.slug),
    };
    await this.adapter.write(this.handle, PROJECT_FILE, stringifyYaml(sanitizeYamlTree(out)));
  }

  async addChapter(input: { slug: string; title: string; summary?: string }): Promise<Chapter> {
    const dir = `${SCENARIOS_ROOT}/${input.slug}`;
    const indexPath = `${dir}/_index.yaml`;
    if (await this.adapter.exists(this.handle, indexPath)) {
      throw new Error(`Chapter ${input.slug} already exists`);
    }
    const indexOut: { [key: string]: YamlValue } = {
      schemaVersion: 1,
      kind: 'chapter',
      id: `chapter.${input.slug}`,
      slug: input.slug,
      title: input.title,
    };
    if (input.summary !== undefined) indexOut['summary'] = input.summary;
    await this.adapter.write(this.handle, indexPath, stringifyYaml(sanitizeYamlTree(indexOut)));
    // 章直下の synopsis.md と _scene_index.yaml も初期化
    await this.adapter.write(this.handle, `${dir}/synopsis.md`, `# ${input.title}\n\n`);
    await this.adapter.write(
      this.handle,
      `${dir}/_scene_index.yaml`,
      stringifyYaml({ schemaVersion: 1, kind: 'scene_index', scenes: [] }),
    );
    const result: Chapter = {
      id: chapterId(`chapter.${input.slug}`),
      slug: input.slug,
      title: input.title,
      scenes: [],
    };
    if (input.summary !== undefined) {
      return { ...result, summary: input.summary };
    }
    return result;
  }

  /**
   * 章のタイトルを書き換える。slug は変えない (参照が壊れるため)。
   */
  async renameChapter(chapterSlug: string, newTitle: string): Promise<void> {
    const indexPath = `${SCENARIOS_ROOT}/${chapterSlug}/_index.yaml`;
    if (!(await this.adapter.exists(this.handle, indexPath))) {
      throw new Error(`Chapter ${chapterSlug} does not exist`);
    }
    const text = await this.adapter.read(this.handle, indexPath);
    const { value } = parseYaml(text);
    const v = expectMapping(value, indexPath);
    v['title'] = newTitle;
    await this.adapter.write(this.handle, indexPath, stringifyYaml(sanitizeYamlTree(v)));
  }

  /**
   * シーン (.scn.yaml) を削除し、`_scene_index.yaml` からも除外する。
   */
  async removeScene(chapterSlug: string, sceneSlug: string): Promise<void> {
    const chapterDir = `${SCENARIOS_ROOT}/${chapterSlug}`;
    const filePath = `${chapterDir}/${sceneSlug}.scn.yaml`;
    if (await this.adapter.exists(this.handle, filePath)) {
      await this.adapter.delete(this.handle, filePath);
    }
    const sceneIndexPath = `${chapterDir}/_scene_index.yaml`;
    if (!(await this.adapter.exists(this.handle, sceneIndexPath))) return;
    const text = await this.adapter.read(this.handle, sceneIndexPath);
    const { value } = parseYaml(text);
    const v = expectMapping(value, sceneIndexPath);
    const order = expectStringArray(v, 'scenes').filter((s) => s !== sceneSlug);
    await this.adapter.write(
      this.handle,
      sceneIndexPath,
      stringifyYaml(sanitizeYamlTree({ schemaVersion: 1, kind: 'scene_index', scenes: order })),
    );
  }

  /**
   * 章にシーンを 1 つ追加する。`<chapter>/<slug>.scn.yaml` を空のテンプレで作り、
   * `_scene_index.yaml` の末尾に slug を追記する。
   */
  async addScene(input: {
    chapterSlug: string;
    sceneSlug: string;
    title: string;
  }): Promise<SceneMeta> {
    const chapterDir = `${SCENARIOS_ROOT}/${input.chapterSlug}`;
    const indexPath = `${chapterDir}/_index.yaml`;
    if (!(await this.adapter.exists(this.handle, indexPath))) {
      throw new Error(`Chapter ${input.chapterSlug} does not exist`);
    }
    const filePath = `${chapterDir}/${input.sceneSlug}.scn.yaml`;
    if (await this.adapter.exists(this.handle, filePath)) {
      throw new Error(`Scene ${input.sceneSlug} already exists in ${input.chapterSlug}`);
    }
    const sceneText = `schemaVersion: 1
sceneId: scene.${input.sceneSlug}
plot:
  title: ${JSON.stringify(input.title)}
  cast: []

script:
  - { kind: stage, text: "ここに状況を…" }
`;
    await this.adapter.write(this.handle, filePath, sceneText);

    // _scene_index.yaml を読んで slug を append。無ければ新規作成。
    const sceneIndexPath = `${chapterDir}/_scene_index.yaml`;
    let order: string[] = [];
    if (await this.adapter.exists(this.handle, sceneIndexPath)) {
      const text = await this.adapter.read(this.handle, sceneIndexPath);
      const { value } = parseYaml(text);
      const v = expectMapping(value, sceneIndexPath);
      order = expectStringArray(v, 'scenes');
    }
    if (!order.includes(input.sceneSlug)) order.push(input.sceneSlug);
    await this.adapter.write(
      this.handle,
      sceneIndexPath,
      stringifyYaml(sanitizeYamlTree({ schemaVersion: 1, kind: 'scene_index', scenes: order })),
    );

    return {
      id: sceneId(`scene.${input.sceneSlug}`),
      slug: input.sceneSlug,
      title: input.title,
      relativePath: `${input.sceneSlug}.scn.yaml`,
    };
  }

  private async loadChapter(slug: string): Promise<Chapter | undefined> {
    const dir = `${SCENARIOS_ROOT}/${slug}`;
    const indexPath = `${dir}/_index.yaml`;
    if (!(await this.adapter.exists(this.handle, indexPath))) return undefined;
    const text = await this.adapter.read(this.handle, indexPath);
    const { value } = parseYaml(text);
    const v = expectMapping(value, indexPath);
    const id = chapterId(typeof v['id'] === 'string' ? v['id'] : `chapter.${slug}`);
    const title = typeof v['title'] === 'string' ? v['title'] : slug;
    const summary = typeof v['summary'] === 'string' ? v['summary'] : undefined;

    const scenes = await this.loadScenes(dir);
    const chapter: Chapter = { id, slug, title, scenes };
    return summary !== undefined ? { ...chapter, summary } : chapter;
  }

  private async loadScenes(chapterDir: string): Promise<readonly SceneMeta[]> {
    const indexPath = `${chapterDir}/_scene_index.yaml`;
    let order: string[] = [];
    if (await this.adapter.exists(this.handle, indexPath)) {
      const text = await this.adapter.read(this.handle, indexPath);
      const { value } = parseYaml(text);
      const v = expectMapping(value, indexPath);
      order = expectStringArray(v, 'scenes');
    }

    // _scene_index.yaml が空 / 欠落なら、ディレクトリ内 .scn.yaml を slug 順に拾う
    if (order.length === 0) {
      const files = await this.adapter.list(this.handle, `${chapterDir}/*.scn.yaml`);
      order = files
        .map(
          (f) =>
            f
              .split('/')
              .pop()
              ?.replace(/\.scn\.yaml$/, '') ?? '',
        )
        .filter((s) => s !== '')
        .sort();
    }

    const out: SceneMeta[] = [];
    for (const slug of order) {
      const filePath = `${chapterDir}/${slug}.scn.yaml`;
      if (!(await this.adapter.exists(this.handle, filePath))) continue;
      const text = await this.adapter.read(this.handle, filePath);
      const { value } = parseYaml(text);
      const v = isMapping(value) ? value : {};
      const id = sceneId(
        typeof v['sceneId'] === 'string'
          ? v['sceneId']
          : typeof v['id'] === 'string'
            ? v['id']
            : `scene.${slug}`,
      );
      const plotMapping =
        typeof v['plot'] === 'object' && v['plot'] !== null && !Array.isArray(v['plot'])
          ? (v['plot'] as { [k: string]: YamlValue })
          : undefined;
      const title =
        plotMapping && typeof plotMapping['title'] === 'string'
          ? plotMapping['title']
          : typeof v['title'] === 'string'
            ? v['title']
            : slug;
      out.push({
        id,
        slug,
        title,
        relativePath: `${slug}.scn.yaml`,
      });
    }
    return out;
  }
}

function expectMapping(value: unknown, where: string): { [key: string]: YamlValue } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${where}: top-level must be a mapping`);
  }
  return value as { [key: string]: YamlValue };
}

function isMapping(value: unknown): value is { [key: string]: YamlValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectStringArray(v: { [key: string]: YamlValue }, key: string): string[] {
  const value = v[key];
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') out.push(item);
  }
  return out;
}
