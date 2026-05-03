import * as nodePath from 'node:path';
import { NodeFileSystemAdapter } from '@scenario-studio/adapter-node';
import { loadProject } from '@scenario-studio/core';
import type { LocalizedString, ScenarioNode } from '@scenario-studio/core';

// `scenario stats <project-path>` — ノード数 / 文字数 / 未訳キー数。
// 詳細: ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M8

export interface StatsOptions {
  projectPath: string;
  format?: 'text' | 'json';
}

export interface StatsReport {
  nodeCount: number;
  nodesByTemplate: Readonly<Record<string, number>>;
  eraCount: number;
  chapterCount: number;
  sceneCount: number;
  glossaryTermCount: number;
  /** Synopsis Markdown + ノード fields の文字数合計 (LocalizedString は ja を採用、無ければ en)。 */
  totalCharacters: number;
  /** LocalizedString フィールドで ja が空 / 未設定のフィールド数。 */
  untranslatedFields: number;
}

export interface StatsResult {
  exitCode: 0;
  output: string;
  report: StatsReport;
}

export async function stats(options: StatsOptions): Promise<StatsResult> {
  const abs = nodePath.resolve(options.projectPath);
  const adapter = new NodeFileSystemAdapter();
  const handle = adapter.register(abs, nodePath.basename(abs));
  const loaded = await loadProject(adapter, handle);

  const nodesByTemplate: Record<string, number> = {};
  let totalCharacters = 0;
  let untranslatedFields = 0;
  for (const node of loaded.project.nodes.values()) {
    nodesByTemplate[node.templateId] = (nodesByTemplate[node.templateId] ?? 0) + 1;
    const counts = countNodeStrings(node);
    totalCharacters += counts.chars;
    untranslatedFields += counts.untranslated;
  }

  const synopsisChars =
    loaded.project.scenario.projectSynopsis.length +
    loaded.project.scenario.chapters.reduce((sum, ch) => sum + (ch.summary?.length ?? 0), 0);
  totalCharacters += synopsisChars;

  const sceneCount = loaded.project.scenario.chapters.reduce((s, ch) => s + ch.scenes.length, 0);

  const report: StatsReport = {
    nodeCount: loaded.project.nodes.size,
    nodesByTemplate,
    eraCount: loaded.project.eras.all().length,
    chapterCount: loaded.project.scenario.chapters.length,
    sceneCount,
    glossaryTermCount: loaded.project.glossary.length,
    totalCharacters,
    untranslatedFields,
  };

  return {
    exitCode: 0,
    output: options.format === 'json' ? JSON.stringify(report, null, 2) : renderText(report, abs),
    report,
  };
}

function renderText(r: StatsReport, projectPath: string): string {
  const lines: string[] = [];
  lines.push(`Project: ${projectPath}`);
  lines.push('');
  lines.push(`Nodes:        ${r.nodeCount}`);
  for (const [tpl, n] of Object.entries(r.nodesByTemplate).sort()) {
    lines.push(`  ${tpl.padEnd(20)} ${n}`);
  }
  lines.push(`Eras:         ${r.eraCount}`);
  lines.push(`Chapters:     ${r.chapterCount}`);
  lines.push(`Scenes:       ${r.sceneCount}`);
  lines.push(`Glossary:     ${r.glossaryTermCount} terms`);
  lines.push(`Characters:   ${r.totalCharacters.toLocaleString('en-US')}`);
  lines.push(`Untranslated: ${r.untranslatedFields} field(s)`);
  return lines.join('\n');
}

interface StringCounts {
  chars: number;
  untranslated: number;
}

function countNodeStrings(node: ScenarioNode): StringCounts {
  let chars = 0;
  let untranslated = 0;
  for (const value of Object.values(node.fields)) {
    if (typeof value === 'string') {
      chars += value.length;
    } else if (Array.isArray(value)) {
      for (const item of value) if (typeof item === 'string') chars += item.length;
    } else if (value !== null && typeof value === 'object') {
      const ls = value as LocalizedString;
      const ja = typeof ls['ja'] === 'string' ? ls['ja'] : '';
      const en = typeof ls['en'] === 'string' ? ls['en'] : '';
      const text = ja !== '' ? ja : en;
      chars += text.length;
      if (ja === '') untranslated++;
    }
  }
  return { chars, untranslated };
}
