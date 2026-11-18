import { describe, expect, it } from 'vitest';
import { RecipeGraph } from '../../src/craft/RecipeGraph';
import { loadGameData } from '../../src/data/loader';
import type { RecipeDef, UnitDef } from '../../src/data/types';

describe('RecipeGraph DAG validation (R1 ~ R5)', () => {
  it('validates production game data cleanly (R1..R5)', () => {
    const data = loadGameData();
    const graph = new RecipeGraph(data.units, data.gradesById, data.recipes);
    expect(graph.topo.length).toBe(data.recipes.length);
    expect(graph.byOutput.get('pirate_king')?.length).toBeGreaterThan(0);
  });

  it('R1: rejects recipes referencing non-existent unit IDs', () => {
    const data = loadGameData();
    const badRecipes: RecipeDef[] = [
      ...data.recipes,
      {
        id: 'r_bad_ref',
        output: 'dual_blade',
        ingredients: [
          { unit: 'swordsman', n: 1 },
          { unit: 'ghost_unit_404', n: 1 },
        ],
        priority: 99,
      },
    ];
    expect(() => new RecipeGraph(data.units, data.gradesById, badRecipes)).toThrow(/\[R1\]/);
  });

  it('R2: rejects recipes where ingredient rank >= output rank', () => {
    const data = loadGameData();
    const badRecipes: RecipeDef[] = [
      ...data.recipes,
      {
        id: 'r_bad_rank',
        output: 'dual_blade', // uncommon (rank 2)
        ingredients: [
          { unit: 'storm_mage', n: 1 }, // rare (rank 3) >= rank 2, acyclic
          { unit: 'gunner', n: 1 },
        ],
        priority: 99,
      },
    ];
    expect(() => new RecipeGraph(data.units, data.gradesById, badRecipes)).toThrow(/\[R2\]/);
  });

  it('R3: rejects cyclic recipe dependencies via Kahn topological sort', () => {
    const data = loadGameData();
    const cyclicRecipes: RecipeDef[] = [
      {
        id: 'r_cycle_a',
        output: 'dual_blade',
        ingredients: [
          { unit: 'pyro_cook', n: 1 },
          { unit: 'swordsman', n: 1 },
        ],
        priority: 1,
      },
      {
        id: 'r_cycle_b',
        output: 'pyro_cook',
        ingredients: [
          { unit: 'dual_blade', n: 1 },
          { unit: 'navigator', n: 1 },
        ],
        priority: 2,
      },
    ];
    expect(() => new RecipeGraph(data.units, data.gradesById, cyclicRecipes)).toThrow(/\[R3\]/);
  });

  it('R4: rejects non-leaf units that have no valid expansion to leaf units', () => {
    const data = loadGameData();
    const extraNonLeaf: UnitDef = {
      id: 'orphan_hero',
      name: '고립 영웅',
      grade: 'rare',
      leaf: false,
      emblem: 'crest',
      atk: 100,
      range: 180,
      attackIntervalTicks: 20,
      sellCoin: 50,
    };
    expect(
      () => new RecipeGraph([...data.units, extraNonLeaf], data.gradesById, data.recipes),
    ).toThrow(/\[R4\]/);
  });

  it('R5: rejects duplicate recipes with identical output and ingredient multiset', () => {
    const data = loadGameData();
    const dupRecipes: RecipeDef[] = [
      ...data.recipes,
      {
        id: 'r_dual_blade_duplicate',
        output: 'dual_blade',
        ingredients: [
          { unit: 'gunner', n: 1 },
          { unit: 'swordsman', n: 1 },
        ],
        priority: 999,
      },
    ];
    expect(() => new RecipeGraph(data.units, data.gradesById, dupRecipes)).toThrow(/\[R5\]/);
  });
});
