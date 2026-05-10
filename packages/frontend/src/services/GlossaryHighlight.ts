import {
  CHARACTER_TEMPLATE,
  EVENT_TEMPLATE,
  FACTION_TEMPLATE,
  ITEM_TEMPLATE,
  LOCATION_TEMPLATE,
  type GlossaryTerm,
  type ProjectModel,
} from '@scenario-studio/core';

export interface DerivedGlossaryTerm extends GlossaryTerm {
  sourceKind: 'character' | 'location' | 'item' | 'faction' | 'event' | 'glossary' | 'node';
  sourceLabel: string;
  nodeId?: string | undefined;
  templateId?: string | undefined;
}

// PR-AF: Script visual editor のテキスト中の Glossary 用語を検出。
// - matched: term 本体 + aliases (ok)
// - violations: forbidden (warning)
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §3.3
//
// PR (ux-overhaul): 用語集 panel 廃止に伴い、各 Node の display_name + aliases を
// 動的に GlossaryTerm[] へ変換して使えるようにした。レガシーの project.glossary も
// 引き続き scan 対象に残す (古いプロジェクトとの互換)。

export interface GlossaryHit {
  /** ヒットしたテキスト断片 (元の表記そのまま)。 */
  match: string;
  /** 該当する正式表記 (term)。 */
  term: string;
  /** 種別: ok = term + alias、warning = forbidden で出てしまった */
  kind: 'ok' | 'warning';
  sourceKind?: DerivedGlossaryTerm['sourceKind'] | undefined;
  sourceLabel?: string | undefined;
}

export interface GlossaryOkTerm {
  term: string;
  sourceKind?: DerivedGlossaryTerm['sourceKind'] | undefined;
  sourceLabel?: string | undefined;
}

export interface GlossaryScanResult {
  hits: readonly GlossaryHit[];
  /** matched (alias / term 含む) のユニーク用語名。 */
  okTerms: readonly string[];
  okItems: readonly GlossaryOkTerm[];
  /** forbidden に該当した断片 (用語表記そのまま)。 */
  violations: readonly {
    match: string;
    term: string;
    sourceKind?: DerivedGlossaryTerm['sourceKind'] | undefined;
    sourceLabel?: string | undefined;
  }[];
}

const EMPTY: GlossaryScanResult = { hits: [], okTerms: [], okItems: [], violations: [] };

/**
 * text 内に登場する用語と禁止表記を全て検出。
 * 大文字小文字は区別しないが、ヒット位置の元表記をそのまま返す。
 * 重複ヒットは hits に複数回出るが、okTerms / violations はユニーク化する。
 */
export function scanGlossary(text: string, glossary: readonly GlossaryTerm[]): GlossaryScanResult {
  if (!text || glossary.length === 0) return EMPTY;
  const hits: GlossaryHit[] = [];
  const okMap = new Map<string, GlossaryOkTerm>();
  const violationSet = new Map<
    string,
    {
      match: string;
      term: string;
      sourceKind?: DerivedGlossaryTerm['sourceKind'] | undefined;
      sourceLabel?: string | undefined;
    }
  >();
  const lower = text.toLowerCase();
  for (const t of glossary) {
    const meta = glossaryMeta(t);
    const okPatterns = [t.term, ...t.aliases];
    for (const p of okPatterns) {
      if (!p) continue;
      const idx = indexOfAll(lower, p.toLowerCase());
      for (const i of idx) {
        const original = text.slice(i, i + p.length);
        hits.push({ match: original, term: t.term, kind: 'ok', ...meta });
        if (!okMap.has(t.term)) okMap.set(t.term, { term: t.term, ...meta });
      }
    }
    for (const f of t.forbidden) {
      if (!f) continue;
      const idx = indexOfAll(lower, f.toLowerCase());
      for (const i of idx) {
        const original = text.slice(i, i + f.length);
        hits.push({ match: original, term: t.term, kind: 'warning', ...meta });
        violationSet.set(`${t.term}:${original}`, { match: original, term: t.term, ...meta });
      }
    }
  }
  return {
    hits,
    okTerms: [...okMap.keys()],
    okItems: [...okMap.values()],
    violations: [...violationSet.values()],
  };
}

/**
 * 各 Node の `display_name` を term、aliases / forbidden_aliases を派生 (改行 / 読点 / カンマ
 * 区切り)、description を説明とする GlossaryTerm[] を導出する。
 * 旧 ProjectModel.glossary (Glossary/terms.yaml) の中身も後ろに連結する (互換)。
 */
export function deriveGlossary(project: ProjectModel): readonly DerivedGlossaryTerm[] {
  const out: DerivedGlossaryTerm[] = [];
  for (const n of project.nodes.values()) {
    const display = typeof n.fields['display_name'] === 'string' ? n.fields['display_name'] : '';
    if (!display.trim()) continue;
    const aliases = splitAliases(n.fields['aliases']);
    const forbidden = splitAliases(n.fields['forbidden_aliases']);
    const desc = typeof n.fields['description'] === 'string' ? n.fields['description'] : undefined;
    const term: DerivedGlossaryTerm = {
      term: display.trim(),
      aliases,
      forbidden,
      sourceKind: sourceKindForTemplate(n.templateId),
      sourceLabel: sourceLabelForTemplate(n.templateId),
      nodeId: n.id,
      templateId: n.templateId,
    };
    out.push(desc && desc.trim() ? { ...term, description: desc } : term);
  }
  for (const t of project.glossary) {
    out.push({ ...t, sourceKind: 'glossary', sourceLabel: '用語' });
  }
  return out;
}

function glossaryMeta(t: GlossaryTerm): Pick<GlossaryHit, 'sourceKind' | 'sourceLabel'> {
  const withSource = t as Partial<DerivedGlossaryTerm>;
  return {
    sourceKind: withSource.sourceKind,
    sourceLabel: withSource.sourceLabel,
  };
}

function sourceKindForTemplate(templateId: string): DerivedGlossaryTerm['sourceKind'] {
  if (templateId === CHARACTER_TEMPLATE.id) return 'character';
  if (templateId === LOCATION_TEMPLATE.id) return 'location';
  if (templateId === ITEM_TEMPLATE.id) return 'item';
  if (templateId === FACTION_TEMPLATE.id) return 'faction';
  if (templateId === EVENT_TEMPLATE.id) return 'event';
  return 'node';
}

function sourceLabelForTemplate(templateId: string): string {
  if (templateId === CHARACTER_TEMPLATE.id) return 'キャラ';
  if (templateId === LOCATION_TEMPLATE.id) return '場所';
  if (templateId === ITEM_TEMPLATE.id) return 'アイテム';
  if (templateId === FACTION_TEMPLATE.id) return '勢力';
  if (templateId === EVENT_TEMPLATE.id) return '出来事';
  return '要素';
}

function splitAliases(value: unknown): readonly string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(/[\n,、]/u)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

function indexOfAll(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const out: number[] = [];
  let from = 0;
  while (true) {
    const i = haystack.indexOf(needle, from);
    if (i === -1) break;
    out.push(i);
    from = i + needle.length;
  }
  return out;
}
