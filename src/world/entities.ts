import type { SlotRef } from '../core/CommandQueue';
import type { GradeId, UnitId } from '../data/types';

export interface UnitEntity {
  readonly uid: number;
  readonly unitId: UnitId;
  readonly grade: GradeId;
  slot: SlotRef;
  locked: boolean;
  spawnTick: number;
  moveFromX: number;
  moveFromY: number;
  moveStartTick: number;
  prevX: number;
  prevY: number;
  currX: number;
  currY: number;
  cooldownTicks: number;
}

export interface MonsterEntity {
  readonly entityId: number;
  hp: number;
  readonly maxHp: number;
  readonly speedPerTick: number;
  readonly radius: number;
  readonly rewardCoin: number;
  readonly spawnTick: number;
  prevDistance: number;
  currDistance: number;
  prevX: number;
  prevY: number;
  currX: number;
  currY: number;
}

export interface ProjectileEntity {
  readonly id: number;
  readonly startTick: number;
  readonly arriveTick: number;
  readonly fromX: number;
  readonly fromY: number;
  readonly targetEntityId: number;
  targetX: number;
  targetY: number;
  prevX: number;
  prevY: number;
  currX: number;
  currY: number;
  readonly damage: number;
  readonly color: string;
}
