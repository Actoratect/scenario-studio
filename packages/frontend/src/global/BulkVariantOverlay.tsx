import { createMemo, createSignal, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { EraId, FieldValue, NodeId } from '@scenario-studio/core';
import { ProjectService } from '../services/ProjectService';
import { Toast } from '../services/Toast';
import { VariantsService } from '../services/VariantsService';

// PR-AP: Variant override の bulk 適用 overlay。
// Inspector の variant 行から「他の Era にも同じ値を適用…」で起動。
// 現在の Era + 値を引数で受け取り、ユーザに別 Era の checkbox を選ばせて
// 一括 setFieldOverride。
//
// 詳細: ../../../../Documentation/ScenarioEditor/05_timeline.md §3 (Era 比較)

export interface BulkVariantRequest {
  nodeId: NodeId;
  fieldId: string;
  fieldLabel: string;
  /** 起点 Era (既に override がある era、これ自体は対象から除外)。 */
  sourceEraId: EraId;
  value: FieldValue;
}

const [open, setOpen] = createSignal(false);
const [request, setRequest] = createSignal<BulkVariantRequest | undefined>(undefined);

export const BulkVariantOverlay = {
  open,
  show(req: BulkVariantRequest): void {
    setRequest(req);
    setOpen(true);
  },
  hide(): void {
    setOpen(false);
    setRequest(undefined);
  },
};

const BulkVariantUi: Component = () => {
  const req = (): BulkVariantRequest => request()!;
  const [selected, setSelected] = createSignal<ReadonlySet<EraId>>(new Set<EraId>());
  const [busy, setBusy] = createSignal(false);

  // 選択候補 = 起点 Era 以外の全 Era
  const candidates = createMemo<readonly { id: EraId; label: string }[]>(() => {
    const ctx = ProjectService.currentProject();
    if (!ctx) return [];
    const cur = req();
    return ctx.project.eras
      .all()
      .filter((id) => id !== cur.sourceEraId)
      .map((id) => ({ id, label: ctx.project.eras.get(id)?.label ?? id }));
  });

  function toggle(id: EraId): void {
    const cur = selected();
    const next = new Set(cur);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function selectAll(): void {
    setSelected(new Set(candidates().map((c) => c.id)));
  }

  function selectNone(): void {
    setSelected(new Set<EraId>());
  }

  async function apply(): Promise<void> {
    const cur = req();
    const ids = [...selected()];
    if (ids.length === 0) return;
    setBusy(true);
    try {
      await VariantsService.bulkSetFieldOverride(cur.nodeId, ids, cur.fieldId, cur.value);
      Toast.success(`${ids.length} 件の Era に「${cur.fieldLabel}」を一括適用`);
      BulkVariantOverlay.hide();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="ss-modal-backdrop" onClick={() => BulkVariantOverlay.hide()}>
      <div class="ss-modal" onClick={(e) => e.stopPropagation()}>
        <h3>他の Era にも適用</h3>
        <p class="ss-modal-caption">
          フィールド <code>{req().fieldLabel}</code> の現在の override 値を、 選択した別 Era にも
          variant override として書き込みます。
        </p>
        <pre class="ss-bulk-variant-value">{previewValue(req().value)}</pre>
        <div class="ss-bulk-variant-actions-row">
          <button type="button" onClick={selectAll}>
            全選択
          </button>
          <button type="button" onClick={selectNone}>
            全解除
          </button>
          <span class="ss-bulk-variant-count">{selected().size} 件選択中</span>
        </div>
        <div class="ss-bulk-variant-list">
          <For each={candidates()} fallback={<p class="ss-modal-caption">他に Era がありません</p>}>
            {(era) => (
              <label class="ss-bulk-variant-row">
                <input
                  type="checkbox"
                  checked={selected().has(era.id)}
                  onChange={() => toggle(era.id)}
                />
                <span class="ss-bulk-variant-label">{era.label}</span>
                <code class="ss-bulk-variant-id">{era.id}</code>
              </label>
            )}
          </For>
        </div>
        <div class="ss-modal-actions">
          <button type="button" disabled={busy()} onClick={() => BulkVariantOverlay.hide()}>
            キャンセル
          </button>
          <span class="ss-modal-spacer" />
          <button
            type="button"
            data-variant="primary"
            disabled={busy() || selected().size === 0}
            onClick={() => void apply()}
          >
            <Show when={busy()} fallback={<>{selected().size} Era に適用</>}>
              適用中…
            </Show>
          </button>
        </div>
      </div>
    </div>
  );
};

function previewValue(v: FieldValue): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v, null, 2);
}

export const BulkVariantOverlayRoot: Component = () => {
  return (
    <Show when={open() && request()}>
      <BulkVariantUi />
    </Show>
  );
};
