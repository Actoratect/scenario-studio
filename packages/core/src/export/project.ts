// プロジェクト全体を Markdown 文書として export (PR-K)。
// 「章 → シーン → script」の階層を 1 つの Markdown に展開。
// 詳細: ../../../../Documentation/ScenarioEditor/10_export.md

import type { FileSystemAdapter, ProjectHandle } from '../platform.js';
import type { ProjectModel } from '../project/ProjectModel.js';
import { buildCharacterLookups, exportScene } from './scene.js';

export interface ExportProjectOptions {
  adapter: FileSystemAdapter;
  handle: ProjectHandle;
  project: ProjectModel;
  /** プロジェクト全体の synopsis を冒頭に含めるか。デフォルト true。 */
  includeProjectSynopsis?: boolean;
}

/**
 * 全章 / 全シーンを 1 つの Markdown 文書にまとめる。
 * 章順は `Scenarios/_project.yaml`、シーン順は各章の `_scene_index.yaml` に従う
 * (= ProjectModel.scenario.chapters の順)。
 */
export async function exportProjectAsMarkdown(opts: ExportProjectOptions): Promise<string> {
  const { project } = opts;
  const lookups = buildCharacterLookups(project.nodes);
  const lines: string[] = [];

  lines.push(`# ${project.settings.name}`);
  lines.push('');
  if ((opts.includeProjectSynopsis ?? true) && project.scenario.projectSynopsis.trim() !== '') {
    lines.push(project.scenario.projectSynopsis.trim());
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  for (const chapter of project.scenario.chapters) {
    lines.push(`# ${chapter.title}`);
    if (chapter.summary && chapter.summary.trim() !== '') {
      lines.push('');
      lines.push(`*${chapter.summary.trim()}*`);
    }
    lines.push('');
    for (const scene of chapter.scenes) {
      const scenePath = `Scenarios/${chapter.slug}/${scene.relativePath}`;
      const exists = await opts.adapter.exists(opts.handle, scenePath);
      if (!exists) continue;
      const yaml = await opts.adapter.read(opts.handle, scenePath);
      const md = exportScene('markdown', {
        sceneYaml: yaml,
        charactersByDevName: lookups.byDevName,
        charactersBySlug: lookups.bySlug,
        includeTitle: true,
      });
      lines.push(md);
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}
