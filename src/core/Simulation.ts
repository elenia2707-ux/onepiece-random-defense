import {
  CommandQueue,
  type GameCommand,
  type SlotRef,
  type StampedCommand,
} from './CommandQueue';
import { EventBus } from './EventBus';
import {
  CLEAR_TARGET_WAVE,
  DIFFICULTY_CONFIGS,
  getBanditPilferCoin,
  getBanditProcPer1000,
  getFurnaceChanceBonusPct,
  getFurnaceRefundPct,
  getJadeSealStartCoin,
  getScrollChestBossLuckBonus,
  getScrollChestStartWisps,
  getVaultInterestCap,
  getVaultInterestPct,
  getWealthBonusBps,
  RELIC_IDS_ORDERED,
} from './relicFormulas';
import { Rng } from './Rng';
import type { Speed } from './time';
import { CraftIndex, type CraftView } from '../craft/CraftIndex';
import { CraftSystem } from '../craft/CraftSystem';
import { InventoryIndex } from '../craft/InventoryIndex';
import { RecipeGraph } from '../craft/RecipeGraph';
import { type WispHint, WispSystem } from '../craft/WispSystem';
import type {
  BoonId,
  DifficultyId,
  FactionId,
  GameDataBundle,
  GameOverReason,
  GradeDef,
  GradeId,
  MissionDef,
  MonsterKind,
  RelicId,
  SupportAuraDef,
  UnitId,
  UpgradeGroupId,
  Vec2,
  VfxTrackKind,
  WaveDef,
  WaveMutantKind,
} from '../data/types';
import { Board } from '../world/Board';
import { LoopPath } from '../world/Path';
import type { MonsterEntity, ProjectileEntity, TileHazard, UnitEntity } from '../world/entities';

export const BOUNTY_COOLDOWN_TICKS = 1350; // 45s
export const BOUNTY_DURATION_TICKS = 900; // 30s
export const HAZARD_WARNING_TICKS = 60; // 2.0s telegraph warning
export const HAZARD_SEAL_TICKS = 135; // 4.5s active seal duration

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
];

export interface WaveMutantMeta {
  readonly kind: WaveMutantKind;
  readonly name: string;
  readonly badge: string;
  readonly desc: string;
  readonly hpMult: number;
  readonly speedMult: number;
  readonly countMult: number;
  readonly intervalMult: number;
  readonly bonusArmor: number;
  readonly bonusCoin: number;
}

export const WAVE_MUTANT_META: Readonly<Record<WaveMutantKind, WaveMutantMeta>> = {
  swift_raid: {
    kind: 'swift_raid',
    name: '경공 야습단',
    badge: '⚡ 경공야습',
    desc: '이동속도 +28% · 체력 -20% · 은자 +1',
    hpMult: 0.8,
    speedMult: 1.28,
    countMult: 1.0,
    intervalMult: 0.9,
    bonusArmor: 0,
    bonusCoin: 1,
  },
  iron_wall: {
    kind: 'iron_wall',
    name: '철갑 중장병',
    badge: '🛡 철갑중장',
    desc: '호신강기 +22 · 체력 +35% · 소수정예 · 은자 +4',
    hpMult: 1.35,
    speedMult: 0.88,
    countMult: 0.65,
    intervalMult: 1.25,
    bonusArmor: 22,
    bonusCoin: 4,
  },
  blood_swarm: {
    kind: 'blood_swarm',
    name: '혈해 인해전술',
    badge: '🩸 인해전술',
    desc: '마물 머릿수 +35% · 체력 -18%',
    hpMult: 0.82,
    speedMult: 1.05,
    countMult: 1.35,
    intervalMult: 0.75,
    bonusArmor: 0,
    bonusCoin: 0,
  },
};

export function getWaveMutantKind(waveNum: number, isBoss: boolean): WaveMutantKind | null {
  if (isBoss || waveNum < 6) return null;
  const rem = waveNum % 5;
  if (rem !== 2 && rem !== 4) return null;
  const cycleIdx = (Math.floor(waveNum / 5) + (rem === 4 ? 1 : 0)) % 3;
  if (cycleIdx === 0) return 'iron_wall';
  if (cycleIdx === 1) return 'swift_raid';
  return 'blood_swarm';
}

export type BossSkillKind =
  | 'tiger_roar'
  | 'tiger_sprint'
  | 'serpent_shell'
  | 'serpent_heal'
  | 'serpent_shatter'
  | 'patriarch_telegraph'
  | 'patriarch_seal'
  | 'patriarch_summon';

const BOUNTY_ROSTER: readonly {
  readonly name: string;
  readonly kind: MonsterKind;
  readonly radius: number;
}[] = [
  { name: '현상수배 · 만독귀 사마현', kind: 'blood_zealot', radius: 24 },
  { name: '현상수배 · 철혈마도 악무극', kind: 'jiangshi', radius: 25 },
  { name: '현상수배 · 흑살령주 혈무영', kind: 'blood_patriarch', radius: 26 },
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
    readonly x: number;
    readonly y: number;
    readonly damage: number;
    readonly color: string;
    readonly slain: boolean;
    readonly isCrit: boolean;
    readonly isSkill: boolean;
    readonly armorBroken: boolean;
    readonly justShattered: boolean;
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
    readonly pos: Vec2;
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
  'bounty:called': {
    readonly bossName: string;
    readonly rewardCoin: number;
    readonly rewardLuck: number;
    readonly tick: number;
  };
  'bounty:slain': {
    readonly bossName: string;
    readonly rewardCoin: number;
    readonly rewardLuck: number;
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
    readonly tick: number;
  };
  'command:rejected': {
    readonly cmd: GameCommand['type'];
    readonly reason: string;
    readonly tick: number;
  };
}

export interface TileAuraBuff {
  readonly atkPct: number;
  readonly speedPct: number;
}

export interface SlotView {
  readonly uid: number;
  readonly unitId: UnitId;
  readonly name: string;
  readonly faction: FactionId;
  readonly grade: GradeId;
  readonly locked: boolean;
  readonly sellCoin: number;
  readonly baseAtk: number;
  readonly bonusAtk: number;
  readonly range: number;
  readonly skillName: string;
  readonly armorShred: number;
  readonly supportAura?: SupportAuraDef;
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

export interface FactionSynergySnapshot {
  readonly counts: Readonly<Record<FactionId, number>>;
  readonly orthodoxTier: 0 | 1 | 2;
  readonly unorthodoxTier: 0 | 1 | 2;
  readonly demonicTier: 0 | 1 | 2;
  readonly trinityActive: boolean;
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
}

export interface UISnapshot {
  readonly tick: number;
  readonly speed: Speed;
  readonly paused: boolean;
  readonly difficulty: DifficultyId;
  readonly gameOver: boolean;
  readonly gameOverReason: GameOverReason;
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
  readonly missions: readonly MissionItemSnapshot[];
  readonly missionsCompletedCount: number;
  readonly damageMeter: {
    readonly totalDamage: number;
    readonly entries: readonly DamageEntrySnapshot[];
  };
  readonly monsterCount: number;
  readonly monsterCap: number;
  readonly monstersSlain: number;
  readonly bossesSlain: number;
  readonly coin: number;
  readonly luckStone: number;
  readonly summonCost: number;
  readonly wisps: Readonly<Record<GradeId, number>>;
  readonly upgradeLv: Readonly<Record<UpgradeGroupId, number>>;
  readonly relics: Readonly<Record<RelicId, number>>;
  readonly relicBonus: RelicBonusSnapshot;
  readonly synergy: FactionSynergySnapshot;
  readonly lastGambleResult: GambleResultSnapshot | null;
  readonly field: readonly (SlotView | null)[];
  readonly bench: readonly (SlotView | null)[];
  readonly fieldOccupied: number;
  readonly benchOccupied: number;
  readonly craft: CraftView;
  readonly wispHints: Partial<Record<GradeId, readonly WispHint[]>>;
  readonly rejects: readonly RejectNotice[];
}

const UPGRADE_ORDER: readonly UpgradeGroupId[] = ['orthodox', 'unorthodox', 'demonic'];

export class Simulation {
  public readonly data: GameDataBundle;
  public readonly difficulty: DifficultyId;
  public readonly events = new EventBus<SimEventMap>();
  public readonly commands = new CommandQueue();
  public readonly board: Board;
  public readonly path: LoopPath;
  public readonly recipeGraph: RecipeGraph;
  public readonly inventoryIndex = new InventoryIndex();
  public readonly craftIndex: CraftIndex;
  public readonly craftSystem: CraftSystem;
  public readonly wispSystem: WispSystem;

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

