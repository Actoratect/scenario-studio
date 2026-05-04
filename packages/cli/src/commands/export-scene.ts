import * as nodePath from 'node:path';
import { NodeFileSystemAdapter } from '@scenario-studio/adapter-node';
import {
  buildCharacterLookups,
  exportProjectAsMarkdown,
  exportScene,
  loadProject,
} from '@scenario-studio/core';

// PR-K: scenario export-scene <project> --chapter X --scene Y --format text|md
//       scenario export-all <project> [--format md]
// 詳細: ../../../../Documentation/ScenarioEditor/10_export.md

export interface ExportSceneCmdOptions {
  projectPath: string;
  chapterSlug: string;
  sceneSlug: string;
  format?: 'text' | 'markdown';
}

export interface ExportCmdResult {
  exitCode: 0 | 1;
  output: string;
}

export async function exportSceneCmd(opts: ExportSceneCmdOptions): Promise<ExportCmdResult> {
  const abs = nodePath.resolve(opts.projectPath);
  const adapter = new NodeFileSystemAdapter();
  const handle = adapter.register(abs, nodePath.basename(abs));
  const loaded = await loadProject(adapter, handle);

  const path = `Scenarios/${opts.chapterSlug}/${opts.sceneSlug}.scn.yaml`;
  if (!(await adapter.exists(handle, path))) {
    return { exitCode: 1, output: `Scene not found: ${path}` };
  }
  const yaml = await adapter.read(handle, path);
  const lookups = buildCharacterLookups(loaded.project.nodes);
  const out = exportScene(opts.format === 'text' ? 'text' : 'markdown', {
    sceneYaml: yaml,
    charactersByDevName: lookups.byDevName,
    charactersBySlug: lookups.bySlug,
  });
  return { exitCode: 0, output: out };
}

export interface ExportAllCmdOptions {
  projectPath: string;
}

export async function exportAllCmd(opts: ExportAllCmdOptions): Promise<ExportCmdResult> {
  const abs = nodePath.resolve(opts.projectPath);
  const adapter = new NodeFileSystemAdapter();
  const handle = adapter.register(abs, nodePath.basename(abs));
  const loaded = await loadProject(adapter, handle);
  const md = await exportProjectAsMarkdown({
    adapter,
    handle,
    project: loaded.project,
  });
  return { exitCode: 0, output: md };
}
