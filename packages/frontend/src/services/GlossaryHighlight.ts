import type { GlossaryTerm, ProjectModel } from '@scenario-studio/core';

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
}

export interface GlossaryScanResult {
  hits: readonly GlossaryHit[];
  /** matched (alias / term 含む) のユニーク用語名。 */
  okTerms: readonly string[];
  /** forbidden に該当した断片 (用語表記そのまま)。 */
  violations: readonly { match: string; term: string }[];
}

const EMPTY: GlossaryScanResult = { hits: [], okTerms: [], violations: [] };

/**
 * text 内に登場する用語と禁止表記を全て検出。
 * 大文字小文字は区別しないが、ヒット位置の元表記をそのまま返す。
 * 重複ヒットは hits に複数回出るが、okTerms / violations はユニーク化する。
 */
export function scanGlossary(text: string, glossary: readonly GlossaryTerm[]): GlossaryScanResult {
  if (!text || glossary.length === 0) return EMPTY;
  const hits: GlossaryHit[] = [];
  const okSet = new Set<string>();
  const violationSet = new Map<string, { match: string; term: string }>();
  const lower = text.toLowerCase();
  for (const t of glossary) {
    const okPatterns = [t.term, ...t.aliases];
    for (const p of okPatterns) {
      if (!p) continue;
      const idx = indexOfAll(lower, p.toLowerCase());
      for (const i of idx) {
        const original = text.slice(i, i + p.length);
        hits.push({ match: original, term: t.term, kind: 'ok' });
        okSet.add(t.term);
      }
    }
    for (const f of t.forbidden) {
      if (!f) continue;
      const idx = indexOfAll(lower, f.toLowerCase());
      for (const i of idx) {
        const original = text.slice(i, i + f.length);
        hits.push({ match: original, term: t.term, kind: 'warning' });
        violationSet.set(`${t.term}:${original}`, { match: original, term: t.term });
      }
    }
  }
  return {
    hits,
    okTerms: [...okSet],
    violations: [...violationSet.values()],
  };
}

/**
 * 各 Node の `display_name` を term、aliases / forbidden_aliases を派生 (改行 / 読点 / カンマ
 * 区切り)、description を説明とする GlossaryTerm[] を導出する。
 * 旧 ProjectModel.glossary (Glossary/terms.yaml) の中身も後ろに連結する (互換)。
 */
export function deriveGlossary(project: ProjectModel): readonly GlossaryTerm[] {
  const out: GlossaryTerm[] = [];
  for (const n of project.nodes.values()) {
    const display = typeof n.fields['display_name'] === 'string' ? n.fields['display_name'] : '';
    if (!display.trim()) continue;
    const aliases = splitAliases(n.fields['aliases']);
    const forbidden = splitAliases(n.fields['forbidden_aliases']);
    const desc = typeof n.fields['description'] === 'string' ? n.fields['description'] : undefined;
    const term: GlossaryTerm = {
      term: display.trim(),
      aliases,
      forbidden,
    };
    out.push(desc && desc.trim() ? { ...term, description: desc } : term);
  }
  for (const t of project.glossary) out.push(t);
  return out;
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
