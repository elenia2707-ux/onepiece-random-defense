import {
  CommandQueue,
  type GameCommand,
  type SlotRef,
  type StampedCommand,
} from './CommandQueue';
import { EventBus } from './EventBus';
import { Rng } from './Rng';
import type { Speed } from './time';
import { CraftIndex, type CraftView } from '../craft/CraftIndex';
import { CraftSystem } from '../craft/CraftSystem';
import { InventoryIndex } from '../craft/InventoryIndex';
import { RecipeGraph } from '../craft/RecipeGraph';
import { type WispHint, WispSystem } from '../craft/WispSystem';
import type {
  GameDataBundle,
  GradeDef,
  GradeId,
  MonsterKind,
  UnitId,
  UpgradeGroupId,
  Vec2,
  VfxTrackKind,
  WaveDef,
} from '../data/types';
import { Board } from '../world/Board';
import { LoopPath } from '../world/Path';
import type { MonsterEntity, ProjectileEntity, UnitEntity } from '../world/entities';

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
  'monster:hit': {
    readonly entityId: number;
    readonly x: number;
    readonly y: number;
    readonly damage: number;
    readonly color: string;
    readonly slain: boolean;
    readonly isCrit: boolean;
    readonly isSkill: boolean;
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
    readonly tick: number;
  };
  'upgrade:done': {
    readonly group: UpgradeGroupId;
    readonly level: number;
    readonly tick: number;
  };
  'wave:boss': {
    readonly wave: number;
    readonly bossName: string;
    readonly monsterKind: MonsterKind;
    readonly tick: number;
  };
  'boss:slain': {
    readonly wave: number;
    readonly bossName: string;
    readonly rewardWispGrade: GradeId;
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
  readonly grade: GradeId;
  readonly locked: boolean;
  readonly sellCoin: number;
  readonly baseAtk: number;
  readonly bonusAtk: number;
  readonly range: number;
  readonly skillName: string;
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
}

export interface UISnapshot {
  readonly tick: number;
  readonly speed: Speed;
  readonly paused: boolean;
  readonly gameOver: boolean;
  readonly wave: number;
  readonly waveTicksLeft: number;
  readonly isBossWave: boolean;
  readonly boss?: {
    readonly name: string;
    readonly hp: number;
    readonly maxHp: number;
  };
  readonly monsterCount: number;
  readonly monsterCap: number;
  readonly coin: number;
  readonly luckStone: number;
  readonly summonCost: number;
  readonly wisps: Readonly<Record<GradeId, number>>;
  readonly upgradeLv: Readonly<Record<UpgradeGroupId, number>>;
  readonly lastGambleResult: GambleResultSnapshot | null;
  readonly field: readonly (SlotView | null)[];
  readonly bench: readonly (SlotView | null)[];
  readonly fieldOccupied: number;
  readonly benchOccupied: number;
  readonly craft: CraftView;
  readonly wispHints: Partial<Record<GradeId, readonly WispHint[]>>;
  readonly rejects: readonly RejectNotice[];
}

const UPGRADE_ORDER: readonly UpgradeGroupId[] = ['common', 'rare', 'legendary', 'mythic'];

export class Simulation {
  public readonly data: GameDataBundle;
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

  private readonly units: UnitEntity[] = [];
  private readonly unitsByUid = new Map<number, UnitEntity>();
  private readonly monsters: MonsterEntity[] = [];
  private readonly projectiles: ProjectileEntity[] = [];

  private coin: number;
  private luckStone: number;
  private summonCount = 0;
  private readonly wisps: Record<GradeId, number> = {
    common: 2,
    uncommon: 1,
    rare: 0,
  };
  private readonly upgradeLv: Record<UpgradeGroupId, number> = {
    common: 0,
    rare: 0,
    legendary: 0,
    mythic: 0,
  };
  private lastGambleResult: GambleResultSnapshot | null = null;

  private waveNumber = 1;
  private waveTicksLeft: number;
  private spawnedInWave = 0;
  private nextSpawnTick = 15;
  private gameOver = false;

  private readonly pendingRejects: RejectNotice[] = [];
  private priorityDirty = true;

