import { createSignal } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { FieldValue, NodeId } from '@scenario-studio/core';

// 注意: ProjectService / save-scheduler-binding / Toast は accept() の時のみ
// 動的に import する。これは ProjectService が `virtual:ff7-sample` (Vite plugin
// 提供) を eager import しており、vitest では解決できないため。
// テストは scanner / queue API (enqueue/reject) だけを叩けるよう top-level を軽量化する。

// PR-AY: AI Patch Queue v1 (UX-6)
// AI / mechanical 修正提案を「即適用」せず、queue に積んで人間が承認/却下する場。
// v1 では node-field 単位の patch のみ。scope は将来 scene-block や file-text にも拡張可。
// Accept した patch は通常の NodeFieldStore.set() を経由するので、Undo/Redo に乗る。
// 詳細: ../../../../Documentation/ScenarioEditor/22_ux_feature_review.md UX-6

export type PatchSource =
  | 'glossary-fix' // 用語表記修正 (forbidden → 正式)
  | 'ai-suggestion'
  | 'scene-meta-suggestion'
  | 'manual';

export type PatchStatus = 'pending' | 'accepted' | 'rejected';

export interface NodeFieldTarget {
  kind: 'node-field';
  nodeId: NodeId;
  fieldId: string;
  /** Inspector / Outline で表示するため node.slug を保存。slug 変更には追従しない。 */
  nodeSlug: string;
  /** 表示用 (e.g. キャラの display_name)。slug fallback。 */
  nodeLabel: string;
}

export type PatchTarget = NodeFieldTarget;

export interface AiPatch {
  id: string;
  target: PatchTarget;
  before: FieldValue;
  after: FieldValue;
  /** 1 行サマリ。e.g. "「アクトラ」→「アクトラテクト」". */
  summary: string;
  /** ルール / 出典 (UI 上の chip 表示用)。 */
  source: PatchSource;
  /** 任意の補足説明。なぜこの修正を提案したか。 */
  rationale?: string;
  createdAt: number;
  status: PatchStatus;
}

export interface EnqueuePatchInput {
  target: PatchTarget;
  before: FieldValue;
  after: FieldValue;
  summary: string;
  source: PatchSource;
  rationale?: string;
}

const [patches, setPatches] = createSignal<readonly AiPatch[]>([]);

let nextSeq = 1;
function genId(): string {
  // crypto.randomUUID は WebCrypto 環境前提。test 環境用に fallback。
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  nextSeq += 1;
  return `patch-${Date.now()}-${nextSeq}`;
}

function dedupeKey(p: EnqueuePatchInput): string {
  return `${p.target.kind}:${p.target.nodeId}:${p.target.fieldId}:${JSON.stringify(p.after)}`;
}

function enqueue(input: EnqueuePatchInput): AiPatch | undefined {
  // 同じ (node, field, after) で pending な patch があれば二重登録しない
  const key = dedupeKey(input);
  const existing = patches().find((p) => p.status === 'pending' && dedupeKey({ ...p }) === key);
  if (existing) return existing;
  const patch: AiPatch = {
    id: genId(),
    target: input.target,
    before: input.before,
    after: input.after,
    summary: input.summary,
    source: input.source,
    ...(input.rationale !== undefined ? { rationale: input.rationale } : {}),
    createdAt: Date.now(),
    status: 'pending',
  };
  setPatches((prev) => [...prev, patch]);
  return patch;
}

function bumpProject(
  ctx: {
    project: { nodes: ReadonlyMap<NodeId, unknown> };
    history: { get(id: NodeId): { toRecord(): Record<string, FieldValue> } | undefined };
  },
  id: NodeId,
): void {
  const store = ctx.history.get(id);
  if (!store) return;
  const oldNode = ctx.project.nodes.get(id) as { [k: string]: unknown } | undefined;
  if (!oldNode) return;
  const newFields = store.toRecord();
  const newNode = { ...oldNode, fields: newFields };
  const nextNodes = new Map(ctx.project.nodes);
  nextNodes.set(id, newNode);
  Object.assign(ctx.project, { nodes: nextNodes });
}

async function accept(id: string): Promise<void> {
  const patch = patches().find((p) => p.id === id);
  if (!patch || patch.status !== 'pending') return;
  // ProjectService / scheduler / Toast は test 環境で読めないため動的 import。
  const [{ ProjectService }, { useSaveScheduler }, { Toast }] = await Promise.all([
    import('./ProjectService'),
    import('./save-scheduler-binding'),
    import('./Toast'),
  ]);
  const ctx = ProjectService.currentProject();
  if (!ctx) {
    Toast.error('プロジェクトが開かれていません');
    return;
  }
  if (patch.target.kind !== 'node-field') return;
  const store = ctx.history.get(patch.target.nodeId);
  if (!store) {
    Toast.error('対象ノードが見つかりません');
    return;
  }
  // 適用直前に「最新値が patch.before と一致するか」を確認 (drift 検知)。
  // 一致しない = ユーザーがすでに別途編集したのでスキップ + 通知。
  const currentRecord = store.toRecord();
  const current = currentRecord[patch.target.fieldId];
  if (!isEqualFieldValue(current, patch.before)) {
    setPatches((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'rejected' } : p)));
    Toast.info(
      `patch をスキップ: ${patch.target.nodeSlug}.${patch.target.fieldId} は既に変更されています`,
    );
    return;
  }
  store.set(patch.target.fieldId, patch.after);
  bumpProject(ctx, patch.target.nodeId);
  useSaveScheduler().schedule(patch.target.nodeId);
  setPatches((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'accepted' } : p)));
}

function reject(id: string): void {
  setPatches((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'rejected' } : p)));
}

function clear(): void {
  // 完了 (accepted/rejected) のみ削除 — 未承認は残す
  setPatches((prev) => prev.filter((p) => p.status === 'pending'));
}

function clearAll(): void {
  setPatches([]);
}

async function acceptAll(): Promise<void> {
  // 順序を維持 (pending を上から消化)
  const toApply = patches().filter((p) => p.status === 'pending');
  for (const p of toApply) {
    await accept(p.id);
  }
}

function rejectAll(): void {
  setPatches((prev) =>
    prev.map((p) => (p.status === 'pending' ? { ...p, status: 'rejected' } : p)),
  );
}

// pending / pendingCount は memo ではなく直接 derive する。
// createMemo は外部 (test など) から呼んだ時に「reactive owner なし」で
// stale 値を返すケースがあるため、明示的な derive 関数で signal を読む。
const pending: Accessor<readonly AiPatch[]> = () => patches().filter((p) => p.status === 'pending');

const all: Accessor<readonly AiPatch[]> = patches;

const pendingCount: Accessor<number> = () => pending().length;

function isEqualFieldValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  // FieldValue 内部は YAML 由来 — 配列 / プレーンオブジェクトを構造比較
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export const AiPatchQueue = {
  all,
  pending,
  pendingCount,
  enqueue,
  accept,
  acceptAll,
  reject,
  rejectAll,
  clear,
  clearAll,
};
