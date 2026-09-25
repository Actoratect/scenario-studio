import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eraId, nodeId, type NodeId, type ScenarioNode } from '@scenario-studio/core';
import { SaveScheduler } from './SaveScheduler';
import { VariantsService } from './VariantsService';

let scheduler: SaveScheduler;
let context: {
  project: { nodes: ReadonlyMap<NodeId, ScenarioNode> };
  nodeRepository: { save: ReturnType<typeof vi.fn> };
};
vi.mock('./ProjectService', () => ({
  ProjectService: { currentProject: () => context, touch: vi.fn() },
}));
vi.mock('./save-scheduler-binding', () => ({ useSaveScheduler: () => scheduler }));
vi.mock('./Toast', () => ({ Toast: { error: vi.fn() } }));

const id = nodeId('node.hiyori');
const later = eraId('era.later');

beforeEach(() => {
  context = {
    project: {
      nodes: new Map([
        [
          id,
          {
            id,
            templateId: 'template.character',
            slug: 'hiyori',
            fields: { display_name: 'ひより' },
          },
        ],
      ]),
    },
    nodeRepository: { save: vi.fn() },
  };
  scheduler = new SaveScheduler({
    flush: async (nodeId) => {
      await context.nodeRepository.save(context.project.nodes.get(nodeId));
    },
  });
});

describe('VariantsService', () => {
  it('連続入力を即反映し、異なる項目も取りこぼさず明示保存へ積む', async () => {
    const first = VariantsService.setFieldOverride(id, later, 'profile', '放');
    const second = VariantsService.setFieldOverride(id, later, 'profile', '放送部');
    const third = VariantsService.setFieldOverride(id, later, 'pale', true);
    expect(context.project.nodes.get(id)?.variants?.[0]?.fieldsOverride).toEqual({
      profile: '放送部',
      pale: true,
    });
    await Promise.all([first, second, third]);
    expect(context.nodeRepository.save).not.toHaveBeenCalled();
    expect(scheduler.pendingCount).toBe(1);
    await scheduler.flushAllAsync();
    expect(context.nodeRepository.save).toHaveBeenCalledOnce();
    expect(context.nodeRepository.save).toHaveBeenCalledWith(context.project.nodes.get(id));
  });

  it('遅い保存が完了しても保存中に編集した台詞を巻き戻さず未保存として残す', async () => {
    let finish: (() => void) | undefined;
    const saved = new Promise<void>((resolve) => {
      finish = resolve;
    });
    context.nodeRepository.save.mockReturnValueOnce(saved);
    await VariantsService.setFieldOverride(id, later, 'dialogue_by_scene', { 待機: 'ひとつめ' });
    const pending = scheduler.flushAllAsync();
    await VariantsService.setFieldOverride(id, later, 'dialogue_by_scene', { 待機: 'ふたつめ' });
    finish!();
    await pending;
    expect(
      context.project.nodes.get(id)?.variants?.[0]?.fieldsOverride?.['dialogue_by_scene'],
    ).toEqual({ 待機: 'ふたつめ' });
    expect(scheduler.pendingCount).toBe(1);
    await scheduler.flushAllAsync();
    expect(context.nodeRepository.save).toHaveBeenLastCalledWith(context.project.nodes.get(id));
    expect(scheduler.pendingCount).toBe(0);
  });

  it('複数時代への適用と解除でも最新の他項目とベースを保持する', async () => {
    const future = eraId('era.future');
    await VariantsService.bulkSetFieldOverride(
      id,
      [later, future],
      'profile',
      '後日のプロフィール',
    );
    await VariantsService.setFieldOverride(id, later, 'first_person', 'うち');
    await VariantsService.removeFieldOverride(id, later, 'profile');
    const node = context.project.nodes.get(id)!;
    expect(node.fields['display_name']).toBe('ひより');
    expect(node.variants?.find((v) => v.eraId === later)?.fieldsOverride).toEqual({
      first_person: 'うち',
    });
    expect(node.variants?.find((v) => v.eraId === future)?.fieldsOverride).toEqual({
      profile: '後日のプロフィール',
    });
    expect(scheduler.pendingIds()).toEqual([id]);
  });
});