  public constructor(data: GameDataBundle, seed = 0x20261118) {
    this.data = data;
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
    this.wispSystem.recomputeHintsIfOwned(this.wisps, this.inventoryIndex);
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

  public getSummonCost(): number {
    const econ = this.data.board.economy;
    return econ.baseSummonCost + this.summonCount * econ.summonCostStep;
  }

  public getUpgradeCost(groupId: UpgradeGroupId): number {
    const def = this.data.upgrades.find((u) => u.id === groupId);
    if (!def) return 999;
    const lv = this.upgradeLv[groupId] ?? 0;
    return def.baseCost + lv * def.costStep;
  }

  public getUnitEffectiveAtk(unitId: UnitId): { readonly baseAtk: number; readonly bonusAtk: number } {
    const def = this.data.unitsById.get(unitId);
    if (!def) return { baseAtk: 0, bonusAtk: 0 };
    const upDef = this.data.upgradesByGrade.get(def.grade);
    if (!upDef) return { baseAtk: def.atk, bonusAtk: 0 };
    const lv = this.upgradeLv[upDef.id] ?? 0;
    if (lv <= 0) return { baseAtk: def.atk, bonusAtk: 0 };
    const bonusAtk = Math.round((def.atk * lv * upDef.atkBonusPctPerLv) / 100);
    return { baseAtk: def.atk, bonusAtk };
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

    if (!this.gameOver) {
      // 2. Wave & Spawn progression
      this.stepWaveAndSpawn();

      // 3. Monster path movement
      this.stepMonsters();

      // 4. Field unit auto-combat & projectiles
      this.stepCombat();
    }

    // 5. Delta craft & wisp indexing
    const deltaUnits = this.inventoryIndex.consumeDelta();
    if (deltaUnits.length > 0) {
      this.craftIndex.applyDelta(deltaUnits, this.inventoryIndex);
      this.wispSystem.recomputeHintsIfOwned(this.wisps, this.inventoryIndex);
      this.priorityDirty = true;
    }

    this.currentTick++;
  }

  private applyCommand(cmd: GameCommand): void {
    if (this.gameOver) {
      this.reject(cmd.type, '이미 종료된 라운드입니다.');
      return;
    }

    switch (cmd.type) {
      case 'summon': {
        const cost = this.getSummonCost();
        if (this.coin < cost) {
          this.reject('summon', `코인이 부족합니다 (${cost} 필요)`);
          return;
        }
        const slot = this.board.findPlacementSlot();
        if (!slot) {
          this.reject('summon', '필드와 대기석이 모두 가득 찼습니다.');
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
          this.reject('gamble', '유효하지 않은 도박 등급입니다.');
          return;
        }
        if (this.luckStone < rateDef.costLuck) {
          this.reject('gamble', `행운석이 부족합니다 (🍀 ${rateDef.costLuck} 필요)`);
          return;
        }
        const slot = this.board.findPlacementSlot();
        if (!slot) {
          this.reject('gamble', '배치할 빈 슬롯이 없습니다.');
          return;
        }
        const pool = this.unitsByGrade.get(rateDef.tier);
        if (!pool || pool.length === 0) {
          this.reject('gamble', '해당 등급 유닛 풀이 비어 있습니다.');
          return;
        }

        this.luckStone -= rateDef.costLuck;
        const roll = this.rng.nextInt(100);
        const success = roll < rateDef.chancePct;
        const seq = ++this.gambleSeq;

        if (success) {
          const pickedUnitId = pool[this.rng.nextInt(pool.length)]!;
          const uid = this.createUnit(pickedUnitId, slot, 'gamble');
          const created = this.unitsByUid.get(uid);
          const pos = created ? { x: created.currX, y: created.currY } : null;
          this.lastGambleResult = { seq, tier: rateDef.tier, success: true, unitId: pickedUnitId };
          this.events.emit('gamble:result', {
            seq,
            tier: rateDef.tier,
            success: true,
            unitId: pickedUnitId,
            pos,
            tick: this.currentTick,
          });
        } else {
          this.lastGambleResult = { seq, tier: rateDef.tier, success: false, unitId: null };
          this.events.emit('gamble:result', {
            seq,
            tier: rateDef.tier,
            success: false,
            unitId: null,
            pos: null,
            tick: this.currentTick,
          });
        }
        this.priorityDirty = true;
        return;
      }

      case 'upgrade': {
        const upDef = this.data.upgrades.find((u) => u.id === cmd.group);
        if (!upDef) {
          this.reject('upgrade', '존재하지 않는 강화 항목입니다.');
          return;
        }
        const curLv = this.upgradeLv[cmd.group] ?? 0;
        if (curLv >= upDef.maxLevel) {
          this.reject('upgrade', '이미 최대 강화 단계에 도달했습니다.');
          return;
        }
        const cost = this.getUpgradeCost(cmd.group);
        if (upDef.currency === 'coin') {
          if (this.coin < cost) {
            this.reject('upgrade', `코인이 부족합니다 (🪙 ${cost} 필요)`);
            return;
          }
          this.coin -= cost;
        } else {
          if (this.luckStone < cost) {
            this.reject('upgrade', `행운석이 부족합니다 (🍀 ${cost} 필요)`);
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
          this.reject('move', '이동할 유닛이 해당 슬롯에 없습니다.');
          return;
        }
        const fromUnit = this.unitsByUid.get(fromUid);
        if (!fromUnit) {
          this.reject('move', '유닛 상태를 찾을 수 없습니다.');
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
            this.reject('move', '교체 대상 유닛을 찾을 수 없습니다.');
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
          this.reject('sell', '판매할 유닛이 존재하지 않습니다.');
          return;
        }
        if (unit.locked) {
          this.reject('sell', '잠금 상태인 유닛은 먼저 잠금을 해제해 주세요.');
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
          this.reject('lock', '대상 유닛이 존재하지 않습니다.');
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
          this.reject('useWisp', '보유한 해당 등급 위습이 없습니다.');
          return;
        }
        if (!this.wispSystem.isAllowedSelection(cmd.grade, cmd.unitId)) {
          this.reject('useWisp', '해당 등급 위습 풀에 없는 유닛입니다.');
          return;
        }
        const slot = this.board.findPlacementSlot();
        if (!slot) {
          this.reject('useWisp', '배치할 빈 슬롯이 없습니다.');
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

  private stepWaveAndSpawn(): void {
    const waveDef = this.getWaveDef(this.waveNumber);
    const cycleScale = 1 + Math.floor((this.waveNumber - 1) / this.data.waves.length) * 0.55;

    if (this.spawnedInWave < waveDef.spawnCount && this.currentTick >= this.nextSpawnTick) {
      const startPos = this.path.sample(0);
      const scaledHp = Math.round(waveDef.monsterHp * cycleScale);
      const monster: MonsterEntity = {
        entityId: this.nextMonsterId++,
        kind: waveDef.monsterKind,
        isBoss: waveDef.isBoss,
        bossName: waveDef.bossName,
        hp: scaledHp,
        maxHp: scaledHp,
        speedPerTick: waveDef.monsterSpeedPerTick,
        radius: waveDef.monsterRadius,
        rewardCoin: waveDef.rewardCoin,
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
      this.nextSpawnTick = this.currentTick + waveDef.spawnIntervalTicks;

      if (this.monsters.length >= this.data.board.path.monsterCap) {
        this.gameOver = true;
        this.priorityDirty = true;
        return;
      }
    }

    this.waveTicksLeft--;
    if (this.waveTicksLeft <= 0) {
      this.waveNumber++;
      const nextWaveDef = this.getWaveDef(this.waveNumber);
      this.waveTicksLeft = nextWaveDef.durationTicks;
      this.spawnedInWave = 0;
      this.nextSpawnTick = this.currentTick + 15;
      this.coin += 20;
      this.luckStone += 1;
      this.priorityDirty = true;

      if (nextWaveDef.isBoss) {
        this.events.emit('wave:boss', {
          wave: this.waveNumber,
          bossName: nextWaveDef.bossName ?? '웨이브 보스',
          monsterKind: nextWaveDef.monsterKind,
          tick: this.currentTick,
        });
      }
    }
  }

  private stepMonsters(): void {
    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i]!;
      if (this.currentTick < m.stunUntilTick) {
        continue;
      }
      const mult = this.currentTick < m.slowUntilTick ? m.slowFactor : 1;
      m.currDistance += m.speedPerTick * mult;
      const pos = this.path.sample(m.currDistance);
      m.currX = pos.x;
      m.currY = pos.y;
    }
  }

  private stepCombat(): void {
    if (this.monsters.length > 0) {
      for (let i = 0; i < this.units.length; i++) {
        const u = this.units[i]!;
        if (u.slot.area !== 'field') {
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

        const rangeSq = def.range * def.range;
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
          u.cooldownTicks = def.attackIntervalTicks;
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

          const { baseAtk, bonusAtk } = this.getUnitEffectiveAtk(u.unitId);
          const totalAtk = baseAtk + bonusAtk;
          const isSkill = u.attackCount % def.skill.everyN === 0;
          const isCrit = this.rng.nextInt(1000) < Math.round(def.critChance * 1000);

          let damage = totalAtk;
          if (isSkill) {
            damage = Math.round(damage * def.skill.atkRatio);
          }
          if (isCrit) {
            damage = Math.round(damage * def.critMult);
          }

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
            color: gradeColor,
            gradeRank,
            isCrit,
            isSkill,
            skillName: def.skill.name,
            vfxTrack: def.skill.vfxTrack,
            splashRadius: isSkill ? def.skill.splashRadius : 0,
            stunTicks: isSkill ? def.skill.stunTicks : 0,
            slowPct: isSkill ? def.skill.slowPct : 0,
            slowTicks: isSkill ? def.skill.slowTicks : 0,
          });
        }
      }
    } else {
      for (let i = 0; i < this.units.length; i++) {
        const u = this.units[i]!;
        if (u.slot.area === 'field' && u.cooldownTicks > 0) {
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
            this.applyHitToMonster(m, dealt, p);
          }
        } else if (target) {
          this.applyHitToMonster(target, p.damage, p);
        }

        this.projectiles.splice(i, 1);
      }
    }
  }

  private applyHitToMonster(
    m: MonsterEntity,
    damage: number,
    p: ProjectileEntity,
  ): void {
    const idx = this.monsters.indexOf(m);
    if (idx === -1) return;

    m.hp -= damage;
    m.lastHitTick = this.currentTick;

    if (p.stunTicks > 0) {
      const stunDur = m.isBoss ? Math.max(1, Math.round(p.stunTicks * 0.45)) : p.stunTicks;
      m.stunUntilTick = Math.max(m.stunUntilTick, this.currentTick + stunDur);
    }
    if (p.slowTicks > 0 && p.slowPct > 0) {
      m.slowUntilTick = Math.max(m.slowUntilTick, this.currentTick + p.slowTicks);
      m.slowFactor = Math.min(m.slowFactor, Math.max(0.3, 1 - p.slowPct));
    }

    const slain = m.hp <= 0;
    const hitX = m.currX;
    const hitY = m.currY;

    if (slain) {
      this.coin += m.rewardCoin;
      this.monsters.splice(idx, 1);

      if (m.isBoss) {
        this.luckStone += 2;
        const rewardGrade: GradeId = m.kind === 'pacifista' ? 'rare' : 'uncommon';
        this.wisps[rewardGrade] = (this.wisps[rewardGrade] ?? 0) + 1;
        this.wispSystem.recomputeHintsIfOwned(this.wisps, this.inventoryIndex);
        this.priorityDirty = true;
        this.events.emit('boss:slain', {
          wave: this.waveNumber,
          bossName: m.bossName ?? '웨이브 보스',
          rewardWispGrade: rewardGrade,
          tick: this.currentTick,
        });
      }
    }

    this.events.emit('monster:hit', {
      entityId: m.entityId,
      x: hitX,
      y: hitY,
      damage,
      color: p.color,
      slain,
      isCrit: p.isCrit,
      isSkill: p.isSkill,
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
    const fieldViews: Array<SlotView | null> = [];
    for (let i = 0; i < this.board.field.capacity; i++) {
      const uid = this.board.field.getUidAt(i);
      fieldViews.push(uid !== null ? this.toSlotView(uid) : null);
    }

    const benchViews: Array<SlotView | null> = [];
    for (let i = 0; i < this.board.bench.capacity; i++) {
      const uid = this.board.bench.getUidAt(i);
      benchViews.push(uid !== null ? this.toSlotView(uid) : null);
    }

    const rejects = this.pendingRejects.slice();
    this.pendingRejects.length = 0;

    const waveDef = this.getWaveDef(this.waveNumber);
    const activeBoss = this.monsters.find((m) => m.isBoss);

    return {
      tick: this.currentTick,
      speed,
      paused,
      gameOver: this.gameOver,
      wave: this.waveNumber,
      waveTicksLeft: this.waveTicksLeft,
      isBossWave: waveDef.isBoss,
      boss: activeBoss
        ? {
            name: activeBoss.bossName ?? '보스',
            hp: Math.max(0, activeBoss.hp),
            maxHp: activeBoss.maxHp,
          }
        : undefined,
      monsterCount: this.monsters.length,
      monsterCap: this.data.board.path.monsterCap,
      coin: this.coin,
      luckStone: this.luckStone,
      summonCost: this.getSummonCost(),
      wisps: { ...this.wisps },
      upgradeLv: { ...this.upgradeLv },
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

  private toSlotView(uid: number): SlotView | null {
    const u = this.unitsByUid.get(uid);
    if (!u) return null;
    const def = this.data.unitsById.get(u.unitId);
    const { baseAtk, bonusAtk } = this.getUnitEffectiveAtk(u.unitId);
    return {
      uid: u.uid,
      unitId: u.unitId,
      name: def?.name ?? u.unitId,
      grade: u.grade,
      locked: u.locked,
      sellCoin: def?.sellCoin ?? 10,
      baseAtk,
      bonusAtk,
      range: def?.range ?? 150,
      skillName: def?.skill.name ?? '기본 공격',
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

    for (const g of UPGRADE_ORDER) {
      feedInt(this.upgradeLv[g] ?? 0);
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
      feedInt(p.isSkill ? 1 : 0);
      feedInt(p.isCrit ? 1 : 0);
    }

    const craftView = this.craftIndex.getView();
    feedInt(craftView.readyCount);
    feedInt(craftView.chainReadyCount);

    return `${h1.toString(16).padStart(8, '0')}-${h2.toString(16).padStart(8, '0')}`;
  }
}
