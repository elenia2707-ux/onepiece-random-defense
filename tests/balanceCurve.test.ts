import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/core/Simulation';
import { loadGameData } from '../src/data/loader';
import type {
  BoonId,
  DifficultyId,
  FactionId,
  GameDataBundle,
  GradeId,
  RelicId,
  TrialId,
  UnitId,
} from '../src/data/types';
import { computeWaveHpScale, resolveWaveDef } from '../src/world/WaveSystem';

interface BotRunTelemetry {
  readonly seed: number;
  readonly victory: boolean;
  readonly finalWave: number;
  readonly maxRankWave1: number;
  readonly peakMonsters: number;
  readonly maxBossFightTicks: number;
  readonly firstImmortalWave: number | null;
}

const BENCHMARK_SEEDS: readonly number[] = [
  0x1001a1b2,
  0x2002b2c3,
  0x3003c3d4,
  0x4004d4e5,
  0x5005e5f6,
  0x6006f607,
  0x70070718,
  0x80081829,
  0x9009293a,
  0xa00a3a4b,
];

function getMaxOwnedRank(sim: Simulation, data: GameDataBundle): number {
  let maxRank = 0;
  const units = sim.getUnits();
  for (let i = 0; i < units.length; i++) {
    const def = data.unitsById.get(units[i]!.unitId);
    const rank = def ? (data.gradesById.get(def.grade)?.rank ?? 0) : 0;
    if (rank > maxRank) maxRank = rank;
  }
  return maxRank;
}

/**
 * Opus Review Baseline "단순 봇 (소환 + 최고 조합)":
 * - Only clicks Summon + highest-rank ready/chainReady recipe + AutoArrange (+ bench common cleanup if 30/30 full).
 * - Never uses Relics, Wisps, Boons, Elixirs, Faction Upgrades, or Active Bounties.
 */
function runNaiveBot(
  data: GameDataBundle,
  seed: number,
  difficulty: DifficultyId,
  trialId: TrialId | null = null,
): BotRunTelemetry {
  const sim = new Simulation(data, seed, {}, difficulty, trialId);
  let maxRankWave1 = 0;
  let peakMonsters = 0;
  let maxBossFightTicks = 0;
  let activeBossSpawnTick: number | null = null;
  let firstImmortalWave: number | null = null;

  const maxTicks = 42000;
  while (!sim.isGameOver && sim.tickCount < maxTicks) {
    if (sim.tickCount % 30 === 0) {
      const snap = sim.buildSnapshot(1, false);
      if (snap.victoryHold || snap.victoryAchieved) {
        if (activeBossSpawnTick !== null) {
          maxBossFightTicks = Math.max(maxBossFightTicks, sim.tickCount - activeBossSpawnTick);
          activeBossSpawnTick = null;
        }
        return {
          seed,
          victory: true,
          finalWave: snap.wave,
          maxRankWave1,
          peakMonsters,
          maxBossFightTicks,
          firstImmortalWave,
        };
      }

      // 1. Craft highest-rank ready or chainReady recipe
      let bestRecipeId: string | null = null;
      let bestRank = -1;
      let bestPrio = -1;
      let useChain = false;

      for (let i = 0; i < data.recipes.length; i++) {
        const r = data.recipes[i]!;
        const st = snap.craft.recipes[r.id];
        if (!st || (st.lamp !== 'ready' && st.lamp !== 'chainReady')) continue;
        const outDef = data.unitsById.get(r.output);
        const outRank = outDef ? (data.gradesById.get(outDef.grade)?.rank ?? 0) : 0;
        if (outRank > bestRank || (outRank === bestRank && r.priority > bestPrio)) {
          bestRank = outRank;
          bestPrio = r.priority;
          bestRecipeId = r.id;
          useChain = st.lamp === 'chainReady';
        }
      }
      if (bestRecipeId) {
        sim.commands.enqueue({ type: 'craft', recipeId: bestRecipeId, chain: useChain });
      }

      // 2. Free bench space if completely full, then summon while affordable
      const totalOwned = snap.fieldOccupied + snap.benchOccupied;
      if (totalOwned >= 30 && snap.benchSurplusCommonCount > 0) {
        sim.commands.enqueue({ type: 'sellSurplusCommon' });
      }
      let projectedCoin = snap.coin;
      let projectedSlots = totalOwned;
      let nextCost = snap.summonCost;
      while (projectedCoin >= nextCost && projectedSlots < 29) {
        sim.commands.enqueue({ type: 'summon' });
        projectedCoin -= nextCost;
        nextCost += data.board.economy.summonCostStep;
        projectedSlots += 1;
      }

      // 3. Deploy strongest units to 6x3 field
      sim.commands.enqueue({ type: 'autoArrange' });
    }

    sim.tick();

    const monsters = sim.getMonsters();
    if (monsters.length > peakMonsters) {
      peakMonsters = monsters.length;
    }
    const hasMainBoss = monsters.some((m) => m.isBoss && !m.isBounty);
    if (hasMainBoss && activeBossSpawnTick === null) {
      activeBossSpawnTick = sim.tickCount;
    } else if (!hasMainBoss && activeBossSpawnTick !== null) {
      maxBossFightTicks = Math.max(maxBossFightTicks, sim.tickCount - activeBossSpawnTick);
      activeBossSpawnTick = null;
    }

    if (sim.tickCount % 15 === 0) {
      const rankNow = getMaxOwnedRank(sim, data);
      // Wave 1 lasts waves[0].durationTicks (840 ticks)
      if (sim.tickCount < data.waves[0]!.durationTicks && rankNow > maxRankWave1) {
        maxRankWave1 = rankNow;
      }
      if (rankNow >= 6 && firstImmortalWave === null) {
        firstImmortalWave = sim.buildSnapshot(1, false).wave;
      }
    }
  }

  if (activeBossSpawnTick !== null) {
    maxBossFightTicks = Math.max(maxBossFightTicks, sim.tickCount - activeBossSpawnTick);
  }
  const endSnap = sim.buildSnapshot(1, false);
  return {
    seed,
    victory: endSnap.victoryHold || endSnap.victoryAchieved,
    finalWave: endSnap.wave,
    maxRankWave1,
    peakMonsters,
    maxBossFightTicks,
    firstImmortalWave,
  };
}

