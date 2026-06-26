import { createMemo, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import {
  CHARACTER_TEMPLATE,
  resolveNode,
  type EraId,
  type ScenarioNode,
} from '@scenario-studio/core';
import { EraContext } from '../services/EraContext';
import { PanelFocus } from '../services/PanelFocus';
import { ProjectService } from '../services/ProjectService';
import { SelectionContext } from '../services/SelectionContext';
import { NodeThumbnail } from '../global/NodeThumbnail';

// PR-AM: Era Timeline Panel — 横軸 = Era、縦軸 = キャラのガントチャート風一覧。
// 05_timeline.md §3 の MVP 実装。Plot Timeline (Kanban) とは別パネル。
//
// セルの解釈:
//   - 「生存」 (alive): isAlive = true (variant 解決後) または明示的 false が無く variant 無し
//   - 「死亡」 (dead): isAlive = false
//   - 「variant あり」: その Era に variant 定義がある (生存とは独立に表示)
//
// クリック挙動:
//   - キャラ列ヘッダ → Inspector に jump
//   - セル → そのキャラを選択しつつ EraContext を切替

interface NodeRow {
  node: ScenarioNode;
  display: string;
}

interface CellState {
  /** その Era で変動状態 (variant 定義あり) か。 */
  hasVariant: boolean;
  /** 明示的に alive=true として解決される。 */
  alive: boolean;
  /** 明示的に alive=false (または variant で false override) として解決される。 */
  explicitlyDead: boolean;
}

export const EraTimelinePanel: Component<GroupPanelPartInitParameters> = (params) => {
  const ctx = createMemo(() => ProjectService.currentProject());

  const eras = createMemo<readonly { id: EraId; label: string; depth: number }[]>(() => {
    const c = ctx();
    if (!c) return [];
    const all = c.project.eras.all();
    // 階層深度を計算 (ancestorsOf の length - 1)
    return all.map((id) => {
      const def = c.project.eras.get(id);
      return {
        id,
        label: def?.label ?? id,
        depth: c.project.eras.ancestorsOf(id).length - 1,
      };
    });
  });

  const characters = createMemo<readonly NodeRow[]>(() => {
    const c = ctx();
    if (!c) return [];
    const out: NodeRow[] = [];
    for (const node of c.project.nodes.values()) {
      if (node.templateId !== CHARACTER_TEMPLATE.id) continue;
      const display =
        typeof node.fields['display_name'] === 'string' && node.fields['display_name'] !== ''
          ? (node.fields['display_name'] as string)
          : node.slug;
      out.push({ node, display });
    }
    return out.sort((a, b) => a.display.localeCompare(b.display));
  });

  function cellStateFor(row: NodeRow, era: EraId): CellState {
    const c = ctx();
    if (!c) return { hasVariant: false, alive: true, explicitlyDead: false };
    const hasVariant = (row.node.variants ?? []).some((v) => v.eraId === era);
    const resolved = resolveNode(row.node, era, c.project.eras);
    const alive = resolved.isAlive !== false;
    const explicitlyDead = resolved.isAlive === false;
    return { hasVariant, alive, explicitlyDead };
  }

  function jumpToCharacter(row: NodeRow): void {
    SelectionContext.selectNode(row.node.id);
    PanelFocus.focus('inspector-1');
  }

  function selectEra(era: EraId, row?: NodeRow): void {
    EraContext.selectEra(era);
    if (row) SelectionContext.selectNode(row.node.id);
  }

  // 行 / 列の数で空状態判定
  const isEmpty = createMemo(() => eras().length === 0 || characters().length === 0);

  return (
    <div class="panel-content panel-era-timeline">
      <header class="panel-era-timeline-header">
        <span>
          Era Timeline · <code>{params.api.id}</code>
        </span>
        <span class="panel-era-timeline-stats">
          {eras().length} Era · {characters().length} キャラ
        </span>
      </header>
      <Show
        when={!isEmpty()}
        fallback={
          <div class="panel-era-timeline-empty">
            <Show when={!ctx()}>
              <p>プロジェクトが開かれていません。</p>
            </Show>
            <Show when={ctx() && eras().length === 0}>
              <p>時間軸 がまだ定義されていません。Settings タブで時間軸を追加してください。</p>
            </Show>
            <Show when={ctx() && eras().length > 0 && characters().length === 0}>
              <p>キャラクターがまだいません。Outline タブで「+ Character」を押してください。</p>
            </Show>
          </div>
        }
      >
        <div class="panel-era-timeline-scroll">
          <table class="panel-era-timeline-table">
            <thead>
              <tr>
                <th class="panel-era-timeline-corner">キャラ ＼ 時間軸</th>
                <For each={eras()}>
                  {(era) => (
                    <th
                      class="panel-era-timeline-era-head"
                      classList={{
                        'panel-era-timeline-era-head--active': EraContext.currentEraId() === era.id,
                      }}
                      title={era.id}
                    >
                      <button
                        type="button"
                        class="panel-era-timeline-era-button"
                        style={{ 'padding-left': `${4 + era.depth * 8}px` }}
                        onClick={() => selectEra(era.id)}
                      >
                        {era.label}
                      </button>
                    </th>
                  )}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={characters()}>
                {(row) => (
                  <tr>
                    <th class="panel-era-timeline-row-head">
                      <button
                        type="button"
                        class="panel-era-timeline-row-button"
                        onClick={() => jumpToCharacter(row)}
                        title="Inspector で開く"
                      >
                        <NodeThumbnail node={row.node} size={20} />
                        <span class="panel-era-timeline-row-name">{row.display}</span>
                      </button>
                    </th>
                    <For each={eras()}>
                      {(era) => {
                        const state = cellStateFor(row, era.id);
                        return (
                          <td
                            class="panel-era-timeline-cell"
                            classList={{
                              'panel-era-timeline-cell--alive': state.alive,
                              'panel-era-timeline-cell--dead': state.explicitlyDead,
                              'panel-era-timeline-cell--variant': state.hasVariant,
                              'panel-era-timeline-cell--current':
                                EraContext.currentEraId() === era.id,
                            }}
                          >
                            <button
                              type="button"
                              class="panel-era-timeline-cell-button"
                              onClick={() => selectEra(era.id, row)}
                              title={cellTooltip(row.display, era.label, state)}
                            >
                              <Show when={state.explicitlyDead}>
                                <span aria-hidden="true">✕</span>
                              </Show>
                              <Show when={state.alive && state.hasVariant}>
                                <span aria-hidden="true">◆</span>
                              </Show>
                              <Show when={state.alive && !state.hasVariant}>
                                <span aria-hidden="true">●</span>
                              </Show>
                            </button>
                          </td>
                        );
                      }}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
          <div class="panel-era-timeline-legend">
            <span class="panel-era-timeline-legend-item">
              <span class="panel-era-timeline-cell panel-era-timeline-cell--alive panel-era-timeline-legend-swatch">
                ●
              </span>
              生存 (デフォルト / variant 無し)
            </span>
            <span class="panel-era-timeline-legend-item">
              <span class="panel-era-timeline-cell panel-era-timeline-cell--alive panel-era-timeline-cell--variant panel-era-timeline-legend-swatch">
                ◆
              </span>
              生存 + variant 定義あり
            </span>
            <span class="panel-era-timeline-legend-item">
              <span class="panel-era-timeline-cell panel-era-timeline-cell--dead panel-era-timeline-legend-swatch">
                ✕
              </span>
              isAlive = false (死亡 / 未登場)
            </span>
          </div>
        </div>
      </Show>
    </div>
  );
};

function cellTooltip(name: string, eraLabel: string, state: CellState): string {
  const parts: string[] = [`${name} @ ${eraLabel}`];
  if (state.explicitlyDead) parts.push('isAlive = false');
  else if (state.hasVariant) parts.push('生存 + variant あり (◆)');
  else parts.push('生存 (デフォルト)');
  parts.push('クリックで時間軸切替 + キャラ選択');
  return parts.join(' · ');
}
