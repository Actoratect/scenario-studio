import { createMemo, createSignal, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import {
  LocalAgentHandoff,
  type HandoffPackage,
  type HandoffScope,
} from '../services/LocalAgentHandoff';
import { Toast } from '../services/Toast';

// PR-AU: Local Agent Handoff overlay (UX-8)。
// 起動: WorkspaceShell の 🤝 ボタン or Cmd+Shift+H。
// 表示: prompt package preview + clipboard / save / web UI 起動 ボタン。
//
// 詳細: ../../../../Documentation/ScenarioEditor/22_ux_feature_review.md §E2

const [open, setOpen] = createSignal(false);
const [scopeOverride, setScopeOverride] = createSignal<HandoffScope | undefined>(undefined);

export const LocalAgentHandoffOverlay = {
  open,
  show(scope?: HandoffScope): void {
    setScopeOverride(scope);
    setOpen(true);
  },
  hide(): void {
    setOpen(false);
    setScopeOverride(undefined);
  },
  toggle(): void {
    if (open()) setOpen(false);
    else setOpen(true);
  },
};

const Ui: Component = () => {
  const pkg = createMemo<HandoffPackage | undefined>(() => {
    const scope = scopeOverride() ?? LocalAgentHandoff.inferCurrentScope();
    return LocalAgentHandoff.build(scope);
  });
  const [busy, setBusy] = createSignal(false);

  async function copyClipboard(): Promise<void> {
    const p = pkg();
    if (!p) return;
    try {
      await navigator.clipboard.writeText(p.promptMarkdown);
      Toast.success('プロンプトをコピーしました', 1500);
    } catch (e) {
      Toast.error(`コピー失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function saveToProject(): Promise<void> {
    const p = pkg();
    if (!p) return;
    setBusy(true);
    try {
      const path = await LocalAgentHandoff.saveToProject(p);
      if (path) Toast.success(`保存: ${path}`, 2500);
      else Toast.error('保存に失敗 (プロジェクトが開かれていません)');
    } catch (e) {
      Toast.error(`保存失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function openWebUi(provider: 'chatgpt' | 'claude' | 'gemini'): void {
    const p = pkg();
    if (!p) return;
    // URL の長さ制限を回避するため、先にクリップボード copy + 短いトリガ URL を開く
    void navigator.clipboard.writeText(p.promptMarkdown);
    let url = '';
    if (provider === 'chatgpt') {
      // ChatGPT: 新規スレッド (q= は短い場合のみ反映、長文はクリップボードから貼付)
      const short = p.promptMarkdown.slice(0, 1500);
      url = `https://chat.openai.com/?q=${encodeURIComponent(short)}`;
    } else if (provider === 'claude') {
      url = `https://claude.ai/new?q=${encodeURIComponent(p.promptMarkdown.slice(0, 2000))}`;
    } else {
      // Gemini は deep link 未対応
      url = 'https://gemini.google.com/app';
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    Toast.info('プロンプトをクリップボードにコピー → 開いた Web UI に貼り付けてください');
  }

  return (
    <div class="ss-modal-backdrop" onClick={() => LocalAgentHandoffOverlay.hide()}>
      <div class="ss-modal ss-modal--wide" onClick={(e) => e.stopPropagation()}>
        <h3>🤝 ローカル AI に依頼</h3>
        <Show
          when={pkg()}
          fallback={
            <p class="ss-modal-caption">
              プロジェクトが開かれていない、または対象が選択されていません。 Outline / Inspector
              などで対象を選んでから再度開いてください。
            </p>
          }
        >
          {(p) => (
            <>
              <p class="ss-modal-caption">
                スコープ: <strong>{p().scopeLabel}</strong>
              </p>
              <Show when={p().relatedFiles.length > 0}>
                <details class="ss-handoff-related">
                  <summary>関連ファイル ({p().relatedFiles.length})</summary>
                  <ul>
                    <For each={p().relatedFiles}>
                      {(f) => (
                        <li>
                          <code>{f}</code>
                        </li>
                      )}
                    </For>
                  </ul>
                </details>
              </Show>

              <p class="ss-modal-caption">プロンプト プレビュー (上 800 字):</p>
              <pre class="ss-handoff-preview">
                {p().promptMarkdown.slice(0, 800)}
                {p().promptMarkdown.length > 800 ? '\n\n…' : ''}
              </pre>
              <p class="ss-handoff-hint">
                {p().promptMarkdown.length.toLocaleString('en-US')} 字。AI に渡す前に
                <strong>「## タスク」</strong> セクションを書き換えてください。
              </p>

              <div class="ss-handoff-actions">
                <button type="button" data-variant="primary" onClick={() => void copyClipboard()}>
                  📋 クリップボードにコピー
                </button>
                <button type="button" disabled={busy()} onClick={() => void saveToProject()}>
                  💾 .editor/ai-context/ に保存
                </button>
                <span class="ss-handoff-divider" />
                <button type="button" onClick={() => openWebUi('chatgpt')}>
                  🌐 ChatGPT で開く
                </button>
                <button type="button" onClick={() => openWebUi('claude')}>
                  🌐 Claude.ai で開く
                </button>
                <button type="button" onClick={() => openWebUi('gemini')}>
                  🌐 Gemini で開く
                </button>
              </div>

              <p class="ss-handoff-cli-hint">
                <strong>CLI から使う場合:</strong> 保存した{' '}
                <code>.editor/ai-context/&lt;ts&gt;.md</code> を<code>codex run</code> /{' '}
                <code>claude</code> / <code>aider</code> に <code>&lt;</code> で stdin
                として渡してください。Browser 環境ではアプリから直接 spawn できないため、 Tauri
                ビルドで対応予定。
              </p>
            </>
          )}
        </Show>
        <div class="ss-modal-actions">
          <span class="ss-modal-spacer" />
          <button type="button" onClick={() => LocalAgentHandoffOverlay.hide()}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

export const LocalAgentHandoffOverlayRoot: Component = () => {
  return (
    <Show when={open()}>
      <Ui />
    </Show>
  );
};
