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

  // PR-AC: thumbnailRect が指定されていれば、background-image で crop 表示。
  // size: 0..1 (rect size, 1 で全体)。背景サイズは (1/size)*100% で拡大、
  // background-position は rect の中心が円の中心に来るよう % 計算。
  const cropStyle = (): { [k: string]: string } | undefined => {
    const u = url();
    const rect = props.node.thumbnailRect;
    if (!u || !rect) return undefined;
    const cropSize = rect.size > 0 ? rect.size : 1;
    const scalePct = (1 / cropSize) * 100;
    // crop の左上 (rect.x, rect.y) を thumbnail の左上に持ってくる:
    // background-position-x = -(rect.x / (1 - cropSize)) * 100% (when cropSize < 1)
    const denom = 1 - cropSize;
    const posX = denom > 0 ? (rect.x / denom) * 100 : 0;
    const posY = denom > 0 ? (rect.y / denom) * 100 : 0;
    return {
      'background-image': `url(${u})`,
      'background-size': `${scalePct}% ${scalePct}%`,
      'background-position': `${posX}% ${posY}%`,
      'background-repeat': 'no-repeat',
    };
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
        {(u) => (
          <Show when={cropStyle()} fallback={<img src={u()} alt="" class="ss-node-thumb-img" />}>
            <span class="ss-node-thumb-img ss-node-thumb-img--cropped" style={cropStyle()} />
          </Show>
        )}
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
