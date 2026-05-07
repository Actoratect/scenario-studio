import type { EraId, FieldValue, NodeId, NodeVariant, ScenarioNode } from '@scenario-studio/core';
import { ProjectService } from './ProjectService';
import { Toast } from './Toast';

// Era Variant の編集 (PR-L)。
// ScenarioNode.variants 配列を直接書き換えて NodeRepository.save する。
// NodeFieldStore (Yjs) は base.fields のみ扱うので、variant 編集はこの service が担当。
// 詳細: ../../../../Documentation/ScenarioEditor/03_data-model.md §1.2,
//       ../../../../Documentation/ScenarioEditor/05_timeline.md

async function persistNode(node: ScenarioNode): Promise<void> {
  const ctx = ProjectService.currentProject();
  if (!ctx) return;
  await ctx.nodeRepository.save(node);
  // ProjectModel.nodes Map を更新 → Inspector / Graph の reactive 更新を促す
  const next = new Map(ctx.project.nodes);
  next.set(node.id, node);
  Object.assign(ctx.project, { nodes: next });
}

function findOrCreateVariant(node: ScenarioNode, eraId: EraId): NodeVariant {
  const existing = node.variants?.find((v) => v.eraId === eraId);
  return existing ?? { eraId };
}

function withReplacedVariant(node: ScenarioNode, variant: NodeVariant): ScenarioNode {
  const variants = node.variants ?? [];
  const filtered = variants.filter((v) => v.eraId !== variant.eraId);
  // fieldsOverride / thumbnailOverride / isAlive が全て無ければ variant 自体を消す
  const empty =
    (!variant.fieldsOverride || Object.keys(variant.fieldsOverride).length === 0) &&
    variant.thumbnailOverride === undefined &&
    variant.isAlive === undefined;
  if (empty) {
    if (filtered.length === 0) {
      const { variants: _v, ...rest } = node;
      void _v;
      return rest;
    }
    return { ...node, variants: filtered };
  }
  return { ...node, variants: [...filtered, variant] };
}

export const VariantsService = {
  /** 指定フィールドに対する variant override を作成 / 更新する。 */
  async setFieldOverride(
    nodeId: NodeId,
    eraId: EraId,
    fieldId: string,
    value: FieldValue,
  ): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const node = ctx.project.nodes.get(nodeId);
    if (!node) return;
    const variant = findOrCreateVariant(node, eraId);
    const nextOverride: { [k: string]: FieldValue } = {
      ...(variant.fieldsOverride ?? {}),
      [fieldId]: value,
    };
    const nextVariant: NodeVariant = { ...variant, fieldsOverride: nextOverride };
    const nextNode = withReplacedVariant(node, nextVariant);
    try {
      await persistNode(nextNode);
    } catch (e) {
      Toast.error(`variant 更新に失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  },

  /** 指定フィールドの variant override を解除 (= ベース値継承に戻す)。 */
  async removeFieldOverride(nodeId: NodeId, eraId: EraId, fieldId: string): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const node = ctx.project.nodes.get(nodeId);
    if (!node) return;
    const variant = node.variants?.find((v) => v.eraId === eraId);
    if (!variant?.fieldsOverride || !(fieldId in variant.fieldsOverride)) return;
    const { [fieldId]: _omitted, ...rest } = variant.fieldsOverride;
    void _omitted;
    const nextVariant: NodeVariant = { ...variant };
    if (Object.keys(rest).length === 0) {
      delete (nextVariant as { fieldsOverride?: unknown }).fieldsOverride;
    } else {
      nextVariant.fieldsOverride = rest;
    }
    const nextNode = withReplacedVariant(node, nextVariant);
    try {
      await persistNode(nextNode);
    } catch (e) {
      Toast.error(`variant 削除に失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  },

  /** 当該フィールドに当該 Era の override が直接定義されているか (継承は除外)。 */
  hasFieldOverride(node: ScenarioNode, eraId: EraId, fieldId: string): boolean {
    const variant = node.variants?.find((v) => v.eraId === eraId);
    return !!(variant?.fieldsOverride && fieldId in variant.fieldsOverride);
  },

  /** PR-AP: 同じ値を複数 Era にまとめて適用する。
   *  各 Era の variant に fieldsOverride を 1 ノード保存 = 1 disk write で済ませる。 */
  async bulkSetFieldOverride(
    nodeId: NodeId,
    eraIds: readonly EraId[],
    fieldId: string,
    value: FieldValue,
  ): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx || eraIds.length === 0) return;
    const node = ctx.project.nodes.get(nodeId);
    if (!node) return;
    let next = node;
    for (const eraId of eraIds) {
      const variant = findOrCreateVariant(next, eraId);
      const nextOverride: { [k: string]: FieldValue } = {
        ...(variant.fieldsOverride ?? {}),
        [fieldId]: value,
      };
      const nextVariant: NodeVariant = { ...variant, fieldsOverride: nextOverride };
      next = withReplacedVariant(next, nextVariant);
    }
    try {
      await persistNode(next);
    } catch (e) {
      Toast.error(`bulk variant 更新に失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};
