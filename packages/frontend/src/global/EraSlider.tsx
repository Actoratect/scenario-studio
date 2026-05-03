import { For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { eraId } from '@scenario-studio/core';
import { EraContext } from '../services/EraContext';

// グローバルツールバー上の Era スライダ (= 現状はドロップダウンの簡易版)。
// 真のスライダ (連続移動 + 年入力) は Phase 1 後半で。
// 詳細: ../../../../Documentation/ScenarioEditor/05_timeline.md §2.1, §2.2,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M4

export const EraSlider: Component = () => {
  return (
    <div class="era-slider">
      <span class="era-slider-label">Era:</span>
      <select
        class="era-slider-select"
        value={EraContext.currentEraId()}
        onChange={(e) => {
          const v = e.currentTarget.value;
          if (v === EraContext.PROJECT_BASE_ERA) EraContext.selectBase();
          else EraContext.selectEra(eraId(v));
        }}
      >
        <option value={EraContext.PROJECT_BASE_ERA}>(base — variant なし)</option>
        <For each={EraContext.availableEras()}>{(id) => <option value={id}>{id}</option>}</For>
      </select>
      <Show when={EraContext.availableEras().length === 0}>
        <span class="era-slider-hint">Eras 未定義 — Phase 1 後半で UI 追加予定</span>
      </Show>
    </div>
  );
};
