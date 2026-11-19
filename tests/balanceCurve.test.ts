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
  readonly damageByUnit: Readonly<Record<string, number>>;
  readonly totalDamage: number;
  readonly craftedImmortals: readonly UnitId[];
  readonly survivingImmortals: readonly UnitId[];
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

function getSurvivingImmortals(sim: Simulation, data: GameDataBundle): UnitId[] {
  const seen = new Set<UnitId>();
  const units = sim.getUnits();
  for (let i = 0; i < units.length; i++) {
    const uid = units[i]!.unitId;
    if (data.unitsById.get(uid)?.grade === 'immortal') {
      seen.add(uid);
    }
  }
  return Array.from(seen);
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
  const damageByUnit: Record<string, number> = {};
  let totalDamage = 0;
  const craftedImmortals = new Set<UnitId>();

  sim.events.on('monster:hit', (ev) => {
    damageByUnit[ev.unitId] = (damageByUnit[ev.unitId] ?? 0) + ev.damage;
    totalDamage += ev.damage;
  });
  sim.events.on('craft:done', (ev) => {
    if (ev.grade === 'immortal') craftedImmortals.add(ev.outputUnitId);
  });

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
          damageByUnit,
          totalDamage,
          craftedImmortals: Array.from(craftedImmortals),
          survivingImmortals: getSurvivingImmortals(sim, data),
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
    damageByUnit,
    totalDamage,
    craftedImmortals: Array.from(craftedImmortals),
    survivingImmortals: getSurvivingImmortals(sim, data),
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
  const damageByUnit: Record<string, number> = {};
  let totalDamage = 0;
  const craftedImmortals = new Set<UnitId>();

  sim.events.on('monster:hit', (ev) => {
    damageByUnit[ev.unitId] = (damageByUnit[ev.unitId] ?? 0) + ev.damage;
    totalDamage += ev.damage;
  });
  sim.events.on('craft:done', (ev) => {
    if (ev.grade === 'immortal') craftedImmortals.add(ev.outputUnitId);
  });

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
      case 'b_reaper_seal':
        return 94;
      case 'b_chain_thunder':
        return 89;
      case 'b_frost_shatter':
        return 88;
      case 'b_piercing_echo':
        return 86;
      case 'b_relic_resonance':
        return Object.values(relics).filter((v) => (v ?? 0) > 0).length >= 6 ? 98 : 35;
      case 'b_bench_support':
        return 74;
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
          damageByUnit,
          totalDamage,
          craftedImmortals: Array.from(craftedImmortals),
          survivingImmortals: getSurvivingImmortals(sim, data),
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

      // 6. Balance Economy: preserve interest & million_sword_seal wealth-ATK reserve when relics are active
      const hasWealthRelic = (relics.million_sword_seal ?? 0) > 0;
      const interestReserve =
        hasWealthRelic && snap.wave >= 8
          ? Math.min(3200, snap.wave * 115)
          : snap.relicBonus.interestPct > 0 && snap.wave < snap.clearTargetWave - 2
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
    damageByUnit,
    totalDamage,
    craftedImmortals: Array.from(craftedImmortals),
    survivingImmortals: getSurvivingImmortals(sim, data),
  };
}

