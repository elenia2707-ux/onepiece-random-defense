import type { GradeId, RecipeId, UnitId, WispPools } from '../data/types';
import type { InventoryIndex } from './InventoryIndex';
import type { RecipeGraph } from './RecipeGraph';

export interface WispHint {
  readonly unitId: UnitId;
  readonly completes?: RecipeId;
  readonly gain: number;
}

export class WispSystem {
  private readonly pools: WispPools;
  private readonly graph: RecipeGraph;
  private cachedHints: Partial<Record<GradeId, readonly WispHint[]>> = {};

  public constructor(pools: WispPools, graph: RecipeGraph) {
    this.pools = pools;
    this.graph = graph;
  }

  public isAllowedSelection(grade: GradeId, unitId: UnitId): boolean {
    const pool = this.pools[grade];
    return Boolean(pool && pool.includes(unitId));
  }

  public getHints(): Partial<Record<GradeId, readonly WispHint[]>> {
    return this.cachedHints;
  }

  /**
   * Recomputes wispHints ONLY on ticks where inventory changed AND player holds >= 1 wisp (AGENTS.md §5).
   */
  public recomputeHintsIfOwned(
    wisps: Readonly<Record<GradeId, number>>,
    inventory: InventoryIndex,
  ): void {
    const ownedGrades = Object.keys(wisps)
      .filter((g) => (wisps[g] ?? 0) > 0)
      .sort((a, b) => a.localeCompare(b));

    if (ownedGrades.length === 0) {
      this.cachedHints = {};
      return;
    }

    const nextHints: Partial<Record<GradeId, readonly WispHint[]>> = {};
    for (const grade of ownedGrades) {
      const pool = this.pools[grade];
      if (!pool) continue;

      const list: WispHint[] = pool.map((unitId) => {
        let completes: RecipeId | undefined;
        let maxGain = 0;

        const directRecipes = this.graph.byIngredient.get(unitId) ?? [];
        for (const r of directRecipes) {
          let totalNeed = 0;
          let totalHaveBefore = 0;
          let totalHaveAfter = 0;

          for (const ing of r.ingredients) {
            totalNeed += ing.n;
            const cur = inventory.getAvailableCount(ing.unit);
            totalHaveBefore += Math.min(cur, ing.n);
            const after = ing.unit === unitId ? cur + 1 : cur;
            totalHaveAfter += Math.min(after, ing.n);
          }

          if (totalHaveBefore < totalNeed && totalHaveAfter === totalNeed && !completes) {
            completes = r.id;
          }
          const gainRatio = totalNeed > 0 ? (totalHaveAfter - totalHaveBefore) / totalNeed : 0;
          if (gainRatio > maxGain) {
            maxGain = gainRatio;
          }
        }

        return completes
          ? { unitId, completes, gain: maxGain }
          : { unitId, gain: maxGain };
      });

      list.sort((a, b) => {
        const ac = a.completes ? 1 : 0;
        const bc = b.completes ? 1 : 0;
        if (ac !== bc) return bc - ac;
        if (b.gain !== a.gain) return b.gain - a.gain;
        return a.unitId.localeCompare(b.unitId);
      });

      nextHints[grade] = list;
    }

    this.cachedHints = nextHints;
  }
}
