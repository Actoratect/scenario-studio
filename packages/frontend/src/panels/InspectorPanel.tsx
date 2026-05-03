import { createMemo, For, Match, onCleanup, onMount, Show, Switch } from 'solid-js';
import type { Component } from 'solid-js';
import type { GroupPanelPartInitParameters } from 'dockview-core';
import {
  resolveNode,
  validateNode,
  type FieldSchema,
  type FieldValue,
  type LocalizedString,
  type NodeId,
  type ScenarioNode,
  type ValidationIssue,
} from '@scenario-studio/core';
import {
  CheckboxField,
  EnumSelect,
  LocalizedStringInput,
  MultilineInput,
  NodeRefPicker,
  NumberInput,
  TextInput,
  type NodeRefOption,
} from '@scenario-studio/ui-kit';
import { ProjectService } from '../services/ProjectService';
import { SelectionContext } from '../services/SelectionContext';
import { EraContext } from '../services/EraContext';
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
    const store = ctx.history.get(id);
    if (!store) return;
    store.set(fieldId, value);
    bumpProject(ctx, id);
    scheduler.schedule(id);
  }

  function onFieldBlur(): void {
    const id = SelectionContext.selectedNodeId();
    if (!id) return;
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    ctx.history.get(id)?.markUndoBoundary();
  }

  return (
    <div class="panel-content panel-inspector">
      <Show when={node() && template()} fallback={<EmptyInspector panelId={params.api.id} />}>
        <header class="panel-inspector-header">
          <strong>{node()!.slug}</strong>
          <span class="panel-inspector-template">{template()!.id}</span>
          <Show when={!EraContext.isBase()}>
            <span class="panel-inspector-era">
              Era: <code>{EraContext.currentEraId()}</code>
              <Show when={appliedVariantEras().length > 0}>
                <span class="panel-inspector-variant-active">
                  · variant 適用 ({appliedVariantEras().join(' → ')})
                </span>
              </Show>
            </span>
          </Show>
        </header>
        <div class="panel-inspector-fields">
          <For each={template()!.fields}>
            {(field) => (
              <FieldRow
                field={field}
                value={resolvedFields()[field.id] ?? node()!.fields[field.id]}
                issue={issues().find((i) => i.fieldId === field.id)}
                project={ProjectService.currentProject()!}
                refOptions={refOptions()}
                onInput={(v) => setField(field.id, v)}
                onBlur={() => onFieldBlur()}
              />
            )}
          </For>
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

interface FieldRowProps {
  field: FieldSchema;
  value: FieldValue | undefined;
  issue?: ValidationIssue | undefined;
  project: NonNullable<ReturnType<typeof ProjectService.currentProject>>;
  refOptions: readonly NodeRefOption[];
  onInput: (v: FieldValue) => void;
  onBlur: () => void;
}

const FieldRow: Component<FieldRowProps> = (props) => {
  const base = createMemo(() => ({
    fieldId: props.field.id,
    label: props.field.label,
    description: props.field.description,
    error: props.issue?.severity === 'error' ? props.issue.message : undefined,
  }));
  return (
    <Switch>
      <Match when={props.field.type === 'string' || props.field.type === 'media_ref'}>
        <TextInput
          {...base()}
          value={typeof props.value === 'string' ? props.value : undefined}
          onInput={props.onInput}
          onBlur={props.onBlur}
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
          maxLength={
            props.field.type === 'multiline_string'
              ? (props.field as { maxLength?: number }).maxLength
              : undefined
          }
          rows={props.field.type === 'markdown' ? 8 : 4}
        />
      </Match>
      <Match when={props.field.type === 'localized_string'}>
        <LocalizedStringInput
          {...base()}
          value={isLocalizedString(props.value) ? props.value : undefined}
          locales={props.project.project.settings.locales}
          onInput={(v) => props.onInput(v as unknown as FieldValue)}
          onBlur={props.onBlur}
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
      </Match>
    </Switch>
  );
};

function isLocalizedString(v: FieldValue | undefined): v is LocalizedString {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.values(v).every((x) => typeof x === 'string')
  );
}

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
