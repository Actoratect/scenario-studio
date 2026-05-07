import { createSignal, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { AiPatchQueue, type AiPatch } from '../services/AiPatchQueue';
import { scanGlossaryFixes } from '../services/GlossaryPatchScanner';
import { ProjectService } from '../services/ProjectService';
import { Toast } from '../services/Toast';

// PR-AY: AI Patch Queue Overlay (UX-6)
// AI / scanner が積んだ patch を「読んで承認/却下」する UI。
// v1 は node-field 単位の string patch のみを diff 表示。
// 起動: Cmd+Shift+Q (Queue)、または header の 📝 ボタン。
// 詳細: ../../../../Documentation/ScenarioEditor/22_ux_feature_review.md UX-6

const [open, setOpen] = createSignal(false);

export const AiPatchQueueOverlay = {
  open,
  show(): void {
    setOpen(true);
  },
  hide(): void {
    setOpen(false);
  },
  toggle(): void {
    setOpen(!open());
  },
};

const Ui: Component = () => {
  const [busy, setBusy] = createSignal(false);

  function runScan(): void {
    const ctx = ProjectService.currentProject();
    if (!ctx) {
      Toast.error('プロジェクトが開かれていません');
      return;
    }
    setBusy(true);
    try {
      const result = scanGlossaryFixes(ctx.project);
      if (result.proposedCount === 0) {
        Toast.info('用語修正候補は見つかりませんでした');
      } else {
        Toast.success(`${result.proposedCount} 件の patch を queue に追加しました`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function acceptAll(): Promise<void> {
    setBusy(true);
    try {
      await AiPatchQueue.acceptAll();
    } finally {
      setBusy(false);
    }
  }

  function rejectAll(): void {
    if (!window.confirm('未承認の patch をすべて却下しますか?')) return;
    AiPatchQueue.rejectAll();
  }

  return (
    <div class="ss-modal-backdrop" onClick={() => AiPatchQueueOverlay.hide()}>
      <div class="ss-modal ss-modal--wide" onClick={(e) => e.stopPropagation()}>
        <h3>📝 AI Patch Queue</h3>
        <p class="ss-patch-help">
          AI / 用語スキャナが提案した変更を、行ごとに承認 / 却下します。承認した変更は 通常の Undo
          に乗ります。
        </p>

        <div class="ss-modal-actions">
          <button
            type="button"
            disabled={busy()}
            onClick={runScan}
            title="Glossary forbidden を全 node text field でスキャン"
          >
            🔎 用語修正スキャン
          </button>
          <span class="ss-modal-spacer" />
          <span class="ss-patch-count">未承認 {AiPatchQueue.pendingCount()} 件</span>
          <button
            type="button"
            disabled={busy() || AiPatchQueue.pendingCount() === 0}
            onClick={() => void acceptAll()}
          >
            すべて採用
          </button>
          <button
            type="button"
            disabled={busy() || AiPatchQueue.pendingCount() === 0}
            onClick={rejectAll}
          >
            すべて却下
          </button>
          <button type="button" onClick={() => AiPatchQueueOverlay.hide()}>
            閉じる
          </button>
        </div>

        <Show
          when={AiPatchQueue.all().length > 0}
          fallback={
            <p class="ss-patch-empty">
              patch がありません。「用語修正スキャン」を実行するか、フィールドの右クリック AI
              から提案を queue に積んでください。
            </p>
          }
        >
          <ul class="ss-patch-list">
            <For each={AiPatchQueue.all()}>{(p) => <PatchRow patch={p} />}</For>
          </ul>
        </Show>
      </div>
    </div>
  );
};

const PatchRow: Component<{ patch: AiPatch }> = (props) => {
  const [busy, setBusy] = createSignal(false);
  const beforeText = (): string => stringifyValue(props.patch.before);
  const afterText = (): string => stringifyValue(props.patch.after);

  async function accept(): Promise<void> {
    setBusy(true);
    try {
      await AiPatchQueue.accept(props.patch.id);
    } finally {
      setBusy(false);
    }
  }

  function reject(): void {
    AiPatchQueue.reject(props.patch.id);
  }

  return (
    <li class={`ss-patch-item ss-patch-${props.patch.status}`}>
      <div class="ss-patch-head">
        <span class="ss-patch-source">{sourceLabel(props.patch.source)}</span>
        <span class="ss-patch-target">
          <strong>{props.patch.target.nodeLabel}</strong>
          <span class="ss-patch-field"> · {props.patch.target.fieldId}</span>
        </span>
        <span class="ss-patch-summary">{props.patch.summary}</span>
        <span class={`ss-patch-status ss-patch-status-${props.patch.status}`}>
          {statusLabel(props.patch.status)}
        </span>
      </div>
      <Show when={props.patch.rationale}>
        <p class="ss-patch-rationale">{props.patch.rationale}</p>
      </Show>
      <div class="ss-patch-diff">
        <div class="ss-patch-diff-side ss-patch-diff-before">
          <span class="ss-patch-diff-label">変更前</span>
          <pre>{beforeText()}</pre>
        </div>
        <div class="ss-patch-diff-side ss-patch-diff-after">
          <span class="ss-patch-diff-label">変更後</span>
          <pre>{afterText()}</pre>
        </div>
      </div>
      <Show when={props.patch.status === 'pending'}>
        <div class="ss-patch-actions">
          <button type="button" disabled={busy()} onClick={() => void accept()}>
            ✅ 採用
          </button>
          <button type="button" disabled={busy()} onClick={reject}>
            ✗ 却下
          </button>
        </div>
      </Show>
    </li>
  );
};

function stringifyValue(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  return JSON.stringify(v, null, 2);
}

function sourceLabel(s: AiPatch['source']): string {
  switch (s) {
    case 'glossary-fix':
      return '🔤 用語';
    case 'ai-suggestion':
      return '🤖 AI';
    case 'scene-meta-suggestion':
      return '🎬 メタ';
    case 'manual':
      return '✋ 手動';
  }
}

function statusLabel(s: AiPatch['status']): string {
  switch (s) {
    case 'pending':
      return '未承認';
    case 'accepted':
      return '採用済';
    case 'rejected':
      return '却下';
  }
}

export const AiPatchQueueOverlayRoot: Component = () => {
  return (
    <Show when={open()}>
      <Ui />
    </Show>
  );
};
