import rawBoard from './board.json';
import rawBoons from './boons.json';
import rawDifficulties from './difficulties.json';
import rawGambleRates from './gamble_rates.json';
import rawGrades from './grades.json';
import rawMissions from './missions.json';
import rawRecipes from './recipes.json';
import rawRelics from './relics.json';
import rawSkins from './skins.json';
import rawTrials from './trials.json';
import rawUnits from './units.json';
import rawUpgrades from './upgrades.json';
import rawWaves from './waves.json';
import rawWispPools from './wisp_pools.json';
import { secToTicks, TICK_DT } from '../core/time';
import type {
  BoardConfig,
  BoonDef,
  BoonIconKind,
  BoonId,
  BoonRarity,
  CourtSkinDef,
  CourtSkinId,
  DifficultyConfig,
  DifficultyId,
  FactionId,
  GambleRateDef,
  GameDataBundle,
  GradeDef,
  GridSpec,
  HeroSkinDef,
  MissionConditionKind,
  MissionDef,
  MonsterKind,
  PassiveTraitDef,
  RawUnitDef,
  RawWaveDef,
  RecipeDef,
  RelicDef,
  RelicId,
  SkinCrestKind,
  SkinRarity,
  SkinUnlockCond,
  SupportAuraDef,
  TrialConfig,
  TrialId,
  UnitDef,
  UnitSkillDef,
  UpgradeGroupDef,
  UpgradeGroupId,
  VfxTrackKind,
  WaveDef,
  WispPools,
} from './types';

const VALID_FACTIONS: ReadonlySet<string> = new Set<FactionId>([
  'orthodox',
  'unorthodox',
  'demonic',
]);

const VALID_VFX_TRACKS: ReadonlySet<string> = new Set<VfxTrackKind>([
  'plum_blossom',
  'emperor_thunder',
  'golden_palm',
  'poison_rain',
  'blood_slash',
  'demonic_flame',
  'heavenly_demon',
]);

const VALID_MONSTER_KINDS: ReadonlySet<string> = new Set<MonsterKind>([
  'bandit_minion',
  'jiangshi',
  'blood_zealot',
  'white_tiger',
  'black_serpent',
  'blood_patriarch',
]);

const VALID_UPGRADE_GROUPS: ReadonlySet<string> = new Set<UpgradeGroupId>([
  'orthodox',
  'unorthodox',
  'demonic',
]);

const VALID_RELIC_IDS: ReadonlySet<string> = new Set<RelicId>([
  'golden_vault',
  'million_sword_seal',
  'bandit_dagger',
  'immortal_furnace',
  'founding_jade_seal',
  'heavenly_scroll_chest',
]);

const VALID_DIFFICULTY_IDS: ReadonlySet<string> = new Set<DifficultyId>([
  'normal',
  'hard',
  'hell',
]);

const VALID_TRIAL_IDS: ReadonlySet<string> = new Set<TrialId>([
  'trial_venom_gale',
  'trial_sword_tomb',
  'trial_crimson_iron',
  'trial_chaos_trinity',
]);

const VALID_MISSION_CONDITIONS: ReadonlySet<string> = new Set<MissionConditionKind>([
  'distinct_leaf_owned',
  'min_grade_owned',
  'any_formation_active',
  'high_formation_active',
  'bounties_slain',
  'gamble_wins',
  'held_coin',
  'total_upgrades',
]);

const VALID_SKIN_RARITIES: ReadonlySet<string> = new Set<SkinRarity>([
  'rare',
  'legendary',
  'mythic',
  'achievement',
]);

const VALID_SKIN_UNLOCKS: ReadonlySet<string> = new Set<SkinUnlockCond>([
  'any_clear',
  'hell_clear',
  'wave_35',
]);

const VALID_SKIN_CRESTS: ReadonlySet<string> = new Set<SkinCrestKind>([
  'halo',
  'crown',
  'blades',
  'orbs',
]);

const VALID_COURT_IDS: ReadonlySet<string> = new Set<CourtSkinId>([
  'court_bamboo_dawn',
  'court_crimson_sunset',
  'court_blood_moon',
  'court_golden_palace',
]);

function assertRecord(val: unknown, label: string): Record<string, unknown> {
  if (typeof val !== 'object' || val === null || Array.isArray(val)) {
    throw new Error(`[DataValidation] ${label} must be an object`);
  }
  return val as Record<string, unknown>;
}

function assertPositiveNumber(val: unknown, label: string): number {
  if (typeof val !== 'number' || !Number.isFinite(val) || val <= 0) {
    throw new Error(`[DataValidation] ${label} must be a positive finite number`);
  }
  return val;
}

function assertNonNegativeNumber(val: unknown, label: string): number {
  if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) {
    throw new Error(`[DataValidation] ${label} must be a non-negative finite number`);
  }
  return val;
}

function assertNonEmptyString(val: unknown, label: string): string {
  if (typeof val !== 'string' || val.trim().length === 0) {
    throw new Error(`[DataValidation] ${label} must be a non-empty string`);
  }
  return val;
}

function assertBoolean(val: unknown, label: string): boolean {
  if (typeof val !== 'boolean') {
    throw new Error(`[DataValidation] ${label} must be boolean`);
  }
  return val;
}

