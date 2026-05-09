import { createMemo, createSignal, For, Index, Match, Show, Switch } from 'solid-js';
import type { Component } from 'solid-js';
import {
  type FieldAiContext,
  type ParsedScene,
  type ScriptBlock,
  type ScriptBlockChoice,
  type ScriptBlockChoiceOption,
} from '@scenario-studio/core';
import { NodeThumbnail } from '../global/NodeThumbnail';
import { EraContext } from '../services/EraContext';
import { FieldAiActions } from '../services/FieldAiActions';
import { ProjectService } from '../services/ProjectService';
import { deriveGlossary, scanGlossary } from '../services/GlossaryHighlight';
import { KNOWN_EMOTIONS, emotionLabel } from './emotions';

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
  /** PR-AR: 右クリック AI で渡す scene 識別子。未指定時は AI メニューを表示しない。 */
  chapterSlug?: string | undefined;
  sceneSlug?: string | undefined;
  /** ブロック更新コールバック (idx + 新 block)。 */
  onChangeBlock: (idx: number, next: ScriptBlock) => void;
  /** ブロック削除。 */
  onDeleteBlock: (idx: number) => void;
  /** ブロックの上下移動。delta = -1 (上) / +1 (下)。 */
  onMoveBlock: (idx: number, delta: -1 | 1) => void;
  /** kind 指定で新規ブロックを末尾に追加。 */
  onAppendBlock: (kind: ScriptBlock['kind']) => void;
  /** 指定 index に新規ブロックを挿入 (途中挿入)。kind 別の default は親が組み立てる。 */
  onInsertBlock: (index: number, kind: ScriptBlock['kind']) => void;
}

/**
 * PR-AR: 右クリック AI 用の context を組み立てるヘルパ。
 * scene 内で前後 1 ブロックを surroundingText に詰める。
 */
