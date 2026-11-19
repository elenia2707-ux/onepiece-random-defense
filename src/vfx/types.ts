import type { VfxTrackKind } from '../data/types';
import type { IRenderable } from '../render/RenderLayer';
import type { SpriteCache } from '../render/SpriteCache';
import type { WeaponMotionStyle } from '../render/weaponProfiles';

export type InternalVfxKind =
  | 'ring'
  | 'craft_pillar'
  | 'hit_slash'
  | 'armor_shatter'
  | 'qi_resonance'
  | VfxTrackKind;

export interface TrackVfxInstance {
  kind: InternalVfxKind;
  weaponStyle: WeaponMotionStyle;
  startTick: number;
  durationSec: number;
  fromX: number;
  fromY: number;
  x: number;
  y: number;
  fromRadius: number;
  toRadius: number;
  color: string;
  secondaryColor: string;
  lineWidth: number;
  glowRadius: number;
  gradeRank: number;
  isLargeUltimate: boolean;
  progress: number;
  renderableGround: IRenderable;
  renderableAir: IRenderable;
}

export interface PushTrackConfig {
  readonly kind: InternalVfxKind;
  readonly startTick: number;
  readonly durationSec: number;
  readonly fromX: number;
  readonly fromY: number;
  readonly x: number;
  readonly y: number;
  readonly fromRadius: number;
  readonly toRadius: number;
  readonly color: string;
  readonly secondaryColor?: string;
  readonly lineWidth: number;
  readonly glowRadius: number;
  readonly gradeRank?: number;
  readonly weaponStyle?: WeaponMotionStyle;
  readonly isLargeUltimate?: boolean;
}

export interface SkillSpawnContext {
  pushTrack(cfg: PushTrackConfig): void;
  emitRadialBurst(
    x: number,
    y: number,
    color: string,
    count: number,
    speed: number,
    lifeSec: number,
    gravity: number,
    startTick: number,
  ): void;
  triggerScreenFlash(color: string, peakAlpha: number, durationSec: number, startTick: number): void;
}

export interface SkillRenderContext {
  readonly sprites: SpriteCache;
}

export function easeOutCubic(t: number): number {
  const inv = 1 - Math.max(0, Math.min(1, t));
  return 1 - inv * inv * inv;
}
