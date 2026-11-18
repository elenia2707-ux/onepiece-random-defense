import type { SlotRef } from '../core/CommandQueue';
import type { GradeId, MonsterKind, UnitId, VfxTrackKind } from '../data/types';

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
  attackCount: number;
  lastAttackTick: number;
  attackDirX: number;
  attackDirY: number;
}

export interface MonsterEntity {
  readonly entityId: number;
  readonly kind: MonsterKind;
  readonly isBoss: boolean;
  readonly bossName?: string;
  hp: number;
  readonly maxHp: number;
  readonly speedPerTick: number;
  readonly radius: number;
  readonly rewardCoin: number;
  readonly spawnTick: number;
  stunUntilTick: number;
  slowUntilTick: number;
  slowFactor: number;
  lastHitTick: number;
  prevDistance: number;
  currDistance: number;
  prevX: number;
  prevY: number;
  currX: number;
  currY: number;
}

export interface ProjectileEntity {
  readonly id: number;
  readonly unitId: UnitId;
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
  readonly gradeRank: number;
  readonly isCrit: boolean;
  readonly isSkill: boolean;
  readonly skillName: string;
  readonly vfxTrack: VfxTrackKind;
  readonly splashRadius: number;
  readonly stunTicks: number;
  readonly slowPct: number;
  readonly slowTicks: number;
}