export function validateGrades(input: unknown): GradeDef[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('[DataValidation] grades.json must be a non-empty array');
  }
  const seenIds = new Set<string>();
  const seenRanks = new Set<number>();
  const out: GradeDef[] = [];

  for (let i = 0; i < input.length; i++) {
    const row = assertRecord(input[i], `grades[${i}]`);
    const id = assertNonEmptyString(row.id, `grades[${i}].id`);
    const name = assertNonEmptyString(row.name, `grades[${i}].name`);
    const rank = assertPositiveNumber(row.rank, `grades[${i}].rank`);
    if (!Number.isInteger(rank)) {
      throw new Error(`[DataValidation] grades[${i}].rank must be an integer`);
    }
    const color = assertNonEmptyString(row.color, `grades[${i}].color`);
    const summonable = assertBoolean(row.summonable, `grades[${i}].summonable`);
    const summonWeight = assertNonNegativeNumber(row.summonWeight, `grades[${i}].summonWeight`);
    const isSurplusCleanupTarget = assertBoolean(
      row.isSurplusCleanupTarget,
      `grades[${i}].isSurplusCleanupTarget`,
    );
    const starterWispCount = Math.floor(
      assertNonNegativeNumber(row.starterWispCount, `grades[${i}].starterWispCount`),
    );
    const scrollChestUnlockLv = Math.floor(
      assertNonNegativeNumber(row.scrollChestUnlockLv, `grades[${i}].scrollChestUnlockLv`),
    );
    const scrollChestBonusLv = Math.floor(
      assertNonNegativeNumber(row.scrollChestBonusLv, `grades[${i}].scrollChestBonusLv`),
    );
    const sellLuckGuaranteed = Math.floor(
      assertNonNegativeNumber(row.sellLuckGuaranteed, `grades[${i}].sellLuckGuaranteed`),
    );
    const sellLuckChancePct = assertNonNegativeNumber(
      row.sellLuckChancePct,
      `grades[${i}].sellLuckChancePct`,
    );
    const codexRewardGold = Math.floor(
      assertNonNegativeNumber(row.codexRewardGold, `grades[${i}].codexRewardGold`),
    );
    const codexRewardKeys = Math.floor(
      assertNonNegativeNumber(row.codexRewardKeys, `grades[${i}].codexRewardKeys`),
    );
    const showSkillCallout = assertBoolean(
      row.showSkillCallout,
      `grades[${i}].showSkillCallout`,
    );
    const isHighTierToast = assertBoolean(row.isHighTierToast, `grades[${i}].isHighTierToast`);
    const isCutInTier = assertBoolean(row.isCutInTier, `grades[${i}].isCutInTier`);

    if (seenIds.has(id)) {
      throw new Error(`[DataValidation] duplicate grade id: ${id}`);
    }
    if (seenRanks.has(rank)) {
      throw new Error(`[DataValidation] duplicate grade rank: ${rank}`);
    }
    seenIds.add(id);
    seenRanks.add(rank);
    out.push({
      id,
      name,
      rank,
      color,
      summonable,
      summonWeight,
      fx: typeof row.fx === 'string' ? row.fx : undefined,
      isSurplusCleanupTarget,
      starterWispCount,
      scrollChestUnlockLv,
      scrollChestBonusLv,
      sellLuckGuaranteed,
      sellLuckChancePct,
      codexRewardGold,
      codexRewardKeys,
      showSkillCallout,
      isHighTierToast,
      isCutInTier,
    });
  }

  out.sort((a, b) => a.rank - b.rank);
  return out;
}

function validateUnitSkill(input: unknown, label: string): UnitSkillDef {
  const r = assertRecord(input, label);
  const name = assertNonEmptyString(r.name, `${label}.name`);
  const desc = assertNonEmptyString(r.desc, `${label}.desc`);
  const everyN = assertPositiveNumber(r.everyN, `${label}.everyN`);
  if (!Number.isInteger(everyN)) {
    throw new Error(`[DataValidation] ${label}.everyN must be an integer`);
  }
  const atkRatio = assertPositiveNumber(r.atkRatio, `${label}.atkRatio`);
  const splashRadius = assertNonNegativeNumber(r.splashRadius, `${label}.splashRadius`);
  const stunSec = assertNonNegativeNumber(r.stunSec, `${label}.stunSec`);
  const slowPct = assertNonNegativeNumber(r.slowPct, `${label}.slowPct`);
  const slowSec = assertNonNegativeNumber(r.slowSec, `${label}.slowSec`);
  const vfxStr = assertNonEmptyString(r.vfxTrack, `${label}.vfxTrack`);
  if (!VALID_VFX_TRACKS.has(vfxStr)) {
    throw new Error(`[DataValidation] ${label}.vfxTrack invalid: ${vfxStr}`);
  }

  return {
    name,
    desc,
    everyN,
    atkRatio,
    splashRadius,
    stunTicks: stunSec > 0 ? Math.max(1, secToTicks(stunSec)) : 0,
    slowPct: Math.min(0.85, slowPct),
    slowTicks: slowSec > 0 ? Math.max(1, secToTicks(slowSec)) : 0,
    vfxTrack: vfxStr as VfxTrackKind,
  };
}

function validatePassiveTrait(input: unknown, label: string): PassiveTraitDef {
  const r = assertRecord(input, label);
  const id = assertNonEmptyString(r.id, `${label}.id`);
  const name = assertNonEmptyString(r.name, `${label}.name`);
  const desc = assertNonEmptyString(r.desc, `${label}.desc`);
  const bossDamagePct =
    r.bossDamagePct !== undefined
      ? assertNonNegativeNumber(r.bossDamagePct, `${label}.bossDamagePct`)
      : undefined;
  const executeBelowHpPct =
    r.executeBelowHpPct !== undefined
      ? assertNonNegativeNumber(r.executeBelowHpPct, `${label}.executeBelowHpPct`)
      : undefined;
  const executeDamagePct =
    r.executeDamagePct !== undefined
      ? assertNonNegativeNumber(r.executeDamagePct, `${label}.executeDamagePct`)
      : undefined;
  const shreddedDamagePct =
    r.shreddedDamagePct !== undefined
      ? assertNonNegativeNumber(r.shreddedDamagePct, `${label}.shreddedDamagePct`)
      : undefined;
  const armorPiercePct =
    r.armorPiercePct !== undefined
      ? Math.min(0.95, assertNonNegativeNumber(r.armorPiercePct, `${label}.armorPiercePct`))
      : undefined;

  return {
    id,
    name,
    desc,
    bossDamagePct,
    executeBelowHpPct,
    executeDamagePct,
    shreddedDamagePct,
    armorPiercePct,
  };
}

