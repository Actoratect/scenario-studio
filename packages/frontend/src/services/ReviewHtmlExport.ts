import { marked } from 'marked';
import {
  buildCharacterLookups,
  exportScene,
  type FileSystemAdapter,
  type LintIssue,
  type ProjectHandle,
  type ProjectModel,
  type ScenarioNode,
} from '@scenario-studio/core';

// PR-AX: Review HTML Export (UX-5)
// プロジェクト全体を「レビュー用 1 枚 HTML」として書き出す。
// 配布前提:
//   - 外部 CSS / JS / フォント不要 (single-file, offline で開ける)
//   - サムネ画像は data:URL で同梱 (相手の手元に画像ファイルを送らなくても表示される)
//   - 目次クリックで該当 scene にジャンプ
//   - レビュー対象に必要な周辺情報 (Cast, Glossary, Lint Top) を末尾に
// 詳細: ../../../../Documentation/ScenarioEditor/22_ux_feature_review.md UX-5

export interface BuildReviewHtmlOptions {
  adapter: FileSystemAdapter;
  handle: ProjectHandle;
  project: ProjectModel;
  /** Lint summary を末尾に含めるか。デフォルト true。 */
  includeLint?: boolean;
  /** Lint issue (公開できる範囲は限定的なので) Top N のみ。デフォルト 30。 */
  lintLimit?: number;
  /** 末尾の Cast / Glossary を含めるか。デフォルト true。 */
  includeAppendix?: boolean;
  /** 現在の Lint 結果。LintService.issues() を渡す。 */
  issues?: readonly LintIssue[];
}

