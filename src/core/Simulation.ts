import {
  CommandQueue,
  type GameCommand,
  type SlotRef,
  type StampedCommand,
} from './CommandQueue';
import { EventBus } from './EventBus';
import {
  CLEAR_TARGET_WAVE,
  computeRelicSetBonuses,
  type EndgameMetaBonuses,
  getAbacusSummonDiscount,
  getArmorGauntletShred,
  getFurnaceChanceBonusPct,
  getFurnaceRefundPct,
  getJadeSealStartCoin,
  getLuckPouchSellCoinPct,
  getLuckPouchStartLuck,
  getRangeMirrorRangeBonus,
  getScrollChestGradeBonusCount,
  getTrainingManualCostDiscountPct,
  getTrainingManualWaveCoinPct,
  getTrigramMirrorAtkBps,
  getTrigramMirrorAuraPct,
  getUnitSellLuckRefund,
  getVaultInterestCap,
  getVaultInterestPct,
  getWealthBonusBps,
  RELIC_IDS_ORDERED,
  TRIAL_CONFIGS,
  ZERO_ENDGAME_META_BONUSES,
} from './relicFormulas';
import { Rng } from './Rng';
import type { Speed } from './time';
import { CraftIndex, type CraftView } from '../craft/CraftIndex';
import { CraftSystem } from '../craft/CraftSystem';
import { InventoryIndex } from '../craft/InventoryIndex';
import { RecipeGraph } from '../craft/RecipeGraph';
import { type WispHint, WispSystem } from '../craft/WispSystem';
import {
  COMBO_SKILLS,
  COMBO_SKILLS_BY_ID,
  type ComboSkillId,
} from '../data/comboSkills';
import {
  CONTRACT_DEFS,
  CONTRACT_OFFER_WAVES,
  CONTRACTS_BY_ID,
  type ContractId,
} from '../data/contracts';
import {
  BOSS_RUSH_TARGET_STAGE,
  type DailyChallengeSpec,
  ENDLESS_MILESTONES_BY_WAVE,
  getDailyChallengeSpec,
  resolveBossRushWaveDef,
  type RunModeId,
} from '../data/specialModes';
import type {
  ArenaRuleId,
  BenchPassiveDef,
  BoonId,
  DifficultyId,
  FactionId,
  GameDataBundle,
  GameOverReason,
  GradeDef,
  GradeId,
  MissionDef,
  MonsterKind,
  PassiveProcKind,
  PassiveTraitDef,
  RelicId,
  SupportAuraDef,
  TrialId,
  UnitId,
  UpgradeGroupId,
  Vec2,
  VfxTrackKind,
  WaveMutantKind,
} from '../data/types';
import {
  migrateRunSave,
  RUN_SAVE_SCHEMA_VERSION,
  type RunSaveData,
} from '../platform/SaveMigration';
import {
  type BenchPassiveSummary,
  type CombatSystemContext,
  computeBenchPassiveSummary,
  computeFieldSynergy,
  computeFieldTileBuffs,
  computeUnitEffectiveAtk,
  type FactionSynergySnapshot,
  getStarAtkBps,
  getUnitAwakenCost,
  MAX_UNIT_STAR_LEVEL,
  MIN_AWAKEN_GRADE_RANK,
  stepCombat,
  type TileAuraBuff,
} from '../skills/SkillSystem';
import { Board } from '../world/Board';
import { LoopPath } from '../world/Path';
import {
  type BossSkillKind,
  BOUNTY_COOLDOWN_TICKS,
  BOUNTY_DURATION_TICKS,
  computeMonsterArmor,
  ELITE_BOUNTY_COST,
  ELITE_BOUNTY_MIN_WAVE,
  getWaveMutantKind,
  HAZARD_SEAL_TICKS,
  HAZARD_WARNING_TICKS,
  resolveWaveDef,
  spawnBountyOutlaw,
  stepMonstersAndBosses,
  stepWaveAndSpawn,
  WAVE_MUTANT_META,
  type WaveMutantMeta,
  type WaveSystemContext,
} from '../world/WaveSystem';
import type { MonsterEntity, ProjectileEntity, TileHazard, UnitEntity } from '../world/entities';

export {
  BOUNTY_COOLDOWN_TICKS,
  BOUNTY_DURATION_TICKS,
  ELITE_BOUNTY_COST,
  ELITE_BOUNTY_MIN_WAVE,
  getUnitAwakenCost,
  getWaveMutantKind,
  HAZARD_SEAL_TICKS,
  HAZARD_WARNING_TICKS,
  MAX_UNIT_STAR_LEVEL,
  MIN_AWAKEN_GRADE_RANK,
  RUN_SAVE_SCHEMA_VERSION,
  WAVE_MUTANT_META,
};
export type {
  BenchPassiveSummary,
  BossSkillKind,
  ContractId,
  FactionSynergySnapshot,
  RunSaveData,
  TileAuraBuff,
  WaveMutantMeta,
};

export function getBoonRerollCost(rerollsUsed: number): number {
  return 150 * (Math.max(0, Math.floor(rerollsUsed)) + 1);
}

export const BOON_IDS_ORDERED: readonly BoonId[] = [
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
  'b_reaper_seal',
  'b_chain_thunder',
  'b_frost_shatter',
  'b_piercing_echo',
  'b_relic_resonance',
  'b_bench_support',
];

export interface SimEventMap {
  'unit:added': {
    readonly uid: number;
    readonly unitId: UnitId;
    readonly grade: GradeId;
    readonly slot: SlotRef;
    readonly source: 'summon' | 'craft' | 'wisp' | 'gamble';
    readonly pos: Vec2;
    readonly tick: number;
  };
  'unit:removed': {
    readonly uid: number;
    readonly unitId: UnitId;
    readonly slot: SlotRef;
    readonly tick: number;
  };
  'unit:sold': {
    readonly uid: number;
    readonly unitId: UnitId;
    readonly grade: GradeId;
    readonly slot: SlotRef;
    readonly pos: Vec2;
    readonly coinEarned: number;
    readonly luckEarned: number;
    readonly tick: number;
  };
  'units:bulk_sold': {
    readonly count: number;
    readonly coinEarned: number;
    readonly tick: number;
  };
  'unit:moved': {
    readonly uid: number;
    readonly from: SlotRef;
    readonly to: SlotRef;
    readonly swappedUid: number | null;
    readonly tick: number;
  };
  'board:arranged': {
    readonly deployedCount: number;
    readonly sortedBenchCount: number;
    readonly tick: number;
  };
  'monster:hit': {
    readonly entityId: number;
    readonly unitId: UnitId;
    readonly fromX: number;
    readonly fromY: number;
    readonly x: number;
    readonly y: number;
    readonly damage: number;
    readonly color: string;
    readonly slain: boolean;
    readonly isCrit: boolean;
    readonly isSkill: boolean;
    readonly armorBroken: boolean;
    readonly justShattered: boolean;
    readonly passiveProc?: PassiveProcKind;
    readonly tick: number;
  };
  'skill:impact': {
    readonly unitId: UnitId;
    readonly skillName: string;
    readonly vfxTrack: VfxTrackKind;
    readonly fromX: number;
    readonly fromY: number;
    readonly x: number;
    readonly y: number;
    readonly radius: number;
    readonly color: string;
    readonly gradeRank: number;
    readonly tick: number;
  };
  'craft:done': {
    readonly outputUid: number;
    readonly outputUnitId: UnitId;
    readonly grade: GradeId;
    readonly inheritedStarLevel?: number;
    readonly pos: Vec2;
    readonly tick: number;
  };
  'craft:batch': {
    readonly count: number;
    readonly topUnitId: UnitId;
    readonly topGrade: GradeId;
    readonly tick: number;
  };
  'gamble:result': {
    readonly seq: number;
    readonly tier: GradeId;
    readonly success: boolean;
    readonly unitId: UnitId | null;
    readonly pos: Vec2 | null;
    readonly refundedLuck: boolean;
    readonly tick: number;
  };
  'upgrade:done': {
    readonly group: UpgradeGroupId;
    readonly level: number;
    readonly tick: number;
  };
  'wave:interest': {
    readonly completedWave: number;
    readonly interestCoin: number;
    readonly pct: number;
    readonly totalCoin: number;
    readonly tick: number;
  };
  'wave:mutant': {
    readonly wave: number;
    readonly mutant: WaveMutantKind;
    readonly name: string;
    readonly desc: string;
    readonly tick: number;
  };
  'wave:boss': {
    readonly wave: number;
    readonly bossName: string;
    readonly monsterKind: MonsterKind;
    readonly tick: number;
  };
  'boss:skill': {
    readonly entityId: number;
    readonly bossKind: MonsterKind;
    readonly skillKind: BossSkillKind;
    readonly skillName: string;
    readonly x: number;
    readonly y: number;
    readonly tileIndices?: readonly number[];
    readonly tick: number;
  };
  'boss:slain': {
    readonly wave: number;
    readonly bossName: string;
    readonly rewardWispGrade: GradeId;
    readonly rewardLuck: number;
    readonly tick: number;
  };
  'boss:retry': {
    readonly wave: number;
    readonly bossName: string;
    readonly bonusSec: number;
    readonly remainingHp: number;
    readonly maxHp: number;
    readonly tick: number;
  };
  'boss:timeout': {
    readonly wave: number;
    readonly bossName: string;
    readonly tick: number;
  };
  'boon:offered': {
    readonly seq: number;
    readonly wave: number;
    readonly options: readonly BoonId[];
    readonly tick: number;
  };
  'boon:picked': {
    readonly boonId: BoonId;
    readonly name: string;
    readonly stacks: number;
    readonly tick: number;
  };
  'boon:rerolled': {
    readonly seq: number;
    readonly wave: number;
    readonly cost: number;
    readonly options: readonly BoonId[];
    readonly tick: number;
  };
  'unit:awakened': {
    readonly uid: number;
    readonly unitId: UnitId;
    readonly starLevel: number;
    readonly cost: number;
    readonly autoLocked: boolean;
    readonly pos: Vec2;
    readonly tick: number;
  };
  'contract:offered': {
    readonly seq: number;
    readonly wave: number;
    readonly options: readonly ContractId[];
    readonly tick: number;
  };
  'contract:reminder': {
    readonly seq: number;
    readonly wave: number;
    readonly offerWave: number;
    readonly options: readonly ContractId[];
    readonly tick: number;
  };
  'contract:picked': {
    readonly contractId: ContractId;
    readonly name: string;
    readonly deadlineWave: number;
    readonly depositCoin: number;
    readonly tick: number;
  };
  'contract:completed': {
    readonly contractId: ContractId;
    readonly name: string;
    readonly rewardCoin: number;
    readonly refundedDeposit: number;
    readonly rewardLuck: number;
    readonly rewardWispGrade?: GradeId;
    readonly rewardWispCount?: number;
    readonly rewardUpgradeAll?: number;
    readonly tick: number;
  };
  'contract:failed': {
    readonly contractId: ContractId;
    readonly name: string;
    readonly lostDeposit: number;
    readonly tick: number;
  };
  'bounty:called': {
    readonly bossName: string;
    readonly rewardCoin: number;
    readonly rewardLuck: number;
    readonly isElite?: boolean;
    readonly tick: number;
  };
  'bounty:slain': {
    readonly bossName: string;
    readonly rewardCoin: number;
    readonly rewardLuck: number;
    readonly rewardWispGrade?: GradeId;
    readonly isElite?: boolean;
    readonly tick: number;
  };
  'bounty:escaped': {
    readonly bossName: string;
    readonly stolenCoin: number;
    readonly tick: number;
  };
  'mission:completed': {
    readonly missionId: string;
    readonly name: string;
    readonly rewardCoin: number;
    readonly rewardLuck: number;
    readonly rewardWispGrade?: GradeId;
    readonly tick: number;
  };
  'run:victory': {
    readonly wave: number;
    readonly difficulty: DifficultyId;
    readonly trialId: TrialId | null;
    readonly tick: number;
  };
  'endless:milestone': {
    readonly wave: number;
    readonly label: string;
    readonly inRunCoin: number;
    readonly inRunLuck: number;
    readonly tick: number;
  };
  'combo:triggered': {
    readonly comboId: ComboSkillId;
    readonly name: string;
    readonly unitIds: readonly [UnitId, UnitId];
    readonly fromX: number;
    readonly fromY: number;
    readonly x: number;
    readonly y: number;
    readonly radius: number;
    readonly color: string;
    readonly totalDamage: number;
    readonly hitCount: number;
    readonly tick: number;
  };
  'command:rejected': {
    readonly cmd: GameCommand['type'];
    readonly reason: string;
    readonly tick: number;
  };
}

export interface SlotView {
  readonly uid: number;
  readonly unitId: UnitId;
  readonly name: string;
  readonly faction: FactionId;
  readonly grade: GradeId;
  readonly locked: boolean;
  readonly starLevel: number;
  readonly awakenCost: number | null;
  readonly sellCoin: number;
  readonly sellLuck: number;
  readonly sellLuckChancePct: number;
  readonly baseAtk: number;
  readonly bonusAtk: number;
  readonly range: number;
  readonly skillName: string;
  readonly armorShred: number;
  readonly supportAura?: SupportAuraDef;
  readonly passiveTrait?: PassiveTraitDef;
  readonly benchPassive?: BenchPassiveDef;
  readonly tileBuffAtkPct: number;
  readonly tileBuffSpeedPct: number;
  readonly sealed: boolean;
  readonly hazardWarning: boolean;
}

export interface RejectNotice {
  readonly cmd: GameCommand['type'];
  readonly reason: string;
  readonly tick: number;
}

export interface GambleResultSnapshot {
  readonly seq: number;
  readonly tier: GradeId;
  readonly success: boolean;
  readonly unitId: UnitId | null;
  readonly refundedLuck: boolean;
}

export interface RelicBonusSnapshot {
  readonly interestPct: number;
  readonly interestCap: number;
  readonly wealthAtkBps: number;
  readonly gambleBonusPct: number;
  readonly gambleRefundPct: number;
  readonly lastWaveInterest: number;
  readonly pilferedCoinTotal: number;
}

export interface BountySnapshot {
  readonly canCall: boolean;
  readonly canCallElite: boolean;
  readonly eliteUnlocked: boolean;
  readonly eliteCost: number;
  readonly unlocked: boolean;
  readonly active: boolean;
  readonly activeTicksLeft: number;
  readonly cooldownTicksLeft: number;
  readonly bountiesSlain: number;
}

export interface MissionItemSnapshot {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly progress: number;
  readonly target: number;
  readonly completed: boolean;
  readonly rewardCoin: number;
  readonly rewardLuck: number;
  readonly rewardWispGrade?: GradeId;
}

export interface DamageEntrySnapshot {
  readonly unitId: UnitId;
  readonly name: string;
  readonly faction: FactionId;
  readonly grade: GradeId;
  readonly damage: number;
  readonly sharePct: number;
}

export interface BoonOfferSnapshot {
  readonly seq: number;
  readonly wave: number;
  readonly options: readonly BoonId[];
  readonly rerollsUsed?: number;
}

export interface ContractOfferSnapshot {
  readonly seq: number;
  readonly wave: number;
  readonly options: readonly ContractId[];
}

export interface ActiveContractState {
  readonly contractId: ContractId;
  readonly acceptedWave: number;
  readonly deadlineWave: number;
  progress: number;
  readonly baseline: number;
  readonly depositCoin?: number;
  status: 'active' | 'completed' | 'failed';
}

export interface ContractItemSnapshot {
  readonly contractId: ContractId;
  readonly name: string;
  readonly tag: string;
  readonly desc: string;
  readonly acceptedWave: number;
  readonly deadlineWave: number;
  readonly progress: number;
  readonly target: number;
  readonly depositCoin: number;
  readonly status: 'active' | 'completed' | 'failed';
  readonly rewardCoin: number;
  readonly rewardLuck: number;
  readonly rewardWispGrade?: GradeId;
  readonly rewardWispCount?: number;
  readonly rewardUpgradeAll?: number;
}

export interface ActiveComboView {
  readonly id: ComboSkillId;
  readonly name: string;
  readonly desc: string;
  readonly unitIds: readonly [UnitId, UnitId];
  readonly color: string;
  readonly tierLabel: string;
  readonly cooldownLeftTicks: number;
  readonly cooldownTotalTicks: number;
  readonly triggerCount: number;
}

export interface SimulationModeOptions {
  readonly runMode?: RunModeId;
  readonly dailyDateKey?: string;
  readonly codexAtkBonusPct?: number;
  readonly endgameBonuses?: EndgameMetaBonuses;
  readonly arenaRule?: ArenaRuleId | null;
}