export function validateUnits(
  input: unknown,
  gradesById: ReadonlyMap<string, GradeDef>,
): UnitDef[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('[DataValidation] units.json must be a non-empty array');
  }
  const seen = new Set<string>();
  const out: UnitDef[] = [];

  for (let i = 0; i < input.length; i++) {
    const row = assertRecord(input[i], `units[${i}]`) as unknown as RawUnitDef;
    const id = assertNonEmptyString(row.id, `units[${i}].id`);
    if (seen.has(id)) {
      throw new Error(`[DataValidation] duplicate unit id: ${id}`);
    }
    seen.add(id);

    const name = assertNonEmptyString(row.name, `units[${i}].name`);
    const title = assertNonEmptyString(row.title, `units[${i}].title`);
    const factionStr = assertNonEmptyString(row.faction, `units[${i}].faction`);
    if (!VALID_FACTIONS.has(factionStr)) {
      throw new Error(`[DataValidation] units[${i}].faction invalid: ${factionStr}`);
    }
    const grade = assertNonEmptyString(row.grade, `units[${i}].grade`);
    if (!gradesById.has(grade)) {
      throw new Error(`[DataValidation] units[${i}] references unknown grade: ${grade}`);
    }
    if (typeof row.leaf !== 'boolean') {
      throw new Error(`[DataValidation] units[${i}].leaf must be boolean`);
    }
    const atk = assertPositiveNumber(row.atk, `units[${i}].atk`);
    const range = assertPositiveNumber(row.range, `units[${i}].range`);
    const attackIntervalSec = assertPositiveNumber(
      row.attackIntervalSec,
      `units[${i}].attackIntervalSec`,
    );
    const critChance = assertNonNegativeNumber(row.critChance, `units[${i}].critChance`);
    const critMult = assertPositiveNumber(row.critMult, `units[${i}].critMult`);
    const sellCoin = assertNonNegativeNumber(row.sellCoin, `units[${i}].sellCoin`);
    const armorShred =
      row.armorShred !== undefined
        ? Math.round(assertNonNegativeNumber(row.armorShred, `units[${i}].armorShred`))
        : 0;
    let supportAura: SupportAuraDef | undefined;
    if (row.supportAura !== undefined) {
      const auraRaw = assertRecord(row.supportAura, `units[${i}].supportAura`);
      const auraName = assertNonEmptyString(auraRaw.name, `units[${i}].supportAura.name`);
      const atkPct = assertNonNegativeNumber(auraRaw.atkPct, `units[${i}].supportAura.atkPct`);
      const speedPct = assertNonNegativeNumber(
        auraRaw.speedPct,
        `units[${i}].supportAura.speedPct`,
      );
      if (atkPct <= 0 && speedPct <= 0) {
        throw new Error(
          `[DataValidation] units[${i}].supportAura must grant positive atkPct or speedPct`,
        );
      }
      supportAura = { name: auraName, atkPct, speedPct };
    }
    const passiveTrait =
      row.passiveTrait !== undefined
        ? validatePassiveTrait(row.passiveTrait, `units[${i}].passiveTrait`)
        : undefined;
    const skill = validateUnitSkill(row.skill, `units[${i}].skill`);

    out.push({
      id,
      name,
      title,
      faction: factionStr as FactionId,
      grade,
      leaf: row.leaf,
      atk,
      range,
      attackIntervalTicks: Math.max(1, secToTicks(attackIntervalSec)),
      critChance: Math.min(1, critChance),
      critMult,
      sellCoin,
      armorShred,
      supportAura,
      passiveTrait,
      skill,
    });
  }
  return out;
}

export function validateRecipesShape(input: unknown): RecipeDef[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('[DataValidation] recipes.json must be a non-empty array');
  }
  const seenIds = new Set<string>();
  const out: RecipeDef[] = [];

  for (let i = 0; i < input.length; i++) {
    const row = assertRecord(input[i], `recipes[${i}]`);
    const id = assertNonEmptyString(row.id, `recipes[${i}].id`);
    if (seenIds.has(id)) {
      throw new Error(`[DataValidation] duplicate recipe id: ${id}`);
    }
    seenIds.add(id);

    const output = assertNonEmptyString(row.output, `recipes[${i}].output`);
    const priority = assertNonNegativeNumber(row.priority, `recipes[${i}].priority`);
    if (!Array.isArray(row.ingredients) || row.ingredients.length < 1) {
      throw new Error(
        `[DataValidation] recipes[${i}].ingredients must contain at least 1 ingredient entry`,
      );
    }

    const ingSeen = new Set<string>();
    let totalUnits = 0;
    const ingredients = row.ingredients.map((rawIng, j) => {
      const ing = assertRecord(rawIng, `recipes[${i}].ingredients[${j}]`);
      const unit = assertNonEmptyString(ing.unit, `recipes[${i}].ingredients[${j}].unit`);
      const n = assertPositiveNumber(ing.n, `recipes[${i}].ingredients[${j}].n`);
      if (!Number.isInteger(n)) {
        throw new Error(`[DataValidation] recipes[${i}].ingredients[${j}].n must be integer`);
      }
      if (ingSeen.has(unit)) {
        throw new Error(
          `[DataValidation] recipes[${i}] lists ingredient unit '${unit}' more than once`,
        );
      }
      ingSeen.add(unit);
      totalUnits += n;
      return { unit, n };
    });

    if (totalUnits < 2) {
      throw new Error(
        `[DataValidation] recipes[${i}] must consume at least 2 total ingredient units (got ${totalUnits})`,
      );
    }

    out.push({ id, output, ingredients, priority });
  }
  return out;
}

function validateGridSpec(input: unknown, label: string): GridSpec {
  const r = assertRecord(input, label);
  return {
    cols: assertPositiveNumber(r.cols, `${label}.cols`),
    rows: assertPositiveNumber(r.rows, `${label}.rows`),
    originX: assertNonNegativeNumber(r.originX, `${label}.originX`),
    originY: assertNonNegativeNumber(r.originY, `${label}.originY`),
    cellW: assertPositiveNumber(r.cellW, `${label}.cellW`),
    cellH: assertPositiveNumber(r.cellH, `${label}.cellH`),
    gapX: assertNonNegativeNumber(r.gapX, `${label}.gapX`),
    gapY: assertNonNegativeNumber(r.gapY, `${label}.gapY`),
  };
}