/**
 * Mastery "스마트 봇 (+기연·영약·수련·위습·현상수배·진법)":
 * Leverages every tactical system in 운빨무림전 to overcome Hard, Hell, and Secret Realm Trials.
 */
function runSmartBot(
  data: GameDataBundle,
  seed: number,
  difficulty: DifficultyId,
  relics: Partial<Record<RelicId, number>> = {},
  trialId: TrialId | null = null,
): BotRunTelemetry {
  const sim = new Simulation(data, seed, relics, difficulty, trialId);
  let maxRankWave1 = 0;
  let peakMonsters = 0;
  let maxBossFightTicks = 0;
  let activeBossSpawnTick: number | null = null;
  let firstImmortalWave: number | null = null;

  // Choose primary carry faction adapted to trial modifier if applicable
  const preferredFaction: FactionId | null =
    trialId === 'trial_venom_gale'
      ? 'unorthodox'
      : trialId === 'trial_sword_tomb'
        ? 'orthodox'
        : trialId === 'trial_crimson_iron'
          ? 'demonic'
          : null;

  const scoreBoon = (boonId: BoonId, carryFaction: FactionId): number => {
    if (trialId === 'trial_chaos_trinity' && boonId === 'b_trinity_harmony') return 120;
    switch (boonId) {
      case 'b_heavenly_reinforce':
        return 95;
      case 'b_armor_crusher':
        return 92;
      case 'b_bounty_hunter':
        return 88;
      case 'b_orthodox_zenith':
        return carryFaction === 'orthodox' ? 100 : 55;
      case 'b_demonic_overdrive':
        return carryFaction === 'demonic' ? 100 : 58;
      case 'b_unorthodox_pillage':
        return carryFaction === 'unorthodox' ? 96 : 60;
      case 'b_swift_formation':
        return 84;
      case 'b_hidden_acupoint':
        return 82;
      case 'b_usury_vault':
        return trialId === 'trial_sword_tomb' ? 10 : 85;
      case 'b_wealth_blade':
        return 78;
      case 'b_elixir_jackpot':
        return 76;
      case 'b_trinity_harmony':
        return 72;
      default:
        return 50;
    }
  };

  const maxTicks = 45000;
  while (!sim.isGameOver && sim.tickCount < maxTicks) {
    if (sim.tickCount % 30 === 0) {
      const snap = sim.buildSnapshot(1, false);
      if (snap.victoryHold || snap.victoryAchieved) {
        if (activeBossSpawnTick !== null) {
          maxBossFightTicks = Math.max(maxBossFightTicks, sim.tickCount - activeBossSpawnTick);
          activeBossSpawnTick = null;
        }
        return {
          seed,
          victory: true,
          finalWave: snap.wave,
          maxRankWave1,
          peakMonsters,
          maxBossFightTicks,
          firstImmortalWave,
        };
      }

      // Determine current strongest faction on board
      const factionPower: Record<FactionId, number> = {
        orthodox: 0,
        unorthodox: 0,
        demonic: 0,
      };
      const ownedCounts = new Map<UnitId, number>();
      for (const s of [...snap.field, ...snap.bench]) {
        if (!s) continue;
        ownedCounts.set(s.unitId, (ownedCounts.get(s.unitId) ?? 0) + 1);
        const r = data.gradesById.get(s.grade)?.rank ?? 1;
        factionPower[s.faction] += r * r;
      }
      if (preferredFaction) {
        factionPower[preferredFaction] += 18;
      }
      const carryFaction: FactionId =
        factionPower.demonic >= factionPower.orthodox &&
        factionPower.demonic >= factionPower.unorthodox
          ? 'demonic'
          : factionPower.orthodox >= factionPower.unorthodox
            ? 'orthodox'
            : 'unorthodox';

      // 1. Pick optimal Roguelike Boss Boon immediately
      if (snap.pendingBoonOffer) {
        let bestBoon = snap.pendingBoonOffer.options[0]!;
        let bestScore = -1;
        for (const opt of snap.pendingBoonOffer.options) {
          const sc = scoreBoon(opt, carryFaction);
          if (sc > bestScore) {
            bestScore = sc;
            bestBoon = opt;
          }
        }
        sim.commands.enqueue({ type: 'pickBoon', boonId: bestBoon });
      }

      // 2. Spend Wisps intelligently to complete missing ingredients of rank 3..6 recipes
      for (const wispGrade of ['rare', 'uncommon', 'common'] as readonly GradeId[]) {
        const wispCount = snap.wisps[wispGrade] ?? 0;
        if (wispCount <= 0) continue;
        const pool = data.wispPools[wispGrade] ?? [];
        if (pool.length === 0) continue;

        let chosenUnit: UnitId | null = null;
        let bestRecipeScore = -1;

        for (const r of data.recipes) {
          if (r.id.startsWith('r_3x_')) continue;
          const outDef = data.unitsById.get(r.output);
          if (!outDef) continue;
          const outRank = data.gradesById.get(outDef.grade)?.rank ?? 1;
          if (outRank < 3) continue;

          let haveCount = 0;
          let totalNeeded = 0;
          let missingPoolUnit: UnitId | null = null;
          for (const ing of r.ingredients) {
            totalNeeded += ing.n;
            const have = Math.min(ing.n, ownedCounts.get(ing.unit) ?? 0);
            haveCount += have;
            if (have < ing.n && pool.includes(ing.unit)) {
              missingPoolUnit = ing.unit;
            }
          }
          if (missingPoolUnit) {
            const factionBonus = outDef.faction === carryFaction ? 12 : 0;
            const completionRatio = haveCount / Math.max(1, totalNeeded);
            const score = outRank * 25 + completionRatio * 40 + factionBonus;
            if (score > bestRecipeScore) {
              bestRecipeScore = score;
              chosenUnit = missingPoolUnit;
            }
          }
        }

        if (chosenUnit) {
          sim.commands.enqueue({ type: 'useWisp', grade: wispGrade, unitId: chosenUnit });
          ownedCounts.set(chosenUnit, (ownedCounts.get(chosenUnit) ?? 0) + 1);
        }
      }

      // 3. Smart Craft: prioritize high-rank heterogeneous recipes; avoid burning leaves on ×3 unless surplus >= 4 or board crowded
      const totalOwned = snap.fieldOccupied + snap.benchOccupied;
      let bestRecipeId: string | null = null;
      let bestScore = -1;
      let useChain = false;

      for (const r of data.recipes) {
        const st = snap.craft.recipes[r.id];
        if (!st || (st.lamp !== 'ready' && st.lamp !== 'chainReady')) continue;
        const isTriple = r.id.startsWith('r_3x_');
        if (isTriple) {
          const leafId = r.ingredients[0]!.unit;
          const copies = ownedCounts.get(leafId) ?? 0;
          if (copies < 4 && totalOwned < 25) continue;
        }
        const outDef = data.unitsById.get(r.output)!;
        const outRank = data.gradesById.get(outDef.grade)?.rank ?? 1;
        const factionAlign =
          trialId === 'trial_chaos_trinity'
            ? 8
            : outDef.faction === carryFaction
              ? 14
              : 0;
        const score = outRank * 100 + factionAlign + (isTriple ? -20 : 15) + r.priority * 0.01;
        if (score > bestScore) {
          bestScore = score;
          bestRecipeId = r.id;
          useChain = st.lamp === 'chainReady';
        }
      }
      if (bestRecipeId) {
        sim.commands.enqueue({ type: 'craft', recipeId: bestRecipeId, chain: useChain });
      }

      // 4. Spend Elixir (영약 복용): roll Rare (cost 2) or Uncommon (cost 1) to accelerate mid/high-tier synthesis
      if (snap.luckStone >= 5 && snap.wave >= 8) {
        sim.commands.enqueue({ type: 'gamble', tier: 'legendary' });
      } else if (snap.luckStone >= 2) {
        sim.commands.enqueue({ type: 'gamble', tier: 'rare' });
      }

      // 5. Call Active Bounty (현상수배) when field has mid/high power and no main boss is present
      if (snap.bounty.canCall && snap.wave >= 3 && !snap.isBossWave && snap.fieldOccupied >= 5) {
        sim.commands.enqueue({ type: 'callBounty' });
      }

      // 6. Balance Economy: preserve interest reserve when golden_vault active, interleave Faction Upgrades & Summons
      const interestReserve =
        snap.relicBonus.interestPct > 0 && snap.wave < snap.clearTargetWave - 2
          ? Math.min(800, snap.wave * 45)
          : 0;

      if (totalOwned >= 29 && snap.benchSurplusCommonCount > 0) {
        sim.commands.enqueue({ type: 'sellSurplusCommon' });
      }

      // Invest in carry faction upgrades (or all 3 factions in Trinity Trial)
      const upTarget: FactionId =
        trialId === 'trial_chaos_trinity'
          ? snap.upgradeLv.orthodox <= snap.upgradeLv.unorthodox &&
            snap.upgradeLv.orthodox <= snap.upgradeLv.demonic
            ? 'orthodox'
            : snap.upgradeLv.unorthodox <= snap.upgradeLv.demonic
              ? 'unorthodox'
              : 'demonic'
          : carryFaction;

      const upLv = snap.upgradeLv[upTarget];
      const upGroup = data.upgrades.find((u) => u.id === upTarget)!;
      const upCost = upGroup.baseCost + upLv * upGroup.costStep;

      let budget = snap.coin - interestReserve;
      if (
        upLv < upGroup.maxLevel &&
        snap.wave >= 3 &&
        budget >= upCost &&
        (upCost <= snap.summonCost * 1.35 || totalOwned >= 24)
      ) {
        sim.commands.enqueue({ type: 'upgrade', group: upTarget });
        budget -= upCost;
      }

      let nextSummonCost = snap.summonCost;
      let slots = totalOwned;
      while (budget >= nextSummonCost && slots < 28) {
        sim.commands.enqueue({ type: 'summon' });
        budget -= nextSummonCost;
        nextSummonCost += data.board.economy.summonCostStep;
        slots += 1;
      }

      // 7. AutoArrange (evacuates Blood Patriarch hazards + deploys highest-grade heroes)
      sim.commands.enqueue({ type: 'autoArrange' });
    }

    sim.tick();

    const monsters = sim.getMonsters();
    if (monsters.length > peakMonsters) {
      peakMonsters = monsters.length;
    }
    const hasMainBoss = monsters.some((m) => m.isBoss && !m.isBounty);
    if (hasMainBoss && activeBossSpawnTick === null) {
      activeBossSpawnTick = sim.tickCount;
    } else if (!hasMainBoss && activeBossSpawnTick !== null) {
      maxBossFightTicks = Math.max(maxBossFightTicks, sim.tickCount - activeBossSpawnTick);
      activeBossSpawnTick = null;
    }

    if (sim.tickCount % 15 === 0) {
      const rankNow = getMaxOwnedRank(sim, data);
      if (sim.tickCount < data.waves[0]!.durationTicks && rankNow > maxRankWave1) {
        maxRankWave1 = rankNow;
      }
      if (rankNow >= 6 && firstImmortalWave === null) {
        firstImmortalWave = sim.buildSnapshot(1, false).wave;
      }
    }
  }

  if (activeBossSpawnTick !== null) {
    maxBossFightTicks = Math.max(maxBossFightTicks, sim.tickCount - activeBossSpawnTick);
  }
  const endSnap = sim.buildSnapshot(1, false);
  return {
    seed,
    victory: endSnap.victoryHold || endSnap.victoryAchieved,
    finalWave: endSnap.wave,
    maxRankWave1,
    peakMonsters,
    maxBossFightTicks,
    firstImmortalWave,
  };
}

