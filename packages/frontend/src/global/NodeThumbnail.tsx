import { createMemo, createResource, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { ScenarioNode } from '@scenario-studio/core';
import { ThumbnailService } from '../services/ThumbnailService';

// ScenarioNode のサムネイル表示 (PR-Q)。
// node.thumbnail があれば <img>、無ければ slug の頭文字をカラーバッジで。
// Inspector / Outline / Graph で共有する。

export interface NodeThumbnailProps {
  node: ScenarioNode;
  size?: number;
  /** template に紐づくフォールバック色 (CUDO パレット)。 */
  fallbackColor?: string;
}

export const NodeThumbnail: Component<NodeThumbnailProps> = (props) => {
  const size = (): number => props.size ?? 32;

  // node.thumbnail を url cache に解決
  const source = createMemo(() => {
    const t = props.node.thumbnail;
    return t ? { id: props.node.id, thumbnail: t } : null;
  });
  const [url] = createResource(source, async (src) => {
    if (!src) return undefined;
    return ThumbnailService.resolveUrl(src.thumbnail);
  });

  const initial = (): string => {
    const display = props.node.fields['display_name'];
    const text = typeof display === 'string' && display !== '' ? display : props.node.slug;
    return text.slice(0, 2);
  };

  return (
    <span class="ss-node-thumb" style={{ width: `${size()}px`, height: `${size()}px` }}>
      <Show
        when={url()}
        fallback={
          <span
            class="ss-node-thumb-initial"
            style={{
              background: props.fallbackColor ?? colorForTemplate(props.node.templateId),
              'font-size': `${size() / 2.5}px`,
            }}
          >
            {initial()}
          </span>
        }
      >
        {(u) => <img src={u()} alt="" class="ss-node-thumb-img" />}
      </Show>
    </span>
  );
};

function colorForTemplate(templateId: string): string {
  switch (templateId) {
    case 'template.character':
      return '#56b4e9';
    case 'template.location':
      return '#009e73';
    case 'template.item':
      return '#e69f00';
    case 'template.faction':
      return '#cc79a7';
    default:
      return '#cccccc';
  }
}