export function validateBoard(input: unknown): BoardConfig {
  const r = assertRecord(input, 'board');
  const logicalWidth = assertPositiveNumber(r.logicalWidth, 'board.logicalWidth');
  const logicalHeight = assertPositiveNumber(r.logicalHeight, 'board.logicalHeight');
  if (logicalWidth !== 720 || logicalHeight !== 1280) {
    throw new Error('[DataValidation] board logical resolution must be 720x1280');
  }
  const arena = assertRecord(r.arenaRect, 'board.arenaRect');
  const path = assertRecord(r.path, 'board.path');
  if (!Array.isArray(path.waypoints) || path.waypoints.length < 3) {
    throw new Error('[DataValidation] board.path.waypoints must have >= 3 points');
  }
  const waypoints = path.waypoints.map((wp, i) => {
    const p = assertRecord(wp, `board.path.waypoints[${i}]`);
    return {
      x: assertNonNegativeNumber(p.x, `waypoints[${i}].x`),
      y: assertNonNegativeNumber(p.y, `waypoints[${i}].y`),
    };
  });
  const econ = assertRecord(r.economy, 'board.economy');

  return {
    logicalWidth,
    logicalHeight,
    arenaRect: {
      x: assertNonNegativeNumber(arena.x, 'arenaRect.x'),
      y: assertNonNegativeNumber(arena.y, 'arenaRect.y'),
      w: assertPositiveNumber(arena.w, 'arenaRect.w'),
      h: assertPositiveNumber(arena.h, 'arenaRect.h'),
    },
    path: {
      corridorWidth: assertPositiveNumber(path.corridorWidth, 'path.corridorWidth'),
      monsterCap: assertPositiveNumber(path.monsterCap, 'path.monsterCap'),
      waypoints,
    },
    field: validateGridSpec(r.field, 'board.field'),
    bench: validateGridSpec(r.bench, 'board.bench'),
    economy: {
      initialCoin: assertNonNegativeNumber(econ.initialCoin, 'economy.initialCoin'),
      initialLuckStone: assertNonNegativeNumber(econ.initialLuckStone, 'economy.initialLuckStone'),
      baseSummonCost: assertPositiveNumber(econ.baseSummonCost, 'economy.baseSummonCost'),
      summonCostStep: assertNonNegativeNumber(econ.summonCostStep, 'economy.summonCostStep'),
    },
  };
}

export function validateWaves(
  input: unknown,
  gradesById?: ReadonlyMap<string, GradeDef>,
): WaveDef[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('[DataValidation] waves.json must be a non-empty array');
  }
  return input.map((item, i) => {
    const row = assertRecord(item, `waves[${i}]`) as unknown as RawWaveDef;
    const wave = assertPositiveNumber(row.wave, `waves[${i}].wave`);
    if (wave !== i + 1) {
      throw new Error(`[DataValidation] waves[${i}].wave must equal ${i + 1} (got ${wave})`);
    }
    const durationSec = assertPositiveNumber(row.durationSec, `waves[${i}].durationSec`);
    const spawnCount = assertPositiveNumber(row.spawnCount, `waves[${i}].spawnCount`);
    const spawnIntervalSec = assertPositiveNumber(
      row.spawnIntervalSec,
      `waves[${i}].spawnIntervalSec`,
    );
    const monsterHp = assertPositiveNumber(row.monsterHp, `waves[${i}].monsterHp`);
    const monsterSpeed = assertPositiveNumber(row.monsterSpeed, `waves[${i}].monsterSpeed`);
    const monsterRadius = assertPositiveNumber(row.monsterRadius, `waves[${i}].monsterRadius`);
    const rewardCoin = assertNonNegativeNumber(row.rewardCoin, `waves[${i}].rewardCoin`);
    const kindStr = assertNonEmptyString(row.monsterKind, `waves[${i}].monsterKind`);
    if (!VALID_MONSTER_KINDS.has(kindStr)) {
      throw new Error(`[DataValidation] waves[${i}].monsterKind invalid: ${kindStr}`);
    }
    const isBoss = Boolean(row.isBoss);
    const bossName =
      typeof row.bossName === 'string' && row.bossName.trim() ? row.bossName : undefined;
    const rewardWispGrade =
      typeof row.rewardWispGrade === 'string' && row.rewardWispGrade.trim()
        ? row.rewardWispGrade
        : undefined;
    if (rewardWispGrade && gradesById && !gradesById.has(rewardWispGrade)) {
      throw new Error(
        `[DataValidation] waves[${i}].rewardWispGrade unknown: ${rewardWispGrade}`,
      );
    }

    return {
      wave,
      durationTicks: Math.max(1, secToTicks(durationSec)),
      spawnCount,
      spawnIntervalTicks: Math.max(1, secToTicks(spawnIntervalSec)),
      monsterHp,
      monsterSpeedPerTick: monsterSpeed * TICK_DT,
      monsterRadius,
      rewardCoin,
      monsterKind: kindStr as MonsterKind,
      isBoss,
      bossName,
      rewardWispGrade,
    };
  });
}

