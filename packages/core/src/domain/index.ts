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
  ThumbnailRect,
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

// Era repository (M4)
export { FsEraRepository } from './EraRepository.js';

// Scenario hierarchy (M4)
export type {
  Chapter,
  ChapterId,
  ChapterLoadError,
  ScenarioStructure,
  SceneId,
  SceneMeta,
} from './scenario.js';
export { chapterId, sceneId } from './scenario.js';
export { FsScenarioRepository } from './ScenarioRepository.js';

// Relation types (M4)
export type { RelationType, RelationTypeDefinition } from './relations.js';
export { getRelationType, RELATION_TYPES } from './relations.js';

// Glossary repository (M7)
export type { GlossaryTerm } from './GlossaryRepository.js';
export { FsGlossaryRepository } from './GlossaryRepository.js';

// Explicit Relations (PR-E) — 暗黙の node_ref 関係と並ぶ第 2 系統
export type { Relation, RelationId } from './Relation.js';
export { relationId } from './Relation.js';
export { createRelation, FsRelationsRepository } from './RelationsRepository.js';
