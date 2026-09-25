import { describe, expect, it } from 'vitest';
import { renderSafeMarkdown } from './SafeMarkdown';

describe('renderSafeMarkdown', () => {
  it('renders normal Markdown and resolves project images', () => {
    const html = renderSafeMarkdown(
      '# 題名\n\n**強調** [資料](https://example.com)\n\n![写真](synopsis-images/photo.png)',
      new Map([['synopsis-images/photo.png', 'blob:photo']]),
    );
    expect(html).toContain('<h1>題名</h1>');
    expect(html).toContain('<strong>強調</strong>');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('src="blob:photo"');
  });

  it('escapes HTML rather than executing tags or event handlers', () => {
    const html = renderSafeMarkdown('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('removes executable Markdown link and image destinations', () => {
    const html = renderSafeMarkdown(
      '[危険](javascript:alert%281%29) ![危険](data:text/html,hello) [資料](mailto:writer@example.com)',
    );
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('data:text');
    expect(html).toContain('mailto:writer@example.com');
  });

  it('escapes attribute quotes and encoded entity tricks', () => {
    const html = renderSafeMarkdown(
      '[link](javascript&colon;alert%281%29)\n\n![alt](https://example.com/a "&quot; onerror=evil")',
    );
    expect(html).not.toContain('href="javascript&colon;');
    expect(html).not.toContain('" onerror=');
  });
});
