export type GradeId = string;
export type UnitId = string;
export type RecipeId = string;
export type FactionId = 'orthodox' | 'unorthodox' | 'demonic';
export type UpgradeGroupId = FactionId;

export type VfxTrackKind =
  | 'plum_blossom'
  | 'emperor_thunder'
  | 'golden_palm'
  | 'poison_rain'
  | 'blood_slash'
  | 'demonic_flame'
  | 'heavenly_demon';

export type MonsterKind =
  | 'bandit_minion'
  | 'jiangshi'
  | 'blood_zealot'
  | 'white_tiger'
  | 'black_serpent'
  | 'blood_patriarch';

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
  readonly faction: FactionId;
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
  readonly faction: FactionId;
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
  readonly faction: FactionId;
  readonly desc: string;
  readonly currency: 'coin' | 'luck';
  readonly baseCost: number;
  readonly costStep: number;
  readonly atkBonusPctPerLv: number;
  readonly maxLevel: number;
}

export type WispPools = Readonly<Record<GradeId, readonly UnitId[]>>;

export type RelicId =
  | 'golden_vault'
  | 'million_sword_seal'
  | 'bandit_dagger'
  | 'immortal_furnace'
  | 'founding_jade_seal'
  | 'heavenly_scroll_chest';

export interface RelicDef {
  readonly id: RelicId;
  readonly name: string;
  readonly tag: string;
  readonly desc: string;
  readonly maxLevel: number;
  readonly baseUpgradeGold: number;
  readonly stepUpgradeGold: number;
}

export type DifficultyId = 'normal' | 'hard' | 'hell';

export type GameOverReason = 'overrun' | 'boss_timeout';

export type MissionConditionKind =
  | 'distinct_leaf_owned'
  | 'min_grade_owned'
  | 'any_formation_active'
  | 'high_formation_active'
  | 'bounties_slain'
  | 'gamble_wins'
  | 'held_coin'
  | 'total_upgrades';

export interface MissionDef {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly condition: MissionConditionKind;
  readonly target: number;
  readonly gradeRank?: number;
  readonly rewardCoin: number;
  readonly rewardLuck: number;
  readonly rewardWispGrade?: GradeId;
}

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
  readonly upgradesByFaction: ReadonlyMap<FactionId, UpgradeGroupDef>;
  readonly relics: readonly RelicDef[];
  readonly relicsById: ReadonlyMap<RelicId, RelicDef>;
  readonly missions: readonly MissionDef[];
}
