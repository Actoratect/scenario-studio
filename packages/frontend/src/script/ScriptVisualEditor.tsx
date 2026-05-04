import { createMemo, For, Match, Show, Switch } from 'solid-js';
import type { Component } from 'solid-js';
import {
  type ParsedScene,
  type ScriptBlock,
  type ScriptBlockChoice,
  type ScriptBlockChoiceOption,
} from '@scenario-studio/core';
import { NodeThumbnail } from '../global/NodeThumbnail';
import { ProjectService } from '../services/ProjectService';

// 脚本のブロック視覚エディタ (PR-AA)。
// YAML を見せず、各 script item を「カード」として描画。
//   line  → サムネ + 名前 + 感情 + テキスト
//   stage → 茶色枠 + ステージ icon
//   aside → 紫枠 + 独白 icon
//   action → 緑枠 + 行動 icon
//   sfx   → オレンジ + 🔊
//   bgm   → オレンジ + 🎵
//   choice → 赤枠 + 🌟 + 選択肢一覧
//   unknown → コードで raw 表示
//
// 編集: 各テキストを inline edit、変更を onChange に伝える (親が YAML 再 serialize)。
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §5

export interface ScriptVisualEditorProps {
  parsed: ParsedScene;
  /** ブロック更新コールバック (idx + 新 block)。 */
  onChangeBlock: (idx: number, next: ScriptBlock) => void;
  /** ブロック削除。 */
  onDeleteBlock: (idx: number) => void;
  /** ブロックの上下移動。delta = -1 (上) / +1 (下)。 */
  onMoveBlock: (idx: number, delta: -1 | 1) => void;
  /** kind 指定で新規ブロックを末尾に追加。 */
  onAppendBlock: (kind: ScriptBlock['kind']) => void;
}

const KIND_META: Record<ScriptBlock['kind'], { icon: string; label: string; color: string }> = {
  line: { icon: '💬', label: 'セリフ', color: 'sky' },
  stage: { icon: '🎬', label: 'ステージ', color: 'green' },
  aside: { icon: '💭', label: '独白', color: 'purple' },
  action: { icon: '🏃', label: '行動', color: 'green' },
  sfx: { icon: '🔊', label: 'SFX', color: 'orange' },
  bgm: { icon: '🎵', label: 'BGM', color: 'orange' },
  choice: { icon: '🌟', label: '選択肢', color: 'vermillion' },
  unknown: { icon: '❓', label: '不明', color: 'faint' },
};

const ADDABLE_KINDS: readonly ScriptBlock['kind'][] = [
  'line',
  'stage',
  'aside',
  'action',
  'sfx',
  'bgm',
  'choice',
];

export const ScriptVisualEditor: Component<ScriptVisualEditorProps> = (props) => {
  return (
    <div class="ss-script-visual">
      <div class="ss-script-visual-blocks">
        <For
          each={props.parsed.blocks}
          fallback={
            <p class="ss-script-visual-empty">ブロック無し。下のボタンから追加してください。</p>
          }
        >
          {(block, i) => (
            <ScriptBlockCard
              block={block}
              idx={i()}
              total={props.parsed.blocks.length}
              cast={props.parsed.cast}
              onChange={(next) => props.onChangeBlock(i(), next)}
              onDelete={() => props.onDeleteBlock(i())}
              onMove={(delta) => props.onMoveBlock(i(), delta)}
            />
          )}
        </For>
      </div>
      <div class="ss-script-visual-add">
        <span class="ss-script-visual-add-label">＋ ブロック追加:</span>
        <For each={ADDABLE_KINDS}>
          {(k) => (
            <button
              type="button"
              class="ss-script-visual-add-btn"
              data-color={KIND_META[k].color}
              onClick={() => props.onAppendBlock(k)}
              title={`${KIND_META[k].label} ブロックを末尾に追加`}
            >
              {KIND_META[k].icon} {KIND_META[k].label}
            </button>
          )}
        </For>
      </div>
    </div>
  );
};

interface ScriptBlockCardProps {
  block: ScriptBlock;
  idx: number;
  total: number;
  cast: readonly string[];
  onChange: (next: ScriptBlock) => void;
  onDelete: () => void;
  onMove: (delta: -1 | 1) => void;
}

