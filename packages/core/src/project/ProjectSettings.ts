import type { YamlValue } from '../yaml/index.js';
import { parseYaml, sanitizeYamlTree, stringifyYaml } from '../yaml/index.js';

// プロジェクト設定 (`ProjectSettings.yaml`) のスキーマと読み書き。
// MVP 範囲は最小: name / schemaVersion / locales / ai (空でも OK) / lastEra。
// Phase 1 後半 (M7) で ai セクションを provider 設定に拡張、M4 で era / variant に。
// 詳細: ../../../../Documentation/ScenarioEditor/03_data-model.md, 11_ai-workflow.md §9

export const PROJECT_SETTINGS_FILE = 'ProjectSettings.yaml';
export const CURRENT_PROJECT_SCHEMA_VERSION = 1;

export interface ProjectSettings {
  schemaVersion: number;
  name: string;
  /** 表示用 locale (UI 言語ではなく、コンテンツの primary 言語)。MVP は ja / en の 2 種を想定。 */
  locales: readonly string[];
  /** ProjectSettings.yaml に書く AI セクション (M7 で本格化)。M1 では空 object 許可。 */
  ai?: { readonly [key: string]: YamlValue };
  /** Era スライダの初期位置 (M4 で本格化)。M1 では undefined OK。 */
  lastEra?: string;
}

export function defaultProjectSettings(name: string): ProjectSettings {
  return {
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    name,
    locales: ['ja', 'en'],
  };
}

export function serializeProjectSettings(settings: ProjectSettings): string {
  // YamlValue の制約に合わせて undefined キーを落とす
  const out: Record<string, YamlValue> = {
    schemaVersion: settings.schemaVersion,
    name: settings.name,
    locales: [...settings.locales],
  };
  if (settings.ai !== undefined) {
    out['ai'] = { ...settings.ai };
  }
  if (settings.lastEra !== undefined) {
    out['lastEra'] = settings.lastEra;
  }
  return stringifyYaml(sanitizeYamlTree(out));
}

export function parseProjectSettings(text: string): ProjectSettings {
  const { value } = parseYaml(text);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('ProjectSettings.yaml: top-level must be a mapping');
  }
  const v = value as { [key: string]: YamlValue };

  const schemaVersion = expectNumber(v, 'schemaVersion', CURRENT_PROJECT_SCHEMA_VERSION);
  if (schemaVersion > CURRENT_PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `ProjectSettings.yaml: schemaVersion ${schemaVersion} is newer than supported ${CURRENT_PROJECT_SCHEMA_VERSION} — upgrade the editor`,
    );
  }

  const name = expectString(v, 'name', 'Untitled');
  const locales = expectStringArray(v, 'locales', ['ja']);

  const settings: ProjectSettings = {
    schemaVersion,
    name,
    locales,
  };
  if (v['ai'] !== undefined) {
    if (typeof v['ai'] === 'object' && v['ai'] !== null && !Array.isArray(v['ai'])) {
      settings.ai = v['ai'] as { [key: string]: YamlValue };
    }
  }
  if (typeof v['lastEra'] === 'string') {
    settings.lastEra = v['lastEra'];
  }
  return settings;
}

function expectNumber(v: { [key: string]: YamlValue }, key: string, fallback: number): number {
  const value = v[key];
  if (typeof value === 'number') return value;
  return fallback;
}

function expectString(v: { [key: string]: YamlValue }, key: string, fallback: string): string {
  const value = v[key];
  if (typeof value === 'string') return value;
  return fallback;
}

function expectStringArray(
  v: { [key: string]: YamlValue },
  key: string,
  fallback: readonly string[],
): readonly string[] {
  const value = v[key];
  if (!Array.isArray(value)) return fallback;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') out.push(item);
  }
  return out.length === 0 ? fallback : out;
}
