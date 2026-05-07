import { createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import {
  resolveNode,
  validateNode,
  type FieldAiContext,
  type FieldSchema,
  type FieldValue,
  type NodeId,
  type ScenarioNode,
  type ThumbnailRect,
  type ValidationIssue,
} from '@scenario-studio/core';
import {
  CheckboxField,
  EnumSelect,
  MultilineInput,
  NodeRefPicker,
  NumberInput,
  TextInput,
  type NodeRefOption,
} from '@scenario-studio/ui-kit';
import { ProjectService } from '../services/ProjectService';
import { SelectionContext } from '../services/SelectionContext';
import { EraContext } from '../services/EraContext';
import { FieldAiActions } from '../services/FieldAiActions';
import { Toast } from '../services/Toast';
import { ThumbnailService } from '../services/ThumbnailService';
import { VariantsService } from '../services/VariantsService';
import { BulkVariantOverlay } from '../global/BulkVariantOverlay';
import { EraSelector } from '../global/EraSelector';
import { NodeThumbnail } from '../global/NodeThumbnail';
import { PortraitCropper } from '../global/PortraitCropper';
import { useSaveScheduler } from '../services/save-scheduler-binding';

// 選択中ノードの編集 UI。
// テンプレート schema を読んで対応する form プリミティブを並べ、
// 編集を NodeFieldStore に書き込み、SaveScheduler 経由で 500ms デバウンス保存。
// blur 時に markUndoBoundary。
// 詳細: ../../../../Documentation/ScenarioEditor/12_architecture.md §5.3, §6.2,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M3

export const InspectorPanel: Component<GroupPanelPartInitParameters> = (params) => {
  const scheduler = useSaveScheduler();

  // project.nodes は immutable Map なので、ProjectService.currentProject() の参照変化を起点にメモ化
  const node = createMemo<ScenarioNode | undefined>(() => {
    const ctx = ProjectService.currentProject();
    const id = SelectionContext.selectedNodeId();
    if (!ctx || !id) return undefined;
    return ctx.project.nodes.get(id);
  });

  const template = createMemo(() => {
    const n = node();
    const ctx = ProjectService.currentProject();
    if (!n || !ctx) return undefined;
    return ctx.templates.tryGet(n.templateId as never);
  });

  const issues = createMemo<readonly ValidationIssue[]>(() => {
    const n = node();
    const t = template();
    if (!n || !t) return [];
    return validateNode(n, t);
  });

  /**
   * Era-aware な「現在の見え方」。EraContext.isBase() のときはベース fields をそのまま、
   * それ以外は resolveNode() で variant をマージした結果を返す。
   * 編集 (setField) はベースに書く方針 — Variant 編集 UI は Phase 1 後半で。
   */
  const resolvedFields = createMemo<{ readonly [key: string]: FieldValue }>(() => {
    const n = node();
    const ctx = ProjectService.currentProject();
    if (!n || !ctx) return {};
    if (EraContext.isBase()) return n.fields;
    return resolveNode(n, EraContext.currentEraId(), ctx.project.eras).fields;
  });

  const appliedVariantEras = createMemo<readonly string[]>(() => {
    const n = node();
    const ctx = ProjectService.currentProject();
    if (!n || !ctx || EraContext.isBase()) return [];
    return resolveNode(n, EraContext.currentEraId(), ctx.project.eras).appliedVariantEras;
  });

  const refOptions = createMemo<readonly NodeRefOption[]>(() => {
    const ctx = ProjectService.currentProject();
    if (!ctx) return [];
    const out: NodeRefOption[] = [];
    for (const n of ctx.project.nodes.values()) {
      out.push({ id: n.id, label: n.slug, hint: n.templateId });
    }
    return out;
  });

  // Solid 側の rerender を促すための tick。NodeFieldStore.observe で signal を起動。
  let unsubscribe: (() => void) | undefined;
  onMount(() => {
    const id = SelectionContext.selectedNodeId();
    if (!id) return;
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const store = ctx.history.get(id);
    if (!store) return;
    unsubscribe = store.observe(() => {
      // ProjectModel.nodes を更新 — Inspector の render を促す
      bumpProject(ctx, id);
    });
  });
  onCleanup(() => unsubscribe?.());

  function setField(fieldId: string, value: FieldValue): void {
    const id = SelectionContext.selectedNodeId();
    const ctx = ProjectService.currentProject();
    if (!id || !ctx) return;
    // 非 base Era で編集 → variant override に書く (base.fields は触らない)
    if (!EraContext.isBase()) {
      void VariantsService.setFieldOverride(id, EraContext.currentEraId(), fieldId, value);
      return;
    }
    const store = ctx.history.get(id);
    if (!store) return;
    store.set(fieldId, value);
    bumpProject(ctx, id);
    scheduler.schedule(id);
  }

  function removeOverride(fieldId: string): void {
    const id = SelectionContext.selectedNodeId();
    if (!id || EraContext.isBase()) return;
    void VariantsService.removeFieldOverride(id, EraContext.currentEraId(), fieldId);
  }

  /** field id → 当該 field に当該 Era の override が直接定義されているか (継承除外) */
  const overrideMap = createMemo<ReadonlySet<string>>(() => {
    const n = node();
    if (!n || EraContext.isBase()) return new Set();
    const eraId = EraContext.currentEraId();
    const out = new Set<string>();
    for (const field of template()?.fields ?? []) {
      if (VariantsService.hasFieldOverride(n, eraId, field.id)) out.add(field.id);
    }
    return out;
  });

  /** PR-AC: long 系 (multiline_string / markdown) かどうか。Inspector 下段に分ける判定用。 */
  function isLongField(f: FieldSchema): boolean {
    return f.type === 'multiline_string' || f.type === 'markdown';
  }

  /** template.fields を group ごとに集約 (PR-O)。順序は宣言順を維持。
   *  PR-AC: filter で「上段 (compact)」/「下段 (long)」を分ける。 */
  function buildGroups(predicate: (f: FieldSchema) => boolean): readonly {
    title: string;
    fields: readonly FieldSchema[];
  }[] {
    const t = template();
    if (!t) return [];
    const order: string[] = [];
    const buckets = new Map<string, FieldSchema[]>();
    for (const f of t.fields) {
      if (!predicate(f)) continue;
      const g = f.group ?? '_';
      if (!buckets.has(g)) {
        buckets.set(g, []);
        order.push(g);
      }
      buckets.get(g)!.push(f);
    }
    return order.map((g) => ({
      title: g === '_' ? 'その他' : g,
      fields: buckets.get(g) ?? [],
    }));
  }
  const compactGroups = createMemo(() => buildGroups((f) => !isLongField(f)));
  const longGroups = createMemo(() => buildGroups(isLongField));

  function onFieldBlur(): void {
    const id = SelectionContext.selectedNodeId();
    if (!id) return;
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    ctx.history.get(id)?.markUndoBoundary();
  }

  async function renameNode(): Promise<void> {
    const n = node();
    const ctx = ProjectService.currentProject();
    if (!n || !ctx) return;
    const next = window.prompt('新しい slug を入力 (英小文字 / 数字 / _ / -):', n.slug);
    if (next === null) return; // cancel
    const trimmed = next.trim();
    if (trimmed === '' || trimmed === n.slug) return;
    try {
      await ctx.nodeRepository.rename(n.id, trimmed);
      // ProjectModel.nodes を更新 — 既存 Map を作り直す
      const nextMap = new Map(ctx.project.nodes);
      const updated = { ...n, slug: trimmed };
      nextMap.set(n.id, updated);
      Object.assign(ctx.project, { nodes: nextMap });
      Toast.success(`slug を変更: ${n.slug} → ${trimmed}`);
    } catch (e) {
      Toast.error(`slug 変更に失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  let fileInput: HTMLInputElement | undefined;
  const [isDragOver, setIsDragOver] = createSignal(false);

  async function uploadThumbnail(file: File): Promise<void> {
    const n = node();
    if (!n) return;
    await ThumbnailService.uploadForNode(n, file, file.name);
  }

  function onPickFile(): void {
    fileInput?.click();
  }

  function onFileChange(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void uploadThumbnail(file);
    input.value = '';
  }

  function onThumbDragOver(e: DragEvent): void {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }
  function onThumbDragLeave(): void {
    setIsDragOver(false);
  }
  function onThumbDrop(e: DragEvent): void {
    setIsDragOver(false);
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file || !file.type.startsWith('image/')) {
      Toast.error('画像ファイルを drop してください');
      return;
    }
    e.preventDefault();
    void uploadThumbnail(file);
  }

  async function clearThumbnail(): Promise<void> {
    const n = node();
    if (!n || !n.thumbnail) return;
    if (!window.confirm(`サムネイルを削除しますか? (Media/${n.slug}.* も消えます)`)) return;
    await ThumbnailService.clearForNode(n);
  }

  /** PR-AC: 立ち絵から「丸サムネに使う矩形」を node に保存 */
  async function saveThumbnailRect(rect: ThumbnailRect): Promise<void> {
    const n = node();
    const ctx = ProjectService.currentProject();
    if (!n || !ctx) return;
    const updated: ScenarioNode = { ...n, thumbnailRect: rect };
    try {
      await ctx.nodeRepository.save(updated);
      const next = new Map(ctx.project.nodes);
      next.set(n.id, updated);
      Object.assign(ctx.project, { nodes: next });
    } catch (e) {
      Toast.error(`サムネ位置の保存に失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function deleteNode(): Promise<void> {
    const n = node();
    const ctx = ProjectService.currentProject();
    if (!n || !ctx) return;
    if (!window.confirm(`ノード "${n.slug}" を削除しますか? (元に戻せません)`)) return;
    try {
      await ctx.nodeRepository.delete(n.id);
      const nextMap = new Map(ctx.project.nodes);
      nextMap.delete(n.id);
      Object.assign(ctx.project, { nodes: nextMap });
      SelectionContext.selectNode(undefined);
      Toast.success(`ノードを削除: ${n.slug}`);
    } catch (e) {
      Toast.error(`削除に失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ヘッダ表示用: display_name を resolvedFields から抽出 (variant 適用済み)
  const displayName = createMemo<string>(() => {
    const v = resolvedFields()['display_name'];
    if (typeof v === 'string' && v !== '') return v;
    return node()?.slug ?? '';
  });
  const devName = createMemo<string>(() => {
    const v = resolvedFields()['dev_name'];
    if (typeof v === 'string' && v !== '') return v;
    return node()?.slug ?? '';
  });

  return (
    <div class="panel-content panel-inspector">
      <Show when={node() && template()} fallback={<EmptyInspector panelId={params.api.id} />}>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          style={{ display: 'none' }}
          onChange={onFileChange}
        />
        <header class="panel-inspector-header">
          <div class="panel-inspector-header-top">
            <span class="panel-inspector-name-tag">{displayName()}</span>
            <span class="panel-inspector-id-tag" title="脚本の who: で参照する ID">
              {devName()}
            </span>
            <span class="panel-inspector-template-tag">{template()!.displayName}</span>
            <Show when={!EraContext.isBase()}>
              <span class="panel-inspector-era-tag">
                ◆ {EraContext.currentEraId()}
                <Show when={appliedVariantEras().length > 0}>
                  <span class="panel-inspector-variant-active">
                    · variant ({appliedVariantEras().join(' → ')})
                  </span>
                </Show>
              </span>
            </Show>
            <span class="panel-inspector-actions">
              <button type="button" onClick={() => void renameNode()} title="slug を変更">
                ✎ slug
              </button>
              <Show when={node()!.thumbnail}>
                <button
                  type="button"
                  onClick={() => void clearThumbnail()}
                  title="立ち絵 / サムネ画像を削除"
                >
                  🖼×
                </button>
              </Show>
              <button
                type="button"
                class="panel-inspector-delete"
                onClick={() => void deleteNode()}
                title="このノードを削除"
              >
                🗑
              </button>
            </span>
          </div>
          <div class="panel-inspector-era-row panel-inspector-era-row--top">
            <span class="panel-inspector-era-label">時間軸:</span>
            <EraSelector variant="pills" scrollable={true} />
          </div>
        </header>
        <div class="panel-inspector-scroll">
          <div class="panel-inspector-body">
            {/* 上段: 2 列 (左 = 立ち絵 + サムネ位置 / 右 = compact フィールド) */}
            <div class="panel-inspector-two-col">
              <div
                class="panel-inspector-portrait-col"
                classList={{ 'panel-inspector-portrait-col--drop': isDragOver() }}
                onDragOver={onThumbDragOver}
                onDragLeave={onThumbDragLeave}
                onDrop={onThumbDrop}
              >
                <PortraitCropper
                  node={node()!}
                  width={220}
                  onChange={(rect) => void saveThumbnailRect(rect)}
                  onUpload={(file) => void uploadThumbnail(file)}
                />
                <div class="panel-inspector-portrait-actions">
                  <button
                    type="button"
                    class="panel-inspector-thumb-button"
                    onClick={onPickFile}
                    title="ファイル選択ダイアログ"
                  >
                    📁 画像を選択
                  </button>
                </div>
              </div>
              <div class="panel-inspector-compact-col">
                <For each={compactGroups()}>
                  {(group) => (
                    <FieldGroup
                      title={group.title}
                      templateId={template()!.id}
                      fields={group.fields}
                      resolvedFields={resolvedFields()}
                      node={node()!}
                      issues={issues()}
                      project={ProjectService.currentProject()!}
                      refOptions={refOptions()}
                      isVariantMode={!EraContext.isBase()}
                      overrideMap={overrideMap()}
                      onInput={setField}
                      onRemoveOverride={removeOverride}
                      onBlur={onFieldBlur}
                    />
                  )}
                </For>
              </div>
            </div>
            {/* 下段: 1 列 (long 系: multiline / markdown) */}
            <Show when={longGroups().length > 0}>
              <div class="panel-inspector-long-col">
                <For each={longGroups()}>
                  {(group) => (
                    <FieldGroup
                      title={group.title}
                      templateId={template()!.id}
                      fields={group.fields}
                      resolvedFields={resolvedFields()}
                      node={node()!}
                      issues={issues()}
                      project={ProjectService.currentProject()!}
                      refOptions={refOptions()}
                      isVariantMode={!EraContext.isBase()}
                      overrideMap={overrideMap()}
                      onInput={setField}
                      onRemoveOverride={removeOverride}
                      onBlur={onFieldBlur}
                    />
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
};

const EmptyInspector: Component<{ panelId: string }> = (props) => (
  <div class="panel-inspector-empty">
    <p>ノードを選択してください。</p>
    <p class="panel-inspector-hint">
      <code>{props.panelId}</code> · select a node from the Outline panel to edit
    </p>
  </div>
);

// ===== FieldGroup (PR-O) =====
//
// テンプレ field を `field.group` ごとにまとめて折りたたみ可能セクションとして
// 表示。折りたたみ状態は localStorage に <templateId>:<group> キーで永続化。

const COLLAPSE_STORAGE = 'scenario-studio:inspector-collapsed';

function loadCollapsed(): Record<string, boolean> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(COLLAPSE_STORAGE);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
}

function saveCollapsed(state: Record<string, boolean>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(COLLAPSE_STORAGE, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

const [collapsedMap, setCollapsedMap] = createSignal<Record<string, boolean>>(loadCollapsed());

function isCollapsed(templateId: string, group: string): boolean {
  return collapsedMap()[`${templateId}:${group}`] === true;
}
function toggleCollapsed(templateId: string, group: string): void {
  const key = `${templateId}:${group}`;
  const next = { ...collapsedMap(), [key]: !isCollapsed(templateId, group) };
  setCollapsedMap(next);
  saveCollapsed(next);
}

interface FieldGroupProps {
  title: string;
  templateId: string;
  fields: readonly FieldSchema[];
  resolvedFields: { readonly [k: string]: FieldValue };
  node: ScenarioNode;
  issues: readonly ValidationIssue[];
  project: NonNullable<ReturnType<typeof ProjectService.currentProject>>;
  refOptions: readonly NodeRefOption[];
  isVariantMode: boolean;
  overrideMap: ReadonlySet<string>;
  onInput: (fieldId: string, v: FieldValue) => void;
  onRemoveOverride: (fieldId: string) => void;
  onBlur: () => void;
}

const FieldGroup: Component<FieldGroupProps> = (props) => {
  const collapsed = (): boolean => isCollapsed(props.templateId, props.title);
  const overrideCount = createMemo(
    () => props.fields.filter((f) => props.overrideMap.has(f.id)).length,
  );
  const errorCount = createMemo(
    () =>
      props.fields.filter((f) =>
        props.issues.some((i) => i.fieldId === f.id && i.severity === 'error'),
      ).length,
  );
  return (
    <section class="panel-inspector-group" classList={{ collapsed: collapsed() }}>
      <header
        class="panel-inspector-group-header"
        onClick={() => toggleCollapsed(props.templateId, props.title)}
      >
        <span class="panel-inspector-group-toggle" aria-hidden="true">
          {collapsed() ? '▶' : '▼'}
        </span>
        <span class="panel-inspector-group-title">{props.title}</span>
        <span class="panel-inspector-group-count">{props.fields.length}</span>
        <Show when={errorCount() > 0}>
          <span class="panel-inspector-group-badge error" title={`${errorCount()} 件のエラー`}>
            ⛔ {errorCount()}
          </span>
        </Show>
        <Show when={overrideCount() > 0}>
          <span
            class="panel-inspector-group-badge variant"
            title={`${overrideCount()} 件の variant override`}
          >
            ◆ {overrideCount()}
          </span>
        </Show>
      </header>
      <Show when={!collapsed()}>
        <div class="panel-inspector-group-body">
          <For each={props.fields}>
            {(field) => {
              // PR-AI: per-field の値 / issue / override を createMemo で
              // 包み、Era 切替や他 field 編集による親再評価で DOM が
              // 不必要に patch されないようにする (fine-grained reactivity)。
              const value = createMemo(
                () => props.resolvedFields[field.id] ?? props.node.fields[field.id],
              );
              const issue = createMemo(() => props.issues.find((i) => i.fieldId === field.id));
              const hasOverride = createMemo(() => props.overrideMap.has(field.id));
              return (
                <FieldRow
                  field={field}
                  value={value()}
                  issue={issue()}
                  project={props.project}
                  refOptions={props.refOptions}
                  isVariantMode={props.isVariantMode}
                  hasOverride={hasOverride()}
                  node={props.node}
                  onInput={(v) => props.onInput(field.id, v)}
                  onRemoveOverride={() => props.onRemoveOverride(field.id)}
                  onBlur={props.onBlur}
                />
              );
            }}
          </For>
        </div>
      </Show>
    </section>
  );
};

interface FieldRowProps {
  field: FieldSchema;
  value: FieldValue | undefined;
  issue?: ValidationIssue | undefined;
  project: NonNullable<ReturnType<typeof ProjectService.currentProject>>;
  refOptions: readonly NodeRefOption[];
  /** 非 base Era 表示中 (variant 編集モード)。 */
  isVariantMode: boolean;
  /** 当該 Era で当該フィールドに直接 override が定義されているか。 */
  hasOverride: boolean;
  /** PR-AR: 右クリック AI で渡す ScenarioNode (FieldAiContext を組み立てる)。 */
  node: ScenarioNode;
  onInput: (v: FieldValue) => void;
  onRemoveOverride: () => void;
  onBlur: () => void;
}

const FieldRow: Component<FieldRowProps> = (props) => {
  const base = createMemo(() => ({
    fieldId: props.field.id,
    label: props.field.label,
    description: props.field.description,
    error: props.issue?.severity === 'error' ? props.issue.message : undefined,
  }));

  /** PR-AR: テキスト系フィールドの右クリック AI コンテキスト。 */
  function openTextAiMenu(e: MouseEvent): void {
    const display =
      typeof props.node.fields['display_name'] === 'string'
        ? (props.node.fields['display_name'] as string)
        : props.node.slug;
    const glossaryTerms = (props.project.project.glossary ?? []).map((g) => g.term);
    const ctx: FieldAiContext = {
      target: { kind: 'node-field', nodeId: props.node.id, fieldId: props.field.id },
      ...(typeof props.value === 'string' ? { currentValue: props.value } : {}),
      projectContext: {
        nodeSlug: props.node.slug,
        displayName: display,
        templateId: props.node.templateId,
        eraId: EraContext.currentEraId(),
        glossaryTerms,
        relatedNodes: [],
      },
    };
    FieldAiActions.openTextMenu(e, ctx, {
      onAccept: (text) => props.onInput(text),
    });
  }
  // PR-X: short type は default compact (ラベル: 値 の inline 表示)
  const isCompact = (): boolean => {
    if (props.field.compact !== undefined) return props.field.compact;
    return (
      props.field.type === 'string' ||
      props.field.type === 'int' ||
      props.field.type === 'number' ||
      props.field.type === 'enum' ||
      props.field.type === 'bool' ||
      props.field.type === 'node_ref' ||
      props.field.type === 'media_ref'
    );
  };
  return (
    <div
      class="panel-inspector-field-row"
      classList={{
        'panel-inspector-field-row--variant': props.hasOverride,
        'panel-inspector-field-row--era-mode': props.isVariantMode,
        'panel-inspector-field-row--compact': isCompact(),
      }}
    >
      <Show when={props.isVariantMode}>
        <div class="panel-inspector-field-meta">
          <Show
            when={props.hasOverride}
            fallback={<span class="panel-inspector-variant-badge inherit">継承中</span>}
          >
            <span class="panel-inspector-variant-badge override">variant override</span>
            <button
              type="button"
              class="panel-inspector-variant-remove"
              onClick={() => props.onRemoveOverride()}
              title="この Era の override を解除してベース値に戻す"
            >
              × override 解除
            </button>
            <button
              type="button"
              class="panel-inspector-variant-bulk"
              onClick={() => {
                const nodeId = SelectionContext.selectedNodeId();
                if (!nodeId || props.value === undefined) return;
                BulkVariantOverlay.show({
                  nodeId,
                  fieldId: props.field.id,
                  fieldLabel: props.field.label,
                  sourceEraId: EraContext.currentEraId(),
                  value: props.value,
                });
              }}
              title="この override 値を別の Era にも一括適用 (PR-AP)"
            >
              ⤴ 他 Era にも適用
            </button>
          </Show>
        </div>
      </Show>
      <Switch>
        <Match when={props.field.type === 'string' || props.field.type === 'media_ref'}>
          <TextInput
            {...base()}
            value={typeof props.value === 'string' ? props.value : undefined}
            onInput={props.onInput}
            onBlur={props.onBlur}
            onContextMenu={
              props.field.type === 'string' ? (e: MouseEvent) => openTextAiMenu(e) : undefined
            }
            maxLength={
              props.field.type === 'string'
                ? (props.field as { maxLength?: number }).maxLength
                : undefined
            }
          />
        </Match>
        <Match when={props.field.type === 'multiline_string' || props.field.type === 'markdown'}>
          <MultilineInput
            {...base()}
            value={typeof props.value === 'string' ? props.value : undefined}
            onInput={props.onInput}
            onBlur={props.onBlur}
            onContextMenu={(e: MouseEvent) => openTextAiMenu(e)}
            maxLength={
              props.field.type === 'multiline_string'
                ? (props.field as { maxLength?: number }).maxLength
                : undefined
            }
            rows={props.field.type === 'markdown' ? 8 : 4}
          />
        </Match>
        <Match when={props.field.type === 'int' || props.field.type === 'number'}>
          <NumberInput
            {...base()}
            value={typeof props.value === 'number' ? props.value : undefined}
            integer={props.field.type === 'int'}
            min={(props.field as { min?: number }).min}
            max={(props.field as { max?: number }).max}
            unit={(props.field as { unit?: string }).unit}
            onInput={(v) => props.onInput(v ?? null)}
            onBlur={props.onBlur}
          />
        </Match>
        <Match when={props.field.type === 'enum'}>
          <EnumSelect
            {...base()}
            value={typeof props.value === 'string' ? props.value : undefined}
            values={(props.field as { values: readonly string[] }).values ?? []}
            onInput={(v) => props.onInput(v)}
            onBlur={props.onBlur}
          />
        </Match>
        <Match when={props.field.type === 'bool'}>
          <CheckboxField
            {...base()}
            value={typeof props.value === 'boolean' ? props.value : undefined}
            onInput={(v) => props.onInput(v)}
            onBlur={props.onBlur}
          />
        </Match>
        <Match when={props.field.type === 'node_ref'}>
          <NodeRefPicker
            {...base()}
            value={typeof props.value === 'string' ? props.value : undefined}
            options={props.refOptions}
            onInput={(v) => props.onInput(v ?? null)}
            onBlur={props.onBlur}
          />
          <Show when={typeof props.value === 'string' && props.value !== ''}>
            <NodeRefPreview targetId={props.value as string} project={props.project} />
          </Show>
        </Match>
      </Switch>
    </div>
  );
};

/**
 * PR-AG: node_ref フィールドの「リンク先」プレビュー。
 * サムネ + display_name + テンプレ名 + ジャンプボタンを inline 表示。
 */
const NodeRefPreview: Component<{
  targetId: string;
  project: NonNullable<ReturnType<typeof ProjectService.currentProject>>;
}> = (props) => {
  const target = createMemo(() => props.project.project.nodes.get(props.targetId as never));
  const display = createMemo<string>(() => {
    const t = target();
    if (!t) return '';
    const v = t.fields['display_name'];
    return typeof v === 'string' && v !== '' ? v : t.slug;
  });
  const templateLabel = createMemo<string>(() => {
    const t = target();
    if (!t) return '';
    return props.project.templates.tryGet(t.templateId as never)?.displayName ?? t.templateId;
  });
  return (
    <Show
      when={target()}
      fallback={
        <div class="panel-inspector-ref-preview panel-inspector-ref-preview--missing">
          <span>⚠ 参照先が見つかりません</span>
          <code>{props.targetId}</code>
        </div>
      }
    >
      {(t) => (
        <div class="panel-inspector-ref-preview">
          <NodeThumbnail node={t()} size={28} />
          <span class="panel-inspector-ref-display">{display()}</span>
          <span class="panel-inspector-ref-template">{templateLabel()}</span>
          <button
            type="button"
            class="panel-inspector-ref-jump"
            onClick={() => SelectionContext.selectNode(t().id)}
            title="このノードを Inspector で開く"
          >
            →
          </button>
        </div>
      )}
    </Show>
  );
};

/**
 * ProjectModel.nodes の Map 自体は immutable だが、内部の単一 ScenarioNode を差替える。
 * Solid signal は ProjectService.currentProject の identity 変更で reflow する想定。
 * MVP は in-place 差替 + ctx 再 set で促す (M4 で createStore を本格導入し細粒度反応にする)。
 */
function bumpProject(
  ctx: ReturnType<typeof ProjectService.currentProject> & object,
  id: NodeId,
): void {
  const store = ctx.history.get(id);
  if (!store) return;
  const oldNode = ctx.project.nodes.get(id);
  if (!oldNode) return;
  const newFields = store.toRecord();
  const newNode: ScenarioNode = { ...oldNode, fields: newFields };
  const nextNodes = new Map(ctx.project.nodes);
  nextNodes.set(id, newNode);
  // Map は immutable (ReadonlyMap) として公開しているが、
  // M3 では in-place 差替を許容 (M4 で immer 化)。
  Object.assign(ctx.project, { nodes: nextNodes });
}
