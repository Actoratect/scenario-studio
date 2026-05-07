import { createMemo, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { eraId, type EraDefinition } from '@scenario-studio/core';
import { EraContext } from '../services/EraContext';
import { ProjectService } from '../services/ProjectService';

// Era 切替 UI (PR-Z)。
// 全 Era を pill 横並びで表示し、現在選択中をハイライト。
// Inspector header に inline 配置することで「時間軸切替」を即座に行える。
//
// 表示するラベルは EraDefinition.label (人間用) を使用。
// 親 Era も含めた階層は indent ではなく 1 列だけ表示 (詳細は Settings タブの Era CRUD)。

export interface EraSelectorProps {
  /** UI 形式: 'pills' (横並びボタン) / 'select' (ドロップダウン)。 */
  variant?: 'pills' | 'select';
  /** ベース選択肢を出すか。デフォルト true。 */
  showBase?: boolean;
  /** 横スクロール許容 (Inspector 内で狭いとき)。 */
  scrollable?: boolean;
}

export const EraSelector: Component<EraSelectorProps> = (props) => {
  const eras = createMemo<readonly EraDefinition[]>(() => {
    const ctx = ProjectService.currentProject();
    if (!ctx) return [];
    const ids = ctx.project.eras.all();
    return ids
      .map((id) => ctx.project.eras.get(id))
      .filter((e): e is EraDefinition => e !== undefined);
  });

  const variant = (): 'pills' | 'select' => props.variant ?? 'pills';

  return (
    <Show
      when={eras().length > 0}
      fallback={<span class="ss-era-selector-empty">時間軸 未定義 — Settings タブで追加</span>}
    >
      <Show
        when={variant() === 'pills'}
        fallback={
          <select
            class="ss-era-selector-select"
            value={EraContext.currentEraId()}
            onChange={(e) => {
              const v = e.currentTarget.value;
              if (v === EraContext.PROJECT_BASE_ERA) EraContext.selectBase();
              else EraContext.selectEra(eraId(v));
            }}
          >
            <Show when={props.showBase ?? true}>
              <option value={EraContext.PROJECT_BASE_ERA}>(基準)</option>
            </Show>
            <For each={eras()}>{(era) => <option value={era.id}>{era.label}</option>}</For>
          </select>
        }
      >
        <div class="ss-era-selector-pills" classList={{ scrollable: props.scrollable }}>
          <Show when={props.showBase ?? true}>
            <button
              type="button"
              class="ss-era-pill"
              classList={{ active: EraContext.isBase() }}
              onClick={() => EraContext.selectBase()}
              title="基準 (variant 適用なし)"
            >
              基準
            </button>
          </Show>
          <For each={eras()}>
            {(era) => (
              <button
                type="button"
                class="ss-era-pill"
                classList={{ active: EraContext.currentEraId() === era.id }}
                onClick={() => EraContext.selectEra(era.id)}
                title={era.id}
              >
                {era.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </Show>
  );
};
