import { describe, expect, it } from 'vitest';
import type { StampedCommand } from '../src/core/CommandQueue';
import { Simulation } from '../src/core/Simulation';
import { loadGameData } from '../src/data/loader';
import type { MonsterKind } from '../src/data/types';
import { MetaStore, type StorageLike } from '../src/platform/MetaStore';

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

    const bgFiles = Object.keys(import.meta.glob('../public/bg/*.png'));
    expect(bgFiles.some((p) => p.endsWith('/murim_arena_bg.png'))).toBe(true);
  });

  it('activates deterministic 3-faction field formations (북두검진 · 만독혈진 · 천마혈진 · 삼재합진) strictly from field slots', () => {
    const data = loadGameData();
    const sim = new Simulation(data, 0x55aa55aa);

    expect(sim.computeFieldSynergy()).toEqual({
      counts: { orthodox: 0, unorthodox: 0, demonic: 0 },
      orthodoxTier: 0,
      unorthodoxTier: 0,
      demonicTier: 0,
      trinityActive: false,
    });

    // Place 3 Orthodox units onto the 6x3 field -> 북두검진 Tier 1
    for (let i = 0; i < 3; i++) {
      sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
      sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'hwasan_novice' });
    }
    sim.tick();

    expect(sim.computeFieldSynergy().orthodoxTier).toBe(1);
    expect(sim.computeFieldSynergy().trinityActive).toBe(false);

    // Move one Orthodox unit to bench -> drops to 2 on field (bench units do not form field array)
    sim.commands.enqueue({
      type: 'move',
      from: { area: 'field', index: 2 },
      to: { area: 'bench', index: 0 },
    });
    // Add 2 Unorthodox + 2 Demonic onto field -> 2/2/2 삼재합진 activates!
    for (let i = 0; i < 2; i++) {
      sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
      sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'tang_assassin' });
      sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
      sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'cult_initiate' });
    }
    sim.tick();

    const trinitySyn = sim.computeFieldSynergy();
    expect(trinitySyn.counts).toEqual({ orthodox: 2, unorthodox: 2, demonic: 2 });
    expect(trinitySyn.trinityActive).toBe(true);
    expect(sim.getUnitEffectiveAtk('hwasan_novice').bonusAtk).toBeGreaterThan(0);
    expect(sim.getUnitEffectiveAtk('tang_assassin').bonusAtk).toBeGreaterThan(0);
    expect(sim.getUnitEffectiveAtk('cult_initiate').bonusAtk).toBeGreaterThan(0);

    // Move bench Orthodox back and add 3 more Orthodox -> 6 Orthodox on field -> 북두검진 Tier 2!
    sim.commands.enqueue({
      type: 'move',
      from: { area: 'bench', index: 0 },
      to: { area: 'field', index: 6 },
    });
    for (let i = 0; i < 3; i++) {
      sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
      sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'mudang_disciple' });
    }
    sim.tick();

    const tier2Syn = sim.computeFieldSynergy();
    expect(tier2Syn.orthodoxTier).toBe(2);
    expect(tier2Syn.trinityActive).toBe(true);
  });

  it('applies Wuxia Relics: starting bonuses, wealth-scaled ATK (만금쾌검패), and wave compound interest (천하제일 전장 금고)', () => {
    const data = loadGameData();
    const sim = new Simulation(data, 0x77771118, {
      founding_jade_seal: 2, // +100 starting coin
      heavenly_scroll_chest: 4, // +1 common wisp, +1 uncommon wisp
      golden_vault: 3, // +7% compound interest (cap 360)
      million_sword_seal: 5, // +1.5% (150 bps) ATK per 100 coin
    });

    const snap0 = sim.buildSnapshot(1, false);
    expect(snap0.coin).toBe(data.board.economy.initialCoin + 100);
    expect(snap0.wisps.common).toBe(3); // base 2 + 1
    expect(snap0.wisps.uncommon).toBe(2); // base 1 + 1

    const atkBeforeGrant = sim.getUnitEffectiveAtk('hwasan_master').bonusAtk;
    expect(atkBeforeGrant).toBeGreaterThan(0);

    sim.commands.enqueue({ type: 'grantTestCoin', amount: 1500 });
    sim.tick();

    const atkAfterGrant = sim.getUnitEffectiveAtk('hwasan_master').bonusAtk;
    expect(atkAfterGrant).toBeGreaterThan(atkBeforeGrant);

    let firedInterest = 0;
    let firedPct = 0;
    sim.events.on('wave:interest', (ev) => {
      firedInterest = ev.interestCoin;
      firedPct = ev.pct;
    });

    const wave1Duration = data.waves[0]!.durationTicks;
    for (let t = 1; t < wave1Duration; t++) {
      sim.tick();
    }

    expect(firedPct).toBe(7);
    expect(firedInterest).toBeGreaterThan(100);
    const snapWave2 = sim.buildSnapshot(1, false);
    expect(snapWave2.wave).toBe(2);
    expect(snapWave2.relicBonus.lastWaveInterest).toBe(firedInterest);
  });

  it('preserves 100% bit-exact 1x vs 3x state hash determinism with all active RNG relics & mid-run syncRelics', () => {
    const data = loadGameData();
    const initialRelics = {
      golden_vault: 2,
      million_sword_seal: 3,
      bandit_dagger: 4,
      immortal_furnace: 5,
    } as const;

    const commands: readonly StampedCommand[] = [
      { tick: 0, command: { type: 'summon' } },
      { tick: 0, command: { type: 'summon' } },
      { tick: 0, command: { type: 'summon' } },
      { tick: 15, command: { type: 'grantTestResource', luck: 12 } },
      { tick: 18, command: { type: 'gamble', tier: 'uncommon' } },
      { tick: 21, command: { type: 'gamble', tier: 'rare' } },
      {
        tick: 90,
        command: {
          type: 'syncRelics',
          relics: {
            ...initialRelics,
            founding_jade_seal: 2,
            heavenly_scroll_chest: 6,
            million_sword_seal: 5,
          },
        },
      },
      { tick: 120, command: { type: 'upgrade', group: 'orthodox' } },
    ];

    const sim1x = new Simulation(data, 0x99887766, initialRelics);
    sim1x.scheduleCommandsForReplay(commands);

    const sim3x = new Simulation(data, 0x99887766, initialRelics);
    sim3x.scheduleCommandsForReplay(commands);

    const totalTicks = 900; // Crosses Wave 1 -> Wave 2 interest boundary + projectile combat
    for (let t = 0; t < totalTicks; t++) {
      sim1x.tick();
    }
    for (let t = 0; t < totalTicks; t += 3) {
      sim3x.tick();
      sim3x.tick();
      sim3x.tick();
    }

    expect(sim3x.hashState()).toBe(sim1x.hashState());
    expect(sim1x.buildSnapshot(1, false).relicBonus.pilferedCoinTotal).toBeGreaterThanOrEqual(0);

    // Post-gameover syncRelics must succeed without emitting command:rejected
    let rejectedCount = 0;
    sim1x.events.on('command:rejected', () => {
      rejectedCount++;
    });
    sim1x.commands.enqueue({
      type: 'syncRelics',
      relics: { golden_vault: 4 },
    });
    sim1x.tick();
    expect(rejectedCount).toBe(0);
    expect(sim1x.buildSnapshot(1, false).relics.golden_vault).toBe(4);
  });

  it('persists MetaStore settlement rewards (천하주화 · 기보함 열쇠), chest gacha, and direct upgrades', () => {
    const data = loadGameData();
    const mem = new Map<string, string>();
    const mockStorage: StorageLike = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => {
        mem.set(k, v);
      },
    };

    const store = new MetaStore(mockStorage);
    expect(store.getProfile().gold).toBe(120);
    expect(store.getProfile().keys).toBe(2);

    // Draw 1 relic with starter key
    const draw1 = store.drawRelic(data.relics, 'key', () => 0.05);
    expect(draw1.ok).toBe(true);
    if (draw1.ok) {
      expect(draw1.relicId).toBe('golden_vault');
      expect(draw1.newLevel).toBe(1);
    }

    // Settle a Wave 6 run (5 cleared waves, 96 kills, 1 boss slain)
    const settlement = store.settleRun({
      wave: 6,
      monstersSlain: 96,
      bossesSlain: 1,
    });
    // 30 + 5*18(90) + 1*45(45) + floor(96/8)*2(24) = 189 gold; keys = 1 (wave>=3) + 1 (boss) = 2
    expect(settlement.goldEarned).toBe(189);
    expect(settlement.keysEarned).toBe(2);
    expect(settlement.isNewBest).toBe(true);

    // Direct unlock million_sword_seal (180 gold) and upgrade golden_vault Lv.1 -> Lv.2
    const sealDef = data.relicsById.get('million_sword_seal')!;
    const vaultDef = data.relicsById.get('golden_vault')!;

    const unlockRes = store.upgradeRelic(sealDef);
    expect(unlockRes.ok).toBe(true);
    if (unlockRes.ok) {
      expect(unlockRes.wasUnlock).toBe(true);
      expect(unlockRes.newLevel).toBe(1);
      expect(unlockRes.spentGold).toBe(180);
    }

    const upRes = store.upgradeRelic(vaultDef);
    expect(upRes.ok).toBe(true);
    if (upRes.ok) {
      expect(upRes.wasUnlock).toBe(false);
      expect(upRes.newLevel).toBe(2);
    }

    // Reload from mockStorage into a fresh MetaStore instance and verify persistence
    const reloaded = new MetaStore(mockStorage);
    const prof = reloaded.getProfile();
    expect(prof.bestWave).toBe(6);
    expect(prof.totalRuns).toBe(1);
    expect(prof.relics.golden_vault).toBe(2);
    expect(prof.relics.million_sword_seal).toBe(1);
    expect(prof.keys).toBe(3); // 2 starter - 1 spent + 2 earned
  });
});