export interface UISnapshot {
  readonly tick: number;
  readonly speed: Speed;
  readonly paused: boolean;
  readonly difficulty: DifficultyId;
  readonly trialId: TrialId | null;
  readonly runMode: RunModeId;
  readonly dailyChallenge: DailyChallengeSpec | null;
  readonly endlessMilestonesReached: readonly number[];
  readonly activeCombos: readonly ActiveComboView[];
  readonly codexAtkBonusPct: number;
  readonly arenaRule: ArenaRuleId | null;
  readonly clearTargetWave: number;
  readonly gameOver: boolean;
  readonly gameOverReason: GameOverReason;
  readonly bossRetryUsed: boolean;
  readonly victoryAchieved: boolean;
  readonly victoryHold: boolean;
  readonly endlessMode: boolean;
  readonly wave: number;
  readonly waveTicksLeft: number;
  readonly isBossWave: boolean;
  readonly waveMutant: WaveMutantMeta | null;
  readonly boss?: {
    readonly kind: MonsterKind;
    readonly name: string;
    readonly hp: number;
    readonly maxHp: number;
    readonly armor: number;
    readonly armorShred: number;
    readonly shieldHp: number;
    readonly shieldMaxHp: number;
    readonly hasted: boolean;
    readonly patternHint: string;
    readonly isBounty: boolean;
    readonly ticksLeft: number;
  };
  readonly bounty: BountySnapshot;
  readonly pendingBoonOffer: BoonOfferSnapshot | null;
  readonly activeBoons: Readonly<Record<BoonId, number>>;
  readonly totalBoonStacks: number;
  readonly pendingContractOffer: ContractOfferSnapshot | null;
  readonly queuedContractCount: number;
  readonly contracts: readonly ContractItemSnapshot[];
  readonly benchPassives: BenchPassiveSummary;
  readonly preserveBenchPassives: boolean;
  readonly missions: readonly MissionItemSnapshot[];
  readonly missionsCompletedCount: number;
  readonly damageMeter: {
    readonly totalDamage: number;
    readonly entries: readonly DamageEntrySnapshot[];
    readonly byFaction: Readonly<Record<FactionId, number>>;
  };
  readonly economyStats: {
    readonly totalInterestEarned: number;
    readonly pilferedCoinTotal: number;
    readonly killCoinTotal: number;
    readonly sellCoinTotal: number;
  };
  readonly activeRelicSetCount: number;
  readonly usedHighFormation: boolean;
  readonly craftedImmortal: boolean;
  readonly monsterCount: number;
  readonly monsterCap: number;
  readonly monstersSlain: number;
  readonly bossesSlain: number;
  readonly coin: number;
  readonly luckStone: number;
  readonly summonCost: number;
  readonly wisps: Readonly<Record<GradeId, number>>;
  readonly upgradeLv: Readonly<Record<UpgradeGroupId, number>>;
  readonly upgradeCosts: Readonly<Record<UpgradeGroupId, number>>;
  readonly relics: Readonly<Record<RelicId, number>>;
  readonly relicBonus: RelicBonusSnapshot;
  readonly synergy: FactionSynergySnapshot;
  readonly lastGambleResult: GambleResultSnapshot | null;
  readonly field: readonly (SlotView | null)[];
  readonly bench: readonly (SlotView | null)[];
  readonly fieldOccupied: number;
  readonly benchOccupied: number;
  readonly benchSurplusCommonCount: number;
  readonly craft: CraftView;
  readonly wispHints: Partial<Record<GradeId, readonly WispHint[]>>;
  readonly rejects: readonly RejectNotice[];
}

const UPGRADE_ORDER: readonly UpgradeGroupId[] = ['orthodox', 'unorthodox', 'demonic'];

export class Simulation {
  public readonly data: GameDataBundle;
  public readonly difficulty: DifficultyId;
  public readonly trialId: TrialId | null;
  public readonly runMode: RunModeId;
  public readonly dailyChallengeSpec: DailyChallengeSpec | null;
  public readonly rookieMode: boolean;
  public readonly events = new EventBus<SimEventMap>();
  public readonly commands = new CommandQueue();
  public readonly board: Board;
  public readonly path: LoopPath;
  public readonly recipeGraph: RecipeGraph;
  public readonly inventoryIndex = new InventoryIndex();
  public readonly craftIndex: CraftIndex;
  public readonly craftSystem: CraftSystem;
  public readonly wispSystem: WispSystem;
  private readonly endlessMilestonesReached = new Set<number>();
  private readonly comboCooldowns = new Map<ComboSkillId, number>();
  private readonly comboTriggerCounts = new Map<ComboSkillId, number>();
  private codexAtkBonusPct = 0;
  private endgameBonuses: EndgameMetaBonuses = ZERO_ENDGAME_META_BONUSES;
  private arenaRule: ArenaRuleId | null = null;

  private readonly rng: Rng;
  private readonly summonableGrades: readonly GradeDef[];
  private readonly unitsByGrade: ReadonlyMap<GradeId, readonly UnitId[]>;
  private readonly scheduledReplay = new Map<number, GameCommand[]>();

  private currentTick = 0;
  private nextUid = 1;
  private nextMonsterId = 1;
  private nextProjectileId = 1;
  private gambleSeq = 0;
  private gambleWins = 0;
  private awakenCount = 0;

  private readonly units: UnitEntity[] = [];
  private readonly unitsByUid = new Map<number, UnitEntity>();
  private readonly monsters: MonsterEntity[] = [];
  private readonly projectiles: ProjectileEntity[] = [];
  private readonly tileHazards: TileHazard[] = [];

  private coin: number;
  private luckStone: number;
  private summonCount = 0;
  private readonly wisps: Record<GradeId, number> = {};
  private readonly upgradeLv: Record<UpgradeGroupId, number> = {
    orthodox: 0,
    unorthodox: 0,
    demonic: 0,
  };
  private readonly relicLv: Record<RelicId, number> = {
    golden_vault: 0,
    million_sword_seal: 0,
    bandit_dagger: 0,
    immortal_furnace: 0,
    founding_jade_seal: 0,
    heavenly_scroll_chest: 0,
    wind_swift_boots: 0,
    crimson_crit_blade: 0,
    armor_break_gauntlet: 0,
    celestial_skill_jade: 0,
    demon_slayer_banner: 0,
    merchant_abacus: 0,
    jade_training_manual: 0,
    phoenix_luck_pouch: 0,
    dragon_range_mirror: 0,
    eight_trigram_mirror: 0,
  };
  private readonly activeBoons: Record<BoonId, number> = {
    b_usury_vault: 0,
    b_wealth_blade: 0,
    b_orthodox_zenith: 0,
    b_unorthodox_pillage: 0,
    b_demonic_overdrive: 0,
    b_armor_crusher: 0,
    b_swift_formation: 0,
    b_hidden_acupoint: 0,
    b_elixir_jackpot: 0,
    b_heavenly_reinforce: 0,
    b_bounty_hunter: 0,
    b_trinity_harmony: 0,
    b_reaper_seal: 0,
    b_chain_thunder: 0,
    b_frost_shatter: 0,
    b_piercing_echo: 0,
    b_relic_resonance: 0,
    b_bench_support: 0,
  };
  private boonOfferSeq = 0;
  private readonly pendingBoonOffers: BoonOfferSnapshot[] = [];
  private contractOfferSeq = 0;
  private pendingContractOffer: ContractOfferSnapshot | null = null;
  private readonly queuedContractOfferWaves: number[] = [];
  private readonly activeContracts: ActiveContractState[] = [];
  private preserveBenchPassives = true;
  private appliedStartCoinBonus = 0;
  private appliedStartLuckBonus = 0;
  private readonly appliedStartWisps: Record<GradeId, number> = {};
  private lastWaveInterest = 0;
  private totalInterestEarned = 0;
  private pilferedCoinTotal = 0;
  private killCoinTotal = 0;
  private sellCoinTotal = 0;
  private usedHighFormation = false;
  private craftedImmortal = false;
  private monstersSlain = 0;
  private bossesSlain = 0;
  private bountiesCalled = 0;
  private bountiesSlain = 0;
  private bountyReadyTick = 0;
  private readonly completedMissions = new Set<string>();
  private readonly damageByUnit = new Map<UnitId, number>();
  private totalDamageDealt = 0;
  private lastGambleResult: GambleResultSnapshot | null = null;

  private waveNumber = 1;
  private waveTicksLeft: number;
  private spawnedInWave = 0;
  private nextSpawnTick = 15;
  private gameOver = false;
  private gameOverReason: GameOverReason = 'overrun';
  private bossRetryUsed = false;
  private victoryAchieved = false;
  private victoryHold = false;
  private endlessMode = false;

  private readonly pendingRejects: RejectNotice[] = [];
  private priorityDirty = true;

  public constructor(
    data: GameDataBundle,
    seed = 0x20261118,
    initialRelics?: Readonly<Partial<Record<RelicId, number>>>,
    difficulty: DifficultyId = 'normal',
    trialId: TrialId | null = null,
    rookieMode = false,
    options?: SimulationModeOptions,
  ) {
    this.data = data;
    this.runMode = options?.runMode ?? 'standard';
    this.codexAtkBonusPct = Math.max(0, Math.min(50, Math.round(options?.codexAtkBonusPct ?? 0)));
    this.endgameBonuses = options?.endgameBonuses
      ? { ...options.endgameBonuses }
      : ZERO_ENDGAME_META_BONUSES;
    this.arenaRule = options?.arenaRule ?? null;
    if (this.runMode === 'daily_challenge') {
      const spec = getDailyChallengeSpec(options?.dailyDateKey ?? '2026-11-19');
      this.dailyChallengeSpec = spec;
      this.difficulty = 'hard';
      this.trialId = null;
      this.rookieMode = false;
      this.rng = new Rng(spec.seed);
    } else if (this.runMode === 'boss_rush') {
      this.dailyChallengeSpec = null;
      this.difficulty = 'hard';
      this.trialId = null;
      this.rookieMode = false;
      this.rng = new Rng(seed);
    } else {
      this.dailyChallengeSpec = null;
      this.difficulty = difficulty;
      this.trialId = trialId;
      this.rookieMode = rookieMode && difficulty === 'normal' && trialId === null;
      this.rng = new Rng(seed);
    }

    this.board = new Board(data.board);
    this.path = new LoopPath(data.board.path.waypoints);
    this.recipeGraph = new RecipeGraph(data.units, data.gradesById, data.recipes);
    this.craftIndex = new CraftIndex(this.recipeGraph, data.unitsById);
    this.craftSystem = new CraftSystem(this.recipeGraph);
    this.wispSystem = new WispSystem(data.wispPools, this.recipeGraph);

    const dailyMod = this.dailyChallengeSpec?.rule.modifiers;
    this.coin =
      (this.runMode === 'boss_rush' ? 420 : data.board.economy.initialCoin) +
      (dailyMod?.startCoinBonus ?? 0) +
      this.endgameBonuses.startCoin;
    this.luckStone =
      (this.runMode === 'boss_rush' ? 6 : data.board.economy.initialLuckStone) +
      (dailyMod?.startLuckBonus ?? 0);
    this.waveTicksLeft =
      this.runMode === 'boss_rush'
        ? resolveBossRushWaveDef(1).durationTicks
        : (data.waves[0]?.durationTicks ?? 840);
    if (this.runMode === 'boss_rush') {
      this.nextSpawnTick = 120; // 4s prep window before Boss 1 enters
    }

    for (const poolGradeId of Object.keys(data.wispPools)) {
      this.wisps[poolGradeId] = 0;
    }
    for (let i = 0; i < data.grades.length; i++) {
      const g = data.grades[i]!;
      if (g.starterWispCount > 0) {
        this.wisps[g.id] = g.starterWispCount;
      }
    }
    if (this.runMode === 'boss_rush') {
      this.wisps.common = (this.wisps.common ?? 0) + 2;
      this.wisps.uncommon = (this.wisps.uncommon ?? 0) + 2;
      this.wisps.rare = (this.wisps.rare ?? 0) + 1;
    }

    this.summonableGrades = data.grades.filter((g) => g.summonable && g.summonWeight > 0);
    const byGrade = new Map<GradeId, UnitId[]>();
    for (const u of data.units) {
      const list = byGrade.get(u.grade) ?? [];
      list.push(u.id);
      byGrade.set(u.grade, list);
    }
    this.unitsByGrade = byGrade;
    if (initialRelics) {
      this.syncRelicsInternal(initialRelics, false);
    }
    this.wispSystem.recomputeHintsIfOwned(this.wisps, this.inventoryIndex);
  }

  private syncRelicsInternal(
    incoming: Readonly<Partial<Record<RelicId, number>>>,
    recomputeHints = true,
  ): void {
    for (let i = 0; i < RELIC_IDS_ORDERED.length; i++) {
      const id = RELIC_IDS_ORDERED[i]!;
      const raw = incoming[id];
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        const maxLv = this.data.relicsById.get(id)?.maxLevel ?? 15;
        this.relicLv[id] = Math.max(0, Math.min(maxLv, Math.floor(raw)));
      }
    }

    const setBonus = computeRelicSetBonuses(this.relicLv);
    const targetCoinBonus = getJadeSealStartCoin(this.relicLv.founding_jade_seal);
    if (targetCoinBonus > this.appliedStartCoinBonus) {
      this.coin += targetCoinBonus - this.appliedStartCoinBonus;
      this.appliedStartCoinBonus = targetCoinBonus;
    }

    const targetLuckBonus =
      getLuckPouchStartLuck(this.relicLv.phoenix_luck_pouch) + setBonus.startLuck;
    if (targetLuckBonus > this.appliedStartLuckBonus) {
      this.luckStone += targetLuckBonus - this.appliedStartLuckBonus;
      this.appliedStartLuckBonus = targetLuckBonus;
    }

