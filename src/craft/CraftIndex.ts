import type { GradeId, RecipeDef, RecipeId, UnitDef, UnitId } from '../data/types';
import { CraftPlanner } from './CraftPlanner';
import type { InventoryIndex } from './InventoryIndex';
import type { RecipeGraph } from './RecipeGraph';

export type LampState = 'ready' | 'chainReady' | 'partial' | 'none';

export interface RecipeStatus {
  readonly lamp: LampState;
  readonly have: number;
  readonly need: number;
  readonly missing: readonly { readonly unit: UnitId; readonly n: number }[];
  readonly chainSteps?: readonly RecipeId[];
}

export interface CraftView {
  readonly rev: number;
  readonly readyCount: number;
  readonly chainReadyCount: number;
  readonly byGrade: Readonly<Record<GradeId, { readonly ready: number; readonly chainReady: number }>>;
  readonly recipes: Readonly<Record<RecipeId, RecipeStatus>>;
}

export class CraftIndex {
  private readonly graph: RecipeGraph;
  private readonly unitsById: ReadonlyMap<UnitId, UnitDef>;
  private readonly planner: CraftPlanner;
  private readonly statuses = new Map<RecipeId, RecipeStatus>();
  private rev = 0;

  public constructor(graph: RecipeGraph, unitsById: ReadonlyMap<UnitId, UnitDef>) {
    this.graph = graph;
    this.unitsById = unitsById;
    this.planner = new CraftPlanner(graph);

    const emptyMap = new Map<UnitId, number>();
    for (const rid of this.graph.topo) {
      const r = this.graph.recipesById.get(rid)!;
      this.statuses.set(rid, this.evaluateRecipe(r, emptyMap));
    }
  }

  /**
   * Delta-only update: evaluates ONLY recipes affected via byIngredient / byClosure
   * for the UnitIds whose unlocked count changed.
   */
  public applyDelta(changedUnits: readonly UnitId[], inventory: InventoryIndex): boolean {
    if (changedUnits.length === 0) {
      return false;
    }
    const affected = new Set<RecipeId>();
    for (const uid of changedUnits) {
      const direct = this.graph.byIngredient.get(uid);
      if (direct) {
        for (const r of direct) {
          affected.add(r.id);
        }
      }
      const clos = this.graph.byClosure.get(uid);
      if (clos) {
        for (const rid of clos) {
          affected.add(rid);
        }
      }
    }

    if (affected.size === 0) {
      return false;
    }

    const avail = inventory.getAvailableMap();
    let changed = false;
    for (const rid of this.graph.topo) {
      if (!affected.has(rid)) continue;
      const r = this.graph.recipesById.get(rid)!;
      const next = this.evaluateRecipe(r, avail);
      const prev = this.statuses.get(rid);
      if (!prev || !areStatusesEqual(prev, next)) {
        this.statuses.set(rid, next);
        changed = true;
      }
    }

    if (changed) {
      this.rev++;
    }
    return changed;
  }

  /**
   * Reference full recomputation — strictly for unit test oracle comparison (AGENTS.md §5 & §9).
   */
  public recomputeAllForTest(inventory: InventoryIndex): CraftView {
    const avail = inventory.getAvailableMap();
    const map = new Map<RecipeId, RecipeStatus>();
    for (const rid of this.graph.topo) {
      const r = this.graph.recipesById.get(rid)!;
      map.set(rid, this.evaluateRecipe(r, avail));
    }
    return this.buildViewFromMap(map, this.rev);
  }

  public getView(): CraftView {
    return this.buildViewFromMap(this.statuses, this.rev);
  }

  public getFirstReadyRecipeId(): RecipeId | null {
    for (const rid of this.graph.topo) {
      const st = this.statuses.get(rid);
      if (st && st.lamp === 'ready') {
        return rid;
      }
    }
    for (const rid of this.graph.topo) {
      const st = this.statuses.get(rid);
      if (st && st.lamp === 'chainReady') {
        return rid;
      }
    }
    return null;
  }

  private evaluateRecipe(
    recipe: RecipeDef,
    avail: ReadonlyMap<UnitId, number>,
  ): RecipeStatus {
    let need = 0;
    let have = 0;
    const missing: Array<{ unit: UnitId; n: number }> = [];

    for (const ing of recipe.ingredients) {
      need += ing.n;
      const owned = avail.get(ing.unit) ?? 0;
      const matched = Math.min(owned, ing.n);
      have += matched;
      if (matched < ing.n) {
        missing.push({ unit: ing.unit, n: ing.n - matched });
      }
    }

    if (missing.length === 0) {
      return { lamp: 'ready', have, need, missing };
    }

    const chainSteps = this.planner.planChain(recipe, avail);
    if (chainSteps !== null) {
      return { lamp: 'chainReady', have, need, missing, chainSteps };
    }

    return {
      lamp: have > 0 ? 'partial' : 'none',
      have,
      need,
      missing,
    };
  }

  private buildViewFromMap(
    source: ReadonlyMap<RecipeId, RecipeStatus>,
    rev: number,
  ): CraftView {
    let readyCount = 0;
    let chainReadyCount = 0;
    const byGrade: Record<GradeId, { ready: number; chainReady: number }> = {};
    const recipes: Record<RecipeId, RecipeStatus> = {};

    for (const rid of this.graph.topo) {
      const st = source.get(rid);
      if (!st) continue;
      recipes[rid] = st;

      const r = this.graph.recipesById.get(rid)!;
      const outUnit = this.unitsById.get(r.output);
      const gradeId = outUnit ? outUnit.grade : 'common';

      if (!byGrade[gradeId]) {
        byGrade[gradeId] = { ready: 0, chainReady: 0 };
      }

      if (st.lamp === 'ready') {
        readyCount++;
        byGrade[gradeId]!.ready++;
      } else if (st.lamp === 'chainReady') {
        chainReadyCount++;
        byGrade[gradeId]!.chainReady++;
      }
    }

    return {
      rev,
      readyCount,
      chainReadyCount,
      byGrade,
      recipes,
    };
  }
}

function areStatusesEqual(a: RecipeStatus, b: RecipeStatus): boolean {
  if (a.lamp !== b.lamp || a.have !== b.have || a.need !== b.need) {
    return false;
  }
  if (a.missing.length !== b.missing.length) {
    return false;
  }
  for (let i = 0; i < a.missing.length; i++) {
    const ma = a.missing[i]!;
    const mb = b.missing[i]!;
    if (ma.unit !== mb.unit || ma.n !== mb.n) {
      return false;
    }
  }
  const ca = a.chainSteps;
  const cb = b.chainSteps;
  if (!ca && !cb) return true;
  if (!ca || !cb || ca.length !== cb.length) return false;
  for (let i = 0; i < ca.length; i++) {
    if (ca[i] !== cb[i]) return false;
  }
  return true;
}
