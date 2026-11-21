import { describe, expect, it } from 'vitest';
import { RecipeGraph } from '../../src/craft/RecipeGraph';
import { loadGameData } from '../../src/data/loader';
import type { RecipeDef, UnitDef } from '../../src/data/types';

describe('RecipeGraph DAG validation (R1 ~ R5)', () => {
  it('validates production Murim 3-faction game data cleanly (60 units [20:20:20], 110 recipes, R1..R5, symmetric 3-ingredient Immortal & Primordial routes)', () => {
    const data = loadGameData();
    expect(data.units.length).toBe(60);
    expect(data.recipes.length).toBe(110);
    expect(data.units.filter((u) => u.faction === 'orthodox').length).toBe(20);
    expect(data.units.filter((u) => u.faction === 'unorthodox').length).toBe(20);
    expect(data.units.filter((u) => u.faction === 'demonic').length).toBe(20);
    expect(data.units.filter((u) => u.leaf && u.faction === 'orthodox').length).toBe(4);
    expect(data.units.filter((u) => u.leaf && u.faction === 'unorthodox').length).toBe(4);
    expect(data.units.filter((u) => u.leaf && u.faction === 'demonic').length).toBe(4);
    const graph = new RecipeGraph(data.units, data.gradesById, data.recipes);
    expect(graph.topo.length).toBe(data.recipes.length);
    expect(data.unitsById.get('blood_acolyte')?.leaf).toBe(true);
    expect(data.unitsById.get('sahaebang_pirate')?.leaf).toBe(true);
    expect(data.unitsById.get('soul_acolyte')?.leaf).toBe(true);
    expect(data.unitsById.get('nether_blade_queen')?.grade).toBe('transcendent');
    expect(data.unitsById.get('ice_palace_empress')?.grade).toBe('transcendent');
    expect(data.unitsById.get('blood_shadow_sovereign')?.grade).toBe('transcendent');
    expect(data.unitsById.get('abyss_blood_emperor')?.grade).toBe('transcendent');
    expect(data.unitsById.get('wuji_grandmaster')?.grade).toBe('immortal');
    expect(data.unitsById.get('tyrant_overlord')?.grade).toBe('immortal');
    expect(data.unitsById.get('myriad_demon_emperor')?.grade).toBe('immortal');
    expect(data.unitsById.get('primordial_sword_god')?.hiddenMythic).toBe(true);
    expect(data.unitsById.get('chaos_poison_emperor')?.hiddenMythic).toBe(true);
    expect(data.unitsById.get('void_heavenly_demon')?.hiddenMythic).toBe(true);
    expect(graph.byOutput.get('nether_blade_queen')?.length).toBeGreaterThanOrEqual(2);
    expect(graph.byOutput.get('ice_palace_empress')?.length).toBeGreaterThanOrEqual(2);
    expect(graph.byOutput.get('blood_shadow_sovereign')?.length).toBeGreaterThanOrEqual(2);
    expect(graph.byOutput.get('abyss_blood_emperor')?.length).toBeGreaterThanOrEqual(2);
    expect(graph.byOutput.get('cheonma')?.length).toBe(3);
    expect(graph.byOutput.get('sword_immortal')?.length).toBe(3);
    expect(graph.byOutput.get('asura_emperor')?.length).toBe(3);
    expect(graph.byOutput.get('thousand_venom_lord')?.length).toBe(2);
    expect(graph.byOutput.get('thunder_emperor')?.length).toBe(2);
    expect(graph.byOutput.get('hell_flame_sovereign')?.length).toBe(2);
    expect(graph.byOutput.get('wuji_grandmaster')?.length).toBe(3);
    expect(graph.byOutput.get('tyrant_overlord')?.length).toBe(2);
    expect(graph.byOutput.get('myriad_demon_emperor')?.length).toBe(2);
    expect(graph.byOutput.get('primordial_sword_god')?.length).toBe(1);
    expect(graph.byOutput.get('chaos_poison_emperor')?.length).toBe(1);
    expect(graph.byOutput.get('void_heavenly_demon')?.length).toBe(1);

    // Every standard Immortal recipe uses 1 Transcendent + 1 Legendary + 1 Rare;
    // every Hidden Primordial recipe uses 3 distinct Transcendent heroes of the SAME pure faction!
    const standardImmortalRecipes = data.recipes.filter(
      (r) => data.unitsById.get(r.output)?.grade === 'immortal' && !r.hiddenUnlock,
    );
    const primordialRecipes = data.recipes.filter((r) => r.hiddenUnlock === 'primordial');
    expect(standardImmortalRecipes.length).toBe(22);
    expect(primordialRecipes.length).toBe(3);

    for (const rec of standardImmortalRecipes) {
      expect(rec.ingredients.length, `${rec.id} must have 3 ingredients`).toBe(3);
      const grades = rec.ingredients
        .map((i) => data.unitsById.get(i.unit)?.grade)
        .sort();
      expect(grades, `${rec.id} must combine 1 transcendent + 1 legendary + 1 rare`).toEqual([
        'legendary',
        'rare',
        'transcendent',
      ]);
    }
    for (const rec of primordialRecipes) {
      expect(rec.ingredients.length, `${rec.id} must have 3 Transcendent ingredients`).toBe(3);
      const uniqueIds = new Set(rec.ingredients.map((i) => i.unit));
      expect(uniqueIds.size).toBe(3);
      for (const ing of rec.ingredients) {
        expect(ing.n).toBe(1);
        expect(data.unitsById.get(ing.unit)?.grade).toBe('transcendent');
      }
    }

    expect(graph.byOutput.get('tang_elder')?.length).toBeGreaterThanOrEqual(2);
    expect(graph.byOutput.get('blood_bishop')?.length).toBeGreaterThanOrEqual(2);
    expect(graph.byOutput.get('poison_dragon')?.length).toBeGreaterThanOrEqual(2);
    expect(graph.byOutput.get('heavenly_demon_heir')?.length).toBeGreaterThanOrEqual(2);
    expect(graph.byOutput.get('murim_lord')?.length).toBeGreaterThanOrEqual(2);
    expect(graph.byOutput.get('sword_saint')?.length).toBeGreaterThanOrEqual(2);
    expect(graph.byOutput.get('mad_demon')?.length).toBeGreaterThanOrEqual(2);
  });

  it('R1: accepts rank-1 leaf ×3 -> rank-2 promotion recipes and rejects count < 2, rank >= 3 single-ingredient ×3, or unknown unit IDs', () => {
    const data = loadGameData();
    const badSingleOne: RecipeDef[] = [
      ...data.recipes,
      {
        id: 'r_bad_single_one',
        output: 'plum_swordsman',
        ingredients: [{ unit: 'hwasan_novice', n: 1 }],
        priority: 999,
      },
    ];
    expect(() => new RecipeGraph(data.units, data.gradesById, badSingleOne)).toThrow(/\[R1\]/);

    // Rank >= 3 outputs strictly forbid single-ingredient ×3 promotions (AGENTS.md §5)
    const badRank3Triple: RecipeDef[] = [
      ...data.recipes,
      {
        id: 'r_bad_rank3_triple',
        output: 'plum_elder',
        ingredients: [{ unit: 'plum_swordsman', n: 3 }],
        priority: 999,
      },
    ];
    expect(() => new RecipeGraph(data.units, data.gradesById, badRank3Triple)).toThrow(/\[R1\]/);

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
      armorShred: 0,
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

  it('validates v3.2/v4.3 armaments.json (12 Divine Armaments, 4:4:4 across all 3 factions) and v3.3 Four Symbols Boss waves', async () => {
    const { validateArmaments } = await import('../../src/data/loader');
    const data = loadGameData();
    expect(data.armaments).toHaveLength(12);
    const factions = new Set(data.armaments.map((a) => a.resonance.faction));
    expect(factions).toEqual(new Set(['orthodox', 'unorthodox', 'demonic']));
    expect(data.armaments.filter((a) => a.resonance.faction === 'orthodox')).toHaveLength(4);
    expect(data.armaments.filter((a) => a.resonance.faction === 'unorthodox')).toHaveLength(4);
    expect(data.armaments.filter((a) => a.resonance.faction === 'demonic')).toHaveLength(4);

    // Duplicate armament id rejected
    expect(() => validateArmaments([data.armaments[0], data.armaments[0], data.armaments[1]])).toThrow(
      /duplicate armament id/,
    );

    // Four Symbols Guardian Bosses + Heavenly Demon across the 30-wave campaign
    expect(data.waves[4]?.monsterKind).toBe('white_tiger');
    expect(data.waves[9]?.monsterKind).toBe('black_serpent');
    expect(data.waves[14]?.monsterKind).toBe('blood_patriarch');
    expect(data.waves[19]?.monsterKind).toBe('azure_dragon');
    expect(data.waves[24]?.monsterKind).toBe('vermilion_bird');
    expect(data.waves[29]?.monsterKind).toBe('blood_patriarch');
  });

  it('validates v3.4/v4.0 sects.json (7 Murim Sects across 3 factions) and v3.5 3-hero Trinity Combo definitions', async () => {
    const { validateSects } = await import('../../src/data/loader');
    const { COMBO_SKILLS } = await import('../../src/data/comboSkills');
    const data = loadGameData();
    expect(data.sects).toHaveLength(7);
    expect(data.sects.map((s) => s.id)).toEqual([
      'hwasan',
      'shaolin',
      'gaebang',
      'tang',
      'haomun',
      'cheonma_cult',
      'blood_citadel',
    ]);
    expect(() =>
      validateSects(
        [data.sects[0], data.sects[0], data.sects[1]],
        data.unitsById,
        data.gradesById,
      ),
    ).toThrow(/duplicate sect id/);

    const trinityCombos = COMBO_SKILLS.filter((c) => c.requiredUnits.length === 3);
    expect(trinityCombos.map((c) => c.id)).toEqual([
      'combo_trinity_immortals',
      'combo_four_elements_calamity',
      'combo_primordial_genesis',
    ]);
    for (const c of COMBO_SKILLS) {
      for (const uid of c.requiredUnits) {
        expect(data.unitsById.has(uid), `Combo ${c.id} references unknown unit ${uid}`).toBe(true);
      }
    }
  });
});
