import { createSignal } from 'solid-js';
import type { NodeId } from '@scenario-studio/core';

// 全 panel が購読する共通選択モデル。MVP は single selection 1 ノード。
// multi-select は Phase 3。
// 詳細: ../../../../Documentation/ScenarioEditor/12_architecture.md §5.3,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M3

const [selectedNodeId, setSelectedNodeId] = createSignal<NodeId | undefined>(undefined);

export const SelectionContext = {
  selectedNodeId,

  selectNode(id: NodeId | undefined): void {
    setSelectedNodeId(id);
  },

  clear(): void {
    setSelectedNodeId(undefined);
  },
};
