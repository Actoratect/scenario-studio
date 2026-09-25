import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nodeId, type Relation } from '@scenario-studio/core';
import { RelationsService } from './RelationsService';
import { GlobalHistoryService } from './GlobalHistoryService';
import { SaveStatus } from './SaveStatus';
import { Toast } from './Toast';

const source = nodeId('node.a');
const target = nodeId('node.b');
let context: {
  handle: { id: string };
  project: { nodes: Map<string, object>; relations: readonly Relation[] };
  relationsRepository: { save: ReturnType<typeof vi.fn> };
};
vi.mock('./ProjectService', () => ({
  ProjectService: { currentProject: () => context, touch: vi.fn() },
}));
beforeEach(() => {
  context = {
    handle: { id: 'relations-test' },
    project: {
      nodes: new Map([
        [source, {}],
        [target, {}],
      ]),
      relations: [],
    },
    relationsRepository: { save: vi.fn().mockResolvedValue(undefined) },
  };
  GlobalHistoryService.clear();
  RelationsService.discardPending();
});
afterEach(async () => {
  await RelationsService.flushPending();
  RelationsService.discardPending();
  SaveStatus.reset();
  Toast.clear();
});

describe('RelationsService', () => {
  it('同時追加で関係を失わず、削除のUndo/Redoもディスクへ反映する', async () => {
    let release!: () => void;
    context.relationsRepository.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const first = RelationsService.add({ source, target, text: '友人' });
    const second = RelationsService.add({ source: target, target: source, text: '信頼' });
    expect(context.project.relations).toHaveLength(2);
    release();
    await Promise.all([first, second]);
    expect(context.relationsRepository.save).toHaveBeenLastCalledWith(context.project.relations);
    await RelationsService.remove(context.project.relations[0]!.id);
    expect(context.project.relations).toHaveLength(1);
    await GlobalHistoryService.undo();
    expect(context.project.relations).toHaveLength(2);
    await GlobalHistoryService.redo();
    expect(context.project.relations).toHaveLength(1);
    await RelationsService.flushPending();
    expect(context.relationsRepository.save).toHaveBeenLastCalledWith(context.project.relations);
  });
});