export function validateDifficulties(input: unknown): DifficultyConfig[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('[DataValidation] difficulties.json must be a non-empty array');
  }
  const seen = new Set<string>();
  return input.map((item, i) => {
    const r = assertRecord(item, `difficulties[${i}]`);
    const idStr = assertNonEmptyString(r.id, `difficulties[${i}].id`);
    if (!VALID_DIFFICULTY_IDS.has(idStr)) {
      throw new Error(`[DataValidation] difficulties[${i}].id invalid: ${idStr}`);
    }
    if (seen.has(idStr)) {
      throw new Error(`[DataValidation] duplicate difficulty id: ${idStr}`);
    }
    seen.add(idStr);
    return {
      id: idStr as DifficultyId,
      name: assertNonEmptyString(r.name, `difficulties[${i}].name`),
      badge: assertNonEmptyString(r.badge, `difficulties[${i}].badge`),
      desc: assertNonEmptyString(r.desc, `difficulties[${i}].desc`),
      hpMult: assertPositiveNumber(r.hpMult, `difficulties[${i}].hpMult`),
      speedMult: assertPositiveNumber(r.speedMult, `difficulties[${i}].speedMult`),
      armorBonus: Math.round(
        assertNonNegativeNumber(r.armorBonus, `difficulties[${i}].armorBonus`),
      ),
      rewardMult: assertPositiveNumber(r.rewardMult, `difficulties[${i}].rewardMult`),
      firstClearGold: Math.floor(
        assertNonNegativeNumber(r.firstClearGold, `difficulties[${i}].firstClearGold`),
      ),
      firstClearKeys: Math.floor(
        assertNonNegativeNumber(r.firstClearKeys, `difficulties[${i}].firstClearKeys`),
      ),
    };
  });
}

export function validateTrials(input: unknown): TrialConfig[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('[DataValidation] trials.json must be a non-empty array');
  }
  const seen = new Set<string>();
  return input.map((item, i) => {
    const r = assertRecord(item, `trials[${i}]`);
    const idStr = assertNonEmptyString(r.id, `trials[${i}].id`);
    if (!VALID_TRIAL_IDS.has(idStr)) {
      throw new Error(`[DataValidation] trials[${i}].id invalid: ${idStr}`);
    }
    if (seen.has(idStr)) {
      throw new Error(`[DataValidation] duplicate trial id: ${idStr}`);
    }
    seen.add(idStr);
    return {
      id: idStr as TrialId,
      name: assertNonEmptyString(r.name, `trials[${i}].name`),
      badge: assertNonEmptyString(r.badge, `trials[${i}].badge`),
      ruleTag: assertNonEmptyString(r.ruleTag, `trials[${i}].ruleTag`),
      desc: assertNonEmptyString(r.desc, `trials[${i}].desc`),
      targetWave: Math.floor(assertPositiveNumber(r.targetWave, `trials[${i}].targetWave`)),
      hpMult: assertPositiveNumber(r.hpMult, `trials[${i}].hpMult`),
      speedMult: assertPositiveNumber(r.speedMult, `trials[${i}].speedMult`),
      bonusMonsterArmor: Math.round(
        assertNonNegativeNumber(r.bonusMonsterArmor, `trials[${i}].bonusMonsterArmor`),
      ),
      bossCooldownMult: assertPositiveNumber(
        r.bossCooldownMult,
        `trials[${i}].bossCooldownMult`,
      ),
      disableInterest: assertBoolean(r.disableInterest, `trials[${i}].disableInterest`),
      orthodoxCritMultBonus: assertNonNegativeNumber(
        r.orthodoxCritMultBonus,
        `trials[${i}].orthodoxCritMultBonus`,
      ),
      unorthodoxSpeedMult: assertPositiveNumber(
        r.unorthodoxSpeedMult,
        `trials[${i}].unorthodoxSpeedMult`,
      ),
      unorthodoxBonusShred: Math.round(
        assertNonNegativeNumber(r.unorthodoxBonusShred, `trials[${i}].unorthodoxBonusShred`),
      ),
      demonicSkillRatioMult: assertPositiveNumber(
        r.demonicSkillRatioMult,
        `trials[${i}].demonicSkillRatioMult`,
      ),
      gambleBonusPct: assertNonNegativeNumber(r.gambleBonusPct, `trials[${i}].gambleBonusPct`),
      trinityAtkBonusPct: assertNonNegativeNumber(
        r.trinityAtkBonusPct,
        `trials[${i}].trinityAtkBonusPct`,
      ),
      rewardMult: assertPositiveNumber(r.rewardMult, `trials[${i}].rewardMult`),
      firstClearGold: Math.floor(
        assertNonNegativeNumber(r.firstClearGold, `trials[${i}].firstClearGold`),
      ),
      firstClearKeys: Math.floor(
        assertNonNegativeNumber(r.firstClearKeys, `trials[${i}].firstClearKeys`),
      ),
      firstClearSilk: Math.floor(
        assertNonNegativeNumber(r.firstClearSilk, `trials[${i}].firstClearSilk`),
      ),
    };
  });
}

export function validateWispPools(
  input: unknown,
  gradesById: ReadonlyMap<string, GradeDef>,
  unitsById: ReadonlyMap<string, UnitDef>,
): WispPools {
  const rec = assertRecord(input, 'wisp_pools');
  const out: Record<string, readonly string[]> = {};
  for (const [gradeId, poolRaw] of Object.entries(rec)) {
    if (!gradesById.has(gradeId)) {
      throw new Error(`[DataValidation] wisp_pools unknown grade: ${gradeId}`);
    }
    if (!Array.isArray(poolRaw) || poolRaw.length === 0) {
      throw new Error(`[DataValidation] wisp_pools[${gradeId}] must be non-empty array`);
    }
    out[gradeId] = poolRaw.map((u, idx) => {
      const unitId = assertNonEmptyString(u, `wisp_pools[${gradeId}][${idx}]`);
      const def = unitsById.get(unitId);
      if (!def) {
        throw new Error(`[DataValidation] wisp_pools[${gradeId}] unknown unit: ${unitId}`);
      }
      if (def.grade !== gradeId) {
        throw new Error(
          `[DataValidation] wisp_pools[${gradeId}] unit '${unitId}' has grade '${def.grade}'`,
        );
      }
      return unitId;
    });
  }
  return out;
}

