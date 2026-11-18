export type GradeId = string;
export type UnitId = string;
export type RecipeId = string;
export type UpgradeGroupId = 'common' | 'rare' | 'legendary' | 'mythic';

export type VfxTrackKind =
  | 'gatling'
  | 'red_hawk'
  | 'crescent_slash'
  | 'thunder_bolt'
  | 'room_strike'
  | 'conqueror_haki'
  | 'quake_shatter';

export type MonsterKind = 'marine_grunt' | 'pirate_raider' | 'sea_king' | 'pacifista';

export interface GradeDef {
  readonly id: GradeId;
  readonly name: string;
  readonly rank: number;
  readonly color: string;
  readonly summonable: boolean;
  readonly summonWeight: number;
  readonly fx?: string;
}

export interface RawUnitSkillDef {
  readonly name: string;
  readonly desc: string;
  readonly everyN: number;
  readonly atkRatio: number;
  readonly splashRadius: number;
  readonly stunSec: number;
  readonly slowPct: number;
  readonly slowSec: number;
  readonly vfxTrack: VfxTrackKind;
}

export interface UnitSkillDef {
  readonly name: string;
  readonly desc: string;
  readonly everyN: number;
  readonly atkRatio: number;
  readonly splashRadius: number;
  readonly stunTicks: number;
  readonly slowPct: number;
  readonly slowTicks: number;
  readonly vfxTrack: VfxTrackKind;
}

export interface RawUnitDef {
  readonly id: UnitId;
  readonly name: string;
  readonly title: string;
  readonly grade: GradeId;
  readonly leaf: boolean;
  readonly atk: number;
  readonly range: number;
  readonly attackIntervalSec: number;
  readonly critChance: number;
  readonly critMult: number;
  readonly sellCoin: number;
  readonly skill: RawUnitSkillDef;
}

export interface UnitDef {
  readonly id: UnitId;
  readonly name: string;
  readonly title: string;
  readonly grade: GradeId;
  readonly leaf: boolean;
  readonly atk: number;
  readonly range: number;
  readonly attackIntervalTicks: number;
  readonly critChance: number;
  readonly critMult: number;
  readonly sellCoin: number;
  readonly skill: UnitSkillDef;
}

export interface RecipeIngredient {
  readonly unit: UnitId;
  readonly n: number;
}

export interface RecipeDef {
  readonly id: RecipeId;
  readonly output: UnitId;
  readonly ingredients: readonly RecipeIngredient[];
  readonly priority: number;
}

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface GridSpec {
  readonly cols: number;
  readonly rows: number;
  readonly originX: number;
  readonly originY: number;
  readonly cellW: number;
  readonly cellH: number;
  readonly gapX: number;
  readonly gapY: number;
}

export interface BoardConfig {
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly arenaRect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly path: {
    readonly corridorWidth: number;
    readonly monsterCap: number;
    readonly waypoints: readonly Vec2[];
  };
  readonly field: GridSpec;
  readonly bench: GridSpec;
  readonly economy: {
    readonly initialCoin: number;
    readonly initialLuckStone: number;
    readonly baseSummonCost: number;
    readonly summonCostStep: number;
  };
}

export interface RawWaveDef {
  readonly wave: number;
  readonly durationSec: number;
  readonly spawnCount: number;
  readonly spawnIntervalSec: number;
  readonly monsterHp: number;
  readonly monsterSpeed: number;
  readonly monsterRadius: number;
  readonly rewardCoin: number;
  readonly monsterKind: MonsterKind;
  readonly isBoss: boolean;
  readonly bossName?: string;
}

export interface WaveDef {
  readonly wave: number;
  readonly durationTicks: number;
  readonly spawnCount: number;
  readonly spawnIntervalTicks: number;
  readonly monsterHp: number;
  readonly monsterSpeedPerTick: number;
  readonly monsterRadius: number;
  readonly rewardCoin: number;
  readonly monsterKind: MonsterKind;
  readonly isBoss: boolean;
  readonly bossName?: string;
}

export interface GambleRateDef {
  readonly tier: GradeId;
  readonly label: string;
  readonly costLuck: number;
  readonly chancePct: number;
  readonly desc: string;
}

export interface UpgradeGroupDef {
  readonly id: UpgradeGroupId;
  readonly name: string;
  readonly grades: readonly GradeId[];
  readonly currency: 'coin' | 'luck';
  readonly baseCost: number;
  readonly costStep: number;
  readonly atkBonusPctPerLv: number;
  readonly maxLevel: number;
}

export type WispPools = Readonly<Record<GradeId, readonly UnitId[]>>;

export interface GameDataBundle {
  readonly grades: readonly GradeDef[];
  readonly gradesById: ReadonlyMap<GradeId, GradeDef>;
  readonly units: readonly UnitDef[];
  readonly unitsById: ReadonlyMap<UnitId, UnitDef>;
  readonly recipes: readonly RecipeDef[];
  readonly board: BoardConfig;
  readonly waves: readonly WaveDef[];
  readonly wispPools: WispPools;
  readonly gambleRates: readonly GambleRateDef[];
  readonly upgrades: readonly UpgradeGroupDef[];
  readonly upgradesByGrade: ReadonlyMap<GradeId, UpgradeGroupDef>;
}