    let wispChanged = false;
    for (let i = 0; i < this.data.grades.length; i++) {
      const g = this.data.grades[i]!;
      const targetCnt = getScrollChestGradeBonusCount(this.relicLv.heavenly_scroll_chest, g);
      const prevApplied = this.appliedStartWisps[g.id] ?? 0;
      if (targetCnt > prevApplied) {
        this.wisps[g.id] = (this.wisps[g.id] ?? 0) + (targetCnt - prevApplied);
        this.appliedStartWisps[g.id] = targetCnt;
        wispChanged = true;
      }
    }
    if (wispChanged && recomputeHints) {
      this.wispSystem.recomputeHintsIfOwned(this.wisps, this.inventoryIndex);
    }
    this.priorityDirty = true;
  }

  public get clearTargetWave(): number {
    if (this.runMode === 'boss_rush') return BOSS_RUSH_TARGET_STAGE;
    if (this.dailyChallengeSpec) return this.dailyChallengeSpec.targetWave;
    return this.trialId ? TRIAL_CONFIGS[this.trialId].targetWave : CLEAR_TARGET_WAVE;
  }

  public get tickCount(): number {
    return this.currentTick;
  }

  public get isGameOver(): boolean {
    return this.gameOver;
  }

  public get isVictoryHold(): boolean {
    return this.victoryHold;
  }

  public getUnits(): readonly UnitEntity[] {
    return this.units;
  }

  public getUnitByUid(uid: number): UnitEntity | undefined {
    return this.unitsByUid.get(uid);
  }

  public getMonsters(): readonly MonsterEntity[] {
    return this.monsters;
  }

  public getProjectiles(): readonly ProjectileEntity[] {
    return this.projectiles;
  }

  public getTileHazards(): readonly TileHazard[] {
    return this.tileHazards;
  }

  public isFieldSlotSealed(fieldIndex: number): boolean {
    for (let i = 0; i < this.tileHazards.length; i++) {
      const h = this.tileHazards[i]!;
      if (
        h.fieldIndex === fieldIndex &&
        this.currentTick >= h.activateTick &&
        this.currentTick < h.expireTick
      ) {
        return true;
      }
    }
    return false;
  }

  public isFieldSlotWarning(fieldIndex: number): boolean {
    for (let i = 0; i < this.tileHazards.length; i++) {
      const h = this.tileHazards[i]!;
      if (h.fieldIndex === fieldIndex && this.currentTick < h.activateTick) {
        return true;
      }
    }
    return false;
  }

  public hasFieldHazard(fieldIndex: number): boolean {
    for (let i = 0; i < this.tileHazards.length; i++) {
      const h = this.tileHazards[i]!;
      if (h.fieldIndex === fieldIndex && this.currentTick < h.expireTick) {
        return true;
      }
    }
    return false;
  }

  public getBoonStacks(id: BoonId): number {
    return this.activeBoons[id] ?? 0;
  }

  public computeBenchPassives(): BenchPassiveSummary {
    return computeBenchPassiveSummary(
      this.units,
      this.data.unitsById,
      this.dailyChallengeSpec?.rule.modifiers.benchPassiveMult ?? 1,
    );
  }

  public getEffectiveInterestConfig(): { readonly pct: number; readonly cap: number } {
    if (this.trialId && TRIAL_CONFIGS[this.trialId].disableInterest) {
      return { pct: 0, cap: 0 };
    }
    const setBonus = computeRelicSetBonuses(this.relicLv);
    const benchBonus = this.computeBenchPassives();
    const usuryStacks = this.getBoonStacks('b_usury_vault');
    const dailyMod = this.dailyChallengeSpec?.rule.modifiers;
    const basePct = getVaultInterestPct(this.relicLv.golden_vault);
    const pct =
      basePct +
      usuryStacks * 3 +
      setBonus.interestPct +
      benchBonus.interestPct +
      (dailyMod?.interestPctBonus ?? 0);
    if (pct <= 0) {
      return { pct: 0, cap: 0 };
    }
    const baseCap =
      this.relicLv.golden_vault > 0 ? getVaultInterestCap(this.relicLv.golden_vault) : 120;
    return {
      pct,
      cap:
        baseCap +
        usuryStacks * 60 +
        setBonus.interestCap +
        benchBonus.interestCap +
        (dailyMod?.interestCapBonus ?? 0),
    };
  }

  public getEffectiveWealthBps(): number {
    const baseBps = getWealthBonusBps(this.relicLv.million_sword_seal, this.coin);
    const bladeStacks = this.getBoonStacks('b_wealth_blade');
    if (bladeStacks <= 0 || this.coin < 100) {
      return baseBps;
    }
    const boonBps = Math.min(20000, Math.floor(this.coin / 100) * 250 * bladeStacks);
    return baseBps + boonBps;
  }

  public getEffectiveGambleBonusPct(): number {
    const setBonus = computeRelicSetBonuses(this.relicLv);
    const benchBonus = this.computeBenchPassives();
    const trialBonus = this.trialId ? TRIAL_CONFIGS[this.trialId].gambleBonusPct : 0;
    const dailyBonus = this.dailyChallengeSpec?.rule.modifiers.gambleBonusPct ?? 0;
    return (
      getFurnaceChanceBonusPct(this.relicLv.immortal_furnace) +
      this.getBoonStacks('b_elixir_jackpot') * 12 +
      setBonus.gambleBonusPct +
      benchBonus.gambleBonusPct +
      trialBonus +
      dailyBonus
    );
  }

  public getSummonCost(): number {
    const econ = this.data.board.economy;
    const raw = econ.baseSummonCost + this.summonCount * econ.summonCostStep;
    const setBonus = computeRelicSetBonuses(this.relicLv);
    const discount = getAbacusSummonDiscount(this.relicLv.merchant_abacus ?? 0) + setBonus.summonDiscount;
    return Math.max(10, raw - discount);
  }

  public getUpgradeCost(groupId: UpgradeGroupId): number {
    const def = this.data.upgrades.find((u) => u.id === groupId);
    if (!def) return 999;
    const lv = this.upgradeLv[groupId] ?? 0;
    const raw = def.baseCost + lv * def.costStep;
    const setBonus = computeRelicSetBonuses(this.relicLv);
    const harmonyStacks = this.getBoonStacks('b_trinity_harmony');
    const manualDiscountPct = getTrainingManualCostDiscountPct(this.relicLv.jade_training_manual ?? 0);
    const totalDiscountPct = Math.min(
      65,
      harmonyStacks * 25 + manualDiscountPct + setBonus.upgradeDiscountPct,
    );
    if (totalDiscountPct <= 0) return raw;
    return Math.max(1, Math.round((raw * (100 - totalDiscountPct)) / 100));
  }

  public computeFieldSynergy(): FactionSynergySnapshot {
    return computeFieldSynergy(this.units, this.data.unitsById);
  }

  public getOrthogonalFieldNeighbors(fieldIndex: number): number[] {
    const cols = this.board.config.field.cols;
    const rows = this.board.config.field.rows;
    if (fieldIndex < 0 || fieldIndex >= cols * rows) return [];
    const col = fieldIndex % cols;
    const row = Math.floor(fieldIndex / cols);
    const out: number[] = [];
    if (col > 0) out.push(fieldIndex - 1);
    if (col < cols - 1) out.push(fieldIndex + 1);
    if (row > 0) out.push(fieldIndex - cols);
    if (row < rows - 1) out.push(fieldIndex + cols);
    return out;
  }

  public computeFieldTileBuffs(): readonly TileAuraBuff[] {
    const bloodflameHazards =
      this.arenaRule === 'bloodflame_forge' && this.tileHazards.length > 0
        ? new Set(this.tileHazards.map((h) => h.fieldIndex))
        : undefined;
    return computeFieldTileBuffs(
      this.board,
      this.unitsByUid,
      this.data.unitsById,
      this.getBoonStacks('b_swift_formation'),
      getTrigramMirrorAuraPct(this.relicLv.eight_trigram_mirror ?? 0),
      bloodflameHazards,
    );
  }

  public computeMonsterArmor(waveNum: number, isBoss: boolean, isBounty: boolean): number {
    return computeMonsterArmor(
      this.data,
      this.difficulty,
      this.trialId,
      waveNum,
      isBoss,
      isBounty,
    );
  }

  public getUnitEffectiveAtk(
    unitId: UnitId,
    precomputedSynergy?: FactionSynergySnapshot,
    tileBuffAtkPct = 0,
    starLevel = 0,
  ): { readonly baseAtk: number; readonly bonusAtk: number } {
    const setBonus = computeRelicSetBonuses(this.relicLv);
    let extraTraitPct = 0;
    if (this.getBoonStacks('b_relic_resonance') > 0) {
      let ownedRelics = 0;
      for (let i = 0; i < RELIC_IDS_ORDERED.length; i++) {
        if ((this.relicLv[RELIC_IDS_ORDERED[i]!] ?? 0) > 0) ownedRelics++;
      }
      extraTraitPct += ownedRelics * 3;
    }
    const benchBoonStacks = this.getBoonStacks('b_bench_support');
    if (benchBoonStacks > 0) {
      const benchCount = this.board.bench.countOccupied();
      extraTraitPct += Math.round(benchCount * (benchBoonStacks >= 2 ? 4.5 : 2.5));
    }
    if (this.codexAtkBonusPct > 0) {
      extraTraitPct += this.codexAtkBonusPct;
    }
    if (this.endgameBonuses.atkPct > 0) {
      extraTraitPct += this.endgameBonuses.atkPct;
    }
    if (this.arenaRule === 'bloodflame_forge') {
      extraTraitPct += 5;
    }

    const baseResult = computeUnitEffectiveAtk(
      this.data,
      unitId,
      this.upgradeLv,
      precomputedSynergy ?? this.computeFieldSynergy(),
      tileBuffAtkPct,
      this.getEffectiveWealthBps(),
      this.getBoonStacks('b_trinity_harmony'),
      this.getBoonStacks('b_demonic_overdrive'),
      this.trialId,
      getTrigramMirrorAtkBps(this.relicLv.eight_trigram_mirror ?? 0) +
        setBonus.atkBps +
        getStarAtkBps(starLevel),
      extraTraitPct,
    );
    const def = this.data.unitsById.get(unitId);
    const dailyFacMult = def
      ? this.dailyChallengeSpec?.rule.modifiers.factionAtkMult?.[def.faction]
      : undefined;
    if (dailyFacMult !== undefined && dailyFacMult !== 1) {
      const scaledTotal = Math.max(
        1,
        Math.round((baseResult.baseAtk + baseResult.bonusAtk) * dailyFacMult),
      );
      return {
        baseAtk: baseResult.baseAtk,
        bonusAtk: scaledTotal - baseResult.baseAtk,
      };
    }
    return baseResult;
  }

  public getUnitSellCoin(baseSellCoin: number): number {
    const setBonus = computeRelicSetBonuses(this.relicLv);
    const sellPct =
      getLuckPouchSellCoinPct(this.relicLv.phoenix_luck_pouch ?? 0) + setBonus.sellCoinPct;
    if (sellPct <= 0) return baseSellCoin;
    return Math.round((baseSellCoin * (100 + sellPct)) / 100);
  }

  public scheduleCommandsForReplay(log: readonly StampedCommand[]): void {
    for (const item of log) {
      const list = this.scheduledReplay.get(item.tick) ?? [];
      list.push(item.command);
      this.scheduledReplay.set(item.tick, list);
    }
  }

  public consumePriorityDirty(): boolean {
    const was = this.priorityDirty;
    this.priorityDirty = false;
    return was;
  }

  public tick(): void {
    // 0. Sync previous frame interpolation anchors
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i]!;
      u.prevX = u.currX;
      u.prevY = u.currY;
    }
    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i]!;
      m.prevDistance = m.currDistance;
      m.prevX = m.currX;
      m.prevY = m.currY;
    }
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i]!;
      p.prevX = p.currX;
      p.prevY = p.currY;
    }

    // 1. Drain commands stamped at currentTick
    const replayBatch = this.scheduledReplay.get(this.currentTick);
    if (replayBatch) {
      for (let i = 0; i < replayBatch.length; i++) {
        this.applyCommand(replayBatch[i]!);
      }
      this.scheduledReplay.delete(this.currentTick);
    }

    const liveBatch = this.commands.drainForTick(this.currentTick);
    for (let i = 0; i < liveBatch.length; i++) {
      this.applyCommand(liveBatch[i]!.command);
    }

    if (!this.gameOver && !this.victoryHold) {
      const waveCtx = this.createWaveSystemContext();

      // 2. Wave & Spawn progression
      stepWaveAndSpawn(waveCtx);

      // 3. Monster path movement & boss pattern execution
      if (!this.gameOver && !this.victoryHold) {
        stepMonstersAndBosses(waveCtx);
      }

      // 4. Field unit auto-combat & projectiles
      if (!this.gameOver && !this.victoryHold) {
        stepCombat(this.createCombatSystemContext());
      }
    }

    // 5. Delta craft & wisp indexing
    const deltaUnits = this.inventoryIndex.consumeDelta();
    if (deltaUnits.length > 0) {
      this.craftIndex.applyDelta(deltaUnits, this.inventoryIndex);
      this.wispSystem.recomputeHintsIfOwned(this.wisps, this.inventoryIndex);
      this.priorityDirty = true;
    }

    // 6. Deterministic in-run mission & contract evaluation (강호 의뢰 · 밀명 계약)
    if (!this.gameOver) {
      this.evaluateMissions();
      this.evaluateContracts();
    }

    this.currentTick++;
  }

  /** Executes queued player commands (e.g. during tutorial pause) without advancing waves or monsters. */
  public flushCommandsWhilePaused(): void {
    const liveBatch = this.commands.drainForTick(this.currentTick);
    if (liveBatch.length === 0) return;
    for (let i = 0; i < liveBatch.length; i++) {
      this.applyCommand(liveBatch[i]!.command);
    }
    const deltaUnits = this.inventoryIndex.consumeDelta();
    if (deltaUnits.length > 0) {
      this.craftIndex.applyDelta(deltaUnits, this.inventoryIndex);
      this.wispSystem.recomputeHintsIfOwned(this.wisps, this.inventoryIndex);
      this.priorityDirty = true;
    }
    if (!this.gameOver) {
      this.evaluateMissions();
      this.evaluateContracts();
    }
  }

  private createWaveSystemContext(): WaveSystemContext {
    return {
      data: this.data,
      difficulty: this.difficulty,
      trialId: this.trialId,
      runMode: this.runMode,
      dailyRule: this.dailyChallengeSpec?.rule ?? null,
      arenaRule: this.arenaRule,
      rookieMode: this.rookieMode,
      clearTargetWave: this.clearTargetWave,
      board: this.board,
      path: this.path,
      rng: this.rng,
      events: this.events,
      units: this.units,
      monsters: this.monsters,
      tileHazards: this.tileHazards,
      currentTick: this.currentTick,
      getWaveNumber: () => this.waveNumber,
      setWaveNumber: (v) => {
        this.waveNumber = v;
      },
      getWaveTicksLeft: () => this.waveTicksLeft,
      setWaveTicksLeft: (v) => {
        this.waveTicksLeft = v;
      },
      getSpawnedInWave: () => this.spawnedInWave,
      setSpawnedInWave: (v) => {
        this.spawnedInWave = v;
      },
      getNextSpawnTick: () => this.nextSpawnTick,
      setNextSpawnTick: (v) => {
        this.nextSpawnTick = v;
      },
      allocateMonsterId: () => this.nextMonsterId++,
      getCoin: () => this.coin,
      setCoin: (v) => {
        this.coin = v;
      },
      addLuckStone: (delta) => {
        this.luckStone += delta;
      },
      setLastWaveInterest: (v) => {
        this.lastWaveInterest = v;
        if (v > 0) {
          this.totalInterestEarned += v;
        }
      },
      getEffectiveInterestConfig: () => this.getEffectiveInterestConfig(),
      getWaveClearCoinBonusPct: () =>
        getTrainingManualWaveCoinPct(this.relicLv.jade_training_manual ?? 0),
      hasFieldHazard: (fieldIndex) => this.hasFieldHazard(fieldIndex),
      tryConsumeBossRetry: (waveNumber, boss) => {
        if (this.bossRetryUsed) return false;
        if (
          this.trialId !== null ||
          this.runMode !== 'standard' ||
          this.difficulty === 'hell' ||
          this.difficulty === 'abyss'
        ) {
          return false;
        }
        if (waveNumber >= this.clearTargetWave && this.difficulty !== 'normal') {
          return false;
        }
        this.bossRetryUsed = true;
        const bonusSec = 15;
        this.waveTicksLeft = bonusSec * 30;
        this.priorityDirty = true;
        this.events.emit('boss:retry', {
          wave: waveNumber,
          bossName: boss.bossName ?? '영물 보스',
          bonusSec,
          remainingHp: Math.max(1, Math.round(boss.hp)),
          maxHp: boss.maxHp,
          tick: this.currentTick,
        });
        return true;
      },
      markGameOver: (reason) => {
        this.gameOver = true;
        this.gameOverReason = reason;
        this.priorityDirty = true;
      },
      markPriorityDirty: () => {
        this.priorityDirty = true;
      },
      onWaveAdvanced: (completedWave, nextWaveNum) => {
        this.handleWaveAdvancedForContracts(completedWave, nextWaveNum);
      },
    };
  }

  private createCombatSystemContext(): CombatSystemContext {
    return {
      data: this.data,
      difficulty: this.difficulty,
      trialId: this.trialId,
      runMode: this.runMode,
      dailyRule: this.dailyChallengeSpec?.rule ?? null,
      arenaRule: this.arenaRule,
      endgameBonuses: this.endgameBonuses,
      clearTargetWave: this.clearTargetWave,
      board: this.board,
      rng: this.rng,
      events: this.events,
      units: this.units,
      unitsByUid: this.unitsByUid,
      monsters: this.monsters,
      projectiles: this.projectiles,
      tileHazards: this.tileHazards,
      relicLv: this.relicLv,
      comboCooldowns: this.comboCooldowns,
      comboTriggerCounts: this.comboTriggerCounts,
      currentTick: this.currentTick,
      waveNumber: this.waveNumber,
      endlessMode: this.endlessMode,
      victoryAchieved: this.victoryAchieved,
      getBoonStacks: (id) => this.getBoonStacks(id),
      isFieldSlotSealed: (fieldIndex) => this.isFieldSlotSealed(fieldIndex),
      getUnitEffectiveAtk: (unitId, synergy, tileBuffAtkPct, starLevel = 0) =>
        this.getUnitEffectiveAtk(unitId, synergy, tileBuffAtkPct, starLevel),
      allocateProjectileId: () => this.nextProjectileId++,
      recordDamage: (unitId, amount) => {
        this.damageByUnit.set(unitId, (this.damageByUnit.get(unitId) ?? 0) + amount);
        this.totalDamageDealt += amount;
      },
      addCoin: (delta, isPilfer = false) => {
        this.coin += delta;
        if (delta > 0) {
          if (isPilfer) {
            this.pilferedCoinTotal += delta;
            this.priorityDirty = true;
          } else {
            this.killCoinTotal += delta;
          }
        }
      },
      addLuckStone: (delta) => {
        this.luckStone += delta;
      },
      grantBossWisp: (gradeId) => {
        this.wisps[gradeId] = (this.wisps[gradeId] ?? 0) + 1;
        this.wispSystem.recomputeHintsIfOwned(this.wisps, this.inventoryIndex);
      },
      onMonsterSlain: (isWaveBoss, isBounty, spawnTick) => {
        this.monstersSlain++;
        if (isWaveBoss) {
          this.bossesSlain++;
          if (spawnTick !== undefined) {
            this.handleWaveBossSlainForContracts(Math.max(0, this.currentTick - spawnTick));
          }
        } else if (isBounty) {
          this.bountiesSlain++;
        }
      },
      triggerVictory: () => {
        this.victoryAchieved = true;
        this.victoryHold = true;
        this.events.emit('run:victory', {
          wave: this.waveNumber,
          difficulty: this.difficulty,
          trialId: this.trialId,
          tick: this.currentTick,
        });
      },
      offerBossBoons: (wave) => {
        this.offerBossBoons(wave);
      },
      markPriorityDirty: () => {
        this.priorityDirty = true;
      },
    };
  }

  private applyCommand(cmd: GameCommand): void {
    if (cmd.type === 'syncRelics') {
      this.syncRelicsInternal(cmd.relics, true);
      return;
    }

    if (cmd.type === 'syncMetaBonuses') {
      if (typeof cmd.codexAtkBonusPct === 'number' && Number.isFinite(cmd.codexAtkBonusPct)) {
        this.codexAtkBonusPct = Math.max(0, Math.min(50, Math.round(cmd.codexAtkBonusPct)));
        this.priorityDirty = true;
      }
      if (cmd.endgameBonuses) {
        const deltaStartCoin = Math.max(
          0,
          cmd.endgameBonuses.startCoin - this.endgameBonuses.startCoin,
        );
        if (deltaStartCoin > 0 && this.waveNumber <= 2) {
          this.coin += deltaStartCoin;
        }
        this.endgameBonuses = { ...cmd.endgameBonuses };
        this.priorityDirty = true;
      }
      if (cmd.arenaRule !== undefined) {
        this.arenaRule = cmd.arenaRule;
        this.priorityDirty = true;
      }
      return;
    }

    if (cmd.type === 'enterEndless') {
      if (!this.victoryHold) {
        return;
      }
      this.victoryHold = false;
      this.endlessMode = true;
      this.tileHazards.length = 0;
      this.waveTicksLeft = Math.min(this.waveTicksLeft, 30);
      this.offerBossBoons(this.clearTargetWave);
      this.priorityDirty = true;
      return;
    }

    if (this.gameOver) {
      this.reject(cmd.type, '이미 종료된 라운드입니다.');
      return;
    }

    switch (cmd.type) {
      case 'pickBoon': {
        const currentOffer = this.pendingBoonOffers[0];
        if (!currentOffer) {
          this.reject('pickBoon', '현재 선택 가능한 강호 기연이 없습니다.');
          return;
        }
        if (!currentOffer.options.includes(cmd.boonId)) {
          this.reject('pickBoon', '제시된 기연 목록에 없는 비급입니다.');
          return;
        }
        const boonDef = this.data.boonsById.get(cmd.boonId);
        if (!boonDef) {
          this.reject('pickBoon', '존재하지 않는 기연입니다.');
          return;
        }
        const nextStacks = Math.min(boonDef.maxStacks, (this.activeBoons[cmd.boonId] ?? 0) + 1);
        this.activeBoons[cmd.boonId] = nextStacks;
        this.pendingBoonOffers.shift();

        // Immediate one-shot resource grants on pickup (100% data-driven wisp grades)
        if (cmd.boonId === 'b_elixir_jackpot') {
          this.luckStone += 6;
        } else if (cmd.boonId === 'b_heavenly_reinforce') {
          const sortedPoolGrades = Object.keys(this.data.wispPools).sort(
            (a, b) =>
              (this.data.gradesById.get(b)?.rank ?? 0) - (this.data.gradesById.get(a)?.rank ?? 0),
          );
          for (let i = 0; i < Math.min(2, sortedPoolGrades.length); i++) {
            const gId = sortedPoolGrades[i]!;
            this.wisps[gId] = (this.wisps[gId] ?? 0) + 1;
          }
          this.coin += 120;
          this.wispSystem.recomputeHintsIfOwned(this.wisps, this.inventoryIndex);
        }

        this.priorityDirty = true;
        this.events.emit('boon:picked', {
          boonId: cmd.boonId,
          name: boonDef.name,
          stacks: nextStacks,
          tick: this.currentTick,
        });
        return;
      }

      case 'rerollBoon': {
        if (this.dailyChallengeSpec?.rule.modifiers.disableBoonReroll) {
          this.reject('rerollBoon', `오늘의 비무 규칙 [${this.dailyChallengeSpec.rule.name}]: 기연 다시 뽑기 금지!`);
          return;
        }
        const currentOffer = this.pendingBoonOffers[0];
        if (!currentOffer) {
          this.reject('rerollBoon', '현재 리롤할 강호 기연이 없습니다.');
          return;
        }
        const rerollsUsed = currentOffer.rerollsUsed ?? 0;
        const cost = getBoonRerollCost(rerollsUsed);
        if (this.coin < cost) {
          this.reject('rerollBoon', `은자가 부족합니다 (${cost} 필요)`);
          return;
        }
        const fresh = this.rollBoonOptions(currentOffer.wave, currentOffer.options);
        if (fresh.length === 0) {
          this.reject('rerollBoon', '더 이상 새로 뽑을 수 있는 기연 비급이 없습니다.');
          return;
        }
        this.coin -= cost;
        this.pendingBoonOffers[0] = {
          seq: currentOffer.seq,
          wave: currentOffer.wave,
          options: fresh,
          rerollsUsed: rerollsUsed + 1,
        };
        this.priorityDirty = true;
        this.events.emit('boon:rerolled', {
          seq: currentOffer.seq,
          wave: currentOffer.wave,
          cost,
          options: fresh,
          tick: this.currentTick,
        });
        return;
      }

      case 'pickContract': {
        const offer = this.pendingContractOffer;
        if (!offer) {
          this.reject('pickContract', '현재 수락 가능한 강호 밀명 계약이 없습니다.');
          return;
        }
        if (!offer.options.includes(cmd.contractId)) {
          this.reject('pickContract', '제시된 밀명 목록에 없는 계약입니다.');
          return;
        }
        const cDef = CONTRACTS_BY_ID.get(cmd.contractId);
        if (!cDef) {
          this.reject('pickContract', '존재하지 않는 밀명 계약입니다.');
          return;
        }
        if (this.coin < cDef.depositCoin) {
          this.reject(
            'pickContract',
            `밀명 보증금이 부족합니다 (${cDef.depositCoin} 은자 필요 — 성공 시 전액 환급)`,
          );
          return;
        }
        if (cDef.depositCoin > 0) {
          this.coin -= cDef.depositCoin;
        }
        const baseline =
          cDef.condition === 'bounty_kills_delta'
            ? this.bountiesSlain
            : cDef.condition === 'gamble_wins_delta'
              ? this.gambleWins
              : cDef.condition === 'awaken_count_delta'
                ? this.awakenCount
                : 0;
        const deadlineWave = this.waveNumber + cDef.durationWaves;
        this.activeContracts.push({
          contractId: cDef.id,
          acceptedWave: this.waveNumber,
          deadlineWave,
          progress: 0,
          baseline,
          depositCoin: cDef.depositCoin,
          status: 'active',
        });
        this.pendingContractOffer = null;
        this.priorityDirty = true;
        this.events.emit('contract:picked', {
          contractId: cDef.id,
          name: cDef.name,
          deadlineWave,
          depositCoin: cDef.depositCoin,
          tick: this.currentTick,
        });
        this.dequeueNextContractOffer();
        return;
      }

      case 'dismissContractOffer': {
        if (!this.pendingContractOffer) return;
        this.pendingContractOffer = null;
        this.priorityDirty = true;
        this.dequeueNextContractOffer();
        return;
      }

      case 'awaken': {
        const u = this.unitsByUid.get(cmd.uid);
        if (!u) {
          this.reject('awaken', '각성할 협객을 찾을 수 없습니다.');
          return;
        }
        const curStar = u.starLevel ?? 0;
        if (curStar >= MAX_UNIT_STAR_LEVEL) {
          this.reject('awaken', '이미 극성 각성(★★★)에 도달한 협객입니다.');
          return;
        }
        const gradeRank = this.data.gradesById.get(u.grade)?.rank ?? 1;
        if (gradeRank < MIN_AWAKEN_GRADE_RANK) {
          this.reject('awaken', '일류(3등급) 이상 협객만 성급 각성할 수 있습니다.');
          return;
        }
        const cost = getUnitAwakenCost(gradeRank, curStar);
        if (cost === null) {
          this.reject('awaken', '더 이상 각성할 수 없습니다.');
          return;
        }
        if (this.coin < cost) {
          this.reject('awaken', `은자가 부족합니다 (${cost} 필요)`);
          return;
        }
        this.coin -= cost;
        u.starLevel = curStar + 1;
        const autoLocked = !u.locked;
        if (autoLocked) {
          u.locked = true;
          this.inventoryIndex.setLocked(u.uid, true);
        }
        this.awakenCount++;
        this.priorityDirty = true;
        this.events.emit('unit:awakened', {
          uid: u.uid,
          unitId: u.unitId,
          starLevel: u.starLevel,
          cost,
          autoLocked,
          pos: { x: u.currX, y: u.currY },
          tick: this.currentTick,
        });
        return;
      }

      case 'summon': {
        const cost = this.getSummonCost();
        if (this.coin < cost) {
          this.reject('summon', `은자가 부족합니다 (${cost} 필요)`);
          return;
        }
        const slot = this.board.findPlacementSlot();
        if (!slot) {
          this.reject('summon', '비무대와 문파 대기석이 모두 가득 찼습니다.');
          return;
        }
        this.coin -= cost;
        this.summonCount++;
        const unitId = this.rollSummonUnit();
        this.createUnit(unitId, slot, 'summon');
        this.priorityDirty = true;
        return;
      }

      case 'gamble': {
        const rateDef = this.data.gambleRates.find((r) => r.tier === cmd.tier);
        if (!rateDef) {
          this.reject('gamble', '유효하지 않은 영약 단계입니다.');
          return;
        }
        if (this.luckStone < rateDef.costLuck) {
          this.reject('gamble', `영단이 부족합니다 (${rateDef.costLuck}개 필요)`);
          return;
        }
        const slot = this.board.findPlacementSlot();
        if (!slot) {
          this.reject('gamble', '배치할 빈 자리가 없습니다.');
          return;
        }
        const pool = this.unitsByGrade.get(rateDef.tier);
        if (!pool || pool.length === 0) {
          this.reject('gamble', '해당 경지의 협객 풀이 비어 있습니다.');
          return;
        }

        this.luckStone -= rateDef.costLuck;
        const chanceBonus = this.getEffectiveGambleBonusPct();
        const effectiveChance = Math.min(95, rateDef.chancePct + chanceBonus);
        const roll = this.rng.nextInt(100);
        const success = roll < effectiveChance;
        const seq = ++this.gambleSeq;

        if (success) {
          this.gambleWins++;
          const pickedUnitId = pool[this.rng.nextInt(pool.length)]!;
          const uid = this.createUnit(pickedUnitId, slot, 'gamble');
          const created = this.unitsByUid.get(uid);
          const pos = created ? { x: created.currX, y: created.currY } : null;
          this.lastGambleResult = {
            seq,
            tier: rateDef.tier,
            success: true,
            unitId: pickedUnitId,
            refundedLuck: false,
          };
          this.events.emit('gamble:result', {
            seq,
            tier: rateDef.tier,
            success: true,
            unitId: pickedUnitId,
            pos,
            refundedLuck: false,
            tick: this.currentTick,
          });
        } else {
          const refundPct = getFurnaceRefundPct(this.relicLv.immortal_furnace);
          let refundedLuck = false;
          if (refundPct > 0 && this.rng.nextInt(100) < refundPct) {
            this.luckStone += 1;
            refundedLuck = true;
          }
          this.lastGambleResult = {
            seq,
            tier: rateDef.tier,
            success: false,
            unitId: null,
            refundedLuck,
          };
          this.events.emit('gamble:result', {
            seq,
            tier: rateDef.tier,
            success: false,
            unitId: null,
            pos: null,
            refundedLuck,
            tick: this.currentTick,
          });
        }
        this.priorityDirty = true;
        return;
      }

      case 'upgrade': {
        const upDef = this.data.upgrades.find((u) => u.id === cmd.group);
        if (!upDef) {
          this.reject('upgrade', '존재하지 않는 내공 심법입니다.');
          return;
        }
        const reqCount = Math.max(1, Math.min(10, Math.floor(cmd.count ?? 1)));
        let applied = 0;
        let finalLv = this.upgradeLv[cmd.group] ?? 0;

        for (let step = 0; step < reqCount; step++) {
          const curLv = this.upgradeLv[cmd.group] ?? 0;
          if (curLv >= upDef.maxLevel) {
            if (applied === 0) {
              this.reject('upgrade', '이미 내공 극의(최대 단계)에 도달했습니다.');
              return;
            }
            break;
          }
          const cost = this.getUpgradeCost(cmd.group);
          if (upDef.currency === 'coin') {
            if (this.coin < cost) {
              if (applied === 0) {
                this.reject('upgrade', `은자가 부족합니다 (${cost} 필요)`);
                return;
              }
              break;
            }
            this.coin -= cost;
          } else {
            if (this.luckStone < cost) {
              if (applied === 0) {
                this.reject('upgrade', `영단이 부족합니다 (${cost}개 필요)`);
                return;
              }
              break;
            }
            this.luckStone -= cost;
          }
          finalLv = curLv + 1;
          this.upgradeLv[cmd.group] = finalLv;
          applied++;
        }

        if (applied > 0) {
          this.events.emit('upgrade:done', {
            group: cmd.group,
            level: finalLv,
            tick: this.currentTick,
          });
          this.priorityDirty = true;
        }
        return;
      }

      case 'callBounty': {
        if (this.victoryHold) {
          this.reject('callBounty', '먼저 천하통일 정산 선택을 완료해 주세요.');
          return;
        }
        const isElite = Boolean(cmd.elite);
        if (isElite) {
          if (this.waveNumber < ELITE_BOUNTY_MIN_WAVE) {
            this.reject(
              'callBounty',
              `정예 현상수배는 제 0${ELITE_BOUNTY_MIN_WAVE} 장부터 호출할 수 있습니다.`,
            );
            return;
          }
          if (this.coin < ELITE_BOUNTY_COST) {
            this.reject('callBounty', `정예 수배에 은자가 부족합니다 (${ELITE_BOUNTY_COST} 필요)`);
            return;
          }
        } else if (this.waveNumber < 2) {
          this.reject('callBounty', '현상수배는 제 02 장부터 호출할 수 있습니다.');
          return;
        }
        if (this.monsters.some((m) => m.isBounty)) {
          this.reject('callBounty', '이미 강호 현상수배범을 추격 중입니다!');
          return;
        }
        if (this.currentTick < this.bountyReadyTick) {
          const leftSec = Math.ceil((this.bountyReadyTick - this.currentTick) / 30);
          this.reject('callBounty', `수배령 재정비 중입니다 (${leftSec}초 남음)`);
          return;
        }
        if (this.monsters.length + 1 >= this.data.board.path.monsterCap) {
          this.reject('callBounty', '전장에 마물이 너무 많아 호출할 수 없습니다!');
          return;
        }

        if (isElite) {
          this.coin -= ELITE_BOUNTY_COST;
        }
        const hunterStacks = this.getBoonStacks('b_bounty_hunter');
        const { nextBountyReadyTick } = spawnBountyOutlaw(
          this.createWaveSystemContext(),
          this.bountiesCalled,
          hunterStacks,
          isElite,
        );
        this.bountiesCalled++;
        this.bountyReadyTick = nextBountyReadyTick;
        return;
      }

      case 'autoArrange': {
        this.executeAutoArrange(cmd.preserveBenchPassives ?? this.preserveBenchPassives);
        return;
      }

      case 'setPreserveBenchPassives': {
        this.preserveBenchPassives = Boolean(cmd.enabled);
        this.priorityDirty = true;
        return;
      }

      case 'move': {
        if (!this.board.isValidSlot(cmd.from) || !this.board.isValidSlot(cmd.to)) {
          this.reject('move', '유효하지 않은 슬롯 좌표입니다.');
          return;
        }
        if (cmd.from.area === cmd.to.area && cmd.from.index === cmd.to.index) {
          return;
        }
        const fromUid = this.board.getUid(cmd.from);
        if (fromUid === null) {
          this.reject('move', '이동할 협객이 해당 자리에 없습니다.');
          return;
        }
        const fromUnit = this.unitsByUid.get(fromUid);
        if (!fromUnit) {
          this.reject('move', '협객 상태를 찾을 수 없습니다.');
          return;
        }

        const toUid = this.board.getUid(cmd.to);
        const toCenter = this.board.getSlotCenter(cmd.to);
        const fromCenter = this.board.getSlotCenter(cmd.from);

        if (toUid === null) {
          this.board.setUid(cmd.from, null);
          this.board.setUid(cmd.to, fromUid);
          fromUnit.slot = cmd.to;
          fromUnit.moveFromX = fromUnit.currX;
          fromUnit.moveFromY = fromUnit.currY;
          fromUnit.moveStartTick = this.currentTick;
          fromUnit.currX = toCenter.x;
          fromUnit.currY = toCenter.y;
          this.inventoryIndex.moveUnit(fromUid, cmd.to);
        } else {
          const toUnit = this.unitsByUid.get(toUid);
          if (!toUnit) {
            this.reject('move', '교체 대상 협객을 찾을 수 없습니다.');
            return;
          }
          this.board.setUid(cmd.from, toUid);
          this.board.setUid(cmd.to, fromUid);

          fromUnit.slot = cmd.to;
          fromUnit.moveFromX = fromUnit.currX;
          fromUnit.moveFromY = fromUnit.currY;
          fromUnit.moveStartTick = this.currentTick;
          fromUnit.currX = toCenter.x;
          fromUnit.currY = toCenter.y;

          toUnit.slot = cmd.from;
          toUnit.moveFromX = toUnit.currX;
          toUnit.moveFromY = toUnit.currY;
          toUnit.moveStartTick = this.currentTick;
          toUnit.currX = fromCenter.x;
          toUnit.currY = fromCenter.y;

          this.inventoryIndex.moveUnit(fromUid, cmd.to);
          this.inventoryIndex.moveUnit(toUid, cmd.from);
        }

        this.events.emit('unit:moved', {
          uid: fromUid,
          from: cmd.from,
          to: cmd.to,
          swappedUid: toUid,
          tick: this.currentTick,
        });
        this.priorityDirty = true;
        return;
      }

      case 'sell': {
        const unit = this.unitsByUid.get(cmd.uid);
        if (!unit) {
          this.reject('sell', '버릴 협객이 존재하지 않습니다.');
          return;
        }
        if (unit.locked) {
          this.reject('sell', '잠금 상태인 협객은 먼저 잠금을 해제해 주세요.');
          return;
        }
        const def = this.data.unitsById.get(unit.unitId);
        const gradeDef = this.data.gradesById.get(unit.grade);
        const refundSpec = getUnitSellLuckRefund(gradeDef);
        const coinEarned = this.getUnitSellCoin(def ? def.sellCoin : 10);
        let luckEarned = refundSpec.guaranteedLuck;
        if (refundSpec.chancePct > 0 && this.rng.nextInt(100) < refundSpec.chancePct) {
          luckEarned += 1;
        }
        const oldPos = { x: unit.currX, y: unit.currY };
        const oldSlot = unit.slot;
        const unitId = unit.unitId;
        const grade = unit.grade;

        this.removeUnitInternal(cmd.uid);
        this.coin += coinEarned;
        this.sellCoinTotal += coinEarned;
        if (luckEarned > 0) {
          this.luckStone += luckEarned;
        }
        this.events.emit('unit:sold', {
          uid: cmd.uid,
          unitId,
          grade,
          slot: oldSlot,
          pos: oldPos,
          coinEarned,
          luckEarned,
          tick: this.currentTick,
        });
        this.priorityDirty = true;
        return;
      }

      case 'sellSurplusCommon': {
        const toSellUids: number[] = [];
        for (let i = 0; i < this.board.bench.capacity; i++) {
          const uid = this.board.bench.getUidAt(i);
          if (uid === null) continue;
          const u = this.unitsByUid.get(uid);
          if (u && !u.locked && this.data.gradesById.get(u.grade)?.isSurplusCleanupTarget) {
            toSellUids.push(uid);
          }
        }
        if (toSellUids.length === 0) {
          this.reject('sellSurplusCommon', '대기석에 정리할 잠금 해제 초입 협객이 없습니다.');
          return;
        }
        let coinEarned = 0;
        for (let i = 0; i < toSellUids.length; i++) {
          const uid = toSellUids[i]!;
          const u = this.unitsByUid.get(uid);
          if (!u) continue;
          const def = this.data.unitsById.get(u.unitId);
          coinEarned += this.getUnitSellCoin(def ? def.sellCoin : 10);
          this.removeUnitInternal(uid);
        }
        this.coin += coinEarned;
        this.sellCoinTotal += coinEarned;
        this.priorityDirty = true;
        this.events.emit('units:bulk_sold', {
          count: toSellUids.length,
          coinEarned,
          tick: this.currentTick,
        });
        return;
      }

      case 'lock': {
        const unit = this.unitsByUid.get(cmd.uid);
        if (!unit) {
          this.reject('lock', '대상 협객이 존재하지 않습니다.');
          return;
        }
        unit.locked = cmd.locked;
        this.inventoryIndex.setLocked(cmd.uid, cmd.locked);
        this.priorityDirty = true;
        return;
      }

      case 'craft': {
        const res = this.craftSystem.execute(cmd.recipeId, cmd.chain, this.inventoryIndex, {
          getUnitStarLevel: (uid) => this.unitsByUid.get(uid)?.starLevel ?? 0,
          removeUnitByUid: (uid) => this.removeUnitInternal(uid),
          spawnCraftedUnit: (unitId, preferredFieldIndex, inheritedStarLevel = 0) => {
            const slot = this.board.findPlacementSlot(preferredFieldIndex);
            if (!slot) return null;
            return this.createUnit(unitId, slot, 'craft', inheritedStarLevel);
          },
        });

        if (!res.ok) {
          this.reject('craft', res.reason);
          return;
        }
        const outUnit = this.unitsByUid.get(res.outputUid);
        if (outUnit) {
          if (res.inheritedStarLevel > 0 && !outUnit.locked) {
            outUnit.locked = true;
            this.inventoryIndex.setLocked(outUnit.uid, true);
          }
          if (this.data.gradesById.get(outUnit.grade)?.fx === 'rainbow') {
            this.craftedImmortal = true;
          }
          this.events.emit('craft:done', {
            outputUid: outUnit.uid,
            outputUnitId: outUnit.unitId,
            grade: outUnit.grade,
            ...(res.inheritedStarLevel > 0 ? { inheritedStarLevel: res.inheritedStarLevel } : {}),
            pos: { x: outUnit.currX, y: outUnit.currY },
            tick: this.currentTick,
          });
        }
        this.priorityDirty = true;
        return;
      }

      case 'craftAll': {
        let craftedCount = 0;
        let topRank = -1;
        let topUnitId: UnitId | null = null;
        let topGrade: GradeId = 'common';

        for (let iter = 0; iter < 12; iter++) {
          const deltaNow = this.inventoryIndex.consumeDelta();
          if (deltaNow.length > 0) {
            this.craftIndex.applyDelta(deltaNow, this.inventoryIndex);
          }
          const cSnap = this.craftIndex.getView();
          if (cSnap.readyCount + cSnap.chainReadyCount === 0) break;

          let bestRecipeId: string | null = null;
          let bestScore = -Infinity;
          let bestChain = false;

          for (let i = 0; i < this.recipeGraph.topo.length; i++) {
            const rid = this.recipeGraph.topo[i]!;
            const r = this.recipeGraph.recipesById.get(rid);
            const st = cSnap.recipes[rid];
            if (!r || !st || (st.lamp !== 'ready' && st.lamp !== 'chainReady')) continue;
            const outDef = this.data.unitsById.get(r.output);
            const outRank = outDef ? (this.data.gradesById.get(outDef.grade)?.rank ?? 0) : 0;
            const isTriple = r.ingredients.length === 1 && r.ingredients[0]!.n >= 3;
            const lampBonus = st.lamp === 'ready' ? 20 : 0;
            const canonBonus = isTriple ? -15 : 15;
            const score = outRank * 100 + lampBonus + canonBonus - r.priority * 0.001;
            if (score > bestScore) {
              bestScore = score;
              bestRecipeId = rid;
              bestChain = st.lamp === 'chainReady';
            }
          }

          if (!bestRecipeId) break;

          const res = this.craftSystem.execute(bestRecipeId, bestChain, this.inventoryIndex, {
            getUnitStarLevel: (uid) => this.unitsByUid.get(uid)?.starLevel ?? 0,
            removeUnitByUid: (uid) => this.removeUnitInternal(uid),
            spawnCraftedUnit: (unitId, preferredFieldIndex, inheritedStarLevel = 0) => {
              const slot = this.board.findPlacementSlot(preferredFieldIndex);
              if (!slot) return null;
              return this.createUnit(unitId, slot, 'craft', inheritedStarLevel);
            },
          });

          if (!res.ok) break;
          const outUnit = this.unitsByUid.get(res.outputUid);
          if (outUnit) {
            if (res.inheritedStarLevel > 0 && !outUnit.locked) {
              outUnit.locked = true;
              this.inventoryIndex.setLocked(outUnit.uid, true);
            }
            craftedCount++;
            const outRank = this.data.gradesById.get(outUnit.grade)?.rank ?? 0;
            if (outRank >= topRank) {
              topRank = outRank;
              topUnitId = outUnit.unitId;
              topGrade = outUnit.grade;
            }
            if (this.data.gradesById.get(outUnit.grade)?.fx === 'rainbow') {
              this.craftedImmortal = true;
            }
            this.events.emit('craft:done', {
              outputUid: outUnit.uid,
              outputUnitId: outUnit.unitId,
              grade: outUnit.grade,
              ...(res.inheritedStarLevel > 0 ? { inheritedStarLevel: res.inheritedStarLevel } : {}),
              pos: { x: outUnit.currX, y: outUnit.currY },
              tick: this.currentTick,
            });
          }
        }

        if (craftedCount === 0) {
          this.reject('craftAll', '지금 즉시 합공할 수 있는 조합식이 없습니다.');
          return;
        }
        if (topUnitId) {
          this.events.emit('craft:batch', {
            count: craftedCount,
            topUnitId,
            topGrade,
            tick: this.currentTick,
          });
        }
        this.priorityDirty = true;
        return;
      }

      case 'useWisp': {
        const owned = this.wisps[cmd.grade] ?? 0;
        if (owned <= 0) {
          this.reject('useWisp', '보유한 해당 경지 기연이 없습니다.');
          return;
        }
        if (!this.wispSystem.isAllowedSelection(cmd.grade, cmd.unitId)) {
          this.reject('useWisp', '해당 기연 목록에 없는 협객입니다.');
          return;
        }
        const slot = this.board.findPlacementSlot();
        if (!slot) {
          this.reject('useWisp', '배치할 빈 자리가 없습니다.');
          return;
        }
        this.wisps[cmd.grade] = owned - 1;
        this.createUnit(cmd.unitId, slot, 'wisp');
        this.wispSystem.recomputeHintsIfOwned(this.wisps, this.inventoryIndex);
        this.priorityDirty = true;
        return;
      }

      case 'grantTestCoin': {
        const bonus = Math.max(0, Math.min(5000, Math.floor(cmd.amount)));
        this.coin += bonus;
        this.priorityDirty = true;
        return;
      }

      case 'grantTestResource': {
        if (typeof cmd.luck === 'number' && cmd.luck > 0) {
          this.luckStone += Math.min(50, Math.floor(cmd.luck));
        }
        if (cmd.wispGrade && this.data.wispPools[cmd.wispGrade]) {
          this.wisps[cmd.wispGrade] = (this.wisps[cmd.wispGrade] ?? 0) + 1;
          this.wispSystem.recomputeHintsIfOwned(this.wisps, this.inventoryIndex);
        }
        this.priorityDirty = true;
        return;
      }
    }
  }

  private compareUnitsForArrange(a: UnitEntity, b: UnitEntity): number {
    const rankA = this.data.gradesById.get(a.grade)?.rank ?? 0;
    const rankB = this.data.gradesById.get(b.grade)?.rank ?? 0;
    if (rankA !== rankB) return rankB - rankA;

    const defA = this.data.unitsById.get(a.unitId);
    const defB = this.data.unitsById.get(b.unitId);
    const atkA = defA?.atk ?? 0;
    const atkB = defB?.atk ?? 0;
    if (atkA !== atkB) return atkB - atkA;

    const facOrder = (f?: FactionId): number =>
      f === 'orthodox' ? 0 : f === 'unorthodox' ? 1 : 2;
    const fa = facOrder(defA?.faction);
    const fb = facOrder(defB?.faction);
    if (fa !== fb) return fa - fb;

    const cmpId = a.unitId.localeCompare(b.unitId);
    if (cmpId !== 0) return cmpId;
    return a.uid - b.uid;
  }

  private executeAutoArrange(preserveBenchPassives = this.preserveBenchPassives): void {
    const safeEmptyFieldSlots: number[] = [];
    const hazardEmptyFieldSlots: number[] = [];
    const endangeredUnits: UnitEntity[] = [];

    for (let i = 0; i < this.board.field.capacity; i++) {
      const uid = this.board.field.getUidAt(i);
      const isHaz = this.hasFieldHazard(i);
      if (uid === null) {
        if (isHaz) hazardEmptyFieldSlots.push(i);
        else safeEmptyFieldSlots.push(i);
      } else if (isHaz) {
        const u = this.unitsByUid.get(uid);
        if (u) endangeredUnits.push(u);
      }
    }
    endangeredUnits.sort((a, b) => this.compareUnitsForArrange(a, b));

    let deployedCount = 0;
    for (let i = 0; i < endangeredUnits.length && safeEmptyFieldSlots.length > 0; i++) {
      const u = endangeredUnits[i]!;
      const oldIdx = u.slot.index;
      const safeIdx = safeEmptyFieldSlots.shift()!;
      const toSlot: SlotRef = { area: 'field', index: safeIdx };
      const toCenter = this.board.getSlotCenter(toSlot);

      this.board.setUid(u.slot, null);
      this.board.setUid(toSlot, u.uid);
      u.slot = toSlot;
      u.moveFromX = u.currX;
      u.moveFromY = u.currY;
      u.moveStartTick = this.currentTick;
      u.currX = toCenter.x;
      u.currY = toCenter.y;
      this.inventoryIndex.moveUnit(u.uid, toSlot);
      hazardEmptyFieldSlots.push(oldIdx);
      deployedCount++;
    }

    const emptyFieldSlots = [...safeEmptyFieldSlots, ...hazardEmptyFieldSlots];
    const benchUnits: UnitEntity[] = [];
    for (let i = 0; i < this.board.bench.capacity; i++) {
      const uid = this.board.bench.getUidAt(i);
      if (uid !== null) {
        const u = this.unitsByUid.get(uid);
        if (u) benchUnits.push(u);
      }
    }
    benchUnits.sort((a, b) => this.compareUnitsForArrange(a, b));

    const reservedPassiveUnitIds = new Set<UnitId>();
    if (preserveBenchPassives) {
      // Locked bench-passive heroes already satisfy their unique passive slot
      for (let i = 0; i < benchUnits.length; i++) {
        const u = benchUnits[i]!;
        if (u.locked && this.data.unitsById.get(u.unitId)?.benchPassive) {
          reservedPassiveUnitIds.add(u.unitId);
        }
      }
    }

    let slotCursor = 0;
    const remainingBench: UnitEntity[] = [];
    for (let i = 0; i < benchUnits.length; i++) {
      const u = benchUnits[i]!;
      const hasBenchPassive = Boolean(this.data.unitsById.get(u.unitId)?.benchPassive);
      const keepForPassive =
        preserveBenchPassives && hasBenchPassive && !reservedPassiveUnitIds.has(u.unitId);
      if (keepForPassive) {
        reservedPassiveUnitIds.add(u.unitId);
        remainingBench.push(u);
      } else if (!u.locked && slotCursor < emptyFieldSlots.length) {
        const targetFieldIdx = emptyFieldSlots[slotCursor++]!;
        const toSlot: SlotRef = { area: 'field', index: targetFieldIdx };
        const toCenter = this.board.getSlotCenter(toSlot);

        this.board.setUid(u.slot, null);
        this.board.setUid(toSlot, u.uid);
        u.slot = toSlot;
        u.moveFromX = u.currX;
        u.moveFromY = u.currY;
        u.moveStartTick = this.currentTick;
        u.currX = toCenter.x;
        u.currY = toCenter.y;
        this.inventoryIndex.moveUnit(u.uid, toSlot);
        deployedCount++;
      } else {
        remainingBench.push(u);
      }
    }

    for (let i = 0; i < this.board.bench.capacity; i++) {
      this.board.setUid({ area: 'bench', index: i }, null);
    }
    for (let i = 0; i < remainingBench.length; i++) {
      const u = remainingBench[i]!;
      const nextSlot: SlotRef = { area: 'bench', index: i };
      const toCenter = this.board.getSlotCenter(nextSlot);
      this.board.setUid(nextSlot, u.uid);
      if (u.slot.area !== 'bench' || u.slot.index !== i) {
        u.slot = nextSlot;
        u.moveFromX = u.currX;
        u.moveFromY = u.currY;
        u.moveStartTick = this.currentTick;
        u.currX = toCenter.x;
        u.currY = toCenter.y;
        this.inventoryIndex.moveUnit(u.uid, nextSlot);
      }
    }

    this.priorityDirty = true;
    this.events.emit('board:arranged', {
      deployedCount,
      sortedBenchCount: remainingBench.length,
      tick: this.currentTick,
    });
  }

  private getMissionProgress(mDef: MissionDef, synergy: FactionSynergySnapshot): number {
    switch (mDef.condition) {
      case 'distinct_leaf_owned': {
        const seen = new Set<UnitId>();
        for (let i = 0; i < this.units.length; i++) {
          const u = this.units[i]!;
          const def = this.data.unitsById.get(u.unitId);
          if (def?.leaf) {
            seen.add(u.unitId);
          }
        }
        return seen.size;
      }
      case 'min_grade_owned': {
        const minRank = mDef.gradeRank ?? 3;
        let cnt = 0;
        for (let i = 0; i < this.units.length; i++) {
          const rank = this.data.gradesById.get(this.units[i]!.grade)?.rank ?? 0;
          if (rank >= minRank) cnt++;
        }
        return cnt;
      }
      case 'any_formation_active': {
        return synergy.orthodoxTier >= 1 ||
          synergy.unorthodoxTier >= 1 ||
          synergy.demonicTier >= 1 ||
          synergy.trinityActive
          ? 1
          : 0;
      }
      case 'high_formation_active': {
        return synergy.orthodoxTier >= 2 ||
          synergy.unorthodoxTier >= 2 ||
          synergy.demonicTier >= 2 ||
          synergy.trinityActive
          ? 1
          : 0;
      }
      case 'bounties_slain':
        return this.bountiesSlain;
      case 'gamble_wins':
        return this.gambleWins;
      case 'held_coin':
        return this.coin;
      case 'total_upgrades':
        return (
          (this.upgradeLv.orthodox ?? 0) +
          (this.upgradeLv.unorthodox ?? 0) +
          (this.upgradeLv.demonic ?? 0)
        );
      case 'monsters_slain':
        return this.monstersSlain;
      case 'total_boons': {
        let sum = 0;
        for (let i = 0; i < BOON_IDS_ORDERED.length; i++) {
          sum += this.activeBoons[BOON_IDS_ORDERED[i]!] ?? 0;
        }
        return sum;
      }
    }
  }

  private evaluateMissions(): void {
    const synergy = this.computeFieldSynergy();
    if (
      synergy.orthodoxTier >= 2 ||
      synergy.unorthodoxTier >= 2 ||
      synergy.demonicTier >= 2 ||
      synergy.trinityActive
    ) {
      this.usedHighFormation = true;
    }
    if (this.completedMissions.size >= this.data.missions.length) return;

    for (let i = 0; i < this.data.missions.length; i++) {
      const mDef = this.data.missions[i]!;
      if (this.completedMissions.has(mDef.id)) continue;

      const prog = this.getMissionProgress(mDef, synergy);
      if (prog >= mDef.target) {
        this.completedMissions.add(mDef.id);
        if (mDef.rewardCoin > 0) {
          this.coin += mDef.rewardCoin;
        }
        if (mDef.rewardLuck > 0) {
          this.luckStone += mDef.rewardLuck;
        }
        if (mDef.rewardWispGrade) {
          this.wisps[mDef.rewardWispGrade] = (this.wisps[mDef.rewardWispGrade] ?? 0) + 1;
          this.wispSystem.recomputeHintsIfOwned(this.wisps, this.inventoryIndex);
        }
        this.priorityDirty = true;
        this.events.emit('mission:completed', {
          missionId: mDef.id,
          name: mDef.name,
          rewardCoin: mDef.rewardCoin,
          rewardLuck: mDef.rewardLuck,
          rewardWispGrade: mDef.rewardWispGrade,
          tick: this.currentTick,
        });
      }
    }
  }

  private dequeueNextContractOffer(): void {
    if (this.pendingContractOffer !== null) return;
    while (this.queuedContractOfferWaves.length > 0) {
      const nextWave = this.queuedContractOfferWaves.shift()!;
      this.offerContracts(nextWave);
      if (this.pendingContractOffer !== null) return;
    }
  }

  private offerContracts(wave: number): void {
    if (this.pendingContractOffer !== null) {
      if (!this.queuedContractOfferWaves.includes(wave)) {
        this.queuedContractOfferWaves.push(wave);
        this.priorityDirty = true;
      }
      return;
    }
    const alreadyTaken = new Set<ContractId>(this.activeContracts.map((c) => c.contractId));
    const eligible = CONTRACT_DEFS.filter(
      (c) => wave >= c.minWave && !alreadyTaken.has(c.id),
    );
    if (eligible.length === 0) return;

    // Derived deterministic RNG so offering contracts never perturbs core combat/summon RNG
    const offerRng = new Rng(((this.rng.getState() ^ Math.imul(wave, 0x9e3779b1)) >>> 0) || 1);
    const pool = eligible.slice();
    const picked: ContractId[] = [];
    const count = Math.min(3, pool.length);
    for (let i = 0; i < count; i++) {
      const idx = offerRng.nextInt(pool.length);
      picked.push(pool.splice(idx, 1)[0]!.id);
    }

    this.pendingContractOffer = {
      seq: ++this.contractOfferSeq,
      wave,
      options: picked,
    };
    this.priorityDirty = true;
    this.events.emit('contract:offered', {
      seq: this.pendingContractOffer.seq,
      wave,
      options: picked,
      tick: this.currentTick,
    });
  }

  private completeContract(state: ActiveContractState): void {
    if (state.status !== 'active') return;
    const def = CONTRACTS_BY_ID.get(state.contractId);
    if (!def) return;
    state.status = 'completed';
    state.progress = def.target;

    const refundedDeposit = state.depositCoin ?? 0;
    if (refundedDeposit + def.rewardCoin > 0) {
      this.coin += refundedDeposit + def.rewardCoin;
    }
    if (def.rewardLuck > 0) {
      this.luckStone += def.rewardLuck;
    }
    if (def.rewardWispGrade && (def.rewardWispCount ?? 1) > 0) {
      const cnt = def.rewardWispCount ?? 1;
      this.wisps[def.rewardWispGrade] = (this.wisps[def.rewardWispGrade] ?? 0) + cnt;
      this.wispSystem.recomputeHintsIfOwned(this.wisps, this.inventoryIndex);
    }
    if (def.rewardUpgradeAll && def.rewardUpgradeAll > 0) {
      for (let i = 0; i < UPGRADE_ORDER.length; i++) {
        const g = UPGRADE_ORDER[i]!;
        const upDef = this.data.upgrades.find((u) => u.id === g);
        const cap = upDef?.maxLevel ?? 40;
        this.upgradeLv[g] = Math.min(cap, (this.upgradeLv[g] ?? 0) + def.rewardUpgradeAll);
      }
    }

    this.priorityDirty = true;
    this.events.emit('contract:completed', {
      contractId: def.id,
      name: def.name,
      rewardCoin: def.rewardCoin,
      refundedDeposit,
      rewardLuck: def.rewardLuck,
      rewardWispGrade: def.rewardWispGrade,
      rewardWispCount: def.rewardWispCount,
      rewardUpgradeAll: def.rewardUpgradeAll,
      tick: this.currentTick,
    });
  }

  private handleWaveAdvancedForContracts(completedWave: number, nextWaveNum: number): void {
    // Endless 40+ Milestone Rewards (40, 50, 60, 70, 80, 100)
    if (this.endlessMode) {
      const milestone = ENDLESS_MILESTONES_BY_WAVE.get(completedWave);
      if (milestone && !this.endlessMilestonesReached.has(milestone.wave)) {
        this.endlessMilestonesReached.add(milestone.wave);
        this.coin += milestone.inRunCoin;
        this.luckStone += milestone.inRunLuck;
        this.priorityDirty = true;
        this.events.emit('endless:milestone', {
          wave: milestone.wave,
          label: milestone.label,
          inRunCoin: milestone.inRunCoin,
          inRunLuck: milestone.inRunLuck,
          tick: this.currentTick,
        });
      }
    }

    const synergy = this.computeFieldSynergy();
    for (let i = 0; i < this.activeContracts.length; i++) {
      const st = this.activeContracts[i]!;
      if (st.status !== 'active') continue;
      const def = CONTRACTS_BY_ID.get(st.contractId);
      if (!def) continue;

      if (def.condition === 'faction_field_waves' && def.faction) {
        if ((synergy.counts[def.faction] ?? 0) >= (def.minFactionCount ?? 5)) {
          st.progress = Math.min(def.target, st.progress + 1);
          this.priorityDirty = true;
        }
      } else if (def.condition === 'trinity_waves') {
        if (synergy.trinityActive) {
          st.progress = Math.min(def.target, st.progress + 1);
          this.priorityDirty = true;
        }
      }

      if (st.progress >= def.target) {
        this.completeContract(st);
      } else if (nextWaveNum > st.deadlineWave) {
        st.status = 'failed';
        this.priorityDirty = true;
        this.events.emit('contract:failed', {
          contractId: def.id,
          name: def.name,
          lostDeposit: st.depositCoin ?? 0,
          tick: this.currentTick,
        });
      }
    }

    // Remind the player once on the next wave if they have not picked a pending contract offer yet
    if (
      this.pendingContractOffer !== null &&
      nextWaveNum === this.pendingContractOffer.wave + 1
    ) {
      this.events.emit('contract:reminder', {
        seq: this.pendingContractOffer.seq,
        wave: nextWaveNum,
        offerWave: this.pendingContractOffer.wave,
        options: [...this.pendingContractOffer.options],
        tick: this.currentTick,
      });
    }

    if (this.runMode !== 'boss_rush' && CONTRACT_OFFER_WAVES.includes(nextWaveNum)) {
      this.offerContracts(nextWaveNum);
    }
  }

  private handleWaveBossSlainForContracts(elapsedTicks: number): void {
    for (let i = 0; i < this.activeContracts.length; i++) {
      const st = this.activeContracts[i]!;
      if (st.status !== 'active') continue;
      const def = CONTRACTS_BY_ID.get(st.contractId);
      if (!def || def.condition !== 'fast_boss_kill') continue;
      const maxTicks = (def.maxBossKillSec ?? 20) * 30;
      if (elapsedTicks <= maxTicks) {
        st.progress = Math.min(def.target, st.progress + 1);
        if (st.progress >= def.target) {
          this.completeContract(st);
        }
      }
    }
  }

  private evaluateContracts(): void {
    for (let i = 0; i < this.activeContracts.length; i++) {
      const st = this.activeContracts[i]!;
      if (st.status !== 'active') continue;
      const def = CONTRACTS_BY_ID.get(st.contractId);
      if (!def) continue;

      let prog = st.progress;
      if (def.condition === 'held_coin_reach') {
        prog = Math.max(prog, this.coin);
      } else if (def.condition === 'bounty_kills_delta') {
        prog = Math.max(0, this.bountiesSlain - st.baseline);
      } else if (def.condition === 'gamble_wins_delta') {
        prog = Math.max(0, this.gambleWins - st.baseline);
      } else if (def.condition === 'awaken_count_delta') {
        prog = Math.max(0, this.awakenCount - st.baseline);
      }
      st.progress = Math.min(def.target, prog);
      if (st.progress >= def.target) {
        this.completeContract(st);
      }
    }
  }

  private rollSummonUnit(): UnitId {
    let totalWeight = 0;
    for (let i = 0; i < this.summonableGrades.length; i++) {
      totalWeight += this.summonableGrades[i]!.summonWeight;
    }

    const defaultGradeId = this.data.grades[0]!.id;
    let roll = this.rng.nextInt(Math.max(1, totalWeight));
    let chosenGrade: GradeId = this.summonableGrades[0]?.id ?? defaultGradeId;

    for (let i = 0; i < this.summonableGrades.length; i++) {
      const g = this.summonableGrades[i]!;
      if (roll < g.summonWeight) {
        chosenGrade = g.id;
        break;
      }
      roll -= g.summonWeight;
    }

    const pool = this.unitsByGrade.get(chosenGrade);
    if (!pool || pool.length === 0) {
      const fallback = this.unitsByGrade.get(defaultGradeId);
      return fallback?.[0] ?? this.data.units[0]!.id;
    }
    const idx = this.rng.nextInt(pool.length);
    return pool[idx]!;
  }

  private createUnit(
    unitId: UnitId,
    slot: SlotRef,
    source: 'summon' | 'craft' | 'wisp' | 'gamble',
    initialStarLevel = 0,
  ): number {
    const def = this.data.unitsById.get(unitId);
    if (!def) {
      throw new Error(`[Simulation] unknown unitId '${unitId}'`);
    }
    const uid = this.nextUid++;
    const center = this.board.getSlotCenter(slot);
    const clampedStar = Math.max(0, Math.min(MAX_UNIT_STAR_LEVEL, Math.floor(initialStarLevel)));

    const entity: UnitEntity = {
      uid,
      unitId,
      grade: def.grade,
      slot,
      locked: false,
      starLevel: clampedStar,
      spawnTick: this.currentTick,
      moveFromX: center.x,
      moveFromY: center.y,
      moveStartTick: -100,
      prevX: center.x,
      prevY: center.y,
      currX: center.x,
      currY: center.y,
      cooldownTicks: Math.min(10, def.attackIntervalTicks),
      attackCount: 0,
      lastAttackTick: -100,
      attackDirX: 0,
      attackDirY: 1,
    };

    this.board.setUid(slot, uid);
    this.units.push(entity);
    this.unitsByUid.set(uid, entity);
    this.inventoryIndex.addUnit(uid, unitId, slot, false);

    this.events.emit('unit:added', {
      uid,
      unitId,
      grade: def.grade,
      slot,
      source,
      pos: center,
      tick: this.currentTick,
    });
    return uid;
  }

  private removeUnitInternal(uid: number): SlotRef | null {
    const entity = this.unitsByUid.get(uid);
    if (!entity) return null;
    const oldSlot = entity.slot;

    this.board.setUid(oldSlot, null);
    this.unitsByUid.delete(uid);
    const idx = this.units.findIndex((u) => u.uid === uid);
    if (idx !== -1) {
      this.units.splice(idx, 1);
    }
    this.inventoryIndex.removeUnit(uid);

    this.events.emit('unit:removed', {
      uid,
      unitId: entity.unitId,
      slot: oldSlot,
      tick: this.currentTick,
    });
    return oldSlot;
  }

  private rollBoonOptions(wave: number, excludeIds?: readonly BoonId[]): BoonId[] {
    const eligible = this.data.boons.filter(
      (b) => (this.activeBoons[b.id] ?? 0) < b.maxStacks,
    );
    if (eligible.length === 0) return [];

    const preferred =
      excludeIds && excludeIds.length > 0
        ? eligible.filter((b) => !excludeIds.includes(b.id))
        : eligible;
    const pool = preferred.length >= 3 ? preferred.slice() : eligible.slice();
    const picked: BoonId[] = [];
    const targetCount = Math.min(3, pool.length);

    for (let k = 0; k < targetCount; k++) {
      let totalWeight = 0;
      for (let i = 0; i < pool.length; i++) {
        const b = pool[i]!;
        const w =
          b.rarity === 'mythic'
            ? wave >= 15
              ? 28
              : 18
            : b.rarity === 'epic'
              ? 36
              : 46;
        totalWeight += w;
      }
      let roll = this.rng.nextInt(Math.max(1, totalWeight));
      let chosenIdx = 0;
      for (let i = 0; i < pool.length; i++) {
        const b = pool[i]!;
        const w =
          b.rarity === 'mythic'
            ? wave >= 15
              ? 28
              : 18
            : b.rarity === 'epic'
              ? 36
              : 46;
        if (roll < w) {
          chosenIdx = i;
          break;
        }
        roll -= w;
      }
      const chosen = pool.splice(chosenIdx, 1)[0]!;
      picked.push(chosen.id);
    }
    return picked;
  }

  private offerBossBoons(wave: number): void {
    const picked = this.rollBoonOptions(wave);
    if (picked.length === 0) return;

    const offer: BoonOfferSnapshot = {
      seq: ++this.boonOfferSeq,
      wave,
      options: picked,
      rerollsUsed: 0,
    };
    this.pendingBoonOffers.push(offer);
    this.priorityDirty = true;
    this.events.emit('boon:offered', {
      seq: offer.seq,
      wave,
      options: picked,
      tick: this.currentTick,
    });
  }

  private reject(cmd: GameCommand['type'], reason: string): void {
    const notice: RejectNotice = { cmd, reason, tick: this.currentTick };
    this.pendingRejects.push(notice);
    this.events.emit('command:rejected', notice);
    this.priorityDirty = true;
  }

  public buildSnapshot(speed: Speed, paused: boolean): UISnapshot {
    const synergy = this.computeFieldSynergy();
    const tileBuffs = this.computeFieldTileBuffs();
    const benchPassives = this.computeBenchPassives();

    const fieldViews: Array<SlotView | null> = [];
    for (let i = 0; i < this.board.field.capacity; i++) {
      const uid = this.board.field.getUidAt(i);
      const buff = tileBuffs[i] ?? { atkPct: 0, speedPct: 0 };
      fieldViews.push(uid !== null ? this.toSlotView(uid, synergy, buff, benchPassives) : null);
    }

    const zeroBuff: TileAuraBuff = { atkPct: 0, speedPct: 0 };
    const benchViews: Array<SlotView | null> = [];
    let benchSurplusCommonCount = 0;
    for (let i = 0; i < this.board.bench.capacity; i++) {
      const uid = this.board.bench.getUidAt(i);
      const view = uid !== null ? this.toSlotView(uid, synergy, zeroBuff, benchPassives) : null;
      if (view && !view.locked && this.data.gradesById.get(view.grade)?.isSurplusCleanupTarget) {
        benchSurplusCommonCount++;
      }
      benchViews.push(view);
    }

    const rejects = this.pendingRejects.slice();
    this.pendingRejects.length = 0;

    const waveDef =
      this.runMode === 'boss_rush'
        ? resolveBossRushWaveDef(this.waveNumber)
        : resolveWaveDef(this.data.waves, this.waveNumber);
    const mutantKind =
      this.runMode === 'boss_rush' ? null : getWaveMutantKind(this.waveNumber, waveDef.isBoss);
    const waveMutant = mutantKind ? WAVE_MUTANT_META[mutantKind] : null;
    const waveBoss = this.monsters.find((m) => m.isBoss && !m.isBounty);
    const bountyBoss = this.monsters.find((m) => m.isBounty);
    const activeBoss = waveBoss ?? bountyBoss;

    const unlockedBounty = this.runMode !== 'boss_rush' && this.waveNumber >= 2;
    const eliteUnlocked = this.runMode !== 'boss_rush' && this.waveNumber >= ELITE_BOUNTY_MIN_WAVE;
    const bountyActiveTicksLeft =
      bountyBoss && bountyBoss.expireTick !== undefined
        ? Math.max(0, bountyBoss.expireTick - this.currentTick)
        : 0;
    const bountyCooldownLeft = Math.max(0, this.bountyReadyTick - this.currentTick);
    const canCallBase =
      !bountyBoss &&
      bountyCooldownLeft === 0 &&
      !this.gameOver &&
      !this.victoryHold &&
      this.monsters.length + 1 < this.data.board.path.monsterCap;
    const bountySnap: BountySnapshot = {
      canCall: unlockedBounty && canCallBase,
      canCallElite: eliteUnlocked && canCallBase && this.coin >= ELITE_BOUNTY_COST,
      eliteUnlocked,
      eliteCost: ELITE_BOUNTY_COST,
      unlocked: unlockedBounty,
      active: Boolean(bountyBoss),
      activeTicksLeft: bountyActiveTicksLeft,
      cooldownTicksLeft: bountyCooldownLeft,
      bountiesSlain: this.bountiesSlain,
    };

    const missionItems: MissionItemSnapshot[] = this.data.missions.map((mDef) => {
      const completed = this.completedMissions.has(mDef.id);
      const rawProg = completed ? mDef.target : this.getMissionProgress(mDef, synergy);
      return {
        id: mDef.id,
        name: mDef.name,
        desc: mDef.desc,
        progress: Math.min(mDef.target, rawProg),
        target: mDef.target,
        completed,
        rewardCoin: mDef.rewardCoin,
        rewardLuck: mDef.rewardLuck,
        rewardWispGrade: mDef.rewardWispGrade,
      };
    });

    const contractItems: ContractItemSnapshot[] = [];
    for (let i = 0; i < this.activeContracts.length; i++) {
      const st = this.activeContracts[i]!;
      const cDef = CONTRACTS_BY_ID.get(st.contractId);
      if (!cDef) continue;
      contractItems.push({
        contractId: st.contractId,
        name: cDef.name,
        tag: cDef.tag,
        desc: cDef.desc,
        acceptedWave: st.acceptedWave,
        deadlineWave: st.deadlineWave,
        progress: st.progress,
        target: cDef.target,
        depositCoin: st.depositCoin ?? cDef.depositCoin,
        status: st.status,
        rewardCoin: cDef.rewardCoin,
        rewardLuck: cDef.rewardLuck,
        ...(cDef.rewardWispGrade !== undefined ? { rewardWispGrade: cDef.rewardWispGrade } : {}),
        ...(cDef.rewardWispCount !== undefined ? { rewardWispCount: cDef.rewardWispCount } : {}),
        ...(cDef.rewardUpgradeAll !== undefined ? { rewardUpgradeAll: cDef.rewardUpgradeAll } : {}),
      });
    }

    const defaultGradeId = this.data.grades[0]!.id;
    const dmgEntries: DamageEntrySnapshot[] = [...this.damageByUnit.entries()]
      .filter(([, dmg]) => dmg > 0)
      .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])))
      .slice(0, 5)
      .map(([unitId, dmg]) => {
        const def = this.data.unitsById.get(unitId);
        const sharePct =
          this.totalDamageDealt > 0
            ? Math.min(100, Math.round((dmg / this.totalDamageDealt) * 1000) / 10)
            : 0;
        return {
          unitId,
          name: def?.name ?? unitId,
          faction: def?.faction ?? 'orthodox',
          grade: def?.grade ?? defaultGradeId,
          damage: dmg,
          sharePct,
        };
      });

    const dmgByFaction: Record<FactionId, number> = { orthodox: 0, unorthodox: 0, demonic: 0 };
    for (const [unitId, dmg] of this.damageByUnit.entries()) {
      if (dmg <= 0) continue;
      const fac = this.data.unitsById.get(unitId)?.faction;
      if (fac) {
        dmgByFaction[fac] += dmg;
      }
    }

    const setBonus = computeRelicSetBonuses(this.relicLv);
    const { pct: effInterestPct, cap: effInterestCap } = this.getEffectiveInterestConfig();
    const relicBonus: RelicBonusSnapshot = {
      interestPct: effInterestPct,
      interestCap: effInterestCap,
      wealthAtkBps: this.getEffectiveWealthBps(),
      gambleBonusPct: this.getEffectiveGambleBonusPct(),
      gambleRefundPct: getFurnaceRefundPct(this.relicLv.immortal_furnace),
      lastWaveInterest: this.lastWaveInterest,
      pilferedCoinTotal: this.pilferedCoinTotal,
    };

    let totalBoonStacks = 0;
    for (let i = 0; i < BOON_IDS_ORDERED.length; i++) {
      totalBoonStacks += this.activeBoons[BOON_IDS_ORDERED[i]!] ?? 0;
    }

    const patternHint = activeBoss
      ? activeBoss.isBounty
        ? activeBoss.isEliteBounty
          ? '정예 현상수배! 24초 고난도 · 2.5배 보상+일류기연'
          : '현상수배 도주 주의'
        : this.waveNumber >= 35 && this.waveNumber % 5 === 0
          ? '무한 이중권능: 독갑 + 혈옥주박 + 광풍!'
          : activeBoss.kind === 'white_tiger'
            ? '권능: 호포 경직 · 광풍질주'
            : activeBoss.kind === 'black_serpent'
              ? '권능: 현무 독갑 (파갑 1.8x 특효)'
              : '권능: 혈옥주박 타일봉인 (스왑 회피!)'
      : '';

    const fieldUnitSet = new Set<UnitId>();
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i]!;
      if (u.slot.area === 'field' && !this.isFieldSlotSealed(u.slot.index)) {
        fieldUnitSet.add(u.unitId);
      }
    }
    const activeCombos: ActiveComboView[] = [];
    for (let i = 0; i < COMBO_SKILLS.length; i++) {
      const cDef = COMBO_SKILLS[i]!;
      if (
        fieldUnitSet.has(cDef.requiredUnits[0]) &&
        fieldUnitSet.has(cDef.requiredUnits[1])
      ) {
        activeCombos.push({
          id: cDef.id,
          name: cDef.name,
          desc: cDef.desc,
          unitIds: cDef.requiredUnits,
          color: cDef.color,
          tierLabel: cDef.tierLabel,
          cooldownLeftTicks:
            this.comboCooldowns.get(cDef.id) ?? Math.min(180, Math.floor(cDef.cooldownTicks * 0.4)),
          cooldownTotalTicks: cDef.cooldownTicks,
          triggerCount: this.comboTriggerCounts.get(cDef.id) ?? 0,
        });
      }
    }

    return {
      tick: this.currentTick,
      speed,
      paused,
      difficulty: this.difficulty,
      trialId: this.trialId,
      runMode: this.runMode,
      dailyChallenge: this.dailyChallengeSpec,
      endlessMilestonesReached: [...this.endlessMilestonesReached].sort((a, b) => a - b),
      activeCombos,
      codexAtkBonusPct: this.codexAtkBonusPct,
      arenaRule: this.arenaRule,
      clearTargetWave: this.clearTargetWave,
      gameOver: this.gameOver,
      gameOverReason: this.gameOverReason,
      bossRetryUsed: this.bossRetryUsed,
      victoryAchieved: this.victoryAchieved,
      victoryHold: this.victoryHold,
      endlessMode: this.endlessMode,
      wave: this.waveNumber,
      waveTicksLeft: this.waveTicksLeft,
      isBossWave: waveDef.isBoss,
      waveMutant,
      boss: activeBoss
        ? {
            kind: activeBoss.kind,
            name: activeBoss.bossName ?? '영물 보스',
            hp: Math.max(0, activeBoss.hp),
            maxHp: activeBoss.maxHp,
            armor: activeBoss.armor,
            armorShred:
              this.currentTick < activeBoss.shredExpireTick ? activeBoss.armorShred : 0,
            shieldHp:
              this.currentTick < activeBoss.shieldExpireTick
                ? Math.max(0, activeBoss.shieldHp)
                : 0,
            shieldMaxHp:
              this.currentTick < activeBoss.shieldExpireTick ? activeBoss.shieldMaxHp : 0,
            hasted: this.currentTick < activeBoss.hasteUntilTick,
            patternHint,
            isBounty: Boolean(activeBoss.isBounty),
            ticksLeft:
              activeBoss.isBounty && activeBoss.expireTick !== undefined
                ? Math.max(0, activeBoss.expireTick - this.currentTick)
                : this.waveTicksLeft,
          }
        : undefined,
      bounty: bountySnap,
      pendingBoonOffer: this.pendingBoonOffers[0] ?? null,
      activeBoons: { ...this.activeBoons },
      totalBoonStacks,
      pendingContractOffer: this.pendingContractOffer
        ? {
            seq: this.pendingContractOffer.seq,
            wave: this.pendingContractOffer.wave,
            options: [...this.pendingContractOffer.options],
          }
        : null,
      queuedContractCount: this.queuedContractOfferWaves.length,
      contracts: contractItems,
      benchPassives,
      preserveBenchPassives: this.preserveBenchPassives,
      missions: missionItems,
      missionsCompletedCount: this.completedMissions.size,
      damageMeter: {
        totalDamage: this.totalDamageDealt,
        entries: dmgEntries,
        byFaction: dmgByFaction,
      },
      economyStats: {
        totalInterestEarned: this.totalInterestEarned,
        pilferedCoinTotal: this.pilferedCoinTotal,
        killCoinTotal: this.killCoinTotal,
        sellCoinTotal: this.sellCoinTotal,
      },
      activeRelicSetCount: setBonus.activeSetCount,
      usedHighFormation: this.usedHighFormation,
      craftedImmortal: this.craftedImmortal,
      monsterCount: this.monsters.length,
      monsterCap: this.data.board.path.monsterCap,
      monstersSlain: this.monstersSlain,
      bossesSlain: this.bossesSlain,
      coin: this.coin,
      luckStone: this.luckStone,
      summonCost: this.getSummonCost(),
      wisps: { ...this.wisps },
      upgradeLv: { ...this.upgradeLv },
      upgradeCosts: {
        orthodox: this.getUpgradeCost('orthodox'),
        unorthodox: this.getUpgradeCost('unorthodox'),
        demonic: this.getUpgradeCost('demonic'),
      },
      relics: { ...this.relicLv },
      relicBonus,
      synergy,
      lastGambleResult: this.lastGambleResult,
      field: fieldViews,
      bench: benchViews,
      fieldOccupied: this.board.field.countOccupied(),
      benchOccupied: this.board.bench.countOccupied(),
      benchSurplusCommonCount,
      craft: this.craftIndex.getView(),
      wispHints: this.wispSystem.getHints(),
      rejects,
    };
  }

  private toSlotView(
    uid: number,
    synergy: FactionSynergySnapshot,
    tileBuff: TileAuraBuff,
    benchPassives: BenchPassiveSummary,
  ): SlotView | null {
    const u = this.unitsByUid.get(uid);
    if (!u) return null;
    const def = this.data.unitsById.get(u.unitId);
    const starLevel = u.starLevel ?? 0;
    const { baseAtk, bonusAtk } = this.getUnitEffectiveAtk(
      u.unitId,
      synergy,
      tileBuff.atkPct,
      starLevel,
    );
    const isField = u.slot.area === 'field';
    const harmonyRange = this.getBoonStacks('b_trinity_harmony') * 25;
    const crusherShred = this.getBoonStacks('b_armor_crusher') * 6;
    const trialShred =
      def?.faction === 'unorthodox' && this.trialId
        ? TRIAL_CONFIGS[this.trialId].unorthodoxBonusShred
        : 0;
    const gradeDef = this.data.gradesById.get(u.grade);
    const refundSpec = getUnitSellLuckRefund(gradeDef);
    const setBonus = computeRelicSetBonuses(this.relicLv);
    const rangeMirrorBonus =
      getRangeMirrorRangeBonus(this.relicLv.dragon_range_mirror ?? 0) + setBonus.rangeBonus;
    const relicShred =
      getArmorGauntletShred(this.relicLv.armor_break_gauntlet ?? 0) + setBonus.armorShred;
    return {
      uid: u.uid,
      unitId: u.unitId,
      name: def?.name ?? u.unitId,
      faction: def?.faction ?? 'orthodox',
      grade: u.grade,
      locked: u.locked,
      starLevel,
      awakenCost: getUnitAwakenCost(gradeDef?.rank ?? 1, starLevel),
      sellCoin: this.getUnitSellCoin(def?.sellCoin ?? 10),
      sellLuck: refundSpec.guaranteedLuck,
      sellLuckChancePct: refundSpec.chancePct,
      baseAtk,
      bonusAtk,
      range: (def?.range ?? 150) + harmonyRange + rangeMirrorBonus,
      skillName: def?.skill.name ?? '기본 초식',
      armorShred:
        (def?.armorShred ?? 0) + crusherShred + trialShred + relicShred + benchPassives.armorShred,
      supportAura: def?.supportAura,
      passiveTrait: def?.passiveTrait,
      benchPassive: def?.benchPassive,
      tileBuffAtkPct: tileBuff.atkPct,
      tileBuffSpeedPct: tileBuff.speedPct,
      sealed: isField ? this.isFieldSlotSealed(u.slot.index) : false,
      hazardWarning: isField ? this.isFieldSlotWarning(u.slot.index) : false,
    };
  }

  public exportRunSave(savedAtMs = 0): RunSaveData {
    return {
      version: RUN_SAVE_SCHEMA_VERSION,
      savedAtMs,
      difficulty: this.difficulty,
      trialId: this.trialId,
      runMode: this.runMode,
      dailyDateKey: this.dailyChallengeSpec?.dateKey ?? null,
      endlessMilestonesReached: [...this.endlessMilestonesReached].sort((a, b) => a - b),
      currentTick: this.currentTick,
      rngState: this.rng.getState(),
      nextUid: this.nextUid,
      nextMonsterId: this.nextMonsterId,
      nextProjectileId: this.nextProjectileId,
      gambleSeq: this.gambleSeq,
      gambleWins: this.gambleWins,
      awakenCount: this.awakenCount,
      coin: this.coin,
      luckStone: this.luckStone,
      summonCount: this.summonCount,
      wisps: { ...this.wisps },
      upgradeLv: { ...this.upgradeLv },
      relicLv: { ...this.relicLv },
      activeBoons: { ...this.activeBoons },
      boonOfferSeq: this.boonOfferSeq,
      pendingBoonOffers: this.pendingBoonOffers.map((o) => ({
        seq: o.seq,
        wave: o.wave,
        options: [...o.options],
        rerollsUsed: o.rerollsUsed ?? 0,
      })),
      contractOfferSeq: this.contractOfferSeq,
      pendingContractOffer: this.pendingContractOffer
        ? {
            seq: this.pendingContractOffer.seq,
            wave: this.pendingContractOffer.wave,
            options: [...this.pendingContractOffer.options],
          }
        : null,
      queuedContractOfferWaves: [...this.queuedContractOfferWaves],
      activeContracts: this.activeContracts.map((c) => ({ ...c })),
      preserveBenchPassives: this.preserveBenchPassives,
      bossRetryUsed: this.bossRetryUsed,
      comboCooldowns: Object.fromEntries(this.comboCooldowns),
      comboTriggerCounts: Object.fromEntries(this.comboTriggerCounts),
      appliedStartCoinBonus: this.appliedStartCoinBonus,
      appliedStartLuckBonus: this.appliedStartLuckBonus,
      appliedStartWisps: { ...this.appliedStartWisps },
      lastWaveInterest: this.lastWaveInterest,
      pilferedCoinTotal: this.pilferedCoinTotal,
      monstersSlain: this.monstersSlain,
      bossesSlain: this.bossesSlain,
      bountiesCalled: this.bountiesCalled,
      bountiesSlain: this.bountiesSlain,
      bountyReadyTick: this.bountyReadyTick,
      completedMissions: [...this.completedMissions],
      damageByUnit: [...this.damageByUnit.entries()],
      totalDamageDealt: this.totalDamageDealt,
      lastGambleResult: this.lastGambleResult ? { ...this.lastGambleResult } : null,
      waveNumber: this.waveNumber,
      waveTicksLeft: this.waveTicksLeft,
      spawnedInWave: this.spawnedInWave,
      nextSpawnTick: this.nextSpawnTick,
      gameOver: this.gameOver,
      gameOverReason: this.gameOverReason,
      victoryAchieved: this.victoryAchieved,
      victoryHold: this.victoryHold,
      endlessMode: this.endlessMode,
      units: this.units.map((u) => ({
        ...u,
        slot: { ...u.slot },
      })),
      monsters: this.monsters.map((m) => ({ ...m })),
      projectiles: this.projectiles.map((p) => ({ ...p })),
      tileHazards: this.tileHazards.map((h) => ({ ...h })),
    };
  }

  public restoreRunSave(rawSave: unknown): boolean {
    const mig = migrateRunSave(rawSave, this.data);
    const save = mig.save;
    if (!save) return false;
    if (
      save.difficulty !== this.difficulty ||
      (save.trialId ?? null) !== this.trialId ||
      (save.runMode ?? 'standard') !== this.runMode ||
      (save.dailyDateKey ?? null) !== (this.dailyChallengeSpec?.dateKey ?? null)
    ) {
      return false;
    }

    this.endlessMilestonesReached.clear();
    if (Array.isArray(save.endlessMilestonesReached)) {
      for (const w of save.endlessMilestonesReached) {
        if (typeof w === 'number' && Number.isFinite(w) && w > 0) {
          this.endlessMilestonesReached.add(Math.floor(w));
        }
      }
    }
    this.comboCooldowns.clear();
    if (save.comboCooldowns && typeof save.comboCooldowns === 'object') {
      for (const [k, v] of Object.entries(save.comboCooldowns)) {
        if (COMBO_SKILLS_BY_ID.has(k as ComboSkillId) && typeof v === 'number' && Number.isFinite(v)) {
          this.comboCooldowns.set(k as ComboSkillId, Math.max(0, Math.floor(v)));
        }
      }
    }
    this.comboTriggerCounts.clear();
    if (save.comboTriggerCounts && typeof save.comboTriggerCounts === 'object') {
      for (const [k, v] of Object.entries(save.comboTriggerCounts)) {
        if (COMBO_SKILLS_BY_ID.has(k as ComboSkillId) && typeof v === 'number' && Number.isFinite(v)) {
          this.comboTriggerCounts.set(k as ComboSkillId, Math.max(0, Math.floor(v)));
        }
      }
    }

    this.currentTick = Math.floor(save.currentTick);
    this.rng.setState(save.rngState);
    this.nextUid = Math.max(1, Math.floor(save.nextUid));
    this.nextMonsterId = Math.max(1, Math.floor(save.nextMonsterId));
    this.nextProjectileId = Math.max(1, Math.floor(save.nextProjectileId));
    this.gambleSeq = Math.max(0, Math.floor(save.gambleSeq));
    this.gambleWins = Math.max(0, Math.floor(save.gambleWins));
    this.awakenCount = Math.max(0, Math.floor(save.awakenCount ?? 0));
    this.coin = Math.max(0, Math.floor(save.coin));
    this.luckStone = Math.max(0, Math.floor(save.luckStone));
    this.summonCount = Math.max(0, Math.floor(save.summonCount));

    for (const k of Object.keys(this.wisps)) {
      delete this.wisps[k];
    }
    for (const poolGradeId of Object.keys(this.data.wispPools)) {
      this.wisps[poolGradeId] = 0;
    }
    for (const [g, c] of Object.entries(save.wisps ?? {})) {
      if (typeof c === 'number' && Number.isFinite(c) && c >= 0) {
        this.wisps[g] = Math.floor(c);
      }
    }

    for (const g of UPGRADE_ORDER) {
      const v = save.upgradeLv?.[g];
      this.upgradeLv[g] = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
    }

    for (const rid of RELIC_IDS_ORDERED) {
      const v = save.relicLv?.[rid];
      this.relicLv[rid] = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
    }

    for (const bid of BOON_IDS_ORDERED) {
      const v = save.activeBoons?.[bid];
      this.activeBoons[bid] = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
    }

    this.boonOfferSeq = Math.max(0, Math.floor(save.boonOfferSeq));
    this.pendingBoonOffers.length = 0;
    if (Array.isArray(save.pendingBoonOffers)) {
      for (const o of save.pendingBoonOffers) {
        this.pendingBoonOffers.push({
          seq: o.seq,
          wave: o.wave,
          options: [...o.options],
          rerollsUsed: typeof o.rerollsUsed === 'number' ? Math.max(0, Math.floor(o.rerollsUsed)) : 0,
        });
      }
    }

    this.contractOfferSeq = Math.max(0, Math.floor(save.contractOfferSeq ?? 0));
    this.pendingContractOffer = save.pendingContractOffer
      ? {
          seq: save.pendingContractOffer.seq,
          wave: save.pendingContractOffer.wave,
          options: [...save.pendingContractOffer.options],
        }
      : null;
    this.queuedContractOfferWaves.length = 0;
    if (Array.isArray(save.queuedContractOfferWaves)) {
      for (const w of save.queuedContractOfferWaves) {
        if (typeof w === 'number' && Number.isFinite(w) && w > 0) {
          this.queuedContractOfferWaves.push(Math.floor(w));
        }
      }
    }
    this.activeContracts.length = 0;
    if (Array.isArray(save.activeContracts)) {
      for (const c of save.activeContracts) {
        if (CONTRACTS_BY_ID.has(c.contractId)) {
          this.activeContracts.push({ ...c });
        }
      }
    }
    this.preserveBenchPassives = save.preserveBenchPassives !== false;
    this.bossRetryUsed = Boolean(save.bossRetryUsed);

    this.appliedStartCoinBonus = Math.max(0, Math.floor(save.appliedStartCoinBonus ?? 0));
    this.appliedStartLuckBonus = Math.max(0, Math.floor(save.appliedStartLuckBonus ?? 0));
    for (const k of Object.keys(this.appliedStartWisps)) {
      delete this.appliedStartWisps[k];
    }
    for (const [gId, cnt] of Object.entries(save.appliedStartWisps ?? {})) {
      if (typeof cnt === 'number' && Number.isFinite(cnt) && cnt > 0) {
        this.appliedStartWisps[gId] = Math.floor(cnt);
      }
    }

    this.lastWaveInterest = Math.max(0, Math.floor(save.lastWaveInterest ?? 0));
    this.pilferedCoinTotal = Math.max(0, Math.floor(save.pilferedCoinTotal ?? 0));
    this.monstersSlain = Math.max(0, Math.floor(save.monstersSlain ?? 0));
    this.bossesSlain = Math.max(0, Math.floor(save.bossesSlain ?? 0));
    this.bountiesCalled = Math.max(0, Math.floor(save.bountiesCalled ?? 0));
    this.bountiesSlain = Math.max(0, Math.floor(save.bountiesSlain ?? 0));
    this.bountyReadyTick = Math.max(0, Math.floor(save.bountyReadyTick ?? 0));

    this.completedMissions.clear();
    if (Array.isArray(save.completedMissions)) {
      for (const mId of save.completedMissions) {
        this.completedMissions.add(mId);
      }
    }

    this.damageByUnit.clear();
    if (Array.isArray(save.damageByUnit)) {
      for (const [uid, dmg] of save.damageByUnit) {
        if (typeof uid === 'string' && typeof dmg === 'number' && dmg > 0) {
          this.damageByUnit.set(uid, dmg);
        }
      }
    }
    this.totalDamageDealt = Math.max(0, Math.floor(save.totalDamageDealt ?? 0));
    this.lastGambleResult = save.lastGambleResult ? { ...save.lastGambleResult } : null;

    this.waveNumber = Math.max(1, Math.floor(save.waveNumber));
    this.waveTicksLeft = Math.max(1, Math.floor(save.waveTicksLeft));
    this.spawnedInWave = Math.max(0, Math.floor(save.spawnedInWave));
    this.nextSpawnTick = Math.max(0, Math.floor(save.nextSpawnTick));
    this.gameOver = Boolean(save.gameOver);
    this.gameOverReason = save.gameOverReason === 'boss_timeout' ? 'boss_timeout' : 'overrun';
    this.victoryAchieved = Boolean(save.victoryAchieved);
    this.victoryHold = Boolean(save.victoryHold);
    this.endlessMode = Boolean(save.endlessMode);

    // Clear and rebuild board + inventoryIndex + craftIndex + wispSystem deterministically
    for (let i = 0; i < this.board.field.capacity; i++) {
      this.board.setUid({ area: 'field', index: i }, null);
    }
    for (let i = 0; i < this.board.bench.capacity; i++) {
      this.board.setUid({ area: 'bench', index: i }, null);
    }
    this.units.length = 0;
    this.unitsByUid.clear();
    this.inventoryIndex.clear();

    for (let i = 0; i < save.units.length; i++) {
      const src = save.units[i]!;
      const clone: UnitEntity = {
        ...src,
        starLevel:
          typeof src.starLevel === 'number'
            ? Math.max(0, Math.min(MAX_UNIT_STAR_LEVEL, Math.floor(src.starLevel)))
            : 0,
        slot: { area: src.slot.area, index: src.slot.index },
        attackDirX: typeof src.attackDirX === 'number' ? src.attackDirX : 0,
        attackDirY: typeof src.attackDirY === 'number' ? src.attackDirY : 1,
      };
      this.units.push(clone);
      this.unitsByUid.set(clone.uid, clone);
      this.board.setUid(clone.slot, clone.uid);
      this.inventoryIndex.addUnit(clone.uid, clone.unitId, clone.slot, clone.locked);
    }
    this.inventoryIndex.consumeDelta();
    this.craftIndex.rebuildAll(this.inventoryIndex);
    this.wispSystem.recomputeHintsIfOwned(this.wisps, this.inventoryIndex);

    this.monsters.length = 0;
    for (let i = 0; i < save.monsters.length; i++) {
      this.monsters.push({ ...save.monsters[i]! });
    }

    this.projectiles.length = 0;
    if (Array.isArray(save.projectiles)) {
      for (let i = 0; i < save.projectiles.length; i++) {
        this.projectiles.push({ ...save.projectiles[i]! });
      }
    }

    this.tileHazards.length = 0;
    if (Array.isArray(save.tileHazards)) {
      for (let i = 0; i < save.tileHazards.length; i++) {
        this.tileHazards.push({ ...save.tileHazards[i]! });
      }
    }

    this.pendingRejects.length = 0;
    this.priorityDirty = true;
    return true;
  }

  /**
   * Deterministic state digest verifying 1x vs 3x equivalence (AGENTS.md §9).
   */
  public hashState(): string {
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;

    const feedInt = (v: number): void => {
      const n = v | 0;
      h1 ^= n & 0xff;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
      h1 ^= (n >>> 8) & 0xff;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
      h1 ^= (n >>> 16) & 0xff;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
      h1 ^= (n >>> 24) & 0xff;
      h1 = Math.imul(h1, 0x01000193) >>> 0;

      h2 ^= n;
      h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
    };

    const feedStr = (s: string): void => {
      for (let i = 0; i < s.length; i++) {
        feedInt(s.charCodeAt(i));
      }
    };

    feedInt(this.currentTick);
    feedStr(this.trialId ?? 'std');
    feedInt(this.rng.getState());
    feedInt(this.coin);
    feedInt(this.luckStone);
    feedInt(this.summonCount);
    feedInt(this.waveNumber);
    feedInt(this.waveTicksLeft);
    feedInt(this.gameOver ? 1 : 0);
    feedInt(this.victoryAchieved ? 1 : 0);
    feedInt(this.victoryHold ? 1 : 0);
    feedInt(this.endlessMode ? 1 : 0);
    feedInt(this.monstersSlain);
    feedInt(this.bossesSlain);
    feedInt(this.bountiesCalled);
    feedInt(this.bountiesSlain);
    feedInt(this.bountyReadyTick);
    feedInt(this.gambleWins);
    feedInt(this.completedMissions.size);
    feedInt(this.totalDamageDealt);
    feedInt(this.boonOfferSeq);
    feedInt(this.pendingBoonOffers.length);

    for (let i = 0; i < this.pendingBoonOffers.length; i++) {
      const off = this.pendingBoonOffers[i]!;
      feedInt(off.seq);
      feedInt(off.wave);
      for (let j = 0; j < off.options.length; j++) {
        feedStr(off.options[j]!);
      }
    }

    for (const g of UPGRADE_ORDER) {
      feedInt(this.upgradeLv[g] ?? 0);
    }

    for (const rid of RELIC_IDS_ORDERED) {
      feedInt(this.relicLv[rid] ?? 0);
    }

    for (const bid of BOON_IDS_ORDERED) {
      feedInt(this.activeBoons[bid] ?? 0);
    }

    feedInt(this.tileHazards.length);
    for (let i = 0; i < this.tileHazards.length; i++) {
      const h = this.tileHazards[i]!;
      feedInt(h.fieldIndex);
      feedInt(h.activateTick);
      feedInt(h.expireTick);
    }

    for (let i = 0; i < this.board.field.capacity; i++) {
      feedInt(this.board.field.getUidAt(i) ?? -1);
    }
    for (let i = 0; i < this.board.bench.capacity; i++) {
      feedInt(this.board.bench.getUidAt(i) ?? -1);
    }

    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i]!;
      feedInt(u.uid);
      feedStr(u.unitId);
      feedInt(u.slot.area === 'field' ? 1 : 2);
      feedInt(u.slot.index);
      feedInt(u.locked ? 1 : 0);
      feedInt(u.cooldownTicks);
      feedInt(u.attackCount);
      feedInt(Math.round(u.currX * 100));
      feedInt(Math.round(u.currY * 100));
    }

    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i]!;
      feedInt(m.entityId);
      feedInt(m.hp);
      feedInt(m.armor);
      feedInt(m.armorShred);
      feedInt(m.shredExpireTick);
      feedInt(m.shieldHp);
      feedInt(m.shieldExpireTick);
      feedInt(m.hasteUntilTick);
      feedInt(m.nextBossSkillTick);
      feedInt(m.phaseTriggered ? 1 : 0);
      feedInt(m.stunUntilTick);
      feedInt(m.slowUntilTick);
      feedInt(Math.round(m.currDistance * 1000));
    }

    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i]!;
      feedInt(p.id);
      feedInt(p.arriveTick);
      feedInt(p.targetEntityId);
      feedInt(p.damage);
      feedInt(p.armorShred);
      feedInt(p.isSkill ? 1 : 0);
      feedInt(p.isCrit ? 1 : 0);
    }

    const craftView = this.craftIndex.getView();
    feedInt(craftView.readyCount);
    feedInt(craftView.chainReadyCount);

    return `${h1.toString(16).padStart(8, '0')}-${h2.toString(16).padStart(8, '0')}`;
  }
}
