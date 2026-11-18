import type { SlotRef } from '../core/CommandQueue';
import type { RecipeId, UnitId } from '../data/types';
import { CraftPlanner } from './CraftPlanner';
import type { InventoryIndex } from './InventoryIndex';
import type { RecipeGraph } from './RecipeGraph';

export interface AtomicCraftCallbacks {
  removeUnitByUid(uid: number): SlotRef | null;
  spawnCraftedUnit(unitId: UnitId, preferredFieldIndex?: number): number | null;
}

export type CraftExecutionResult =
  | { readonly ok: true; readonly outputUid: number; readonly outputUnitId: UnitId }
  | { readonly ok: false; readonly reason: string };

/**
 * Executes single or chain crafting atomically within a single simulation tick.
 * Re-validates against live InventoryIndex at execution time (AGENTS.md §4 & §5).
 */
export class CraftSystem {
  private readonly graph: RecipeGraph;
  private readonly planner: CraftPlanner;

  public constructor(graph: RecipeGraph) {
    this.graph = graph;
    this.planner = new CraftPlanner(graph);
  }

  public execute(
    recipeId: RecipeId,
    allowChain: boolean,
    inventory: InventoryIndex,
    callbacks: AtomicCraftCallbacks,
  ): CraftExecutionResult {
    const recipe = this.graph.recipesById.get(recipeId);
    if (!recipe) {
      return { ok: false, reason: '존재하지 않는 조합식입니다.' };
    }

    let steps: RecipeId[];
    const canDirect = recipe.ingredients.every(
      (ing) => inventory.getAvailableCount(ing.unit) >= ing.n,
    );

    if (canDirect) {
      steps = [recipeId];
    } else if (allowChain) {
      const planned = this.planner.planChain(recipe, inventory.getAvailableMap());
      if (!planned) {
        return { ok: false, reason: '조합 재료가 부족합니다.' };
      }
      steps = planned;
    } else {
      return { ok: false, reason: '직접 조합 재료가 부족합니다.' };
    }

    // Dry-run validation over steps before mutating state so chain execution never fails halfway
    const virtualCounts = new Map<UnitId, number>(inventory.getAvailableMap());
    for (const stepId of steps) {
      const stepRec = this.graph.recipesById.get(stepId);
      if (!stepRec) {
        return { ok: false, reason: '하위 조합식 검증에 실패했습니다.' };
      }
      for (const ing of stepRec.ingredients) {
        const cur = virtualCounts.get(ing.unit) ?? 0;
        if (cur < ing.n) {
          return { ok: false, reason: '중간 조합 재료가 부족합니다.' };
        }
        virtualCounts.set(ing.unit, cur - ing.n);
      }
      virtualCounts.set(stepRec.output, (virtualCounts.get(stepRec.output) ?? 0) + 1);
    }

    let lastCreatedUid: number | null = null;
    let lastOutputUnitId: UnitId = recipe.output;

    for (const stepId of steps) {
      const stepRec = this.graph.recipesById.get(stepId)!;
      const toConsume: number[] = [];
      const reserved = new Set<number>();

      for (const ing of stepRec.ingredients) {
        const picked = inventory.pickIngredientUids(ing.unit, ing.n, reserved);
        if (!picked) {
          return { ok: false, reason: '잠금 상태를 제외한 재료가 부족합니다.' };
        }
        for (const uid of picked) {
          reserved.add(uid);
          toConsume.push(uid);
        }
      }

      let firstConsumedFieldIndex: number | undefined;
      for (const uid of toConsume) {
        const oldSlot = callbacks.removeUnitByUid(uid);
        if (
          oldSlot &&
          oldSlot.area === 'field' &&
          (firstConsumedFieldIndex === undefined || oldSlot.index < firstConsumedFieldIndex)
        ) {
          firstConsumedFieldIndex = oldSlot.index;
        }
      }

      const createdUid = callbacks.spawnCraftedUnit(stepRec.output, firstConsumedFieldIndex);
      if (createdUid === null) {
        return { ok: false, reason: '배치할 빈 슬롯이 없습니다.' };
      }
      lastCreatedUid = createdUid;
      lastOutputUnitId = stepRec.output;
    }

    if (lastCreatedUid === null) {
      return { ok: false, reason: '조합 실행에 실패했습니다.' };
    }
    return { ok: true, outputUid: lastCreatedUid, outputUnitId: lastOutputUnitId };
  }
}
