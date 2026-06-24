import { createRelation, type Relation, type RelationId, type NodeId } from '@scenario-studio/core';
import type { RelationType } from '@scenario-studio/core';
import { ProjectService } from './ProjectService';
import { Toast } from './Toast';

// 明示 Relations の CRUD と project model 同期 (PR-E)。
// 永続化は ctx.relationsRepository (Relations/relations.yaml) に「全件 dump」方式。
// Phase 3 で diff-only 永続化に切替余地を残す。
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md §2,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M5

async function persist(next: readonly Relation[]): Promise<void> {
  const ctx = ProjectService.currentProject();
  if (!ctx) return;
  await ctx.relationsRepository.save(next);
  Object.assign(ctx.project, { relations: next });
  ProjectService.touch();
}

/** 任意フィールドを trim して設定。空文字なら未設定 (キー削除) にする。 */
function setOptional(
  rel: Relation,
  key: 'labelFrom' | 'labelTo' | 'description',
  value: string | undefined,
): void {
  if (value === undefined) return;
  const trimmed = value.trim();
  if (trimmed === '') delete rel[key];
  else rel[key] = trimmed;
}

export const RelationsService = {
  async add(input: {
    source: NodeId;
    target: NodeId;
    type: RelationType;
  }): Promise<Relation | undefined> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return undefined;
    const rel = createRelation(input);
    try {
      await persist([...ctx.project.relations, rel]);
      Toast.success(`関係を追加: ${input.type}`);
      return rel;
    } catch (e) {
      Toast.error(`関係の追加に失敗: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  },

  async remove(id: RelationId): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const next = ctx.project.relations.filter((r) => r.id !== id);
    try {
      await persist(next);
    } catch (e) {
      Toast.error(`関係の削除に失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  },

  async setType(id: RelationId, type: RelationType): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const next = ctx.project.relations.map((r) => (r.id === id ? { ...r, type } : r));
    try {
      await persist(next);
    } catch (e) {
      Toast.error(`関係の更新に失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  },

  /** 種類 + 双方向ラベル + 説明をまとめて更新する (グラフの関係編集 modal 用)。 */
  async setDetails(
    id: RelationId,
    patch: { type?: string; labelFrom?: string; labelTo?: string; description?: string },
  ): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const next = ctx.project.relations.map((r) => {
      if (r.id !== id) return r;
      const updated: Relation = { ...r };
      if (patch.type !== undefined && patch.type.trim() !== '') updated.type = patch.type.trim();
      setOptional(updated, 'labelFrom', patch.labelFrom);
      setOptional(updated, 'labelTo', patch.labelTo);
      setOptional(updated, 'description', patch.description);
      return updated;
    });
    try {
      await persist(next);
      Toast.success('関係を更新しました', 1500);
    } catch (e) {
      Toast.error(`関係の更新に失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  },

  async setLabel(id: RelationId, label: string): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const next = ctx.project.relations.map((r) => {
      if (r.id !== id) return r;
      if (label === '') {
        const { label: _omitted, ...rest } = r;
        void _omitted;
        return rest;
      }
      return { ...r, label };
    });
    try {
      await persist(next);
    } catch (e) {
      Toast.error(`関係ラベルの更新に失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};
