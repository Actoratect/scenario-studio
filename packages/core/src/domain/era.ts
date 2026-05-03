// Era (時間軸エポック) と階層の型 + index 構築。
// 詳細: ../../../../Documentation/ScenarioEditor/05_timeline.md §1,
//       ../../../../Documentation/ScenarioEditor/03_data-model.md §1.2

export type EraId = string & { readonly __brand: 'EraId' };
export type NodeId = string & { readonly __brand: 'NodeId' };

export const eraId = (s: string): EraId => s as EraId;
export const nodeId = (s: string): NodeId => s as NodeId;

export interface EraDefinition {
  id: EraId;
  label: string;
  /** 親 Era。ルートは undefined。 */
  parent?: EraId;
  /** 区間 Era の年範囲 (任意)。点 Era は省略。 */
  yearRange?: readonly [number, number];
}

/**
 * Era の集合に対し、祖先列挙・存在判定を高速に行うためのインデックス。
 * `buildEraIndex(eras)` で構築する。
 */
export interface EraIndex {
  /** id で Era 定義を取得。未登録なら undefined。 */
  get(id: EraId): EraDefinition | undefined;
  /**
   * `id` から root へ向かう祖先列を返す (`id` 自身を最初に含む)。
   * 例: era.medieval_late → [era.medieval_late, era.medieval, era.world]
   * 未登録 id は空配列。循環は検知して例外。
   */
  ancestorsOf(id: EraId): readonly EraId[];
  /**
   * `descendant` が `ancestor` の子孫 (または自身) であれば true。
   */
  isAncestorOf(ancestor: EraId, descendant: EraId): boolean;
  /** 登録済みの全 Era id。 */
  all(): readonly EraId[];
}

export class CircularEraHierarchyError extends Error {
  constructor(readonly chain: readonly EraId[]) {
    super(`Circular era hierarchy: ${chain.join(' -> ')}`);
    this.name = 'CircularEraHierarchyError';
  }
}

export function buildEraIndex(eras: readonly EraDefinition[]): EraIndex {
  const byId = new Map<EraId, EraDefinition>();
  for (const era of eras) {
    if (byId.has(era.id)) {
      throw new Error(`Duplicate era id: ${era.id}`);
    }
    byId.set(era.id, era);
  }
  // 親リファレンス整合性チェック (warning ではなく throw、データ生成ミスを早期発見)
  for (const era of eras) {
    if (era.parent && !byId.has(era.parent)) {
      throw new Error(`Era ${era.id} references unknown parent ${era.parent}`);
    }
  }

  const ancestorCache = new Map<EraId, readonly EraId[]>();
  function ancestorsOf(id: EraId): readonly EraId[] {
    const cached = ancestorCache.get(id);
    if (cached) return cached;
    const chain: EraId[] = [];
    const seen = new Set<EraId>();
    let cursor: EraId | undefined = id;
    while (cursor !== undefined) {
      if (seen.has(cursor)) {
        throw new CircularEraHierarchyError([...chain, cursor]);
      }
      seen.add(cursor);
      const def = byId.get(cursor);
      if (!def) break;
      chain.push(cursor);
      cursor = def.parent;
    }
    ancestorCache.set(id, chain);
    return chain;
  }

  return {
    get: (id) => byId.get(id),
    ancestorsOf,
    isAncestorOf: (ancestor, descendant) => ancestorsOf(descendant).includes(ancestor),
    all: () => Array.from(byId.keys()),
  };
}
