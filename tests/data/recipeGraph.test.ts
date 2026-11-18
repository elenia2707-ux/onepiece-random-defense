import { describe, expect, it } from 'vitest';
import { RecipeGraph } from '../../src/craft/RecipeGraph';
import { loadGameData } from '../../src/data/loader';
import type { RecipeDef, UnitDef } from '../../src/data/types';

describe('RecipeGraph DAG validation (R1 ~ R5)', () => {
  it('validates production Murim 3-faction game data cleanly (R1..R5)', () => {
    const data = loadGameData();
    const graph = new RecipeGraph(data.units, data.gradesById, data.recipes);
    expect(graph.topo.length).toBe(data.recipes.length);
    expect(graph.byOutput.get('cheonma')?.length).toBeGreaterThan(0);
    expect(graph.byOutput.get('murim_lord')?.length).toBeGreaterThan(0);
    expect(graph.byOutput.get('sword_saint')?.length).toBeGreaterThan(0);
    expect(graph.byOutput.get('mad_demon')?.length).toBeGreaterThan(0);
  });

  it('R1: rejects recipes referencing non-existent unit IDs', () => {
    const data = loadGameData();
    const badRecipes: RecipeDef[] = [
      ...data.recipes,
      {
        id: 'r_bad_ref',
        output: 'plum_swordsman',
        ingredients: [
          { unit: 'hwasan_novice', n: 1 },
          { unit: 'ghost_unit_404', n: 1 },
        ],
        priority: 999,
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
        output: 'plum_swordsman', // uncommon (rank 2)
        ingredients: [
          { unit: 'nokrim_chief', n: 1 }, // rare (rank 3) >= rank 2, acyclic
          { unit: 'mudang_disciple', n: 1 },
        ],
        priority: 999,
      },
    ];
    expect(() => new RecipeGraph(data.units, data.gradesById, badRecipes)).toThrow(/\[R2\]/);
  });

  it('R3: rejects cyclic recipe dependencies via Kahn topological sort', () => {
    const data = loadGameData();
    const cyclicRecipes: RecipeDef[] = [
      {
        id: 'r_cycle_a',
        output: 'plum_swordsman',
        ingredients: [
          { unit: 'poison_healer', n: 1 },
          { unit: 'hwasan_novice', n: 1 },
        ],
        priority: 1,
      },
      {
        id: 'r_cycle_b',
        output: 'poison_healer',
        ingredients: [
          { unit: 'plum_swordsman', n: 1 },
          { unit: 'tang_assassin', n: 1 },
        ],
        priority: 2,
      },
    ];
    expect(() => new RecipeGraph(data.units, data.gradesById, cyclicRecipes)).toThrow(/\[R3\]/);
  });

  it('R4: rejects non-leaf units that have no valid expansion to leaf units', () => {
    const data = loadGameData();
    const extraNonLeaf: UnitDef = {
      id: 'orphan_warrior',
      name: '은거 기인',
      title: '무명객',
      grade: 'rare',
      faction: 'orthodox',
      leaf: false,
      atk: 100,
      range: 180,
      attackIntervalTicks: 20,
      critChance: 10,
      critMult: 1.8,
      sellCoin: 50,
      skill: {
        name: '무형검기',
        desc: '테스트 초식',
        everyN: 4,
        atkRatio: 2,
        splashRadius: 60,
        stunTicks: 0,
        slowPct: 0,
        slowTicks: 0,
        vfxTrack: 'plum_blossom',
      },
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
        id: 'r_plum_swordsman_duplicate',
        output: 'plum_swordsman',
        ingredients: [
          { unit: 'mudang_disciple', n: 1 },
          { unit: 'hwasan_novice', n: 1 },
        ],
        priority: 999,
      },
    ];
    expect(() => new RecipeGraph(data.units, data.gradesById, dupRecipes)).toThrow(/\[R5\]/);
  });
});