export async function buildReviewHtml(opts: BuildReviewHtmlOptions): Promise<string> {
  const { project } = opts;
  const lookups = buildCharacterLookups(project.nodes);

  const projectSynopsisHtml = mdToSafeHtml(project.scenario.projectSynopsis);
  const generated = new Date().toISOString();

  const tocItems: { id: string; chapterTitle: string; sceneTitle: string }[] = [];
  const sceneSections: string[] = [];

  for (const chapter of project.scenario.chapters) {
    for (const scene of chapter.scenes) {
      const path = `Scenarios/${chapter.slug}/${scene.relativePath}`;
      const exists = await opts.adapter.exists(opts.handle, path);
      if (!exists) continue;
      const yaml = await opts.adapter.read(opts.handle, path);
      const md = exportScene('markdown', {
        sceneYaml: yaml,
        charactersByDevName: lookups.byDevName,
        charactersBySlug: lookups.bySlug,
        includeTitle: false,
      });
      const id = anchorId(chapter.slug, scene.slug);
      tocItems.push({ id, chapterTitle: chapter.title, sceneTitle: scene.title });
      sceneSections.push(`
        <section class="scene" id="${escapeHtml(id)}">
          <h3 class="scene-title">
            <span class="scene-chapter">${escapeHtml(chapter.title)}</span>
            <span class="scene-sep">/</span>
            ${escapeHtml(scene.title)}
          </h3>
          <div class="scene-body">${mdToSafeHtml(md)}</div>
        </section>
      `);
    }
  }

  const characterCards = await renderCharacterCards(opts.adapter, opts.handle, project.nodes);

  const tocHtml = tocItems
    .map(
      (t) =>
        `<li><a href="#${escapeHtml(t.id)}"><span class="toc-ch">${escapeHtml(t.chapterTitle)}</span> / ${escapeHtml(t.sceneTitle)}</a></li>`,
    )
    .join('\n');

  const includeAppendix = opts.includeAppendix ?? true;
  const includeLint = opts.includeLint ?? true;

  const glossaryHtml =
    includeAppendix && project.glossary.length > 0
      ? `
      <section class="appendix" id="appendix-glossary">
        <h2>用語集</h2>
        <table class="glossary">
          <thead><tr><th>用語</th><th>別表記</th><th>禁止</th><th>説明</th></tr></thead>
          <tbody>
            ${project.glossary
              .map(
                (g) => `<tr>
              <td><strong>${escapeHtml(g.term)}</strong></td>
              <td>${escapeHtml(g.aliases.join(', '))}</td>
              <td class="forbidden">${escapeHtml(g.forbidden.join(', '))}</td>
              <td>${escapeHtml(g.description ?? '')}</td>
            </tr>`,
              )
              .join('\n')}
          </tbody>
        </table>
      </section>`
      : '';

  const lintHtml = renderLintSummary(opts.issues ?? [], includeLint, opts.lintLimit ?? 30);
  const castHtml =
    includeAppendix && characterCards !== ''
      ? `<section class="appendix" id="appendix-cast"><h2>登場キャラクター</h2><div class="cast-grid">${characterCards}</div></section>`
      : '';

  const stats = computeStats(project, tocItems.length);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="generator" content="Scenario Studio review-html" />
<meta name="generated-at" content="${escapeHtml(generated)}" />
<title>${escapeHtml(project.settings.name)} — レビュー</title>
<style>${REVIEW_CSS}</style>
</head>
<body>
<header class="page-header">
  <div class="page-title-row">
    <h1>${escapeHtml(project.settings.name)}</h1>
    <span class="badge">レビュー版</span>
  </div>
  <p class="page-meta">
    生成: <time datetime="${escapeHtml(generated)}">${escapeHtml(generated.slice(0, 19).replace('T', ' '))}</time>
    · ${stats.chapters} 章 / ${stats.scenes} シーン / ${stats.characters} キャラ / 用語 ${stats.terms}
  </p>
</header>

${
  projectSynopsisHtml.trim() !== ''
    ? `<section class="synopsis"><h2>プロジェクト概要</h2><div class="prose">${projectSynopsisHtml}</div></section>`
    : ''
}

<nav class="toc"><h2>目次</h2><ol>${tocHtml}</ol></nav>

<main class="scenes">
${sceneSections.join('\n')}
</main>

${castHtml}
${glossaryHtml}
${lintHtml}

<footer class="page-footer">
  <p>Scenario Studio — Review HTML / 単一ファイルで配布可。コメント手段はチャットや GitHub で。</p>
</footer>
</body>
</html>
`;
}

function renderLintSummary(issues: readonly LintIssue[], include: boolean, limit: number): string {
  if (!include || issues.length === 0) return '';
  const errors = issues.filter((i) => i.severity === 'error');
  const warns = issues.filter((i) => i.severity === 'warning');
  const infos = issues.filter((i) => i.severity === 'info');
  const top = issues.slice(0, limit);
  return `
    <section class="appendix" id="appendix-lint">
      <h2>Lint サマリ</h2>
      <p class="lint-counts">
        <span class="lint-pill lint-error">エラー ${errors.length}</span>
        <span class="lint-pill lint-warn">警告 ${warns.length}</span>
        <span class="lint-pill lint-info">情報 ${infos.length}</span>
      </p>
      <ul class="lint-list">
        ${top
          .map(
            (i) => `<li class="lint-item lint-${escapeHtml(i.severity)}">
          <span class="lint-rule">${escapeHtml(i.ruleId)}</span>
          <span class="lint-msg">${escapeHtml(i.message)}</span>
        </li>`,
          )
          .join('\n')}
      </ul>
      ${
        issues.length > limit
          ? `<p class="lint-more">… 他 ${issues.length - limit} 件 (アプリ内 Console で確認)</p>`
          : ''
      }
    </section>`;
}

function computeStats(
  project: ProjectModel,
  sceneCount: number,
): { chapters: number; scenes: number; characters: number; terms: number } {
  let characters = 0;
  for (const n of project.nodes.values()) {
    if (n.templateId === 'template.character') characters += 1;
  }
  return {
    chapters: project.scenario.chapters.length,
    scenes: sceneCount,
    characters,
    terms: project.glossary.length,
  };
}

async function renderCharacterCards(
  adapter: FileSystemAdapter,
  handle: ProjectHandle,
  nodes: ReadonlyMap<string, ScenarioNode>,
): Promise<string> {
  const cards: string[] = [];
  for (const n of nodes.values()) {
    if (n.templateId !== 'template.character') continue;
    const display = (n.fields['display_name'] as string | undefined) ?? n.slug;
    const dev = (n.fields['dev_name'] as string | undefined) ?? '';
    const role = (n.fields['role'] as string | undefined) ?? '';
    const desc = (n.fields['description'] as string | undefined) ?? '';
    const thumbField = n.fields['thumbnail'];
    const thumbDataUrl =
      typeof thumbField === 'string' && thumbField !== ''
        ? await tryReadAsDataUrl(adapter, handle, thumbField)
        : undefined;
    cards.push(`
      <article class="cast-card">
        ${
          thumbDataUrl
            ? `<img src="${thumbDataUrl}" alt="${escapeHtml(display)}" loading="lazy" />`
            : `<div class="cast-thumb-empty">${escapeHtml(display.slice(0, 1))}</div>`
        }
        <div class="cast-meta">
          <h4>${escapeHtml(display)}</h4>
          ${dev ? `<p class="cast-dev"><code>${escapeHtml(dev)}</code></p>` : ''}
          ${role ? `<p class="cast-role">${escapeHtml(role)}</p>` : ''}
          ${desc ? `<p class="cast-desc">${escapeHtml(desc)}</p>` : ''}
        </div>
      </article>`);
  }
  return cards.join('\n');
}

async function tryReadAsDataUrl(
  adapter: FileSystemAdapter,
  handle: ProjectHandle,
  path: string,
): Promise<string | undefined> {
  try {
    if (!(await adapter.exists(handle, path))) return undefined;
    const bytes = await adapter.readBytes(handle, path);
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    const mime =
      ext === 'svg'
        ? 'image/svg+xml'
        : ext === 'jpg' || ext === 'jpeg'
          ? 'image/jpeg'
          : ext === 'png'
            ? 'image/png'
            : ext === 'webp'
              ? 'image/webp'
              : ext === 'gif'
                ? 'image/gif'
                : undefined;
    if (!mime) return undefined;
    return `data:${mime};base64,${bytesToBase64(bytes)}`;
  } catch {
    return undefined;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i] ?? 0);
  return btoa(s);
}

function anchorId(chapterSlug: string, sceneSlug: string): string {
  return `scene--${chapterSlug}--${sceneSlug}`.replace(/[^a-zA-Z0-9_-]/g, '-');
}

// marked は <script> を出力しない (option.sanitize は廃止) が、
// ここでは念のため危険そうな構文を弾いてから渡す。
// CSP も index.html 側で設定しているが review-html は単独配布なので二重防御。
function mdToSafeHtml(md: string): string {
  if (!md || md.trim() === '') return '';
  const html = marked.parse(md, { async: false }) as string;
  // <script>, <iframe>, <object>, <embed>, on* attribute, javascript: URL を除去
  return html
    .replace(/<\s*(script|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|iframe|object|embed|link|meta)[^>]*\/?\s*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const REVIEW_CSS = `
*, *::before, *::after { box-sizing: border-box; }
:root {
  --fg: #1a1f2c; --muted: #5b6577; --bg: #fafbfc; --card: #ffffff;
  --border: #e3e6ec; --accent: #3868d6; --accent-soft: #eaf0fb;
  --error: #b00020; --warn: #b97000; --info: #0b6b8a;
}
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Meiryo", system-ui, sans-serif;
  font-size: 15px; line-height: 1.7; }
