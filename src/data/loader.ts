import rawBoard from './board.json';
import rawGrades from './grades.json';
import rawRecipes from './recipes.json';
import rawUnits from './units.json';
import rawWaves from './waves.json';
import rawWispPools from './wisp_pools.json';
import { secToTicks, TICK_DT } from '../core/time';
import type {
  BoardConfig,
  EmblemKind,
  GameDataBundle,
  GradeDef,
  GridSpec,
  RawUnitDef,
  RawWaveDef,
  RecipeDef,
  UnitDef,
  WaveDef,
  WispPools,
} from './types';

const VALID_EMBLEMS: ReadonlySet<string> = new Set<EmblemKind>([
  'sword',
  'crosshair',
  'compass',
  'shield',
  'fist',
  'twinblade',
  'flame',
  'bow',
  'crest',
  'bolt',
  'sun',
  'crown',
  'star',
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
    if (typeof row.summonable !== 'boolean') {
      throw new Error(`[DataValidation] grades[${i}].summonable must be boolean`);
    }
    const summonWeight = assertNonNegativeNumber(row.summonWeight, `grades[${i}].summonWeight`);
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
      summonable: row.summonable,
      summonWeight,
      fx: typeof row.fx === 'string' ? row.fx : undefined,
    });
  }

  out.sort((a, b) => a.rank - b.rank);
  return out;
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
    const grade = assertNonEmptyString(row.grade, `units[${i}].grade`);
    if (!gradesById.has(grade)) {
      throw new Error(`[DataValidation] units[${i}] references unknown grade: ${grade}`);
    }
    if (typeof row.leaf !== 'boolean') {
      throw new Error(`[DataValidation] units[${i}].leaf must be boolean`);
    }
    const emblemStr = assertNonEmptyString(row.emblem, `units[${i}].emblem`);
    if (!VALID_EMBLEMS.has(emblemStr)) {
      throw new Error(`[DataValidation] units[${i}].emblem invalid: ${emblemStr}`);
    }
    const atk = assertPositiveNumber(row.atk, `units[${i}].atk`);
    const range = assertPositiveNumber(row.range, `units[${i}].range`);
    const attackIntervalSec = assertPositiveNumber(
      row.attackIntervalSec,
      `units[${i}].attackIntervalSec`,
    );
    const sellCoin = assertNonNegativeNumber(row.sellCoin, `units[${i}].sellCoin`);

    out.push({
      id,
      name,
      grade,
      leaf: row.leaf,
      emblem: emblemStr as EmblemKind,
      atk,
      range,
      attackIntervalTicks: Math.max(1, secToTicks(attackIntervalSec)),
      sellCoin,
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
    if (!Array.isArray(row.ingredients) || row.ingredients.length < 2) {
      throw new Error(
        `[DataValidation] recipes[${i}].ingredients must contain at least 2 heterogeneous entries`,
      );
    }

    const ingSeen = new Set<string>();
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
      return { unit, n };
    });

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

export function validateWaves(input: unknown): WaveDef[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('[DataValidation] waves.json must be a non-empty array');
  }
  return input.map((item, i) => {
    const row = assertRecord(item, `waves[${i}]`) as unknown as RawWaveDef;
    const wave = assertPositiveNumber(row.wave, `waves[${i}].wave`);
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

    return {
      wave,
      durationTicks: Math.max(1, secToTicks(durationSec)),
      spawnCount,
      spawnIntervalTicks: Math.max(1, secToTicks(spawnIntervalSec)),
      monsterHp,
      monsterSpeedPerTick: monsterSpeed * TICK_DT,
      monsterRadius,
      rewardCoin,
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
  const waves = validateWaves(rawWaves);
  const wispPools = validateWispPools(rawWispPools, gradesById, unitsById);

  cachedBundle = {
    grades,
    gradesById,
    units,
    unitsById,
    recipes,
    board,
    waves,
    wispPools,
  };
  return cachedBundle;
}
