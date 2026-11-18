import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/core/Simulation';
import { loadGameData } from '../src/data/loader';

describe('Stage 2 One Piece roster, chain craft, gamble, upgrade & boss waves', () => {
  it('supports multi-stage chain synthesis from Common leaves to Legendary Gear 4 and onward to Immortal Nika', () => {
    const data = loadGameData();
    const sim = new Simulation(data, 0x12345678);

    // Step 1: Chain-craft Legendary Gear 4 Boundman directly from Common leaves (depth <= 3)
    const gear4Leaves = sim.recipeGraph.leafCost.get('r_luffy_gear4');
    expect(gear4Leaves).toBeDefined();

    for (const [unitId, count] of gear4Leaves!) {
      for (let i = 0; i < count; i++) {
        sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
        sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId });
      }
    }
    sim.tick();

    const snapGear4 = sim.buildSnapshot(1, false);
    expect(snapGear4.craft.recipes['r_luffy_gear4']?.lamp).toBe('chainReady');

    sim.commands.enqueue({ type: 'craft', recipeId: 'r_luffy_gear4', chain: true });
    sim.tick();

    // Step 2: Supply Rare/Uncommon materials for Shanks -> chain-craft Immortal Sun God Nika Gear 5!
    const shanksSubMaterials: readonly { readonly grade: string; readonly unitId: string }[] = [
      { grade: 'rare', unitId: 'zoro_ts' },
      { grade: 'rare', unitId: 'zoro_ts' },
      { grade: 'rare', unitId: 'law' },
      { grade: 'uncommon', unitId: 'zoro_dual' },
      { grade: 'uncommon', unitId: 'sanji_diable' },
    ];
    for (const item of shanksSubMaterials) {
      sim.commands.enqueue({ type: 'grantTestResource', wispGrade: item.grade });
      sim.commands.enqueue({ type: 'useWisp', grade: item.grade, unitId: item.unitId });
    }
    sim.tick();

    const snapNikaBefore = sim.buildSnapshot(1, false);
    expect(snapNikaBefore.craft.recipes['r_luffy_nika']?.lamp).toBe('chainReady');

    let craftedGrade = '';
    sim.events.on('craft:done', (ev) => {
      if (ev.outputUnitId === 'luffy_nika') {
        craftedGrade = ev.grade;
      }
    });

    sim.commands.enqueue({ type: 'craft', recipeId: 'r_luffy_nika', chain: true });
    sim.tick();

    expect(craftedGrade).toBe('immortal');
    const snapAfter = sim.buildSnapshot(1, false);
    const allUnits = [...snapAfter.field, ...snapAfter.bench].filter(Boolean);
    expect(allUnits.some((u) => u?.unitId === 'luffy_nika')).toBe(true);
  });

  it('amplifies unit ATK on upgrade and deducts luck stones on gamble', () => {
    const data = loadGameData();
    const sim = new Simulation(data, 0xabcdef01);

    const beforeAtk = sim.getUnitEffectiveAtk('luffy');
    expect(beforeAtk.bonusAtk).toBe(0);

    sim.commands.enqueue({ type: 'upgrade', group: 'common' });
    sim.commands.enqueue({ type: 'gamble', tier: 'uncommon' });
    sim.tick();

    const afterAtk = sim.getUnitEffectiveAtk('luffy');
    expect(afterAtk.bonusAtk).toBeGreaterThan(0);

    const snap = sim.buildSnapshot(1, false);
    expect(snap.upgradeLv.common).toBe(1);
    expect(snap.lastGambleResult).not.toBeNull();
    expect(snap.lastGambleResult?.tier).toBe('uncommon');
  });
});