describe('Balance Regression Suite (Opus Review Fixes: Wave 16 Continuity, Pacing, Relic Gate & Immortal Diversity)', () => {
  it('guarantees strictly monotonic monster & boss Effective HP across all 30 waves on Normal, Hard, Hell, and Abyss', () => {
    const data = loadGameData();
    expect(data.waves.length).toBe(30);

    for (const diff of ['normal', 'hard', 'hell', 'abyss'] as readonly DifficultyId[]) {
      let prevNormalEhp = 0;
      let prevBossEhp = 0;

      for (let w = 1; w <= 30; w++) {
        const def = resolveWaveDef(data.waves, w);
        expect(def.wave).toBe(w);

        const hpScale = computeWaveHpScale(data, diff, null, w, def.isBoss);
        const hp = Math.round(def.monsterHp * hpScale);
        // Base non-mutant armor for monotonic progression check
        const baseArmor =
          w <= 2 ? 0 : Math.min(180, Math.round(Math.max(0, w - 2) * 2.8 + (def.isBoss ? 20 : 0)));
        const ehp = Math.round(hp * (1 + baseArmor / 100));

        if (def.isBoss) {
          expect(
            ehp,
            `[${diff}] Boss Wave ${w} EHP (${ehp}) must exceed previous boss (${prevBossEhp})`,
          ).toBeGreaterThan(prevBossEhp);
          prevBossEhp = ehp;
        } else {
          expect(
            ehp,
            `[${diff}] Normal Wave ${w} EHP (${ehp}) must exceed previous normal wave (${prevNormalEhp})`,
          ).toBeGreaterThan(prevNormalEhp);
          prevNormalEhp = ehp;
        }
      }
    }

    // Specifically verify Wave 16 monster HP is higher than Wave 14 (eliminating Wave 16 cliff)
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

    console.info('[BalanceAudit][NaiveBot]', {
      normalWins: `${normalWins}/${BENCHMARK_SEEDS.length}`,
      hardWins: `${hardWins}/${BENCHMARK_SEEDS.length}`,
      hellWins: `${hellWins}/${BENCHMARK_SEEDS.length}`,
      normalAvgWave: Number(
        (normalRuns.reduce((a, r) => a + r.finalWave, 0) / normalRuns.length).toFixed(1),
      ),
      hardAvgWave: Number(
        (hardRuns.reduce((a, r) => a + r.finalWave, 0) / hardRuns.length).toFixed(1),
      ),
      hellAvgWave: Number(
        (hellRuns.reduce((a, r) => a + r.finalWave, 0) / hellRuns.length).toFixed(1),
      ),
      maxRankWave1All,
      avgPeakMonstersHell: Number(avgPeakMonstersHell.toFixed(1)),
      maxBossSecsNormal: Number(maxBossSecsNormal.toFixed(1)),
    });

    expect(maxRankWave1All).toBeLessThanOrEqual(3);
    expect(avgPeakMonstersHell).toBeGreaterThanOrEqual(8);
    expect(maxBossSecsNormal).toBeGreaterThanOrEqual(5);

    expect(normalWins).toBeGreaterThanOrEqual(2);
    expect(normalWins).toBeLessThanOrEqual(8);
    expect(hardWins).toBeLessThanOrEqual(4);
    expect(hardWins).toBeLessThan(normalWins);
    expect(hellWins).toBe(0);
  }, 25_000);

  it('enforces 0-relic endgame upper bounds (Hell & Secret Realm Trials) while Lv.6 relics unlock consistent clears', () => {
    const data = loadGameData();

    // 1. Zero-relic Hard comparison: SmartBot beats NaiveBot
    const naiveHard = BENCHMARK_SEEDS.slice(0, 6).map((s) => runNaiveBot(data, s, 'hard'));
    const smartHard = BENCHMARK_SEEDS.slice(0, 6).map((s) => runSmartBot(data, s, 'hard', {}));
    const naiveHardWaveSum = naiveHard.reduce((a, r) => a + r.finalWave, 0);
    const smartHardWaveSum = smartHard.reduce((a, r) => a + r.finalWave, 0);
    const naiveHardWins = naiveHard.filter((r) => r.victory).length;
    const smartHardWins = smartHard.filter((r) => r.victory).length;

    // 2. Zero-relic Endgame UPPER BOUND: SmartBot with 0 relics MUST struggle on Hell & Trials (not free clears!)
    const smartHell0 = BENCHMARK_SEEDS.slice(0, 5).map((s) => runSmartBot(data, s, 'hell', {}));
    const smartHell0Wins = smartHell0.filter((r) => r.victory).length;
    const smartHell0AvgWave =
      smartHell0.reduce((a, r) => a + r.finalWave, 0) / smartHell0.length;

    // 3. Endgame Progression with Lv.6 relics: meaningfully unlocks Hell & all 4 Secret Realm Trials
    const endgameRelics: Partial<Record<RelicId, number>> = {
      founding_jade_seal: 6,
      heavenly_scroll_chest: 6,
      golden_vault: 6,
      million_sword_seal: 6,
      bandit_dagger: 6,
      immortal_furnace: 6,
    };

    const smartHell6 = BENCHMARK_SEEDS.slice(0, 5).map((s) =>
      runSmartBot(data, s, 'hell', endgameRelics),
    );
    const smartHell6Wins = smartHell6.filter((r) => r.victory).length;
    const smartHell6AvgWave =
      smartHell6.reduce((a, r) => a + r.finalWave, 0) / smartHell6.length;

    const trialIds: readonly TrialId[] = [
      'trial_venom_gale',
      'trial_sword_tomb',
      'trial_crimson_iron',
      'trial_chaos_trinity',
    ];
    const naiveTrialWins: Record<string, number> = {};
    const smartTrial0Wins: Record<string, number> = {};
    const smartTrial6Wins: Record<string, number> = {};
    const smartTrial0AvgWave: Record<string, number> = {};

    for (const tid of trialIds) {
      const nRuns = BENCHMARK_SEEDS.slice(0, 4).map((s) => runNaiveBot(data, s, 'normal', tid));
      const s0Runs = BENCHMARK_SEEDS.slice(0, 4).map((s) => runSmartBot(data, s, 'normal', {}, tid));
      const s6Runs = BENCHMARK_SEEDS.slice(0, 4).map((s) =>
        runSmartBot(data, s, 'normal', endgameRelics, tid),
      );
      naiveTrialWins[tid] = nRuns.filter((r) => r.victory).length;
      smartTrial0Wins[tid] = s0Runs.filter((r) => r.victory).length;
      smartTrial6Wins[tid] = s6Runs.filter((r) => r.victory).length;
      smartTrial0AvgWave[tid] = Number(
        (s0Runs.reduce((a, r) => a + r.finalWave, 0) / s0Runs.length).toFixed(1),
      );
    }

    const totalNaiveTrialWins = Object.values(naiveTrialWins).reduce((a, b) => a + b, 0);
    const totalSmartTrial0Wins = Object.values(smartTrial0Wins).reduce((a, b) => a + b, 0);
    const totalSmartTrial6Wins = Object.values(smartTrial6Wins).reduce((a, b) => a + b, 0);

    console.info('[BalanceAudit][SmartBot]', {
      hard0RelicWins: `${smartHardWins}/6 (naive ${naiveHardWins}/6)`,
      hard0RelicAvgWave: `${(smartHardWaveSum / 6).toFixed(1)} vs naive ${(naiveHardWaveSum / 6).toFixed(1)}`,
      hell0Relic: `${smartHell0Wins}/5 (avgWave ${smartHell0AvgWave.toFixed(1)}, waves: [${smartHell0.map((r) => r.finalWave).join(',')}])`,
      hellLv6Relic: `${smartHell6Wins}/5 (avgWave ${smartHell6AvgWave.toFixed(1)})`,
      naiveTrialWins,
      smartTrial0Wins: `${totalSmartTrial0Wins}/16 (${JSON.stringify(smartTrial0Wins)})`,
      smartTrial0AvgWave,
      smartTrial6Wins: `${totalSmartTrial6Wins}/16 (${JSON.stringify(smartTrial6Wins)})`,
    });

    // Hard: SmartBot clearly outperforms NaiveBot
    expect(smartHardWins > naiveHardWins || smartHardWaveSum > naiveHardWaveSum).toBe(true);

    // Hell 0-relic upper bound: challenging late-game wall (<= 40% wins, NOT dying to Wave 5 RNG)
    expect(smartHell0Wins).toBeLessThanOrEqual(2);
    expect(smartHell0AvgWave).toBeGreaterThanOrEqual(12);

    // Relics truly matter on Hell: Lv.6 strictly beats 0-relic and achieves >= 3/5 clears
    expect(smartHell6Wins).toBeGreaterThanOrEqual(3);
    expect(smartHell6Wins).toBeGreaterThan(smartHell0Wins);

    // Secret Realm Trials: Naive struggles (<= 6/16), SmartBot 0-relic <= 50% (<= 8/16),
    // and Lv.6 relics strictly beats 0-relic while clearing every single trial at least once!
    expect(totalNaiveTrialWins).toBeLessThanOrEqual(6);
    expect(totalSmartTrial0Wins).toBeLessThanOrEqual(8);
    expect(totalSmartTrial6Wins).toBeGreaterThan(totalSmartTrial0Wins);
    for (const tid of trialIds) {
      expect(
        smartTrial6Wins[tid],
        `SmartBot Lv.6 should clear ${tid} at least once`,
      ).toBeGreaterThanOrEqual(1);
    }
  }, 30_000);

  it('gates apex 천마강림 (abyss) difficulty for transcended Lv.11-15 16-relic builds while remaining impossible at 0 relics', () => {
    const data = loadGameData();

    const abyss0 = BENCHMARK_SEEDS.slice(0, 5).map((s) => runSmartBot(data, s, 'abyss', {}));
    const abyss0Wins = abyss0.filter((r) => r.victory).length;

    const full16Lv15: Partial<Record<RelicId, number>> = {
      golden_vault: 15,
      million_sword_seal: 15,
      bandit_dagger: 15,
      immortal_furnace: 15,
      founding_jade_seal: 15,
      heavenly_scroll_chest: 15,
      wind_swift_boots: 15,
      crimson_crit_blade: 15,
      armor_break_gauntlet: 15,
      celestial_skill_jade: 15,
      demon_slayer_banner: 15,
      merchant_abacus: 15,
      jade_training_manual: 15,
      phoenix_luck_pouch: 15,
      dragon_range_mirror: 15,
      eight_trigram_mirror: 15,
    };
    const abyss15 = BENCHMARK_SEEDS.slice(0, 5).map((s) =>
      runSmartBot(data, s, 'abyss', full16Lv15),
    );
    const abyss15Wins = abyss15.filter((r) => r.victory).length;
    const abyss15AvgWave = abyss15.reduce((a, r) => a + r.finalWave, 0) / abyss15.length;

    console.info('[BalanceAudit][Abyss]', {
      abyss0Relic: `${abyss0Wins}/5 (waves: [${abyss0.map((r) => r.finalWave).join(',')}])`,
      abyss16xLv15: `${abyss15Wins}/5 (avgWave ${abyss15AvgWave.toFixed(1)}, waves: [${abyss15.map((r) => r.finalWave).join(',')}])`,
    });

    expect(abyss0Wins).toBe(0);
    expect(abyss15Wins).toBeGreaterThanOrEqual(2);

    // Also verify v2.0 new trials: trial_gale_blitz (Lv.6 unlockable) & trial_abyss_sanctum (apex Lv.15 gate)
    const lv6Relics: Partial<Record<RelicId, number>> = {
      founding_jade_seal: 6,
      heavenly_scroll_chest: 6,
      golden_vault: 6,
      million_sword_seal: 6,
      bandit_dagger: 6,
      immortal_furnace: 6,
    };
    const gale0 = BENCHMARK_SEEDS.slice(0, 4).map((s) =>
      runSmartBot(data, s, 'normal', {}, 'trial_gale_blitz'),
    );
    const gale6 = BENCHMARK_SEEDS.slice(0, 4).map((s) =>
      runSmartBot(data, s, 'normal', lv6Relics, 'trial_gale_blitz'),
    );
    const sanctum0 = BENCHMARK_SEEDS.slice(0, 4).map((s) =>
      runSmartBot(data, s, 'normal', {}, 'trial_abyss_sanctum'),
    );
    const sanctum15 = BENCHMARK_SEEDS.slice(0, 4).map((s) =>
      runSmartBot(data, s, 'normal', full16Lv15, 'trial_abyss_sanctum'),
    );

    const gale0Wins = gale0.filter((r) => r.victory).length;
    const gale6Wins = gale6.filter((r) => r.victory).length;
    const sanctum0Wins = sanctum0.filter((r) => r.victory).length;
    const sanctum15Wins = sanctum15.filter((r) => r.victory).length;

    console.info('[BalanceAudit][v2Trials]', {
      galeBlitz0: `${gale0Wins}/4 (waves: [${gale0.map((r) => r.finalWave).join(',')}])`,
      galeBlitzLv6: `${gale6Wins}/4 (waves: [${gale6.map((r) => r.finalWave).join(',')}])`,
      abyssSanctum0: `${sanctum0Wins}/4 (waves: [${sanctum0.map((r) => r.finalWave).join(',')}])`,
      abyssSanctum16xLv15: `${sanctum15Wins}/4 (waves: [${sanctum15.map((r) => r.finalWave).join(',')}])`,
    });

    expect(gale0Wins).toBeLessThanOrEqual(2);
    expect(gale6Wins).toBeGreaterThanOrEqual(2);
    expect(sanctum0Wins).toBe(0);
    expect(sanctum15Wins).toBeGreaterThanOrEqual(2);
  }, 35_000);

  it('prevents Immortal monopoly: balanced damage share (<= 35% per Immortal) and broad roster participation across Hard runs (all 7 Immortals)', () => {
    const data = loadGameData();
    const immortalIds = data.units.filter((u) => u.grade === 'immortal').map((u) => u.id);
    expect(immortalIds.length).toBe(7);

    const midRelics: Partial<Record<RelicId, number>> = {
      founding_jade_seal: 3,
      heavenly_scroll_chest: 3,
      golden_vault: 3,
      million_sword_seal: 3,
      bandit_dagger: 3,
      immortal_furnace: 3,
    };

    const runs = BENCHMARK_SEEDS.map((s) => runSmartBot(data, s, 'hard', midRelics));
    const immortalDmg: Record<string, number> = {};
    const immortalCraftCount: Record<string, number> = {};
    const immortalSurviveCount: Record<string, number> = {};
    for (const id of immortalIds) {
      immortalDmg[id] = 0;
      immortalCraftCount[id] = 0;
      immortalSurviveCount[id] = 0;
    }

    let totalImmortalDmg = 0;
    let totalAllDmg = 0;
    for (const r of runs) {
      totalAllDmg += r.totalDamage;
      for (const id of immortalIds) {
        const d = r.damageByUnit[id] ?? 0;
        immortalDmg[id] = (immortalDmg[id] ?? 0) + d;
        totalImmortalDmg += d;
      }
      for (const id of r.craftedImmortals) {
        immortalCraftCount[id] = (immortalCraftCount[id] ?? 0) + 1;
      }
      for (const id of r.survivingImmortals) {
        immortalSurviveCount[id] = (immortalSurviveCount[id] ?? 0) + 1;
      }
    }

    const immortalSharePct: Record<string, number> = {};
    let maxSharePct = 0;
    let activeImmortalCount = 0;
    for (const id of immortalIds) {
      const pct = totalImmortalDmg > 0 ? ((immortalDmg[id] ?? 0) / totalImmortalDmg) * 100 : 0;
      immortalSharePct[id] = Number(pct.toFixed(1));
      if (pct > maxSharePct) maxSharePct = pct;
      if (pct >= 5) activeImmortalCount++;
    }

    console.info('[BalanceAudit][Immortals]', {
      wins: `${runs.filter((r) => r.victory).length}/${runs.length}`,
      immortalShareOfTotalPct: Number(
        ((totalImmortalDmg / Math.max(1, totalAllDmg)) * 100).toFixed(1),
      ),
      immortalSharePct,
      immortalCraftCount,
      immortalSurviveCount,
    });

    // At least 5 of 7 Immortals must participate meaningfully (>= 5% Immortal share each)
    expect(activeImmortalCount).toBeGreaterThanOrEqual(5);
    // No single Immortal may monopolize > 35% of total Immortal damage
    expect(maxSharePct).toBeLessThanOrEqual(35);
    // Previously never-surviving sword_immortal & asura_emperor must actually appear in runs
    expect(
      (immortalSurviveCount.sword_immortal ?? 0) + (immortalSurviveCount.asura_emperor ?? 0),
    ).toBeGreaterThanOrEqual(2);
  }, 25_000);
});