const ScriptBlockCard: Component<ScriptBlockCardProps> = (props) => {
  const meta = createMemo(() => KIND_META[props.block.kind]);
  const characters = createMemo(() => {
    const ctx = ProjectService.currentProject();
    if (!ctx) return [];
    const out: { id: string; slug: string; devName: string; display: string }[] = [];
    for (const n of ctx.project.nodes.values()) {
      if (n.templateId !== 'template.character') continue;
      const dn = typeof n.fields['dev_name'] === 'string' ? n.fields['dev_name'] : '';
      const display =
        typeof n.fields['display_name'] === 'string'
          ? (n.fields['display_name'] as string)
          : n.slug;
      out.push({ id: n.id, slug: n.slug, devName: dn || n.slug, display });
    }
    return out.sort((a, b) => a.display.localeCompare(b.display));
  });

  function findCharByIdentifier(identifier: string) {
    return characters().find((c) => c.devName === identifier || c.slug === identifier);
  }

  return (
    <div class="ss-script-card" data-kind={props.block.kind} data-color={meta().color}>
      <div class="ss-script-card-gutter">
        <span class="ss-script-card-icon" title={meta().label}>
          {meta().icon}
        </span>
        <span class="ss-script-card-num">{props.idx + 1}</span>
      </div>
      <div class="ss-script-card-body">
        <Switch>
          <Match when={props.block.kind === 'line' || props.block.kind === 'action'}>
            <CharacterLine
              block={props.block as ScriptBlock & { kind: 'line' | 'action' }}
              characters={characters()}
              findChar={findCharByIdentifier}
              onChange={props.onChange}
            />
          </Match>
          <Match when={props.block.kind === 'aside'}>
            <AsideBlock
              block={props.block as ScriptBlock & { kind: 'aside' }}
              onChange={props.onChange}
            />
          </Match>
          <Match when={props.block.kind === 'stage'}>
            <StageBlock
              block={props.block as ScriptBlock & { kind: 'stage' }}
              onChange={props.onChange}
            />
          </Match>
          <Match when={props.block.kind === 'sfx'}>
            <SfxBlock
              block={props.block as ScriptBlock & { kind: 'sfx' }}
              onChange={props.onChange}
            />
          </Match>
          <Match when={props.block.kind === 'bgm'}>
            <BgmBlock
              block={props.block as ScriptBlock & { kind: 'bgm' }}
              onChange={props.onChange}
            />
          </Match>
          <Match when={props.block.kind === 'choice'}>
            <ChoiceBlockView block={props.block as ScriptBlockChoice} onChange={props.onChange} />
          </Match>
          <Match when={props.block.kind === 'unknown'}>
            <UnknownBlockView block={props.block as ScriptBlock & { kind: 'unknown' }} />
          </Match>
        </Switch>
      </div>
      <div class="ss-script-card-actions">
        <button
          type="button"
          disabled={props.idx === 0}
          onClick={() => props.onMove(-1)}
          title="上へ"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={props.idx === props.total - 1}
          onClick={() => props.onMove(1)}
          title="下へ"
        >
          ↓
        </button>
        <button
          type="button"
          class="ss-script-card-delete"
          onClick={() => {
            if (window.confirm(`${KIND_META[props.block.kind].label} ブロックを削除しますか?`)) {
              props.onDelete();
            }
          }}
          title="削除"
        >
          ×
        </button>
      </div>
    </div>
  );
};

const KNOWN_EMOTIONS: readonly string[] = [
  '',
  'happy',
  'sad',
  'angry',
  'tired',
  'suspicious',
  'surprised',
  'embarrassed',
  'calm',
];

const CharacterLine: Component<{
  block: ScriptBlock & { kind: 'line' | 'action' };
  characters: readonly { id: string; slug: string; devName: string; display: string }[];
  findChar: (id: string) => { id: string; display: string } | undefined;
  onChange: (next: ScriptBlock) => void;
}> = (props) => {
  const ctx = createMemo(() => ProjectService.currentProject());
  const charNode = createMemo(() => {
    const found = props.findChar(props.block.who);
    if (!found) return undefined;
    return ctx()?.project.nodes.get(found.id as never);
  });

  return (
    <>
      <div class="ss-script-line-header">
        <Show when={charNode()}>{(n) => <NodeThumbnail node={n()} size={36} />}</Show>
        <select
          class="ss-script-line-who"
          value={props.block.who}
          onChange={(e) => props.onChange({ ...props.block, who: e.currentTarget.value })}
        >
          <option value="">— who —</option>
          <For each={props.characters}>
            {(c) => (
              <option value={c.devName}>
                {c.display} ({c.devName})
              </option>
            )}
          </For>
        </select>
        <Show when={props.block.kind === 'line'}>
          <select
            class="ss-script-line-emotion"
            value={(props.block as { emotion?: string }).emotion ?? ''}
            onChange={(e) => {
              const v = e.currentTarget.value;
              const next: ScriptBlock =
                v === ''
                  ? ({ ...(props.block as ScriptBlock & { kind: 'line' }) } as ScriptBlock & {
                      kind: 'line';
                    })
                  : { ...(props.block as ScriptBlock & { kind: 'line' }), emotion: v };
              if (v === '' && 'emotion' in next) {
                delete (next as { emotion?: string }).emotion;
              }
              props.onChange(next);
            }}
          >
            <For each={KNOWN_EMOTIONS}>
              {(e) => <option value={e}>{e === '' ? '— 感情 —' : e}</option>}
            </For>
          </select>
        </Show>
        <Show when={props.block.kind === 'action'}>
          <span class="ss-script-line-action-tag">行動</span>
        </Show>
      </div>
      <textarea
        class="ss-script-line-text"
        rows="2"
        value={props.block.text}
        placeholder={props.block.kind === 'line' ? 'セリフを入力…' : '行動を入力…'}
        onInput={(e) => props.onChange({ ...props.block, text: e.currentTarget.value })}
      />
    </>
  );
};

