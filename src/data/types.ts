export type GradeId = string;
export type UnitId = string;
export type RecipeId = string;

export interface GradeDef {
  readonly id: GradeId;
  readonly name: string;
  readonly rank: number;
  readonly color: string;
  readonly summonable: boolean;
  readonly summonWeight: number;
  readonly fx?: string;
}

export type EmblemKind =
  | 'sword'
  | 'crosshair'
  | 'compass'
  | 'shield'
  | 'fist'
  | 'twinblade'
  | 'flame'
  | 'bow'
  | 'crest'
  | 'bolt'
  | 'sun'
  | 'crown'
  | 'star';

export interface RawUnitDef {
  readonly id: UnitId;
  readonly name: string;
  readonly grade: GradeId;
  readonly leaf: boolean;
  readonly emblem: EmblemKind;
  readonly atk: number;
  readonly range: number;
  readonly attackIntervalSec: number;
  readonly sellCoin: number;
}

export interface UnitDef {
  readonly id: UnitId;
  readonly name: string;
  readonly grade: GradeId;
  readonly leaf: boolean;
  readonly emblem: EmblemKind;
  readonly atk: number;
  readonly range: number;
  readonly attackIntervalTicks: number;
  readonly sellCoin: number;
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
}