export function validateGambleRates(
  input: unknown,
  gradesById: ReadonlyMap<string, GradeDef>,
): GambleRateDef[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('[DataValidation] gamble_rates.json must be a non-empty array');
  }
  return input.map((item, i) => {
    const r = assertRecord(item, `gamble_rates[${i}]`);
    const tier = assertNonEmptyString(r.tier, `gamble_rates[${i}].tier`);
    if (!gradesById.has(tier)) {
      throw new Error(`[DataValidation] gamble_rates[${i}] unknown grade tier: ${tier}`);
    }
    const label = assertNonEmptyString(r.label, `gamble_rates[${i}].label`);
    const costLuck = assertPositiveNumber(r.costLuck, `gamble_rates[${i}].costLuck`);
    const chancePct = assertPositiveNumber(r.chancePct, `gamble_rates[${i}].chancePct`);
    const desc = assertNonEmptyString(r.desc, `gamble_rates[${i}].desc`);
    return { tier, label, costLuck, chancePct, desc };
  });
}

export function validateUpgrades(input: unknown): UpgradeGroupDef[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('[DataValidation] upgrades.json must be a non-empty array');
  }
  const seen = new Set<string>();
  return input.map((item, i) => {
    const r = assertRecord(item, `upgrades[${i}]`);
    const id = assertNonEmptyString(r.id, `upgrades[${i}].id`);
    if (!VALID_UPGRADE_GROUPS.has(id)) {
      throw new Error(`[DataValidation] upgrades[${i}].id invalid: ${id}`);
    }
    if (seen.has(id)) {
      throw new Error(`[DataValidation] duplicate upgrade group: ${id}`);
    }
    seen.add(id);
    const name = assertNonEmptyString(r.name, `upgrades[${i}].name`);
    const factionStr = assertNonEmptyString(r.faction, `upgrades[${i}].faction`);
    if (!VALID_FACTIONS.has(factionStr)) {
      throw new Error(`[DataValidation] upgrades[${i}].faction invalid: ${factionStr}`);
    }
    const desc = assertNonEmptyString(r.desc, `upgrades[${i}].desc`);
    const currency = r.currency === 'luck' ? 'luck' : 'coin';
    const baseCost = assertPositiveNumber(r.baseCost, `upgrades[${i}].baseCost`);
    const costStep = assertNonNegativeNumber(r.costStep, `upgrades[${i}].costStep`);
    const atkBonusPctPerLv = assertPositiveNumber(
      r.atkBonusPctPerLv,
      `upgrades[${i}].atkBonusPctPerLv`,
    );
    const maxLevel = assertPositiveNumber(r.maxLevel, `upgrades[${i}].maxLevel`);
    return {
      id: id as UpgradeGroupId,
      name,
      faction: factionStr as FactionId,
      desc,
      currency,
      baseCost,
      costStep,
      atkBonusPctPerLv,
      maxLevel,
    };
  });
}

export function validateRelics(input: unknown): RelicDef[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('[DataValidation] relics.json must be a non-empty array');
  }
  const seen = new Set<string>();
  return input.map((item, i) => {
    const r = assertRecord(item, `relics[${i}]`);
    const id = assertNonEmptyString(r.id, `relics[${i}].id`);
    if (!VALID_RELIC_IDS.has(id)) {
      throw new Error(`[DataValidation] relics[${i}].id invalid: ${id}`);
    }
    if (seen.has(id)) {
      throw new Error(`[DataValidation] duplicate relic id: ${id}`);
    }
    seen.add(id);
    const name = assertNonEmptyString(r.name, `relics[${i}].name`);
    const tag = assertNonEmptyString(r.tag, `relics[${i}].tag`);
    const desc = assertNonEmptyString(r.desc, `relics[${i}].desc`);
    const maxLevel = assertPositiveNumber(r.maxLevel, `relics[${i}].maxLevel`);
    const baseUpgradeGold = assertPositiveNumber(
      r.baseUpgradeGold,
      `relics[${i}].baseUpgradeGold`,
    );
    const stepUpgradeGold = assertNonNegativeNumber(
      r.stepUpgradeGold,
      `relics[${i}].stepUpgradeGold`,
    );
    return {
      id: id as RelicId,
      name,
      tag,
      desc,
      maxLevel,
      baseUpgradeGold,
      stepUpgradeGold,
    };
  });
}

export function validateMissions(
  input: unknown,
  gradesById: ReadonlyMap<string, GradeDef>,
): MissionDef[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('[DataValidation] missions.json must be a non-empty array');
  }
  const seen = new Set<string>();
  return input.map((item, i) => {
    const r = assertRecord(item, `missions[${i}]`);
    const id = assertNonEmptyString(r.id, `missions[${i}].id`);
    if (seen.has(id)) {
      throw new Error(`[DataValidation] duplicate mission id: ${id}`);
    }
    seen.add(id);
    const name = assertNonEmptyString(r.name, `missions[${i}].name`);
    const desc = assertNonEmptyString(r.desc, `missions[${i}].desc`);
    const condStr = assertNonEmptyString(r.condition, `missions[${i}].condition`);
    if (!VALID_MISSION_CONDITIONS.has(condStr)) {
      throw new Error(`[DataValidation] missions[${i}].condition invalid: ${condStr}`);
    }
    const target = assertPositiveNumber(r.target, `missions[${i}].target`);
    const gradeRank =
      typeof r.gradeRank === 'number'
        ? assertPositiveNumber(r.gradeRank, `missions[${i}].gradeRank`)
        : undefined;
    const rewardCoin = assertNonNegativeNumber(r.rewardCoin, `missions[${i}].rewardCoin`);
    const rewardLuck = assertNonNegativeNumber(r.rewardLuck, `missions[${i}].rewardLuck`);
    const rewardWispGrade =
      typeof r.rewardWispGrade === 'string' && r.rewardWispGrade.trim().length > 0
        ? r.rewardWispGrade
        : undefined;
    if (rewardWispGrade && !gradesById.has(rewardWispGrade)) {
      throw new Error(
        `[DataValidation] missions[${i}].rewardWispGrade unknown: ${rewardWispGrade}`,
      );
    }

    return {
      id,
      name,
      desc,
      condition: condStr as MissionConditionKind,
      target,
      gradeRank,
      rewardCoin,
      rewardLuck,
      rewardWispGrade,
    };
  });
}

