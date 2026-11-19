import type { GradeDef, RecipeDef, RecipeId, UnitDef, UnitId } from '../data/types';

export class RecipeGraph {
  public readonly recipesById: ReadonlyMap<RecipeId, RecipeDef>;
  public readonly byOutput: ReadonlyMap<UnitId, readonly RecipeDef[]>;
  public readonly byIngredient: ReadonlyMap<UnitId, readonly RecipeDef[]>;
  public readonly closure: ReadonlyMap<RecipeId, ReadonlySet<UnitId>>;
  public readonly byClosure: ReadonlyMap<UnitId, readonly RecipeId[]>;
  public readonly leafCost: ReadonlyMap<RecipeId, ReadonlyMap<UnitId, number>>;
  public readonly topo: readonly RecipeId[];

  public constructor(
    units: readonly UnitDef[],
    gradesById: ReadonlyMap<string, GradeDef>,
    recipes: readonly RecipeDef[],
  ) {
    const unitsById = new Map<UnitId, UnitDef>();
    for (const u of units) {
      unitsById.set(u.id, u);
    }

    // R1: Referential integrity (every output and ingredient unit id must exist)
    for (const r of recipes) {
      if (!unitsById.has(r.output)) {
        throw new Error(`[R1] Recipe '${r.id}' references unknown output unit '${r.output}'`);
      }
      if (r.ingredients.length < 1) {
        throw new Error(
          `[R1] Recipe '${r.id}' must include at least 1 ingredient entry`,
        );
      }
      let totalCount = 0;
      const seenIngUnits = new Set<UnitId>();
      for (const ing of r.ingredients) {
        if (!unitsById.has(ing.unit)) {
          throw new Error(
            `[R1] Recipe '${r.id}' references unknown ingredient unit '${ing.unit}'`,
          );
        }
        if (!Number.isInteger(ing.n) || ing.n < 1) {
          throw new Error(
            `[R1] Recipe '${r.id}' ingredient '${ing.unit}' must have integer count >= 1`,
          );
        }
        if (seenIngUnits.has(ing.unit)) {
          throw new Error(
            `[R1] Recipe '${r.id}' lists duplicate ingredient unit '${ing.unit}'`,
          );
        }
        seenIngUnits.add(ing.unit);
        totalCount += ing.n;
      }
      if (totalCount < 2) {
        throw new Error(
          `[R1] Recipe '${r.id}' must combine at least 2 total ingredient units`,
        );
      }
    }

    // R5: Duplicate recipe check (same output + identical ingredient multiset)
    const signatures = new Set<string>();
    for (const r of recipes) {
      const canonicalIng = [...r.ingredients]
        .sort((a, b) => a.unit.localeCompare(b.unit))
        .map((i) => `${i.unit}:${i.n}`)
        .join(',');
      const sig = `${r.output}::${canonicalIng}`;
      if (signatures.has(sig)) {
        throw new Error(`[R5] Duplicate recipe signature detected for '${r.id}' (${sig})`);
      }
      signatures.add(sig);
    }

    // R3: Cycle detection via Kahn's topological sort on unit dependency DAG
    const adj = new Map<UnitId, Set<UnitId>>();
    const indegree = new Map<UnitId, number>();
    for (const u of units) {
      adj.set(u.id, new Set());
      indegree.set(u.id, 0);
    }
    for (const r of recipes) {
      for (const ing of r.ingredients) {
        if (ing.unit === r.output) {
          throw new Error(`[R3] Cycle detected: recipe '${r.id}' uses its own output '${r.output}'`);
        }
        const edges = adj.get(ing.unit);
        if (edges && !edges.has(r.output)) {
          edges.add(r.output);
          indegree.set(r.output, (indegree.get(r.output) ?? 0) + 1);
        }
      }
    }

    const queue: UnitId[] = [];
    for (const u of units) {
      if ((indegree.get(u.id) ?? 0) === 0) {
        queue.push(u.id);
      }
    }
    queue.sort((a, b) => a.localeCompare(b));

    const unitTopo: UnitId[] = [];
    let head = 0;
    while (head < queue.length) {
      const curr = queue[head++];
      if (!curr) continue;
      unitTopo.push(curr);
      const nextSet = adj.get(curr);
      if (!nextSet) continue;
      const nextSorted = [...nextSet].sort((a, b) => a.localeCompare(b));
      for (const nxt of nextSorted) {
        const deg = (indegree.get(nxt) ?? 0) - 1;
        indegree.set(nxt, deg);
        if (deg === 0) {
          queue.push(nxt);
        }
      }
    }

    if (unitTopo.length !== units.length) {
      throw new Error('[R3] Cycle detected in recipe dependency graph');
    }

    // R2: Strict grade rank monotonicity (every ingredient rank < output rank)
    for (const r of recipes) {
      const outUnit = unitsById.get(r.output)!;
      const outGrade = gradesById.get(outUnit.grade);
      if (!outGrade) {
        throw new Error(`[R2] Missing grade '${outUnit.grade}' for output '${r.output}'`);
      }
      for (const ing of r.ingredients) {
        const ingUnit = unitsById.get(ing.unit)!;
        const ingGrade = gradesById.get(ingUnit.grade);
        if (!ingGrade) {
          throw new Error(`[R2] Missing grade '${ingUnit.grade}' for ingredient '${ing.unit}'`);
        }
        if (ingGrade.rank >= outGrade.rank) {
          throw new Error(
            `[R2] Recipe '${r.id}' ingredient '${ing.unit}' (rank ${ingGrade.rank}) must be strictly lower than output '${r.output}' (rank ${outGrade.rank})`,
          );
        }
      }
    }

    // Build deterministic indexes
    const recipesById = new Map<RecipeId, RecipeDef>();
    const byOutputMut = new Map<UnitId, RecipeDef[]>();
    const byIngredientMut = new Map<UnitId, RecipeDef[]>();

    const sortedRecipes = [...recipes].sort((a, b) =>
      a.priority !== b.priority ? a.priority - b.priority : a.id.localeCompare(b.id),
    );

    for (const r of sortedRecipes) {
      recipesById.set(r.id, r);
      const outList = byOutputMut.get(r.output) ?? [];
      outList.push(r);
      byOutputMut.set(r.output, outList);

      for (const ing of r.ingredients) {
        const ingList = byIngredientMut.get(ing.unit) ?? [];
        ingList.push(r);
        byIngredientMut.set(ing.unit, ingList);
      }
    }

    // R4: Non-leaf units must have >= 1 recipe and expand completely down to leaf units
    const expandable = new Set<UnitId>();
    for (const uid of unitTopo) {
      const u = unitsById.get(uid)!;
      if (u.leaf) {
        expandable.add(uid);
        continue;
      }
      const outRecipes = byOutputMut.get(uid);
      if (!outRecipes || outRecipes.length === 0) {
        throw new Error(`[R4] Non-leaf unit '${uid}' has no crafting recipe`);
      }
      const hasValidExpansion = outRecipes.some((rec) =>
        rec.ingredients.every((ing) => expandable.has(ing.unit)),
      );
      if (!hasValidExpansion) {
        throw new Error(`[R4] Non-leaf unit '${uid}' cannot be expanded to leaf units`);
      }
      expandable.add(uid);
    }

    // Topological recipe ordering aligned with unitTopo
    const unitOrder = new Map<UnitId, number>();
    unitTopo.forEach((uid, idx) => unitOrder.set(uid, idx));

    const topo = [...sortedRecipes]
      .sort((a, b) => {
        const oa = unitOrder.get(a.output) ?? 0;
        const ob = unitOrder.get(b.output) ?? 0;
        if (oa !== ob) return oa - ob;
        return a.priority !== b.priority ? a.priority - b.priority : a.id.localeCompare(b.id);
      })
      .map((r) => r.id);

    // Precompute transitive ingredient closure & leafCost in topological order
    const closureMut = new Map<RecipeId, Set<UnitId>>();
    const byClosureMut = new Map<UnitId, RecipeId[]>();
    const leafCostMut = new Map<RecipeId, Map<UnitId, number>>();

    for (const rid of topo) {
      const r = recipesById.get(rid)!;
      const clos = new Set<UnitId>();
      const leaves = new Map<UnitId, number>();

      for (const ing of r.ingredients) {
        clos.add(ing.unit);
        const subRecipes = byOutputMut.get(ing.unit);
        if (subRecipes && subRecipes.length > 0) {
          for (const sub of subRecipes) {
            const subClos = closureMut.get(sub.id);
            if (subClos) {
              for (const cu of subClos) {
                clos.add(cu);
              }
            }
          }
          const primarySubLeaves = leafCostMut.get(subRecipes[0]!.id);
          if (primarySubLeaves) {
            for (const [lu, cnt] of primarySubLeaves) {
              leaves.set(lu, (leaves.get(lu) ?? 0) + cnt * ing.n);
            }
          }
        } else {
          leaves.set(ing.unit, (leaves.get(ing.unit) ?? 0) + ing.n);
        }
      }

      closureMut.set(rid, clos);
      leafCostMut.set(rid, leaves);

      const sortedClos = [...clos].sort((a, b) => a.localeCompare(b));
      for (const cu of sortedClos) {
        const list = byClosureMut.get(cu) ?? [];
        list.push(rid);
        byClosureMut.set(cu, list);
      }
    }

    this.recipesById = recipesById;
    this.byOutput = byOutputMut;
    this.byIngredient = byIngredientMut;
    this.closure = closureMut;
    this.byClosure = byClosureMut;
    this.leafCost = leafCostMut;
    this.topo = topo;
  }
}
