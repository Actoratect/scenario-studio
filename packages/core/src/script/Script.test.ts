import { describe, expect, it } from 'vitest';
import { parseSceneYaml, serializeSceneYaml } from './Script.js';

describe('scene script image block', () => {
  it('round-trips image blocks', () => {
    const parsed = parseSceneYaml(`script:
  - kind: image
    src: Media/script/storyboard.png
    alt: storyboard
    caption: Opening composition
`);

    expect(parsed.blocks[0]).toEqual({
      kind: 'image',
      src: 'Media/script/storyboard.png',
      alt: 'storyboard',
      caption: 'Opening composition',
    });

    const serialized = serializeSceneYaml(parsed);
    expect(serialized).toContain('kind: image');
    expect(serialized).toContain('src: Media/script/storyboard.png');
    expect(serialized).toContain('caption: Opening composition');
  });
});
