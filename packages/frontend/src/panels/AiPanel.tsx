import { createSignal, For, onMount, Show, Switch, Match } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import { AiService } from '../services/AiService';
import type { ProviderId } from '../services/AiService';

// AI Panel (M8) — Provider 切替 + 鍵設定 / unlock + Show prompt → 送信 → 応答表示。
// 「鍵を貼り付けて暗号化」「パスフレーズで起動」「prompt 内容を確認してから送る」の 3 ステップ UX。
// 詳細: ../../../../Documentation/ScenarioEditor/11_ai-workflow.md §1, §6.1,
//       ../../../../Documentation/ScenarioEditor/16_security.md §2.7,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M7, M8

const DEFAULT_SYSTEM = `あなたは日本語シナリオの執筆を補佐するアシスタントです。
ユーザの脚本に沿った続きを 1 行だけ提案します。`;

export const AiPanel: Component<GroupPanelPartInitParameters> = (params) => {
  const [passphrase, setPassphrase] = createSignal('');
  const [apiKey, setApiKey] = createSignal('');
  const [systemPrompt, setSystemPrompt] = createSignal(DEFAULT_SYSTEM);
  const [userPrompt, setUserPrompt] = createSignal('');
  const [showConfirm, setShowConfirm] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [response, setResponse] = createSignal<string>('');

  onMount(() => {
    void AiService.refreshStatus();
  });

  async function handleSetKey(): Promise<void> {
    if (!apiKey().trim() || !passphrase()) return;
    setBusy(true);
    try {
      await AiService.setKey(apiKey().trim(), passphrase());
      setApiKey('');
      setPassphrase('');
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock(): Promise<void> {
    if (!passphrase()) return;
    setBusy(true);
    try {
      await AiService.unlock(passphrase());
      setPassphrase('');
    } catch {
      // lastError はサービスが setSignal 済み
    } finally {
      setBusy(false);
    }
  }

  function handleSendRequest(): void {
    if (!userPrompt().trim()) return;
    setShowConfirm(true);
  }

  async function handleConfirmSend(): Promise<void> {
    setShowConfirm(false);
    setBusy(true);
    setResponse('');
    try {
      const text = await AiService.send({
        systemPrompt: systemPrompt(),
        messages: [{ role: 'user', content: userPrompt() }],
      });
      setResponse(text);
    } catch (e) {
      setResponse(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="panel-content panel-ai">
      <div class="panel-ai-header">
        <span>Provider:</span>
        <select
          value={AiService.providerId()}
          onChange={(e) => void AiService.switchProvider(e.currentTarget.value as ProviderId)}
        >
          <For each={AiService.providers}>
            {(p) => <option value={p.id}>{p.displayName}</option>}
          </For>
        </select>
        <span class="panel-ai-status">
          <Switch>
            <Match when={AiService.status().kind === 'unlocked'}>
              <span class="panel-ai-badge unlocked">unlocked</span>
              <button type="button" onClick={() => AiService.lock()}>
                Lock
              </button>
            </Match>
            <Match when={AiService.status().kind === 'locked'}>
              <span class="panel-ai-badge locked">locked</span>
            </Match>
            <Match when={AiService.status().kind === 'no-key'}>
              <span class="panel-ai-badge no-key">no key</span>
            </Match>
          </Switch>
        </span>
        <span class="panel-ai-panel-id">
          · <code>{params.api.id}</code>
        </span>
      </div>

      <Show when={AiService.lastError()}>
        {(err) => <div class="panel-ai-error">{err().message}</div>}
      </Show>

      <Switch>
        <Match when={AiService.status().kind === 'no-key'}>
          <div class="panel-ai-section">
            <h3>初回設定</h3>
            <p class="panel-ai-hint">
              API キーをローカル IndexedDB に AES-GCM (PBKDF2 200k iter) で暗号化して保存します。
              キー本体はメモリ + 暗号化 blob のみで、平文ではどこにも残しません。
            </p>
            <label>
              API key
              <input
                type="password"
                value={apiKey()}
                onInput={(e) => setApiKey(e.currentTarget.value)}
                placeholder="sk-..."
              />
            </label>
            <label>
              Passphrase (起動時に毎回入力)
              <input
                type="password"
                value={passphrase()}
                onInput={(e) => setPassphrase(e.currentTarget.value)}
              />
            </label>
            <button type="button" disabled={busy()} onClick={() => void handleSetKey()}>
              暗号化して保存
            </button>
          </div>
        </Match>
        <Match when={AiService.status().kind === 'locked'}>
          <div class="panel-ai-section">
            <h3>Unlock</h3>
            <label>
              Passphrase
              <input
                type="password"
                value={passphrase()}
                onInput={(e) => setPassphrase(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleUnlock();
                }}
              />
            </label>
            <div class="panel-ai-actions">
              <button type="button" disabled={busy()} onClick={() => void handleUnlock()}>
                Unlock
              </button>
              <button type="button" disabled={busy()} onClick={() => void AiService.forgetKey()}>
                鍵を削除
              </button>
            </div>
          </div>
        </Match>
        <Match when={AiService.status().kind === 'unlocked'}>
          <div class="panel-ai-section">
            <h3>Prompt</h3>
            <label>
              System prompt
              <textarea
                rows="3"
                value={systemPrompt()}
                onInput={(e) => setSystemPrompt(e.currentTarget.value)}
              />
            </label>
            <label>
              User message
              <textarea
                rows="6"
                value={userPrompt()}
                onInput={(e) => setUserPrompt(e.currentTarget.value)}
                placeholder="何を聞きますか?"
              />
            </label>
            <button
              type="button"
              disabled={busy() || !userPrompt().trim()}
              onClick={handleSendRequest}
            >
              送信前に確認…
            </button>
          </div>
          <Show when={response()}>
            <div class="panel-ai-section">
              <h3>応答</h3>
              <pre class="panel-ai-response">{response()}</pre>
            </div>
          </Show>
        </Match>
      </Switch>

      <Show when={showConfirm()}>
        <div class="panel-ai-modal-backdrop" onClick={() => setShowConfirm(false)}>
          <div class="panel-ai-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Show prompt — 送信内容の確認</h3>
            <p class="panel-ai-hint">
              この内容を <strong>{providerDisplayName(AiService.providerId())}</strong>{' '}
              に送信します。 機微情報が含まれていないか確認してください。
            </p>
            <section>
              <strong>System:</strong>
              <pre>{systemPrompt()}</pre>
            </section>
            <section>
              <strong>User:</strong>
              <pre>{userPrompt()}</pre>
            </section>
            <div class="panel-ai-actions">
              <button type="button" onClick={() => setShowConfirm(false)}>
                キャンセル
              </button>
              <button type="button" onClick={() => void handleConfirmSend()}>
                送信する
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

function providerDisplayName(id: ProviderId): string {
  return AiService.providers.find((p) => p.id === id)?.displayName ?? id;
}
