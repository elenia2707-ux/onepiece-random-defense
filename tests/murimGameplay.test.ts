import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/core/Simulation';
import { loadGameData } from '../src/data/loader';
import type { MonsterKind } from '../src/data/types';

describe('운빨무림전 3-faction roster, chain craft (합공·등선), gamble (영약 복용) & faction upgrades (내공 수련)', () => {
  it('supports atomic chain synthesis from 삼류 leaves to 화산 장문인 and 3-faction fusion into 현경·신마 절대천마', () => {
    const data = loadGameData();
    const sim = new Simulation(data, 0x12345678);

    // Step 1: Chain-craft 절정 화산 장문인 (hwasan_master) directly from 삼류 leaves
    const hwasanMasterLeaves = sim.recipeGraph.leafCost.get('r_hwasan_master');
    expect(hwasanMasterLeaves).toBeDefined();

    for (const [unitId, count] of hwasanMasterLeaves!) {
      for (let i = 0; i < count; i++) {
        sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
        sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId });
      }
    }
    sim.tick();

    const snapMaster = sim.buildSnapshot(1, false);
    expect(snapMaster.craft.recipes['r_hwasan_master']?.lamp).toBe('chainReady');

    sim.commands.enqueue({ type: 'craft', recipeId: 'r_hwasan_master', chain: true });
    sim.tick();

    const snapAfterMaster = sim.buildSnapshot(1, false);
    const ownedAfterMaster = [...snapAfterMaster.field, ...snapAfterMaster.bench].filter(Boolean);
    expect(ownedAfterMaster.some((u) => u?.unitId === 'hwasan_master')).toBe(true);

    // Step 2: Chain-craft 화경 무림맹주 (murim_lord) via 기연 materials
    const murimLordSubMaterials: readonly { readonly grade: string; readonly unitId: string }[] = [
      { grade: 'rare', unitId: 'gaebang_elder' },
      { grade: 'rare', unitId: 'gaebang_elder' },
      { grade: 'uncommon', unitId: 'namgung_thunder' },
      { grade: 'uncommon', unitId: 'shaolin_monk' },
      { grade: 'common', unitId: 'mudang_disciple' },
    ];
    for (const item of murimLordSubMaterials) {
      sim.commands.enqueue({ type: 'grantTestResource', wispGrade: item.grade });
      sim.commands.enqueue({ type: 'useWisp', grade: item.grade, unitId: item.unitId });
    }
    sim.tick();

    expect(sim.buildSnapshot(1, false).craft.recipes['r_murim_lord']?.lamp).toBe('chainReady');
    sim.commands.enqueue({ type: 'craft', recipeId: 'r_murim_lord', chain: true });
    sim.tick();

    // Step 3: Supply 사파 & 마교 sub-materials and chain-craft 현경·신마 절대천마 (cheonma)!
    const cheonmaSubMaterials: readonly { readonly grade: string; readonly unitId: string }[] = [
      // 광마 = 당문주 + 혈마
      { grade: 'rare', unitId: 'nokrim_chief' },
      { grade: 'uncommon', unitId: 'poison_healer' },
      { grade: 'common', unitId: 'tang_assassin' },
      { grade: 'rare', unitId: 'nokrim_chief' },
      { grade: 'uncommon', unitId: 'blood_blade' },
      { grade: 'common', unitId: 'haomun_ronin' },
      // 검마
      { grade: 'rare', unitId: 'cult_elder' },
      { grade: 'uncommon', unitId: 'black_wind' },
      { grade: 'common', unitId: 'cult_initiate' },
      // 염마
      { grade: 'rare', unitId: 'cult_elder' },
      { grade: 'uncommon', unitId: 'cult_protector' },
      { grade: 'common', unitId: 'bone_fiend' },
    ];
    for (const item of cheonmaSubMaterials) {
      sim.commands.enqueue({ type: 'grantTestResource', wispGrade: item.grade });
      sim.commands.enqueue({ type: 'useWisp', grade: item.grade, unitId: item.unitId });
    }
    sim.tick();

    const snapCheonmaBefore = sim.buildSnapshot(1, false);
    expect(snapCheonmaBefore.craft.recipes['r_cheonma']?.lamp).toBe('chainReady');

    let craftedGrade = '';
    sim.events.on('craft:done', (ev) => {
      if (ev.outputUnitId === 'cheonma') {
        craftedGrade = ev.grade;
      }
    });

    sim.commands.enqueue({ type: 'craft', recipeId: 'r_cheonma', chain: true });
    sim.tick();

    expect(craftedGrade).toBe('immortal');
    const snapAfter = sim.buildSnapshot(1, false);
    const allUnits = [...snapAfter.field, ...snapAfter.bench].filter(Boolean);
    expect(allUnits.some((u) => u?.unitId === 'cheonma')).toBe(true);
  });

  it('amplifies ATK strictly along the 3 faction tracks (정파/사파/마교) and processes 영약 복용 gamble', () => {
    const data = loadGameData();
    const sim = new Simulation(data, 0xabcdef01);

    expect(sim.getUnitEffectiveAtk('hwasan_novice').bonusAtk).toBe(0);
    expect(sim.getUnitEffectiveAtk('tang_assassin').bonusAtk).toBe(0);
    expect(sim.getUnitEffectiveAtk('cheonma').bonusAtk).toBe(0);

    sim.commands.enqueue({ type: 'upgrade', group: 'orthodox' });
    sim.commands.enqueue({ type: 'gamble', tier: 'uncommon' });
    sim.tick();

    expect(sim.getUnitEffectiveAtk('hwasan_novice').bonusAtk).toBeGreaterThan(0);
    expect(sim.getUnitEffectiveAtk('murim_lord').bonusAtk).toBeGreaterThan(0);
    expect(sim.getUnitEffectiveAtk('tang_assassin').bonusAtk).toBe(0);
    expect(sim.getUnitEffectiveAtk('cheonma').bonusAtk).toBe(0);

    sim.commands.enqueue({ type: 'upgrade', group: 'demonic' });
    sim.tick();
    expect(sim.getUnitEffectiveAtk('cheonma').bonusAtk).toBeGreaterThan(0);

    const snap = sim.buildSnapshot(1, false);
    expect(snap.upgradeLv.orthodox).toBe(1);
    expect(snap.upgradeLv.unorthodox).toBe(0);
    expect(snap.upgradeLv.demonic).toBe(1);
    expect(snap.lastGambleResult).not.toBeNull();
    expect(snap.lastGambleResult?.tier).toBe('uncommon');
  });

  it('provides bespoke 1:1 pixel-art PNG sprites for all 30 units and all 6 monsters/bosses', () => {
    const data = loadGameData();
    const spriteFiles = Object.keys(import.meta.glob('../public/sprites/*.png'));
    const spriteSet = new Set(
      spriteFiles.map((p) => p.slice(p.lastIndexOf('/') + 1)),
    );

    for (const unit of data.units) {
      expect(spriteSet.has(`${unit.id}.png`), `missing unit sprite: ${unit.id}.png`).toBe(true);
    }

    const monsterKinds: readonly MonsterKind[] = [
      'bandit_minion',
      'jiangshi',
      'blood_zealot',
      'white_tiger',
      'black_serpent',
      'blood_patriarch',
    ];
    for (const kind of monsterKinds) {
      expect(spriteSet.has(`${kind}.png`), `missing monster/boss sprite: ${kind}.png`).toBe(true);
    }
    expect(spriteSet.size).toBe(36);
  });
});
