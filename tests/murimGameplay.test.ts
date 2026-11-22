import { describe, expect, it } from 'vitest';
import atlasRaw from '../public/assets/sprites_atlas.json';
import type { StampedCommand } from '../src/core/CommandQueue';
import {
  ASCENSION_MAX_LEVEL,
  CODEX_MILESTONES,
  computeRelicSetBonuses,
  computeRelicSetStatuses,
  DIFFICULTY_CONFIGS,
  DIFFICULTY_ORDER,
  getBlessedEffectiveRelicLevel,
  getUnitSellLuckRefund,
  RELIC_EFFECTIVE_MAX_LEVEL,
  RELIC_MAX_LEVEL,
  RELIC_SETS,
  SOUL_SLOT_COUNT,
  TITLE_DEFS,
  TRIAL_CONFIGS,
} from '../src/core/relicFormulas';
import {
  HAZARD_WARNING_TICKS,
  Simulation,
  getWaveMutantKind,
} from '../src/core/Simulation';
import { loadGameData } from '../src/data/loader';
import {
  BOSS_RUSH_TARGET_STAGE,
  CHRONICLE_CHAPTERS,
  COMMAND_SKILLS,
  ENDLESS_MILESTONES,
  getDailyChallengeSpec,
  MAX_ARMAMENT_TEMPER,
  SPIRIT_TILE_WIND_RANGE_BONUS,
  TACTICAL_QI_INITIAL,
} from '../src/data/specialModes';
import type { BoonId, MonsterKind, PassiveProcKind, RelicId, TrialId } from '../src/data/types';
import { DISCARD_DROP_RECT, isPointInDiscardZone } from '../src/input/DragController';
import { pickDailyQuestsForDate } from '../src/platform/DailyQuests';
import {
  BACKUP_CODE_PREFIX,
  DEFAULT_COURT_SKIN_ID,
  MetaStore,
  RUN_STORAGE_KEY,
  SKIN_MULTI5_GOLD_COST,
  SKIN_SINGLE_GOLD_COST,
  getSkinDuplicateSilk,
  type StorageLike,
} from '../src/platform/MetaStore';
import { migrateRunSave, RUN_SAVE_SCHEMA_VERSION } from '../src/platform/SaveMigration';
import { HapticsController } from '../src/platform/Haptics';
import { SoundSynthesizer } from '../src/platform/SoundSynthesizer';
import {
  UNIT_COMBAT_PROFILES,
  getUnitCombatProfile,
  type WeaponMotionStyle,
} from '../src/render/weaponProfiles';
import { computeWaveHpScale, resolveTargetBossName, resolveWaveDef } from '../src/world/WaveSystem';

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

    // Step 3: Supply 마교 sub-materials and chain-craft 현경·신마 절대천마 (cheonma = heavenly_demon_heir + sword_demon + cult_elder)!
    const grantWisp = (grade: string, unitId: string): void => {
      sim.commands.enqueue({ type: 'grantTestResource', wispGrade: grade });
      sim.commands.enqueue({ type: 'useWisp', grade, unitId });
    };
    const grantLeavesFor = (recipeId: string): void => {
      const leaves = sim.recipeGraph.leafCost.get(recipeId)!;
      for (const [uid, cnt] of leaves) {
        for (let i = 0; i < cnt; i++) {
          grantWisp('common', uid);
        }
      }
      sim.tick();
    };
    // Craft heavenly_demon_heir first via leaves, then provide materials to chain-craft sword_demon + cult_elder
    grantLeavesFor('r_heavenly_demon_heir');
    sim.commands.enqueue({ type: 'craft', recipeId: 'r_heavenly_demon_heir', chain: true });
    sim.tick();

    const cheonmaSubMaterials: readonly { readonly grade: string; readonly unitId: string }[] = [
      // sword_demon = cult_elder + black_wind + cult_initiate
      { grade: 'rare', unitId: 'cult_elder' },
      { grade: 'uncommon', unitId: 'black_wind' },
      { grade: 'common', unitId: 'cult_initiate' },
      // cult_elder directly
      { grade: 'rare', unitId: 'cult_elder' },
    ];
    for (const item of cheonmaSubMaterials) {
      grantWisp(item.grade, item.unitId);
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

  it('packs all 66 units and 6 monsters/bosses into a lossless WebP sprite atlas (AGENTS.md §6) plus validated skin catalog & 3 bespoke arena WebP maps', () => {
    const data = loadGameData();
    expect(data.units.length).toBe(66);
    expect(data.heroSkins.length).toBe(24);
    expect(data.courtSkins.length).toBe(11);

    const spriteFiles = Object.keys(import.meta.glob('../art/sprites_src/*.png'));
    const spriteSet = new Set(
      spriteFiles.map((p) => p.slice(p.lastIndexOf('/') + 1)),
    );

    const atlasFrames = atlasRaw.frames as Record<
      string,
      { readonly x: number; readonly y: number; w: number; h: number }
    >;

    for (const unit of data.units) {
      expect(spriteSet.has(`${unit.id}.png`), `missing unit source sprite: ${unit.id}.png`).toBe(
        true,
      );
      expect(atlasFrames[unit.id], `missing WebP atlas frame: ${unit.id}`).toBeDefined();
      expect(atlasFrames[unit.id]!.w).toBeGreaterThan(0);
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
      expect(atlasFrames[kind], `missing WebP atlas frame: ${kind}`).toBeDefined();
    }
    expect(spriteSet.size).toBe(72);
    expect(Object.keys(atlasFrames).length).toBe(72);

    const webpAtlasFiles = Object.keys(import.meta.glob('../public/assets/*.webp'));
    expect(webpAtlasFiles.some((p) => p.endsWith('/sprites_atlas.webp'))).toBe(true);

    const bgFiles = Object.keys(import.meta.glob('../public/bg/*.png'));
    expect(bgFiles.some((p) => p.endsWith('/murim_arena_bg.png'))).toBe(true);
    const bgWebpFiles = Object.keys(import.meta.glob('../public/bg/*.webp'));
    expect(bgWebpFiles.some((p) => p.endsWith('/bg_celestial_peak.webp'))).toBe(true);
    expect(bgWebpFiles.some((p) => p.endsWith('/bg_nether_abyss.webp'))).toBe(true);
    expect(bgWebpFiles.some((p) => p.endsWith('/bg_primordial_cosmos.webp'))).toBe(true);
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
    const commonStarter = data.gradesById.get('common')?.starterWispCount ?? 0;
    const uncommonStarter = data.gradesById.get('uncommon')?.starterWispCount ?? 0;
    expect(snap0.coin).toBe(data.board.economy.initialCoin + 100);
    expect(snap0.wisps.common).toBe(commonStarter + 1);
    expect(snap0.wisps.uncommon).toBe(uncommonStarter + 1);

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
    expect(escapedStolen).toBe(
      Math.min(100, Math.min(coinAtEscapeTick, Math.max(30, Math.floor(coinAtEscapeTick * 0.15)))),
    );
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
    sim.commands.enqueue({ type: 'grantTestCoin', amount: 900 });
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

    const wave1Hp = data.waves[0]!.monsterHp;
    expect(simNormal.getMonsters()[0]?.maxHp).toBe(
      Math.round(wave1Hp * DIFFICULTY_CONFIGS.normal.hpMult),
    );
    expect(simHard.getMonsters()[0]?.maxHp).toBe(
      Math.round(wave1Hp * DIFFICULTY_CONFIGS.hard.hpMult),
    );
    expect(simHell.getMonsters()[0]?.maxHp).toBe(
      Math.round(wave1Hp * DIFFICULTY_CONFIGS.hell.hpMult),
    );

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
    expect(clearSettlement.firstClearBonusGold).toBe(DIFFICULTY_CONFIGS.normal.firstClearGold);
    expect(clearSettlement.firstClearBonusKeys).toBe(DIFFICULTY_CONFIGS.normal.firstClearKeys);
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

    // 1. Craft r_sword_saint -> chain-craft r_sword_immortal (sword_saint + hwasan_master + plum_elder)
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
      // hwasan_master = plum_elder + plum_swordsman + hwasan_novice
      { grade: 'rare', unitId: 'plum_elder' },
      { grade: 'uncommon', unitId: 'plum_swordsman' },
      { grade: 'common', unitId: 'hwasan_novice' },
      // plum_elder directly
      { grade: 'rare', unitId: 'plum_elder' },
    ]);
    expect(sim.buildSnapshot(1, false).craft.recipes['r_sword_immortal']?.lamp).toBe('chainReady');
    sim.commands.enqueue({ type: 'craft', recipeId: 'r_sword_immortal', chain: true });
    sim.tick();

    // 2. Craft r_mad_demon (blood_demon + tang_elder + blood_blade) -> chain-craft r_asura_emperor (mad_demon + blood_demon + nokrim_chief)
    grantWispUnits([
      // blood_demon = nokrim_chief + blood_blade + haomun_ronin
      { grade: 'rare', unitId: 'nokrim_chief' },
      { grade: 'uncommon', unitId: 'blood_blade' },
      { grade: 'common', unitId: 'haomun_ronin' },
      // tang_elder + blood_blade directly
      { grade: 'rare', unitId: 'tang_elder' },
      { grade: 'uncommon', unitId: 'blood_blade' },
    ]);
    sim.commands.enqueue({ type: 'craft', recipeId: 'r_mad_demon', chain: true });
    sim.tick();

    grantWispUnits([
      // blood_demon = nokrim_chief + blood_blade + haomun_ronin
      { grade: 'rare', unitId: 'nokrim_chief' },
      { grade: 'uncommon', unitId: 'blood_blade' },
      { grade: 'common', unitId: 'haomun_ronin' },
      // nokrim_chief directly
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
    const simNormalWave1 = new Simulation(data, 0x99112233, undefined, 'normal');
    const sim = new Simulation(data, 0x99112233, undefined, 'hard');

    // Wave 1 regular monsters have 0 armor on Normal and floor(armorBonus * 0.5) on Hard
    for (let t = 0; t < 45; t++) {
      simNormalWave1.tick();
      sim.tick();
    }
    expect(simNormalWave1.getMonsters()[0]?.armor).toBe(0);
    expect(sim.getMonsters().length).toBeGreaterThan(0);
    expect(sim.getMonsters()[0]?.armor).toBe(Math.floor(DIFFICULTY_CONFIGS.hard.armorBonus * 0.5));

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
    expect(data.boons.length).toBe(18);
    const uniqueIcons = new Set(data.boons.map((b) => b.iconKind));
    expect(uniqueIcons.size).toBe(18);

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

  it('maps all 66 Murim heroes 1:1 across 10 weapon motion archetypes and emits directional monster:hit origin telemetry deterministically', () => {
    const data = loadGameData();
    expect(data.units.length).toBe(66);

    const seenStyles = new Set<WeaponMotionStyle>();
    for (const unit of data.units) {
      const explicit = UNIT_COMBAT_PROFILES[unit.id];
      expect(explicit, `Missing UNIT_COMBAT_PROFILES entry for ${unit.id}`).toBeDefined();
      const profile = getUnitCombatProfile(unit.id);
      expect(profile.weaponLabel.trim().length).toBeGreaterThan(0);
      expect(profile.primary).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(profile.secondary).toMatch(/^#[0-9a-fA-F]{6}$/);
      seenStyles.add(profile.style);
    }

    // All 10 distinct weapon motion archetypes must be represented in the 44-hero roster
    expect(seenStyles.size).toBe(10);
    expect(getUnitCombatProfile('ice_palace_empress').style).toBe('fan');
    expect(getUnitCombatProfile('blood_shadow_sovereign').style).toBe('dual_sword');
    expect(getUnitCombatProfile('wuji_grandmaster').style).toBe('sword');
    expect(getUnitCombatProfile('blood_acolyte').style).toBe('dagger_hidden');
    expect(getUnitCombatProfile('nether_blade_queen').style).toBe('sorcery_qi');
    expect(getUnitCombatProfile('tang_patriarch').style).toBe('fan');
    expect(getUnitCombatProfile('tang_patriarch').weaponLabel).toContain('부채');
    expect(getUnitCombatProfile('thousand_venom_lord').style).toBe('fan');
    expect(getUnitCombatProfile('thousand_venom_lord').weaponLabel).toContain('부채');
    expect(getUnitCombatProfile('tang_elder').style).toBe('dagger_hidden');
    expect(getUnitCombatProfile('blood_bishop').style).toBe('spear_staff');
    expect(getUnitCombatProfile('poison_dragon').style).toBe('dagger_hidden');
    expect(getUnitCombatProfile('heavenly_demon_heir').style).toBe('sword');
    expect(getUnitCombatProfile('thunder_emperor').style).toBe('dual_sword');
    expect(getUnitCombatProfile('hell_flame_sovereign').style).toBe('sorcery_qi');
    expect(getUnitCombatProfile('tang_assassin').style).toBe('dagger_hidden');
    expect(getUnitCombatProfile('poison_healer').style).toBe('staff_gourd');
    expect(getUnitCombatProfile('shaolin_novice').style).toBe('spear_staff');
    expect(getUnitCombatProfile('gaebang_beggar').style).toBe('spear_staff');
    expect(getUnitCombatProfile('bone_fiend').style).toBe('spear_staff');
    expect(getUnitCombatProfile('shaolin_monk').style).toBe('palm_fist');
    expect(getUnitCombatProfile('cult_protector').style).toBe('palm_fist');
    expect(getUnitCombatProfile('mad_demon').style).toBe('palm_fist');
    expect(getUnitCombatProfile('gaebang_elder').style).toBe('dual_sword');
    expect(getUnitCombatProfile('black_wind').style).toBe('dual_sword');
    expect(getUnitCombatProfile('sword_demon').style).toBe('dual_sword');
    expect(getUnitCombatProfile('sword_saint').style).toBe('flying_sword');
    expect(getUnitCombatProfile('sword_immortal').style).toBe('flying_sword');
    expect(getUnitCombatProfile('cult_elder').style).toBe('sorcery_qi');
    expect(getUnitCombatProfile('flame_demon').style).toBe('sorcery_qi');

    // Chain-craft tang_patriarch (사천당가 당문주) onto field[0] and verify monster:hit emits exact tile origin (fromX, fromY)
    const simA = new Simulation(data, 0x2468ace0);
    const simB = new Simulation(data, 0x2468ace0);
    const tangLeaves = simA.recipeGraph.leafCost.get('r_tang_patriarch')!;
    for (const [unitId, count] of tangLeaves) {
      for (let i = 0; i < count; i++) {
        simA.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
        simA.commands.enqueue({ type: 'useWisp', grade: 'common', unitId });
        simB.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
        simB.commands.enqueue({ type: 'useWisp', grade: 'common', unitId });
      }
    }
    simA.tick();
    simB.tick();
    simA.commands.enqueue({ type: 'craft', recipeId: 'r_tang_patriarch', chain: true });
    simB.commands.enqueue({ type: 'craft', recipeId: 'r_tang_patriarch', chain: true });
    simA.tick();
    simB.tick();

    const tangSlotIndex = simA
      .buildSnapshot(1, false)
      .field.findIndex((s) => s?.unitId === 'tang_patriarch');
    expect(tangSlotIndex).toBeGreaterThanOrEqual(0);
    const fGrid = data.board.field;
    const tangCol = tangSlotIndex % fGrid.cols;
    const tangRow = Math.floor(tangSlotIndex / fGrid.cols);
    const expectedTile = {
      x: fGrid.originX + tangCol * (fGrid.cellW + fGrid.gapX) + fGrid.cellW * 0.5,
      y: fGrid.originY + tangRow * (fGrid.cellH + fGrid.gapY) + fGrid.cellH * 0.5 - 8,
    };

    const hits: { unitId: string; fromX: number; fromY: number; x: number; y: number }[] = [];
    let poisonRainCast = false;
    simA.events.on('monster:hit', (ev) => {
      hits.push({
        unitId: ev.unitId,
        fromX: ev.fromX,
        fromY: ev.fromY,
        x: ev.x,
        y: ev.y,
      });
    });
    simA.events.on('skill:impact', (ev) => {
      if (ev.unitId === 'tang_patriarch' && ev.vfxTrack === 'poison_rain') {
        poisonRainCast = true;
      }
    });

    for (let t = 0; t < 240; t++) {
      simA.tick();
      simB.tick();
    }

    expect(hits.length).toBeGreaterThanOrEqual(3);
    expect(poisonRainCast).toBe(true);
    for (const h of hits) {
      expect(h.unitId).toBe('tang_patriarch');
      expect(Number.isFinite(h.fromX)).toBe(true);
      expect(Number.isFinite(h.fromY)).toBe(true);
      expect(h.fromX).toBe(expectedTile.x);
      expect(h.fromY).toBe(expectedTile.y);
      expect(Math.hypot(h.x - h.fromX, h.y - h.fromY)).toBeGreaterThan(0);
    }
    // Listening to monster:hit telemetry must have zero side-effect on simulation state hash
    expect(simA.hashState()).toBe(simB.hashState());

    // SoundSynthesizer safely accepts optional weaponStyle across all 10 archetypes when muted/headless
    const synth = new SoundSynthesizer();
    for (const style of seenStyles) {
      expect(() => synth.playHit('orthodox', false, false, style)).not.toThrow();
      expect(() => synth.playHit('unorthodox', true, true, style)).not.toThrow();
      expect(() => synth.playHit('demonic', true, false, style)).not.toThrow();
    }
  });

  it('supports ×3 same-leaf promotions, alternate pivot routes, and chain synthesis of all 3 new hidden Immortals (만독신군·남궁뇌제·구천염황)', () => {
    const data = loadGameData();
    const sim = new Simulation(data, 0x33557799);

    const grantLeavesFor = (recipeId: string): void => {
      const leaves = sim.recipeGraph.leafCost.get(recipeId);
      expect(leaves, `Missing leafCost for ${recipeId}`).toBeDefined();
      for (const [unitId, count] of leaves!) {
        for (let i = 0; i < count; i++) {
          sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
          sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId });
        }
      }
      sim.tick();
    };

    // 1. ×3 same-leaf promotion: 3x hwasan_novice -> plum_swordsman
    for (let i = 0; i < 3; i++) {
      sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
      sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'hwasan_novice' });
    }
    sim.tick();
    expect(sim.buildSnapshot(1, false).craft.recipes['r_3x_hwasan_novice']?.lamp).toBe('ready');
    sim.commands.enqueue({ type: 'craft', recipeId: 'r_3x_hwasan_novice', chain: false });
    sim.tick();

    // 2. Alternate pivot route: plum_swordsman x2 + mudang_disciple x1 -> plum_elder (r_alt_plum_elder)
    sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'uncommon' });
    sim.commands.enqueue({ type: 'useWisp', grade: 'uncommon', unitId: 'plum_swordsman' });
    sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
    sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'mudang_disciple' });
    sim.tick();
    expect(sim.buildSnapshot(1, false).craft.recipes['r_alt_plum_elder']?.lamp).toBe('ready');
    sim.commands.enqueue({ type: 'craft', recipeId: 'r_alt_plum_elder', chain: false });
    sim.tick();

    const snapAfterAlt = sim.buildSnapshot(1, false);
    const allSlotsAfterAlt = [...snapAfterAlt.field, ...snapAfterAlt.bench];
    expect(allSlotsAfterAlt.some((u) => u?.unitId === 'plum_elder')).toBe(true);

    // 3. Chain-craft all 3 new hidden Immortals via symmetric 3-ingredient sub-recipes (1 Tx + 1 Leg + 1 Rare)
    const craftSub = (recipeId: string): void => {
      grantLeavesFor(recipeId);
      sim.commands.enqueue({ type: 'craft', recipeId, chain: true });
      sim.tick();
    };

    // thousand_venom_lord = poison_dragon + tang_patriarch + tang_elder
    craftSub('r_poison_dragon');
    craftSub('r_tang_patriarch');
    craftSub('r_tang_elder');
    expect(sim.buildSnapshot(1, false).craft.recipes['r_thousand_venom_lord']?.lamp).toBe('ready');
    sim.commands.enqueue({ type: 'craft', recipeId: 'r_thousand_venom_lord', chain: false });
    sim.tick();

    // thunder_emperor = murim_lord + mudang_master + plum_elder
    craftSub('r_murim_lord');
    craftSub('r_mudang_master');
    craftSub('r_plum_elder');
    expect(sim.buildSnapshot(1, false).craft.recipes['r_thunder_emperor']?.lamp).toBe('ready');
    sim.commands.enqueue({ type: 'craft', recipeId: 'r_thunder_emperor', chain: false });
    sim.tick();

    // hell_flame_sovereign = nether_blade_queen + flame_demon + cult_elder
    craftSub('r_nether_blade_queen');
    craftSub('r_flame_demon');
    craftSub('r_cult_elder');
    expect(sim.buildSnapshot(1, false).craft.recipes['r_hell_flame_sovereign']?.lamp).toBe('ready');
    sim.commands.enqueue({ type: 'craft', recipeId: 'r_hell_flame_sovereign', chain: false });
    sim.tick();

    const finalOwned = [...sim.buildSnapshot(1, false).field, ...sim.buildSnapshot(1, false).bench]
      .filter((u): u is NonNullable<typeof u> => u !== null)
      .map((u) => u.unitId);
    expect(finalOwned).toContain('thousand_venom_lord');
    expect(finalOwned).toContain('thunder_emperor');
    expect(finalOwned).toContain('hell_flame_sovereign');
  });

  it('refunds grade-scaled 영단 on sell, validates non-overlapping DISCARD_DROP_RECT geometry, and cleans up only unlocked bench common units via sellSurplusCommon', () => {
    const data = loadGameData();
    const sim = new Simulation(data, 0x99887766);

    // 1. Verify data-driven grade-scaled elixir refund table (no hardcoded grade numbers)
    expect(getUnitSellLuckRefund(data.gradesById.get('common'))).toEqual({
      guaranteedLuck: 0,
      chancePct: 0,
    });
    expect(getUnitSellLuckRefund(data.gradesById.get('uncommon'))).toEqual({
      guaranteedLuck: 0,
      chancePct: 35,
    });
    expect(getUnitSellLuckRefund(data.gradesById.get('rare'))).toEqual({
      guaranteedLuck: 1,
      chancePct: 0,
    });
    expect(getUnitSellLuckRefund(data.gradesById.get('legendary'))).toEqual({
      guaranteedLuck: 2,
      chancePct: 0,
    });
    expect(getUnitSellLuckRefund(data.gradesById.get('transcendent'))).toEqual({
      guaranteedLuck: 4,
      chancePct: 0,
    });
    expect(getUnitSellLuckRefund(data.gradesById.get('immortal'))).toEqual({
      guaranteedLuck: 7,
      chancePct: 0,
    });

    // 2. Verify DISCARD_DROP_RECT strictly sits between monster corridor (y=652) & bench header (y=715)
    //    with zero overlap against all 18 field cells and 12 bench cells
    expect(isPointInDiscardZone(360, 684)).toBe(true);
    expect(DISCARD_DROP_RECT.y).toBeGreaterThan(652);
    expect(DISCARD_DROP_RECT.y + DISCARD_DROP_RECT.h).toBeLessThan(715);

    const f = data.board.field;
    for (let idx = 0; idx < f.cols * f.rows; idx++) {
      const col = idx % f.cols;
      const row = Math.floor(idx / f.cols);
      const cx = f.originX + col * (f.cellW + f.gapX) + f.cellW * 0.5;
      const cy = f.originY + row * (f.cellH + f.gapY) + f.cellH * 0.5;
      expect(isPointInDiscardZone(cx, cy)).toBe(false);
    }
    const b = data.board.bench;
    for (let idx = 0; idx < b.cols * b.rows; idx++) {
      const col = idx % b.cols;
      const row = Math.floor(idx / b.cols);
      const cx = b.originX + col * (b.cellW + b.gapX) + b.cellW * 0.5;
      const cy = b.originY + row * (b.cellH + b.gapY) + b.cellH * 0.5;
      expect(isPointInDiscardZone(cx, cy)).toBe(false);
    }

    // 3. Sell a rare unit (plum_elder) and verify guaranteed +1 영단 + coin refund + unit:sold event
    sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'rare' });
    sim.commands.enqueue({ type: 'useWisp', grade: 'rare', unitId: 'plum_elder' });
    sim.tick();

    const snapBeforeSell = sim.buildSnapshot(1, false);
    const rareSlot = snapBeforeSell.field.find((u) => u?.unitId === 'plum_elder')!;
    expect(rareSlot).toBeDefined();
    expect(rareSlot.sellLuck).toBe(1);

    const soldEvents: { coinEarned: number; luckEarned: number }[] = [];
    sim.events.on('unit:sold', (ev) => {
      soldEvents.push({ coinEarned: ev.coinEarned, luckEarned: ev.luckEarned });
    });

    const coinBefore = snapBeforeSell.coin;
    const luckBefore = snapBeforeSell.luckStone;
    sim.commands.enqueue({ type: 'sell', uid: rareSlot.uid });
    sim.tick();

    const snapAfterSell = sim.buildSnapshot(1, false);
    expect(soldEvents).toHaveLength(1);
    expect(soldEvents[0]?.luckEarned).toBe(1);
    expect(snapAfterSell.luckStone).toBe(luckBefore + 1);
    expect(snapAfterSell.coin).toBe(coinBefore + rareSlot.sellCoin);

    // 4. Bulk bench cleanup (sellSurplusCommon):
    //    Place 1 common on field[0], 2 unlocked commons on bench[0..1], 1 locked common on bench[2], 1 uncommon on bench[3]
    for (let i = 0; i < 4; i++) {
      sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
      sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'hwasan_novice' });
    }
    sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'uncommon' });
    sim.commands.enqueue({ type: 'useWisp', grade: 'uncommon', unitId: 'plum_swordsman' });
    sim.tick();

    // Move field[1..3] (3 commons) & field[4] (uncommon) onto bench[0..3], lock bench[2]
    sim.commands.enqueue({ type: 'move', from: { area: 'field', index: 1 }, to: { area: 'bench', index: 0 } });
    sim.commands.enqueue({ type: 'move', from: { area: 'field', index: 2 }, to: { area: 'bench', index: 1 } });
    sim.commands.enqueue({ type: 'move', from: { area: 'field', index: 3 }, to: { area: 'bench', index: 2 } });
    sim.commands.enqueue({ type: 'move', from: { area: 'field', index: 4 }, to: { area: 'bench', index: 3 } });
    sim.tick();

    const lockedBenchUid = sim.buildSnapshot(1, false).bench[2]!.uid;
    sim.commands.enqueue({ type: 'lock', uid: lockedBenchUid, locked: true });
    sim.tick();

    const snapPreBulk = sim.buildSnapshot(1, false);
    expect(snapPreBulk.benchSurplusCommonCount).toBe(2);

    let bulkResult: { count: number; coinEarned: number } | null = null;
    sim.events.on('units:bulk_sold', (ev) => {
      bulkResult = { count: ev.count, coinEarned: ev.coinEarned };
    });

    sim.commands.enqueue({ type: 'sellSurplusCommon' });
    sim.tick();

    const snapPostBulk = sim.buildSnapshot(1, false);
    expect(bulkResult).toEqual({ count: 2, coinEarned: 20 });
    expect(snapPostBulk.benchSurplusCommonCount).toBe(0);
    // Field common (field[0]), locked bench common (bench[2]), and bench uncommon (bench[3]) must remain intact!
    expect(snapPostBulk.field[0]?.unitId).toBe('hwasan_novice');
    expect(snapPostBulk.bench[0]).toBeNull();
    expect(snapPostBulk.bench[1]).toBeNull();
    expect(snapPostBulk.bench[2]?.uid).toBe(lockedBenchUid);
    expect(snapPostBulk.bench[3]?.unitId).toBe('plum_swordsman');
  });

  it('persists & restores mid-run auto-saves with bit-exact deterministic state hashes and exports/imports tamper-checked MRD1- backup codes', () => {
    const storeMap = new Map<string, string>();
    const memStorage: StorageLike = {
      getItem: (k) => storeMap.get(k) ?? null,
      setItem: (k, v) => {
        storeMap.set(k, v);
      },
      removeItem: (k) => {
        storeMap.delete(k);
      },
    };

    const data = loadGameData();
    const metaA = new MetaStore(memStorage);
    metaA.grantDevMeta(1200, 5, 220);
    const drawRes = metaA.drawRelic(data.relics, 'key', () => 0.25);
    expect(drawRes.ok).toBe(true);
    metaA.discoverUnit(data.unitsById.get('cheonma')!, data.gradesById.get('immortal')!);

    // Run live simulation for 320 ticks with summons, upgrades, moves, and active combat
    const liveSim = new Simulation(data, 0x51525354, metaA.getRelicLevels(), 'normal', null);
    liveSim.commands.enqueue({ type: 'summon' });
    liveSim.commands.enqueue({ type: 'summon' });
    liveSim.commands.enqueue({ type: 'summon' });
    liveSim.commands.enqueue({ type: 'upgrade', group: 'orthodox' });
    for (let t = 0; t < 320; t++) {
      liveSim.tick();
    }

    // Export mid-run snapshot -> persist via MetaStore -> reload into fresh Simulation
    const savedRun = liveSim.exportRunSave(1700000000000);
    expect(savedRun.version).toBe(RUN_SAVE_SCHEMA_VERSION);
    expect(savedRun.savedAtMs).toBe(1700000000000);
    metaA.saveActiveRun(savedRun);

    const loadedRun = metaA.loadActiveRun();
    expect(loadedRun).not.toBeNull();
    expect(loadedRun?.currentTick).toBe(320);

    const resumedSim = new Simulation(data, 0x11111111, metaA.getRelicLevels(), 'normal', null);
    expect(resumedSim.restoreRunSave(loadedRun!)).toBe(true);
    expect(resumedSim.hashState()).toBe(liveSim.hashState());

    // Advance both original and restored simulations 400 more ticks with identical commands -> bit-exact!
    liveSim.commands.enqueue({ type: 'summon' });
    resumedSim.commands.enqueue({ type: 'summon' });
    for (let t = 0; t < 400; t++) {
      liveSim.tick();
      resumedSim.tick();
    }
    expect(resumedSim.hashState()).toBe(liveSim.hashState());

    // Settlement automatically clears active run save
    metaA.settleRun({
      wave: 12,
      monstersSlain: 85,
      bossesSlain: 1,
      bountiesSlain: 1,
      difficulty: 'normal',
      victory: false,
    });
    expect(metaA.loadActiveRun()).toBeNull();

    // Permanent Backup Code export -> import into brand-new storage & tamper rejection
    const backupCode = metaA.exportBackupCode();
    expect(backupCode.startsWith(BACKUP_CODE_PREFIX)).toBe(true);

    const freshMap = new Map<string, string>();
    const freshStorage: StorageLike = {
      getItem: (k) => freshMap.get(k) ?? null,
      setItem: (k, v) => {
        freshMap.set(k, v);
      },
      removeItem: (k) => {
        freshMap.delete(k);
      },
    };
    const metaB = new MetaStore(freshStorage);
    // Tampered character must fail FNV-1a integrity check
    const tampered = `${backupCode.slice(0, -2)}${backupCode.endsWith('A') ? 'B' : 'A'}`;
    expect(metaB.importBackupCode(tampered).ok).toBe(false);

    const importOk = metaB.importBackupCode(`  ${backupCode}  `);
    expect(importOk.ok).toBe(true);
    expect(metaB.getProfile().gold).toBe(metaA.getProfile().gold);
    expect(metaB.getProfile().keys).toBe(metaA.getProfile().keys);
    expect(metaB.getProfile().silk).toBe(metaA.getProfile().silk);
    expect(metaB.getProfile().bestWave).toBe(metaA.getProfile().bestWave);
    expect(metaB.getProfile().discoveredUnits.cheonma).toBe(true);
    expect(metaB.getRelicLevels()).toEqual(metaA.getRelicLevels());
  });

  it('applies 무림 비경 Secret Realm modifiers (0% interest, +armor/+gamble, +12 shred, boosted 삼재합진) and awards first-clear silk + gold + keys once', () => {
    const data = loadGameData();

    // 1. 검총비경 (trial_sword_tomb): targetWave = 15 & golden_vault interest strictly sealed to 0
    const swordTombSim = new Simulation(
      data,
      0x10203040,
      { golden_vault: 8 },
      'normal',
      'trial_sword_tomb',
    );
    const snapTomb0 = swordTombSim.buildSnapshot(1, false);
    expect(snapTomb0.clearTargetWave).toBe(15);
    expect(snapTomb0.trialId).toBe('trial_sword_tomb');
    expect(snapTomb0.relicBonus.interestPct).toBe(0);

    // 2. 철혈비경 (trial_crimson_iron): +15% gambleBonusPct & bonus monster armor on spawn
    const stdSim = new Simulation(data, 0x10203040, {}, 'normal', null);
    const ironSim = new Simulation(data, 0x10203040, {}, 'normal', 'trial_crimson_iron');
    expect(ironSim.buildSnapshot(1, false).relicBonus.gambleBonusPct).toBe(
      stdSim.buildSnapshot(1, false).relicBonus.gambleBonusPct +
        TRIAL_CONFIGS.trial_crimson_iron.gambleBonusPct,
    );
    for (let t = 0; t < 40; t++) {
      stdSim.tick();
      ironSim.tick();
    }
    const stdMob = stdSim.exportRunSave().monsters[0]!;
    const ironMob = ironSim.exportRunSave().monsters[0]!;
    expect(ironMob.armor).toBe(stdMob.armor + TRIAL_CONFIGS.trial_crimson_iron.bonusMonsterArmor);

    // 3. 만독비경 (trial_venom_gale): Unorthodox hero gains +12 bonus armorShred
    const venomSim = new Simulation(data, 0x10203040, {}, 'normal', 'trial_venom_gale');
    venomSim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
    venomSim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'tang_assassin' });
    stdSim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
    stdSim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'tang_assassin' });
    venomSim.tick();
    stdSim.tick();
    const venomTang = venomSim.buildSnapshot(1, false).field.find((u) => u?.unitId === 'tang_assassin')!;
    const stdTang = stdSim.buildSnapshot(1, false).field.find((u) => u?.unitId === 'tang_assassin')!;
    expect(venomTang.armorShred).toBe(
      stdTang.armorShred + TRIAL_CONFIGS.trial_venom_gale.unorthodoxBonusShred,
    );

    // 4. 삼재비경 (trial_chaos_trinity): 2 Orthodox + 2 Unorthodox + 2 Demonic activates boosted 삼재합진 (+130% vs +30%)
    const trinitySim = new Simulation(data, 0x44556677, {}, 'normal', 'trial_chaos_trinity');
    const baseTrinitySim = new Simulation(data, 0x44556677, {}, 'normal', null);
    const sixRoster = [
      'hwasan_novice',
      'mudang_disciple',
      'tang_assassin',
      'nokrim_bandit',
      'cult_initiate',
      'bone_fiend',
    ] as const;
    for (const uid of sixRoster) {
      trinitySim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
      trinitySim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: uid });
      baseTrinitySim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
      baseTrinitySim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: uid });
    }
    trinitySim.tick();
    baseTrinitySim.tick();

    const triSnap = trinitySim.buildSnapshot(1, false);
    const baseTriSnap = baseTrinitySim.buildSnapshot(1, false);
    expect(triSnap.synergy.trinityActive).toBe(true);
    expect(triSnap.field[0]!.bonusAtk).toBeGreaterThan(baseTriSnap.field[0]!.bonusAtk);

    // 5. MetaStore first-clear rewards for trial_venom_gale (Wave 15 clear) -> grants firstClearGold + firstClearKeys + firstClearSilk once
    const meta = new MetaStore(null);
    const silkBefore = meta.getProfile().silk;
    const rec1 = meta.settleRun({
      wave: 15,
      monstersSlain: 180,
      bossesSlain: 2,
      bountiesSlain: 1,
      difficulty: 'normal',
      trialId: 'trial_venom_gale',
      victory: true,
    });
    expect(rec1.clearedWaves).toBe(15);
    expect(rec1.firstClearBonusGold).toBe(TRIAL_CONFIGS.trial_venom_gale.firstClearGold);
    expect(rec1.firstClearBonusKeys).toBe(TRIAL_CONFIGS.trial_venom_gale.firstClearKeys);
    expect(rec1.firstClearBonusSilk).toBe(TRIAL_CONFIGS.trial_venom_gale.firstClearSilk);
    expect(meta.getProfile().silk).toBe(silkBefore + TRIAL_CONFIGS.trial_venom_gale.firstClearSilk);
    expect(meta.getProfile().clearedTrials.trial_venom_gale).toBe(true);
    expect(meta.getProfile().clearedTrialCount).toBe(1);

    // Second clear of the same trial must not grant duplicate first-clear bonuses
    const rec2 = meta.settleRun({
      wave: 15,
      monstersSlain: 180,
      bossesSlain: 2,
      bountiesSlain: 1,
      difficulty: 'normal',
      trialId: 'trial_venom_gale',
      victory: true,
    });
    expect(rec2.firstClearBonusGold).toBe(0);
    expect(rec2.firstClearBonusKeys).toBe(0);
    expect(rec2.firstClearBonusSilk).toBe(0);
  });

  it('differentiates all 15 현경·신마 & 태고신화 (Immortal) heroes with distinct stat profiles and specialized passiveTrait combat mechanics', () => {
    const data = loadGameData();
    const immortals = data.units.filter((u) => u.grade === 'immortal');
    expect(immortals.length).toBe(15);

    // Every Immortal must have a unique base ATK, unique passiveTrait.id, and wide archetype spread (> 2.0x max/min ATK)
    const atks = immortals.map((u) => u.atk);
    const passiveIds = new Set(immortals.map((u) => u.passiveTrait?.id).filter(Boolean));
    expect(new Set(atks).size).toBe(15);
    expect(passiveIds.size).toBe(15);
    expect(Math.max(...atks) / Math.min(...atks)).toBeGreaterThan(2.0);

    // Verify SlotView exposes passiveTrait and sword_immortal's 70% armorPiercePct out-scales un-pierced armor reduction
    const simPierce = new Simulation(data, 0x12344321, {}, 'hell', 'trial_crimson_iron');
    // Craft sword_immortal onto field (symmetric 3-ingredient route: sword_saint + hwasan_master + plum_elder)
    const craftSub = (sim: Simulation, recipeId: string): void => {
      const leaves = sim.recipeGraph.leafCost.get(recipeId)!;
      for (const [unitId, count] of leaves) {
        for (let i = 0; i < count; i++) {
          sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
          sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId });
        }
      }
      sim.tick();
      sim.commands.enqueue({ type: 'craft', recipeId, chain: true });
      sim.tick();
    };
    craftSub(simPierce, 'r_sword_saint');
    craftSub(simPierce, 'r_hwasan_master');
    craftSub(simPierce, 'r_plum_elder');
    simPierce.commands.enqueue({ type: 'craft', recipeId: 'r_sword_immortal', chain: false });
    simPierce.tick();

    const immortalSlot = simPierce
      .buildSnapshot(1, false)
      .field.find((s) => s?.unitId === 'sword_immortal');
    expect(immortalSlot?.passiveTrait?.id).toBe('immortal_pierce');
    expect(immortalSlot?.passiveTrait?.armorPiercePct).toBe(0.7);

    // Let sword_immortal strike heavily armored Crimson Iron Hell monsters and verify damage exceeds un-pierced formula!
    let hitObserved = 0;
    let pierceProcSeen = false;
    simPierce.events.on('monster:hit', (ev) => {
      if (ev.unitId === 'sword_immortal') {
        if (ev.passiveProc === 'pierce') pierceProcSeen = true;
        if (!ev.isCrit && !ev.isSkill && hitObserved === 0) {
          hitObserved = ev.damage;
        }
      }
    });
    for (let t = 0; t < 180 && hitObserved === 0; t++) {
      simPierce.tick();
    }
    const atkStats = simPierce.getUnitEffectiveAtk('sword_immortal');
    const baseAtk = atkStats.baseAtk + atkStats.bonusAtk;
    const wave1HeavyArmor = simPierce.computeMonsterArmor(1, false, false);
    const unpiercedExpected = Math.round(baseAtk * (100 / (100 + wave1HeavyArmor)));
    expect(wave1HeavyArmor).toBeGreaterThan(25);
    expect(hitObserved).toBeGreaterThan(unpiercedExpected);
    expect(pierceProcSeen).toBe(true);
  });

  it('migrates legacy v1 RunSaveData to v2 cleanly and surfaces non-silent Korean discardedReason on incompatible saves', () => {
    const data = loadGameData();
    const sim = new Simulation(data, 0x22446688);
    sim.commands.enqueue({ type: 'summon' });
    sim.tick();

    const v2Save = sim.exportRunSave(1700001234567);
    // Construct a legacy v1 save payload with appliedStartCommonWisp / appliedStartUncommonWisp
    const legacyV1Raw: Record<string, unknown> = {
      ...v2Save,
      version: 1,
      appliedStartCommonWisp: 2,
      appliedStartUncommonWisp: 1,
    };
    delete legacyV1Raw.appliedStartWisps;

    const migOk = migrateRunSave(legacyV1Raw, data);
    expect(migOk.discardedReason).toBeNull();
    expect(migOk.migratedFrom).toBe(1);
    expect(migOk.save?.version).toBe(RUN_SAVE_SCHEMA_VERSION);
    expect(migOk.save?.appliedStartWisps.common).toBe(2);
    expect(migOk.save?.appliedStartWisps.uncommon).toBe(1);

    const restored = new Simulation(data, 0x11111111);
    expect(restored.restoreRunSave(migOk.save!)).toBe(true);

    // Unknown/removed unitId -> returns explicit Korean discardedReason and clears persisted storage
    const brokenUnitSave = {
      ...v2Save,
      units: [{ ...v2Save.units[0]!, unitId: 'deleted_legacy_hero_999' }],
    };
    const storeMap = new Map<string, string>();
    const memStorage: StorageLike = {
      getItem: (k) => storeMap.get(k) ?? null,
      setItem: (k, v) => {
        storeMap.set(k, v);
      },
      removeItem: (k) => {
        storeMap.delete(k);
      },
    };
    memStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(brokenUnitSave));
    const meta = new MetaStore(memStorage);
    const loadBroken = meta.loadActiveRunMigrated(data);
    expect(loadBroken.save).toBeNull();
    expect(loadBroken.discardedReason).toContain('협객 데이터');
    expect(storeMap.has(RUN_STORAGE_KEY)).toBe(false);

    // Unsupported future/ancient schema version -> explicit Korean discardedReason
    const badVer = migrateRunSave({ ...v2Save, version: 99 }, data);
    expect(badVer.save).toBeNull();
    expect(badVer.discardedReason).toContain('v99');
  });

  it('persists first-run onboarding tutorial completion (tutorialDone) across storage reloads and MRD1- backup codes', () => {
    const storeMap = new Map<string, string>();
    const memStorage: StorageLike = {
      getItem: (k) => storeMap.get(k) ?? null,
      setItem: (k, v) => {
        storeMap.set(k, v);
      },
    };

    const meta1 = new MetaStore(memStorage);
    expect(meta1.isTutorialDone()).toBe(false);

    meta1.setTutorialDone(true);
    expect(meta1.isTutorialDone()).toBe(true);

    const metaReloaded = new MetaStore(memStorage);
    expect(metaReloaded.isTutorialDone()).toBe(true);

    const code = metaReloaded.exportBackupCode();
    const importedMeta = new MetaStore(null);
    expect(importedMeta.isTutorialDone()).toBe(false);
    expect(importedMeta.importBackupCode(code).ok).toBe(true);
    expect(importedMeta.isTutorialDone()).toBe(true);
  });

  it('integrates all 8 Transcendents & 7 Immortals with 15 bespoke high-tier VFX tracks, Transcendent passiveTraits, Rare supportAuras, and passiveProc events', () => {
    const data = loadGameData();

    // 1. +2 Demonic & +3 v2.0 roster additions
    const bloodAcolyte = data.unitsById.get('blood_acolyte');
    const netherQueen = data.unitsById.get('nether_blade_queen');
    expect(bloodAcolyte?.grade).toBe('common');
    expect(bloodAcolyte?.faction).toBe('demonic');
    expect(data.wispPools.common).toContain('blood_acolyte');
    expect(netherQueen?.grade).toBe('transcendent');
    expect(netherQueen?.faction).toBe('demonic');
    expect(netherQueen?.skill?.vfxTrack).toBe('tx_nether_queen');
    expect(netherQueen?.passiveTrait?.id).toBeTruthy();

    expect(data.unitsById.get('ice_palace_empress')?.skill?.vfxTrack).toBe('tx_ice_empress');
    expect(data.unitsById.get('blood_shadow_sovereign')?.skill?.vfxTrack).toBe('tx_blood_sovereign');
    expect(data.unitsById.get('wuji_grandmaster')?.skill?.vfxTrack).toBe('im_wuji_grandmaster');

    // 2. All 12 Transcendents have unique tx_* VFX tracks + unique passiveTraits; all 15 Immortals have unique im_* VFX tracks
    const transcendents = data.units.filter((u) => u.grade === 'transcendent');
    const immortals = data.units.filter((u) => u.grade === 'immortal');
    expect(transcendents.length).toBe(12);
    expect(immortals.length).toBe(15);

    const txTracks = new Set(transcendents.map((u) => u.skill?.vfxTrack));
    const txPassives = new Set(transcendents.map((u) => u.passiveTrait?.id));
    const imTracks = new Set(immortals.map((u) => u.skill?.vfxTrack));
    expect(txTracks.size).toBe(12);
    expect(txPassives.size).toBe(12);
    expect(imTracks.size).toBe(15);
    for (const tr of txTracks) expect(tr?.startsWith('tx_')).toBe(true);
    for (const tr of imTracks) expect(tr?.startsWith('im_')).toBe(true);

    // 3. Rare support aura heroes (gaebang_elder, tang_elder, blood_bishop) expose distinct supportAura configs
    for (const uid of ['gaebang_elder', 'tang_elder', 'blood_bishop'] as const) {
      const def = data.unitsById.get(uid);
      expect(def?.supportAura, `${uid} must define supportAura`).toBeDefined();
    }

    // 4. Deterministic passiveProc emissions on monster:hit (corrode from thousand_venom_lord)
    const craftHero = (sim: Simulation, recipeId: string): void => {
      const recipe = data.recipes.find((r) => r.id === recipeId)!;
      for (const ing of recipe.ingredients) {
        const subRecipe = data.recipes.find((r) => r.output === ing.unit && !r.id.startsWith('r_3x_'));
        if (subRecipe) {
          const leaves = sim.recipeGraph.leafCost.get(subRecipe.id)!;
          for (const [leafId, count] of leaves) {
            for (let i = 0; i < count * ing.n; i++) {
              sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
              sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: leafId });
            }
          }
          sim.tick();
          for (let k = 0; k < ing.n; k++) {
            sim.commands.enqueue({ type: 'craft', recipeId: subRecipe.id, chain: true });
            sim.tick();
          }
        }
      }
      sim.commands.enqueue({ type: 'craft', recipeId, chain: false });
      sim.tick();
    };

    const simVenom = new Simulation(data, 0x55aa1122, {}, 'hard', null);
    craftHero(simVenom, 'r_thousand_venom_lord');
    const procsSeen = new Set<PassiveProcKind>();
    simVenom.events.on('monster:hit', (ev) => {
      if (ev.passiveProc) procsSeen.add(ev.passiveProc);
    });
    for (let t = 0; t < 240 && !procsSeen.has('corrode'); t++) {
      simVenom.tick();
    }
    expect(procsSeen.has('corrode')).toBe(true);

    // Verify blood_acolyte ×3 recipe executes cleanly in Simulation
    const simDemonic = new Simulation(data, 0x33445566, {}, 'normal', null);
    for (let i = 0; i < 3; i++) {
      simDemonic.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
      simDemonic.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'blood_acolyte' });
    }
    simDemonic.tick();
    simDemonic.commands.enqueue({ type: 'craft', recipeId: 'r_3x_blood_acolyte', chain: false });
    simDemonic.tick();
    expect(simDemonic.getUnits().some((u) => u.unitId === 'black_wind')).toBe(true);
  });

  it('tracks MetaStore title progression reward ladder, abyss difficulty, Lv.15 transcendence, equipTitle, 6 trialRecords, achievement skins, and MRD1- backup without double-granting', () => {
    const data = loadGameData();
    const storeMap = new Map<string, string>();
    const memStorage: StorageLike = {
      getItem: (k) => storeMap.get(k) ?? null,
      setItem: (k, v) => {
        storeMap.set(k, v);
      },
      removeItem: (k) => {
        storeMap.delete(k);
      },
    };

    expect(TITLE_DEFS.length).toBe(29);
    const meta = new MetaStore(memStorage);
    expect(meta.getProfile().unlockedTitleCount).toBe(0);
    expect(meta.getEquippedTitle()).toBeNull();
    expect(meta.equipTitle('title_normal_victor')).toBe(false);

    // 1. Clear Normal Wave 30 -> unlocks title_novice_wanderer + title_normal_victor
    const recNormal = meta.settleRun({
      wave: 30,
      monstersSlain: 400,
      bossesSlain: 6,
      bountiesSlain: 2,
      difficulty: 'normal',
      victory: true,
      elapsedTicks: 24000,
    });
    expect(recNormal.unlockedTitleIds).toContain('title_novice_wanderer');
    expect(recNormal.unlockedTitleIds).toContain('title_normal_victor');
    expect(recNormal.titleBonusGold).toBe(60 + 150);
    expect(recNormal.titleBonusKeys).toBe(1);
    expect(meta.getEquippedTitle()).toBe('title_novice_wanderer');
    expect(meta.getProfile().difficultyBestWave.normal).toBe(30);

    expect(meta.equipTitle('title_normal_victor')).toBe(true);
    expect(meta.getEquippedTitle()).toBe('title_normal_victor');
    expect(meta.equipTitle(null)).toBe(true);
    expect(meta.getEquippedTitle()).toBeNull();
    expect(meta.equipTitle('title_normal_victor')).toBe(true);

    // 2. Clear Hard Wave 30 -> unlocks title_hard_master & skin_hell_flame_nirvana
    const recHard = meta.settleRun({
      wave: 30,
      monstersSlain: 420,
      bossesSlain: 6,
      difficulty: 'hard',
      victory: true,
      elapsedTicks: 23000,
    });
    expect(recHard.unlockedTitleIds).toContain('title_hard_master');
    expect(recHard.unlockedSkinIds).toContain('skin_hell_flame_nirvana');
    expect(meta.getProfile().ownedSkins.skin_hell_flame_nirvana).toBe(true);
    expect(meta.getProfile().difficultyBestWave.hard).toBe(30);

    // 3. Clear Hell Wave 40 -> unlocks abyss difficulty + title_hell_sovereign + title_endless_40
    const recHell = meta.settleRun({
      wave: 40,
      monstersSlain: 600,
      bossesSlain: 8,
      difficulty: 'hell',
      victory: true,
      elapsedTicks: 31000,
    });
    expect(recHell.unlockedNextDifficulty).toBe('abyss');
    expect(meta.getProfile().unlockedDifficulties.abyss).toBe(true);
    expect(recHell.unlockedTitleIds).toContain('title_hell_sovereign');
    expect(recHell.unlockedTitleIds).toContain('title_endless_40');
    expect(meta.getProfile().difficultyBestWave.hell).toBe(40);

    // 3b. Clear Abyss Wave 55 -> unlocks title_abyss_overlord + title_endless_55 + 2 apex achievement skins
    const recAbyss = meta.settleRun({
      wave: 55,
      monstersSlain: 900,
      bossesSlain: 11,
      difficulty: 'abyss',
      victory: true,
      elapsedTicks: 42000,
    });
    expect(recAbyss.unlockedTitleIds).toContain('title_abyss_overlord');
    expect(recAbyss.unlockedTitleIds).toContain('title_endless_55');
    expect(recAbyss.unlockedSkinIds).toContain('skin_asura_blood_eclipse');
    expect(recAbyss.unlockedSkinIds).toContain('skin_thunder_jade_sovereign');
    expect(meta.getProfile().difficultyBestWave.abyss).toBe(55);

    // 4. Clear all 6 Trials + verify trialRecords, title_abyss_sanctum_victor, title_trial_conqueror & skin_sword_immortal_celestial
    const allTrials: readonly TrialId[] = [
      'trial_venom_gale',
      'trial_sword_tomb',
      'trial_crimson_iron',
      'trial_chaos_trinity',
      'trial_gale_blitz',
      'trial_abyss_sanctum',
    ];
    for (let i = 0; i < allTrials.length; i++) {
      const tid = allTrials[i]!;
      const rec = meta.settleRun({
        wave: TRIAL_CONFIGS[tid].targetWave,
        monstersSlain: 200,
        bossesSlain: 3,
        difficulty: 'normal',
        trialId: tid,
        victory: true,
        elapsedTicks: 12000 - i * 200,
      });
      if (i < allTrials.length - 1) {
        expect(meta.getProfile().ownedSkins.skin_sword_immortal_celestial).toBeFalsy();
      } else {
        expect(rec.unlockedTitleIds).toContain('title_abyss_trial_victor');
        expect(rec.unlockedTitleIds).toContain('title_trial_conqueror');
        expect(rec.unlockedSkinIds).toContain('skin_sword_immortal_celestial');
        expect(meta.getProfile().ownedSkins.skin_sword_immortal_celestial).toBe(true);
      }
    }
    meta.settleRun({
      wave: 15,
      monstersSlain: 210,
      bossesSlain: 3,
      difficulty: 'normal',
      trialId: 'trial_venom_gale',
      victory: true,
      elapsedTicks: 9500,
    });
    const venomRec = meta.getProfile().trialRecords.trial_venom_gale;
    expect(venomRec.clears).toBe(2);
    expect(venomRec.bestWave).toBe(15);
    expect(venomRec.bestTicks).toBe(9500);

    // 5. Discover all 44 units -> title_codex_master; unlock all 16 relics -> title_all_relics_owned + title_relic_set_master;
    //    refine one relic to Lv.10 -> title_relic_grandmaster & Lv.15 -> title_relic_transcendent
    let codexUnlockedTitle = false;
    for (const u of data.units) {
      const g = data.gradesById.get(u.grade)!;
      const res = meta.discoverUnit(u, g);
      if (res.unlockedTitleIds?.includes('title_codex_master')) {
        codexUnlockedTitle = true;
      }
    }
    expect(codexUnlockedTitle).toBe(true);

    meta.grantDevMeta(25000, 0, 0);
    let allRelicsTitle = false;
    let setMasterTitle = false;
    for (const r of data.relics) {
      const res = meta.upgradeRelic(r);
      expect(res.ok).toBe(true);
      if (res.ok && res.unlockedTitleIds?.includes('title_all_relics_owned')) {
        allRelicsTitle = true;
      }
      if (res.ok && res.unlockedTitleIds?.includes('title_relic_set_master')) {
        setMasterTitle = true;
      }
    }
    expect(allRelicsTitle).toBe(true);
    expect(setMasterTitle).toBe(true);

    const firstRelic = data.relics[0]!;
    expect(firstRelic.maxLevel).toBe(15);
    let relicLv10Title = false;
    let relicLv15Title = false;
    for (let lv = 1; lv < firstRelic.maxLevel; lv++) {
      const up = meta.upgradeRelic(firstRelic);
      expect(up.ok).toBe(true);
      if (up.ok && up.unlockedTitleIds?.includes('title_relic_grandmaster')) {
        relicLv10Title = true;
      }
      if (up.ok && up.unlockedTitleIds?.includes('title_relic_transcendent')) {
        relicLv15Title = true;
      }
    }
    expect(relicLv10Title).toBe(true);
    expect(relicLv15Title).toBe(true);
    expect(meta.getProfile().relics[firstRelic.id]).toBe(15);
    expect(meta.getProfile().unlockedTitleCount).toBe(14);

    // 6. Reload from storage & MRD1- backup round-trip MUST preserve Lv.15, abyss, and all 14 unlocked titles without double-granting
    const goldSnap = meta.getProfile().gold;
    const keysSnap = meta.getProfile().keys;
    const silkSnap = meta.getProfile().silk;

    const reloaded = new MetaStore(memStorage);
    expect(reloaded.getProfile().gold).toBe(goldSnap);
    expect(reloaded.getProfile().keys).toBe(keysSnap);
    expect(reloaded.getProfile().silk).toBe(silkSnap);
    expect(reloaded.getProfile().relics[firstRelic.id]).toBe(15);
    expect(reloaded.getProfile().unlockedTitleCount).toBe(14);
    expect(reloaded.getEquippedTitle()).toBe('title_normal_victor');
    expect(reloaded.getProfile().trialRecords.trial_venom_gale.bestTicks).toBe(9500);

    const backupCode = reloaded.exportBackupCode();
    const imported = new MetaStore(null);
    expect(imported.importBackupCode(backupCode).ok).toBe(true);
    expect(imported.getProfile().gold).toBe(goldSnap);
    expect(imported.getProfile().keys).toBe(keysSnap);
    expect(imported.getProfile().silk).toBe(silkSnap);
    expect(imported.getProfile().relics[firstRelic.id]).toBe(15);
    expect(imported.getProfile().unlockedTitleCount).toBe(14);
    expect(imported.getEquippedTitle()).toBe('title_normal_victor');
    expect(imported.getProfile().trialRecords.trial_venom_gale.clears).toBe(2);
    expect(imported.getProfile().trialRecords.trial_venom_gale.bestTicks).toBe(9500);
    expect(imported.getProfile().difficultyBestWave.hell).toBe(40);
    expect(imported.getProfile().difficultyBestWave.abyss).toBe(55);
    expect(imported.getProfile().ownedSkins.skin_hell_flame_nirvana).toBe(true);
    expect(imported.getProfile().ownedSkins.skin_sword_immortal_celestial).toBe(true);
    expect(imported.getProfile().ownedSkins.skin_asura_blood_eclipse).toBe(true);
    expect(imported.getProfile().ownedSkins.skin_thunder_jade_sovereign).toBe(true);
  });

  it('supports all 16 Wuxia Relics up to Lv.15 Transcendence, bulk 10x drawRelicBatch, and cache-busted atlas hash', () => {
    const data = loadGameData();
    expect(data.relics.length).toBe(16);
    expect(typeof (atlasRaw as { hash?: string }).hash).toBe('string');
    expect(((atlasRaw as { hash?: string }).hash ?? '').length).toBeGreaterThanOrEqual(8);

    // 1. merchant_abacus discounts summon cost (Lv.10 = -4 silver, Lv.15 = -5 silver)
    const baseSim = new Simulation(data, 0x99887766, {}, 'normal', null);
    const abacus10Sim = new Simulation(data, 0x99887766, { merchant_abacus: 10 }, 'normal', null);
    const abacus15Sim = new Simulation(data, 0x99887766, { merchant_abacus: 15 }, 'normal', null);
    expect(abacus10Sim.getSummonCost()).toBe(baseSim.getSummonCost() - 4);
    expect(abacus15Sim.getSummonCost()).toBe(baseSim.getSummonCost() - 5);

    // 1b. heavenly_scroll_chest Lv.15 grants rare starter wisp via grades.json
    const scroll15Sim = new Simulation(data, 0x11112222, { heavenly_scroll_chest: 15 }, 'normal', null);
    const scrollSnap = scroll15Sim.buildSnapshot(1, false);
    expect(scrollSnap.wisps.common).toBeGreaterThanOrEqual(3); // 1 starter + 2 from Lv.8+
    expect(scrollSnap.wisps.uncommon).toBe(2); // Lv.12 bonus
    expect(scrollSnap.wisps.rare).toBe(1); // Lv.15 transcendence milestone!

    // 1c. jade_training_manual discounts upgrade cost & phoenix_luck_pouch grants starter luck + sell bonus
    const econ4Sim = new Simulation(
      data,
      0x33445566,
      { jade_training_manual: 15, phoenix_luck_pouch: 15 },
      'normal',
      null,
    );
    expect(econ4Sim.getUpgradeCost('orthodox')).toBeLessThan(baseSim.getUpgradeCost('orthodox'));
    expect(econ4Sim.buildSnapshot(1, false).luckStone).toBe(
      baseSim.buildSnapshot(1, false).luckStone + 4,
    );
    expect(econ4Sim.getUnitSellCoin(100)).toBe(165); // +65% at Lv.15

    // 1d. dragon_range_mirror extends unit range & eight_trigram_mirror boosts global ATK & tile aura
    const mirrorSim = new Simulation(
      data,
      0x44556677,
      { dragon_range_mirror: 15, eight_trigram_mirror: 15 },
      'normal',
      null,
    );
    mirrorSim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
    mirrorSim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'hwasan_novice' });
    mirrorSim.tick();
    const hwasanDef = data.unitsById.get('hwasan_novice')!;
    const mirrorSlot = mirrorSim.buildSnapshot(1, false).field.find((s) => s !== null)!;
    expect(mirrorSlot.range).toBe(hwasanDef.range + 55); // +55 range at Lv.15
    expect(mirrorSlot.baseAtk + mirrorSlot.bonusAtk).toBeGreaterThan(hwasanDef.atk);

    // 2. wind_swift_boots reduces unit cooldown ticks (faster attack cadence)
    const slowSim = new Simulation(data, 0x11223344, {}, 'normal', null);
    const fastSim = new Simulation(data, 0x11223344, { wind_swift_boots: 15 }, 'normal', null);
    for (const s of [slowSim, fastSim]) {
      s.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
      s.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'hwasan_novice' });
      s.tick();
    }
    let slowHits = 0;
    let fastHits = 0;
    slowSim.events.on('monster:hit', () => {
      slowHits++;
    });
    fastSim.events.on('monster:hit', () => {
      fastHits++;
    });
    for (let t = 0; t < 450; t++) {
      slowSim.tick();
      fastSim.tick();
    }
    expect(fastHits).toBeGreaterThan(slowHits);

    // 3. armor_break_gauntlet + celestial_skill_jade + crimson_crit_blade + demon_slayer_banner increase damage deterministically
    const plainSim = new Simulation(data, 0x77665544, {}, 'hell', 'trial_crimson_iron');
    const combatRelicSim = new Simulation(
      data,
      0x77665544,
      {
        armor_break_gauntlet: 12,
        celestial_skill_jade: 12,
        crimson_crit_blade: 12,
        demon_slayer_banner: 12,
      },
      'hell',
      'trial_crimson_iron',
    );
    for (const s of [plainSim, combatRelicSim]) {
      s.commands.enqueue({ type: 'grantTestResource', wispGrade: 'rare' });
      s.commands.enqueue({ type: 'useWisp', grade: 'rare', unitId: 'plum_elder' });
      s.tick();
    }
    let plainDmg = 0;
    let relicDmg = 0;
    plainSim.events.on('monster:hit', (ev) => {
      plainDmg += ev.damage;
    });
    combatRelicSim.events.on('monster:hit', (ev) => {
      relicDmg += ev.damage;
    });
    for (let t = 0; t < 360; t++) {
      plainSim.tick();
      combatRelicSim.tick();
    }
    expect(relicDmg).toBeGreaterThan(Math.round(plainDmg * 1.3));

    // 4. MetaStore drawRelicBatch (bulk 10x key pull & 5x gold pull) works atomically
    const meta = new MetaStore(null);
    meta.grantDevMeta(1000, 10, 0);
    const keysBefore = meta.getProfile().keys;
    const batchKey = meta.drawRelicBatch(data.relics, 10, 'key', () => 0);
    expect(batchKey.ok).toBe(true);
    if (batchKey.ok) {
      expect(batchKey.spentCount).toBe(10);
      expect(batchKey.items.length).toBe(10);
      expect(meta.getProfile().keys).toBe(keysBefore - 10);
      expect(meta.getProfile().relics.golden_vault).toBe(10);
    }

    const batchGold5 = meta.drawRelicBatch(data.relics, 5, 'gold', () => 0);
    expect(batchGold5.ok).toBe(true);
    if (batchGold5.ok) {
      expect(batchGold5.spentCount).toBe(5);
      // golden_vault reaches Lv.15 transcendence cap!
      expect(meta.getProfile().relics.golden_vault).toBe(15);
    }
  });

  it('activates all 4 Relic Set Synergies (Tier 1/2/3), Daily Martial Quests rotation/claim/backup, upgrade x5, 3 new heroes, Endless 35+ dual-authority boss, and 3-step SoundSynthesizer volume', () => {
    const data = loadGameData();
    expect(RELIC_SETS.length).toBe(4);
    expect(data.missions.length).toBe(16);
    expect(data.trials.length).toBe(6);

    // 1. 4 Relic Set Synergies Tier 0 -> Tier 1 -> Tier 2 -> Tier 3
    const allLv1: Partial<Record<RelicId, number>> = {};
    const allLv10: Partial<Record<RelicId, number>> = {};
    const allLv15: Partial<Record<RelicId, number>> = {};
    for (const r of data.relics) {
      allLv1[r.id] = 1;
      allLv10[r.id] = 10;
      allLv15[r.id] = 15;
    }

    const s0 = computeRelicSetBonuses({});
    const s1 = computeRelicSetBonuses(allLv1);
    const s2 = computeRelicSetBonuses(allLv10);
    const s3 = computeRelicSetBonuses(allLv15);
    expect(s0.activeSetCount).toBe(0);
    expect(s1.activeSetCount).toBe(4);
    expect(s1.mythicSetCount).toBe(0);
    expect(s2.interestPct).toBeGreaterThan(s1.interestPct);
    expect(s3.mythicSetCount).toBe(4);
    expect(s3.summonDiscount).toBe(1);
    expect(s3.startLuck).toBe(2);
    expect(s3.atkBps).toBe(2400);
    expect(s3.bossDamagePct).toBe(38);
    expect(computeRelicSetStatuses(allLv15).every((st) => st.tier === 3)).toBe(true);

    // Verify Simulation applies Relic Set bonuses & activeRelicSetCount in snapshot
    const setSim = new Simulation(data, 0x20262026, allLv15, 'normal', null);
    const setSnap = setSim.buildSnapshot(1, false);
    expect(setSnap.activeRelicSetCount).toBe(4);
    expect(setSnap.relicBonus.interestPct).toBeGreaterThan(15);

    // 2. Bulk upgrade x5 command upgrades 5 levels atomically & stops cleanly when out of coin
    setSim.commands.enqueue({ type: 'grantTestCoin', amount: 3000 });
    setSim.commands.enqueue({ type: 'upgrade', group: 'orthodox', count: 5 });
    setSim.tick();
    expect(setSim.buildSnapshot(1, false).upgradeLv.orthodox).toBe(5);

    // Verify battle report telemetry fields (economyStats & damageMeter.byFaction) exist and accumulate
    const simHero = new Simulation(data, 0x77778888, {}, 'normal', null);
    // Craft 3 new v2.0 heroes: ice_palace_empress, blood_shadow_sovereign, wuji_grandmaster
    const craftUnitRecursive = (sim: Simulation, unitId: string): void => {
      const uDef = data.unitsById.get(unitId)!;
      if (uDef.grade === 'common' || uDef.grade === 'uncommon' || uDef.grade === 'rare') {
        sim.commands.enqueue({ type: 'grantTestResource', wispGrade: uDef.grade });
        sim.commands.enqueue({ type: 'useWisp', grade: uDef.grade, unitId });
        sim.tick();
        return;
      }
      const rec = data.recipes.find((r) => r.output === unitId && !r.id.startsWith('r_3x_'))!;
      for (const ing of rec.ingredients) {
        for (let k = 0; k < ing.n; k++) {
          craftUnitRecursive(sim, ing.unit);
        }
      }
      sim.commands.enqueue({ type: 'craft', recipeId: rec.id, chain: false });
      sim.tick();
    };

    craftUnitRecursive(simHero, 'ice_palace_empress');
    craftUnitRecursive(simHero, 'blood_shadow_sovereign');
    expect(simHero.getUnits().some((u) => u.unitId === 'ice_palace_empress')).toBe(true);
    expect(simHero.getUnits().some((u) => u.unitId === 'blood_shadow_sovereign')).toBe(true);

    // Now craft wuji_grandmaster using ice_palace_empress + hwasan_master + gaebang_elder
    const simWuji = new Simulation(data, 0x88889999, {}, 'normal', null);
    craftUnitRecursive(simWuji, 'wuji_grandmaster');
    expect(simWuji.getUnits().some((u) => u.unitId === 'wuji_grandmaster')).toBe(true);
    for (let t = 0; t < 240; t++) simWuji.tick();
    const wujiSnap = simWuji.buildSnapshot(1, false);
    expect(wujiSnap.craftedImmortal).toBe(true);
    expect(wujiSnap.damageMeter.byFaction.orthodox).toBeGreaterThan(0);
    expect(wujiSnap.economyStats.killCoinTotal).toBeGreaterThan(0);

    // 3. Endless 35+ Dual-Authority Boss titles
    const w35 = resolveWaveDef(data.waves, 35);
    expect(w35.isBoss).toBe(true);
    expect(resolveTargetBossName(null, 30, 35, w35)).toContain('무한이중권능');
    expect(resolveTargetBossName(null, 30, 40, resolveWaveDef(data.waves, 40))).toContain(
      '무한이중권능',
    );
    expect(resolveTargetBossName(null, 30, 30, resolveWaveDef(data.waves, 30))).not.toContain(
      '무한이중권능',
    );

    // 4. Daily Martial Quests: deterministic date rotation, progress tracking, 1-click claim, no double-claim, backup round-trip
    const qDay1a = pickDailyQuestsForDate('2026-11-19');
    const qDay1b = pickDailyQuestsForDate('2026-11-19');
    const qDay2 = pickDailyQuestsForDate('2026-11-20');
    expect(qDay1a.length).toBe(3);
    expect(qDay1a.map((q) => q.id)).toEqual(qDay1b.map((q) => q.id));
    expect(new Set(qDay1a.map((q) => q.id)).size).toBe(3);
    expect(qDay2.length).toBe(3);

    const storeMap = new Map<string, string>();
    const memStorage: StorageLike = {
      getItem: (k) => storeMap.get(k) ?? null,
      setItem: (k, v) => {
        storeMap.set(k, v);
      },
      removeItem: (k) => {
        storeMap.delete(k);
      },
    };
    const meta = new MetaStore(memStorage);
    meta.settleRun({
      wave: 36,
      monstersSlain: 450,
      bossesSlain: 7,
      difficulty: 'normal',
      trialId: 'trial_venom_gale',
      victory: true,
      usedHighFormation: true,
      craftedImmortal: true,
      dateKey: '2026-11-19',
    });

    const profDay1 = meta.getProfile('2026-11-19');
    expect(profDay1.claimableDailyCount).toBe(3);
    const firstQ = profDay1.dailyQuests[0]!.def;
    const goldBefore = profDay1.gold;
    const claimRes = meta.claimDailyQuest(firstQ.id, '2026-11-19');
    expect(claimRes.ok).toBe(true);
    expect(meta.getProfile('2026-11-19').gold).toBeGreaterThanOrEqual(goldBefore + firstQ.rewardGold);
    expect(meta.getProfile('2026-11-19').totalDailyClaimed).toBe(1);
    // Double claim rejected
    expect(meta.claimDailyQuest(firstQ.id, '2026-11-19').ok).toBe(false);

    // Backup round-trip preserves daily progress, claimed state, and totalDailyClaimed
    const code = meta.exportBackupCode();
    const restored = new MetaStore(null);
    expect(restored.importBackupCode(code).ok).toBe(true);
    expect(restored.getProfile('2026-11-19').totalDailyClaimed).toBe(1);
    expect(restored.getProfile('2026-11-19').dailyQuests[0]!.claimed).toBe(true);

    // Date rollover resets daily progress cleanly while keeping lifetime totalDailyClaimed
    const nextDayProf = restored.getProfile('2026-11-20');
    expect(nextDayProf.dailyDate).toBe('2026-11-20');
    expect(nextDayProf.claimableDailyCount).toBe(0);
    expect(nextDayProf.totalDailyClaimed).toBe(1);

    // 5. SoundSynthesizer 3-step volume cycle (1 -> 0.5 -> 0 -> 1) & persistence
    const sndMap = new Map<string, string>();
    const sndStorage: StorageLike = {
      getItem: (k) => sndMap.get(k) ?? null,
      setItem: (k, v) => {
        sndMap.set(k, v);
      },
    };
    const snd1 = new SoundSynthesizer(sndStorage);
    expect(snd1.getVolumeLevel()).toBe(1);
    expect(snd1.cycleVolume()).toBe(0.5);
    expect(snd1.isMuted()).toBe(false);
    const sndReloaded = new SoundSynthesizer(sndStorage);
    expect(sndReloaded.getVolumeLevel()).toBe(0.5);
    expect(sndReloaded.cycleVolume()).toBe(0);
    expect(sndReloaded.isMuted()).toBe(true);
    expect(sndReloaded.cycleVolume()).toBe(1);
  });

  it('v2.1 polish & balance: craftAll batch synthesis, tutorial paused command flush, rookie Wave 5 timer +25%, Lv.40 upgrade cap, and Endless 41+ ramp', () => {
    const data = loadGameData();

    // 1. Paused command flush (tutorial auto-pause): summoning works live without advancing tickCount or wave timer
    const simPaused = new Simulation(data, 0x21210001, {}, 'normal', null, true);
    expect(simPaused.rookieMode).toBe(true);
    const snapBefore = simPaused.buildSnapshot(1, true);
    simPaused.commands.enqueue({ type: 'summon' });
    simPaused.flushCommandsWhilePaused();
    const snapAfter = simPaused.buildSnapshot(1, true);
    expect(simPaused.tickCount).toBe(0);
    expect(snapAfter.waveTicksLeft).toBe(snapBefore.waveTicksLeft);
    expect(snapAfter.fieldOccupied + snapAfter.benchOccupied).toBe(1);

    // 2. craftAll one-tap batch synthesis: grant 6 copies of a common unit -> crafts multiple higher-tier heroes in 1 command
    const simBatch = new Simulation(data, 0x21210002, {}, 'normal', null);
    let batchCount = 0;
    simBatch.events.on('craft:batch', (ev) => {
      batchCount = ev.count;
    });
    for (let i = 0; i < 6; i++) {
      simBatch.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
      simBatch.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'shaolin_novice' });
    }
    simBatch.tick();
    simBatch.commands.enqueue({ type: 'craftAll' });
    simBatch.tick();
    expect(batchCount).toBeGreaterThanOrEqual(2);
    expect(
      simBatch
        .getUnits()
        .some((u) => (data.gradesById.get(u.grade)?.rank ?? 1) >= 2),
    ).toBe(true);

    // 3. Upgrade Lv.40 late-game silver sink
    for (const up of data.upgrades) {
      expect(up.maxLevel).toBe(40);
    }

    // 4. Rookie mode (+25% Wave 5 boss timer) vs Standard mode
    const simStd = new Simulation(data, 0x21210003, {}, 'normal', null, false);
    const simRookie = new Simulation(data, 0x21210003, {}, 'normal', null, true);
    expect(simStd.rookieMode).toBe(false);
    expect(simRookie.rookieMode).toBe(true);
    // Verify non-normal / trial never enables rookieMode
    expect(new Simulation(data, 1, {}, 'hard', null, true).rookieMode).toBe(false);
    expect(new Simulation(data, 1, {}, 'normal', 'trial_venom_gale', true).rookieMode).toBe(false);

    // 5. Endless 41+ sharper HP ramp (> 1.34^5 = 4.3x over 5 waves from 40 to 45)
    const hp40 = computeWaveHpScale(data, 'normal', null, 40, false);
    const hp45 = computeWaveHpScale(data, 'normal', null, 45, false);
    expect(hp45 / hp40).toBeGreaterThan(4.0);
  });

  it('v2.3 build variety & strategy: Bench Passives (unique per unitId), Wave 5 3-choice Contracts, Boon Reroll, Elite Bounty, and Hero Awakening (★1-★3 + Save round-trip)', () => {
    const data = loadGameData();

    // 1. Track A — Bench Passives on 13 Rank 1-3 heroes & unique-per-unitId non-stacking
    const benchUnits = data.units.filter((u) => Boolean(u.benchPassive));
    expect(benchUnits.length).toBe(13);
    const simBench = new Simulation(data, 0x23230001);
    const baseInterest = simBench.getEffectiveInterestConfig();
    const baseGamble = simBench.getEffectiveGambleBonusPct();
    expect(baseInterest.pct).toBe(0);

    simBench.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
    simBench.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'haomun_ronin' });
    simBench.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
    simBench.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'haomun_ronin' });
    simBench.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
    simBench.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'cult_initiate' });
    simBench.tick();

    // Move all 3 from field[0..2] to bench[0..2]
    simBench.commands.enqueue({ type: 'move', from: { area: 'field', index: 0 }, to: { area: 'bench', index: 0 } });
    simBench.commands.enqueue({ type: 'move', from: { area: 'field', index: 1 }, to: { area: 'bench', index: 1 } });
    simBench.commands.enqueue({ type: 'move', from: { area: 'field', index: 2 }, to: { area: 'bench', index: 2 } });
    simBench.tick();

    const snapBench = simBench.buildSnapshot(1, false);
    // 2 copies of haomun_ronin MUST count once (+2%p interest, NOT +4%p), plus 1 cult_initiate (+4%p gamble)
    expect(snapBench.benchPassives.activeUnits.length).toBe(2);
    expect(snapBench.benchPassives.interestPct).toBe(2);
    expect(simBench.getEffectiveInterestConfig().pct).toBe(2);
    expect(simBench.getEffectiveGambleBonusPct()).toBe(baseGamble + 4);

    // 2. Track C3 — Hero Awakening (0 -> 1 -> 2 -> 3, ATK boost, cap reject, and Save round-trip)
    const simAwk = new Simulation(data, 0x23230002);
    spawnCheonmaHelper(simAwk);
    simAwk.commands.enqueue({ type: 'grantTestCoin', amount: 10000 });
    simAwk.tick();

    const cheonmaSlot0 = simAwk.buildSnapshot(1, false).field.find((s) => s?.unitId === 'cheonma')!;
    expect(cheonmaSlot0).toBeTruthy();
    expect(cheonmaSlot0.starLevel).toBe(0);
    const atk0 = cheonmaSlot0.baseAtk + cheonmaSlot0.bonusAtk;

    let awakenedStars: number[] = [];
    simAwk.events.on('unit:awakened', (ev) => awakenedStars.push(ev.starLevel));
    for (let s = 0; s < 3; s++) {
      simAwk.commands.enqueue({ type: 'awaken', uid: cheonmaSlot0.uid });
      simAwk.tick();
    }
    const cheonmaSlot3 = simAwk.buildSnapshot(1, false).field.find((s) => s?.uid === cheonmaSlot0.uid)!;
    expect(awakenedStars).toEqual([1, 2, 3]);
    expect(cheonmaSlot3.starLevel).toBe(3);
    expect(cheonmaSlot3.awakenCost).toBeNull();
    expect(cheonmaSlot3.baseAtk + cheonmaSlot3.bonusAtk).toBeGreaterThan(Math.round(atk0 * 1.55));

    // Reject 4th awaken beyond MAX_UNIT_STAR_LEVEL
    simAwk.commands.enqueue({ type: 'awaken', uid: cheonmaSlot0.uid });
    simAwk.tick();
    expect(simAwk.buildSnapshot(1, false).rejects.some((r) => r.cmd === 'awaken')).toBe(true);

    // RunSave round-trip preserves starLevel=3
    const exportedAwk = simAwk.exportRunSave(12345);
    const simAwkRestored = new Simulation(data, 0x23230002);
    expect(simAwkRestored.restoreRunSave(exportedAwk)).toBe(true);
    const restoredSlot = simAwkRestored.buildSnapshot(1, false).field.find((s) => s?.uid === cheonmaSlot0.uid)!;
    expect(restoredSlot.starLevel).toBe(3);

    // 3. Track B & C1 & C2 — Wave 5 Contract 3-choice + Boon Reroll + Wave 8 Elite Bounty
    const simProg = new Simulation(data, 0x23230003);
    spawnCheonmaHelper(simProg);
    simProg.commands.enqueue({ type: 'grantTestCoin', amount: 5000 });
    simProg.tick();

    // Advance to Wave 5 -> Contract 3-choice offer arrives automatically
    while (simProg.buildSnapshot(1, false).wave < 5) {
      simProg.tick();
    }
    const snapW5 = simProg.buildSnapshot(1, false);
    expect(snapW5.pendingContractOffer).not.toBeNull();
    expect(snapW5.pendingContractOffer!.options.length).toBe(3);
    const chosenContract = snapW5.pendingContractOffer!.options[0]!;
    simProg.commands.enqueue({ type: 'pickContract', contractId: chosenContract });
    simProg.tick();
    const snapAfterPick = simProg.buildSnapshot(1, false);
    expect(snapAfterPick.pendingContractOffer).toBeNull();
    expect(snapAfterPick.contracts.length).toBe(1);
    expect(snapAfterPick.contracts[0]!.contractId).toBe(chosenContract);

    // Wait for Wave 5 Boss kill -> Boon offer arrives -> test rerollBoon
    for (let t = 0; t < 1800 && !simProg.buildSnapshot(1, false).pendingBoonOffer; t++) {
      simProg.tick();
    }
    const snapBoon1 = simProg.buildSnapshot(1, false);
    expect(snapBoon1.pendingBoonOffer).not.toBeNull();
    const origOptions = [...snapBoon1.pendingBoonOffer!.options];
    const coinBeforeReroll = snapBoon1.coin;
    simProg.commands.enqueue({ type: 'rerollBoon' });
    simProg.tick();
    const snapBoon2 = simProg.buildSnapshot(1, false);
    expect(snapBoon2.pendingBoonOffer!.rerollsUsed).toBe(1);
    expect(snapBoon2.coin).toBeLessThanOrEqual(coinBeforeReroll - 150);
    expect(snapBoon2.pendingBoonOffer!.options.every((id) => !origOptions.includes(id))).toBe(true);
    // Pick a boon to clear the offer
    simProg.commands.enqueue({ type: 'pickBoon', boonId: snapBoon2.pendingBoonOffer!.options[0]! });
    simProg.tick();

    // Elite Bounty rejected before Wave 8
    simProg.commands.enqueue({ type: 'callBounty', elite: true });
    simProg.tick();
    expect(simProg.buildSnapshot(1, false).rejects.some((r) => r.cmd === 'callBounty')).toBe(true);

    // Advance to Wave 8 -> call Elite Bounty -> slay -> verify +1 rare wisp + coin/luck!
    while (simProg.buildSnapshot(1, false).wave < 8) {
      simProg.tick();
    }
    const snapW8 = simProg.buildSnapshot(1, false);
    expect(snapW8.bounty.eliteUnlocked).toBe(true);
    expect(snapW8.bounty.canCallElite).toBe(true);
    const rareWispBefore = snapW8.wisps.rare ?? 0;
    let eliteSlain = false;
    simProg.events.on('bounty:slain', (ev) => {
      if (ev.isElite && ev.rewardWispGrade) eliteSlain = true;
    });
    simProg.commands.enqueue({ type: 'callBounty', elite: true });
    for (let t = 0; t < 360 && !eliteSlain; t++) {
      simProg.tick();
    }
    expect(eliteSlain).toBe(true);
    expect(simProg.buildSnapshot(1, false).wisps.rare ?? 0).toBeGreaterThanOrEqual(rareWispBefore + 1);
  });

  it('supports v2.4 polish: Rank 3+ awaken auto-lock & craft star inheritance, bench-passive preservation in autoArrange, contract deposit/queue/reminder, and 1-time boss retry', () => {
    const data = loadGameData();

    // 1. Rank 1-2 awaken rejected; Rank 3+ awaken auto-locks; craft inherits max ★ & auto-locks output
    const sim = new Simulation(data, 0x24240001);
    sim.commands.enqueue({ type: 'grantTestCoin', amount: 5000 });
    sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
    sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'hwasan_novice' });
    sim.tick();
    const lowSlot = sim.buildSnapshot(1, false).field.find((s) => s?.unitId === 'hwasan_novice')!;
    expect(lowSlot.awakenCost).toBeNull();
    sim.commands.enqueue({ type: 'awaken', uid: lowSlot.uid });
    sim.tick();
    expect(sim.buildSnapshot(1, false).rejects.some((r) => r.cmd === 'awaken')).toBe(true);

    // Spawn 3x Rank-3 gaebang_elder (or exact ingredients for r_hwasan_master) -> awaken one to ★2 -> unlock -> craft!
    const hwasanRec = data.recipes.find((r) => r.id === 'r_hwasan_master')!;
    for (const ing of hwasanRec.ingredients) {
      const g = data.unitsById.get(ing.unit)!.grade;
      for (let i = 0; i < ing.n; i++) {
        sim.commands.enqueue({ type: 'grantTestResource', wispGrade: g });
        sim.commands.enqueue({ type: 'useWisp', grade: g, unitId: ing.unit });
      }
    }
    sim.tick();
    const rank3IngId = hwasanRec.ingredients.find(
      (i) => (data.gradesById.get(data.unitsById.get(i.unit)!.grade)?.rank ?? 0) >= 3,
    )!.unit;
    const ingSlot = sim
      .buildSnapshot(1, false)
      .field.find((s) => s?.unitId === rank3IngId)!;
    sim.commands.enqueue({ type: 'awaken', uid: ingSlot.uid });
    sim.commands.enqueue({ type: 'awaken', uid: ingSlot.uid });
    sim.tick();
    const afterAwk = sim.buildSnapshot(1, false).field.find((s) => s?.uid === ingSlot.uid)!;
    expect(afterAwk.starLevel).toBe(2);
    expect(afterAwk.locked).toBe(true); // auto-locked on awaken!

    // Unlock intentionally to ascend -> output inherits ★2 and gets auto-locked
    sim.commands.enqueue({ type: 'lock', uid: ingSlot.uid, locked: false });
    sim.commands.enqueue({ type: 'craft', recipeId: 'r_hwasan_master', chain: false });
    sim.tick();
    const craftedMaster = sim
      .buildSnapshot(1, false)
      .field.find((s) => s?.unitId === 'hwasan_master')!;
    expect(craftedMaster).toBeTruthy();
    expect(craftedMaster.starLevel).toBe(2);
    expect(craftedMaster.locked).toBe(true);

    // 2. Bench-passive preservation in autoArrange (keep 1 copy on bench, deploy 2nd duplicate!)
    const simBench = new Simulation(data, 0x24240002);
    const passiveUnit = data.units.find((u) => Boolean(u.benchPassive))!;
    // Spawn 2 copies and move both to bench
    for (let i = 0; i < 2; i++) {
      simBench.commands.enqueue({ type: 'grantTestResource', wispGrade: passiveUnit.grade });
      simBench.commands.enqueue({ type: 'useWisp', grade: passiveUnit.grade, unitId: passiveUnit.id });
    }
    simBench.tick();
    const snapB0 = simBench.buildSnapshot(1, false);
    const placedIdx = snapB0.field
      .map((s, idx) => (s?.unitId === passiveUnit.id ? idx : -1))
      .filter((idx) => idx >= 0);
    placedIdx.forEach((fIdx, bIdx) => {
      simBench.commands.enqueue({
        type: 'move',
        from: { area: 'field', index: fIdx },
        to: { area: 'bench', index: bIdx },
      });
    });
    simBench.tick();
    expect(simBench.buildSnapshot(1, false).benchPassives.activeUnits.length).toBe(1);

    // Auto-arrange with preserveBenchPassives=true (default): 1 stays on bench, 1 deploys to field
    simBench.commands.enqueue({ type: 'autoArrange' });
    simBench.tick();
    const snapB1 = simBench.buildSnapshot(1, false);
    expect(snapB1.benchPassives.activeUnits.length).toBe(1);
    expect(snapB1.field.filter((s) => s?.unitId === passiveUnit.id).length).toBe(1);

    // Turning preserveBenchPassives OFF allows deploying the last bench-passive hero too
    simBench.commands.enqueue({ type: 'setPreserveBenchPassives', enabled: false });
    simBench.commands.enqueue({ type: 'autoArrange' });
    simBench.tick();
    expect(simBench.buildSnapshot(1, false).benchPassives.activeUnits.length).toBe(0);

    // 3. Contract deposit + Wave 6 reminder + Wave 15 queued without overwriting Wave 5
    const simCon = new Simulation(data, 0x24240003);
    spawnCheonmaHelper(simCon);
    simCon.commands.enqueue({ type: 'grantTestCoin', amount: 3000 });
    simCon.tick();
    let reminded = false;
    simCon.events.on('contract:reminder', () => {
      reminded = true;
    });
    // Advance to Wave 15 without answering Wave 5 contract offer
    while (simCon.buildSnapshot(1, false).wave < 15) {
      const sNow = simCon.buildSnapshot(1, false);
      if (sNow.pendingBoonOffer) {
        simCon.commands.enqueue({ type: 'pickBoon', boonId: sNow.pendingBoonOffer.options[0]! });
      }
      simCon.tick();
    }
    const snapC15 = simCon.buildSnapshot(1, false);
    expect(reminded).toBe(true);
    expect(snapC15.pendingContractOffer?.wave).toBe(5);
    expect(snapC15.queuedContractCount).toBe(1);

    // Picking Wave 5 contract deducts deposit and immediately dequeues Wave 15 offer!
    const coinBeforeDep = snapC15.coin;
    const c5 = snapC15.pendingContractOffer!.options[0]!;
    simCon.commands.enqueue({ type: 'pickContract', contractId: c5 });
    simCon.tick();
    const snapAfterC5 = simCon.buildSnapshot(1, false);
    expect(snapAfterC5.coin).toBeLessThan(coinBeforeDep);
    expect(snapAfterC5.pendingContractOffer?.wave).toBe(15);
    expect(snapAfterC5.queuedContractCount).toBe(0);

    // 4. First boss timeout triggers 1-time boss:retry (+15s, keeping HP) before eventual game over
    const simRetry = new Simulation(data, 0x24240004, undefined, 'hard');
    // Put a weak rank-1 unit so Wave 1-4 monsters stay below cap? Better: give 1 medium unit to survive waves 1-4, then sell it at Wave 5!
    simRetry.commands.enqueue({ type: 'grantTestResource', wispGrade: 'rare' });
    simRetry.commands.enqueue({ type: 'useWisp', grade: 'rare', unitId: 'gaebang_elder' });
    simRetry.tick();
    while (simRetry.buildSnapshot(1, false).wave < 5 && !simRetry.isGameOver) {
      simRetry.tick();
    }
    // Remove units at Wave 5 so boss definitely times out
    for (const u of [...simRetry.getUnits()]) {
      simRetry.commands.enqueue({ type: 'sell', uid: u.uid });
    }
    let retryCount = 0;
    simRetry.events.on('boss:retry', () => {
      retryCount++;
    });
    for (let t = 0; t < 2600 && !simRetry.isGameOver; t++) {
      simRetry.tick();
    }
    expect(retryCount).toBe(1);
    expect(simRetry.buildSnapshot(1, false).bossRetryUsed).toBe(true);
    expect(simRetry.isGameOver).toBe(true);
  });

  it('v2.5: runs deterministic Daily Challenge, 10-stage Boss Rush, Endless 40+ milestones, and persists Hall of Fame', () => {
    const data = loadGameData();

    // 1. Daily Seed Challenge determinism & Wave 20 target
    const specA = getDailyChallengeSpec('2026-11-20');
    const specB = getDailyChallengeSpec('2026-11-20');
    expect(specA.seed).toBe(specB.seed);
    expect(specA.rule.id).toBe(specB.rule.id);
    expect(specA.targetWave).toBe(20);

    const dailySim1 = new Simulation(data, 12345, {}, 'normal', null, false, {
      runMode: 'daily_challenge',
      dailyDateKey: '2026-11-20',
    });
    const dailySim2 = new Simulation(data, 99999, {}, 'normal', null, false, {
      runMode: 'daily_challenge',
      dailyDateKey: '2026-11-20',
    });
    expect(dailySim1.dailyChallengeSpec?.seed).toBe(specA.seed);
    expect(dailySim2.dailyChallengeSpec?.seed).toBe(specA.seed);
    expect(dailySim1.buildSnapshot(1, false).clearTargetWave).toBe(20);
    // Identical summon rolls under same dateKey regardless of passed fallback seed
    for (let i = 0; i < 4; i++) {
      dailySim1.commands.enqueue({ type: 'summon' });
      dailySim2.commands.enqueue({ type: 'summon' });
    }
    dailySim1.tick();
    dailySim2.tick();
    expect(dailySim1.getUnits().map((u) => u.unitId)).toEqual(
      dailySim2.getUnits().map((u) => u.unitId),
    );

    // 2. Boss Rush starter kit, 10-stage victory, and odd-stage boon cadence
    const brSim = new Simulation(data, 0x25250002, {}, 'normal', null, false, {
      runMode: 'boss_rush',
    });
    const brStart = brSim.buildSnapshot(1, false);
    expect(brStart.runMode).toBe('boss_rush');
    expect(brStart.clearTargetWave).toBe(BOSS_RUSH_TARGET_STAGE);
    expect(brStart.coin).toBe(420);
    expect(brStart.luckStone).toBe(6);
    expect(brStart.wisps.common).toBe(3);
    expect(brStart.wisps.uncommon).toBe(2);
    expect(brStart.wisps.rare).toBe(1);
    expect(brStart.isBossWave).toBe(true);

    // Save/Restore preserves runMode & dailyDateKey
    const savedDaily = dailySim1.exportRunSave(Date.now());
    expect(savedDaily.runMode).toBe('daily_challenge');
    expect(savedDaily.dailyDateKey).toBe('2026-11-20');
    const dailyRestored = new Simulation(data, 1, {}, 'normal', null, false, {
      runMode: 'daily_challenge',
      dailyDateKey: '2026-11-20',
    });
    expect(dailyRestored.restoreRunSave(savedDaily)).toBe(true);

    // Clear 1st stage of Boss Rush with stacked Cheonma + upgrades and verify stage 2 + boon offered on stage 1
    spawnCheonmaHelper(brSim);
    brSim.commands.enqueue({ type: 'grantTestCoin', amount: 8000 });
    for (let i = 0; i < 10; i++) {
      brSim.commands.enqueue({ type: 'upgrade', group: 'demonic' });
    }
    brSim.tick();
    let boonOffersInBr = 0;
    brSim.events.on('boon:offered', () => {
      boonOffersInBr++;
    });
    for (let t = 0; t < 3000 && brSim.buildSnapshot(1, false).wave < 3; t++) {
      const s = brSim.buildSnapshot(1, false);
      if (s.pendingBoonOffer) {
        brSim.commands.enqueue({ type: 'pickBoon', boonId: s.pendingBoonOffer.options[0]! });
      }
      brSim.tick();
    }
    expect(brSim.buildSnapshot(1, false).wave).toBeGreaterThanOrEqual(3);
    expect(boonOffersInBr).toBeGreaterThanOrEqual(1);

    // 3. MetaStore: Daily Challenge tier/streak, Boss Rush settlement, Endless 40+ milestones, Hall of Fame persistence
    const backing = new Map<string, string>();
    const storage: StorageLike = {
      getItem: (k) => backing.get(k) ?? null,
      setItem: (k, v) => {
        backing.set(k, v);
      },
      removeItem: (k) => {
        backing.delete(k);
      },
    };
    const meta = new MetaStore(storage);
    const d1 = meta.settleRun({
      wave: 20,
      monstersSlain: 260,
      bossesSlain: 4,
      difficulty: 'hard',
      runMode: 'daily_challenge',
      victory: true,
      elapsedTicks: 9000,
      totalDamage: 1_500_000,
      topHeroId: 'cheonma',
      topHeroName: '천마',
      dateKey: '2026-11-19',
    });
    expect(d1.dailyChallengeScore).toBeGreaterThan(20000);
    expect(d1.firstClearBonusGold).toBeGreaterThan(0);

    // Consecutive day increments streak
    const d2 = meta.settleRun({
      wave: 20,
      monstersSlain: 250,
      bossesSlain: 4,
      difficulty: 'hard',
      runMode: 'daily_challenge',
      victory: true,
      elapsedTicks: 8500,
      totalDamage: 1_800_000,
      topHeroId: 'sword_immortal',
      topHeroName: '태상검선',
      dateKey: '2026-11-20',
    });
    expect(d2.dailyChallengeScore).toBeGreaterThan(0);

    // Boss Rush 10-stage clear
    const brSettle = meta.settleRun({
      wave: 10,
      monstersSlain: 10,
      bossesSlain: 10,
      difficulty: 'normal',
      runMode: 'boss_rush',
      victory: true,
      elapsedTicks: 6000,
      totalDamage: 12_000_000,
      topHeroId: 'cheonma',
      topHeroName: '천마',
    });
    expect(brSettle.firstClearBonusGold).toBe(350);
    expect(brSettle.firstClearBonusSilk).toBe(50);

    // Endless 50-wave settlement awards both 40 and 50 milestones once (no double claim on second run)
    const end1 = meta.settleRun({
      wave: 52,
      monstersSlain: 1200,
      bossesSlain: 10,
      difficulty: 'normal',
      runMode: 'standard',
      victory: true,
      elapsedTicks: 24000,
      totalDamage: 45_000_000,
      topHeroId: 'hell_flame_sovereign',
      topHeroName: '구천염황',
    });
    expect(end1.unlockedEndlessMilestones).toEqual([40, 50]);
    expect(end1.endlessBonusGold).toBe(ENDLESS_MILESTONES[0]!.rewardGold + ENDLESS_MILESTONES[1]!.rewardGold);
    expect(end1.endlessBonusSilk).toBe(ENDLESS_MILESTONES[0]!.rewardSilk + ENDLESS_MILESTONES[1]!.rewardSilk);

    const end2 = meta.settleRun({
      wave: 55,
      monstersSlain: 1300,
      bossesSlain: 11,
      difficulty: 'normal',
      runMode: 'standard',
      victory: true,
      elapsedTicks: 25000,
      totalDamage: 50_000_000,
    });
    expect(end2.unlockedEndlessMilestones).toEqual([]);
    expect(end2.endlessBonusGold).toBe(0);

    // Reload from storage and verify persistence of streak, bossRushRecord, endless milestones, and Hall of Fame
    const metaReloaded = new MetaStore(storage);
    const prof = metaReloaded.getProfile();
    expect(prof.dailyChallengeStreak).toBe(2);
    expect(prof.bossRushRecord.clears).toBe(1);
    expect(prof.bossRushRecord.bestStage).toBe(10);
    expect(prof.endlessMilestonesCleared).toEqual([40, 50]);
    expect(prof.hallOfFame.length).toBeGreaterThanOrEqual(4);
    expect(prof.hallOfFame[0]!.wave).toBe(55);
  });

  it('v2.6: fires deterministic Combo Skills (문파 연환절기), supports new Immortal alt recipes, and awards permanent Codex Milestone ATK bonuses', () => {
    const data = loadGameData();

    // 1. Combo Skill activation, firing, cooldown reset, save/restore, and bench deactivation
    const sim = new Simulation(data, 0x26260001);
    const craftById = (recipeId: string): void => {
      const leaves = sim.recipeGraph.leafCost.get(recipeId)!;
      for (const [unitId, count] of leaves) {
        for (let i = 0; i < count; i++) {
          sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
          sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId });
        }
      }
      sim.tick();
      sim.commands.enqueue({ type: 'craft', recipeId, chain: true });
      sim.tick();
    };
    craftById('r_sword_saint');
    craftById('r_murim_lord');
    sim.commands.enqueue({ type: 'autoArrange', preserveBenchPassives: false });
    sim.tick();

    const snap0 = sim.buildSnapshot(1, false);
    expect(snap0.activeCombos.some((c) => c.id === 'combo_orthodox_masters')).toBe(true);

    let comboHits = 0;
    sim.events.on('combo:triggered', (ev) => {
      if (ev.comboId === 'combo_orthodox_masters') {
        comboHits++;
        expect(ev.totalDamage).toBeGreaterThan(0);
      }
    });
    for (let t = 0; t < 350 && comboHits === 0; t++) {
      sim.tick();
    }
    expect(comboHits).toBeGreaterThanOrEqual(1);
    const afterFire = sim.buildSnapshot(1, false).activeCombos.find((c) => c.id === 'combo_orthodox_masters')!;
    expect(afterFire.triggerCount).toBeGreaterThanOrEqual(1);
    expect(afterFire.cooldownLeftTicks).toBeGreaterThan(500);

    // Save/restore preserves combo cooldown & trigger count
    const saved = sim.exportRunSave(Date.now());
    const simRestored = new Simulation(data, 0x26260001);
    expect(simRestored.restoreRunSave(saved)).toBe(true);
    const restoredCombo = simRestored
      .buildSnapshot(1, false)
      .activeCombos.find((c) => c.id === 'combo_orthodox_masters')!;
    expect(restoredCombo.triggerCount).toBe(afterFire.triggerCount);

    // Moving one partner to bench deactivates the combo
    const murimLord = sim.getUnits().find((u) => u.unitId === 'murim_lord')!;
    sim.commands.enqueue({ type: 'move', from: murimLord.slot, to: { area: 'bench', index: 0 } });
    sim.tick();
    expect(sim.buildSnapshot(1, false).activeCombos.length).toBe(0);

    // 2. Verify new alternate Immortal recipes exist in recipeGraph
    expect(sim.recipeGraph.recipesById.get('r_alt_cheonma_flame')?.output).toBe('cheonma');
    expect(sim.recipeGraph.recipesById.get('r_alt_wuji_lord')?.output).toBe('wuji_grandmaster');

    // 3. Codex Milestones (10/20/30/44) claim + permanent ATK bonus + backup round-trip
    const backing = new Map<string, string>();
    const storage: StorageLike = {
      getItem: (k) => backing.get(k) ?? null,
      setItem: (k, v) => {
        backing.set(k, v);
      },
      removeItem: (k) => {
        backing.delete(k);
      },
    };
    const meta = new MetaStore(storage);
    // Cannot claim 10-hero milestone with 0 discovered
    expect(meta.claimCodexMilestone(10).ok).toBe(false);

    // Discover 10 heroes
    for (const u of data.units.slice(0, 10)) {
      const g = data.gradesById.get(u.grade)!;
      meta.discoverUnit(u, g);
    }
    expect(meta.getProfile().claimableCodexCount).toBe(1);
    const claim10 = meta.claimCodexMilestone(10);
    expect(claim10.ok).toBe(true);
    if (claim10.ok) {
      expect(claim10.rewardGold).toBe(150);
      expect(claim10.atkBonusPct).toBe(2);
      expect(claim10.totalCodexAtkBonusPct).toBe(2);
    }
    // No double-claim
    expect(meta.claimCodexMilestone(10).ok).toBe(false);

    // Persists across reload and boosts Simulation ATK live via syncMetaBonuses
    const metaReloaded = new MetaStore(storage);
    expect(metaReloaded.getCodexAtkBonusPct()).toBe(2);
    expect(metaReloaded.getProfile().claimedCodexMilestones).toEqual([10]);

    const simCodex = new Simulation(data, 0x26260002, {}, 'normal', null, false, {
      codexAtkBonusPct: 0,
    });
    const baseCheonma = simCodex.getUnitEffectiveAtk('cheonma');
    simCodex.commands.enqueue({ type: 'syncMetaBonuses', codexAtkBonusPct: 11 });
    simCodex.tick();
    const boostedCheonma = simCodex.getUnitEffectiveAtk('cheonma');
    expect(boostedCheonma.baseAtk + boostedCheonma.bonusAtk).toBeGreaterThan(
      baseCheonma.baseAtk + baseCheonma.bonusAtk,
    );
  });

  it('v3.0: supports dynamic BGM/SFX & Haptics, Mythic Relic Engraving, 강호 경지 단련 Mastery, and 3 Arena Theme hazard rules', () => {
    const data = loadGameData();
    const backing = new Map<string, string>();
    const storage: StorageLike = {
      getItem: (k) => backing.get(k) ?? null,
      setItem: (k, v) => {
        backing.set(k, v);
      },
      removeItem: (k) => {
        backing.delete(k);
      },
    };

    // 1. SoundSynthesizer BGM state + toggle persistence + new SFX + HapticsController
    const sfx = new SoundSynthesizer(storage);
    expect(sfx.isBgmEnabled()).toBe(true);
    expect(sfx.toggleBgm()).toBe(false);
    sfx.setBgmState('boss');
    expect(sfx.getBgmState()).toBe('boss');
    sfx.playAwaken(3);
    sfx.playComboSkill();
    sfx.playBossRetry();
    sfx.playMilestone();
    const sfxReloaded = new SoundSynthesizer(storage);
    expect(sfxReloaded.isBgmEnabled()).toBe(false);

    const hap = new HapticsController(storage);
    expect(hap.isEnabled()).toBe(true);
    hap.trigger('heavy');
    expect(hap.toggle()).toBe(false);
    expect(new HapticsController(storage).isEnabled()).toBe(false);

    // 2. Mythic Relic Engraving (Lv.15 sink) & 강호 경지 단련 Mastery (gold+silk sink) + persistence
    const meta = new MetaStore(storage);
    const jadeDef = data.relicsById.get('founding_jade_seal')!;
    // Cannot engrave below Lv.15
    expect(meta.engraveRelic(jadeDef).ok).toBe(false);

    // Grant resources to max jade seal to Lv.15 + engrave + upgrade mastery
    meta.grantDevMeta(50000, 10);
    // Earn silk via Boss Rush clear + endless 50 clear
    meta.settleRun({
      wave: 10,
      monstersSlain: 10,
      bossesSlain: 10,
      runMode: 'boss_rush',
      victory: true,
      elapsedTicks: 5000,
    });
    for (let i = 0; i < 15; i++) {
      const up = meta.upgradeRelic(jadeDef);
      expect(up.ok).toBe(true);
    }
    expect(meta.getRelicLevels().founding_jade_seal).toBe(15);

    const eng = meta.engraveRelic(jadeDef);
    expect(eng.ok).toBe(true);
    if (eng.ok) {
      expect(eng.engravedCount).toBe(1);
      expect(eng.endgameBonuses.atkPct).toBe(2);
      expect(eng.endgameBonuses.skillDamagePct).toBe(2);
    }
    // No double engrave
    expect(meta.engraveRelic(jadeDef).ok).toBe(false);

    // Upgrade Mastery pillars (atk + econ + crit + boss)
    const mAtk = meta.upgradeMastery('atk');
    const mEcon = meta.upgradeMastery('econ');
    const mCrit = meta.upgradeMastery('crit');
    const mBoss = meta.upgradeMastery('boss');
    expect(mAtk.ok && mEcon.ok && mCrit.ok && mBoss.ok).toBe(true);

    // Reload from storage and verify persistence + MRD1 backup round-trip
    const metaReloaded = new MetaStore(storage);
    const prof = metaReloaded.getProfile();
    expect(prof.engravedCount).toBe(1);
    expect(prof.engravedRelics.founding_jade_seal).toBe(true);
    expect(prof.masteryLevels).toEqual({ atk: 1, econ: 1, crit: 1, boss: 1 });
    expect(prof.endgameBonuses.startCoin).toBe(5);
    expect(prof.endgameBonuses.atkPct).toBe(4); // round(1.5)=2 + 2 engraved = 4

    const backupCode = metaReloaded.exportBackupCode();
    const metaFresh = new MetaStore(null);
    expect(metaFresh.importBackupCode(backupCode).ok).toBe(true);
    expect(metaFresh.getProfile().engravedCount).toBe(1);
    expect(metaFresh.getProfile().masteryLevels.atk).toBe(1);

    // 3. 3 new Arena Themes with tactical rules (frost_chill / sandstorm_crit / bloodflame_forge)
    expect(data.courtSkinsById.get('court_frost_palace')?.arenaRule).toBe('frost_chill');
    expect(data.courtSkinsById.get('court_western_desert')?.arenaRule).toBe('sandstorm_crit');
    expect(data.courtSkinsById.get('court_demonic_citadel')?.arenaRule).toBe('bloodflame_forge');

    // Frost Chill slows monsters by 10% compared to default arena
    const simBase = new Simulation(data, 0x30300001, {}, 'normal', null, false, {
      arenaRule: null,
    });
    const simFrost = new Simulation(data, 0x30300001, {}, 'normal', null, false, {
      arenaRule: 'frost_chill',
    });
    for (let t = 0; t < 120; t++) {
      simBase.tick();
      simFrost.tick();
    }
    const baseDist = simBase.getMonsters()[0]?.currDistance ?? 0;
    const frostDist = simFrost.getMonsters()[0]?.currDistance ?? 0;
    expect(baseDist).toBeGreaterThan(0);
    expect(frostDist).toBeLessThan(baseDist * 0.94);

    // Bloodflame Forge gives base +5% ATK and Mastery startCoin boosts starting coin
    const simForge = new Simulation(data, 0x30300002, {}, 'normal', null, false, {
      arenaRule: 'bloodflame_forge',
      endgameBonuses: prof.endgameBonuses,
    });
    expect(simForge.buildSnapshot(1, false).arenaRule).toBe('bloodflame_forge');
    expect(simForge.buildSnapshot(1, false).coin).toBe(data.board.economy.initialCoin + 5);
    const baseAtk = simBase.getUnitEffectiveAtk('cheonma');
    const forgeAtk = simForge.getUnitEffectiveAtk('cheonma');
    expect(forgeAtk.baseAtk + forgeAtk.bonusAtk).toBeGreaterThan(baseAtk.baseAtk + baseAtk.bonusAtk);
  });

  it('supports v3.1 Wuxia progression: Cultivation Realm XP, 8 Extraordinary Meridians (기경팔맥), 44-Hero Proficiency, and backup persistence', () => {
    const data = loadGameData();
    const mem = new Map<string, string>();
    const storage: StorageLike = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => {
        mem.set(k, v);
      },
      removeItem: (k) => {
        mem.delete(k);
      },
    };
    const meta = new MetaStore(storage);
    expect(meta.getProfile().cultivation.level).toBe(1);
    expect(meta.getProfile().unspentMeridianPoints).toBe(0);

    // Settle a victorious Wave 30 run with hero contributions (cheonma MVP + sword_immortal)
    const rec = meta.settleRun({
      wave: 30,
      monstersSlain: 420,
      bossesSlain: 6,
      bountiesSlain: 2,
      difficulty: 'hard',
      victory: true,
      totalDamage: 1_000_000,
      topHeroId: 'cheonma',
      topHeroName: '천마',
      heroContributions: [
        { unitId: 'cheonma', damage: 700_000, onBoard: true },
        { unitId: 'sword_immortal', damage: 300_000, onBoard: true },
      ],
    });

    expect(rec.cultivationXpEarned).toBeGreaterThan(500);
    expect(rec.newCultivationLevel).toBeGreaterThanOrEqual(5);
    expect(rec.meridianPointsEarned).toBe(rec.newCultivationLevel - 1);
    expect(rec.heroRankUps.length).toBeGreaterThanOrEqual(2);
    expect(rec.heroProficiencyBonusGold).toBeGreaterThan(0);

    // Claim Lv.5 Realm Breakthrough Milestone (이류무사)
    const pAfterRun = meta.getProfile();
    expect(pAfterRun.claimableRealmCount).toBeGreaterThanOrEqual(1);
    const claimRealm5 = meta.claimRealmMilestone(5);
    expect(claimRealm5.ok).toBe(true);
    if (claimRealm5.ok) {
      expect(claimRealm5.rewardGold).toBe(150);
      expect(claimRealm5.rewardKeys).toBe(1);
    }
    expect(meta.claimRealmMilestone(5).ok).toBe(false); // no double claim

    // Grant extra XP so we have >= 8 Meridian points to unlock 소주천 개통 (all 8 Meridians Lv.1)
    meta.grantCultivationXp(1500);
    const merIds = ['ren', 'du', 'chong', 'dai', 'yangqiao', 'yinqiao', 'yangwei', 'yinwei'] as const;
    for (const mid of merIds) {
      const mRes = meta.upgradeMeridian(mid);
      expect(mRes.ok).toBe(true);
    }
    const pCycle = meta.getProfile();
    expect(pCycle.spentMeridianPoints).toBe(8);
    expect(pCycle.endgameBonuses.meridianCycleTier).toBe(1); // 소주천 개통!
    expect(pCycle.endgameBonuses.atkPct).toBe(6); // du(+2%) + 소주천(+4%)
    expect(pCycle.endgameBonuses.startCoin).toBe(23); // ren(+8) + 소주천(+15)
    expect(pCycle.endgameBonuses.armorShred).toBe(2);
    expect(pCycle.endgameBonuses.speedPct).toBe(2.5);
    expect(pCycle.endgameBonuses.gambleBonusPct).toBe(2);

    // Verify Simulation applies Meridian bonuses AND per-hero Proficiency ATK%
    const cheonmaProfPct = pCycle.heroMasteryAtkPct.cheonma ?? 0;
    expect(cheonmaProfPct).toBeGreaterThanOrEqual(3);
    const simPlain = new Simulation(data, 0x31310001);
    const simProgressed = new Simulation(data, 0x31310001, {}, 'normal', null, false, {
      endgameBonuses: pCycle.endgameBonuses,
      heroMasteryAtkPct: pCycle.heroMasteryAtkPct,
    });
    expect(simProgressed.buildSnapshot(1, false).coin).toBe(
      data.board.economy.initialCoin + pCycle.endgameBonuses.startCoin,
    );
    expect(simProgressed.getEffectiveGambleBonusPct()).toBe(
      simPlain.getEffectiveGambleBonusPct() + (pCycle.endgameBonuses.gambleBonusPct ?? 0),
    );
    const plainCheonmaAtk = simPlain.getUnitEffectiveAtk('cheonma');
    const progCheonmaAtk = simProgressed.getUnitEffectiveAtk('cheonma');
    expect(progCheonmaAtk.baseAtk + progCheonmaAtk.bonusAtk).toBeGreaterThan(
      plainCheonmaAtk.baseAtk + plainCheonmaAtk.bonusAtk,
    );

    // Backup code round-trip + Meridian reset
    const code = meta.exportBackupCode();
    const restored = new MetaStore(null);
    expect(restored.importBackupCode(code).ok).toBe(true);
    const rProf = restored.getProfile();
    expect(rProf.cultivation.totalXp).toBe(pCycle.cultivation.totalXp);
    expect(rProf.spentMeridianPoints).toBe(8);
    expect(rProf.claimedRealmMilestones).toContain(5);
    expect(rProf.heroProficiency.cheonma?.mvpCount).toBe(1);
    expect(rProf.heroMasteryAtkPct.cheonma).toBe(cheonmaProfPct);

    const resetRes = restored.resetMeridians();
    expect(resetRes.ok).toBe(true);
    if (resetRes.ok) {
      expect(resetRes.refundedPoints).toBe(8);
    }
    expect(restored.getProfile().spentMeridianPoints).toBe(0);
    expect(restored.getProfile().unspentMeridianPoints).toBe(rProf.cultivation.totalMeridianPoints);
  });

  it('supports v3.2 Divine Armaments (신병이기 3슬롯 주조·재연마·장착·공명, 합공 자동계승, 판매 안전회수, 1x=3x 결정성)', () => {
    const data = loadGameData();
    const sim = new Simulation(data, 0x32320001, {}, 'normal', null, false, {
      heroMasteryAtkPct: { hwasan_novice: 15 }, // Lv.5 화신
    });
    expect(sim.getHeroMasteryAtkPct('hwasan_novice')).toBe(15);

    // Spawn hwasan_novice (orthodox) + mudang_disciple (orthodox) + cult_initiate (demonic)
    sim.commands.enqueue({ type: 'grantTestCoin', amount: 2000 });
    sim.commands.enqueue({ type: 'grantTestResource', luck: 20 });
    sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
    sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'hwasan_novice' });
    sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
    sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'mudang_disciple' });
    sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
    sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'cult_initiate' });
    sim.tick();

    const snap0 = sim.buildSnapshot(1, false);
    const hwasanSlot = snap0.field.find((u) => u?.unitId === 'hwasan_novice')!;
    const cultSlot = snap0.field.find((u) => u?.unitId === 'cult_initiate')!;
    expect(hwasanSlot).toBeDefined();
    expect(cultSlot).toBeDefined();
    const baseAtkBeforeArm = hwasanSlot.baseAtk + hwasanSlot.bonusAtk;

    // Forge all 3 Divine Armament slots (4th must reject)
    sim.commands.enqueue({ type: 'forgeArmament' });
    sim.commands.enqueue({ type: 'forgeArmament' });
    sim.commands.enqueue({ type: 'forgeArmament' });
    sim.commands.enqueue({ type: 'forgeArmament' });
    sim.tick();

    const snapForged = sim.buildSnapshot(1, false);
    expect(snapForged.armory.slots).toHaveLength(3);
    expect(snapForged.armory.nextForgeCost).toBeNull();
    expect(snapForged.rejects.some((r) => r.cmd === 'forgeArmament')).toBe(true);
    expect(new Set(snapForged.armory.slots.map((s) => s.armamentId)).size).toBe(3);

    // Reforge slot 0 to a different Armament
    const oldArm0 = snapForged.armory.slots[0]!.armamentId;
    sim.commands.enqueue({ type: 'reforgeArmament', slotIndex: 0 });
    sim.tick();
    const snapReforged = sim.buildSnapshot(1, false);
    const newArm0 = snapReforged.armory.slots[0]!.armamentId;
    expect(newArm0).not.toBe(oldArm0);

    // Equip slot 0 onto hwasan_novice and verify ATK increases + SlotView.equippedArmament populated
    sim.commands.enqueue({ type: 'equipArmament', slotIndex: 0, targetUid: hwasanSlot.uid });
    sim.commands.enqueue({ type: 'equipArmament', slotIndex: 1, targetUid: null });
    sim.commands.enqueue({ type: 'equipArmament', slotIndex: 2, targetUid: cultSlot.uid });
    sim.tick();

    const snapEquipped = sim.buildSnapshot(1, false);
    const hwasanArmed = snapEquipped.field.find((u) => u?.uid === hwasanSlot.uid)!;
    expect(hwasanArmed.equippedArmament?.id).toBe(newArm0);
    expect(hwasanArmed.baseAtk + hwasanArmed.bonusAtk).toBeGreaterThan(baseAtkBeforeArm);

    const arm0Def = data.armamentsById.get(newArm0)!;
    expect(hwasanArmed.equippedArmament?.resonanceActive).toBe(
      arm0Def.resonance.faction === 'orthodox',
    );

    // Craft r_plum_swordsman (hwasan_novice + mudang_disciple -> plum_swordsman):
    // Slot 0 armament on hwasan_novice must automatically inherit onto the newly crafted plum_swordsman!
    sim.commands.enqueue({ type: 'craft', recipeId: 'r_plum_swordsman', chain: false });
    sim.tick();
    const snapAfterCraft = sim.buildSnapshot(1, false);
    const plumUnit = snapAfterCraft.field.find((u) => u?.unitId === 'plum_swordsman')!;
    expect(plumUnit).toBeDefined();
    expect(plumUnit.equippedArmament?.id).toBe(newArm0);
    expect(snapAfterCraft.armory.slots[0]?.equippedUid).toBe(plumUnit.uid);

    // Selling cult_initiate safely returns slot 2 armament to armory bag (equippedUid === null, never lost!)
    sim.commands.enqueue({ type: 'sell', uid: cultSlot.uid });
    sim.tick();
    const snapAfterSell = sim.buildSnapshot(1, false);
    expect(snapAfterSell.armory.slots).toHaveLength(3);
    expect(snapAfterSell.armory.slots[2]?.equippedUid).toBeNull();

    // Save & restore round-trip preserves armory & equipped state + 1x=3x replay determinism
    const saved = sim.exportRunSave(12345);
    const simRestored = new Simulation(data, 0x99999999);
    expect(simRestored.restoreRunSave(saved)).toBe(true);
    expect(simRestored.hashState()).toBe(sim.hashState());

    const cmdHistory = sim.commands.getHistory();
    const simReplayA = new Simulation(data, 0x32320001, {}, 'normal', null, false, {
      heroMasteryAtkPct: { hwasan_novice: 15 },
    });
    const simReplayB = new Simulation(data, 0x32320001, {}, 'normal', null, false, {
      heroMasteryAtkPct: { hwasan_novice: 15 },
    });
    simReplayA.scheduleCommandsForReplay(cmdHistory);
    simReplayB.scheduleCommandsForReplay(cmdHistory);
    while (simReplayA.tickCount < sim.tickCount) {
      simReplayA.tick();
    }
    while (simReplayB.tickCount < sim.tickCount) {
      for (let step = 0; step < 3 && simReplayB.tickCount < sim.tickCount; step++) {
        simReplayB.tick();
      }
    }
    expect(simReplayA.hashState()).toBe(sim.hashState());
    expect(simReplayB.hashState()).toBe(sim.hashState());
  });

  it('executes v3.3 Four Symbols Boss patterns & counterplay: 창궁청룡 (역뢰 파훼 +70은자) and 남명주작 (열반화란 파훼 영단+1·은자+80)', () => {
    const data = loadGameData();

    // 1. Boss Rush Stage 4 = 창궁신수 청룡 (azure_dragon)
    const simDragon = new Simulation(data, 0x33040001, {}, 'hard', null, false, {
      runMode: 'boss_rush',
    });
    // Advance run state cleanly to Boss Rush Stage 4 by restoring a Stage 4 snapshot with 1 field unit
    simDragon.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'hwasan_novice' });
    simDragon.tick();
    const baseSave = simDragon.exportRunSave(100);
    const stage4Save = {
      ...baseSave,
      waveNumber: 4,
      waveTicksLeft: 52 * 30,
      spawnedInWave: 0,
      nextSpawnTick: simDragon.tickCount + 1,
      monsters: [],
      tileHazards: [],
    };
    expect(simDragon.restoreRunSave(stage4Save)).toBe(true);

    const dragonEvents: string[] = [];
    simDragon.events.on('boss:skill', (ev) => {
      dragonEvents.push(ev.skillKind);
    });

    // Tick until azure_dragon casts dragon_thunder_warn
    let warnedTile: number | null = null;
    for (let t = 0; t < 200; t++) {
      simDragon.tick();
      const hazards = simDragon.getTileHazards();
      if (hazards.length > 0 && hazards[0]?.hazardKind === 'thunder') {
        warnedTile = hazards[0].fieldIndex;
        break;
      }
    }
    expect(dragonEvents).toContain('dragon_thunder_warn');
    expect(warnedTile).not.toBeNull();

    // Evacuate the warned field tile to an empty bench slot before activateTick!
    const coinBeforeBackfire = simDragon.buildSnapshot(1, false).coin;
    if (simDragon.board.field.getUidAt(warnedTile!) !== null) {
      simDragon.commands.enqueue({
        type: 'move',
        from: { area: 'field', index: warnedTile! },
        to: { area: 'bench', index: 0 },
      });
    }
    for (let t = 0; t < 70; t++) {
      simDragon.tick();
      if (dragonEvents.includes('dragon_backfire')) break;
    }
    expect(dragonEvents).toContain('dragon_backfire');
    expect(simDragon.buildSnapshot(1, false).coin).toBeGreaterThanOrEqual(coinBeforeBackfire + 70);
    const dragonEnt = simDragon.getMonsters().find((m) => m.kind === 'azure_dragon')!;
    expect(dragonEnt).toBeDefined();
    expect(dragonEnt.armorShred).toBeGreaterThanOrEqual(25);

    // 2. Boss Rush Stage 5 = 남명신수 주작 (vermilion_bird) Nirvana Flame Egg shatter counterplay!
    const simPhoenix = new Simulation(data, 0x33050002, {}, 'hard', null, false, {
      runMode: 'boss_rush',
    });
    spawnCheonmaHelper(simPhoenix);
    simPhoenix.commands.enqueue({ type: 'grantTestCoin', amount: 3000 });
    simPhoenix.commands.enqueue({ type: 'upgrade', group: 'demonic', count: 10 });
    simPhoenix.tick();

    const phoenixBase = simPhoenix.exportRunSave(200);
    const stage5Save = {
      ...phoenixBase,
      waveNumber: 5,
      waveTicksLeft: 55 * 30,
      spawnedInWave: 0,
      nextSpawnTick: simPhoenix.tickCount + 1,
      monsters: [],
      tileHazards: [],
    };
    expect(simPhoenix.restoreRunSave(stage5Save)).toBe(true);

    const phoenixEvents: string[] = [];
    let luckAtEgg = 0;
    let coinAtEgg = 0;
    simPhoenix.events.on('boss:skill', (ev) => {
      phoenixEvents.push(ev.skillKind);
      if (ev.skillKind === 'phoenix_rebirth_egg' && luckAtEgg === 0) {
        const snapNow = simPhoenix.buildSnapshot(1, false);
        luckAtEgg = snapNow.luckStone;
        coinAtEgg = snapNow.coin;
      }
    });

    for (let t = 0; t < 450; t++) {
      simPhoenix.tick();
      if (phoenixEvents.includes('phoenix_shatter')) break;
    }
    expect(phoenixEvents).toContain('phoenix_rebirth_egg');
    expect(phoenixEvents).toContain('phoenix_shatter');
    const snapAfterShatter = simPhoenix.buildSnapshot(1, false);
    expect(snapAfterShatter.luckStone).toBeGreaterThanOrEqual(luckAtEgg + 1);
    expect(snapAfterShatter.coin).toBeGreaterThanOrEqual(coinAtEgg + 80);
  });

  it('executes v3.4 5-Sect Starting Vows (supplies, perks, vow quest) and unlocks v3.5 Hidden Primordial Mythic 3-Transcendent recipes + 3-Hero Trinity Combos deterministically', () => {
    const data = loadGameData();

    // 1. Verify all 5 Sects grant starting supplies & perks, reject duplicate pledges and Wave > 3 pledges
    for (const sectId of ['hwasan', 'shaolin', 'tang', 'cheonma_cult', 'gaebang'] as const) {
      const s = new Simulation(data, 0x20263435);
      const before = s.buildSnapshot(1, false);
      expect(before.sect.canPledge).toBe(true);
      expect(before.primordialUnlocked).toBe(false);

      s.commands.enqueue({ type: 'pledgeSect', sectId });
      s.tick();

      const after = s.buildSnapshot(1, false);
      const def = data.sectsById.get(sectId)!;
      expect(after.sect.pledgedId).toBe(sectId);
      expect(after.sect.canPledge).toBe(false);
      expect(after.coin).toBe(before.coin + def.start.coin);
      expect(after.luckStone).toBe(before.luckStone + def.start.luck);
      if (def.start.freeUpgradeGroup) {
        expect(after.upgradeLv[def.start.freeUpgradeGroup]).toBe(1);
      }
      if (def.start.unitId) {
        expect(after.field.some((slot) => slot?.unitId === def.start.unitId)).toBe(true);
      }

      // Duplicate pledge rejected
      s.commands.enqueue({ type: 'pledgeSect', sectId: 'hwasan' });
      s.tick();
      expect(s.buildSnapshot(1, false).rejects.some((r) => r.cmd === 'pledgeSect')).toBe(true);
    }

    // Wave > 3 pledge rejected
    const simLate = new Simulation(data, 0x77778888);
    const lateSave = { ...simLate.exportRunSave(1), waveNumber: 4 };
    expect(simLate.restoreRunSave(lateSave)).toBe(true);
    expect(simLate.buildSnapshot(1, false).sect.canPledge).toBe(false);
    simLate.commands.enqueue({ type: 'pledgeSect', sectId: 'gaebang' });
    simLate.tick();
    expect(simLate.buildSnapshot(1, false).rejects.some((r) => r.cmd === 'pledgeSect')).toBe(true);

    // 2. Verify Primordial recipes are sealed until Sect Vow completion, then unseal & craft all 3 Primordial Mythics + trigger 3-hero Trinity Combo!
    const simMythic = new Simulation(data, 0x34350001);
    const craftTranscendent = (sim: Simulation, recipeId: string): void => {
      const leaves = sim.recipeGraph.leafCost.get(recipeId)!;
      for (const [unitId, count] of leaves) {
        for (let i = 0; i < count; i++) {
          sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
          sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId });
        }
      }
      sim.tick();
      sim.commands.enqueue({ type: 'craft', recipeId, chain: true });
      sim.tick();
    };

    // Assemble the 3 Transcendents for r_primordial_sword_god BEFORE unlocking primordial
    craftTranscendent(simMythic, 'r_sword_saint');
    craftTranscendent(simMythic, 'r_murim_lord');
    craftTranscendent(simMythic, 'r_ice_palace_empress');

    const sealedSnap = simMythic.buildSnapshot(1, false);
    expect(sealedSnap.primordialUnlocked).toBe(false);
    expect(sealedSnap.craft.recipes.r_primordial_sword_god?.lamp).toBe('partial');
    expect(sealedSnap.craft.readyCount).toBe(0);

    // Attempting to craft sealed r_primordial_sword_god is rejected
    simMythic.commands.enqueue({ type: 'craft', recipeId: 'r_primordial_sword_god', chain: false });
    simMythic.tick();
    expect(simMythic.buildSnapshot(1, false).rejects.some((r) => r.cmd === 'craft')).toBe(true);

    // Pledge Cheonma Cult (Vow: own >= 2 rank >= 4 heroes -> already satisfied by our 3 Transcendents!)
    let vowFulfilledSeen = false;
    let mythicUnlockedSeen = false;
    simMythic.events.on('sect:vow_fulfilled', () => {
      vowFulfilledSeen = true;
    });
    simMythic.events.on('mythic:unlocked', () => {
      mythicUnlockedSeen = true;
    });
    const atkBeforeSect = simMythic.getUnitEffectiveAtk('heavenly_demon_heir');
    simMythic.commands.enqueue({ type: 'pledgeSect', sectId: 'cheonma_cult' });
    simMythic.tick();
    const atkAfterSect = simMythic.getUnitEffectiveAtk('heavenly_demon_heir');
    expect(atkAfterSect.baseAtk + atkAfterSect.bonusAtk).toBeGreaterThan(
      atkBeforeSect.baseAtk + atkBeforeSect.bonusAtk,
    );

    expect(vowFulfilledSeen).toBe(true);
    expect(mythicUnlockedSeen).toBe(true);
    const unsealedSnap = simMythic.buildSnapshot(1, false);
    expect(unsealedSnap.sect.vowCompleted).toBe(true);
    expect(unsealedSnap.primordialUnlocked).toBe(true);
    expect(unsealedSnap.craft.recipes.r_primordial_sword_god?.lamp).toBe('ready');

    // Craft primordial_sword_god!
    simMythic.commands.enqueue({ type: 'craft', recipeId: 'r_primordial_sword_god', chain: false });
    simMythic.tick();
    expect(simMythic.getUnits().some((u) => u.unitId === 'primordial_sword_god')).toBe(true);

    // Craft chaos_poison_emperor & void_heavenly_demon as well to complete the Primordial Trinity!
    craftTranscendent(simMythic, 'r_mad_demon');
    craftTranscendent(simMythic, 'r_poison_dragon');
    craftTranscendent(simMythic, 'r_blood_shadow_sovereign');
    simMythic.commands.enqueue({ type: 'craft', recipeId: 'r_chaos_poison_emperor', chain: false });
    simMythic.tick();

    craftTranscendent(simMythic, 'r_heavenly_demon_heir');
    craftTranscendent(simMythic, 'r_nether_blade_queen');
    craftTranscendent(simMythic, 'r_abyss_blood_emperor');
    simMythic.commands.enqueue({ type: 'craft', recipeId: 'r_void_heavenly_demon', chain: false });
    simMythic.tick();

    const trinitySnap = simMythic.buildSnapshot(1, false);
    expect(
      trinitySnap.activeCombos.some(
        (c) => c.id === 'combo_primordial_genesis' && c.unitIds.length === 3,
      ),
    ).toBe(true);

    // Save/restore round-trip preserves pledgedSect, sectVowCompleted, and primordialUnlocked
    const saved = simMythic.exportRunSave(999);
    const restored = new Simulation(data, 0x11112222);
    expect(restored.restoreRunSave(saved)).toBe(true);
    expect(restored.hashState()).toBe(simMythic.hashState());

    // Let monsters spawn and verify 3-hero Trinity Combo triggers with 3 casterPositions!
    let trinityTriggered = false;
    let trinityCasterCount = 0;
    simMythic.events.on('combo:triggered', (ev) => {
      if (ev.comboId === 'combo_primordial_genesis') {
        trinityTriggered = true;
        trinityCasterCount = ev.casterPositions?.length ?? 0;
      }
    });
    for (let t = 0; t < 300 && !trinityTriggered; t++) {
      simMythic.tick();
    }
    expect(trinityTriggered).toBe(true);
    expect(trinityCasterCount).toBe(3);

    // Verify 1x vs 3x determinism with pledgeSect + gamble!
    const det1x = new Simulation(data, 0x3435abcd);
    const det3x = new Simulation(data, 0x3435abcd);
    const log = [
      { tick: 0, command: { type: 'pledgeSect' as const, sectId: 'tang' as const } },
      { tick: 3, command: { type: 'summon' as const } },
      { tick: 6, command: { type: 'gamble' as const, tier: 'uncommon' } },
      { tick: 9, command: { type: 'gamble' as const, tier: 'uncommon' } },
    ];
    det1x.scheduleCommandsForReplay(log);
    det3x.scheduleCommandsForReplay(log);
    for (let t = 0; t < 180; t++) det1x.tick();
    for (let t = 0; t < 180; t += 3) {
      det3x.tick();
      det3x.tick();
      det3x.tick();
    }
    expect(det3x.hashState()).toBe(det1x.hashState());
  });

  it('supports v3.6~v3.9 Endgame Ceiling Expansion: Chaos Shards Lv.30, 3-Slot Soul Forge, 20-Tier Ascension, Blessed 1.5x Relics & Reincarnation', () => {
    const data = loadGameData();
    const storeMap = new Map<string, string>();
    const memStorage: StorageLike = {
      getItem: (k) => storeMap.get(k) ?? null,
      setItem: (k, v) => {
        storeMap.set(k, v);
      },
      removeItem: (k) => {
        storeMap.delete(k);
      },
    };
    const meta = new MetaStore(memStorage);
    meta.grantDevMeta(200000, 120);

    // Max all 16 relics to base Lv.15 (태극신화)
    for (const def of data.relics) {
      while ((meta.getProfile().relics[def.id] ?? 0) < def.maxLevel) {
        const up = meta.upgradeRelic(def);
        expect(up.ok).toBe(true);
      }
    }
    expect(computeRelicSetStatuses(meta.getRelicLevels()).every((s) => s.tier === 3)).toBe(true);

    // 1. v3.6: Keys & Gold NEVER lock out at Lv.15 — opens Chaos Transcendence Chest (+3 shards, +5 silk)
    const keysBefore = meta.getProfile().keys;
    const silkBefore = meta.getProfile().silk;
    const singleChaos = meta.drawRelic(data.relics, 'key', () => 0.1);
    expect(singleChaos.ok).toBe(true);
    if (singleChaos.ok) {
      expect(singleChaos.shardsGranted).toBe(3);
      expect(singleChaos.silkGranted).toBe(5);
    }
    expect(meta.getProfile().keys).toBe(keysBefore - 1);
    expect(meta.getProfile().silk).toBe(silkBefore + 5);

    const batchChaos = meta.drawRelicBatch(data.relics, 10, 'key', () => 0.0);
    expect(batchChaos.ok).toBe(true);
    if (batchChaos.ok) {
      expect(batchChaos.spentCount).toBe(10);
      expect(batchChaos.totalShardsGranted).toBe(30);
      expect(batchChaos.totalSilkGranted).toBe(50);
    }

    // Draw gold batches to farm shards and transcend golden_vault & first set to Lv.22 -> Lv.30!
    const firstSet = RELIC_SETS[0]!;
    firstSet.members.forEach((rid, idx) => {
      const rDef = data.relicsById.get(rid)!;
      const blessRes = meta.toggleBlessedRelic(rDef);
      expect(blessRes.ok).toBe(idx < 3);
    });
    for (let i = 0; i < 160; i++) {
      meta.grantDevMeta(5000, 10);
      meta.drawRelicBatch(data.relics, 10, 'key', () => (i % 16) / 16);
    }
    const vaultDef = data.relicsById.get('golden_vault')!;
    while ((meta.getProfile().relics.golden_vault ?? 0) < RELIC_MAX_LEVEL) {
      meta.grantDevMeta(5000, 10);
      meta.drawRelicBatch(data.relics, 10, 'key', () => 0.0);
      const tr = meta.transcendRelic(vaultDef);
      if (!tr.ok) break;
    }
    expect(meta.getProfile().relics.golden_vault).toBe(RELIC_MAX_LEVEL);

    // Verify Set Tier 4 (Lv.22) & Tier 5 (Lv.30)
    const tier4Map = { ...meta.getRelicLevels() };
    for (const rid of firstSet.members) tier4Map[rid] = 22;
    expect(computeRelicSetStatuses(tier4Map)[0]!.tier).toBe(4);
    const tier5Map = { ...meta.getRelicLevels() };
    for (const rid of firstSet.members) tier5Map[rid] = RELIC_MAX_LEVEL;
    expect(computeRelicSetStatuses(tier5Map)[0]!.tier).toBe(5);
    expect(computeRelicSetBonuses(tier5Map).interestPct).toBeGreaterThan(
      computeRelicSetBonuses(meta.getRelicLevels()).interestPct,
    );

    // 2. v3.7: 3-Slot Soul Forge (Engrave -> Initial Appraisal -> Lock 2 Slots -> Reroll 3rd Slot)
    expect(meta.engraveRelic(vaultDef).ok).toBe(true);
    const roll1 = meta.rerollRelicSoul(vaultDef, () => 0.01); // SSS rarity roll (< 0.05)
    expect(roll1.ok).toBe(true);
    if (roll1.ok) {
      expect(roll1.slots).toHaveLength(SOUL_SLOT_COUNT);
      expect(roll1.slots[0]!.rarity).toBe('SSS');
    }
    expect(meta.toggleRelicSoulLock('golden_vault', 0).ok).toBe(true);
    expect(meta.toggleRelicSoulLock('golden_vault', 1).ok).toBe(true);
    // Locking all 3 slots is prevented so at least 1 slot can be rerolled
    expect(meta.toggleRelicSoulLock('golden_vault', 2).ok).toBe(false);

    const lockedSlot0 = meta.getProfile().relicSoulSlots.golden_vault![0]!;
    const roll2 = meta.rerollRelicSoul(vaultDef, () => 0.95); // B rarity roll for unlocked slot #2
    expect(roll2.ok).toBe(true);
    if (roll2.ok) {
      expect(roll2.slots[0]).toEqual(lockedSlot0);
      expect(roll2.slots[2]!.rarity).toBe('B');
      expect(roll2.slots[2]!.locked).toBe(false);
    }

    // 3. v3.8: 20-Tier Ascension Ladder (구천등선록)
    // On a clean MetaStore (without grantDevMeta dev unlock), clearing normal->hard->hell->abyss unlocks Ascension 1 -> clearing Ascension 1 unlocks Ascension 2 + drops shards!
    const ascStore = new Map<string, string>();
    const metaAsc = new MetaStore({
      getItem: (k) => ascStore.get(k) ?? null,
      setItem: (k, v) => {
        ascStore.set(k, v);
      },
    });
    expect(metaAsc.getProfile().unlockedAscensionLevel).toBe(0);
    for (const d of ['normal', 'hard', 'hell', 'abyss'] as const) {
      metaAsc.settleRun({ wave: 30, monstersSlain: 200, bossesSlain: 6, difficulty: d, victory: true });
    }
    expect(metaAsc.getProfile().unlockedAscensionLevel).toBe(1);
    expect(metaAsc.setSelectedAscensionLevel(1)).toBe(true);
    expect(metaAsc.setSelectedAscensionLevel(2)).toBe(false);

    const asc1Settle = metaAsc.settleRun({
      wave: 30,
      monstersSlain: 220,
      bossesSlain: 6,
      difficulty: 'abyss',
      ascensionLevel: 1,
      victory: true,
    });
    expect(asc1Settle.shardsEarned).toBeGreaterThan(0);
    expect(asc1Settle.unlockedNextAscensionLevel).toBe(2);
    expect(metaAsc.getProfile().unlockedAscensionLevel).toBe(2);
    expect(metaAsc.getProfile().clearedAscensionLevel).toBe(1);
    // Also record Ascension 5 clear on main `meta` for MRD1 backup round-trip verification below
    meta.settleRun({
      wave: 30,
      monstersSlain: 220,
      bossesSlain: 6,
      difficulty: 'abyss',
      ascensionLevel: 5,
      victory: true,
    });

    // Verify Ascension 15 tactical tribulations in Simulation (summon surcharge, gamble penalty, boss regen, Twin Boss on Wave 15)
    const simAsc0 = new Simulation(data, 0x7777, {}, 'abyss', null, false, { ascensionLevel: 0 });
    const simAsc15 = new Simulation(data, 0x7777, {}, 'abyss', null, false, {
      ascensionLevel: 15,
    });
    expect(simAsc15.ascensionLevel).toBe(15);
    expect(simAsc15.getSummonCost()).toBeGreaterThan(simAsc0.getSummonCost());
    expect(simAsc15.getEffectiveGambleBonusPct()).toBeLessThan(simAsc0.getEffectiveGambleBonusPct());
    expect(simAsc15.computeMonsterArmor(10, true, false)).toBeGreaterThan(
      simAsc0.computeMonsterArmor(10, true, false),
    );
    expect(computeWaveHpScale(data, 'abyss', null, 15, true, 15)).toBeGreaterThan(
      computeWaveHpScale(data, 'abyss', null, 15, true, 0),
    );

    // Advance simAsc15 to Wave 15 boss spawn and verify Twin Boss (2 bosses spawned) + armor shred regen!
    (simAsc15 as unknown as { waveNumber: number; spawnedInWave: number; nextSpawnTick: number; waveTicksLeft: number }).waveNumber = 15;
    (simAsc15 as unknown as { waveTicksLeft: number }).waveTicksLeft = 2400;
    for (let t = 0; t < 45; t++) {
      simAsc15.tick();
    }
    const wave15Bosses = simAsc15.getMonsters().filter((m) => m.isBoss && !m.isBounty);
    expect(wave15Bosses.length).toBe(2);
    expect(wave15Bosses.some((b) => (b.bossName ?? '').includes('쌍두호법'))).toBe(true);

    // Apply shred and verify 8중천+ regenerates shred on tick % 30 === 0
    wave15Bosses[0]!.armorShred = 30;
    wave15Bosses[0]!.shredExpireTick = simAsc15.tickCount + 600;
    for (let t = 0; t < 30; t++) {
      simAsc15.tick();
    }
    expect(wave15Bosses[0]!.armorShred).toBeLessThan(30);

    // 4. v3.9: Blessed 1.5x Effective Level in Simulation + Meridian Reincarnation + MRD1 Backup Round-trip
    expect(getBlessedEffectiveRelicLevel(30, true)).toBe(RELIC_EFFECTIVE_MAX_LEVEL);
    const relicsForBless = { ...meta.getRelicLevels(), dragon_range_mirror: 14 };
    const simUnblessed = new Simulation(data, 0x9999, relicsForBless, 'abyss', null, false, {
      ascensionLevel: 5,
      blessedRelics: [],
    });
    const simBlessed = new Simulation(data, 0x9999, relicsForBless, 'abyss', null, false, {
      ascensionLevel: 5,
      blessedRelics: ['dragon_range_mirror'],
    });
    expect(simBlessed.getEffectiveRelicLv('dragon_range_mirror')).toBe(21);
    simUnblessed.commands.enqueue({ type: 'summon' });
    simBlessed.commands.enqueue({ type: 'summon' });
    simUnblessed.tick();
    simBlessed.tick();
    const uUnblessed = simUnblessed.buildSnapshot(1, false).field.find((s) => s !== null)!;
    const uBlessed = simBlessed.buildSnapshot(1, false).field.find((s) => s !== null)!;
    expect(uBlessed.range).toBeGreaterThan(uUnblessed.range);

    // Determinism 1x === 3x + RunSave round-trip with ascensionLevel & blessedRelics
    const simDetB = new Simulation(data, 0x9999, relicsForBless, 'abyss', null, false, {
      ascensionLevel: 5,
      blessedRelics: ['dragon_range_mirror'],
    });
    simDetB.commands.enqueue({ type: 'summon' });
    simDetB.tick();
    for (let t = 0; t < 90; t++) simBlessed.tick();
    for (let t = 0; t < 90; t += 3) {
      simDetB.tick();
      simDetB.tick();
      simDetB.tick();
    }
    expect(simDetB.hashState()).toBe(simBlessed.hashState());

    const runSaved = simBlessed.exportRunSave(12345);
    const simRestored = new Simulation(data, 0x1111, {}, 'abyss', null, false, {
      ascensionLevel: 5,
    });
    expect(simRestored.restoreRunSave(runSaved)).toBe(true);
    expect(simRestored.hashState()).toBe(simBlessed.hashState());

    // Account Cultivation Lv.41 -> Reincarnation (무극 전생 · 선천 도과)
    expect(meta.reincarnateCultivation().ok).toBe(false);
    meta.grantCultivationXp(100000);
    expect(meta.getProfile().cultivation.isMaxLevel).toBe(true);
    expect(meta.claimRealmMilestone(5).ok).toBe(true);

    const atkBeforeReinc = meta.getProfile().endgameBonuses.atkPct;
    const reincRes = meta.reincarnateCultivation(() => 0.25);
    expect(reincRes.ok).toBe(true);
    if (reincRes.ok) {
      expect(reincRes.reincarnationCount).toBe(1);
      expect(reincRes.rewardShards).toBe(10);
      expect(reincRes.endgameBonuses.atkPct).toBe(atkBeforeReinc + 5);
    }
    // After reincarnation, level resets to 1 with +4 innate Meridian points and realm chests reset!
    expect(meta.getProfile().cultivation.level).toBe(1);
    expect(meta.getProfile().unspentMeridianPoints).toBe(4);
    expect(meta.getProfile().claimedRealmMilestones).toHaveLength(0);

    // Backup export/import preserves relicShards, Lv.30 relics, soul slots, blessedRelics, ascension, and reincarnationCount!
    const code = meta.exportBackupCode();
    expect(code.startsWith(BACKUP_CODE_PREFIX)).toBe(true);
    const storeMap2 = new Map<string, string>();
    const meta2 = new MetaStore({
      getItem: (k) => storeMap2.get(k) ?? null,
      setItem: (k, v) => {
        storeMap2.set(k, v);
      },
    });
    expect(meta2.importBackupCode(code).ok).toBe(true);
    const prof2 = meta2.getProfile();
    expect(prof2.relics.golden_vault).toBe(RELIC_MAX_LEVEL);
    expect(prof2.reincarnationCount).toBe(1);
    expect(prof2.clearedAscensionLevel).toBe(5);
    expect(prof2.unlockedAscensionLevel).toBe(6);
    expect(prof2.relicSoulSlots.golden_vault).toHaveLength(SOUL_SLOT_COUNT);
    expect(prof2.blessedRelics.length).toBeGreaterThan(0);
    expect(ASCENSION_MAX_LEVEL).toBe(20);
  });

  it('v4.1 강호 전기 (5-Chapter Chronicle Campaign): custom starts, fixed Spirit Tiles, Ch.5 Primordial unlock & Wave 30 Twin Boss, Chaos Shards rewards, all-clear skin, and MRD1- backup', () => {
    const data = loadGameData();
    expect(CHRONICLE_CHAPTERS).toHaveLength(5);

    // Ch.1: 15 waves, fixed central Spirit Vein tiles [7, 10], Orthodox +22% bonus
    const simCh1 = new Simulation(data, 0x4101, {}, 'hard', null, false, {
      runMode: 'chronicle',
      chronicleId: 'chr_hwasan_sword_tomb',
    });
    const snapCh1 = simCh1.buildSnapshot(1, false);
    expect(snapCh1.runMode).toBe('chronicle');
    expect(snapCh1.chronicle?.id).toBe('chr_hwasan_sword_tomb');
    expect(snapCh1.clearTargetWave).toBe(15);
    expect(snapCh1.coin).toBe(200);
    expect(snapCh1.luckStone).toBe(3);
    expect(snapCh1.spiritTiles).toEqual([
      { fieldIndex: 7, kind: 'solar' },
      { fieldIndex: 10, kind: 'wind' },
    ]);

    // Ch.5: 30 waves, Primordial Mythic unlocked from Wave 1, Twin Bosses spawn on Wave 30
    const simCh5 = new Simulation(data, 0x4105, {}, 'abyss', null, false, {
      runMode: 'chronicle',
      chronicleId: 'chr_primordial_genesis',
    });
    const snapCh5Start = simCh5.buildSnapshot(1, false);
    expect(snapCh5Start.clearTargetWave).toBe(30);
    expect(snapCh5Start.primordialUnlocked).toBe(true);

    // Advance Ch.5 into Wave 30 via save-state jump to verify Twin Boss spawn
    const baseSave = simCh5.exportRunSave(1000);
    const wave29EndSave = {
      ...baseSave,
      waveNumber: 29,
      waveTicksLeft: 1,
      waveSpawned: 99,
      monsters: [],
    };
    expect(simCh5.restoreRunSave(wave29EndSave)).toBe(true);
    for (let i = 0; i < 40; i++) {
      simCh5.tick();
    }
    const snapW30 = simCh5.buildSnapshot(1, false);
    expect(snapW30.wave).toBe(30);
    expect(snapW30.isBossWave).toBe(true);
    const liveBosses = simCh5.getMonsters().filter((m) => m.isBoss && m.hp > 0);
    expect(liveBosses.length).toBe(2);

    // MetaStore Chronicle progression: clear all 5 chapters -> first-clear Chaos Shards + all-clear skin + titles + repeat clear + backup round-trip
    const backing = new Map<string, string>();
    const meta = new MetaStore({
      getItem: (k) => backing.get(k) ?? null,
      setItem: (k, v) => {
        backing.set(k, v);
      },
    });

    expect(meta.setSelectedChronicle('chr_hwasan_sword_tomb')).toBe(true);
    expect(meta.getSelectedRunMode()).toBe('chronicle');
    expect(meta.getSelectedChronicleId()).toBe('chr_hwasan_sword_tomb');

    let totalFirstShards = 0;
    for (let i = 0; i < CHRONICLE_CHAPTERS.length; i++) {
      const ch = CHRONICLE_CHAPTERS[i]!;
      const rec = meta.settleRun({
        wave: ch.targetWave,
        monstersSlain: 250,
        bossesSlain: 3,
        bountiesSlain: 1,
        difficulty: ch.baseDifficulty,
        trialId: null,
        ascensionLevel: 0,
        runMode: 'chronicle',
        chronicleId: ch.id,
        victory: true,
        elapsedTicks: 30 * 120,
        totalDamage: 500000,
        topHeroId: 'hwasan_master',
        topHeroName: '화산 장문인',
      });
      expect(rec.firstClearBonusGold).toBe(ch.firstClearGold);
      expect(rec.shardsEarned).toBe(ch.firstClearShards);
      totalFirstShards += ch.firstClearShards;
      if (i === 0) {
        expect(meta.getProfile().unlockedTitles.title_chronicle_initiate).toBe(true);
      }
      if (i === CHRONICLE_CHAPTERS.length - 1) {
        expect(rec.unlockedSkinIds).toContain('skin_abyss_blood_crimson_moon');
      }
    }

    const profAfterAll = meta.getProfile();
    expect(profAfterAll.clearedChronicleCount).toBe(5);
    const totalShardsCollected = Object.values(profAfterAll.relicShards).reduce(
      (sum, v) => sum + (v ?? 0),
      0,
    );
    expect(totalShardsCollected).toBe(totalFirstShards);
    expect(profAfterAll.ownedSkins.skin_abyss_blood_crimson_moon).toBe(true);
    expect(profAfterAll.unlockedTitles.title_chronicle_master).toBe(true);

    // Repeat clear grants repeat-clear gold + shards (not first-clear bonus again)
    const ch1 = CHRONICLE_CHAPTERS[0]!;
    const repeatRec = meta.settleRun({
      wave: ch1.targetWave,
      monstersSlain: 220,
      bossesSlain: 3,
      bountiesSlain: 0,
      difficulty: ch1.baseDifficulty,
      trialId: null,
      ascensionLevel: 0,
      runMode: 'chronicle',
      chronicleId: ch1.id,
      victory: true,
      elapsedTicks: 30 * 90,
      totalDamage: 600000,
    });
    expect(repeatRec.firstClearBonusGold).toBe(ch1.repeatClearGold);
    expect(repeatRec.shardsEarned).toBe(ch1.repeatClearShards);

    // MRD1- backup preserves clearedChronicles & chronicleRecords
    const backup = meta.exportBackupCode();
    const backing2 = new Map<string, string>();
    const meta2 = new MetaStore({
      getItem: (k) => backing2.get(k) ?? null,
      setItem: (k, v) => {
        backing2.set(k, v);
      },
    });
    expect(meta2.importBackupCode(backup).ok).toBe(true);
    expect(meta2.getProfile().clearedChronicleCount).toBe(5);
    expect(meta2.getProfile().chronicleRecords.chr_hwasan_sword_tomb?.clears).toBe(2);
    expect(meta2.getProfile().ownedSkins.skin_abyss_blood_crimson_moon).toBe(true);
  });

  it('v4.2 장문인 진법 호령 3종 (Active Command Skills): Qi gain, 3 tactical skills, save round-trip, and bit-exact 1x vs 3x determinism', () => {
    const data = loadGameData();
    expect(COMMAND_SKILLS).toHaveLength(3);

    const sim = new Simulation(data, 0x42004200);
    const snap0 = sim.buildSnapshot(1, false);
    expect(snap0.commandSkills.qi).toBe(TACTICAL_QI_INITIAL);

    // At 25 Qi, cmd_sword_barrage (40 Qi) must be rejected
    sim.commands.enqueue({ type: 'castCommandSkill', skillId: 'cmd_sword_barrage' });
    sim.tick();
    expect(sim.buildSnapshot(1, false).rejects.some((r) => r.cmd === 'castCommandSkill')).toBe(true);

    // Spawn a strong unit so monsters die across waves and Qi charges up to 100
    spawnCheonmaHelper(sim);
    for (let i = 0; i < 2400; i++) {
      sim.tick();
      if (sim.buildSnapshot(1, false).commandSkills.qi >= 100) break;
    }
    expect(sim.buildSnapshot(1, false).commandSkills.qi).toBeGreaterThanOrEqual(100);

    // 1. Cast 만검총공 (40 Qi) -> swordBarrageTicksLeft = 150, Qi reduced by 40
    const castEvents: string[] = [];
    sim.events.on('command:cast', (ev) => castEvents.push(ev.skillId));
    const qiBeforeSword = sim.buildSnapshot(1, false).commandSkills.qi;
    sim.commands.enqueue({ type: 'castCommandSkill', skillId: 'cmd_sword_barrage' });
    sim.tick();
    const snapAfterSword = sim.buildSnapshot(1, false);
    expect(snapAfterSword.commandSkills.qi).toBeLessThanOrEqual(qiBeforeSword - 38);
    expect(snapAfterSword.commandSkills.swordBarrageTicksLeft).toBeGreaterThan(140);
    expect(castEvents).toContain('cmd_sword_barrage');

    // Save/restore preserves Qi, active duration, and cooldowns identically
    const saved = sim.exportRunSave(777);
    const simRestored = new Simulation(data, 0x11111111);
    expect(simRestored.restoreRunSave(saved)).toBe(true);
    expect(simRestored.hashState()).toBe(sim.hashState());

    // 2. Test 팔괘금강박 (60 Qi) and 천지개벽포 (100 Qi) on live monsters
    const sim2 = new Simulation(data, 0x42009999);
    // Let Wave 1 monsters spawn cleanly onto the loop before casting debuffs & cannon
    for (let i = 0; i < 120; i++) sim2.tick();
    const s2 = sim2.exportRunSave(888);
    expect(sim2.restoreRunSave({ ...s2, tacticalQi: 100 })).toBe(true);
    expect(sim2.getMonsters().filter((m) => m.hp > 0).length).toBeGreaterThan(0);

    sim2.commands.enqueue({ type: 'castCommandSkill', skillId: 'cmd_bagua_bind' });
    sim2.tick();
    const afterBaguaMonsters = sim2.getMonsters().filter((m) => m.hp > 0);
    expect(afterBaguaMonsters.length).toBeGreaterThan(0);
    expect(
      afterBaguaMonsters.every(
        (m) =>
          m.stunUntilTick > sim2.tickCount &&
          m.armorShred >= 45 &&
          m.slowUntilTick > sim2.tickCount &&
          m.slowFactor <= 0.46,
      ),
    ).toBe(true);

    // Recharge to 100 Qi and fire 천지개벽포 (cmd_heaven_cannon)
    const s2b = sim2.exportRunSave(889);
    expect(sim2.restoreRunSave({ ...s2b, tacticalQi: 100 })).toBe(true);
    let cannonTotalDmg = 0;
    sim2.events.on('command:cast', (ev) => {
      if (ev.skillId === 'cmd_heaven_cannon') cannonTotalDmg = ev.totalDamage;
    });
    sim2.commands.enqueue({ type: 'castCommandSkill', skillId: 'cmd_heaven_cannon' });
    sim2.tick();
    expect(cannonTotalDmg).toBeGreaterThan(0);
    expect(sim2.getMonsters().filter((m) => m.hp > 0).length).toBe(0);

    // 3. Bit-exact 1x vs 3x determinism with Command Skill + Armament Temper commands
    const runAtBatch = (batchSize: number): string => {
      const s = new Simulation(data, 0x42424242);
      s.commands.enqueue({ type: 'grantTestCoin', amount: 1200 });
      s.commands.enqueue({ type: 'grantTestResource', luck: 10 });
      s.commands.enqueue({ type: 'summon' });
      s.commands.enqueue({ type: 'summon' });
      s.commands.enqueue({ type: 'forgeArmament' });
      s.commands.enqueue({ type: 'temperArmament', slotIndex: 0 });
      let t = 0;
      while (t < 360) {
        if (t === 180) {
          s.commands.enqueue({ type: 'castCommandSkill', skillId: 'cmd_sword_barrage' });
        }
        const steps = Math.min(batchSize, 360 - t);
        for (let k = 0; k < steps; k++) {
          s.tick();
          t++;
        }
      }
      return s.hashState();
    };
    expect(runAtBatch(1)).toBe(runAtBatch(3));
  });

  it('v4.3 신병이기 12종 담금질 (+1~+3강, 재연마/합공 계승 유지) & 비무대 영맥 타일 2칸 (화양혈·청풍혈)', () => {
    const data = loadGameData();
    const sim = new Simulation(data, 0x43004300);

    // Verify 2 distinct deterministic Spirit Vein tiles (solar & wind)
    const snapInit = sim.buildSnapshot(1, false);
    expect(snapInit.spiritTiles).toHaveLength(2);
    const solarTile = snapInit.spiritTiles.find((t) => t.kind === 'solar')!;
    const windTile = snapInit.spiritTiles.find((t) => t.kind === 'wind')!;
    expect(solarTile).toBeDefined();
    expect(windTile).toBeDefined();
    expect(solarTile.fieldIndex).not.toBe(windTile.fieldIndex);

    // Place a rare hero on a neutral tile, then onto solar and wind tiles to verify stat deltas
    const neutralIdx = Array.from({ length: 18 }, (_, i) => i).find(
      (i) => i !== solarTile.fieldIndex && i !== windTile.fieldIndex,
    )!;
    sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'rare' });
    sim.commands.enqueue({ type: 'useWisp', grade: 'rare', unitId: 'cult_elder' }); // lands on field[0]
    sim.tick();
    if (neutralIdx !== 0) {
      sim.commands.enqueue({
        type: 'move',
        from: { area: 'field', index: 0 },
        to: { area: 'field', index: neutralIdx },
      });
      sim.tick();
    }
    const neutralSlot = sim.buildSnapshot(1, false).field[neutralIdx]!;
    expect(neutralSlot.spiritTile).toBeUndefined();
    const neutralAtk = neutralSlot.baseAtk + neutralSlot.bonusAtk;
    const neutralRange = neutralSlot.range;

    // Move to solar tile (☀ 화양혈: +16% ATK)
    sim.commands.enqueue({
      type: 'move',
      from: { area: 'field', index: neutralIdx },
      to: { area: 'field', index: solarTile.fieldIndex },
    });
    sim.tick();
    const solarSlot = sim.buildSnapshot(1, false).field[solarTile.fieldIndex]!;
    expect(solarSlot.spiritTile).toBe('solar');
    expect(solarSlot.baseAtk + solarSlot.bonusAtk).toBeGreaterThan(neutralAtk);

    // Move to wind tile (🍃 청풍혈: +34 range)
    sim.commands.enqueue({
      type: 'move',
      from: { area: 'field', index: solarTile.fieldIndex },
      to: { area: 'field', index: windTile.fieldIndex },
    });
    sim.tick();
    const windSlot = sim.buildSnapshot(1, false).field[windTile.fieldIndex]!;
    expect(windSlot.spiritTile).toBe('wind');
    expect(windSlot.range).toBe(neutralRange + SPIRIT_TILE_WIND_RANGE_BONUS);

    // Armament Tempering (+0 -> +1 -> +2 -> +3 MAX), Reforge preservation, and Save/Restore
    sim.commands.enqueue({ type: 'grantTestCoin', amount: 3000 });
    sim.commands.enqueue({ type: 'grantTestResource', luck: 20 });
    sim.commands.enqueue({ type: 'forgeArmament' });
    sim.tick();
    expect(sim.buildSnapshot(1, false).armory.slots[0]?.temperLevel).toBe(0);

    for (let lv = 1; lv <= MAX_ARMAMENT_TEMPER; lv++) {
      sim.commands.enqueue({ type: 'temperArmament', slotIndex: 0 });
      sim.tick();
      expect(sim.buildSnapshot(1, false).armory.slots[0]?.temperLevel).toBe(lv);
    }

    // Tempering beyond +3 MAX must be rejected
    sim.commands.enqueue({ type: 'temperArmament', slotIndex: 0 });
    sim.tick();
    expect(sim.buildSnapshot(1, false).rejects.some((r) => r.cmd === 'temperArmament')).toBe(true);
    expect(sim.buildSnapshot(1, false).armory.slots[0]?.nextTemperCost).toBeNull();

    // Reforge preserves temperLevel === 3
    const beforeReforgeId = sim.buildSnapshot(1, false).armory.slots[0]!.armamentId;
    sim.commands.enqueue({ type: 'reforgeArmament', slotIndex: 0 });
    sim.tick();
    const afterReforgeSlot = sim.buildSnapshot(1, false).armory.slots[0]!;
    expect(afterReforgeSlot.armamentId).not.toBe(beforeReforgeId);
    expect(afterReforgeSlot.temperLevel).toBe(3);

    // Save/Restore preserves both temperLevel and spiritTiles
    const saved = sim.exportRunSave(999);
    const simCopy = new Simulation(data, 0x1234);
    expect(simCopy.restoreRunSave(saved)).toBe(true);
    expect(simCopy.buildSnapshot(1, false).armory.slots[0]?.temperLevel).toBe(3);
    expect(simCopy.buildSnapshot(1, false).spiritTiles).toEqual(snapInit.spiritTiles);
    expect(simCopy.hashState()).toBe(sim.hashState());
  });

  it('v4.4 신규 영웅 스킨 24종 & 엔드게임 칭호 24종 (ascension, reincarnation, chaos relic set conditions)', () => {
    const data = loadGameData();
    expect(data.heroSkins).toHaveLength(24);
    expect(data.heroSkinsById.has('skin_primordial_sword_celestial')).toBe(true);
    expect(data.heroSkinsById.has('skin_void_cheonma_eclipse')).toBe(true);
    expect(data.heroSkinsById.has('skin_chaos_poison_amethyst')).toBe(true);
    expect(data.heroSkinsById.has('skin_tyrant_overlord_golden')).toBe(true);
    expect(data.heroSkinsById.has('skin_myriad_demon_azure')).toBe(true);
    expect(data.heroSkinsById.get('skin_abyss_blood_crimson_moon')?.unlockCond).toBe(
      'chronicle_all_clear',
    );
    expect(TITLE_DEFS).toHaveLength(29);

    const backing = new Map<string, string>();
    const meta = new MetaStore({
      getItem: (k) => backing.get(k) ?? null,
      setItem: (k, v) => {
        backing.set(k, v);
      },
    });
    meta.grantDevMeta(500000, 200);

    // Unlock Ascension 5 & 10 titles via abyss ascension settlement
    meta.settleRun({
      wave: 30,
      monstersSlain: 400,
      bossesSlain: 6,
      bountiesSlain: 2,
      difficulty: 'abyss',
      trialId: null,
      ascensionLevel: 10,
      runMode: 'standard',
      victory: true,
    });
    expect(meta.getProfile().unlockedTitles.title_ascension_5).toBe(true);
    expect(meta.getProfile().unlockedTitles.title_ascension_10).toBe(true);

    // Unlock Reincarnation title immediately upon reincarnating
    meta.grantCultivationXp(120000);
    const reinc = meta.reincarnateCultivation(() => 0.5);
    expect(reinc.ok).toBe(true);
    expect(meta.getProfile().unlockedTitles.title_reincarnation_1).toBe(true);

    // Max all 16 relics to base Lv.15 so Chaos Chest yields shards, then transcend 2 sets to Lv.22+
    for (const def of data.relics) {
      while ((meta.getProfile().relics[def.id] ?? 0) < def.maxLevel) {
        meta.upgradeRelic(def);
      }
    }
    const twoSets = [RELIC_SETS[0]!, RELIC_SETS[1]!];
    for (const setDef of twoSets) {
      for (const rId of setDef.members) {
        const rDef = data.relicsById.get(rId)!;
        const rIdx = data.relics.findIndex((d) => d.id === rId);
        const targetedRoll = (rIdx + 0.1) / data.relics.length;
        while ((meta.getProfile().relics[rId] ?? 0) < 22) {
          meta.grantDevMeta(10000, 10);
          meta.drawRelicBatch(data.relics, 10, 'key', () => targetedRoll);
          const tr = meta.transcendRelic(rDef);
          if (!tr.ok) break;
        }
      }
    }
    expect(meta.getProfile().unlockedTitles.title_relic_chaos_master).toBe(true);
  });

  it('v5.0 5-Tier Apex Difficulties (혼원마역~무극종언): auto-migration, progression chain, Chaos Shards, Twin Boss, summon surcharge, gamble penalty & MRD1- backup', () => {
    const data = loadGameData();
    expect(data.difficulties).toHaveLength(9);
    expect(DIFFICULTY_ORDER).toEqual([
      'normal',
      'hard',
      'hell',
      'abyss',
      'chaos_realm',
      'crimson_eclipse',
      'nine_heavens',
      'primordial_void',
      'absolute_zenith',
    ]);

    // 1. Auto-migration: legacy save with cleared abyss (without chaos_realm keys) auto-unlocks chaos_realm
    const legacyBacking = new Map<string, string>();
    legacyBacking.set(
      'murim_defense_meta_v1',
      JSON.stringify({
        gold: 500,
        keys: 5,
        silk: 50,
        unlockedDifficulties: { normal: true, hard: true, hell: true, abyss: true },
        clearedDifficulties: { normal: true, hard: true, hell: true, abyss: true },
      }),
    );
    const migratedMeta = new MetaStore({
      getItem: (k) => legacyBacking.get(k) ?? null,
      setItem: (k, v) => {
        legacyBacking.set(k, v);
      },
    });
    expect(migratedMeta.getProfile().unlockedDifficulties.chaos_realm).toBe(true);
    expect(migratedMeta.getProfile().unlockedDifficulties.crimson_eclipse).toBe(false);

    // 2. Full 5-tier progression chain: chaos_realm -> crimson_eclipse -> nine_heavens -> primordial_void -> absolute_zenith
    const apexChain = [
      { diff: 'chaos_realm', next: 'crimson_eclipse', title: 'title_chaos_realm_victor', shards: 14 },
      { diff: 'crimson_eclipse', next: 'nine_heavens', title: 'title_crimson_eclipse_victor', shards: 20 },
      { diff: 'nine_heavens', next: 'primordial_void', title: 'title_nine_heavens_victor', shards: 28 },
      { diff: 'primordial_void', next: 'absolute_zenith', title: 'title_primordial_void_victor', shards: 40 },
      { diff: 'absolute_zenith', next: null, title: 'title_absolute_zenith_victor', shards: 65 },
    ] as const;

    for (const step of apexChain) {
      expect(migratedMeta.setSelectedDifficulty(step.diff)).toBe(true);
      const rec = migratedMeta.settleRun({
        wave: 30,
        monstersSlain: 450,
        bossesSlain: 6,
        bountiesSlain: 2,
        difficulty: step.diff,
        trialId: null,
        runMode: 'standard',
        victory: true,
      });
      expect(rec.shardsEarned).toBe(step.shards);
      expect(rec.unlockedNextDifficulty).toBe(step.next);
      expect(migratedMeta.getProfile().clearedDifficulties[step.diff]).toBe(true);
      expect(migratedMeta.getProfile().unlockedTitles[step.title]).toBe(true);
      if (step.diff === 'chaos_realm') {
        expect(migratedMeta.getProfile().ownedSkins.court_primordial_cosmos).toBe(true);
      }
    }

    // Repeat clear grants repeatClearShards without double-granting first-clear gold
    const repeatRec = migratedMeta.settleRun({
      wave: 30,
      monstersSlain: 450,
      bossesSlain: 6,
      difficulty: 'absolute_zenith',
      trialId: null,
      runMode: 'standard',
      victory: true,
    });
    expect(repeatRec.firstClearBonusGold).toBe(0);
    expect(repeatRec.shardsEarned).toBe(16);

    // MRD1- backup round-trip preserves all 9 difficulty states & achievement map
    const code = migratedMeta.exportBackupCode();
    const freshStore = new Map<string, string>();
    const restoredMeta = new MetaStore({
      getItem: (k) => freshStore.get(k) ?? null,
      setItem: (k, v) => {
        freshStore.set(k, v);
      },
    });
    expect(restoredMeta.importBackupCode(code).ok).toBe(true);
    expect(restoredMeta.getProfile().clearedDifficulties.absolute_zenith).toBe(true);
    expect(restoredMeta.getProfile().ownedSkins.court_primordial_cosmos).toBe(true);

    // 3. Apex gameplay modifiers in Simulation: summon surcharge, gamble penalty, primordial unlocked at Wave 1, Twin Boss on Wave 5
    const simNormal = new Simulation(data, 0x50501111, {}, 'normal', null);
    const simZenith = new Simulation(data, 0x50501111, {}, 'absolute_zenith', null);
    expect(simZenith.getSummonCost()).toBe(simNormal.getSummonCost() + 8);
    expect(simZenith.getEffectiveGambleBonusPct()).toBe(simNormal.getEffectiveGambleBonusPct() - 8);
    expect(simZenith.buildSnapshot(1, false).primordialUnlocked).toBe(true);

    // Advance absolute_zenith to Wave 5 -> Twin Lieutenant Boss spawns alongside Main Boss!
    simZenith.commands.enqueue({ type: 'grantTestCoin', amount: 9999 });
    simZenith.tick();
    const snapZenith = simZenith.buildSnapshot(1, false);
    expect(snapZenith.difficulty).toBe('absolute_zenith');
    // Test Twin Boss spawn at Wave 5 via deterministic simulation
    const simZenithW5 = new Simulation(data, 0x50502222, {}, 'absolute_zenith', null);
    spawnCheonmaHelper(simZenithW5);
    let sawTwinBoss = false;
    for (let t = 0; t < 4500 && !sawTwinBoss; t++) {
      simZenithW5.tick();
      if (simZenithW5.getMonsters().some((m) => m.bossName?.includes('쌍두호법'))) {
        sawTwinBoss = true;
      }
    }
    expect(sawTwinBoss).toBe(true);

    // 1x vs 3x bit-exact determinism on absolute_zenith
    const det1 = new Simulation(data, 0x5050aaaa, {}, 'absolute_zenith', null);
    const det3 = new Simulation(data, 0x5050aaaa, {}, 'absolute_zenith', null);
    det1.commands.enqueue({ type: 'summon' });
    det3.commands.enqueue({ type: 'summon' });
    for (let t = 0; t < 240; t++) det1.tick();
    for (let f = 0; f < 80; f++) {
      det3.tick();
      det3.tick();
      det3.tick();
    }
    expect(det3.hashState()).toBe(det1.hashState());
  });

  it('v5.0 3 Bespoke Arena Maps (선계 영기 · 구유 용암진 · 태고 성좌진) & 6 New Heroes + 삼계종언 Trinity Combo', () => {
    const data = loadGameData();
    expect(data.courtSkinsById.get('court_celestial_jade_peak')?.bgImage).toBe(
      'bg/bg_celestial_peak.webp',
    );
    expect(data.courtSkinsById.get('court_nether_abyss_forge')?.bgImage).toBe(
      'bg/bg_nether_abyss.webp',
    );
    expect(data.courtSkinsById.get('court_primordial_cosmos')?.bgImage).toBe(
      'bg/bg_primordial_cosmos.webp',
    );
    expect(CODEX_MILESTONES.some((m) => m.target === 66)).toBe(true);

    // 1. celestial_qi: +35% Qi gain on kills/waves AND -15% command skill cooldown
    const simBase = new Simulation(data, 0x50503333, {}, 'normal', null, false, { arenaRule: null });
    const simCel = new Simulation(data, 0x50503333, {}, 'normal', null, false, {
      arenaRule: 'celestial_qi',
    });
    spawnCheonmaHelper(simBase);
    spawnCheonmaHelper(simCel);
    for (let t = 0; t < 450; t++) {
      simBase.tick();
      simCel.tick();
    }
    const qiBase = simBase.buildSnapshot(1, false).commandSkills.qi;
    const qiCel = simCel.buildSnapshot(1, false).commandSkills.qi;
    expect(qiCel).toBeGreaterThanOrEqual(qiBase);
    expect(qiCel).toBeGreaterThanOrEqual(40);
    // Wait until base also reaches 40 Qi so both cast cmd_sword_barrage cleanly
    while (simBase.buildSnapshot(1, false).commandSkills.qi < 40) {
      simBase.tick();
    }
    simBase.commands.enqueue({ type: 'castCommandSkill', skillId: 'cmd_sword_barrage' });
    simCel.commands.enqueue({ type: 'castCommandSkill', skillId: 'cmd_sword_barrage' });
    simBase.tick();
    simCel.tick();
    const cdBase = simBase.buildSnapshot(1, false).commandSkills.skills[0]!.cooldownLeftTicks;
    const cdCel = simCel.buildSnapshot(1, false).commandSkills.skills[0]!.cooldownLeftTicks;
    expect(cdCel).toBeLessThan(cdBase);
    expect(cdCel).toBe(Math.round(240 * 0.85) - 1);

    // 2. abyss_melt: +15 global armor shred reflected in SlotView
    const simMelt = new Simulation(data, 0x50504444, {}, 'normal', null, false, {
      arenaRule: 'abyss_melt',
    });
    const simPlain = new Simulation(data, 0x50504444, {}, 'normal', null, false, {
      arenaRule: null,
    });
    simMelt.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
    simMelt.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'hwasan_novice' });
    simPlain.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
    simPlain.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'hwasan_novice' });
    simMelt.tick();
    simPlain.tick();
    const uMelt = simMelt.buildSnapshot(1, false).field.find((s) => s !== null)!;
    const uPlain = simPlain.buildSnapshot(1, false).field.find((s) => s !== null)!;
    expect(uMelt.armorShred).toBe(uPlain.armorShred + 15);

    // 3. primordial_star: +50% Spirit Vein bonus (+51 range on wind tile vs +34)
    const simStar = new Simulation(data, 0x50505555, {}, 'normal', null, false, {
      arenaRule: 'primordial_star',
    });
    const simNoStar = new Simulation(data, 0x50505555, {}, 'normal', null, false, {
      arenaRule: null,
    });
    const windIdx = simStar.buildSnapshot(1, false).spiritTiles.find((t) => t.kind === 'wind')!
      .fieldIndex;
    for (const s of [simStar, simNoStar]) {
      s.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
      s.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: 'hwasan_novice' });
      s.tick();
      const fromIdx = s.buildSnapshot(1, false).field.findIndex((sl) => sl !== null);
      if (fromIdx !== windIdx) {
        s.commands.enqueue({
          type: 'move',
          from: { area: 'field', index: fromIdx },
          to: { area: 'field', index: windIdx },
        });
        s.tick();
      }
    }
    const rStar = simStar.buildSnapshot(1, false).field[windIdx]!.range;
    const rNoStar = simNoStar.buildSnapshot(1, false).field[windIdx]!.range;
    expect(rStar - rNoStar).toBe(17); // 51 - 34 = +17 extra wind vein range!

    // 4. Chain-craft the 3 new v5.0 Immortals & fire combo_v5_eclipse_trinity deterministically
    const simV5 = new Simulation(data, 0x50506666, {}, 'chaos_realm', null, false, {
      arenaRule: 'primordial_star',
    });
    const craftByRecipe = (sim: Simulation, recipeId: string): void => {
      const recipe = data.recipes.find((r) => r.id === recipeId)!;
      for (const ing of recipe.ingredients) {
        const sub = data.recipes.find((r) => r.output === ing.unit && !r.id.startsWith('r_3x_'));
        if (sub) {
          const leaves = sim.recipeGraph.leafCost.get(sub.id)!;
          for (const [leafId, cnt] of leaves) {
            for (let i = 0; i < cnt * ing.n; i++) {
              sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
              sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId: leafId });
            }
          }
          sim.tick();
          sim.commands.enqueue({ type: 'craft', recipeId: sub.id, chain: true });
          sim.tick();
        }
      }
      sim.commands.enqueue({ type: 'craft', recipeId, chain: false });
      sim.tick();
    };
    craftByRecipe(simV5, 'r_celestial_jade_emperor');
    craftByRecipe(simV5, 'r_nether_ghost_sovereign');
    craftByRecipe(simV5, 'r_eclipse_demon_god');
    const snapV5 = simV5.buildSnapshot(1, false);
    expect(snapV5.activeCombos.some((c) => c.id === 'combo_v5_eclipse_trinity')).toBe(true);

    let trinityFired = false;
    simV5.events.on('combo:triggered', (ev) => {
      if (ev.comboId === 'combo_v5_eclipse_trinity') trinityFired = true;
    });
    for (let t = 0; t < 400 && !trinityFired; t++) {
      simV5.tick();
    }
    expect(trinityFired).toBe(true);
  });
});

function spawnCheonmaHelper(sim: Simulation): void {
  // Craft ONLY the exact 3 ingredients of r_cheonma (heavenly_demon_heir + sword_demon + cult_elder)
  // so only cheonma remains on the board after fusion.
  const subRecipes = ['r_heavenly_demon_heir', 'r_sword_demon', 'r_cult_elder'] as const;
  for (const recipeId of subRecipes) {
    const leaves = sim.recipeGraph.leafCost.get(recipeId)!;
    for (const [unitId, count] of leaves) {
      for (let i = 0; i < count; i++) {
        sim.commands.enqueue({ type: 'grantTestResource', wispGrade: 'common' });
        sim.commands.enqueue({ type: 'useWisp', grade: 'common', unitId });
      }
    }
    sim.tick();
    sim.commands.enqueue({ type: 'craft', recipeId, chain: true });
    sim.tick();
  }
  sim.commands.enqueue({ type: 'craft', recipeId: 'r_cheonma', chain: false });
  sim.tick();
}