export function validateSkins(
  input: unknown,
  unitsById: ReadonlyMap<string, UnitDef>,
): { heroSkins: HeroSkinDef[]; courtSkins: CourtSkinDef[] } {
  const rec = assertRecord(input, 'skins');
  if (!Array.isArray(rec.heroSkins) || rec.heroSkins.length === 0) {
    throw new Error('[DataValidation] skins.heroSkins must be a non-empty array');
  }
  if (!Array.isArray(rec.courtSkins) || rec.courtSkins.length === 0) {
    throw new Error('[DataValidation] skins.courtSkins must be a non-empty array');
  }

  const seenIds = new Set<string>();
  const heroSkins: HeroSkinDef[] = rec.heroSkins.map((raw, i) => {
    const r = assertRecord(raw, `skins.heroSkins[${i}]`);
    const id = assertNonEmptyString(r.id, `skins.heroSkins[${i}].id`);
    if (seenIds.has(id)) {
      throw new Error(`[DataValidation] duplicate skin id: ${id}`);
    }
    seenIds.add(id);
    const unitId = assertNonEmptyString(r.unitId, `skins.heroSkins[${i}].unitId`);
    if (!unitsById.has(unitId)) {
      throw new Error(`[DataValidation] skins.heroSkins[${i}] unknown unitId: ${unitId}`);
    }
    const name = assertNonEmptyString(r.name, `skins.heroSkins[${i}].name`);
    const rarityStr = assertNonEmptyString(r.rarity, `skins.heroSkins[${i}].rarity`);
    if (!VALID_SKIN_RARITIES.has(rarityStr)) {
      throw new Error(`[DataValidation] skins.heroSkins[${i}].rarity invalid: ${rarityStr}`);
    }
    let unlockCond: SkinUnlockCond | undefined;
    if (r.unlockCond !== undefined) {
      const uStr = assertNonEmptyString(r.unlockCond, `skins.heroSkins[${i}].unlockCond`);
      if (!VALID_SKIN_UNLOCKS.has(uStr)) {
        throw new Error(`[DataValidation] skins.heroSkins[${i}].unlockCond invalid: ${uStr}`);
      }
      unlockCond = uStr as SkinUnlockCond;
    }
    const silkCost = assertNonNegativeNumber(r.silkCost, `skins.heroSkins[${i}].silkCost`);
    const desc = assertNonEmptyString(r.desc, `skins.heroSkins[${i}].desc`);
    const robeHue = assertNonNegativeNumber(r.robeHue, `skins.heroSkins[${i}].robeHue`);
    const satMult = assertPositiveNumber(r.satMult, `skins.heroSkins[${i}].satMult`);
    if (typeof r.lumOffset !== 'number' || !Number.isFinite(r.lumOffset)) {
      throw new Error(`[DataValidation] skins.heroSkins[${i}].lumOffset must be finite number`);
    }
    const primaryColor = assertNonEmptyString(
      r.primaryColor,
      `skins.heroSkins[${i}].primaryColor`,
    );
    const secondaryColor = assertNonEmptyString(
      r.secondaryColor,
      `skins.heroSkins[${i}].secondaryColor`,
    );
    const crestStr = assertNonEmptyString(r.crestKind, `skins.heroSkins[${i}].crestKind`);
    if (!VALID_SKIN_CRESTS.has(crestStr)) {
      throw new Error(`[DataValidation] skins.heroSkins[${i}].crestKind invalid: ${crestStr}`);
    }

    return {
      id,
      unitId,
      name,
      rarity: rarityStr as SkinRarity,
      unlockCond,
      silkCost,
      desc,
      robeHue,
      satMult,
      lumOffset: r.lumOffset,
      primaryColor,
      secondaryColor,
      crestKind: crestStr as SkinCrestKind,
    };
  });

  const courtSkins: CourtSkinDef[] = rec.courtSkins.map((raw, i) => {
    const r = assertRecord(raw, `skins.courtSkins[${i}]`);
    const idStr = assertNonEmptyString(r.id, `skins.courtSkins[${i}].id`);
    if (!VALID_COURT_IDS.has(idStr)) {
      throw new Error(`[DataValidation] skins.courtSkins[${i}].id invalid: ${idStr}`);
    }
    if (seenIds.has(idStr)) {
      throw new Error(`[DataValidation] duplicate skin id: ${idStr}`);
    }
    seenIds.add(idStr);
    const name = assertNonEmptyString(r.name, `skins.courtSkins[${i}].name`);
    const rarityStr = assertNonEmptyString(r.rarity, `skins.courtSkins[${i}].rarity`);
    if (!VALID_SKIN_RARITIES.has(rarityStr)) {
      throw new Error(`[DataValidation] skins.courtSkins[${i}].rarity invalid: ${rarityStr}`);
    }
    let unlockCond: SkinUnlockCond | undefined;
    if (r.unlockCond !== undefined) {
      const uStr = assertNonEmptyString(r.unlockCond, `skins.courtSkins[${i}].unlockCond`);
      if (!VALID_SKIN_UNLOCKS.has(uStr)) {
        throw new Error(`[DataValidation] skins.courtSkins[${i}].unlockCond invalid: ${uStr}`);
      }
      unlockCond = uStr as SkinUnlockCond;
    }
    const silkCost = assertNonNegativeNumber(r.silkCost, `skins.courtSkins[${i}].silkCost`);
    const desc = assertNonEmptyString(r.desc, `skins.courtSkins[${i}].desc`);
    const tintColor = assertNonEmptyString(r.tintColor, `skins.courtSkins[${i}].tintColor`);
    const tintAlpha = assertNonNegativeNumber(r.tintAlpha, `skins.courtSkins[${i}].tintAlpha`);
    const lanternColor = assertNonEmptyString(
      r.lanternColor,
      `skins.courtSkins[${i}].lanternColor`,
    );
    const petalPrimary = assertNonEmptyString(
      r.petalPrimary,
      `skins.courtSkins[${i}].petalPrimary`,
    );
    const petalSecondary = assertNonEmptyString(
      r.petalSecondary,
      `skins.courtSkins[${i}].petalSecondary`,
    );

    return {
      id: idStr as CourtSkinId,
      name,
      rarity: rarityStr as SkinRarity,
      unlockCond,
      silkCost,
      desc,
      tintColor,
      tintAlpha: Math.min(0.6, tintAlpha),
      lanternColor,
      petalPrimary,
      petalSecondary,
    };
  });

  return { heroSkins, courtSkins };
}

