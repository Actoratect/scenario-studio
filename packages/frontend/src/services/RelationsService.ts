import { createRelation, type Relation, type RelationId, type NodeId } from '@scenario-studio/core';
import { ProjectService } from './ProjectService';
import { Toast } from './Toast';

// 明示 Relations の CRUD と project model 同期 (PR-E)。
// 1 関係 = source→target 方向の自由テキスト 1 本 (text)。グラフでは矢印 1 本。
// 双方向にしたい場合は逆向きの関係をもう 1 本作る (作成 modal の逆方向欄)。
// 永続化は ctx.relationsRepository (Relations/relations.yaml) に「全件 dump」方式。
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md §2

async function persist(next: readonly Relation[]): Promise<void> {
  const ctx = ProjectService.currentProject();
  if (!ctx) return;
  await ctx.relationsRepository.save(next);
  Object.assign(ctx.project, { relations: next });
  ProjectService.touch();
}

export const RelationsService = {
  /** source→target の関係を 1 本追加。text が空なら何もしない。 */
  async add(input: { source: NodeId; target: NodeId; text: string }): Promise<Relation | undefined> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return undefined;
    const text = input.text.trim();
    if (text === '') return undefined;
    const rel = createRelation({ source: input.source, target: input.target, text });
    try {
      await persist([...ctx.project.relations, rel]);
      Toast.success('関係を追加しました', 1500);
      return rel;
    } catch (e) {
      Toast.error(`関係の追加に失敗: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  },

  /** 1 本の関係の text を更新する。 */
  async update(id: RelationId, patch: { text: string }): Promise<void> {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    const text = patch.text.trim();
    if (text === '') return;
    const next = ctx.project.relations.map((r) => (r.id === id ? { ...r, text } : r));
    try {
      await persist(next);
      Toast.success('関係を更新しました', 1500);
    } catch (e) {
      Toast.error(`関係の更新に失敗: ${e instanceof Error ? e.message : String(e)}`);
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
};
