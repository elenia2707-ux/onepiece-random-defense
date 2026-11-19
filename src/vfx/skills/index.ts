import type { VfxTrackKind } from '../../data/types';
import type { WeaponMotionStyle } from '../../render/weaponProfiles';
import type { SkillRenderContext, SkillSpawnContext, TrackVfxInstance } from '../types';
import {
  isCommonSkillTrack,
  renderCommonSkillAir,
  renderCommonSkillGround,
  spawnCommonSkillVfx,
} from './commonSkills';
import {
  isImmortalSkillTrack,
  renderImmortalSkillAir,
  renderImmortalSkillGround,
  spawnImmortalSkillVfx,
} from './immortalSkills';
import {
  isTranscendentSkillTrack,
  renderTranscendentSkillAir,
  renderTranscendentSkillGround,
  spawnTranscendentSkillVfx,
} from './transcendentSkills';

export function isLargeUltimateTrack(track: VfxTrackKind): boolean {
  return isImmortalSkillTrack(track);
}

export function spawnSkillVfx(
  api: SkillSpawnContext,
  track: VfxTrackKind,
  fromX: number,
  fromY: number,
  x: number,
  y: number,
  radius: number,
  color: string,
  gradeRank: number,
  startTick: number,
  skinPrimary?: string,
  skinSecondary?: string,
  weaponStyle: WeaponMotionStyle = 'sword',
): void {
  if (isImmortalSkillTrack(track)) {
    spawnImmortalSkillVfx(
      api,
      track,
      fromX,
      fromY,
      x,
      y,
      radius,
      gradeRank,
      startTick,
      skinPrimary,
      skinSecondary,
      weaponStyle,
    );
    return;
  }
  if (isTranscendentSkillTrack(track)) {
    spawnTranscendentSkillVfx(
      api,
      track,
      fromX,
      fromY,
      x,
      y,
      radius,
      gradeRank,
      startTick,
      skinPrimary,
      skinSecondary,
      weaponStyle,
    );
    return;
  }
  if (isCommonSkillTrack(track)) {
    spawnCommonSkillVfx(
      api,
      track,
      fromX,
      fromY,
      x,
      y,
      radius,
      gradeRank,
      startTick,
      skinPrimary,
      skinSecondary,
      weaponStyle,
    );
    return;
  }
  api.emitRadialBurst(x, y, skinPrimary ?? color, 12, 120, 0.3, 0, startTick);
}

export function renderSkillGround(
  ctx: CanvasRenderingContext2D,
  inst: TrackVfxInstance,
  radius: number,
  inv: number,
): boolean {
  if (renderImmortalSkillGround(ctx, inst, radius, inv)) return true;
  if (renderTranscendentSkillGround(ctx, inst, radius, inv)) return true;
  if (renderCommonSkillGround(ctx, inst, radius, inv)) return true;
  return false;
}

export function renderSkillAir(
  ctx: CanvasRenderingContext2D,
  inst: TrackVfxInstance,
  rc: SkillRenderContext,
): boolean {
  if (renderImmortalSkillAir(ctx, inst, rc)) return true;
  if (renderTranscendentSkillAir(ctx, inst, rc)) return true;
  if (renderCommonSkillAir(ctx, inst, rc)) return true;
  return false;
}
