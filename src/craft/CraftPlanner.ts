import type { RecipeDef, RecipeId, UnitId } from '../data/types';
import type { RecipeGraph } from './RecipeGraph';

const MAX_CHAIN_DEPTH = 3;

export class CraftPlanner {
  private readonly graph: RecipeGraph;

  public constructor(graph: RecipeGraph) {
    this.graph = graph;
  }

  /**
   * Pure deterministic chain-craft planner over unlocked unit counts.
   * Returns ordered sub-recipe steps (excluding the final recipe itself, followed by final recipe)
   * if the missing ingredients can be crafted within depth <= 3 without double-spending units.
   */
  public planChain(
    targetRecipe: RecipeDef,
    availableCounts: ReadonlyMap<UnitId, number>,
  ): RecipeId[] | null {
    const pool = new Map<UnitId, number>();
    const closureSet = this.graph.closure.get(targetRecipe.id);
    if (closureSet) {
      for (const uid of closureSet) {
        const c = availableCounts.get(uid) ?? 0;
        if (c > 0) {
          pool.set(uid, c);
        }
      }
    }

    const missing: Array<{ unit: UnitId; shortage: number }> = [];
    for (const ing of targetRecipe.ingredients) {
      const have = pool.get(ing.unit) ?? 0;
      const used = Math.min(have, ing.n);
      pool.set(ing.unit, have - used);
      if (used < ing.n) {
        missing.push({ unit: ing.unit, shortage: ing.n - used });
      }
    }

    if (missing.length === 0) {
      return [targetRecipe.id];
    }

    const steps: RecipeId[] = [];
    for (const item of missing) {
      for (let k = 0; k < item.shortage; k++) {
        if (!this.resolveUnit(item.unit, pool, steps, 1)) {
          return null;
        }
      }
    }

    steps.push(targetRecipe.id);
    return steps;
  }

  private resolveUnit(
    unitId: UnitId,
    pool: Map<UnitId, number>,
    steps: RecipeId[],
    depth: number,
  ): boolean {
    if (depth > MAX_CHAIN_DEPTH) {
      return false;
    }
    const candidates = this.graph.byOutput.get(unitId);
    if (!candidates || candidates.length === 0) {
      return false;
    }

    for (const subRecipe of candidates) {
      const snapshotPool = new Map(pool);
      const snapshotStepsLen = steps.length;
      let ok = true;

      // Reserve direct ingredients available for subRecipe first
      const subMissing: Array<{ unit: UnitId; shortage: number }> = [];
      for (const ing of subRecipe.ingredients) {
        const have = pool.get(ing.unit) ?? 0;
        const used = Math.min(have, ing.n);
        pool.set(ing.unit, have - used);
        if (used < ing.n) {
          subMissing.push({ unit: ing.unit, shortage: ing.n - used });
        }
      }

      for (const miss of subMissing) {
        for (let k = 0; k < miss.shortage; k++) {
          if (!this.resolveUnit(miss.unit, pool, steps, depth + 1)) {
            ok = false;
            break;
          }
        }
        if (!ok) break;
      }

      if (ok) {
        steps.push(subRecipe.id);
        return true;
      }

      // Rollback failed branch
      pool.clear();
      for (const [k, v] of snapshotPool) {
        pool.set(k, v);
      }
      steps.length = snapshotStepsLen;
    }

    return false;
  }
}
