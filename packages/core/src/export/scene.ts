// Scene script を plain text / Markdown に変換 (PR-K)。
// 入力は .scn.yaml をパースした result (YamlValue) — 厳密な型は弱いので
// 構造を都度判定して安全側で fallback する。
// 詳細: ../../../../Documentation/ScenarioEditor/10_export.md (出力仕様)

import type { YamlValue } from '../yaml/index.js';
import { parseYaml } from '../yaml/index.js';
import type { ScenarioNode } from '../domain/node.js';
import type { NodeId } from '../domain/era.js';

export type ExportFormat = 'text' | 'markdown';

export interface ExportSceneOptions {
  /** Scene の生 YAML テキスト。.scn.yaml の中身。 */
  sceneYaml: string;
  /** display_name 解決用。dev_name (英字) → ScenarioNode の lookup map。 */
  charactersByDevName?: ReadonlyMap<string, ScenarioNode>;
  /** dev_name fallback 用。slug → ScenarioNode。 */
  charactersBySlug?: ReadonlyMap<string, ScenarioNode>;
  /** タイトル を h2 で出力するか (text の場合は無視)。デフォルト true。 */
  includeTitle?: boolean;
}

interface ScriptItem {
  kind: string;
  who?: string;
  text?: string;
  emotion?: string;
  name?: string;
  cue?: string;
  prompt?: string;
}

export function exportScene(format: ExportFormat, opts: ExportSceneOptions): string {
  const { value } = parseYaml(opts.sceneYaml);
  const v = isMapping(value) ? value : {};
  const title = pickTitle(v);
  const script = extractScript(v);
  if (format === 'markdown') {
    return renderMarkdown(title, script, opts);
  }
  return renderText(title, script, opts);
}

function renderText(
  title: string,
  script: readonly ScriptItem[],
  opts: ExportSceneOptions,
): string {
  const lines: string[] = [];
  if (title && (opts.includeTitle ?? true)) {
    lines.push(`=== ${title} ===`);
    lines.push('');
  }
  for (const item of script) {
    switch (item.kind) {
      case 'stage':
        lines.push(`[ステージ] ${item.text ?? ''}`);
        break;
      case 'line':
      case 'action': {
        const who = resolveSpeaker(item.who, opts);
        const emo = item.emotion ? ` (${item.emotion})` : '';
        lines.push(`${who}${emo}: ${item.text ?? ''}`);
        break;
      }
      case 'aside':
        lines.push(`(独白) ${item.text ?? ''}`);
        break;
      case 'sfx':
        lines.push(`[SFX: ${item.name ?? ''}]`);
        break;
      case 'bgm':
        lines.push(`[BGM: ${item.cue ?? ''}]`);
        break;
      case 'choice':
        lines.push(`[選択肢] ${item.prompt ?? ''}`);
        break;
      default:
        lines.push(`[${item.kind}] ${item.text ?? ''}`);
    }
  }
  return lines.join('\n');
}

function renderMarkdown(
  title: string,
  script: readonly ScriptItem[],
  opts: ExportSceneOptions,
): string {
  const lines: string[] = [];
  if (title && (opts.includeTitle ?? true)) {
    lines.push(`## ${title}`);
    lines.push('');
  }
  for (const item of script) {
    switch (item.kind) {
      case 'stage':
        lines.push(`> ${item.text ?? ''}`);
        lines.push('');
        break;
      case 'line':
      case 'action': {
        const who = resolveSpeaker(item.who, opts);
        const emo = item.emotion ? ` *(${item.emotion})*` : '';
        lines.push(`**${who}**${emo}: ${item.text ?? ''}`);
        lines.push('');
        break;
      }
      case 'aside':
        lines.push(`> *(独白)* ${item.text ?? ''}`);
        lines.push('');
        break;
      case 'sfx':
        lines.push(`\`SFX: ${item.name ?? ''}\``);
        lines.push('');
        break;
      case 'bgm':
        lines.push(`\`BGM: ${item.cue ?? ''}\``);
        lines.push('');
        break;
      case 'choice':
        lines.push(`**[選択肢]** ${item.prompt ?? ''}`);
        lines.push('');
        break;
      default:
        lines.push(`\`${item.kind}\` ${item.text ?? ''}`);
        lines.push('');
    }
  }
  return lines.join('\n').trimEnd() + '\n';
}

function resolveSpeaker(who: string | undefined, opts: ExportSceneOptions): string {
  if (!who) return '???';
  // who は dev_name (英字内部呼称) か slug。両方で探す → display_name を返す。
  if (opts.charactersByDevName) {
    const n = opts.charactersByDevName.get(who);
    if (n) return getDisplay(n);
  }
  if (opts.charactersBySlug) {
    const n = opts.charactersBySlug.get(who);
    if (n) return getDisplay(n);
  }
  return who;
}

function getDisplay(n: ScenarioNode): string {
  const d = n.fields['display_name'];
  return typeof d === 'string' && d !== '' ? d : n.slug;
}

function pickTitle(v: { [k: string]: YamlValue }): string {
  const plot = v['plot'];
  if (isMapping(plot) && typeof plot['title'] === 'string') return plot['title'];
  if (typeof v['title'] === 'string') return v['title'];
  return '';
}

function extractScript(v: { [k: string]: YamlValue }): readonly ScriptItem[] {
  const s = v['script'];
  if (!Array.isArray(s)) return [];
  const out: ScriptItem[] = [];
  for (const item of s) {
    if (!isMapping(item)) continue;
    const obj: ScriptItem = {
      kind: typeof item['kind'] === 'string' ? item['kind'] : 'unknown',
    };
    if (typeof item['who'] === 'string') obj.who = item['who'];
    if (typeof item['text'] === 'string') obj.text = item['text'];
    if (typeof item['emotion'] === 'string') obj.emotion = item['emotion'];
    if (typeof item['name'] === 'string') obj.name = item['name'];
    if (typeof item['cue'] === 'string') obj.cue = item['cue'];
    if (typeof item['prompt'] === 'string') obj.prompt = item['prompt'];
    out.push(obj);
  }
  return out;
}

function isMapping(v: unknown): v is { [k: string]: YamlValue } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * ScenarioNode 集合から「dev_name → ScenarioNode」「slug → ScenarioNode」の lookup を構築。
 * Character templateId のみ対象。
 */
export function buildCharacterLookups(nodes: ReadonlyMap<NodeId, ScenarioNode>): {
  byDevName: ReadonlyMap<string, ScenarioNode>;
  bySlug: ReadonlyMap<string, ScenarioNode>;
} {
  const byDevName = new Map<string, ScenarioNode>();
  const bySlug = new Map<string, ScenarioNode>();
  for (const n of nodes.values()) {
    if (n.templateId !== 'template.character') continue;
    bySlug.set(n.slug, n);
    const dev = n.fields['dev_name'];
    if (typeof dev === 'string' && dev !== '') byDevName.set(dev, n);
  }
  return { byDevName, bySlug };
}
