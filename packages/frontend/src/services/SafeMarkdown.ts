import { Marked } from 'marked';

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
}

function safeUrl(value: string, image: boolean): string | undefined {
  const url = value.trim();
  if ([...url].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
    return undefined;
  const scheme = /^[a-z][a-z0-9+.-]*:/i.exec(url)?.[0].toLowerCase();
  if (!scheme || scheme === 'http:' || scheme === 'https:' || (!image && scheme === 'mailto:'))
    return url;
  if (image && (scheme === 'blob:' || /^data:image\/(png|jpeg|gif|webp);base64,/i.test(url)))
    return url;
  return undefined;
}

/** Markdown の装飾を保ちつつ、埋め込み HTML と実行可能な URL を無効にする。 */
export function renderSafeMarkdown(
  markdown: string,
  imageUrls: ReadonlyMap<string, string> = new Map(),
): string {
  const renderer = new Marked({
    gfm: true,
    breaks: true,
    renderer: {
      html: ({ text }) => escapeHtml(text),
      link({ href, title, tokens }) {
        const content = this.parser.parseInline(tokens);
        const url = safeUrl(href, false);
        if (url === undefined) return content;
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
        return `<a href="${escapeHtml(url)}"${titleAttr} rel="noopener noreferrer">${content}</a>`;
      },
      image({ href, title, text }) {
        const url = safeUrl(imageUrls.get(href) ?? href, true);
        if (url === undefined) return escapeHtml(text);
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
        return `<img src="${escapeHtml(url)}" alt="${escapeHtml(text)}"${titleAttr}>`;
      },
    },
  });
  return renderer.parse(markdown, { async: false });
}