body { max-width: 880px; margin: 0 auto; padding: 32px 24px 80px; }
h1 { font-size: 1.8rem; margin: 0; }
h2 { font-size: 1.25rem; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
h3 { font-size: 1.05rem; margin: 20px 0 8px; }
h4 { font-size: 0.95rem; margin: 10px 0 4px; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
code { background: #eef2f7; padding: 1px 4px; border-radius: 3px; font-size: 0.85em; }
.page-header { margin-bottom: 24px; }
.page-title-row { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.badge { background: var(--accent-soft); color: var(--accent); padding: 2px 10px; border-radius: 999px; font-size: 0.78rem; font-weight: 600; }
.page-meta { color: var(--muted); font-size: 0.85rem; margin: 6px 0 0; }
.synopsis .prose { background: var(--card); padding: 12px 16px; border: 1px solid var(--border); border-radius: 8px; }
.toc ol { padding-left: 20px; columns: 2 280px; column-gap: 24px; }
.toc li { break-inside: avoid; margin: 2px 0; }
.toc-ch { color: var(--muted); }
.scenes .scene { background: var(--card); border: 1px solid var(--border); border-radius: 8px;
  padding: 16px 20px; margin-bottom: 18px; }
.scene-title { display: flex; align-items: baseline; gap: 6px; margin-top: 0; }
.scene-chapter { color: var(--muted); font-weight: 400; font-size: 0.9rem; }
.scene-sep { color: var(--muted); font-weight: 400; }
.scene-body p { margin: 0 0 6px; }
.scene-body strong { color: var(--accent); }
.scene-body blockquote { border-left: 3px solid var(--border); margin: 6px 0; padding: 2px 12px;
  color: var(--muted); background: #f3f5f9; }
.cast-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.cast-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px;
  padding: 10px; display: flex; gap: 10px; }
.cast-card img { width: 64px; height: 64px; border-radius: 6px; object-fit: cover; }
.cast-thumb-empty { width: 64px; height: 64px; border-radius: 6px; background: var(--accent-soft);
  color: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 1.6rem; font-weight: 600; }
.cast-meta h4 { margin: 0; }
.cast-meta p { margin: 2px 0; font-size: 0.83rem; color: var(--muted); }
.cast-meta .cast-dev code { font-size: 0.75rem; }
table.glossary { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
table.glossary th, table.glossary td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; vertical-align: top; }
table.glossary th { background: var(--accent-soft); }
table.glossary .forbidden { color: var(--error); }
.lint-counts { display: flex; gap: 8px; margin: 4px 0 12px; flex-wrap: wrap; }
.lint-pill { padding: 2px 10px; border-radius: 999px; font-size: 0.78rem; font-weight: 600; border: 1px solid; }
.lint-pill.lint-error { color: var(--error); border-color: var(--error); }
.lint-pill.lint-warn { color: var(--warn); border-color: var(--warn); }
.lint-pill.lint-info { color: var(--info); border-color: var(--info); }
.lint-list { padding: 0; margin: 0; list-style: none; }
.lint-item { display: flex; gap: 8px; padding: 4px 8px; border-left: 3px solid transparent; }
.lint-item.lint-error { border-left-color: var(--error); background: #fdecef; }
.lint-item.lint-warning { border-left-color: var(--warn); background: #fff5e6; }
.lint-item.lint-info { border-left-color: var(--info); background: #e7f4f8; }
.lint-rule { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: var(--muted); font-size: 0.78rem; min-width: 200px; }
.lint-more { color: var(--muted); font-size: 0.85rem; }
.page-footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--border);
  color: var(--muted); font-size: 0.78rem; text-align: center; }
@media print {
  body { max-width: none; padding: 0; }
  .scene { break-inside: avoid; }
  a { color: var(--fg); text-decoration: none; }
}
`;
