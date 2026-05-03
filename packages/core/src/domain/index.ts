// Domain models — pure TypeScript、DOM/Node 非依存。
// 詳細: ../../../../Documentation/ScenarioEditor/03_data-model.md, 12_architecture.md §1

export type { EraDefinition, EraId, EraIndex, NodeId } from './era.js';
export { buildEraIndex, CircularEraHierarchyError, eraId, nodeId } from './era.js';

export type {
  FieldArray,
  FieldRecord,
  FieldValue,
  MediaRef,
  NodeVariant,
  ResolvedNode,
  Scalar,
  ScenarioNode,
} from './node.js';

export { mergeField, resolveNode } from './variant.js';
