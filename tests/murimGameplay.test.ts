import { describe, expect, it } from 'vitest';
import type { StampedCommand } from '../src/core/CommandQueue';
import {
  HAZARD_WARNING_TICKS,
  Simulation,
  getWaveMutantKind,
} from '../src/core/Simulation';
import { loadGameData } from '../src/data/loader';
import type { BoonId, MonsterKind } from '../src/data/types';
import {
  DEFAULT_COURT_SKIN_ID,
  MetaStore,
  SKIN_MULTI5_GOLD_COST,
  SKIN_SINGLE_GOLD_COST,
  getSkinDuplicateSilk,
  type StorageLike,
} from '../src/platform/MetaStore';
import { SoundSynthesizer } from '../src/platform/SoundSynthesizer';

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

  it('provides bespoke 1:1 pixel-art PNG sprites for all 32 units and all 6 monsters/bosses plus validated skin catalog', () => {
    const data = loadGameData();
    expect(data.units.length).toBe(32);
    expect(data.heroSkins.length).toBe(10);
    expect(data.courtSkins.length).toBe(4);

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
    expect(spriteSet.size).toBe(38);

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

  it('enforces Boss Time-Limit defeat (boss_timeout) on Wave 5 and fast-forwards idle timer + DPS meter on early boss kill', () => {
    const data = loadGameData();

    // Part A: Zero field units -> reaches Wave 5 boss and fails when Wave 5 timer hits 0
    const simTimeout = new Simulation(data, 0x11112222);
    let timeoutBossWave = 0;
    simTimeout.events.on('boss:timeout', (ev) => {
      timeoutBossWave = ev.wave;
    });

    while (!simTimeout.isGameOver && simTimeout.tickCount < 6000) {
      simTimeout.tick();
    }

    const snapTimeout = simTimeout.buildSnapshot(1, false);
    expect(snapTimeout.gameOver).toBe(true);
    expect(snapTimeout.wave).toBe(5);
    expect(snapTimeout.gameOverReason).toBe('boss_timeout');
    expect(timeoutBossWave).toBe(5);

    // Part B: Deploy Cheonma -> slays Wave 5 boss early, fast-forwarding waveTicksLeft <= 45 and populating DPS meter
    const simKill = new Simulation(data, 0x11112222);
    spawnCheonmaHelper(simKill);
    for (let i = 0; i < 20; i++) {
      simKill.commands.enqueue({ type: 'grantTestCoin', amount: 500 });
    }
    for (let i = 0; i < 8; i++) {
      simKill.commands.enqueue({ type: 'upgrade', group: 'demonic' });
    }
    simKill.tick();

    let bossSlainAtWaveTicksLeft = 9999;
    simKill.events.on('boss:slain', () => {
      // On the tick immediately following boss death, stepWaveAndSpawn fast-forwards waveTicksLeft to <= 45
      bossSlainAtWaveTicksLeft = simKill.buildSnapshot(1, false).waveTicksLeft;
    });

    while (simKill.buildSnapshot(1, false).bossesSlain < 1 && simKill.tickCount < 5000) {
      simKill.tick();
    }
    // Tick once more so stepWaveAndSpawn applies the post-boss fast-forward
    simKill.tick();

    const snapAfterBoss = simKill.buildSnapshot(1, false);
    expect(bossSlainAtWaveTicksLeft).toBeGreaterThan(45);
    expect(snapAfterBoss.waveTicksLeft).toBeLessThanOrEqual(45);
    expect(snapAfterBoss.damageMeter.totalDamage).toBeGreaterThan(0);
    expect(snapAfterBoss.damageMeter.entries[0]?.unitId).toBe('cheonma');
    expect(snapAfterBoss.damageMeter.entries[0]?.sharePct).toBe(100);
  });

  it('executes Active Bounty Hunt (현상수배): Wave 1 lock, 30s escape coin theft, and kill reward + mission completion', () => {
    const data = loadGameData();

    // Part A: Rejected on Wave 1, then called on Wave 2 and left to escape after 900 ticks (30s)
    const simEscape = new Simulation(data, 0x33334444);
    let rejectedCmd = '';
    simEscape.events.on('command:rejected', (ev) => {
      rejectedCmd = ev.cmd;
    });
    simEscape.commands.enqueue({ type: 'callBounty' });
    simEscape.tick();
    expect(rejectedCmd).toBe('callBounty');

    while (simEscape.buildSnapshot(1, false).wave < 2) {
      simEscape.tick();
    }
    expect(simEscape.buildSnapshot(1, false).bounty.canCall).toBe(true);

    let coinAtEscapeTick = 0;
    let escapedStolen = -1;
    simEscape.events.on('bounty:escaped', (ev) => {
      escapedStolen = ev.stolenCoin;
      coinAtEscapeTick = simEscape.buildSnapshot(1, false).coin + ev.stolenCoin;
    });

    simEscape.commands.enqueue({ type: 'callBounty' });
    simEscape.tick();
    expect(simEscape.buildSnapshot(1, false).bounty.active).toBe(true);
    expect(simEscape.buildSnapshot(1, false).boss?.isBounty).toBe(true);

    for (let t = 0; t < 905; t++) {
      simEscape.tick();
    }
    expect(escapedStolen).toBeGreaterThan(0);
    expect(escapedStolen).toBe(Math.min(100, Math.floor(coinAtEscapeTick * 0.15)));
    expect(simEscape.buildSnapshot(1, false).bounty.active).toBe(false);

    // Part B: Slaying bounty outlaw grants luckStone + coin and completes m_bounty_hunt mission
    const simSlay = new Simulation(data, 0x55556666);
    spawnCheonmaHelper(simSlay);
    while (simSlay.buildSnapshot(1, false).wave < 2) {
      simSlay.tick();
    }

    const luckBefore = simSlay.buildSnapshot(1, false).luckStone;
    let bountySlainFired = false;
    simSlay.events.on('bounty:slain', () => {
      bountySlainFired = true;
    });

    simSlay.commands.enqueue({ type: 'callBounty' });
    for (let t = 0; t < 180 && !bountySlainFired; t++) {
      simSlay.tick();
    }

    expect(bountySlainFired).toBe(true);
    const snapSlain = simSlay.buildSnapshot(1, false);
    expect(snapSlain.bounty.bountiesSlain).toBe(1);
    expect(snapSlain.luckStone).toBeGreaterThanOrEqual(luckBefore + 2);
    const bountyMission = snapSlain.missions.find((m) => m.id === 'm_bounty_hunt');
    expect(bountyMission?.completed).toBe(true);
  });

  it('evaluates In-Run Missions (강호 의뢰) and Auto-Arrange (자동출전·정렬) while preserving locked bench units', () => {
    const data = loadGameData();
    const sim = new Simulation(data, 0x77889900);

    // Trigger m_wealth_1000 (만금거상: >= 1000 coin -> +2 luckStone)
    const startLuck = sim.buildSnapshot(1, false).luckStone;
    sim.commands.enqueue({ type: 'grantTestCoin', amount: 600 });
    sim.tick();

    const snapWealth = sim.buildSnapshot(1, false);
    expect(snapWealth.missions.find((m) => m.id === 'm_wealth_1000')?.completed).toBe(true);
    expect(snapWealth.luckStone).toBe(startLuck + 2);

    // Trigger m_upgrade_6 (단전 개벽: total upgrades >= 6 -> +1 uncommon wisp)
    sim.commands.enqueue({ type: 'grantTestCoin', amount: 1500 });
    for (let i = 0; i < 6; i++) {
      sim.commands.enqueue({ type: 'upgrade', group: 'orthodox' });
    }
    sim.tick();
    expect(
      sim.buildSnapshot(1, false).missions.find((m) => m.id === 'm_upgrade_6')?.completed,
    ).toBe(true);

    // Auto-Arrange test: place 3 units onto scattered bench slots, lock 1 rare unit, leave field open
    sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
    sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'hwasan_novice' }); // field[0]
    sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'rare' });
    sim.commands.enqueue({ type: 'useWisp', grade: 'rare', unitId: 'plum_elder' }); // field[1]
    sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'uncommon' });
    sim.commands.enqueue({ type: 'useWisp', grade: 'uncommon', unitId: 'shaolin_monk' }); // field[2]
    sim.tick();

    // Move all 3 to scattered bench slots (bench[5], bench[9], bench[2]) and lock plum_elder on bench[9]
    const f0 = sim.buildSnapshot(1, false).field[0]!;
    const f1 = sim.buildSnapshot(1, false).field[1]!;
    const f2 = sim.buildSnapshot(1, false).field[2]!;
    sim.commands.enqueue({ type: 'move', from: { area: 'field', index: 0 }, to: { area: 'bench', index: 5 } });
    sim.commands.enqueue({ type: 'move', from: { area: 'field', index: 1 }, to: { area: 'bench', index: 9 } });
    sim.commands.enqueue({ type: 'move', from: { area: 'field', index: 2 }, to: { area: 'bench', index: 2 } });
    sim.commands.enqueue({ type: 'lock', uid: f1.uid, locked: true });
    sim.tick();

    expect(sim.buildSnapshot(1, false).fieldOccupied).toBe(0);
    expect(sim.buildSnapshot(1, false).benchOccupied).toBe(3);

    sim.commands.enqueue({ type: 'autoArrange' });
    sim.tick();

    const arranged = sim.buildSnapshot(1, false);
    // Unlocked shaolin_monk (uncommon) -> field[0], unlocked hwasan_novice (common) -> field[1]
    expect(arranged.field[0]?.uid).toBe(f2.uid);
    expect(arranged.field[1]?.uid).toBe(f0.uid);
    // Locked plum_elder remains on bench, compacted cleanly to bench[0]!
    expect(arranged.bench[0]?.uid).toBe(f1.uid);
    expect(arranged.bench[0]?.locked).toBe(true);
    expect(arranged.benchOccupied).toBe(1);
  });

  it('scales 3 Difficulty Tiers, triggers Wave 30 Victory, enters Wave 31+ Endless Mode, and settles First-Clear & Codex rewards', () => {
    const data = loadGameData();

    // 1. Difficulty HP scaling check on Wave 1 first spawn (nextSpawnTick = 15)
    const simNormal = new Simulation(data, 0x42424242, undefined, 'normal');
    const simHard = new Simulation(data, 0x42424242, undefined, 'hard');
    const simHell = new Simulation(data, 0x42424242, undefined, 'hell');
    for (let t = 0; t <= 15; t++) {
      simNormal.tick();
      simHard.tick();
      simHell.tick();
    }

    expect(simNormal.getMonsters()[0]?.maxHp).toBe(115);
    expect(simHard.getMonsters()[0]?.maxHp).toBe(Math.round(115 * 1.65));
    expect(simHell.getMonsters()[0]?.maxHp).toBe(Math.round(115 * 2.65));

    // 2. Clear Wave 30 Grand Demon God & enter Wave 31+ Endless Mode
    const simRun = new Simulation(
      data,
      0x20261118,
      { million_sword_seal: 10, golden_vault: 10 },
      'normal',
    );
    spawnCheonmaHelper(simRun);
    spawnCheonmaHelper(simRun);
    for (let i = 0; i < 6; i++) {
      simRun.commands.enqueue({ type: 'grantTestCoin', amount: 5000 });
    }
    for (let i = 0; i < 15; i++) {
      simRun.commands.enqueue({ type: 'upgrade', group: 'demonic' });
    }
    simRun.tick();

    expect(
      simRun.buildSnapshot(1, false).missions.find((m) => m.id === 'm_mythic_descent')?.completed,
    ).toBe(true);

    let victoryEventWave = 0;
    simRun.events.on('run:victory', (ev) => {
      victoryEventWave = ev.wave;
    });

    while (!simRun.buildSnapshot(1, false).victoryHold && simRun.tickCount < 45000) {
      simRun.tick();
      if (simRun.isGameOver) break;
    }

    const snapVictory = simRun.buildSnapshot(1, false);
    expect(snapVictory.gameOver).toBe(false);
    expect(snapVictory.wave).toBe(30);
    expect(snapVictory.victoryAchieved).toBe(true);
    expect(snapVictory.victoryHold).toBe(true);
    expect(victoryEventWave).toBe(30);

    // 3. MetaStore First-Clear bonus, next-difficulty unlock, Codex discovery, and Endless overtime delta
    const mem = new Map<string, string>();
    const mockStorage: StorageLike = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => {
        mem.set(k, v);
      },
    };
    const store = new MetaStore(mockStorage);

    const cheonmaDef = data.unitsById.get('cheonma')!;
    const immortalGrade = data.gradesById.get(cheonmaDef.grade)!;
    const disc1 = store.discoverUnit(cheonmaDef, immortalGrade);
    expect(disc1.isNew).toBe(true);
    expect(disc1.bonusGold).toBe(300);
    expect(disc1.bonusKeys).toBe(3);
    expect(store.discoverUnit(cheonmaDef, immortalGrade).isNew).toBe(false);
    expect(store.getProfile().discoveredCount).toBe(1);

    const clearSettlement = store.settleRun({
      wave: snapVictory.wave,
      monstersSlain: snapVictory.monstersSlain,
      bossesSlain: snapVictory.bossesSlain,
      bountiesSlain: snapVictory.bounty.bountiesSlain,
      difficulty: 'normal',
      victory: true,
    });
    expect(clearSettlement.clearedWaves).toBe(30);
    expect(clearSettlement.firstClearBonusGold).toBe(250);
    expect(clearSettlement.firstClearBonusKeys).toBe(2);
    expect(clearSettlement.unlockedNextDifficulty).toBe('hard');
    expect(store.getProfile().unlockedDifficulties.hard).toBe(true);
    expect(store.setSelectedDifficulty('hard')).toBe(true);
    expect(store.setSelectedDifficulty('hell')).toBe(false); // hell requires clearing hard first

    // Transition into Endless Mode (Wave 31+)
    simRun.commands.enqueue({ type: 'enterEndless' });
    while (simRun.buildSnapshot(1, false).wave < 32 && simRun.tickCount < 50000) {
      simRun.tick();
    }
    const snapEndless = simRun.buildSnapshot(1, false);
    expect(snapEndless.victoryHold).toBe(false);
    expect(snapEndless.endlessMode).toBe(true);
    expect(snapEndless.wave).toBe(32);

    const goldBeforeOvertime = store.getProfile().gold;
    const overtimeRec = store.settleEndlessOvertime(clearSettlement, {
      wave: snapEndless.wave,
      monstersSlain: snapEndless.monstersSlain,
      bossesSlain: snapEndless.bossesSlain,
      bountiesSlain: snapEndless.bounty.bountiesSlain,
      difficulty: 'normal',
      victory: true,
    });
    const deltaGold = overtimeRec.goldEarned - clearSettlement.goldEarned;
    expect(deltaGold).toBeGreaterThan(0);
    expect(store.getProfile().gold).toBe(goldBeforeOvertime + deltaGold);
    expect(store.getProfile().bestWave).toBe(32);
  });

  it('persists SoundSynthesizer mute state and preserves 100% bit-exact 1x vs 3x state hash with callBounty & autoArrange', () => {
    const mem = new Map<string, string>();
    const mockStorage: StorageLike = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => {
        mem.set(k, v);
      },
    };
    const sound1 = new SoundSynthesizer(mockStorage);
    expect(sound1.isMuted()).toBe(false);
    expect(sound1.toggleMute()).toBe(true);
    expect(new SoundSynthesizer(mockStorage).isMuted()).toBe(true);

    const data = loadGameData();
    const initialRelics = {
      golden_vault: 3,
      million_sword_seal: 4,
      bandit_dagger: 3,
    } as const;

    const commands: readonly StampedCommand[] = [
      { tick: 0, command: { type: 'summon' } },
      { tick: 0, command: { type: 'summon' } },
      { tick: 0, command: { type: 'summon' } },
      { tick: 5, command: { type: 'move', from: { area: 'field', index: 0 }, to: { area: 'bench', index: 7 } } },
      { tick: 5, command: { type: 'move', from: { area: 'field', index: 1 }, to: { area: 'bench', index: 3 } } },
      { tick: 12, command: { type: 'autoArrange' } },
      { tick: 40, command: { type: 'upgrade', group: 'orthodox' } },
      { tick: 860, command: { type: 'callBounty' } }, // Wave 2 active bounty spawn
    ];

    const sim1x = new Simulation(data, 0xdeadbeef, initialRelics, 'hard');
    sim1x.scheduleCommandsForReplay(commands);

    const sim3x = new Simulation(data, 0xdeadbeef, initialRelics, 'hard');
    sim3x.scheduleCommandsForReplay(commands);

    const totalTicks = 1050;
    for (let t = 0; t < totalTicks; t++) {
      sim1x.tick();
    }
    for (let t = 0; t < totalTicks; t += 3) {
      sim3x.tick();
      sim3x.tick();
      sim3x.tick();
    }

    expect(sim3x.hashState()).toBe(sim1x.hashState());
    expect(sim1x.buildSnapshot(1, false).wave).toBe(2);
    expect(sim1x.buildSnapshot(1, false).bounty.active || sim1x.buildSnapshot(1, false).bounty.bountiesSlain > 0).toBe(true);
  });

  it('chain-crafts new 6-tier Immortals 태상검선 (sword_immortal) and 혈해수라왕 (asura_emperor) with aura & armor-shred traits', () => {
    const data = loadGameData();
    const sim = new Simulation(data, 0x778899aa);
    const craftedOutputs: { unitId: string; grade: string }[] = [];
    sim.events.on('craft:done', (ev) => {
      craftedOutputs.push({ unitId: ev.outputUnitId, grade: ev.grade });
    });

    const grantWispUnits = (items: readonly { readonly grade: string; readonly unitId: string }[]): void => {
      for (const item of items) {
        sim.commands.enqueue({ type: 'grantTestResource', wispGrade: item.grade });
        sim.commands.enqueue({ type: 'useWisp', grade: item.grade, unitId: item.unitId });
      }
      sim.tick();
    };

    // 1. Craft r_sword_saint -> r_murim_lord -> chain-craft r_sword_immortal
    grantWispUnits([
      { grade: 'rare', unitId: 'plum_elder' },
      { grade: 'uncommon', unitId: 'plum_swordsman' },
      { grade: 'common', unitId: 'hwasan_novice' },
      { grade: 'rare', unitId: 'plum_elder' },
      { grade: 'uncommon', unitId: 'namgung_thunder' },
    ]);
    sim.commands.enqueue({ type: 'craft', recipeId: 'r_sword_saint', chain: true });
    sim.tick();

    grantWispUnits([
      { grade: 'rare', unitId: 'gaebang_elder' },
      { grade: 'uncommon', unitId: 'namgung_thunder' },
      { grade: 'common', unitId: 'mudang_disciple' },
      { grade: 'rare', unitId: 'gaebang_elder' },
      { grade: 'uncommon', unitId: 'shaolin_monk' },
    ]);
    sim.commands.enqueue({ type: 'craft', recipeId: 'r_murim_lord', chain: true });
    sim.tick();

    grantWispUnits([
      { grade: 'rare', unitId: 'plum_elder' },
      { grade: 'uncommon', unitId: 'plum_swordsman' },
      { grade: 'common', unitId: 'hwasan_novice' },
      { grade: 'rare', unitId: 'gaebang_elder' },
      { grade: 'uncommon', unitId: 'namgung_thunder' },
      { grade: 'common', unitId: 'mudang_disciple' },
    ]);
    expect(sim.buildSnapshot(1, false).craft.recipes['r_sword_immortal']?.lamp).toBe('chainReady');
    sim.commands.enqueue({ type: 'craft', recipeId: 'r_sword_immortal', chain: true });
    sim.tick();

    // 2. Craft r_mad_demon -> chain-craft r_asura_emperor
    grantWispUnits([
      { grade: 'rare', unitId: 'nokrim_chief' },
      { grade: 'uncommon', unitId: 'poison_healer' },
      { grade: 'common', unitId: 'tang_assassin' },
      { grade: 'rare', unitId: 'nokrim_chief' },
      { grade: 'uncommon', unitId: 'blood_blade' },
      { grade: 'common', unitId: 'haomun_ronin' },
    ]);
    sim.commands.enqueue({ type: 'craft', recipeId: 'r_mad_demon', chain: true });
    sim.tick();

    grantWispUnits([
      { grade: 'rare', unitId: 'nokrim_chief' },
      { grade: 'uncommon', unitId: 'poison_healer' },
      { grade: 'common', unitId: 'tang_assassin' },
      { grade: 'rare', unitId: 'nokrim_chief' },
      { grade: 'uncommon', unitId: 'blood_blade' },
      { grade: 'common', unitId: 'haomun_ronin' },
      { grade: 'rare', unitId: 'nokrim_chief' },
    ]);
    expect(sim.buildSnapshot(1, false).craft.recipes['r_asura_emperor']?.lamp).toBe('chainReady');
    sim.commands.enqueue({ type: 'craft', recipeId: 'r_asura_emperor', chain: true });
    sim.tick();

    const snap = sim.buildSnapshot(1, false);
    const owned = [...snap.field, ...snap.bench].filter((s): s is NonNullable<typeof s> => s !== null);
    const swordImmortal = owned.find((u) => u.unitId === 'sword_immortal');
    const asuraEmperor = owned.find((u) => u.unitId === 'asura_emperor');

    expect(swordImmortal).toBeDefined();
    expect(swordImmortal?.grade).toBe('immortal');
    expect(swordImmortal?.faction).toBe('orthodox');
    expect(swordImmortal?.armorShred).toBeGreaterThan(0);
    expect(swordImmortal?.supportAura).toBeDefined();

    expect(asuraEmperor).toBeDefined();
    expect(asuraEmperor?.grade).toBe('immortal');
    expect(asuraEmperor?.faction).toBe('unorthodox');
    expect(asuraEmperor?.armorShred).toBeGreaterThan(0);
    expect(asuraEmperor?.supportAura).toBeDefined();

    expect(craftedOutputs.some((c) => c.unitId === 'sword_immortal' && c.grade === 'immortal')).toBe(true);
    expect(craftedOutputs.some((c) => c.unitId === 'asura_emperor' && c.grade === 'immortal')).toBe(true);
  });

  it('applies 6x3 orthogonal supportAura buffs strictly to cross-adjacent field tiles and caps stacked bonuses', () => {
    const data = loadGameData();
    const sim = new Simulation(data, 0x33445566);

    // Spawn 1 cult_elder (totem: +16% atk, +8% speed) and 3 hwasan_novice attackers
    sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'rare' });
    sim.commands.enqueue({ type: 'useWisp', grade: 'rare', unitId: 'cult_elder' }); // lands on field[0]
    for (let i = 0; i < 3; i++) {
      sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
      sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'hwasan_novice' }); // field[1], field[2], field[3]
    }
    sim.tick();

    // Move cult_elder to center tile field[7] (row 1, col 1 -> orthogonal neighbors: 1, 6, 8, 13)
    // Move novices to: field[1] (north neighbor), field[0] (diagonal NW), bench[0] (off-field)
    sim.commands.enqueue({ type: 'move', from: { area: 'field', index: 0 }, to: { area: 'field', index: 7 } });
    sim.commands.enqueue({ type: 'move', from: { area: 'field', index: 2 }, to: { area: 'field', index: 0 } });
    sim.commands.enqueue({ type: 'move', from: { area: 'field', index: 3 }, to: { area: 'bench', index: 0 } });
    sim.tick();

    const snap = sim.buildSnapshot(1, false);
    const northAlly = snap.field[1]!;
    const diagAlly = snap.field[0]!;
    const benchAlly = snap.bench[0]!;
    const centerTotem = snap.field[7]!;

    expect(centerTotem.unitId).toBe('cult_elder');
    expect(centerTotem.tileBuffAtkPct).toBe(0); // totem does not buff its own tile
    expect(northAlly.unitId).toBe('hwasan_novice');
    expect(northAlly.tileBuffAtkPct).toBe(16);
    expect(northAlly.tileBuffSpeedPct).toBe(8);
    expect(northAlly.bonusAtk).toBeGreaterThan(diagAlly.bonusAtk);

    expect(diagAlly.unitId).toBe('hwasan_novice');
    expect(diagAlly.tileBuffAtkPct).toBe(0);
    expect(diagAlly.tileBuffSpeedPct).toBe(0);

    expect(benchAlly.unitId).toBe('hwasan_novice');
    expect(benchAlly.tileBuffAtkPct).toBe(0);

    // Surround field[7] with 4 mudang_master totems (+18% atk, +14% speed -> 4x = 72% / 56%) on 1, 6, 8, 13 to verify caps (65% atk / 45% speed)
    sim.commands.enqueue({ type: 'move', from: { area: 'field', index: 7 }, to: { area: 'bench', index: 5 } });
    sim.commands.enqueue({ type: 'move', from: { area: 'field', index: 1 }, to: { area: 'field', index: 7 } });
    sim.tick();

    const surroundSlots = [1, 6, 8, 13];
    for (let k = 0; k < surroundSlots.length; k++) {
      const targetIdx = surroundSlots[k]!;
      sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'rare' });
      sim.commands.enqueue({ type: 'useWisp', grade: 'rare', unitId: 'gaebang_elder' });
      sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'uncommon' });
      sim.commands.enqueue({ type: 'useWisp', grade: 'uncommon', unitId: 'namgung_thunder' });
      sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
      sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'mudang_disciple' });
      sim.tick();
      sim.commands.enqueue({ type: 'craft', recipeId: 'r_mudang_master', chain: true });
      sim.tick();

      const snapTmp = sim.buildSnapshot(1, false);
      const placedAlready = surroundSlots.slice(0, k);
      const spawnedIdx = snapTmp.field.findIndex(
        (s, idx) => s?.unitId === 'mudang_master' && !placedAlready.includes(idx),
      );
      if (spawnedIdx >= 0 && spawnedIdx !== targetIdx) {
        sim.commands.enqueue({
          type: 'move',
          from: { area: 'field', index: spawnedIdx },
          to: { area: 'field', index: targetIdx },
        });
        sim.tick();
      }
    }

    const cappedSnap = sim.buildSnapshot(1, false);
    expect(cappedSnap.field[7]?.tileBuffAtkPct).toBe(65);
    expect(cappedSnap.field[7]?.tileBuffSpeedPct).toBe(45);
  });

  it('enforces monster 호신강기 (armor) scaling and 파갑 (armorShred) defense break + negative-armor damage amplification', () => {
    const data = loadGameData();
    const sim = new Simulation(data, 0x99112233, undefined, 'hard');

    // Wave 1 regular monsters have 0 armor
    for (let t = 0; t < 45; t++) {
      sim.tick();
    }
    expect(sim.getMonsters().length).toBeGreaterThan(0);
    expect(sim.getMonsters()[0]?.armor).toBe(0);

    // Place armor-shredding heroes (gaebang_elder: 18, tang_assassin: 7) on field to fight Wave 2 armored bounty
    for (let i = 0; i < 4; i++) {
      sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'rare' });
      sim.commands.enqueue({ type: 'useWisp', grade: 'rare', unitId: 'gaebang_elder' });
      sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
      sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'tang_assassin' });
    }
    sim.tick();

    // Advance into Wave 2 (tick >= 840) and summon an armored bounty target
    while (sim.buildSnapshot(1, false).wave < 2 && sim.tickCount < 1000) {
      sim.tick();
    }
    sim.commands.enqueue({ type: 'callBounty' });
    sim.tick();

    const bountyMob = sim.getMonsters().find((m) => m.isBounty);
    expect(bountyMob).toBeDefined();
    expect(bountyMob!.armor).toBeGreaterThan(0);

    let observedShred = 0;
    let bountyShatterCount = 0;
    let bountyArmorBrokenHits = 0;
    sim.events.on('monster:hit', (ev) => {
      if (ev.entityId === bountyMob!.entityId) {
        if (ev.justShattered) bountyShatterCount += 1;
        if (ev.armorBroken) bountyArmorBrokenHits += 1;
      }
    });

    for (let t = 0; t < 180; t++) {
      sim.tick();
      const activeBounty = sim.getMonsters().find((m) => m.isBounty);
      if (activeBounty && activeBounty.armorShred > observedShred) {
        observedShred = activeBounty.armorShred;
      }
    }
    expect(observedShred).toBeGreaterThan(0);
    expect(bountyShatterCount).toBe(1);
    expect(bountyArmorBrokenHits).toBeGreaterThan(0);
  });

  it('supports 금수화장각 skin gacha (1x/5x), duplicate 운금비단 refund, silk crafting, equipment persistence, and achievement unlocks', () => {
    const data = loadGameData();
    const mem = new Map<string, string>();
    const mockStorage: StorageLike = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => {
        mem.set(k, v);
      },
    };

    const store = new MetaStore(mockStorage);
    const startProfile = store.getProfile();
    expect(startProfile.silk).toBe(30);
    expect(startProfile.equippedCourtSkin).toBe(DEFAULT_COURT_SKIN_ID);
    expect(startProfile.ownedSkins[DEFAULT_COURT_SKIN_ID]).toBe(true);

    const expectedGoldAfterGrant = startProfile.gold + 1500;
    const expectedKeysAfterGrant = startProfile.keys + 10;
    store.grantDevMeta(1500, 10, 0);
    expect(store.getProfile().gold).toBe(expectedGoldAfterGrant);

    // 1. Single pull with deterministic rngFn -> rolls first rare skin (new)
    const pull1 = store.drawSkinGacha(data.heroSkins, data.courtSkins, 1, 'gold', () => 0.85);
    expect(pull1.ok).toBe(true);
    if (!pull1.ok) throw new Error(pull1.reason);
    expect(pull1.items.length).toBe(1);
    const firstPulled = pull1.items[0]!;
    expect(firstPulled.isNew).toBe(true);
    expect(firstPulled.silkRefund).toBe(0);
    expect(store.getProfile().gold).toBe(expectedGoldAfterGrant - SKIN_SINGLE_GOLD_COST);
    expect(store.getProfile().ownedSkins[firstPulled.skinId]).toBe(true);

    // 2. Pulling the exact same rng seed again -> duplicate refund in 운금비단 (silk)
    const silkBeforeDup = store.getProfile().silk;
    const pullDup = store.drawSkinGacha(data.heroSkins, data.courtSkins, 1, 'key', () => 0.85);
    expect(pullDup.ok).toBe(true);
    if (!pullDup.ok) throw new Error(pullDup.reason);
    expect(pullDup.items[0]!.skinId).toBe(firstPulled.skinId);
    expect(pullDup.items[0]!.isNew).toBe(false);
    const expectedRefund = getSkinDuplicateSilk(firstPulled.rarity);
    expect(pullDup.totalSilkRefund).toBe(expectedRefund);
    expect(store.getProfile().silk).toBe(silkBeforeDup + expectedRefund);
    expect(store.getProfile().keys).toBe(expectedKeysAfterGrant - 1);

    // 3. 5x multi-pull applies 10% gold discount (540 gold instead of 600)
    const goldBefore5x = store.getProfile().gold;
    let rollCursor = 0;
    const rolls = [0.05, 0.0, 0.25, 0.3, 0.65, 0.5, 0.12, 0.9, 0.42, 0.7];
    const pull5 = store.drawSkinGacha(
      data.heroSkins,
      data.courtSkins,
      5,
      'gold',
      () => rolls[rollCursor++ % rolls.length]!,
    );
    expect(pull5.ok).toBe(true);
    if (!pull5.ok) throw new Error(pull5.reason);
    expect(pull5.items.length).toBe(5);
    expect(store.getProfile().gold).toBe(goldBefore5x - SKIN_MULTI5_GOLD_COST);

    // 4. Deterministic silk crafting & equip/unequip persistence
    store.grantDevMeta(0, 0, 300);
    const unownedHeroSkin = data.heroSkins.find(
      (s) => s.rarity !== 'achievement' && !store.getProfile().ownedSkins[s.id],
    )!;
    expect(unownedHeroSkin).toBeDefined();
    const silkBeforeCraft = store.getProfile().silk;
    const craftRes = store.craftSkinWithSilk(unownedHeroSkin);
    expect(craftRes.ok).toBe(true);
    expect(store.getProfile().silk).toBe(silkBeforeCraft - unownedHeroSkin.silkCost);
    expect(store.getProfile().ownedSkins[unownedHeroSkin.id]).toBe(true);
    expect(store.getProfile().equippedHeroSkins[unownedHeroSkin.unitId]).toBe(unownedHeroSkin.id);

    // Unequip & re-equip hero skin + craft & equip court skin
    expect(store.equipHeroSkin(unownedHeroSkin.unitId, null, data.heroSkinsById)).toBe(true);
    expect(store.getProfile().equippedHeroSkins[unownedHeroSkin.unitId]).toBeUndefined();
    expect(store.equipHeroSkin(unownedHeroSkin.unitId, unownedHeroSkin.id, data.heroSkinsById)).toBe(true);

    const bloodMoonCourt = data.courtSkinsById.get('court_blood_moon')!;
    if (!store.getProfile().ownedSkins[bloodMoonCourt.id]) {
      expect(store.craftSkinWithSilk(bloodMoonCourt).ok).toBe(true);
    } else {
      expect(store.equipCourtSkin(bloodMoonCourt.id)).toBe(true);
    }
    expect(store.getProfile().equippedCourtSkin).toBe('court_blood_moon');

    // Achievement skins cannot be crafted with silk directly
    const achSkin = data.heroSkinsById.get('skin_cheonma_golden_emperor')!;
    expect(store.craftSkinWithSilk(achSkin).ok).toBe(false);

    // 5. Achievement skin auto-unlocks on Hell Wave 30 victory & Wave 35 Endless overtime
    const hellClear = store.settleRun({
      wave: 30,
      monstersSlain: 900,
      bossesSlain: 3,
      bountiesSlain: 4,
      difficulty: 'hell',
      victory: true,
    });
    expect(hellClear.unlockedSkinIds).toContain('court_golden_palace');
    expect(hellClear.unlockedSkinIds).toContain('skin_cheonma_golden_emperor');
    expect(store.getProfile().ownedSkins.court_golden_palace).toBe(true);
    expect(store.getProfile().ownedSkins.skin_cheonma_golden_emperor).toBe(true);

    const wave35Rec = store.settleEndlessOvertime(hellClear, {
      wave: 35,
      monstersSlain: 1200,
      bossesSlain: 3,
      bountiesSlain: 5,
      difficulty: 'hell',
      victory: true,
    });
    expect(wave35Rec.unlockedSkinIds).toContain('skin_sword_demon_azure');
    expect(store.getProfile().ownedSkins.skin_sword_demon_azure).toBe(true);

    // Reload from mockStorage and verify full persistence
    const reloaded = new MetaStore(mockStorage).getProfile();
    expect(reloaded.equippedCourtSkin).toBe('court_blood_moon');
    expect(reloaded.equippedHeroSkins[unownedHeroSkin.unitId]).toBe(unownedHeroSkin.id);
    expect(reloaded.ownedSkins.skin_cheonma_golden_emperor).toBe(true);
    expect(reloaded.ownedSkins.skin_sword_demon_azure).toBe(true);
  });

  it('triggers Mutant Special Waves (경공야습 · 철갑중장 · 인해전술) on designated Wave 6+ non-boss waves', () => {
    const data = loadGameData();
    expect(getWaveMutantKind(2, false)).toBeNull();
    expect(getWaveMutantKind(4, false)).toBeNull();
    expect(getWaveMutantKind(5, true)).toBeNull();
    expect(getWaveMutantKind(10, true)).toBeNull();
    expect(getWaveMutantKind(7, false)).toBe('swift_raid');
    expect(getWaveMutantKind(9, false)).toBe('blood_swarm');
    expect(getWaveMutantKind(12, false)).toBe('blood_swarm');
    expect(getWaveMutantKind(14, false)).toBe('iron_wall');

    const sim = new Simulation(data, 0x2468ace0);
    // Iron wall Wave 14 adds +22 bonus armor over non-mutant formula
    const wave13Armor = sim.computeMonsterArmor(13, false, false);
    const wave14Armor = sim.computeMonsterArmor(14, false, false);
    expect(wave14Armor - wave13Armor).toBeGreaterThanOrEqual(24); // +2.6 wave step + 22 iron_wall

    spawnCheonmaHelper(sim);
    for (let i = 0; i < 6; i++) {
      sim.commands.enqueue({ type: 'grantTestCoin', amount: 500 });
      sim.commands.enqueue({ type: 'upgrade', group: 'demonic' });
    }
    sim.tick();

    const mutantEvents: string[] = [];
    sim.events.on('wave:mutant', (ev) => {
      mutantEvents.push(`${ev.wave}:${ev.mutant}`);
    });

    while (sim.buildSnapshot(1, false).wave < 7 && sim.tickCount < 8000) {
      sim.tick();
    }

    const snap7 = sim.buildSnapshot(1, false);
    expect(snap7.wave).toBe(7);
    expect(snap7.waveMutant?.kind).toBe('swift_raid');
    expect(mutantEvents).toContain('7:swift_raid');
  });

  it('executes White Tiger (호포진·광풍질주) and Black Serpent (만년현무 독갑 1.8x 파갑 특효 · 격파 기절 · 미격파 재생) boss patterns', () => {
    const data = loadGameData();

    // Part A: Wave 5 White Tiger casts tiger_roar (+cooldown) and tiger_sprint (<55% HP)
    const simTiger = new Simulation(data, 0x13572468);
    // Deploy medium DPS so White Tiger survives 120 ticks to roar AND drops below 55% HP
    for (let i = 0; i < 3; i++) {
      simTiger.commands.enqueue({ type: 'grantTestResource', wispGrade: 'rare' });
      simTiger.commands.enqueue({ type: 'useWisp', grade: 'rare', unitId: 'plum_elder' });
    }
    simTiger.tick();

    const tigerSkills = new Set<string>();
    simTiger.events.on('boss:skill', (ev) => {
      if (ev.bossKind === 'white_tiger') {
        tigerSkills.add(ev.skillKind);
      }
    });

    while (simTiger.buildSnapshot(1, false).wave < 5 && simTiger.tickCount < 6000) {
      simTiger.tick();
    }
    // Run through Wave 5 until both roar and sprint have triggered (or Wave 5 ends)
    for (let t = 0; t < 1600 && (!tigerSkills.has('tiger_roar') || !tigerSkills.has('tiger_sprint')); t++) {
      simTiger.tick();
    }
    expect(tigerSkills.has('tiger_roar')).toBe(true);
    expect(tigerSkills.has('tiger_sprint')).toBe(true);

    // Part B: Wave 10 Black Serpent casts serpent_shell -> armor-shredding unit shatters it -> stun + +25 shred!
    const simSerpent = new Simulation(data, 0x86421357);
    spawnCheonmaHelper(simSerpent);
    for (let i = 0; i < 8; i++) {
      simSerpent.commands.enqueue({ type: 'grantTestCoin', amount: 500 });
      simSerpent.commands.enqueue({ type: 'upgrade', group: 'demonic' });
    }
    simSerpent.tick();

    // Fast-reach Wave 10, then temporarily bench Cheonma until Black Serpent casts serpent_shell!
    while (simSerpent.buildSnapshot(1, false).wave < 10 && simSerpent.tickCount < 10000) {
      simSerpent.tick();
    }
    expect(simSerpent.buildSnapshot(1, false).wave).toBe(10);

    const cheonmaUnit = simSerpent.getUnits().find((u) => u.unitId === 'cheonma')!;
    const originalFieldSlot = cheonmaUnit.slot;
    simSerpent.commands.enqueue({
      type: 'move',
      from: originalFieldSlot,
      to: { area: 'bench', index: 0 },
    });
    simSerpent.tick();

    let shellCast = false;
    let shattered = false;
    simSerpent.events.on('boss:skill', (ev) => {
      if (ev.skillKind === 'serpent_shell') shellCast = true;
      if (ev.skillKind === 'serpent_shatter') shattered = true;
    });

    for (let t = 0; t < 220 && !shellCast; t++) {
      simSerpent.tick();
    }
    expect(shellCast).toBe(true);
    expect(simSerpent.buildSnapshot(1, false).boss?.shieldHp).toBeGreaterThan(0);

    // Move Cheonma back to field and add an armor-shredding Tang Assassin to shatter the barrier!
    simSerpent.commands.enqueue({
      type: 'move',
      from: { area: 'bench', index: 0 },
      to: originalFieldSlot,
    });
    simSerpent.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
    simSerpent.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'tang_assassin' });
    for (let t = 0; t < 120 && !shattered; t++) {
      simSerpent.tick();
    }
    expect(shattered).toBe(true);
  });

  it('executes Blood Patriarch 혈옥주박진 tile seal & immediate counterplay via drag-swap move and autoArrange evacuation', () => {
    const data = loadGameData();
    const sim = new Simulation(data, 0x97531864);
    spawnCheonmaHelper(sim);
    for (let i = 0; i < 12; i++) {
      sim.commands.enqueue({ type: 'grantTestCoin', amount: 500 });
      sim.commands.enqueue({ type: 'upgrade', group: 'demonic' });
    }
    sim.tick();

    // Advance rapidly to Wave 15 (Blood Patriarch)
    while (sim.buildSnapshot(1, false).wave < 15 && sim.tickCount < 16000) {
      sim.tick();
    }
    expect(sim.buildSnapshot(1, false).wave).toBe(15);

    // Bench & lock Cheonma and place 2 weak heroes on field slots 0 and 1 so Blood Patriarch targets them
    const cheonma = sim.getUnits().find((u) => u.unitId === 'cheonma')!;
    sim.commands.enqueue({
      type: 'move',
      from: cheonma.slot,
      to: { area: 'bench', index: 11 },
    });
    sim.commands.enqueue({ type: 'lock', uid: cheonma.uid, locked: true });
    sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
    sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'hwasan_novice' });
    sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
    sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'mudang_disciple' });
    sim.tick();

    let telegraphedTiles: readonly number[] = [];
    let sealActivated = false;
    sim.events.on('boss:skill', (ev) => {
      if (ev.skillKind === 'patriarch_telegraph' && ev.tileIndices) {
        telegraphedTiles = ev.tileIndices;
      }
      if (ev.skillKind === 'patriarch_seal') {
        sealActivated = true;
      }
    });

    for (let t = 0; t < 200 && telegraphedTiles.length === 0; t++) {
      sim.tick();
    }
    expect(telegraphedTiles.length).toBe(2);

    // During telegraph window, targeted SlotViews report hazardWarning = true, sealed = false
    const warnSnap = sim.buildSnapshot(1, false);
    const targetIdx0 = telegraphedTiles[0]!;
    const targetIdx1 = telegraphedTiles[1]!;
    expect(warnSnap.field[targetIdx0]?.hazardWarning).toBe(true);
    expect(warnSnap.field[targetIdx0]?.sealed).toBe(false);

    // Advance exactly HAZARD_WARNING_TICKS -> seal activates!
    for (let t = 0; t < HAZARD_WARNING_TICKS; t++) {
      sim.tick();
    }
    expect(sealActivated).toBe(true);
    expect(sim.isFieldSlotSealed(targetIdx0)).toBe(true);

    const sealedHero0 = sim.getUnits().find(
      (u) => u.slot.area === 'field' && u.slot.index === targetIdx0,
    )!;
    expect(sealedHero0).toBeDefined();
    const attacksWhenSealed = sealedHero0.attackCount;

    // While standing on sealed tile, hero cannot attack for 35 ticks
    for (let t = 0; t < 35; t++) {
      sim.tick();
    }
    expect(sealedHero0.attackCount).toBe(attacksWhenSealed);

    // Counterplay 1: Drag-swap move hero 0 off the sealed tile to the safe field tile closest to the live boss -> un-petrified immediately!
    const liveBoss = sim.getMonsters().find((m) => m.isBoss)!;
    let safeFieldIdx = 0;
    let bestDistSq = Infinity;
    for (let idx = 0; idx < 18; idx++) {
      if (!sim.hasFieldHazard(idx) && sim.board.field.getUidAt(idx) === null) {
        const c = sim.board.getSlotCenter({ area: 'field', index: idx });
        const dSq = (c.x - liveBoss.currX) ** 2 + (c.y - liveBoss.currY) ** 2;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          safeFieldIdx = idx;
        }
      }
    }
    sim.commands.enqueue({
      type: 'move',
      from: { area: 'field', index: targetIdx0 },
      to: { area: 'field', index: safeFieldIdx },
    });
    sim.tick();
    expect(sealedHero0.slot.index).toBe(safeFieldIdx);
    expect(sim.isFieldSlotSealed(sealedHero0.slot.index)).toBe(false);

    // Counterplay 2: autoArrange automatically evacuates remaining hero on targetIdx1 to a safe field tile right away!
    const sealedHero1 = sim.getUnits().find(
      (u) => u.slot.area === 'field' && u.slot.index === targetIdx1,
    );
    expect(sealedHero1).toBeDefined();
    expect(sim.hasFieldHazard(targetIdx1)).toBe(true);
    sim.commands.enqueue({ type: 'autoArrange' });
    sim.tick();
    expect(sim.hasFieldHazard(sealedHero1!.slot.index)).toBe(false);

    // Un-petrified hero next to the boss immediately fires!
    for (let t = 0; t < 40 && sealedHero0.attackCount === attacksWhenSealed; t++) {
      sim.tick();
    }
    expect(sealedHero0.attackCount).toBeGreaterThan(attacksWhenSealed);
  });

  it('offers 3-choice Roguelike Boss Boons (강호 기연 3택 1), applies boon mechanics, and preserves 1x vs 3x determinism', () => {
    const data = loadGameData();
    expect(data.boons.length).toBe(12);
    const uniqueIcons = new Set(data.boons.map((b) => b.iconKind));
    expect(uniqueIcons.size).toBe(12);

    const sim = new Simulation(data, 0x42424242);
    spawnCheonmaHelper(sim);
    for (let i = 0; i < 6; i++) {
      sim.commands.enqueue({ type: 'grantTestCoin', amount: 500 });
      sim.commands.enqueue({ type: 'upgrade', group: 'demonic' });
    }
    sim.tick();

    let offeredOptions: readonly BoonId[] = [];
    sim.events.on('boon:offered', (ev) => {
      offeredOptions = ev.options;
    });

    while (offeredOptions.length === 0 && sim.tickCount < 6000) {
      sim.tick();
    }
    expect(offeredOptions.length).toBe(3);
    expect(new Set(offeredOptions).size).toBe(3);

    const snapPending = sim.buildSnapshot(1, false);
    expect(snapPending.pendingBoonOffer?.options).toEqual(offeredOptions);

    // Picking an unoffered boonId must be rejected cleanly
    const unoffered = data.boons.find((b) => !offeredOptions.includes(b.id))!.id;
    let rejected = false;
    sim.events.on('command:rejected', (ev) => {
      if (ev.cmd === 'pickBoon') rejected = true;
    });
    sim.commands.enqueue({ type: 'pickBoon', boonId: unoffered });
    sim.tick();
    expect(rejected).toBe(true);
    expect(sim.buildSnapshot(1, false).pendingBoonOffer).not.toBeNull();

    // Picking a valid offered boonId activates it immediately and clears pendingBoonOffer
    const chosenBoon = offeredOptions[0]!;
    let pickedEventName = '';
    sim.events.on('boon:picked', (ev) => {
      pickedEventName = ev.name;
    });
    sim.commands.enqueue({ type: 'pickBoon', boonId: chosenBoon });
    sim.tick();

    const snapPicked = sim.buildSnapshot(1, false);
    expect(pickedEventName.length).toBeGreaterThan(0);
    expect(snapPicked.pendingBoonOffer).toBeNull();
    expect(snapPicked.activeBoons[chosenBoon]).toBe(1);
    expect(snapPicked.totalBoonStacks).toBe(1);

    // Verify 100% bit-exact 1x vs 3x determinism across boss skills + boon:offered + pickBoon + Wave 7 mutant
    const offerTick = sim.tickCount - 2;
    const replayCmds: readonly StampedCommand[] = [
      { tick: 0, command: { type: 'grantTestCoin', amount: 2500 } },
      { tick: 1, command: { type: 'summon' } },
      { tick: 1, command: { type: 'summon' } },
      { tick: 1, command: { type: 'summon' } },
      { tick: 2, command: { type: 'upgrade', group: 'orthodox' } },
      { tick: Math.max(10, offerTick), command: { type: 'autoArrange' } },
    ];

    const det1x = new Simulation(data, 0x51515151);
    det1x.scheduleCommandsForReplay(replayCmds);
    const det3x = new Simulation(data, 0x51515151);
    det3x.scheduleCommandsForReplay(replayCmds);

    // Give both identical Cheonma setup at tick 0 so they slay Wave 5 boss and pick options[1]!
    spawnCheonmaHelper(det1x);
    spawnCheonmaHelper(det3x);

    det1x.events.on('boon:offered', (ev) => {
      det1x.commands.enqueue({ type: 'pickBoon', boonId: ev.options[1]! });
    });
    det3x.events.on('boon:offered', (ev) => {
      det3x.commands.enqueue({ type: 'pickBoon', boonId: ev.options[1]! });
    });

    const runTicks = 4800; // Spans Waves 1..7 including Wave 5 Boss, pickBoon, and Wave 7 swift_raid mutant
    for (let t = 0; t < runTicks; t++) {
      det1x.tick();
    }
    for (let t = 0; t < runTicks; t += 3) {
      det3x.tick();
      det3x.tick();
      det3x.tick();
    }

    expect(det1x.buildSnapshot(1, false).totalBoonStacks).toBeGreaterThanOrEqual(1);
    expect(det3x.hashState()).toBe(det1x.hashState());
  });
});