const VALID_BOON_IDS: ReadonlySet<string> = new Set<BoonId>([
  'b_usury_vault',
  'b_wealth_blade',
  'b_orthodox_zenith',
  'b_unorthodox_pillage',
  'b_demonic_overdrive',
  'b_armor_crusher',
  'b_swift_formation',
  'b_hidden_acupoint',
  'b_elixir_jackpot',
  'b_heavenly_reinforce',
  'b_bounty_hunter',
  'b_trinity_harmony',
]);

const VALID_BOON_RARITIES: ReadonlySet<string> = new Set<BoonRarity>(['rare', 'epic', 'mythic']);
const VALID_BOON_ICONS: ReadonlySet<string> = new Set<BoonIconKind>([
  'vault',
  'wealth_sword',
  'orthodox',
  'pillage',
  'demonic',
  'shatter',
  'formation',
  'acupoint',
  'furnace',
  'reinforce',
  'bounty',
  'trinity',
]);

function validateBoons(rawList: unknown): BoonDef[] {
  if (!Array.isArray(rawList) || rawList.length < 3) {
    throw new Error('[DataValidation] boons.json must be a non-empty array of at least 3 boons');
  }
  const seen = new Set<string>();
  return rawList.map((raw, i) => {
    const r = assertRecord(raw, `boons[${i}]`);
    const idStr = assertNonEmptyString(r.id, `boons[${i}].id`);
    if (!VALID_BOON_IDS.has(idStr)) {
      throw new Error(`[DataValidation] boons[${i}].id invalid: ${idStr}`);
    }
    if (seen.has(idStr)) {
      throw new Error(`[DataValidation] duplicate boon id: ${idStr}`);
    }
    seen.add(idStr);
    const name = assertNonEmptyString(r.name, `boons[${i}].name`);
    const tag = assertNonEmptyString(r.tag, `boons[${i}].tag`);
    const rarityStr = assertNonEmptyString(r.rarity, `boons[${i}].rarity`);
    if (!VALID_BOON_RARITIES.has(rarityStr)) {
      throw new Error(`[DataValidation] boons[${i}].rarity invalid: ${rarityStr}`);
    }
    const maxStacks = Math.floor(assertPositiveNumber(r.maxStacks, `boons[${i}].maxStacks`));
    const iconStr = assertNonEmptyString(r.iconKind, `boons[${i}].iconKind`);
    if (!VALID_BOON_ICONS.has(iconStr)) {
      throw new Error(`[DataValidation] boons[${i}].iconKind invalid: ${iconStr}`);
    }
    const desc = assertNonEmptyString(r.desc, `boons[${i}].desc`);

    return {
      id: idStr as BoonId,
      name,
      tag,
      rarity: rarityStr as BoonRarity,
      maxStacks,
      iconKind: iconStr as BoonIconKind,
      desc,
    };
  });
}

let cachedBundle: GameDataBundle | null = null;

export function loadGameData(): GameDataBundle {
  if (cachedBundle) {
    return cachedBundle;
  }
  const grades = validateGrades(rawGrades);
  const gradesById = new Map(grades.map((g) => [g.id, g]));
  const units = validateUnits(rawUnits, gradesById);
  const unitsById = new Map(units.map((u) => [u.id, u]));
  const recipes = validateRecipesShape(rawRecipes);
  const board = validateBoard(rawBoard);
  const waves = validateWaves(rawWaves, gradesById);
  const wispPools = validateWispPools(rawWispPools, gradesById, unitsById);
  const gambleRates = validateGambleRates(rawGambleRates, gradesById);
  const upgrades = validateUpgrades(rawUpgrades);
  const upgradesByFaction = new Map<FactionId, UpgradeGroupDef>();
  for (const up of upgrades) {
    upgradesByFaction.set(up.faction, up);
  }
  const relics = validateRelics(rawRelics);
  const relicsById = new Map<RelicId, RelicDef>(relics.map((rel) => [rel.id, rel]));
  const missions = validateMissions(rawMissions, gradesById);
  const boons = validateBoons(rawBoons);
  const boonsById = new Map<BoonId, BoonDef>(boons.map((b) => [b.id, b]));
  const { heroSkins, courtSkins } = validateSkins(rawSkins, unitsById);
  const heroSkinsById = new Map<string, HeroSkinDef>(heroSkins.map((s) => [s.id, s]));
  const heroSkinsByUnit = new Map<string, HeroSkinDef[]>();
  for (const s of heroSkins) {
    const arr = heroSkinsByUnit.get(s.unitId) ?? [];
    arr.push(s);
    heroSkinsByUnit.set(s.unitId, arr);
  }
  const courtSkinsById = new Map<CourtSkinId, CourtSkinDef>(courtSkins.map((c) => [c.id, c]));
  const difficulties = validateDifficulties(rawDifficulties);
  const difficultiesById = new Map<DifficultyId, DifficultyConfig>(
    difficulties.map((d) => [d.id, d]),
  );
  const trials = validateTrials(rawTrials);
  const trialsById = new Map<TrialId, TrialConfig>(trials.map((t) => [t.id, t]));

  cachedBundle = {
    grades,
    gradesById,
    units,
    unitsById,
    recipes,
    board,
    waves,
    wispPools,
    gambleRates,
    upgrades,
    upgradesByFaction,
    relics,
    relicsById,
    missions,
    boons,
    boonsById,
    heroSkins,
    heroSkinsById,
    heroSkinsByUnit,
    courtSkins,
    courtSkinsById,
    difficulties,
    difficultiesById,
    trials,
    trialsById,
  };
  return cachedBundle;
}