function buildBlockAiContext(
  parsed: ParsedScene,
  blockIndex: number,
  chapterSlug: string,
  sceneSlug: string,
  currentText: string,
): FieldAiContext {
  const ctx = ProjectService.currentProject();
  const before = blockIndex > 0 ? parsed.blocks[blockIndex - 1] : undefined;
  const after = blockIndex < parsed.blocks.length - 1 ? parsed.blocks[blockIndex + 1] : undefined;
  const surrounding: string[] = [];
  if (before && 'text' in before && typeof before.text === 'string') {
    surrounding.push(`前: ${before.text}`);
  }
  if (after && 'text' in after && typeof after.text === 'string') {
    surrounding.push(`後: ${after.text}`);
  }
  const glossaryTerms = ctx ? deriveGlossary(ctx.project).map((g) => g.term) : [];
  return {
    target: {
      kind: 'script-block',
      chapterSlug,
      sceneSlug,
      blockIndex,
      field: 'text',
    },
    currentValue: currentText,
    ...(surrounding.length > 0 ? { surroundingText: surrounding.join('\n') } : {}),
    projectContext: {
      eraId: EraContext.currentEraId(),
      glossaryTerms,
      relatedNodes: parsed.cast,
    },
  };
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
        <Show
          when={props.parsed.blocks.length > 0}
          fallback={
            <p class="ss-script-visual-empty">ブロック無し。下のボタンから追加してください。</p>
          }
        >
          {/* 各ブロック前に「＋ 挿入」hover bar を入れる。最後のブロック後ろにも 1 個。
           *  PR (ux-overhaul-3): For → Index に変更。block の identity が変わっても DOM を
           *  保持するので、textarea を編集しても再 mount されず cursor が飛ばない。 */}
          <InsertBar index={0} onInsert={(k) => props.onInsertBlock(0, k)} />
          <Index each={props.parsed.blocks}>
            {(block, i) => (
              <>
                <ScriptBlockCard
                  block={block()}
                  idx={i}
                  total={props.parsed.blocks.length}
                  cast={props.parsed.cast}
                  parsed={props.parsed}
                  chapterSlug={props.chapterSlug}
                  sceneSlug={props.sceneSlug}
                  onChange={(next) => props.onChangeBlock(i, next)}
                  onDelete={() => props.onDeleteBlock(i)}
                  onMove={(delta) => props.onMoveBlock(i, delta)}
                />
                <InsertBar index={i + 1} onInsert={(k) => props.onInsertBlock(i + 1, k)} />
              </>
            )}
          </Index>
        </Show>
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

/**
 * ブロック間に表示する「＋ ここに挿入」hover bar。クリックで kind 選択メニューが開く。
 * 通常は薄く目立たない (hover で背景色付き)。
 */
const InsertBar: Component<{
  index: number;
  onInsert: (kind: ScriptBlock['kind']) => void;
}> = (props) => {
  const [menuOpen, setMenuOpen] = createSignal(false);
  return (
    <div
      class="ss-script-insert-bar"
      classList={{ 'ss-script-insert-bar--open': menuOpen() }}
      onMouseLeave={() => setMenuOpen(false)}
    >
      <button
        type="button"
        class="ss-script-insert-bar-trigger"
        onClick={() => setMenuOpen((b) => !b)}
        title={`位置 ${props.index} にブロックを挿入`}
        aria-label={`位置 ${props.index} にブロックを挿入`}
      >
        ＋
      </button>
      <Show when={menuOpen()}>
        <div class="ss-script-insert-bar-menu">
          <For each={ADDABLE_KINDS}>
            {(k) => (
              <button
                type="button"
                class="ss-script-insert-bar-item"
                data-color={KIND_META[k].color}
                onClick={() => {
                  props.onInsert(k);
                  setMenuOpen(false);
                }}
                title={`${KIND_META[k].label} を挿入`}
              >
                {KIND_META[k].icon} {KIND_META[k].label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

interface ScriptBlockCardProps {
  block: ScriptBlock;
  idx: number;
  total: number;
  cast: readonly string[];
  parsed: ParsedScene;
  chapterSlug?: string | undefined;
  sceneSlug?: string | undefined;
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
              parsed={props.parsed}
              blockIndex={props.idx}
              chapterSlug={props.chapterSlug}
              sceneSlug={props.sceneSlug}
            />
          </Match>
          <Match when={props.block.kind === 'aside'}>
            <AsideBlock
              block={props.block as ScriptBlock & { kind: 'aside' }}
              onChange={props.onChange}
              parsed={props.parsed}
              blockIndex={props.idx}
              chapterSlug={props.chapterSlug}
              sceneSlug={props.sceneSlug}
            />
          </Match>
          <Match when={props.block.kind === 'stage'}>
            <StageBlock
              block={props.block as ScriptBlock & { kind: 'stage' }}
              onChange={props.onChange}
              parsed={props.parsed}
              blockIndex={props.idx}
              chapterSlug={props.chapterSlug}
              sceneSlug={props.sceneSlug}
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
          onClick={() => props.onDelete()}
          title="削除 (確認なし — 取り消しは Ctrl+Z)"
        >
          ×
        </button>
      </div>
    </div>
  );
};

const CharacterLine: Component<{
  block: ScriptBlock & { kind: 'line' | 'action' };
  characters: readonly { id: string; slug: string; devName: string; display: string }[];
  findChar: (id: string) => { id: string; display: string } | undefined;
  onChange: (next: ScriptBlock) => void;
  parsed: ParsedScene;
  blockIndex: number;
  chapterSlug?: string | undefined;
  sceneSlug?: string | undefined;
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
            <option value="">— 感情 —</option>
            {/* 既存値が KNOWN_EMOTIONS に無い場合 (英語値 / 自由入力) は最上段に表示 */}
            <Show
              when={(() => {
                const cur = (props.block as { emotion?: string }).emotion ?? '';
                return cur !== '' && !KNOWN_EMOTIONS.includes(cur);
              })()}
            >
              <option value={(props.block as { emotion?: string }).emotion ?? ''}>
                {emotionLabel((props.block as { emotion?: string }).emotion ?? '')}
              </option>
            </Show>
            <For each={KNOWN_EMOTIONS}>{(e) => <option value={e}>{e}</option>}</For>
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
        onContextMenu={(e) => {
          if (!props.chapterSlug || !props.sceneSlug) return;
          const ctx = buildBlockAiContext(
            props.parsed,
            props.blockIndex,
            props.chapterSlug,
            props.sceneSlug,
            props.block.text,
          );
          FieldAiActions.openTextMenu(e, ctx, {
            onAccept: (text) => props.onChange({ ...props.block, text }),
          });
        }}
      />
      <GlossaryChips text={props.block.text} />
    </>
  );
};

const AsideBlock: Component<{
  block: ScriptBlock & { kind: 'aside' };
  onChange: (next: ScriptBlock) => void;
  parsed: ParsedScene;
  blockIndex: number;
  chapterSlug?: string | undefined;
  sceneSlug?: string | undefined;
}> = (props) => {
  return (
    <>
      <textarea
        class="ss-script-aside-text"
        rows="2"
        value={props.block.text}
        placeholder="心の声 / 独白を入力…"
        onInput={(e) => props.onChange({ ...props.block, text: e.currentTarget.value })}
        onContextMenu={(e) => {
          if (!props.chapterSlug || !props.sceneSlug) return;
          const ctx = buildBlockAiContext(
            props.parsed,
            props.blockIndex,
            props.chapterSlug,
            props.sceneSlug,
            props.block.text,
          );
          FieldAiActions.openTextMenu(e, ctx, {
            onAccept: (text) => props.onChange({ ...props.block, text }),
          });
        }}
      />
      <GlossaryChips text={props.block.text} />
    </>
  );
};

const StageBlock: Component<{
  block: ScriptBlock & { kind: 'stage' };
  onChange: (next: ScriptBlock) => void;
  parsed: ParsedScene;
  blockIndex: number;
  chapterSlug?: string | undefined;
  sceneSlug?: string | undefined;
}> = (props) => {
  return (
    <>
      <textarea
        class="ss-script-stage-text"
        rows="2"
        value={props.block.text}
        placeholder="状況描写 / ステージを入力…"
        onInput={(e) => props.onChange({ ...props.block, text: e.currentTarget.value })}
        onContextMenu={(e) => {
          if (!props.chapterSlug || !props.sceneSlug) return;
          const ctx = buildBlockAiContext(
            props.parsed,
            props.blockIndex,
            props.chapterSlug,
            props.sceneSlug,
            props.block.text,
          );
          FieldAiActions.openTextMenu(e, ctx, {
            onAccept: (text) => props.onChange({ ...props.block, text }),
          });
        }}
      />
      <GlossaryChips text={props.block.text} />
    </>
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

/**
 * PR-AF: テキスト中の Glossary 用語 / 禁止表記を検出して chip 行に表示。
 * 該当無しなら何も描画しない。
 */
const GlossaryChips: Component<{ text: string }> = (props) => {
  const result = createMemo(() => {
    const ctx = ProjectService.currentProject();
    const glossary = ctx ? deriveGlossary(ctx.project) : [];
    return scanGlossary(props.text, glossary);
  });
  return (
    <Show when={result().okTerms.length > 0 || result().violations.length > 0}>
      <div class="ss-script-glossary-chips">
        <For each={result().okTerms}>
          {(term) => (
            <span
              class="ss-script-glossary-chip ss-script-glossary-chip--ok"
              title="用語集に登録済"
            >
              ✓ {term}
            </span>
          )}
        </For>
        <For each={result().violations}>
          {(v) => (
            <span
              class="ss-script-glossary-chip ss-script-glossary-chip--warn"
              title={`禁止表記: 「${v.match}」→ 正式「${v.term}」を推奨`}
            >
              ⚠ {v.match} → {v.term}
            </span>
          )}
        </For>
      </div>
    </Show>
  );
};
