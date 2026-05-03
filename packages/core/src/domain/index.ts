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

// Templates (M2)
export * from './templates/index.js';

// Template engine (M2)
export type { ValidationIssue, ValidationSeverity } from './template-engine.js';
export { defaultFields, validateNode } from './template-engine.js';

// Node repository (M2)
export type { CreateNodeOptions, NodeRepository } from './NodeRepository.js';
export { createNode, FsNodeRepository, isValidSlug } from './NodeRepository.js';
