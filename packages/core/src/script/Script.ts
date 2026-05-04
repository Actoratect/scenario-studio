// Scene script のブロックモデル + YAML 双方向 (PR-AA)。
// .scn.yaml の `script:` 配列を typed object に parse、編集後に再 serialize。
// - line: who + emotion + text
// - stage: text
// - aside: who? + text
// - action: who + text
// - sfx: name
// - bgm: cue + fade
// - choice: prompt + options ({ text, then? })
// - unknown: 未知 kind は raw を保持して round-trip
//
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §5

import { parseYaml, sanitizeYamlTree, stringifyYaml } from '../yaml/index.js';
import type { YamlValue } from '../yaml/index.js';

export interface ScriptBlockLine {
  kind: 'line';
  who: string;
  emotion?: string | undefined;
  text: string;
}
export interface ScriptBlockStage {
  kind: 'stage';
  text: string;
}
export interface ScriptBlockAside {
  kind: 'aside';
  who?: string | undefined;
  text: string;
}
export interface ScriptBlockAction {
  kind: 'action';
  who: string;
  text: string;
}
export interface ScriptBlockSfx {
  kind: 'sfx';
  name: string;
}
export interface ScriptBlockBgm {
  kind: 'bgm';
  cue: string;
  fade?: number | undefined;
}
export interface ScriptBlockChoiceOption {
  text: string;
  then?: string | undefined;
}
export interface ScriptBlockChoice {
  kind: 'choice';
  prompt: string;
  options?: readonly ScriptBlockChoiceOption[];
}
export interface ScriptBlockUnknown {
  kind: 'unknown';
  raw: YamlValue;
}

export type ScriptBlock =
  | ScriptBlockLine
  | ScriptBlockStage
  | ScriptBlockAside
  | ScriptBlockAction
  | ScriptBlockSfx
  | ScriptBlockBgm
  | ScriptBlockChoice
  | ScriptBlockUnknown;

export interface ParsedScene {
  /** scene 全体の YAML 値 (script を除く top-level)。serialize で再書出。 */
  meta: { [k: string]: YamlValue };
  /** plot.title を抽出 (UI 表示用)。 */
  title: string;
  /** plot.cast を抽出 (UI 表示用)。 */
  cast: readonly string[];
  /** script: 配列を block に parse。 */
  blocks: readonly ScriptBlock[];
}

export function parseSceneYaml(text: string): ParsedScene {
  const { value } = parseYaml(text);
  const meta = isMapping(value) ? { ...value } : {};
  const plot = isMapping(meta['plot']) ? (meta['plot'] as { [k: string]: YamlValue }) : undefined;
  const title = plot && typeof plot['title'] === 'string' ? plot['title'] : '';
  const cast: string[] = [];
  if (plot && Array.isArray(plot['cast'])) {
    for (const c of plot['cast']) if (typeof c === 'string') cast.push(c);
  }
  const rawScript = meta['script'];
  delete meta['script']; // serialize 時に blocks から再構築するため
  const blocks: ScriptBlock[] = [];
  if (Array.isArray(rawScript)) {
    for (const item of rawScript) {
      blocks.push(parseBlock(item));
    }
  }
  return { meta, title, cast, blocks };
}

function parseBlock(item: YamlValue): ScriptBlock {
  if (!isMapping(item)) return { kind: 'unknown', raw: item };
  const kind = typeof item['kind'] === 'string' ? item['kind'] : '';
  switch (kind) {
    case 'line':
      return {
        kind: 'line',
        who: typeof item['who'] === 'string' ? item['who'] : '',
        ...(typeof item['emotion'] === 'string' ? { emotion: item['emotion'] } : {}),
        text: typeof item['text'] === 'string' ? item['text'] : '',
      };
    case 'stage':
      return {
        kind: 'stage',
        text: typeof item['text'] === 'string' ? item['text'] : '',
      };
    case 'aside':
      return {
        kind: 'aside',
        ...(typeof item['who'] === 'string' ? { who: item['who'] } : {}),
        text: typeof item['text'] === 'string' ? item['text'] : '',
      };
    case 'action':
      return {
        kind: 'action',
        who: typeof item['who'] === 'string' ? item['who'] : '',
        text: typeof item['text'] === 'string' ? item['text'] : '',
      };
    case 'sfx':
      return {
        kind: 'sfx',
        name: typeof item['name'] === 'string' ? item['name'] : '',
      };
    case 'bgm':
      return {
        kind: 'bgm',
        cue: typeof item['cue'] === 'string' ? item['cue'] : '',
        ...(typeof item['fade'] === 'number' ? { fade: item['fade'] } : {}),
      };
    case 'choice': {
      const out: ScriptBlockChoice = {
        kind: 'choice',
        prompt: typeof item['prompt'] === 'string' ? item['prompt'] : '',
      };
      if (Array.isArray(item['options'])) {
        const options: ScriptBlockChoiceOption[] = [];
        for (const o of item['options']) {
          if (!isMapping(o)) continue;
          const opt: ScriptBlockChoiceOption = {
            text: typeof o['text'] === 'string' ? o['text'] : '',
          };
          if (typeof o['then'] === 'string') opt.then = o['then'];
          options.push(opt);
        }
        out.options = options;
      }
      return out;
    }
    default:
      return { kind: 'unknown', raw: item };
  }
}

export function serializeSceneYaml(parsed: ParsedScene): string {
  const out: { [k: string]: YamlValue } = { ...parsed.meta };
  out['script'] = parsed.blocks.map(blockToYaml);
  return stringifyYaml(sanitizeYamlTree(out));
}

function blockToYaml(b: ScriptBlock): YamlValue {
  switch (b.kind) {
    case 'line': {
      const obj: { [k: string]: YamlValue } = { kind: 'line', who: b.who };
      if (b.emotion !== undefined) obj['emotion'] = b.emotion;
      obj['text'] = b.text;
      return obj;
    }
    case 'stage':
      return { kind: 'stage', text: b.text };
    case 'aside': {
      const obj: { [k: string]: YamlValue } = { kind: 'aside' };
      if (b.who !== undefined) obj['who'] = b.who;
      obj['text'] = b.text;
      return obj;
    }
    case 'action':
      return { kind: 'action', who: b.who, text: b.text };
    case 'sfx':
      return { kind: 'sfx', name: b.name };
    case 'bgm': {
      const obj: { [k: string]: YamlValue } = { kind: 'bgm', cue: b.cue };
      if (b.fade !== undefined) obj['fade'] = b.fade;
      return obj;
    }
    case 'choice': {
      const obj: { [k: string]: YamlValue } = { kind: 'choice', prompt: b.prompt };
      if (b.options) {
        obj['options'] = b.options.map((o) => {
          const opt: { [k: string]: YamlValue } = { text: o.text };
          if (o.then !== undefined) opt['then'] = o.then;
          return opt;
        });
      }
      return obj;
    }
    case 'unknown':
      return b.raw;
  }
}

function isMapping(v: unknown): v is { [k: string]: YamlValue } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