const AsideBlock: Component<{
  block: ScriptBlock & { kind: 'aside' };
  onChange: (next: ScriptBlock) => void;
}> = (props) => {
  return (
    <textarea
      class="ss-script-aside-text"
      rows="2"
      value={props.block.text}
      placeholder="心の声 / 独白を入力…"
      onInput={(e) => props.onChange({ ...props.block, text: e.currentTarget.value })}
    />
  );
};

const StageBlock: Component<{
  block: ScriptBlock & { kind: 'stage' };
  onChange: (next: ScriptBlock) => void;
}> = (props) => {
  return (
    <textarea
      class="ss-script-stage-text"
      rows="2"
      value={props.block.text}
      placeholder="状況描写 / ステージを入力…"
      onInput={(e) => props.onChange({ ...props.block, text: e.currentTarget.value })}
    />
  );
};

const SfxBlock: Component<{
  block: ScriptBlock & { kind: 'sfx' };
  onChange: (next: ScriptBlock) => void;
}> = (props) => {
  return (
    <input
      type="text"
      class="ss-script-cue-input"
      value={props.block.name}
      placeholder="効果音名 (例: thunder_far)"
      onInput={(e) => props.onChange({ ...props.block, name: e.currentTarget.value })}
    />
  );
};

const BgmBlock: Component<{
  block: ScriptBlock & { kind: 'bgm' };
  onChange: (next: ScriptBlock) => void;
}> = (props) => {
  return (
    <div class="ss-script-bgm-row">
      <input
        type="text"
        class="ss-script-cue-input"
        value={props.block.cue}
        placeholder="BGM cue (例: bgm_tense)"
        onInput={(e) => props.onChange({ ...props.block, cue: e.currentTarget.value })}
      />
      <label class="ss-script-bgm-fade">
        fade:
        <input
          type="number"
          step="0.1"
          min="0"
          value={props.block.fade ?? 1.0}
          onInput={(e) => {
            const v = Number(e.currentTarget.value);
            const next: ScriptBlock & { kind: 'bgm' } = { ...props.block };
            if (Number.isFinite(v)) next.fade = v;
            else delete (next as { fade?: number }).fade;
            props.onChange(next);
          }}
        />
        s
      </label>
    </div>
  );
};

const ChoiceBlockView: Component<{
  block: ScriptBlockChoice;
  onChange: (next: ScriptBlock) => void;
}> = (props) => {
  function setOption(idx: number, patch: Partial<ScriptBlockChoiceOption>): void {
    const opts = [...(props.block.options ?? [])];
    opts[idx] = { ...opts[idx]!, ...patch };
    props.onChange({ ...props.block, options: opts });
  }
  function addOption(): void {
    const opts = [...(props.block.options ?? []), { text: '選択 X' }];
    props.onChange({ ...props.block, options: opts });
  }
  function removeOption(idx: number): void {
    const opts = (props.block.options ?? []).filter((_, i) => i !== idx);
    props.onChange({ ...props.block, options: opts });
  }

  return (
    <>
      <input
        type="text"
        class="ss-script-choice-prompt"
        value={props.block.prompt}
        placeholder="質問 / プロンプト"
        onInput={(e) => props.onChange({ ...props.block, prompt: e.currentTarget.value })}
      />
      <ul class="ss-script-choice-options">
        <For each={props.block.options ?? []}>
          {(opt, i) => (
            <li class="ss-script-choice-option">
              <span class="ss-script-choice-bullet">{i() + 1}.</span>
              <input
                type="text"
                class="ss-script-choice-text"
                value={opt.text}
                placeholder="選択肢テキスト"
                onInput={(e) => setOption(i(), { text: e.currentTarget.value })}
              />
              <input
                type="text"
                class="ss-script-choice-then"
                value={opt.then ?? ''}
                placeholder="飛び先 (任意, 例: scene.next)"
                onInput={(e) => {
                  const v = e.currentTarget.value;
                  setOption(i(), v === '' ? { then: undefined } : { then: v });
                }}
              />
              <button
                type="button"
                class="ss-script-choice-delete"
                onClick={() => removeOption(i())}
                title="この選択肢を削除"
              >
                ×
              </button>
            </li>
          )}
        </For>
      </ul>
      <button type="button" class="ss-script-choice-add" onClick={addOption}>
        + 選択肢を追加
      </button>
    </>
  );
};

const UnknownBlockView: Component<{ block: ScriptBlock & { kind: 'unknown' } }> = (props) => {
  return <pre class="ss-script-unknown">{JSON.stringify(props.block.raw, null, 2)}</pre>;
};