describe('Balance Regression Suite (Opus Review Fixes: Wave 16 Continuity, Pacing & Bot Stratification)', () => {
  it('guarantees strictly monotonic monster & boss Effective HP across all 30 waves (eliminating the Wave 16 modulo-reset cliff)', () => {
    const data = loadGameData();
    expect(data.waves.length).toBe(30);

    let prevNormalEhp = 0;
    let prevBossEhp = 0;

    for (let w = 1; w <= 30; w++) {
      const def = resolveWaveDef(data.waves, w);
      expect(def.wave).toBe(w);

      const hpScale = computeWaveHpScale(data, 'normal', null, w);
      const hp = Math.round(def.monsterHp * hpScale);
      // Base non-mutant armor for monotonic progression check
      const baseArmor =
        w <= 2 ? 0 : Math.min(180, Math.round(Math.max(0, w - 2) * 2.8 + (def.isBoss ? 20 : 0)));
      const ehp = Math.round(hp * (1 + baseArmor / 100));

      if (def.isBoss) {
        expect(ehp, `Boss Wave ${w} EHP (${ehp}) must exceed previous boss (${prevBossEhp})`).toBeGreaterThan(
          prevBossEhp,
        );
        prevBossEhp = ehp;
      } else {
        expect(
          ehp,
          `Normal Wave ${w} EHP (${ehp}) must exceed previous normal wave (${prevNormalEhp})`,
        ).toBeGreaterThan(prevNormalEhp);
        prevNormalEhp = ehp;
      }
    }

    // Specifically verify Wave 16 monster HP is higher than Wave 14 (previously dropped 95% from ~3700 to ~180!)
    const wave14Hp = resolveWaveDef(data.waves, 14).monsterHp;
    const wave16Hp = resolveWaveDef(data.waves, 16).monsterHp;
    expect(wave16Hp).toBeGreaterThan(wave14Hp * 1.25);
  });

  it('prevents Wave 1 Legendary snowball and stratifies NaiveBot win rates across Normal / Hard / Hell', () => {
    const data = loadGameData();

    const normalRuns = BENCHMARK_SEEDS.map((s) => runNaiveBot(data, s, 'normal'));
    const hardRuns = BENCHMARK_SEEDS.map((s) => runNaiveBot(data, s, 'hard'));
    const hellRuns = BENCHMARK_SEEDS.map((s) => runNaiveBot(data, s, 'hell'));

    const normalWins = normalRuns.filter((r) => r.victory).length;
    const hardWins = hardRuns.filter((r) => r.victory).length;
    const hellWins = hellRuns.filter((r) => r.victory).length;

    const maxRankWave1All = Math.max(...normalRuns.map((r) => r.maxRankWave1));
    const avgPeakMonstersHell =
      hellRuns.reduce((acc, r) => acc + r.peakMonsters, 0) / hellRuns.length;
    const maxBossSecsNormal =
      Math.max(...normalRuns.map((r) => r.maxBossFightTicks)) / 30;

    // Diagnostics log for transparent CI balance auditing
    console.info('[BalanceAudit][NaiveBot]', {
      normalWins: `${normalWins}/${BENCHMARK_SEEDS.length}`,
      hardWins: `${hardWins}/${BENCHMARK_SEEDS.length}`,
      hellWins: `${hellWins}/${BENCHMARK_SEEDS.length}`,
      normalAvgWave:
        normalRuns.reduce((a, r) => a + r.finalWave, 0) / normalRuns.length,
      hardAvgWave: hardRuns.reduce((a, r) => a + r.finalWave, 0) / hardRuns.length,
      hellAvgWave: hellRuns.reduce((a, r) => a + r.finalWave, 0) / hellRuns.length,
      maxRankWave1All,
      avgPeakMonstersHell,
      maxBossSecsNormal: Number(maxBossSecsNormal.toFixed(1)),
    });

    // 1. Wave 1 pacing: NaiveBot with 0 relics cannot hit Legendary (rank 4) during Wave 1
    expect(maxRankWave1All).toBeLessThanOrEqual(3);

    // 2. Real battlefield tension: monsters accumulate (> 8 active) and bosses take > 5s (not 2s insta-melts)
    expect(avgPeakMonstersHell).toBeGreaterThanOrEqual(8);
    expect(maxBossSecsNormal).toBeGreaterThanOrEqual(5);

    // 3. Stratified difficulty curve for NaiveBot (0 relics, no upgrades/elixirs/boons/wisps):
    //    - Normal: clearable but non-trivial (20%..85%)
    //    - Hard: punishing (<= 40%, strictly harder than Normal)
    //    - Hell: 0% clear rate without mastery systems & relics!
    expect(normalWins).toBeGreaterThanOrEqual(2);
    expect(normalWins).toBeLessThanOrEqual(8);
    expect(hardWins).toBeLessThanOrEqual(4);
    expect(hardWins).toBeLessThan(normalWins);
    expect(hellWins).toBe(0);
  });

  it('proves system mastery + relics matter: SmartBot outperforms NaiveBot on Hard and clears Hell & Secret Realm Trials', () => {
    const data = loadGameData();

    // 1. Zero-relic Hard comparison: SmartBot (using wisps/upgrades/elixirs/boons/bounty) beats NaiveBot!
    const naiveHard = BENCHMARK_SEEDS.slice(0, 6).map((s) => runNaiveBot(data, s, 'hard'));
    const smartHard = BENCHMARK_SEEDS.slice(0, 6).map((s) => runSmartBot(data, s, 'hard', {}));

    const naiveHardWaveSum = naiveHard.reduce((a, r) => a + r.finalWave, 0);
    const smartHardWaveSum = smartHard.reduce((a, r) => a + r.finalWave, 0);
    const naiveHardWins = naiveHard.filter((r) => r.victory).length;
    const smartHardWins = smartHard.filter((r) => r.victory).length;

    // 2. Endgame progression: SmartBot with leveled relics clears Hell AND all 4 Secret Realm Trials!
    const endgameRelics: Partial<Record<RelicId, number>> = {
      founding_jade_seal: 6,
      heavenly_scroll_chest: 6,
      golden_vault: 6,
      million_sword_seal: 6,
      bandit_dagger: 6,
      immortal_furnace: 6,
    };

    const smartHell = BENCHMARK_SEEDS.slice(0, 5).map((s) =>
      runSmartBot(data, s, 'hell', endgameRelics),
    );
    const smartHellWins = smartHell.filter((r) => r.victory).length;

    const trialIds: readonly TrialId[] = [
      'trial_venom_gale',
      'trial_sword_tomb',
      'trial_crimson_iron',
      'trial_chaos_trinity',
    ];
    const naiveTrialWins: Record<string, number> = {};
    const smartTrialWins: Record<string, number> = {};

    for (const tid of trialIds) {
      const nRuns = BENCHMARK_SEEDS.slice(0, 4).map((s) => runNaiveBot(data, s, 'normal', tid));
      const sRuns = BENCHMARK_SEEDS.slice(0, 4).map((s) =>
        runSmartBot(data, s, 'normal', endgameRelics, tid),
      );
      naiveTrialWins[tid] = nRuns.filter((r) => r.victory).length;
      smartTrialWins[tid] = sRuns.filter((r) => r.victory).length;
    }

    console.info('[BalanceAudit][SmartBot]', {
      hard0RelicWins: `${smartHardWins}/6 (naive ${naiveHardWins}/6)`,
      hard0RelicAvgWave: `${(smartHardWaveSum / 6).toFixed(1)} vs naive ${(naiveHardWaveSum / 6).toFixed(1)}`,
      hellEndgameWins: `${smartHellWins}/5`,
      naiveTrialWins,
      smartTrialWins,
    });

    expect(
      smartHardWins > naiveHardWins || smartHardWaveSum > naiveHardWaveSum,
    ).toBe(true);
    expect(smartHellWins).toBeGreaterThanOrEqual(2);

    // Every Secret Realm trial must be clearable by SmartBot, while NaiveBot (0 relics) struggles across trials
    const totalNaiveTrialWins = Object.values(naiveTrialWins).reduce((a, b) => a + b, 0);
    const totalSmartTrialWins = Object.values(smartTrialWins).reduce((a, b) => a + b, 0);
    expect(totalNaiveTrialWins).toBeLessThanOrEqual(6); // Out of 16 runs (previously 16/16 = 100%!)
    expect(totalSmartTrialWins).toBeGreaterThan(totalNaiveTrialWins);
    for (const tid of trialIds) {
      expect(smartTrialWins[tid], `SmartBot should clear ${tid} at least once`).toBeGreaterThanOrEqual(1);
    }
  });
});