function spawnCheonmaHelper(sim: Simulation): void {
  const murimSubs: readonly { readonly grade: string; readonly unitId: string }[] = [
    { grade: 'rare', unitId: 'gaebang_elder' },
    { grade: 'rare', unitId: 'gaebang_elder' },
    { grade: 'uncommon', unitId: 'namgung_thunder' },
    { grade: 'uncommon', unitId: 'shaolin_monk' },
    { grade: 'common', unitId: 'mudang_disciple' },
  ];
  for (const item of murimSubs) {
    sim.commands.enqueue({ type: 'grantTestResource', wispGrade: item.grade });
    sim.commands.enqueue({ type: 'useWisp', grade: item.grade, unitId: item.unitId });
  }
  sim.tick();
  sim.commands.enqueue({ type: 'craft', recipeId: 'r_murim_lord', chain: true });
  sim.tick();

  const cheonmaSubs: readonly { readonly grade: string; readonly unitId: string }[] = [
    { grade: 'rare', unitId: 'nokrim_chief' },
    { grade: 'uncommon', unitId: 'poison_healer' },
    { grade: 'common', unitId: 'tang_assassin' },
    { grade: 'rare', unitId: 'nokrim_chief' },
    { grade: 'uncommon', unitId: 'blood_blade' },
    { grade: 'common', unitId: 'haomun_ronin' },
    { grade: 'rare', unitId: 'cult_elder' },
    { grade: 'uncommon', unitId: 'black_wind' },
    { grade: 'common', unitId: 'cult_initiate' },
    { grade: 'rare', unitId: 'cult_elder' },
    { grade: 'uncommon', unitId: 'cult_protector' },
    { grade: 'common', unitId: 'bone_fiend' },
  ];
  for (const item of cheonmaSubs) {
    sim.commands.enqueue({ type: 'grantTestResource', wispGrade: item.grade });
    sim.commands.enqueue({ type: 'useWisp', grade: item.grade, unitId: item.unitId });
  }
  sim.tick();
  sim.commands.enqueue({ type: 'craft', recipeId: 'r_cheonma', chain: true });
  sim.tick();
}