  private readonly units: UnitEntity[] = [];
  private readonly unitsByUid = new Map<number, UnitEntity>();
  private readonly monsters: MonsterEntity[] = [];
  private readonly projectiles: ProjectileEntity[] = [];
  private readonly tileHazards: TileHazard[] = [];

  private coin: number;
  private luckStone: number;
  private summonCount = 0;
  private readonly wisps: Record<GradeId, number> = {
    common: 2,
    uncommon: 1,
    rare: 0,
  };
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
  };
  private boonOfferSeq = 0;
  private readonly pendingBoonOffers: BoonOfferSnapshot[] = [];
  private appliedStartCoinBonus = 0;
  private appliedStartCommonWisp = 0;
  private appliedStartUncommonWisp = 0;
  private lastWaveInterest = 0;
  private pilferedCoinTotal = 0;
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
  ) {
    this.data = data;
    this.difficulty = difficulty;
    this.rng = new Rng(seed);
    this.board = new Board(data.board);
    this.path = new LoopPath(data.board.path.waypoints);
    this.recipeGraph = new RecipeGraph(data.units, data.gradesById, data.recipes);
    this.craftIndex = new CraftIndex(this.recipeGraph, data.unitsById);
    this.craftSystem = new CraftSystem(this.recipeGraph);
    this.wispSystem = new WispSystem(data.wispPools, this.recipeGraph);

    this.coin = data.board.economy.initialCoin;
    this.luckStone = data.board.economy.initialLuckStone;
    this.waveTicksLeft = data.waves[0]?.durationTicks ?? 840;

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
        const maxLv = this.data.relicsById.get(id)?.maxLevel ?? 10;
        this.relicLv[id] = Math.max(0, Math.min(maxLv, Math.floor(raw)));
      }
    }

    const targetCoinBonus = getJadeSealStartCoin(this.relicLv.founding_jade_seal);
    if (targetCoinBonus > this.appliedStartCoinBonus) {
      this.coin += targetCoinBonus - this.appliedStartCoinBonus;
      this.appliedStartCoinBonus = targetCoinBonus;
    }

    const targetWisps = getScrollChestStartWisps(this.relicLv.heavenly_scroll_chest);
    let wispChanged = false;
    if (targetWisps.common > this.appliedStartCommonWisp) {
      this.wisps.common =
        (this.wisps.common ?? 0) + (targetWisps.common - this.appliedStartCommonWisp);
      this.appliedStartCommonWisp = targetWisps.common;
      wispChanged = true;
    }
    if (targetWisps.uncommon > this.appliedStartUncommonWisp) {
      this.wisps.uncommon =
        (this.wisps.uncommon ?? 0) + (targetWisps.uncommon - this.appliedStartUncommonWisp);
      this.appliedStartUncommonWisp = targetWisps.uncommon;
      wispChanged = true;
    }
    if (wispChanged && recomputeHints) {
      this.wispSystem.recomputeHintsIfOwned(this.wisps, this.inventoryIndex);
    }
    this.priorityDirty = true;
  }

  public get tickCount(): number {
    return this.currentTick;
  }

  public get isGameOver(): boolean {
    return this.gameOver;
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

  public getEffectiveInterestConfig(): { readonly pct: number; readonly cap: number } {
    const usuryStacks = this.getBoonStacks('b_usury_vault');
    const basePct = getVaultInterestPct(this.relicLv.golden_vault);
    const pct = basePct + usuryStacks * 3;
    if (pct <= 0) {
      return { pct: 0, cap: 0 };
    }
    const baseCap =
      this.relicLv.golden_vault > 0 ? getVaultInterestCap(this.relicLv.golden_vault) : 120;
    return {
      pct,
      cap: baseCap + usuryStacks * 60,
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
    return (
      getFurnaceChanceBonusPct(this.relicLv.immortal_furnace) +
      this.getBoonStacks('b_elixir_jackpot') * 12
    );
  }

  public getSummonCost(): number {
    const econ = this.data.board.economy;
    return econ.baseSummonCost + this.summonCount * econ.summonCostStep;
  }

  public getUpgradeCost(groupId: UpgradeGroupId): number {
    const def = this.data.upgrades.find((u) => u.id === groupId);
    if (!def) return 999;
    const lv = this.upgradeLv[groupId] ?? 0;
    const raw = def.baseCost + lv * def.costStep;
    const harmonyStacks = this.getBoonStacks('b_trinity_harmony');
    if (harmonyStacks <= 0) return raw;
    return Math.max(1, Math.round(raw * Math.max(0.5, 1 - 0.25 * harmonyStacks)));
  }

  public computeFieldSynergy(): FactionSynergySnapshot {
    let orthodox = 0;
    let unorthodox = 0;
    let demonic = 0;

    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i]!;
      if (u.slot.area !== 'field') continue;
      const def = this.data.unitsById.get(u.unitId);
      if (!def) continue;
      if (def.faction === 'orthodox') orthodox++;
      else if (def.faction === 'unorthodox') unorthodox++;
      else if (def.faction === 'demonic') demonic++;
    }

    const orthodoxTier: 0 | 1 | 2 = orthodox >= 6 ? 2 : orthodox >= 3 ? 1 : 0;
    const unorthodoxTier: 0 | 1 | 2 = unorthodox >= 6 ? 2 : unorthodox >= 3 ? 1 : 0;
    const demonicTier: 0 | 1 | 2 = demonic >= 6 ? 2 : demonic >= 3 ? 1 : 0;
    const trinityActive = orthodox >= 2 && unorthodox >= 2 && demonic >= 2;

    return {
      counts: { orthodox, unorthodox, demonic },
      orthodoxTier,
      unorthodoxTier,
      demonicTier,
      trinityActive,
    };
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
    const cap = this.board.field.capacity;
    const cols = this.board.config.field.cols;
    const rows = this.board.config.field.rows;
    const out: TileAuraBuff[] = new Array<TileAuraBuff>(cap);
    const swiftStacks = this.getBoonStacks('b_swift_formation');
    const auraMult = 1 + 0.5 * swiftStacks;
    const atkCap = 65 + 25 * swiftStacks;
    const speedCap = 45 + 20 * swiftStacks;

    for (let idx = 0; idx < cap; idx++) {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      let atkPct = 0;
      let speedPct = 0;

      const checkNeighbor = (nIdx: number): void => {
        const nUid = this.board.field.getUidAt(nIdx);
        if (nUid === null) return;
        const nUnit = this.unitsByUid.get(nUid);
        if (!nUnit) return;
        const nDef = this.data.unitsById.get(nUnit.unitId);
        if (!nDef?.supportAura) return;
        atkPct += Math.round(nDef.supportAura.atkPct * auraMult);
        speedPct += Math.round(nDef.supportAura.speedPct * auraMult);
      };

      if (col > 0) checkNeighbor(idx - 1);
      if (col < cols - 1) checkNeighbor(idx + 1);
      if (row > 0) checkNeighbor(idx - cols);
      if (row < rows - 1) checkNeighbor(idx + cols);

      out[idx] = {
        atkPct: Math.min(atkCap, atkPct),
        speedPct: Math.min(speedCap, speedPct),
      };
    }
    return out;
  }

  public computeMonsterArmor(waveNum: number, isBoss: boolean, isBounty: boolean): number {
    if (waveNum <= 2 && !isBounty) {
      return 0;
    }
    const mutantKind = !isBoss && !isBounty ? getWaveMutantKind(waveNum, false) : null;
    const mutantArmor = mutantKind ? WAVE_MUTANT_META[mutantKind].bonusArmor : 0;
    const base =
      Math.max(0, waveNum - 2) * 2.6 +
      (isBoss && !isBounty ? 18 : 0) +
      (isBounty ? 12 : 0) +
      mutantArmor;
    return Math.min(140, Math.round(base));
  }

  public getUnitEffectiveAtk(
    unitId: UnitId,
    precomputedSynergy?: FactionSynergySnapshot,
    tileBuffAtkPct = 0,
  ): { readonly baseAtk: number; readonly bonusAtk: number } {
    const def = this.data.unitsById.get(unitId);
    if (!def) return { baseAtk: 0, bonusAtk: 0 };
    const upDef = this.data.upgradesByFaction.get(def.faction);
    const lv = upDef ? (this.upgradeLv[upDef.id] ?? 0) : 0;
    const upPct = upDef && lv > 0 ? lv * upDef.atkBonusPctPerLv : 0;

    const syn = precomputedSynergy ?? this.computeFieldSynergy();
    let synPct = syn.trinityActive ? 18 : 0;
    if (def.faction === 'orthodox' && syn.orthodoxTier === 2) {
      synPct += 20;
    } else if (def.faction === 'unorthodox' && syn.unorthodoxTier === 2) {
      synPct += 20;
    } else if (def.faction === 'demonic' && syn.demonicTier === 2) {
      synPct += 25;
    }

    let boonPct = this.getBoonStacks('b_trinity_harmony') * 22;
    if (def.faction === 'demonic') {
      boonPct += this.getBoonStacks('b_demonic_overdrive') * 35;
    }

    const traitPct = upPct + synPct + boonPct + Math.max(0, tileBuffAtkPct);
    const wealthBps = this.getEffectiveWealthBps();
    if (traitPct <= 0 && wealthBps <= 0) {
      return { baseAtk: def.atk, bonusAtk: 0 };
    }
    if (wealthBps <= 0) {
      const bonusAtk = Math.round((def.atk * traitPct) / 100);
      return { baseAtk: def.atk, bonusAtk };
    }
    const effectiveTotal = Math.round(
      (def.atk * (100 + traitPct) * (10000 + wealthBps)) / 1_000_000,
    );
    return { baseAtk: def.atk, bonusAtk: Math.max(0, effectiveTotal - def.atk) };
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
      // 2. Wave & Spawn progression
      this.stepWaveAndSpawn();

      // 3. Monster path movement & boss pattern execution
      if (!this.gameOver && !this.victoryHold) {
        this.stepMonsters();
      }

      // 4. Field unit auto-combat & projectiles
      if (!this.gameOver && !this.victoryHold) {
        this.stepCombat();
      }
    }

    // 5. Delta craft & wisp indexing
    const deltaUnits = this.inventoryIndex.consumeDelta();
    if (deltaUnits.length > 0) {
      this.craftIndex.applyDelta(deltaUnits, this.inventoryIndex);
      this.wispSystem.recomputeHintsIfOwned(this.wisps, this.inventoryIndex);
      this.priorityDirty = true;
    }

    // 6. Deterministic in-run mission evaluation (강호 의뢰)
    if (!this.gameOver) {
      this.evaluateMissions();
    }

    this.currentTick++;
  }

  private applyCommand(cmd: GameCommand): void {
    if (cmd.type === 'syncRelics') {
      this.syncRelicsInternal(cmd.relics, true);
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
      this.offerBossBoons(CLEAR_TARGET_WAVE);
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

        // Immediate one-shot resource grants on pickup
        if (cmd.boonId === 'b_elixir_jackpot') {
          this.luckStone += 6;
        } else if (cmd.boonId === 'b_heavenly_reinforce') {
          this.wisps.rare = (this.wisps.rare ?? 0) + 1;
          this.wisps.uncommon = (this.wisps.uncommon ?? 0) + 1;
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
        const curLv = this.upgradeLv[cmd.group] ?? 0;
        if (curLv >= upDef.maxLevel) {
          this.reject('upgrade', '이미 내공 극의(최대 단계)에 도달했습니다.');
          return;
        }
        const cost = this.getUpgradeCost(cmd.group);
        if (upDef.currency === 'coin') {
          if (this.coin < cost) {
            this.reject('upgrade', `은자가 부족합니다 (${cost} 필요)`);
            return;
          }
          this.coin -= cost;
        } else {
          if (this.luckStone < cost) {
            this.reject('upgrade', `영단이 부족합니다 (${cost}개 필요)`);
            return;
          }
          this.luckStone -= cost;
        }
        const nextLv = curLv + 1;
        this.upgradeLv[cmd.group] = nextLv;
        this.events.emit('upgrade:done', {
          group: cmd.group,
          level: nextLv,
          tick: this.currentTick,
        });
        this.priorityDirty = true;
        return;
      }

      case 'callBounty': {
        if (this.victoryHold) {
          this.reject('callBounty', '먼저 천하통일 정산 선택을 완료해 주세요.');
          return;
        }
        if (this.waveNumber < 2) {
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

        const spec = BOUNTY_ROSTER[this.bountiesCalled % BOUNTY_ROSTER.length]!;
        const diffCfg = DIFFICULTY_CONFIGS[this.difficulty];
        const bountyHp = Math.round(
          (950 + Math.pow(this.waveNumber, 1.82) * 92) * diffCfg.hpMult,
        );
        const rewardCoin = 55 + this.waveNumber * 12;
        const rewardLuck = this.waveNumber >= 12 ? 3 : 2;
        const startPos = this.path.sample(0);

        const outlaw: MonsterEntity = {
          entityId: this.nextMonsterId++,
          kind: spec.kind,
          isBoss: true,
          isBounty: true,
          expireTick: this.currentTick + BOUNTY_DURATION_TICKS,
          bountyRewardLuck: rewardLuck,
          bossName: spec.name,
          hp: bountyHp,
          maxHp: bountyHp,
          armor: this.computeMonsterArmor(this.waveNumber, false, true),
          armorShred: 0,
          shredExpireTick: 0,
          shieldHp: 0,
          shieldMaxHp: 0,
          shieldExpireTick: 0,
          hasteUntilTick: 0,
          nextBossSkillTick: 999999999,
          phaseTriggered: true,
          speedPerTick: 3.4 * diffCfg.speedMult,
          radius: spec.radius,
          rewardCoin,
          spawnTick: this.currentTick,
          stunUntilTick: 0,
          slowUntilTick: 0,
          slowFactor: 1,
          lastHitTick: -100,
          prevDistance: 0,
          currDistance: 0,
          prevX: startPos.x,
          prevY: startPos.y,
          currX: startPos.x,
          currY: startPos.y,
        };

        this.monsters.push(outlaw);
        this.bountiesCalled++;
        const hunterStacks = this.getBoonStacks('b_bounty_hunter');
        const cdMult = Math.max(0.3, 1 - 0.35 * hunterStacks);
        this.bountyReadyTick = this.currentTick + Math.round(BOUNTY_COOLDOWN_TICKS * cdMult);
        this.priorityDirty = true;

        this.events.emit('bounty:called', {
          bossName: spec.name,
          rewardCoin,
          rewardLuck,
          tick: this.currentTick,
        });
        return;
      }

      case 'autoArrange': {
        this.executeAutoArrange();
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
          this.reject('sell', '하산시킬 협객이 존재하지 않습니다.');
          return;
        }
        if (unit.locked) {
          this.reject('sell', '잠금 상태인 협객은 먼저 잠금을 해제해 주세요.');
          return;
        }
        const def = this.data.unitsById.get(unit.unitId);
        this.removeUnitInternal(cmd.uid);
        this.coin += def ? def.sellCoin : 10;
        this.priorityDirty = true;
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
          removeUnitByUid: (uid) => this.removeUnitInternal(uid),
          spawnCraftedUnit: (unitId, preferredFieldIndex) => {
            const slot = this.board.findPlacementSlot(preferredFieldIndex);
            if (!slot) return null;
            return this.createUnit(unitId, slot, 'craft');
          },
        });

        if (!res.ok) {
          this.reject('craft', res.reason);
          return;
        }
        const outUnit = this.unitsByUid.get(res.outputUid);
        if (outUnit) {
          this.events.emit('craft:done', {
            outputUid: outUnit.uid,
            outputUnitId: outUnit.unitId,
            grade: outUnit.grade,
            pos: { x: outUnit.currX, y: outUnit.currY },
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

  private executeAutoArrange(): void {
    // 0. Evacuate any field units standing on active/telegraphed hazard tiles into safe empty field slots
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

    // 1. Deploy strongest bench units into remaining empty field slots (safe slots first!)
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

    let slotCursor = 0;
    const remainingBench: UnitEntity[] = [];
    for (let i = 0; i < benchUnits.length; i++) {
      const u = benchUnits[i]!;
      if (!u.locked && slotCursor < emptyFieldSlots.length) {
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

    // 2. Compact & sort remaining bench slots cleanly from index 0
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
    }
  }

  private evaluateMissions(): void {
    if (this.completedMissions.size >= this.data.missions.length) return;
    const synergy = this.computeFieldSynergy();

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

  private rollSummonUnit(): UnitId {
    let totalWeight = 0;
    for (let i = 0; i < this.summonableGrades.length; i++) {
      totalWeight += this.summonableGrades[i]!.summonWeight;
    }

    let roll = this.rng.nextInt(Math.max(1, totalWeight));
    let chosenGrade: GradeId = this.summonableGrades[0]?.id ?? 'common';

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
      const fallback = this.unitsByGrade.get('common');
      return fallback?.[0] ?? this.data.units[0]!.id;
    }
    const idx = this.rng.nextInt(pool.length);
    return pool[idx]!;
  }

  private createUnit(
    unitId: UnitId,
    slot: SlotRef,
    source: 'summon' | 'craft' | 'wisp' | 'gamble',
  ): number {
    const def = this.data.unitsById.get(unitId);
    if (!def) {
      throw new Error(`[Simulation] unknown unitId '${unitId}'`);
    }
    const uid = this.nextUid++;
    const center = this.board.getSlotCenter(slot);

    const entity: UnitEntity = {
      uid,
      unitId,
      grade: def.grade,
      slot,
      locked: false,
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

  private getWaveDef(waveNum: number): WaveDef {
    return this.data.waves[(waveNum - 1) % this.data.waves.length] ?? this.data.waves[0]!;
  }

  private computeWaveHpScale(waveNum: number, isBoss: boolean): number {
    const diffMult = DIFFICULTY_CONFIGS[this.difficulty].hpMult;
    if (waveNum <= 15) {
      return diffMult;
    }
    if (waveNum <= CLEAR_TARGET_WAVE) {
      // Escalating second cycle culminating in Wave 30 Grand Demon God
      const step = waveNum - 15; // 1..15
      const cycle2 = 1.45 + step * 0.13 + (waveNum === CLEAR_TARGET_WAVE && isBoss ? 0.55 : 0);
      return cycle2 * diffMult;
    }
    // Endless Bloodbath (Wave 31+): exponential scaling
    const endlessStep = waveNum - CLEAR_TARGET_WAVE;
    return 3.95 * Math.pow(1.135, endlessStep) * diffMult;
  }

  private stepWaveAndSpawn(): void {
    // 0. Check active bounty outlaw 30s escape timer
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i]!;
      if (m.isBounty && m.expireTick !== undefined && this.currentTick >= m.expireTick) {
        const stolenCoin = Math.min(100, Math.floor(this.coin * 0.15));
        this.coin = Math.max(0, this.coin - stolenCoin);
        this.monsters.splice(i, 1);
        this.priorityDirty = true;
        this.events.emit('bounty:escaped', {
          bossName: m.bossName ?? '현상수배범',
          stolenCoin,
          tick: this.currentTick,
        });
      }
    }

    const waveDef = this.getWaveDef(this.waveNumber);
    const mutantKind = getWaveMutantKind(this.waveNumber, waveDef.isBoss);
    const mutantMeta = mutantKind ? WAVE_MUTANT_META[mutantKind] : null;
    const diffCfg = DIFFICULTY_CONFIGS[this.difficulty];
    const hpScale = this.computeWaveHpScale(this.waveNumber, waveDef.isBoss);
    const resolvedBossName =
      this.waveNumber === CLEAR_TARGET_WAVE && waveDef.isBoss
        ? '천마대제 아수라 혈마신'
        : waveDef.bossName;

    const effectiveSpawnCount = mutantMeta
      ? Math.max(4, Math.round(waveDef.spawnCount * mutantMeta.countMult))
      : waveDef.spawnCount;
    const effectiveSpawnInterval = mutantMeta
      ? Math.max(8, Math.round(waveDef.spawnIntervalTicks * mutantMeta.intervalMult))
      : waveDef.spawnIntervalTicks;

    if (this.spawnedInWave < effectiveSpawnCount && this.currentTick >= this.nextSpawnTick) {
      const startPos = this.path.sample(0);
      const hpMult = mutantMeta ? mutantMeta.hpMult : 1;
      const speedMult = mutantMeta ? mutantMeta.speedMult : 1;
      const bonusCoin = mutantMeta ? mutantMeta.bonusCoin : 0;
      const scaledHp = Math.max(1, Math.round(waveDef.monsterHp * hpScale * hpMult));

      const initialSkillDelay = !waveDef.isBoss
        ? 999999999
        : waveDef.monsterKind === 'white_tiger'
          ? 120
          : waveDef.monsterKind === 'black_serpent'
            ? 135
            : 105;

      const monster: MonsterEntity = {
        entityId: this.nextMonsterId++,
        kind: waveDef.monsterKind,
        isBoss: waveDef.isBoss,
        bossName: resolvedBossName,
        hp: scaledHp,
        maxHp: scaledHp,
        armor: this.computeMonsterArmor(this.waveNumber, waveDef.isBoss, false),
        armorShred: 0,
        shredExpireTick: 0,
        shieldHp: 0,
        shieldMaxHp: 0,
        shieldExpireTick: 0,
        hasteUntilTick: 0,
        nextBossSkillTick: this.currentTick + initialSkillDelay,
        phaseTriggered: false,
        speedPerTick: waveDef.monsterSpeedPerTick * diffCfg.speedMult * speedMult,
        radius: waveDef.monsterRadius,
        rewardCoin: waveDef.rewardCoin + bonusCoin,
        spawnTick: this.currentTick,
        stunUntilTick: 0,
        slowUntilTick: 0,
        slowFactor: 1,
        lastHitTick: -100,
        prevDistance: 0,
        currDistance: 0,
        prevX: startPos.x,
        prevY: startPos.y,
        currX: startPos.x,
        currY: startPos.y,
      };
      this.monsters.push(monster);
      this.spawnedInWave++;
      this.nextSpawnTick = this.currentTick + effectiveSpawnInterval;

      if (this.monsters.length >= this.data.board.path.monsterCap) {
        this.gameOver = true;
        this.gameOverReason = 'overrun';
        this.priorityDirty = true;
        return;
      }
    }

    // Fast-forward boss wave remaining idle timer once the wave boss is slain
    if (
      waveDef.isBoss &&
      this.spawnedInWave >= effectiveSpawnCount &&
      !this.monsters.some((m) => m.isBoss && !m.isBounty) &&
      this.waveTicksLeft > 45
    ) {
      this.waveTicksLeft = 45;
      this.priorityDirty = true;
    }

    this.waveTicksLeft--;
    if (this.waveTicksLeft <= 0) {
      // Boss Time-Limit Rule: failing to slay a wave boss before timer hits 0 ends the run!
      if (waveDef.isBoss) {
        const survivingBoss = this.monsters.find((m) => m.isBoss && !m.isBounty);
        if (survivingBoss) {
          this.gameOver = true;
          this.gameOverReason = 'boss_timeout';
          this.priorityDirty = true;
          this.events.emit('boss:timeout', {
            wave: this.waveNumber,
            bossName: survivingBoss.bossName ?? resolvedBossName ?? '영물 보스',
            tick: this.currentTick,
          });
          return;
        }
      }

      const completedWave = this.waveNumber;
      const { pct: interestPct, cap: interestCap } = this.getEffectiveInterestConfig();
      const interestCoin =
        interestPct > 0
          ? Math.min(interestCap, Math.floor((this.coin * interestPct) / 100))
          : 0;
      this.lastWaveInterest = interestCoin;

      this.tileHazards.length = 0;
      this.waveNumber++;
      const nextWaveDef = this.getWaveDef(this.waveNumber);
      this.waveTicksLeft = nextWaveDef.durationTicks;
      this.spawnedInWave = 0;
      this.nextSpawnTick = this.currentTick + 15;
      this.coin += 20 + interestCoin;
      this.luckStone += 1;
      this.priorityDirty = true;

      if (interestCoin > 0) {
        this.events.emit('wave:interest', {
          completedWave,
          interestCoin,
          pct: interestPct,
          totalCoin: this.coin,
          tick: this.currentTick,
        });
      }

      if (nextWaveDef.isBoss) {
        const nextBossName =
          this.waveNumber === CLEAR_TARGET_WAVE
            ? '천마대제 아수라 혈마신'
            : (nextWaveDef.bossName ?? '웨이브 보스');
        this.events.emit('wave:boss', {
          wave: this.waveNumber,
          bossName: nextBossName,
          monsterKind: nextWaveDef.monsterKind,
          tick: this.currentTick,
        });
      } else {
        const nextMutant = getWaveMutantKind(this.waveNumber, false);
        if (nextMutant) {
          const meta = WAVE_MUTANT_META[nextMutant];
          this.events.emit('wave:mutant', {
            wave: this.waveNumber,
            mutant: nextMutant,
            name: meta.name,
            desc: meta.desc,
            tick: this.currentTick,
          });
        }
      }
    }
  }

  private offerBossBoons(wave: number): void {
    const eligible = this.data.boons.filter(
      (b) => (this.activeBoons[b.id] ?? 0) < b.maxStacks,
    );
    if (eligible.length === 0) return;

    const pool = eligible.slice();
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

    const offer: BoonOfferSnapshot = {
      seq: ++this.boonOfferSeq,
      wave,
      options: picked,
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

  private pickHazardTiles(count: number): number[] {
    const occupiedSafe: number[] = [];
    const emptySafe: number[] = [];
    for (let i = 0; i < this.board.field.capacity; i++) {
      if (this.hasFieldHazard(i)) continue;
      if (this.board.field.getUidAt(i) !== null) occupiedSafe.push(i);
      else emptySafe.push(i);
    }

    const picked: number[] = [];
    while (picked.length < count && occupiedSafe.length > 0) {
      const r = this.rng.nextInt(occupiedSafe.length);
      picked.push(occupiedSafe.splice(r, 1)[0]!);
    }
    while (picked.length < count && emptySafe.length > 0) {
      const r = this.rng.nextInt(emptySafe.length);
      picked.push(emptySafe.splice(r, 1)[0]!);
    }
    return picked;
  }

  private stepMonsters(): void {
    // 0. Prune expired tile hazards & emit seal activation when warning completes
    if (this.tileHazards.length > 0) {
      const activatedIndices: number[] = [];
      for (let i = this.tileHazards.length - 1; i >= 0; i--) {
        const h = this.tileHazards[i]!;
        if (this.currentTick >= h.expireTick) {
          this.tileHazards.splice(i, 1);
          this.priorityDirty = true;
        } else if (this.currentTick === h.activateTick) {
          activatedIndices.push(h.fieldIndex);
          this.priorityDirty = true;
        }
      }
      if (activatedIndices.length > 0) {
        const firstCenter = this.board.getSlotCenter({
          area: 'field',
          index: activatedIndices[0]!,
        });
        this.events.emit('boss:skill', {
          entityId: 0,
          bossKind: 'blood_patriarch',
          skillKind: 'patriarch_seal',
          skillName: '혈옥주박 봉인 발동!',
          x: firstCenter.x,
          y: firstCenter.y,
          tileIndices: activatedIndices,
          tick: this.currentTick,
        });
      }
    }

    const spawnedEscorts: MonsterEntity[] = [];

    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i]!;

      // Unbroken Black Serpent poison-shell barrier expires -> heals boss 6% Max HP!
      if (m.shieldHp > 0 && this.currentTick >= m.shieldExpireTick) {
        m.shieldHp = 0;
        m.shieldMaxHp = 0;
        m.shieldExpireTick = 0;
        const healAmt = Math.max(1, Math.round(m.maxHp * 0.06));
        m.hp = Math.min(m.maxHp, m.hp + healAmt);
        this.priorityDirty = true;
        this.events.emit('boss:skill', {
          entityId: m.entityId,
          bossKind: m.kind,
          skillKind: 'serpent_heal',
          skillName: '만년독갑 흡수 · 재생!',
          x: m.currX,
          y: m.currY,
          tick: this.currentTick,
        });
      }

      if (this.currentTick < m.stunUntilTick) {
        continue;
      }

      const slowMult = this.currentTick < m.slowUntilTick ? m.slowFactor : 1;
      const hasteMult = this.currentTick < m.hasteUntilTick ? 1.55 : 1;
      m.currDistance += m.speedPerTick * slowMult * hasteMult;
      const pos = this.path.sample(m.currDistance);
      m.currX = pos.x;
      m.currY = pos.y;

      // Active Wave Boss Patterns (excludes bounty outlaws)
      if (m.isBoss && !m.isBounty) {
        // 1) 55% HP threshold phase trigger
        if (!m.phaseTriggered && m.hp <= Math.round(m.maxHp * 0.55)) {
          m.phaseTriggered = true;
          if (m.kind === 'white_tiger') {
            m.hasteUntilTick = this.currentTick + 90; // 3.0s sprint
            m.slowUntilTick = 0;
            m.slowFactor = 1;
            this.priorityDirty = true;
            this.events.emit('boss:skill', {
              entityId: m.entityId,
              bossKind: m.kind,
              skillKind: 'tiger_sprint',
              skillName: '백호 광풍질주!',
              x: m.currX,
              y: m.currY,
              tick: this.currentTick,
            });
          } else if (m.kind === 'blood_patriarch') {
            const escortCount = this.waveNumber >= CLEAR_TARGET_WAVE ? 3 : 2;
            const room = Math.max(
              0,
              this.data.board.path.monsterCap - 2 - (this.monsters.length + spawnedEscorts.length),
            );
            const toSpawn = Math.min(escortCount, room);
            for (let s = 0; s < toSpawn; s++) {
              const offsetDist = Math.max(0, m.currDistance - 28 * (s + 1));
              const ePos = this.path.sample(offsetDist);
              const eHp = Math.max(80, Math.round(m.maxHp * 0.045));
              spawnedEscorts.push({
                entityId: this.nextMonsterId++,
                kind: 'blood_zealot',
                isBoss: false,
                hp: eHp,
                maxHp: eHp,
                armor: Math.round(m.armor * 0.5),
                armorShred: 0,
                shredExpireTick: 0,
                shieldHp: 0,
                shieldMaxHp: 0,
                shieldExpireTick: 0,
                hasteUntilTick: 0,
                nextBossSkillTick: 999999999,
                phaseTriggered: true,
                speedPerTick: m.speedPerTick * 1.18,
                radius: 17,
                rewardCoin: 10,
                spawnTick: this.currentTick,
                stunUntilTick: 0,
                slowUntilTick: 0,
                slowFactor: 1,
                lastHitTick: -100,
                prevDistance: offsetDist,
                currDistance: offsetDist,
                prevX: ePos.x,
                prevY: ePos.y,
                currX: ePos.x,
                currY: ePos.y,
              });
            }
            if (toSpawn > 0) {
              this.priorityDirty = true;
              this.events.emit('boss:skill', {
                entityId: m.entityId,
                bossKind: m.kind,
                skillKind: 'patriarch_summon',
                skillName: '혈마호위 강림!',
                x: m.currX,
                y: m.currY,
                tick: this.currentTick,
              });
            }
          }
        }

        // 2) Periodic boss signature skill
        if (this.currentTick >= m.nextBossSkillTick) {
          if (m.kind === 'white_tiger') {
            m.nextBossSkillTick = this.currentTick + 240; // 8.0s
            const roarRadiusSq = 195 * 195;
            for (let uIdx = 0; uIdx < this.units.length; uIdx++) {
              const u = this.units[uIdx]!;
              if (u.slot.area !== 'field') continue;
              const dx = u.currX - m.currX;
              const dy = u.currY - m.currY;
              if (dx * dx + dy * dy <= roarRadiusSq) {
                u.cooldownTicks = Math.min(90, u.cooldownTicks + 36);
              }
            }
            this.events.emit('boss:skill', {
              entityId: m.entityId,
              bossKind: m.kind,
              skillKind: 'tiger_roar',
              skillName: '백호 호포진!',
              x: m.currX,
              y: m.currY,
              tick: this.currentTick,
            });
          } else if (m.kind === 'black_serpent') {
            m.nextBossSkillTick = this.currentTick + 270; // 9.0s
            const shieldAmt = Math.max(60, Math.round(m.maxHp * 0.12));
            m.shieldHp = shieldAmt;
            m.shieldMaxHp = shieldAmt;
            m.shieldExpireTick = this.currentTick + 150; // 5.0s
            this.priorityDirty = true;
            this.events.emit('boss:skill', {
              entityId: m.entityId,
              bossKind: m.kind,
              skillKind: 'serpent_shell',
              skillName: '만년현무 독갑!',
              x: m.currX,
              y: m.currY,
              tick: this.currentTick,
            });
          } else if (m.kind === 'blood_patriarch') {
            m.nextBossSkillTick = this.currentTick + 225; // 7.5s
            const sealCount = this.waveNumber >= CLEAR_TARGET_WAVE ? 3 : 2;
            const chosenTiles = this.pickHazardTiles(sealCount);
            if (chosenTiles.length > 0) {
              for (let c = 0; c < chosenTiles.length; c++) {
                this.tileHazards.push({
                  fieldIndex: chosenTiles[c]!,
                  startTick: this.currentTick,
                  activateTick: this.currentTick + HAZARD_WARNING_TICKS,
                  expireTick: this.currentTick + HAZARD_WARNING_TICKS + HAZARD_SEAL_TICKS,
                });
              }
              this.priorityDirty = true;
              this.events.emit('boss:skill', {
                entityId: m.entityId,
                bossKind: m.kind,
                skillKind: 'patriarch_telegraph',
                skillName: '혈옥주박진 예고! (영웅 이동 회피)',
                x: m.currX,
                y: m.currY,
                tileIndices: chosenTiles,
                tick: this.currentTick,
              });
            }
          }
        }
      }
    }

    if (spawnedEscorts.length > 0) {
      for (let i = 0; i < spawnedEscorts.length; i++) {
        this.monsters.push(spawnedEscorts[i]!);
      }
    }
  }

  private stepCombat(): void {
    const synergy = this.computeFieldSynergy();
    const tileBuffs = this.computeFieldTileBuffs();
    const harmonyStacks = this.getBoonStacks('b_trinity_harmony');
    const swiftStacks = this.getBoonStacks('b_swift_formation');
    const pillageStacks = this.getBoonStacks('b_unorthodox_pillage');
    const acupointStacks = this.getBoonStacks('b_hidden_acupoint');
    const orthodoxBoonStacks = this.getBoonStacks('b_orthodox_zenith');
    const demonicBoonStacks = this.getBoonStacks('b_demonic_overdrive');
    const crusherStacks = this.getBoonStacks('b_armor_crusher');

    if (this.monsters.length > 0) {
      for (let i = 0; i < this.units.length; i++) {
        const u = this.units[i]!;
        if (u.slot.area !== 'field') {
          continue;
        }
        // Units standing on an active Blood-Jade Seal tile are petrified until moved or expired!
        if (this.isFieldSlotSealed(u.slot.index)) {
          continue;
        }
        if (u.cooldownTicks > 0) {
          u.cooldownTicks--;
        }
        if (u.cooldownTicks > 0) {
          continue;
        }

        const def = this.data.unitsById.get(u.unitId);
        if (!def) continue;

        const effectiveRange = def.range + harmonyStacks * 25;
        const rangeSq = effectiveRange * effectiveRange;
        let bestTarget: MonsterEntity | null = null;

        // Deterministic target order (AGENTS.md §3): path progress desc -> entityId asc
        for (let j = 0; j < this.monsters.length; j++) {
          const m = this.monsters[j]!;
          const dx = m.currX - u.currX;
          const dy = m.currY - u.currY;
          if (dx * dx + dy * dy > rangeSq) {
            continue;
          }
          if (
            bestTarget === null ||
            m.currDistance > bestTarget.currDistance ||
            (m.currDistance === bestTarget.currDistance && m.entityId < bestTarget.entityId)
          ) {
            bestTarget = m;
          }
        }

        if (bestTarget !== null) {
          const tileBuff = tileBuffs[u.slot.index] ?? { atkPct: 0, speedPct: 0 };
          let speedMult = synergy.trinityActive ? 1.1 : 1.0;
          if (swiftStacks > 0) {
            speedMult *= 1 + 0.16 * swiftStacks;
          }
          if (def.faction === 'unorthodox') {
            if (synergy.unorthodoxTier === 2) speedMult *= 1.32;
            else if (synergy.unorthodoxTier === 1) speedMult *= 1.18;
            if (pillageStacks > 0) {
              speedMult *= 1 + 0.22 * pillageStacks;
            }
          }
          if (tileBuff.speedPct > 0) {
            speedMult *= 1 + tileBuff.speedPct / 100;
          }
          u.cooldownTicks = Math.max(1, Math.round(def.attackIntervalTicks / speedMult));
          u.attackCount++;
          u.lastAttackTick = this.currentTick;

          const dx = bestTarget.currX - u.currX;
          const dy = bestTarget.currY - u.currY;
          const dist = Math.hypot(dx, dy);
          u.attackDirX = dist > 0.001 ? dx / dist : 0;
          u.attackDirY = dist > 0.001 ? dy / dist : 1;

          const travelTicks = Math.max(2, Math.min(10, Math.round(dist / 32)));
          const gradeDef = this.data.gradesById.get(u.grade);
          const gradeColor = gradeDef?.color ?? '#94a3b8';
          const gradeRank = gradeDef?.rank ?? 1;

          const { baseAtk, bonusAtk } = this.getUnitEffectiveAtk(
            u.unitId,
            synergy,
            tileBuff.atkPct,
          );
          const totalAtk = baseAtk + bonusAtk;
          const effectiveEveryN = Math.max(2, def.skill.everyN - acupointStacks);
          const isSkill = u.attackCount % effectiveEveryN === 0;

          let critChance = def.critChance;
          let critMult = def.critMult;
          let skillRatio = def.skill.atkRatio;
          let ccMult = 1 + 0.35 * acupointStacks;

          if (def.faction === 'orthodox') {
            if (synergy.orthodoxTier === 2) {
              critChance = Math.min(0.95, critChance + 0.18);
              ccMult *= 1.4;
            } else if (synergy.orthodoxTier === 1) {
              critChance = Math.min(0.95, critChance + 0.1);
              ccMult *= 1.25;
            }
            if (orthodoxBoonStacks > 0) {
              critChance = Math.min(0.95, critChance + 0.15 * orthodoxBoonStacks);
              critMult += 0.55 * orthodoxBoonStacks;
            }
          } else if (def.faction === 'demonic') {
            if (synergy.demonicTier === 2) {
              critMult += 0.8;
              skillRatio *= 1.45;
            } else if (synergy.demonicTier === 1) {
              critMult += 0.4;
              skillRatio *= 1.25;
            }
            if (demonicBoonStacks > 0) {
              skillRatio *= 1 + 0.3 * demonicBoonStacks;
            }
          }

          const isCrit = this.rng.nextInt(1000) < Math.round(critChance * 1000);

          let damage = totalAtk;
          if (isSkill) {
            damage = Math.round(damage * skillRatio);
          }
          if (isCrit) {
            damage = Math.round(damage * critMult);
          }

          const unitBaseShred = def.armorShred + crusherStacks * 6;
          const projectileShred =
            unitBaseShred > 0
              ? isSkill
                ? Math.round(unitBaseShred * 1.5)
                : unitBaseShred
              : 0;

          this.projectiles.push({
            id: this.nextProjectileId++,
            unitId: u.unitId,
            startTick: this.currentTick,
            arriveTick: this.currentTick + travelTicks,
            fromX: u.currX,
            fromY: u.currY - 8,
            targetEntityId: bestTarget.entityId,
            targetX: bestTarget.currX,
            targetY: bestTarget.currY,
            prevX: u.currX,
            prevY: u.currY - 8,
            currX: u.currX,
            currY: u.currY - 8,
            damage: Math.max(1, damage),
            armorShred: projectileShred,
            color: gradeColor,
            gradeRank,
            isCrit,
            isSkill,
            skillName: def.skill.name,
            vfxTrack: def.skill.vfxTrack,
            splashRadius: isSkill ? def.skill.splashRadius : 0,
            stunTicks:
              isSkill && def.skill.stunTicks > 0
                ? Math.max(1, Math.round(def.skill.stunTicks * ccMult))
                : 0,
            slowPct: isSkill ? def.skill.slowPct : 0,
            slowTicks:
              isSkill && def.skill.slowTicks > 0
                ? Math.max(1, Math.round(def.skill.slowTicks * ccMult))
                : 0,
          });
        }
      }
    } else {
      for (let i = 0; i < this.units.length; i++) {
        const u = this.units[i]!;
        if (u.slot.area === 'field' && !this.isFieldSlotSealed(u.slot.index) && u.cooldownTicks > 0) {
          u.cooldownTicks--;
        }
      }
    }

    // Advance projectiles & apply integer-tick arrival hits
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      const targetIdx = this.monsters.findIndex((m) => m.entityId === p.targetEntityId);
      const target = targetIdx !== -1 ? this.monsters[targetIdx] : undefined;

      if (target) {
        p.targetX = target.currX;
        p.targetY = target.currY;
      }

      const span = Math.max(1, p.arriveTick - p.startTick);
      const prog = Math.max(0, Math.min(1, (this.currentTick - p.startTick + 1) / span));
      p.currX = p.fromX + (p.targetX - p.fromX) * prog;
      p.currY = p.fromY + (p.targetY - p.fromY) * prog;

      if (this.currentTick >= p.arriveTick) {
        const impactX = target ? target.currX : p.targetX;
        const impactY = target ? target.currY : p.targetY;

        if (p.isSkill) {
          this.events.emit('skill:impact', {
            unitId: p.unitId,
            skillName: p.skillName,
            vfxTrack: p.vfxTrack,
            fromX: p.fromX,
            fromY: p.fromY,
            x: impactX,
            y: impactY,
            radius: Math.max(48, p.splashRadius),
            color: p.color,
            gradeRank: p.gradeRank,
            tick: this.currentTick,
          });
        }

        if (p.splashRadius > 0) {
          const rSq = p.splashRadius * p.splashRadius;
          // Deterministic hit ordering: path progress desc -> entityId asc
          const victims = this.monsters
            .filter((m) => {
              const dx = m.currX - impactX;
              const dy = m.currY - impactY;
              return dx * dx + dy * dy <= rSq;
            })
            .sort((a, b) =>
              b.currDistance !== a.currDistance
                ? b.currDistance - a.currDistance
                : a.entityId - b.entityId,
            );

          for (let v = 0; v < victims.length; v++) {
            const m = victims[v]!;
            // Primary target takes 100%, splash neighbors take 75%
            const dealt =
              m.entityId === p.targetEntityId ? p.damage : Math.max(1, Math.round(p.damage * 0.75));
            this.applyHitToMonster(m, dealt, p, synergy);
          }
        } else if (target) {
          this.applyHitToMonster(target, p.damage, p, synergy);
        }

        this.projectiles.splice(i, 1);
      }
    }
  }

  private applyHitToMonster(
    m: MonsterEntity,
    rawDamage: number,
    p: ProjectileEntity,
    synergy: FactionSynergySnapshot,
  ): void {
    const idx = this.monsters.indexOf(m);
    if (idx === -1) return;

    const prevShredBeforeHit = this.currentTick < m.shredExpireTick ? m.armorShred : 0;
    const prevNetArmor = m.armor - prevShredBeforeHit;

    if (p.armorShred > 0) {
      m.armorShred = Math.min(160, prevShredBeforeHit + p.armorShred);
      m.shredExpireTick = Math.max(m.shredExpireTick, this.currentTick + 120);
    }

    const activeShred = this.currentTick < m.shredExpireTick ? m.armorShred : 0;
    const netArmor = m.armor - activeShred;
    let justShattered = m.armor > 0 && prevNetArmor > 0 && netArmor <= 0;
    const armorBroken = netArmor < 0 || (m.armor > 0 && netArmor <= 0);

    let effectiveRaw = rawDamage;
    const hunterStacks = this.getBoonStacks('b_bounty_hunter');
    if (m.isBoss && hunterStacks > 0) {
      effectiveRaw = Math.round(effectiveRaw * (1 + 0.28 * hunterStacks));
    }

    const maxAmp = 0.45 + 0.3 * this.getBoonStacks('b_armor_crusher');
    let damage = effectiveRaw;
    if (netArmor > 0) {
      damage = Math.max(1, Math.round(effectiveRaw * (100 / (100 + netArmor))));
    } else if (netArmor < 0) {
      const amp = Math.min(maxAmp, -netArmor * 0.0075);
      damage = Math.max(1, Math.round(effectiveRaw * (1 + amp)));
    }

    // Black Serpent poison-shell barrier absorption (armor-shredding attacks deal 1.8x bonus vs barrier!)
    if (m.shieldHp > 0 && this.currentTick < m.shieldExpireTick) {
      const shieldDamage = p.armorShred > 0 ? Math.round(damage * 1.8) : damage;
      if (shieldDamage < m.shieldHp) {
        m.shieldHp -= shieldDamage;
        m.lastHitTick = this.currentTick;
        this.damageByUnit.set(p.unitId, (this.damageByUnit.get(p.unitId) ?? 0) + damage);
        this.totalDamageDealt += damage;
        damage = shieldDamage;
      } else {
        const shieldMult = p.armorShred > 0 ? 1.8 : 1;
        const overflow = Math.max(0, Math.round((shieldDamage - m.shieldHp) / shieldMult));
        m.shieldHp = 0;
        m.shieldMaxHp = 0;
        m.shieldExpireTick = 0;
        m.hp -= overflow;
        m.lastHitTick = this.currentTick;
        m.stunUntilTick = Math.max(m.stunUntilTick, this.currentTick + 45);
        m.armorShred = Math.min(160, activeShred + 25);
        m.shredExpireTick = Math.max(m.shredExpireTick, this.currentTick + 150);
        justShattered = true;
        this.damageByUnit.set(p.unitId, (this.damageByUnit.get(p.unitId) ?? 0) + damage);
        this.totalDamageDealt += damage;
        this.events.emit('boss:skill', {
          entityId: m.entityId,
          bossKind: m.kind,
          skillKind: 'serpent_shatter',
          skillName: '현무 독갑 격파! (기절)',
          x: m.currX,
          y: m.currY,
          tick: this.currentTick,
        });
      }
    } else {
      m.hp -= damage;
      m.lastHitTick = this.currentTick;
      this.damageByUnit.set(p.unitId, (this.damageByUnit.get(p.unitId) ?? 0) + damage);
      this.totalDamageDealt += damage;
    }

    if (p.stunTicks > 0) {
      const bossFactor = this.difficulty === 'hell' ? 0.35 : 0.45;
      const stunDur = m.isBoss ? Math.max(1, Math.round(p.stunTicks * bossFactor)) : p.stunTicks;
      m.stunUntilTick = Math.max(m.stunUntilTick, this.currentTick + stunDur);
    }
    if (p.slowTicks > 0 && p.slowPct > 0 && this.currentTick >= m.hasteUntilTick) {
      m.slowUntilTick = Math.max(m.slowUntilTick, this.currentTick + p.slowTicks);
      m.slowFactor = Math.min(m.slowFactor, Math.max(0.3, 1 - p.slowPct));
    }

    if (!p.isSkill && this.relicLv.bandit_dagger > 0) {
      const procPer1000 = getBanditProcPer1000(this.relicLv.bandit_dagger);
      if (this.rng.nextInt(1000) < procPer1000) {
        const pilfer = getBanditPilferCoin(this.relicLv.bandit_dagger);
        this.coin += pilfer;
        this.pilferedCoinTotal += pilfer;
        this.priorityDirty = true;
      }
    }

    const slain = m.hp <= 0;
    const hitX = m.currX;
    const hitY = m.currY;

    if (slain) {
      this.monstersSlain++;
      let pillageBonus = 0;
      const attackerFaction = this.data.unitsById.get(p.unitId)?.faction;
      if (attackerFaction === 'unorthodox') {
        if (synergy.unorthodoxTier > 0) {
          pillageBonus += synergy.unorthodoxTier === 2 ? 2 : 1;
        }
        const pillageBoonStacks = this.getBoonStacks('b_unorthodox_pillage');
        if (pillageBoonStacks > 0 && this.rng.nextInt(100) < Math.min(90, pillageBoonStacks * 35)) {
          pillageBonus += 2;
          this.pilferedCoinTotal += 2;
        }
      }
      this.coin += m.rewardCoin + pillageBonus;
      this.monsters.splice(idx, 1);

      if (m.isBoss) {
        if (m.isBounty) {
          this.bountiesSlain++;
          const rewardLuck = m.bountyRewardLuck ?? 2;
          this.luckStone += rewardLuck;
          this.priorityDirty = true;
          this.events.emit('bounty:slain', {
            bossName: m.bossName ?? '현상수배범',
            rewardCoin: m.rewardCoin,
            rewardLuck,
            tick: this.currentTick,
          });
        } else {
          this.bossesSlain++;
          this.tileHazards.length = 0;
          const rewardLuck = 2 + getScrollChestBossLuckBonus(this.relicLv.heavenly_scroll_chest);
          this.luckStone += rewardLuck;
          const rewardGrade: GradeId = m.kind === 'white_tiger' ? 'uncommon' : 'rare';
          this.wisps[rewardGrade] = (this.wisps[rewardGrade] ?? 0) + 1;
          this.wispSystem.recomputeHintsIfOwned(this.wisps, this.inventoryIndex);
          this.priorityDirty = true;
          this.events.emit('boss:slain', {
            wave: this.waveNumber,
            bossName: m.bossName ?? '영물 보스',
            rewardWispGrade: rewardGrade,
            rewardLuck,
            tick: this.currentTick,
          });

          const noWaveBossRemaining = !this.monsters.some((o) => o.isBoss && !o.isBounty);
          if (
            this.waveNumber === CLEAR_TARGET_WAVE &&
            !this.endlessMode &&
            !this.victoryAchieved &&
            noWaveBossRemaining
          ) {
            this.victoryAchieved = true;
            this.victoryHold = true;
            this.events.emit('run:victory', {
              wave: this.waveNumber,
              difficulty: this.difficulty,
              tick: this.currentTick,
            });
          } else if (noWaveBossRemaining) {
            // Offer 3-choice Wuxia Roguelike Boon scroll!
            this.offerBossBoons(this.waveNumber);
          }
        }
      }
    }

    this.events.emit('monster:hit', {
      entityId: m.entityId,
      unitId: p.unitId,
      x: hitX,
      y: hitY,
      damage,
      color: p.color,
      slain,
      isCrit: p.isCrit,
      isSkill: p.isSkill,
      armorBroken,
      justShattered,
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

    const fieldViews: Array<SlotView | null> = [];
    for (let i = 0; i < this.board.field.capacity; i++) {
      const uid = this.board.field.getUidAt(i);
      const buff = tileBuffs[i] ?? { atkPct: 0, speedPct: 0 };
      fieldViews.push(uid !== null ? this.toSlotView(uid, synergy, buff) : null);
    }

    const zeroBuff: TileAuraBuff = { atkPct: 0, speedPct: 0 };
    const benchViews: Array<SlotView | null> = [];
    for (let i = 0; i < this.board.bench.capacity; i++) {
      const uid = this.board.bench.getUidAt(i);
      benchViews.push(uid !== null ? this.toSlotView(uid, synergy, zeroBuff) : null);
    }

    const rejects = this.pendingRejects.slice();
    this.pendingRejects.length = 0;

    const waveDef = this.getWaveDef(this.waveNumber);
    const mutantKind = getWaveMutantKind(this.waveNumber, waveDef.isBoss);
    const waveMutant = mutantKind ? WAVE_MUTANT_META[mutantKind] : null;
    const waveBoss = this.monsters.find((m) => m.isBoss && !m.isBounty);
    const bountyBoss = this.monsters.find((m) => m.isBounty);
    const activeBoss = waveBoss ?? bountyBoss;

    const unlockedBounty = this.waveNumber >= 2;
    const bountyActiveTicksLeft =
      bountyBoss && bountyBoss.expireTick !== undefined
        ? Math.max(0, bountyBoss.expireTick - this.currentTick)
        : 0;
    const bountyCooldownLeft = Math.max(0, this.bountyReadyTick - this.currentTick);
    const bountySnap: BountySnapshot = {
      canCall:
        unlockedBounty &&
        !bountyBoss &&
        bountyCooldownLeft === 0 &&
        !this.gameOver &&
        !this.victoryHold &&
        this.monsters.length + 1 < this.data.board.path.monsterCap,
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
          grade: def?.grade ?? 'common',
          damage: dmg,
          sharePct,
        };
      });

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
        ? '현상수배 도주 주의'
        : activeBoss.kind === 'white_tiger'
          ? '권능: 호포 경직 · 광풍질주'
          : activeBoss.kind === 'black_serpent'
            ? '권능: 현무 독갑 (파갑 1.8x 특효)'
            : '권능: 혈옥주박 타일봉인 (스왑 회피!)'
      : '';

    return {
      tick: this.currentTick,
      speed,
      paused,
      difficulty: this.difficulty,
      gameOver: this.gameOver,
      gameOverReason: this.gameOverReason,
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
      missions: missionItems,
      missionsCompletedCount: this.completedMissions.size,
      damageMeter: {
        totalDamage: this.totalDamageDealt,
        entries: dmgEntries,
      },
      monsterCount: this.monsters.length,
      monsterCap: this.data.board.path.monsterCap,
      monstersSlain: this.monstersSlain,
      bossesSlain: this.bossesSlain,
      coin: this.coin,
      luckStone: this.luckStone,
      summonCost: this.getSummonCost(),
      wisps: { ...this.wisps },
      upgradeLv: { ...this.upgradeLv },
      relics: { ...this.relicLv },
      relicBonus,
      synergy,
      lastGambleResult: this.lastGambleResult,
      field: fieldViews,
      bench: benchViews,
      fieldOccupied: this.board.field.countOccupied(),
      benchOccupied: this.board.bench.countOccupied(),
      craft: this.craftIndex.getView(),
      wispHints: this.wispSystem.getHints(),
      rejects,
    };
  }

  private toSlotView(
    uid: number,
    synergy: FactionSynergySnapshot,
    tileBuff: TileAuraBuff,
  ): SlotView | null {
    const u = this.unitsByUid.get(uid);
    if (!u) return null;
    const def = this.data.unitsById.get(u.unitId);
    const { baseAtk, bonusAtk } = this.getUnitEffectiveAtk(
      u.unitId,
      synergy,
      tileBuff.atkPct,
    );
    const isField = u.slot.area === 'field';
    const harmonyRange = this.getBoonStacks('b_trinity_harmony') * 25;
    const crusherShred = this.getBoonStacks('b_armor_crusher') * 6;
    return {
      uid: u.uid,
      unitId: u.unitId,
      name: def?.name ?? u.unitId,
      faction: def?.faction ?? 'orthodox',
      grade: u.grade,
      locked: u.locked,
      sellCoin: def?.sellCoin ?? 10,
      baseAtk,
      bonusAtk,
      range: (def?.range ?? 150) + harmonyRange,
      skillName: def?.skill.name ?? '기본 초식',
      armorShred: (def?.armorShred ?? 0) + crusherShred,
      supportAura: def?.supportAura,
      tileBuffAtkPct: tileBuff.atkPct,
      tileBuffSpeedPct: tileBuff.speedPct,
      sealed: isField ? this.isFieldSlotSealed(u.slot.index) : false,
      hazardWarning: isField ? this.isFieldSlotWarning(u.slot.index) : false,
    };
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


