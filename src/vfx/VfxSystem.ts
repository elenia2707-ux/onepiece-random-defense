import { Pool } from '../core/Pool';
import { TICK_DT } from '../core/time';
import type { FactionId, PassiveProcKind, VfxTrackKind } from '../data/types';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../platform/Viewport';
import type { CanvasStack } from '../render/CanvasStack';
import { PIXEL_OUTLINE } from '../render/ChibiPainter';
import { type IRenderable, RenderLayer } from '../render/RenderLayer';
import { type HitBadgeKind, hexWithAlpha, type SpriteCache } from '../render/SpriteCache';
import type { WeaponMotionStyle } from '../render/weaponProfiles';
import { renderSkillAir, renderSkillGround, spawnSkillVfx } from './skills/index';
import {
  easeOutCubic,
  type PushTrackConfig,
  type SkillRenderContext,
  type SkillSpawnContext,
  type TrackVfxInstance,
} from './types';

const MAX_VFX_INSTANCES = 96;
const MAX_PARTICLES = 1500;
const MAX_SKILL_CALLOUTS = 2;
const MAX_CONCURRENT_LARGE_ULTIMATES = 2;

export type VfxDensityMode = 'full' | 'clean';

interface FloatingDamageItem {
  active: boolean;
  entityId: number;
  startTick: number;
  x: number;
  y: number;
  offsetX: number;
  driftVx: number;
  value: number;
  isCrit: boolean;
  isSkill: boolean;
  isShred: boolean;
  isKill: boolean;
  passiveProc: PassiveProcKind | null;
}

interface SkillCalloutItem {
  active: boolean;
  startTick: number;
  x: number;
  y: number;
  skillName: string;
  faction: FactionId;
  gradeRank: number;
}

interface ScreenFlashState {
  startTick: number;
  durationSec: number;
  color: string;
  peakAlpha: number;
}

interface OverlayBannerState {
  startRealMs: number;
  durationSec: number;
  sprite: HTMLCanvasElement;
}

interface CutInState {
  startRealMs: number;
  durationSec: number;
  unitSprite: HTMLCanvasElement;
  bannerSprite: HTMLCanvasElement;
  accentColor: string;
}

/**
 * Pure presentation Wuxia VFX system synchronized to simulation clock:
 * t = (currentTick + alpha - startTick) * TICK_DT (AGENTS.md §3 & §4).
 * Screen banners and ascension cut-ins use timeBase: 'real' (timestamp difference, never dt accumulation).
 * Screen shake is permanently disabled so the board remains rock-steady.
 * Never mutates simulation state.
 */
export class VfxSystem {
  private readonly sprites: SpriteCache;
  private readonly skillSpawnApi: SkillSpawnContext;
  private readonly skillRenderCtx: SkillRenderContext;
  private readonly activeTracks: TrackVfxInstance[] = [];
  private readonly trackPool: Pool<TrackVfxInstance>;

  // SoA particle storage (zero GC per frame)
  private readonly pActive = new Uint8Array(MAX_PARTICLES);
  private readonly pStartTick = new Int32Array(MAX_PARTICLES);
  private readonly pLifeSec = new Float32Array(MAX_PARTICLES);
  private readonly pOriginX = new Float32Array(MAX_PARTICLES);
  private readonly pOriginY = new Float32Array(MAX_PARTICLES);
  private readonly pVx = new Float32Array(MAX_PARTICLES);
  private readonly pVy = new Float32Array(MAX_PARTICLES);
  private readonly pGravity = new Float32Array(MAX_PARTICLES);
  private readonly pSize = new Float32Array(MAX_PARTICLES);
  private readonly pColor: string[] = new Array<string>(MAX_PARTICLES).fill('#ffffff');
  private particleCursor = 0;

  private readonly damageTexts: FloatingDamageItem[] = [];
  private readonly skillCallouts: SkillCalloutItem[] = [];
  private flash: ScreenFlashState | null = null;
  private banner: OverlayBannerState | null = null;
  private cutIn: CutInState | null = null;
  private currentSimTimeSec = 0;
  private densityMode: VfxDensityMode = 'full';

  private readonly particleBatchRenderable: IRenderable;
  private readonly damageBatchRenderable: IRenderable;
  private readonly calloutBatchRenderable: IRenderable;

  public getDensityMode(): VfxDensityMode {
    return this.densityMode;
  }

  public setDensityMode(mode: VfxDensityMode): void {
    this.densityMode = mode;
  }

  public constructor(sprites: SpriteCache) {
    this.sprites = sprites;
    this.skillRenderCtx = { sprites };
    this.skillSpawnApi = {
      pushTrack: (cfg) => this.pushTrack(cfg),
      emitRadialBurst: (x, y, color, count, speed, lifeSec, gravity, startTick) =>
        this.emitRadialBurst(x, y, color, count, speed, lifeSec, gravity, startTick),
      triggerScreenFlash: (color, peakAlpha, durationSec, startTick) =>
        this.triggerScreenFlash(color, peakAlpha, durationSec, startTick),
    };

    this.trackPool = new Pool<TrackVfxInstance>(
      () => {
        const inst: TrackVfxInstance = {
          kind: 'ring',
          weaponStyle: 'sword',
          startTick: 0,
          durationSec: 0.4,
          fromX: 0,
          fromY: 0,
          x: 0,
          y: 0,
          fromRadius: 8,
          toRadius: 48,
          color: '#ffffff',
          secondaryColor: '#fde047',
          lineWidth: 3,
          glowRadius: 42,
          gradeRank: 1,
          isLargeUltimate: false,
          progress: 0,
          renderableGround: {
            layer: RenderLayer.GroundFx,
            sortY: 0,
            render: (ctx) => this.renderTrackGround(ctx, inst),
          },
          renderableAir: {
            layer: RenderLayer.AirFx,
            sortY: 0,
            render: (ctx) => this.renderTrackAir(ctx, inst),
          },
        };
        return inst;
      },
      (inst) => {
        inst.progress = 0;
        inst.gradeRank = 1;
        inst.weaponStyle = 'sword';
        inst.isLargeUltimate = false;
      },
      36,
    );

    for (let i = 0; i < 84; i++) {
      this.damageTexts.push({
        active: false,
        entityId: -1,
        startTick: 0,
        x: 0,
        y: 0,
        offsetX: 0,
        driftVx: 0,
        value: 0,
        isCrit: false,
        isSkill: false,
        isShred: false,
        isKill: false,
        passiveProc: null,
      });
    }

    for (let i = 0; i < MAX_SKILL_CALLOUTS; i++) {
      this.skillCallouts.push({
        active: false,
        startTick: 0,
        x: 0,
        y: 0,
        skillName: '',
        faction: 'orthodox',
        gradeRank: 1,
      });
    }

    this.particleBatchRenderable = {
      layer: RenderLayer.AirFx,
      sortY: 0,
      render: (ctx) => this.renderParticles(ctx),
    };

    this.damageBatchRenderable = {
      layer: RenderLayer.WorldUI,
      sortY: 9999,
      render: (ctx) => this.renderDamageTexts(ctx),
    };

    this.calloutBatchRenderable = {
      layer: RenderLayer.WorldUI,
      sortY: 9850,
      render: (ctx) => this.renderSkillCallouts(ctx),
    };
  }

  public spawnArrivalFx(
    x: number,
    y: number,
    color: string,
    gradeRank: number,
    startTick: number,
  ): void {
    this.pushTrack({
      kind: 'ring',
      startTick,
      durationSec: gradeRank >= 3 ? 0.52 : 0.34,
      fromX: x,
      fromY: y,
      x,
      y,
      fromRadius: 12,
      toRadius: gradeRank >= 3 ? 72 : 46,
      color,
      lineWidth: gradeRank >= 3 ? 5 : 3,
      glowRadius: gradeRank >= 3 ? 52 : 30,
    });

    const burstCount = gradeRank >= 4 ? 24 : gradeRank >= 2 ? 14 : 9;
    this.emitRadialBurst(x, y, color, burstCount, gradeRank >= 3 ? 155 : 105, 0.38, 0, startTick);
  }

  /** Golden / Ascension qi pillar when 합공·등선 or 환골탈태 succeeds. */
  public spawnCraftPillarFx(
    x: number,
    y: number,
    color: string,
    gradeRank: number,
    startTick: number,
  ): void {
    const pillarColor = gradeRank >= 6 ? '#9333ea' : gradeRank >= 5 ? '#e11d48' : '#eab308';
    this.pushTrack({
      kind: 'craft_pillar',
      startTick,
      durationSec: gradeRank >= 4 ? 0.85 : 0.6,
      fromX: x,
      fromY: y,
      x,
      y,
      fromRadius: 16,
      toRadius: gradeRank >= 4 ? 92 : 62,
      color: pillarColor,
      lineWidth: gradeRank >= 4 ? 6 : 4,
      glowRadius: gradeRank >= 4 ? 76 : 48,
    });

    const sparkCount = gradeRank >= 4 ? 30 : 18;
    for (let i = 0; i < sparkCount; i++) {
      const idx = this.particleCursor;
      this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
      const spread = (((i * 13 + startTick) % 21) - 10) * 2.8;
      const upSpeed = 120 + ((i * 7) % 9) * 18;
      this.pActive[idx] = 1;
      this.pStartTick[idx] = startTick;
      this.pLifeSec[idx] = 0.58;
      this.pOriginX[idx] = x + spread * 0.5;
      this.pOriginY[idx] = y + 10;
      this.pVx[idx] = spread;
      this.pVy[idx] = -upSpeed;
      this.pGravity[idx] = -30;
      this.pSize[idx] = 3.2 + (i % 3) * 1.2;
      this.pColor[idx] = i % 2 === 0 ? '#facc15' : color;
    }

    if (gradeRank >= 4) {
      this.triggerScreenFlash(pillarColor, gradeRank >= 5 ? 0.16 : 0.11, 0.2, startTick);
    }
  }

  /**
   * Delegates sect & bespoke Transcendent/Immortal skill VFX tracks to `src/vfx/skills/`.
   * Lower-tier effects are capped compactly while up to 2 Immortal ultimates render concurrently.
   */
  public spawnSkillTrack(
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
    spawnSkillVfx(
      this.skillSpawnApi,
      track,
      fromX,
      fromY,
      x,
      y,
      radius,
      color,
      gradeRank,
      startTick,
      skinPrimary,
      skinSecondary,
      weaponStyle,
    );
  }

  /**
   * Pops a pre-baked Wuxia martial skill plaque (e.g. 「절기 만천화우」, 「천마군림보」)
   * above high-rank / boss casters without cluttering or covering the 6x3 hero grid.
   */
  public spawnSkillCallout(
    x: number,
    y: number,
    skillName: string,
    faction: FactionId,
    gradeRank: number,
    startTick: number,
  ): void {
    // Deduplicate same skill name or nearby callouts within 42 ticks (~1.4s) so plaques never stack over heroes
    for (let i = 0; i < this.skillCallouts.length; i++) {
      const c = this.skillCallouts[i]!;
      if (
        c.active &&
        (c.skillName === skillName ||
          (Math.abs(c.x - x) < 84 && Math.abs(c.y - y) < 64 && startTick - c.startTick < 42))
      ) {
        if (gradeRank >= c.gradeRank) {
          c.skillName = skillName;
          c.faction = faction;
          c.gradeRank = gradeRank;
          c.startTick = startTick;
        }
        return;
      }
    }

    let targetSlot: SkillCalloutItem | null = null;
    for (let i = 0; i < this.skillCallouts.length; i++) {
      if (!this.skillCallouts[i]!.active) {
        targetSlot = this.skillCallouts[i]!;
        break;
      }
    }
    if (!targetSlot) {
      let oldestIdx = 0;
      for (let i = 1; i < this.skillCallouts.length; i++) {
        if (this.skillCallouts[i]!.startTick < this.skillCallouts[oldestIdx]!.startTick) {
          oldestIdx = i;
        }
      }
      targetSlot = this.skillCallouts[oldestIdx]!;
    }

    targetSlot.active = true;
    targetSlot.startTick = startTick;
    targetSlot.x = Math.max(92, Math.min(LOGICAL_WIDTH - 92, x));
    targetSlot.y = Math.max(128, y);
    targetSlot.skillName = skillName;
    targetSlot.faction = faction;
    targetSlot.gradeRank = gradeRank;
  }

  public spawnMovePulse(x: number, y: number, startTick: number): void {
    this.pushTrack({
      kind: 'ring',
      startTick,
      durationSec: 0.24,
      fromX: x,
      fromY: y,
      x,
      y,
      fromRadius: 16,
      toRadius: 38,
      color: '#0d9488',
      lineWidth: 3,
      glowRadius: 0,
    });
  }

  /** Inner-qi resonance aura under every hero of the upgraded faction (정파/사파/마교). */
  public spawnUpgradeResonanceFx(
    x: number,
    y: number,
    color: string,
    level: number,
    startTick: number,
  ): void {
    this.pushTrack({
      kind: 'qi_resonance',
      startTick,
      durationSec: 0.62,
      fromX: x,
      fromY: y,
      x,
      y,
      fromRadius: 14,
      toRadius: Math.min(62, 44 + level * 1.5),
      color,
      lineWidth: 4.2,
      glowRadius: 38,
    });

    const sparkCount = 12;
    for (let i = 0; i < sparkCount; i++) {
      const idx = this.particleCursor;
      this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
      const spread = (((i * 11 + startTick) % 19) - 9) * 3.1;
      const upSpeed = 88 + ((i * 5) % 7) * 14;
      this.pActive[idx] = 1;
      this.pStartTick[idx] = startTick;
      this.pLifeSec[idx] = 0.54;
      this.pOriginX[idx] = x + spread;
      this.pOriginY[idx] = y + 4;
      this.pVx[idx] = spread * 0.35;
      this.pVy[idx] = -upSpeed;
      this.pGravity[idx] = -36;
      this.pSize[idx] = 2.8 + (i % 3);
      this.pColor[idx] = i % 3 === 0 ? '#fde047' : color;
    }
  }

  /** Dramatic world VFX & pre-baked martial callout when a Boss triggers a signature skill pattern. */
  public spawnBossSkillFx(
    skillKind:
      | 'tiger_roar'
      | 'tiger_sprint'
      | 'serpent_shell'
      | 'serpent_heal'
      | 'serpent_shatter'
      | 'patriarch_telegraph'
      | 'patriarch_seal'
      | 'patriarch_summon'
      | 'dragon_thunder_warn'
      | 'dragon_thunder_strike'
      | 'dragon_backfire'
      | 'dragon_tempest'
      | 'phoenix_rebirth_egg'
      | 'phoenix_rebirth_heal'
      | 'phoenix_shatter',
    skillName: string,
    x: number,
    y: number,
    tilePositions: readonly { readonly x: number; readonly y: number }[],
    startTick: number,
  ): void {
    const calloutFaction: FactionId =
      skillKind === 'tiger_roar' ||
      skillKind === 'tiger_sprint' ||
      skillKind === 'dragon_thunder_warn' ||
      skillKind === 'dragon_thunder_strike' ||
      skillKind === 'dragon_backfire' ||
      skillKind === 'dragon_tempest'
        ? 'orthodox'
        : skillKind === 'serpent_shell' ||
            skillKind === 'serpent_heal' ||
            skillKind === 'serpent_shatter'
          ? 'unorthodox'
          : 'demonic';

    this.spawnSkillCallout(x, y - 46, skillName, calloutFaction, 5, startTick);

    switch (skillKind) {
      case 'tiger_roar': {
        this.pushTrack({
          kind: 'golden_palm',
          startTick,
          durationSec: 0.56,
          fromX: x,
          fromY: y,
          x,
          y,
          fromRadius: 24,
          toRadius: 195,
          color: '#f59e0b',
          secondaryColor: '#fef08a',
          lineWidth: 6,
          glowRadius: 96,
          gradeRank: 5,
        });
        this.emitRadialBurst(x, y, '#facc15', 22, 185, 0.38, 0, startTick);
        this.triggerScreenFlash('#f59e0b', 0.08, 0.16, startTick);
        break;
      }
      case 'tiger_sprint': {
        this.pushTrack({
          kind: 'ring',
          startTick,
          durationSec: 0.42,
          fromX: x,
          fromY: y,
          x,
          y,
          fromRadius: 18,
          toRadius: 96,
          color: '#fde047',
          lineWidth: 5,
          glowRadius: 60,
        });
        this.emitRadialBurst(x, y, '#fef9c3', 18, 170, 0.34, 0, startTick);
        break;
      }
      case 'serpent_shell': {
        this.pushTrack({
          kind: 'ring',
          startTick,
          durationSec: 0.5,
          fromX: x,
          fromY: y,
          x,
          y,
          fromRadius: 16,
          toRadius: 92,
          color: '#14b8a6',
          lineWidth: 5.5,
          glowRadius: 68,
        });
        this.emitRadialBurst(x, y, '#5eead4', 20, 145, 0.38, -20, startTick);
        break;
      }
      case 'serpent_shatter': {
        this.pushTrack({
          kind: 'armor_shatter',
          startTick,
          durationSec: 0.62,
          fromX: x,
          fromY: y,
          x,
          y,
          fromRadius: 18,
          toRadius: 98,
          color: '#2dd4bf',
          secondaryColor: '#f43f5e',
          lineWidth: 6,
          glowRadius: 84,
          gradeRank: 5,
        });
        this.emitRadialBurst(x, y, '#5eead4', 22, 195, 0.42, 20, startTick);
        this.emitRadialBurst(x, y, '#e879f9', 14, 155, 0.36, 15, startTick);
        this.triggerScreenFlash('#2dd4bf', 0.12, 0.18, startTick);
        break;
      }
      case 'serpent_heal': {
        this.pushTrack({
          kind: 'qi_resonance',
          startTick,
          durationSec: 0.55,
          fromX: x,
          fromY: y,
          x,
          y,
          fromRadius: 18,
          toRadius: 78,
          color: '#10b981',
          lineWidth: 5,
          glowRadius: 54,
        });
        this.emitRadialBurst(x, y, '#4ade80', 18, 120, 0.42, -85, startTick);
        break;
      }
      case 'patriarch_telegraph': {
        this.pushTrack({
          kind: 'demonic_flame',
          startTick,
          durationSec: 0.52,
          fromX: x,
          fromY: y,
          x,
          y,
          fromRadius: 18,
          toRadius: 84,
          color: '#e11d48',
          secondaryColor: '#facc15',
          lineWidth: 5.5,
          glowRadius: 72,
          gradeRank: 5,
        });
        for (let i = 0; i < tilePositions.length; i++) {
          const tp = tilePositions[i]!;
          this.pushTrack({
            kind: 'ring',
            startTick,
            durationSec: 0.45,
            fromX: x,
            fromY: y,
            x: tp.x,
            y: tp.y,
            fromRadius: 12,
            toRadius: 56,
            color: '#fb7185',
            lineWidth: 4.5,
            glowRadius: 42,
          });
          this.emitRadialBurst(tp.x, tp.y, '#fda4af', 12, 110, 0.32, -30, startTick);
        }
        this.triggerScreenFlash('#e11d48', 0.09, 0.16, startTick);
        break;
      }
      case 'patriarch_seal': {
        for (let i = 0; i < tilePositions.length; i++) {
          const tp = tilePositions[i]!;
          this.pushTrack({
            kind: 'blood_slash',
            startTick,
            durationSec: 0.46,
            fromX: tp.x,
            fromY: tp.y - 40,
            x: tp.x,
            y: tp.y,
            fromRadius: 14,
            toRadius: 62,
            color: '#be123c',
            secondaryColor: '#c084fc',
            lineWidth: 5.5,
            glowRadius: 58,
            gradeRank: 5,
          });
          this.emitRadialBurst(tp.x, tp.y, '#e11d48', 16, 150, 0.36, 0, startTick);
        }
        break;
      }
      case 'patriarch_summon': {
        this.pushTrack({
          kind: 'heavenly_demon',
          startTick,
          durationSec: 0.56,
          fromX: x,
          fromY: y,
          x,
          y,
          fromRadius: 20,
          toRadius: 110,
          color: '#be123c',
          secondaryColor: '#fde047',
          lineWidth: 6.5,
          glowRadius: 92,
          gradeRank: 6,
        });
        this.emitRadialBurst(x, y, '#f43f5e', 24, 190, 0.42, -25, startTick);
        this.triggerScreenFlash('#be123c', 0.12, 0.18, startTick);
        break;
      }
      case 'dragon_thunder_warn': {
        this.pushTrack({
          kind: 'emperor_thunder',
          startTick,
          durationSec: 0.5,
          fromX: x,
          fromY: y,
          x,
          y,
          fromRadius: 18,
          toRadius: 88,
          color: '#38bdf8',
          secondaryColor: '#fde047',
          lineWidth: 5.5,
          glowRadius: 72,
          gradeRank: 5,
        });
        for (let i = 0; i < tilePositions.length; i++) {
          const tp = tilePositions[i]!;
          this.pushTrack({
            kind: 'ring',
            startTick,
            durationSec: 0.46,
            fromX: x,
            fromY: y,
            x: tp.x,
            y: tp.y,
            fromRadius: 12,
            toRadius: 56,
            color: '#38bdf8',
            lineWidth: 4.5,
            glowRadius: 44,
          });
          this.emitRadialBurst(tp.x, tp.y, '#bae6fd', 12, 115, 0.32, -25, startTick);
        }
        this.triggerScreenFlash('#38bdf8', 0.08, 0.15, startTick);
        break;
      }
      case 'dragon_thunder_strike': {
        for (let i = 0; i < tilePositions.length; i++) {
          const tp = tilePositions[i]!;
          this.pushTrack({
            kind: 'emperor_thunder',
            startTick,
            durationSec: 0.48,
            fromX: tp.x,
            fromY: tp.y - 60,
            x: tp.x,
            y: tp.y,
            fromRadius: 14,
            toRadius: 64,
            color: '#0284c7',
            secondaryColor: '#fde047',
            lineWidth: 5.5,
            glowRadius: 60,
            gradeRank: 5,
          });
          this.emitRadialBurst(tp.x, tp.y, '#38bdf8', 16, 155, 0.36, 0, startTick);
        }
        break;
      }
      case 'dragon_backfire': {
        this.pushTrack({
          kind: 'armor_shatter',
          startTick,
          durationSec: 0.62,
          fromX: x,
          fromY: y - 48,
          x,
          y,
          fromRadius: 20,
          toRadius: 105,
          color: '#fde047',
          secondaryColor: '#38bdf8',
          lineWidth: 6.5,
          glowRadius: 92,
          gradeRank: 6,
        });
        this.emitRadialBurst(x, y, '#fde047', 24, 195, 0.42, 15, startTick);
        this.emitRadialBurst(x, y, '#38bdf8', 16, 160, 0.36, 10, startTick);
        this.triggerScreenFlash('#fde047', 0.12, 0.18, startTick);
        break;
      }
      case 'dragon_tempest': {
        this.pushTrack({
          kind: 'emperor_thunder',
          startTick,
          durationSec: 0.56,
          fromX: x,
          fromY: y,
          x,
          y,
          fromRadius: 22,
          toRadius: 170,
          color: '#38bdf8',
          secondaryColor: '#fef08a',
          lineWidth: 6,
          glowRadius: 92,
          gradeRank: 5,
        });
        this.emitRadialBurst(x, y, '#67e8f9', 22, 185, 0.38, 0, startTick);
        break;
      }
      case 'phoenix_rebirth_egg': {
        this.pushTrack({
          kind: 'demonic_flame',
          startTick,
          durationSec: 0.52,
          fromX: x,
          fromY: y,
          x,
          y,
          fromRadius: 18,
          toRadius: 96,
          color: '#fb923c',
          secondaryColor: '#fde047',
          lineWidth: 5.8,
          glowRadius: 76,
          gradeRank: 5,
        });
        this.emitRadialBurst(x, y, '#fdba74', 20, 150, 0.38, -35, startTick);
        break;
      }
      case 'phoenix_rebirth_heal': {
        this.pushTrack({
          kind: 'qi_resonance',
          startTick,
          durationSec: 0.56,
          fromX: x,
          fromY: y,
          x,
          y,
          fromRadius: 20,
          toRadius: 88,
          color: '#f97316',
          lineWidth: 5.5,
          glowRadius: 68,
        });
        this.emitRadialBurst(x, y, '#fde047', 20, 140, 0.42, -85, startTick);
        break;
      }
      case 'phoenix_shatter': {
        this.pushTrack({
          kind: 'armor_shatter',
          startTick,
          durationSec: 0.65,
          fromX: x,
          fromY: y,
          x,
          y,
          fromRadius: 20,
          toRadius: 108,
          color: '#fde047',
          secondaryColor: '#ef4444',
          lineWidth: 6.5,
          glowRadius: 92,
          gradeRank: 6,
        });
        this.emitRadialBurst(x, y, '#fde047', 24, 200, 0.44, 15, startTick);
        this.emitRadialBurst(x, y, '#fb923c', 16, 165, 0.38, 10, startTick);
        this.triggerScreenFlash('#fb923c', 0.12, 0.18, startTick);
        break;
      }
    }
  }

  /**
   * 3-Hero Trinity Ultimate Combo (삼재 합체기 / 태고 합체기):
   * Converging tri-element qi beams from every participating hero into a central Bagua detonation!
   */
  public spawnTrinityComboFx(
    casterPositions: ReadonlyArray<{ readonly x: number; readonly y: number }>,
    x: number,
    y: number,
    radius: number,
    color: string,
    startTick: number,
  ): void {
    const beamColors = ['#38bdf8', '#4ade80', '#f43f5e'];
    for (let i = 0; i < casterPositions.length; i++) {
      const pos = casterPositions[i]!;
      const bCol = beamColors[i % beamColors.length]!;
      this.pushTrack({
        kind: 'trinity_beam',
        startTick,
        durationSec: 0.62,
        fromX: pos.x,
        fromY: pos.y - 18,
        x,
        y,
        fromRadius: 18,
        toRadius: Math.min(165, Math.max(96, radius * 0.64)),
        color: bCol,
        secondaryColor: color,
        lineWidth: 6.2,
        glowRadius: i === 0 ? 115 : 0,
        gradeRank: 6,
      });
      this.emitRadialBurst(pos.x, pos.y - 18, bCol, 10, 145, 0.34, 0, startTick);
    }
    this.emitRadialBurst(x, y, '#fde047', 26, 225, 0.45, 0, startTick);
  }

  public spawnHitFx(
    entityId: number,
    x: number,
    y: number,
    damage: number,
    color: string,
    slain: boolean,
    isCrit: boolean,
    startTick: number,
    isSkill = false,
    armorBroken = false,
    justShattered = false,
    weaponStyle: WeaponMotionStyle = 'sword',
    fromX = x,
    fromY = y,
    secondaryColor = '#fde047',
    passiveProc?: PassiveProcKind,
  ): void {
    const burstCount = slain ? 16 : isCrit ? 12 : isSkill ? 9 : 6;
    const burstColor = isCrit ? '#facc15' : armorBroken ? '#e879f9' : color;
    this.emitRadialBurst(
      x,
      y,
      burstColor,
      burstCount,
      slain ? 175 : isCrit ? 158 : 112,
      isCrit || slain ? 0.3 : 0.23,
      20,
      startTick,
    );

    // Directional kinetic sparks spraying along the strike vector
    const hitDx = x - fromX;
    const hitDy = y - fromY;
    const hasDir = Math.abs(hitDx) + Math.abs(hitDy) > 2;
    const strikeAng = hasDir
      ? Math.atan2(hitDy, hitDx)
      : (((startTick * 37 + Math.round(x) * 7) % 10) - 5) * 0.24 - Math.PI * 0.24;
    this.emitDirectionalSparks(
      x,
      y,
      strikeAng,
      isCrit ? '#fffbeb' : secondaryColor,
      slain ? 8 : isCrit ? 7 : isSkill ? 5 : 3,
      isCrit || slain ? 210 : 155,
      isCrit || slain ? 0.24 : 0.18,
      startTick,
    );

    if (armorBroken) {
      this.emitRadialBurst(x, y, '#f43f5e', 5, 136, 0.24, 12, startTick);
    }

    if (justShattered) {
      // Protective qi shattered! Pop '破' seal + exploding amethyst-crimson shield shards
      this.pushTrack({
        kind: 'armor_shatter',
        startTick,
        durationSec: 0.54,
        fromX: x,
        fromY: y,
        x,
        y,
        fromRadius: 12,
        toRadius: 56,
        color: '#c084fc',
        secondaryColor: '#f43f5e',
        lineWidth: 4.5,
        glowRadius: 48,
      });
      this.emitRadialBurst(x, y, '#f0abfc', 14, 165, 0.34, 24, startTick);
    }

    if (isCrit || isSkill || slain) {
      this.emitRadialBurst(x, y, '#fffbeb', isCrit ? 6 : 4, 132, 0.21, 0, startTick);
      this.pushTrack({
        kind: 'hit_slash',
        weaponStyle,
        startTick,
        durationSec: isCrit ? 0.29 : 0.24,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 10,
        toRadius: isCrit ? 52 : slain ? 42 : 36,
        color: isCrit ? '#facc15' : armorBroken ? '#e879f9' : color,
        secondaryColor: isCrit ? '#fb923c' : armorBroken ? '#f43f5e' : secondaryColor,
        lineWidth: isCrit ? 5.2 : 3.8,
        glowRadius: isCrit ? 40 : 24,
      });
      if (isCrit || slain) {
        this.pushTrack({
          kind: 'ring',
          startTick,
          durationSec: 0.24,
          fromX: x,
          fromY: y,
          x,
          y,
          fromRadius: 10,
          toRadius: isCrit ? 42 : 36,
          color: isCrit ? '#fde047' : '#fb7185',
          lineWidth: 3.4,
          glowRadius: 0,
        });
      }
    } else {
      // Bespoke per-weapon normal hit impact (fan gale, saber gash, kunai puncture, fist shockwave, etc.)
      this.pushTrack({
        kind: 'hit_slash',
        weaponStyle,
        startTick,
        durationSec: 0.19,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 7,
        toRadius: 28,
        color: armorBroken ? '#e879f9' : color,
        secondaryColor,
        lineWidth: 3.0,
        glowRadius: 15,
      });
    }

    // Nudge floating damage numbers 14px outward from arena center (360, 404) onto the outer corridor
    // so damage numbers never overlap deployed heroes on the 6x3 inner grid!
    const outDx = x - 360;
    const outDy = y - 404;
    const outLen = Math.hypot(outDx, outDy) || 1;
    const dmgX = Math.max(56, Math.min(LOGICAL_WIDTH - 56, x + (outDx / outLen) * 14));
    const dmgY = Math.max(88, y - 24 + (outDy < -80 ? -6 : 0));

    this.spawnOrMergeDamageText(
      entityId,
      dmgX,
      dmgY,
      damage,
      isCrit,
      isSkill,
      armorBroken,
      slain,
      passiveProc ?? null,
      startTick,
    );
  }

  public showBossWaveBanner(wave: number, bossName: string, realNowMs: number): void {
    const sprite = this.sprites.overlayBanner(
      `boss:${wave}:${bossName}`,
      'boss',
      `⚠️ 영물 강림 · 제${String(wave).padStart(2, '0')}장 ⚠️`,
      `${bossName} 출현!`,
      '#dc2626',
    );
    this.cutIn = null;
    this.banner = {
      startRealMs: realNowMs,
      durationSec: 1.8,
      sprite,
    };
  }

  public showCraftCelebrationBanner(
    gradeName: string,
    unitName: string,
    accentColor: string,
    realNowMs: number,
  ): void {
    const sprite = this.sprites.overlayBanner(
      `craft:${gradeName}:${unitName}`,
      'craft',
      `✦ ${gradeName} 등선 강림! ✦`,
      `${unitName} 합공 대성공!`,
      accentColor,
    );
    this.cutIn = null;
    this.banner = {
      startRealMs: realNowMs,
      durationSec: 1.65,
      sprite,
    };
  }

  /**
   * 1.25s real-time ascension cut-in sash for first craft of each Transcendent/Immortal hero.
   * Renders cleanly in the upper corridor (y=96..224) so the 6x3 hero grid stays unobstructed.
   */
  public showAscensionCutIn(
    unitSprite: HTMLCanvasElement,
    bannerSprite: HTMLCanvasElement,
    accentColor: string,
    realNowMs: number,
  ): void {
    this.banner = null;
    this.cutIn = {
      startRealMs: realNowMs,
      durationSec: 1.25,
      unitSprite,
      bannerSprite,
      accentColor,
    };
  }

  /** Screen shake intentionally disabled so board & units remain completely steady. */
  public triggerScreenShake(_intensity: number, _durationSec: number, _startTick: number): void {
    // No-op by design
  }

  public triggerScreenFlash(
    color: string,
    peakAlpha: number,
    durationSec: number,
    startTick: number,
  ): void {
    this.flash = { startTick, durationSec, color, peakAlpha };
  }

  private pushTrack(cfg: PushTrackConfig): void {
    let effectiveKind = cfg.kind;
    let effectiveToRadius = cfg.toRadius;
    let effectiveGlowRadius = cfg.glowRadius;
    let effectiveIsLargeUltimate = Boolean(cfg.isLargeUltimate);

    // Enforce concurrent large ultimate cap (2 in full mode, 1 in clean readability mode)
    const maxLargeUlt = this.densityMode === 'clean' ? 1 : MAX_CONCURRENT_LARGE_ULTIMATES;
    if (this.densityMode === 'clean' && !effectiveIsLargeUltimate && (cfg.gradeRank ?? 1) <= 4) {
      effectiveToRadius *= 0.78;
      effectiveGlowRadius *= 0.65;
    }
    if (effectiveIsLargeUltimate) {
      let activeUltCount = 0;
      let oldestUltIdx = -1;
      for (let i = 0; i < this.activeTracks.length; i++) {
        if (this.activeTracks[i]!.isLargeUltimate) {
          activeUltCount++;
          if (oldestUltIdx < 0) oldestUltIdx = i;
        }
      }
      if (activeUltCount >= maxLargeUlt) {
        const oldestUlt = oldestUltIdx >= 0 ? this.activeTracks[oldestUltIdx] : undefined;
        if (oldestUlt && oldestUlt.progress >= 0.35) {
          this.activeTracks.splice(oldestUltIdx, 1);
          this.trackPool.release(oldestUlt);
        } else {
          effectiveKind = 'ring';
          effectiveToRadius = Math.min(76, cfg.toRadius * 0.55);
          effectiveGlowRadius = Math.min(48, cfg.glowRadius * 0.6);
          effectiveIsLargeUltimate = false;
        }
      }
    }

    if (this.activeTracks.length >= MAX_VFX_INSTANCES) {
      const oldest = this.activeTracks.shift();
      if (oldest) {
        this.trackPool.release(oldest);
      }
    }
    const inst = this.trackPool.acquire();
    inst.kind = effectiveKind;
    inst.weaponStyle = cfg.weaponStyle ?? 'sword';
    inst.startTick = cfg.startTick;
    inst.durationSec = cfg.durationSec;
    inst.fromX = cfg.fromX;
    inst.fromY = cfg.fromY;
    inst.x = cfg.x;
    inst.y = cfg.y;
    inst.fromRadius = cfg.fromRadius;
    inst.toRadius = effectiveToRadius;
    inst.color = cfg.color;
    inst.secondaryColor = cfg.secondaryColor ?? '#fde047';
    inst.lineWidth = cfg.lineWidth;
    inst.glowRadius = effectiveGlowRadius;
    inst.gradeRank = cfg.gradeRank ?? 1;
    inst.isLargeUltimate = effectiveIsLargeUltimate;
    inst.renderableGround.sortY = cfg.y;
    inst.renderableAir.sortY = cfg.y;
    this.activeTracks.push(inst);
  }

  private renderTrackGround(ctx: CanvasRenderingContext2D, inst: TrackVfxInstance): void {
    if (inst.kind === 'hit_slash') return;

    const p = inst.progress;
    const inv = 1 - p;
    const radius = inst.fromRadius + (inst.toRadius - inst.fromRadius) * easeOutCubic(p);
    const prevAlpha = ctx.globalAlpha;

    if (renderSkillGround(ctx, inst, radius, inv)) {
      ctx.globalAlpha = prevAlpha;
      return;
    }

    if (inst.kind === 'qi_resonance') {
      // Elliptical martial cultivation resonance aura under hero's feet
      ctx.globalAlpha = inv * 0.9;
      ctx.beginPath();
      ctx.ellipse(inst.x, inst.y, radius, radius * 0.42, 0, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(2, (inst.lineWidth + 3) * inv);
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();
      ctx.lineWidth = Math.max(1.4, inst.lineWidth * inv);
      ctx.strokeStyle = inst.color;
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(inst.x, inst.y, radius * 0.65, radius * 0.27, 0, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1.2, 2.5 * inv);
      ctx.strokeStyle = '#fde047';
      ctx.stroke();
      ctx.globalAlpha = prevAlpha;
      return;
    }

    // Crisp outer dark-ink outline ring + colored shockwave ring for core non-skill tracks
    ctx.globalAlpha = inv * 0.85;
    ctx.beginPath();
    ctx.arc(inst.x, inst.y, radius, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(2, (inst.lineWidth + 3) * inv);
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(inst.x, inst.y, radius, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1.2, inst.lineWidth * inv);
    ctx.strokeStyle = inst.color;
    ctx.stroke();

    if (inst.kind === 'craft_pillar') {
      ctx.beginPath();
      ctx.arc(inst.x, inst.y, radius * 0.62, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1.2, inst.lineWidth * 0.7 * inv);
      ctx.strokeStyle = inst.secondaryColor;
      ctx.stroke();
    }

    ctx.globalAlpha = prevAlpha;
  }

  private renderTrackAir(ctx: CanvasRenderingContext2D, inst: TrackVfxInstance): void {
    const p = inst.progress;
    const inv = 1 - p;
    const prevAlpha = ctx.globalAlpha;

    if (inst.glowRadius > 0) {
      const glow = this.sprites.glow(inst.color, inst.glowRadius);
      const r = inst.glowRadius * (0.7 + p * 0.4);
      ctx.globalAlpha = inv * 0.45;
      ctx.drawImage(glow, inst.x - r, inst.y - r, r * 2, r * 2);
    }

    if (renderSkillAir(ctx, inst, this.skillRenderCtx)) {
      ctx.globalAlpha = prevAlpha;
      return;
    }

    switch (inst.kind) {
      case 'craft_pillar': {
        const colW = Math.max(6, (1 - p * 0.65) * 34);
        const colH = 190 * easeOutCubic(Math.min(1, p * 2.2));
        ctx.globalAlpha = inv * 0.82;
        ctx.fillStyle = PIXEL_OUTLINE;
        ctx.fillRect(inst.x - colW - 2, inst.y - colH, colW * 2 + 4, colH + 14);
        ctx.fillStyle = inst.color;
        ctx.fillRect(inst.x - colW, inst.y - colH, colW * 2, colH + 12);
        ctx.fillStyle = '#fffbeb';
        ctx.fillRect(inst.x - colW * 0.4, inst.y - colH, colW * 0.8, colH + 8);
        break;
      }

      case 'trinity_beam': {
        // Converging 3-Hero Trinity Qi Beam from hero position -> target + central Bagua sigil
        const reach = easeOutCubic(Math.min(1, p * 2.6));
        const bx = inst.fromX + (inst.x - inst.fromX) * reach;
        const by = inst.fromY + (inst.y - inst.fromY) * reach;
        const midX = (inst.fromX + bx) * 0.5;
        const midY = (inst.fromY + by) * 0.5 - 32 * inv;

        ctx.globalAlpha = inv * 0.95;
        ctx.beginPath();
        ctx.moveTo(inst.fromX, inst.fromY);
        ctx.quadraticCurveTo(midX, midY, bx, by);
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(2.4, 9.5 * inv);
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.lineWidth = Math.max(1.5, 5.4 * inv);
        ctx.strokeStyle = inst.color;
        ctx.stroke();
        ctx.lineWidth = Math.max(1, 2.2 * inv);
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        // Central Trinity hexagram ring (rendered once on lead beam with glowRadius > 0)
        if (inst.glowRadius > 0) {
          const sigR = inst.fromRadius + (inst.toRadius - inst.fromRadius) * easeOutCubic(p);
          ctx.save();
          ctx.translate(inst.x, inst.y);
          ctx.rotate(p * 3.6);
          for (let tri = 0; tri < 2; tri++) {
            ctx.beginPath();
            for (let v = 0; v < 3; v++) {
              const va = tri * Math.PI + (v * Math.PI * 2) / 3;
              const vx = Math.cos(va) * sigR * 0.78;
              const vy = Math.sin(va) * sigR * 0.78;
              if (v === 0) ctx.moveTo(vx, vy);
              else ctx.lineTo(vx, vy);
            }
            ctx.closePath();
            ctx.lineWidth = Math.max(2, 5.2 * inv);
            ctx.strokeStyle = PIXEL_OUTLINE;
            ctx.stroke();
            ctx.lineWidth = Math.max(1.2, 2.6 * inv);
            ctx.strokeStyle = tri === 0 ? '#fde047' : inst.secondaryColor;
            ctx.stroke();
          }
          ctx.restore();
        }
        break;
      }

      case 'hit_slash': {
        // 10 Bespoke Per-Weapon Calligraphic Hit / Damage Impact VFX oriented along attack trajectory!
        const isHeavy = inst.lineWidth >= 3.4;
        const slashR = inst.fromRadius + (inst.toRadius - inst.fromRadius) * easeOutCubic(p);
        const hasDir = Math.abs(inst.x - inst.fromX) + Math.abs(inst.y - inst.fromY) > 2;
        const aimAng = hasDir
          ? Math.atan2(inst.y - inst.fromY, inst.x - inst.fromX)
          : (((inst.startTick * 37 + Math.round(inst.x) * 7) % 10) - 5) * 0.24 - Math.PI * 0.24;
        const sliceHead = easeOutCubic(Math.min(1, p * 2.2));
        const sliceTail = easeOutCubic(Math.max(0, (p - 0.14) / 0.86));
        ctx.globalAlpha = inv * 0.99;

        // Calligraphic razor-tapered curved slash polygon (needle tips, dark ink outline, luminous core)
        const drawTaperedSlash = (
          cx: number,
          cy: number,
          ang: number,
          halfLen: number,
          maxThick: number,
          curveBow: number,
          fillCol: string,
          coreCol: string,
        ): void => {
          const t0 = -1 + sliceTail * 1.45;
          const t1 = -1 + sliceHead * 2.0;
          if (t1 - t0 <= 0.06) return;
          const startL = halfLen * t0;
          const endL = halfLen * t1;
          const midL = (startL + endL) * 0.5;
          const w = Math.max(1.2, maxThick * inv);
          const bow = curveBow * (0.65 + 0.35 * inv);

          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(ang);

          // Outer dark-ink outline + saturated blade body
          ctx.beginPath();
          ctx.moveTo(startL, 0);
          ctx.quadraticCurveTo(midL, bow - w, endL, 0);
          ctx.quadraticCurveTo(midL, bow + w * 0.72, startL, 0);
          ctx.closePath();
          ctx.fillStyle = fillCol;
          ctx.fill();
          ctx.lineWidth = Math.max(1.6, 2.5 * inv);
          ctx.lineJoin = 'round';
          ctx.strokeStyle = PIXEL_OUTLINE;
          ctx.stroke();

          // Blinding inner razor highlight spine
          const coreStart = startL + (endL - startL) * 0.14;
          const coreEnd = endL - (endL - startL) * 0.08;
          const coreMid = (coreStart + coreEnd) * 0.5;
          ctx.beginPath();
          ctx.moveTo(coreStart, 0);
          ctx.quadraticCurveTo(coreMid, bow - w * 0.42, coreEnd, 0);
          ctx.quadraticCurveTo(coreMid, bow + w * 0.24, coreStart, 0);
          ctx.closePath();
          ctx.fillStyle = coreCol;
          ctx.fill();

          ctx.restore();
        };

        // Crisp 4-point concave anime/Wuxia impact starburst flare
        const drawImpactStar = (
          cx: number,
          cy: number,
          ang: number,
          majorR: number,
          minorR: number,
          fillCol: string,
        ): void => {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(ang);
          const waist = Math.max(1.6, minorR * 0.26);
          ctx.beginPath();
          ctx.moveTo(majorR, 0);
          ctx.quadraticCurveTo(waist, waist, 0, minorR);
          ctx.quadraticCurveTo(-waist, waist, -majorR, 0);
          ctx.quadraticCurveTo(-waist, -waist, 0, -minorR);
          ctx.quadraticCurveTo(waist, -waist, majorR, 0);
          ctx.closePath();
          ctx.fillStyle = fillCol;
          ctx.fill();
          ctx.lineWidth = Math.max(1.4, 2.0 * inv);
          ctx.strokeStyle = PIXEL_OUTLINE;
          ctx.stroke();
          ctx.restore();
        };

        switch (inst.weaponStyle) {
          case 'fan': {
            // 부채꼴 독풍/빙풍 파열 + 5방 예리한 침격 (Snapping fan gale + 5 tapered dart needles!)
            ctx.save();
            ctx.translate(inst.x, inst.y);
            ctx.rotate(aimAng);
            const fr = slashR * 1.08;
            const span = 0.88;
            const pivotX = -fr * 0.36;

            ctx.beginPath();
            ctx.arc(pivotX, 0, fr, -span, span);
            ctx.arc(pivotX, 0, fr * 0.42, span, -span, true);
            ctx.closePath();
            ctx.fillStyle = hexWithAlpha(inst.color, 0.42 * inv);
            ctx.fill();

            ctx.beginPath();
            ctx.arc(pivotX, 0, fr, -span, span);
            ctx.lineCap = 'round';
            ctx.lineWidth = Math.max(1.8, (inst.lineWidth + 3.4) * inv);
            ctx.strokeStyle = PIXEL_OUTLINE;
            ctx.stroke();
            ctx.lineWidth = Math.max(1.1, (inst.lineWidth + 0.4) * inv);
            ctx.strokeStyle = inst.secondaryColor;
            ctx.stroke();
            ctx.lineWidth = Math.max(0.9, 1.5 * inv);
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();

            for (let k = -2; k <= 2; k++) {
              const na = k * 0.36;
              const n0 = fr * (0.28 + sliceTail * 0.42);
              const n1 = fr * (0.48 + sliceHead * 0.82);
              const nx = pivotX + Math.cos(na) * ((n0 + n1) * 0.5);
              const ny = Math.sin(na) * ((n0 + n1) * 0.5);
              const nHalf = Math.max(3, (n1 - n0) * 0.5);
              ctx.save();
              ctx.translate(nx, ny);
              ctx.rotate(na);
              const nw = Math.max(1.3, (k === 0 ? 3.2 : 2.3) * inv);
              ctx.beginPath();
              ctx.moveTo(-nHalf, 0);
              ctx.lineTo(0, -nw);
              ctx.lineTo(nHalf, 0);
              ctx.lineTo(0, nw);
              ctx.closePath();
              ctx.fillStyle = k === 0 ? '#ffffff' : k % 2 === 0 ? inst.secondaryColor : inst.color;
              ctx.fill();
              ctx.lineWidth = 1.4;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.restore();
            }
            ctx.restore();
            break;
          }

          case 'dual_sword': {
            // 쌍검 X자 교차 이단참 (Staggered razor twin-blade X-scissor tapered slashes!)
            const a1 = aimAng + 0.64;
            const a2 = aimAng - 0.64;
            drawTaperedSlash(
              inst.x,
              inst.y,
              a1,
              slashR * 1.15,
              inst.lineWidth * 1.55,
              -5.5,
              inst.color,
              '#ffffff',
            );
            drawTaperedSlash(
              inst.x,
              inst.y,
              a2,
              slashR * 1.06,
              inst.lineWidth * 1.42,
              5.5,
              inst.secondaryColor,
              '#fffbeb',
            );
            break;
          }

          case 'flying_sword': {
            // 어검 삼중 비검 관통광 (3 converging tapered spirit-sword light lances + crisp seal ring!)
            const sealR = slashR * 0.44;
            ctx.beginPath();
            ctx.arc(inst.x, inst.y, sealR, 0, Math.PI * 2);
            ctx.lineWidth = Math.max(1.2, 3.0 * inv);
            ctx.strokeStyle = PIXEL_OUTLINE;
            ctx.stroke();
            ctx.lineWidth = Math.max(0.9, 1.6 * inv);
            ctx.strokeStyle = inst.secondaryColor;
            ctx.stroke();

            for (let k = -1; k <= 1; k++) {
              const ba = aimAng + k * 0.42;
              const len = slashR * (k === 0 ? 1.28 : 1.02);
              drawTaperedSlash(
                inst.x,
                inst.y,
                ba,
                len,
                inst.lineWidth * (k === 0 ? 1.38 : 1.05),
                k * 3.2,
                k === 0 ? inst.color : inst.secondaryColor,
                '#ffffff',
              );
            }
            break;
          }

          case 'saber': {
            // 패도·대도 반달 중참격 (Thick sweeping curved heavy-cleave crescent + blazing inner spine!)
            const flip = (inst.startTick & 1) === 0 ? 1 : -1;
            ctx.save();
            ctx.translate(inst.x, inst.y);
            ctx.rotate(aimAng + flip * 0.34);
            const cr = slashR * 1.04;
            const a0 = -1.02;
            const a1 = -1.02 + 2.04 * sliceHead;
            ctx.beginPath();
            ctx.arc(-cr * 0.26, 0, cr, a0, a1);
            ctx.quadraticCurveTo(
              cr * 0.14,
              0,
              -cr * 0.26 + Math.cos(a0) * cr,
              Math.sin(a0) * cr,
            );
            ctx.closePath();
            ctx.fillStyle = inst.color;
            ctx.fill();
            ctx.lineWidth = Math.max(1.6, 3.0 * inv);
            ctx.strokeStyle = PIXEL_OUTLINE;
            ctx.stroke();

            // Glowing white-gold razor edge along outer belly
            ctx.beginPath();
            ctx.arc(-cr * 0.26, 0, cr - 2.2, a0 + 0.18, a1);
            ctx.lineCap = 'round';
            ctx.lineWidth = Math.max(1.4, (isHeavy ? 3.2 : 2.3) * inv);
            ctx.strokeStyle = isHeavy ? '#ffffff' : inst.secondaryColor;
            ctx.stroke();

            // Outer shockwave echo line
            ctx.beginPath();
            ctx.arc(-cr * 0.26, 0, cr + 5, a0 + 0.24, a1 - 0.1);
            ctx.lineCap = 'round';
            ctx.lineWidth = Math.max(1, 1.8 * inv);
            ctx.strokeStyle = hexWithAlpha(inst.secondaryColor, 0.85);
            ctx.stroke();
            ctx.restore();
            break;
          }

          case 'spear_staff': {
            // 창·봉 관통 충격파 (Razor tapered lance beam + dual tilted sonic shock rings!)
            drawTaperedSlash(
              inst.x + Math.cos(aimAng) * slashR * 0.12,
              inst.y + Math.sin(aimAng) * slashR * 0.12,
              aimAng,
              slashR * 1.24,
              inst.lineWidth * 1.5,
              0,
              inst.color,
              '#ffffff',
            );

            ctx.save();
            ctx.translate(inst.x, inst.y);
            ctx.rotate(aimAng);
            for (let ring = 0; ring < 2; ring++) {
              const rxPos = (ring === 0 ? -0.14 : 0.22) * slashR;
              const ringH = slashR * (ring === 0 ? 0.72 : 0.48);
              ctx.beginPath();
              ctx.ellipse(rxPos, 0, Math.max(2, slashR * 0.19), ringH, 0, 0, Math.PI * 2);
              ctx.lineWidth = Math.max(1.3, 3.2 * inv);
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.lineWidth = Math.max(1, 1.8 * inv);
              ctx.strokeStyle = ring === 0 ? inst.secondaryColor : '#ffffff';
              ctx.stroke();
            }
            ctx.restore();
            break;
          }

          case 'palm_fist': {
            // 권풍·경타 파열원진 (Concussive dual shockwave ring + 8 tapered radial impact spikes!)
            const pr = slashR * 0.86;
            ctx.beginPath();
            ctx.arc(inst.x, inst.y, pr, 0, Math.PI * 2);
            ctx.lineWidth = Math.max(1.6, (inst.lineWidth + 4.2) * inv);
            ctx.strokeStyle = PIXEL_OUTLINE;
            ctx.stroke();
            ctx.lineWidth = Math.max(1.2, (inst.lineWidth + 1.1) * inv);
            ctx.strokeStyle = inst.color;
            ctx.stroke();

            if (isHeavy) {
              ctx.beginPath();
              ctx.arc(inst.x, inst.y, pr * 0.56, 0, Math.PI * 2);
              ctx.lineWidth = Math.max(1, 2.2 * inv);
              ctx.strokeStyle = '#ffffff';
              ctx.stroke();
            }

            const spikes = isHeavy ? 8 : 6;
            for (let rIdx = 0; rIdx < spikes; rIdx++) {
              const ra = aimAng + (rIdx * Math.PI * 2) / spikes;
              const r0 = pr * 0.42;
              const r1 = pr * (rIdx % 2 === 0 ? 1.34 : 1.08);
              const mx = inst.x + Math.cos(ra) * ((r0 + r1) * 0.5);
              const my = inst.y + Math.sin(ra) * ((r0 + r1) * 0.5);
              const halfS = (r1 - r0) * 0.5;
              const sw = Math.max(1.2, (rIdx % 2 === 0 ? 3.2 : 2.2) * inv);
              ctx.save();
              ctx.translate(mx, my);
              ctx.rotate(ra);
              ctx.beginPath();
              ctx.moveTo(-halfS, 0);
              ctx.lineTo(0, -sw);
              ctx.lineTo(halfS, 0);
              ctx.lineTo(0, sw);
              ctx.closePath();
              ctx.fillStyle = rIdx % 2 === 0 ? '#ffffff' : inst.secondaryColor;
              ctx.fill();
              ctx.lineWidth = 1.4;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.restore();
            }
            break;
          }

          case 'dagger_hidden': {
            // 암기·독비수 3연 관통흔 (3 offset needle-tapered kunai puncture cuts!)
            for (let d = -1; d <= 1; d++) {
              const da = aimAng + d * 0.26;
              const offPerp = d * 5.2;
              const px = inst.x + Math.cos(aimAng + Math.PI * 0.5) * offPerp;
              const py = inst.y + Math.sin(aimAng + Math.PI * 0.5) * offPerp;
              const len = slashR * (d === 0 ? 1.15 : 0.88);
              drawTaperedSlash(
                px,
                py,
                da,
                len,
                (d === 0 ? 3.6 : 2.6) * (isHeavy ? 1.25 : 1),
                0,
                d < 0 ? inst.color : inst.secondaryColor,
                '#ffffff',
              );
            }
            break;
          }

          case 'staff_gourd': {
            // 독호리병 맹독 기포 파열 (Splashing emerald-violet venom crown + glossy bubbles!)
            const vr = slashR * 0.82;
            ctx.beginPath();
            ctx.arc(inst.x, inst.y, vr, 0, Math.PI * 2);
            ctx.fillStyle = hexWithAlpha(inst.color, 0.36 * inv);
            ctx.fill();
            ctx.lineWidth = Math.max(1.5, 3.4 * inv);
            ctx.strokeStyle = PIXEL_OUTLINE;
            ctx.stroke();
            ctx.lineWidth = Math.max(1, 2.0 * inv);
            ctx.strokeStyle = inst.color;
            ctx.stroke();

            for (let b = 0; b < 6; b++) {
              const ba = (b * Math.PI * 2) / 6 + p * 1.5;
              const bx = inst.x + Math.cos(ba) * vr * (0.68 + (b % 2) * 0.2);
              const by = inst.y + Math.sin(ba) * vr * 0.62 - p * 12;
              const br = Math.max(2.0, (4.8 - (b % 2)) * inv);
              ctx.beginPath();
              ctx.arc(bx, by, br, 0, Math.PI * 2);
              ctx.fillStyle = b % 2 === 0 ? inst.color : inst.secondaryColor;
              ctx.fill();
              ctx.lineWidth = 1.5;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              // Bubble specular highlight
              ctx.beginPath();
              ctx.arc(bx - br * 0.3, by - br * 0.3, Math.max(0.8, br * 0.32), 0, Math.PI * 2);
              ctx.fillStyle = '#ffffff';
              ctx.fill();
            }
            break;
          }

          case 'sorcery_qi': {
            // 마교 혈마구·마염 폭발 (Dark-crimson void core + jagged hellfire lightning + arcs!)
            const mr = slashR * 0.9;
            ctx.beginPath();
            ctx.arc(inst.x, inst.y, mr * 0.44, 0, Math.PI * 2);
            ctx.fillStyle = PIXEL_OUTLINE;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(inst.x, inst.y, mr * 0.28, 0, Math.PI * 2);
            ctx.fillStyle = '#fde047';
            ctx.fill();

            for (let ring = 0; ring < 2; ring++) {
              const aStart = (ring === 0 ? 1 : -1) * p * 5.2 + ring * Math.PI;
              ctx.beginPath();
              ctx.arc(inst.x, inst.y, mr * (0.7 + ring * 0.26), aStart, aStart + Math.PI * 1.28);
              ctx.lineCap = 'round';
              ctx.lineWidth = Math.max(1.5, 4.6 * inv);
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.lineWidth = Math.max(1, 2.3 * inv);
              ctx.strokeStyle = ring === 0 ? inst.color : inst.secondaryColor;
              ctx.stroke();
            }

            // 4 jagged demonic crackle arcs radiating outward
            for (let j = 0; j < 4; j++) {
              const ja = aimAng + (j * Math.PI) / 2 + 0.4;
              const jx1 = inst.x + Math.cos(ja + 0.25) * mr * 0.56;
              const jy1 = inst.y + Math.sin(ja + 0.25) * mr * 0.56;
              const jx2 = inst.x + Math.cos(ja - 0.12) * mr * 1.12;
              const jy2 = inst.y + Math.sin(ja - 0.12) * mr * 1.12;
              ctx.beginPath();
              ctx.moveTo(inst.x, inst.y);
              ctx.lineTo(jx1, jy1);
              ctx.lineTo(jx2, jy2);
              ctx.lineWidth = Math.max(1, 2.0 * inv);
              ctx.strokeStyle = j % 2 === 0 ? '#ffffff' : inst.secondaryColor;
              ctx.stroke();
            }
            break;
          }

          case 'sword':
          default: {
            // 정통 명검 일섬 (Curved calligraphic sword cut + heavy X-cross flash & outer shock-arc!)
            const flip = ((inst.startTick + Math.round(inst.x)) & 1) === 0 ? 1 : -1;
            const cutAng = aimAng + flip * 0.36;
            drawTaperedSlash(
              inst.x,
              inst.y,
              cutAng,
              slashR * 1.22,
              inst.lineWidth * 1.65,
              flip * 6.2,
              inst.color,
              '#ffffff',
            );

            if (isHeavy) {
              const crossAng = cutAng + Math.PI * 0.54;
              drawTaperedSlash(
                inst.x,
                inst.y,
                crossAng,
                slashR * 0.92,
                inst.lineWidth * 1.32,
                -flip * 4.5,
                inst.secondaryColor,
                '#fffbeb',
              );
            }
            break;
          }
        }

        // Sharp 4-point concave anime/Wuxia impact starburst flare during initial hit frames
        if (p < 0.56) {
          const starInv = 1 - p / 0.56;
          const majorR = (isHeavy ? 22 : 14) * starInv;
          const minorR = (isHeavy ? 11 : 7) * starInv;
          drawImpactStar(inst.x, inst.y, aimAng, majorR, minorR, '#ffffff');
          if (isHeavy && p < 0.36) {
            const flashRingR = slashR * (0.45 + (p / 0.36) * 0.55);
            ctx.beginPath();
            ctx.arc(inst.x, inst.y, flashRingR, 0, Math.PI * 2);
            ctx.lineWidth = Math.max(1.2, 2.4 * (1 - p / 0.36));
            ctx.strokeStyle = '#fffbeb';
            ctx.stroke();
          }
        }
        break;
      }

      case 'armor_shatter': {
        // Protective qi shattered! Exploding diamond crystal shards + rising '破' Hanja seal
        const burstR = inst.fromRadius + (inst.toRadius - inst.fromRadius) * easeOutCubic(p);
        ctx.globalAlpha = inv * 0.96;
        for (let s = 0; s < 6; s++) {
          const ang = (s * Math.PI * 2) / 6 + p * 0.85;
          const sx = inst.x + Math.cos(ang) * burstR * 0.85;
          const sy = inst.y + Math.sin(ang) * burstR * 0.65;
          const sz = (5.5 + (s % 2) * 2) * inv;
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(ang + p * 2.2);
          ctx.fillStyle = PIXEL_OUTLINE;
          ctx.fillRect(-sz - 1.5, -sz * 0.6 - 1.5, sz * 2 + 3, sz * 1.2 + 3);
          ctx.fillStyle = s % 2 === 0 ? inst.color : inst.secondaryColor;
          ctx.fillRect(-sz, -sz * 0.6, sz * 2, sz * 1.2);
          ctx.restore();
        }
        const seal = this.sprites.kanjiSeal('破', inst.secondaryColor);
        const pop = p < 0.22 ? 0.68 + (p / 0.22) * 0.48 : 1.16 - (p - 0.22) * 0.22;
        const size = 66 * pop;
        const liftY = inst.y - 24 - easeOutCubic(p) * 24;
        ctx.globalAlpha = inv * 0.96;
        ctx.drawImage(seal, inst.x - size * 0.5, liftY - size * 0.5, size, size);
        break;
      }

      case 'qi_resonance': {
        // Rising inner-qi cultivation pillars around matching faction units
        const lift = easeOutCubic(p) * 56;
        const w = Math.max(3, 12 * inv);
        ctx.globalAlpha = inv * 0.86;
        for (let k = -1; k <= 1; k++) {
          const ox = inst.x + k * 20;
          const oy = inst.y - 8 - lift - (k === 0 ? 10 : 0);
          const h = (k === 0 ? 34 : 24) * (0.5 + inv * 0.5);
          ctx.fillStyle = PIXEL_OUTLINE;
          ctx.fillRect(ox - w * 0.5 - 1.5, oy - h, w + 3, h + 3);
          ctx.fillStyle = k === 0 ? '#fde047' : inst.color;
          ctx.fillRect(ox - w * 0.5, oy - h + 1.5, w, h);
        }
        break;
      }

      default:
        break;
    }

    ctx.globalAlpha = prevAlpha;
  }

  private emitRadialBurst(
    x: number,
    y: number,
    color: string,
    count: number,
    speed: number,
    lifeSec: number,
    gravity: number,
    startTick: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const idx = this.particleCursor;
      this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;

      const angle = ((i + 0.37) / count) * Math.PI * 2 + (startTick % 17) * 0.19;
      const spdScale = 0.55 + ((i * 7 + startTick) % 11) * 0.055;

      this.pActive[idx] = 1;
      this.pStartTick[idx] = startTick;
      this.pLifeSec[idx] = lifeSec;
      this.pOriginX[idx] = x;
      this.pOriginY[idx] = y;
      this.pVx[idx] = Math.cos(angle) * speed * spdScale;
      this.pVy[idx] = Math.sin(angle) * speed * spdScale;
      this.pGravity[idx] = gravity;
      this.pSize[idx] = 2.8 + (i % 3) * 1.2;
      this.pColor[idx] = color;
    }
  }

  private emitDirectionalSparks(
    x: number,
    y: number,
    baseAngle: number,
    color: string,
    count: number,
    speed: number,
    lifeSec: number,
    startTick: number,
  ): void {
    const mid = (count - 1) * 0.5;
    for (let i = 0; i < count; i++) {
      const idx = this.particleCursor;
      this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;

      const spread = (i - mid) * 0.24 + (((startTick + i * 7) % 5) - 2) * 0.05;
      const angle = baseAngle + spread;
      const spdScale = 0.78 + ((i * 5 + startTick) % 7) * 0.065;

      this.pActive[idx] = 1;
      this.pStartTick[idx] = startTick;
      this.pLifeSec[idx] = lifeSec;
      this.pOriginX[idx] = x;
      this.pOriginY[idx] = y;
      this.pVx[idx] = Math.cos(angle) * speed * spdScale;
      this.pVy[idx] = Math.sin(angle) * speed * spdScale;
      this.pGravity[idx] = 26;
      this.pSize[idx] = 2.6 + (i % 2) * 1.1;
      this.pColor[idx] = i % 3 === 0 ? '#ffffff' : color;
    }
  }

  private spawnOrMergeDamageText(
    entityId: number,
    x: number,
    y: number,
    damage: number,
    isCrit: boolean,
    isSkill: boolean,
    isShred: boolean,
    isKill: boolean,
    passiveProc: PassiveProcKind | null,
    startTick: number,
  ): void {
    // Only merge simultaneous same-tick multi-pellet hits on the exact same monster so rapid volleys fan out visibly
    for (let i = 0; i < this.damageTexts.length; i++) {
      const item = this.damageTexts[i]!;
      if (item.active && item.entityId === entityId && startTick - item.startTick <= 1) {
        item.value += damage;
        item.x = x;
        item.y = y;
        item.isCrit = item.isCrit || isCrit;
        item.isSkill = item.isSkill || isSkill;
        item.isShred = item.isShred || isShred;
        item.isKill = item.isKill || isKill;
        if (passiveProc && (!item.passiveProc || passiveProc === 'execute')) {
          item.passiveProc = passiveProc;
        }
        item.startTick = startTick;
        return;
      }
    }

    for (let i = 0; i < this.damageTexts.length; i++) {
      const item = this.damageTexts[i]!;
      if (!item.active) {
        const slotHash = (entityId * 13 + startTick * 29 + i * 7) & 63;
        item.active = true;
        item.entityId = entityId;
        item.startTick = startTick;
        item.x = x;
        item.y = y;
        item.offsetX = ((slotHash % 9) - 4) * 4.5;
        item.driftVx = ((slotHash % 5) - 2) * 10;
        item.value = damage;
        item.isCrit = isCrit;
        item.isSkill = isSkill;
        item.isShred = isShred;
        item.isKill = isKill;
        item.passiveProc = passiveProc;
        return;
      }
    }
  }

  public collect(currentTick: number, alpha: number, buckets: IRenderable[][]): void {
    this.currentSimTimeSec = (currentTick + alpha) * TICK_DT;

    for (let i = this.activeTracks.length - 1; i >= 0; i--) {
      const tr = this.activeTracks[i]!;
      const elapsed = (currentTick + alpha - tr.startTick) * TICK_DT;
      if (elapsed >= tr.durationSec) {
        this.activeTracks.splice(i, 1);
        this.trackPool.release(tr);
        continue;
      }
      if (elapsed < 0) continue;
      tr.progress = elapsed / tr.durationSec;
      buckets[RenderLayer.GroundFx]!.push(tr.renderableGround);
      buckets[RenderLayer.AirFx]!.push(tr.renderableAir);
    }

    buckets[RenderLayer.AirFx]!.push(this.particleBatchRenderable);
    buckets[RenderLayer.WorldUI]!.push(this.calloutBatchRenderable);
    buckets[RenderLayer.WorldUI]!.push(this.damageBatchRenderable);
  }

  public renderScreenFx(
    stack: CanvasStack,
    currentTick: number,
    alpha: number,
    realNowMs = performance.now(),
  ): void {
    // 1. Keep #shake-layer completely steady (zero screen shake)
    stack.setShakeOffset(0, 0);

    // 2. #overlay-canvas flash + BOSS WAVE / Ascension cut-in / celebration banner
    let flashActive = false;
    let flashAlpha = 0;
    let flashColor = '#ffffff';
    if (this.flash) {
      const elapsed = (currentTick + alpha - this.flash.startTick) * TICK_DT;
      if (elapsed >= this.flash.durationSec || elapsed < 0) {
        this.flash = null;
      } else {
        flashActive = true;
        flashAlpha = this.flash.peakAlpha * (1 - elapsed / this.flash.durationSec);
        flashColor = this.flash.color;
      }
    }

    let cutInActive = false;
    let cutInProgress = 0;
    if (this.cutIn) {
      const realElapsed = (realNowMs - this.cutIn.startRealMs) / 1000;
      if (realElapsed >= this.cutIn.durationSec || realElapsed < 0) {
        this.cutIn = null;
      } else {
        cutInActive = true;
        cutInProgress = realElapsed / this.cutIn.durationSec;
      }
    }

    let bannerActive = false;
    let bannerProgress = 0;
    if (this.banner) {
      const realElapsed = (realNowMs - this.banner.startRealMs) / 1000;
      if (realElapsed >= this.banner.durationSec || realElapsed < 0) {
        this.banner = null;
      } else {
        bannerActive = true;
        bannerProgress = realElapsed / this.banner.durationSec;
      }
    }

    if (!flashActive && !cutInActive && !bannerActive) {
      stack.overlayCtx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      stack.setOverlayActive(false);
      return;
    }

    stack.setOverlayActive(true);
    const ctx = stack.overlayCtx;
    ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    if (flashActive) {
      ctx.globalAlpha = flashAlpha;
      ctx.fillStyle = flashColor;
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      ctx.globalAlpha = 1;
    }

    if (cutInActive && this.cutIn) {
      const cp = cutInProgress;
      let bannerOffsetX = 0;
      let portraitOffsetX = 0;
      let portraitScale = 1;
      let cutAlpha = 1;

      if (cp < 0.14) {
        const t = easeOutCubic(cp / 0.14);
        bannerOffsetX = (1 - t) * 260;
        portraitOffsetX = (1 - t) * -180;
        portraitScale = 1.14 - t * 0.14;
        cutAlpha = Math.min(1, cp / 0.1);
      } else if (cp > 0.78) {
        const t = (cp - 0.78) / 0.22;
        bannerOffsetX = -t * 110;
        portraitOffsetX = -t * 80;
        cutAlpha = 1 - t;
      }

      // Upper corridor band y=96..224 keeps the 6x3 hero grid (y=222..586) unobstructed
      const drawW = 684;
      const drawH = 128;
      const bx = (LOGICAL_WIDTH - drawW) * 0.5 + bannerOffsetX;
      const by = 96;

      ctx.globalAlpha = Math.max(0, Math.min(1, cutAlpha));
      ctx.drawImage(this.cutIn.bannerSprite, bx, by, drawW, drawH);

      // Crisp pixel-art hero portrait sliding into the left medallion halo (x ≈ 0.164 * drawW)
      const pSize = 114 * portraitScale;
      const px = (LOGICAL_WIDTH - drawW) * 0.5 + drawW * 0.164 + portraitOffsetX - pSize * 0.5;
      const py = by + drawH * 0.48 - pSize * 0.5;
      const prevSmooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.cutIn.unitSprite, px, py, pSize, pSize);
      ctx.imageSmoothingEnabled = prevSmooth;

      // Subtle golden rim accent flare at peak entry
      if (cp < 0.28) {
        const rimAlpha = (1 - cp / 0.28) * 0.35;
        ctx.globalAlpha = rimAlpha;
        ctx.strokeStyle = this.cutIn.accentColor;
        ctx.lineWidth = 4;
        ctx.strokeRect(bx + 8, by + 12, drawW - 16, drawH - 24);
      }
      ctx.globalAlpha = 1;
    } else if (bannerActive && this.banner) {
      const bp = bannerProgress;
      let slideScale = 1;
      let alphaBanner = 1;
      let offsetY = 0;
      if (bp < 0.14) {
        const t = bp / 0.14;
        slideScale = 0.8 + easeOutCubic(t) * 0.23;
        alphaBanner = t;
        offsetY = (1 - easeOutCubic(t)) * -24;
      } else if (bp < 0.22) {
        const t = (bp - 0.14) / 0.08;
        slideScale = 1.03 - t * 0.03;
      } else if (bp > 0.78) {
        const t = (bp - 0.78) / 0.22;
        alphaBanner = 1 - t;
        offsetY = -t * 20;
      }

      const drawW = 612 * slideScale;
      const drawH = 108 * slideScale;
      const bx = (LOGICAL_WIDTH - drawW) * 0.5;
      // Positioned cleanly over the upper corridor (y=120..228) so row-0 heroes remain visible
      const by = 120 + offsetY - (drawH - 108) * 0.5;

      ctx.globalAlpha = Math.max(0, Math.min(1, alphaBanner));
      ctx.drawImage(this.banner.sprite, bx, by, drawW, drawH);
      ctx.globalAlpha = 1;
    }
  }

  private renderParticles(ctx: CanvasRenderingContext2D): void {
    const prevAlpha = ctx.globalAlpha;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.pActive[i] === 0) continue;
      const elapsed = this.currentSimTimeSec - this.pStartTick[i]! * TICK_DT;
      const life = this.pLifeSec[i]!;
      if (elapsed >= life || elapsed < 0) {
        this.pActive[i] = 0;
        continue;
      }
      const p = elapsed / life;
      const inv = 1 - p;
      const drag = 1 - p * 0.32;
      const vx = this.pVx[i]!;
      const vy = this.pVy[i]!;
      const grav = this.pGravity[i]!;
      const x = this.pOriginX[i]! + vx * elapsed * drag;
      const y = this.pOriginY[i]! + vy * elapsed * drag + 0.5 * grav * elapsed * elapsed;
      const size = this.pSize[i]! * (0.42 + inv * 0.74);

      // Instantaneous velocity direction for kinetic spark streaks (zero save()/restore()!)
      const curVx = vx * (1 - p * 0.64);
      const curVy = vy * (1 - p * 0.64) + grav * elapsed;
      const spd = Math.hypot(curVx, curVy);

      ctx.globalAlpha = inv * 0.96;
      if (spd > 52) {
        const ux = curVx / spd;
        const uy = curVy / spd;
        const px = -uy;
        const py = ux;
        const lenF = size * Math.min(3.1, 1.35 + spd * 0.0085);
        const lenB = lenF * 1.15;
        const w = size * 0.76;
        const pad = 1.15;

        // Crisp ink-outlined tapered spark streak
        ctx.beginPath();
        ctx.moveTo(x + ux * (lenF + pad), y + uy * (lenF + pad));
        ctx.lineTo(x + px * (w + pad), y + py * (w + pad));
        ctx.lineTo(x - ux * (lenB + pad), y - uy * (lenB + pad));
        ctx.lineTo(x - px * (w + pad), y - py * (w + pad));
        ctx.closePath();
        ctx.fillStyle = PIXEL_OUTLINE;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(x + ux * lenF, y + uy * lenF);
        ctx.lineTo(x + px * w, y + py * w);
        ctx.lineTo(x - ux * lenB, y - uy * lenB);
        ctx.lineTo(x - px * w, y - py * w);
        ctx.closePath();
        ctx.fillStyle = this.pColor[i]!;
        ctx.fill();
      } else {
        // Crisp ink-outlined floating ember diamond
        const d = size * 1.18;
        ctx.beginPath();
        ctx.moveTo(x, y - d - 1.1);
        ctx.lineTo(x + d + 1.1, y);
        ctx.lineTo(x, y + d + 1.1);
        ctx.lineTo(x - d - 1.1, y);
        ctx.closePath();
        ctx.fillStyle = PIXEL_OUTLINE;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(x, y - d);
        ctx.lineTo(x + d, y);
        ctx.lineTo(x, y + d);
        ctx.lineTo(x - d, y);
        ctx.closePath();
        ctx.fillStyle = this.pColor[i]!;
        ctx.fill();
      }
    }

    ctx.globalAlpha = prevAlpha;
  }

  private renderSkillCallouts(ctx: CanvasRenderingContext2D): void {
    const prevAlpha = ctx.globalAlpha;

    for (let i = 0; i < this.skillCallouts.length; i++) {
      const item = this.skillCallouts[i]!;
      if (!item.active) continue;
      const life = item.gradeRank >= 5 ? 0.8 : 0.68;
      const elapsed = this.currentSimTimeSec - item.startTick * TICK_DT;
      if (elapsed >= life || elapsed < 0) {
        item.active = false;
        continue;
      }
      const p = elapsed / life;
      const baseScale = item.gradeRank >= 5 ? 0.52 : 0.46;
      const pop =
        p < 0.16
          ? 0.76 + (p / 0.16) * 0.32
          : p < 0.3
            ? 1.08 - ((p - 0.16) / 0.14) * 0.08
            : 1;
      const scale = baseScale * pop;
      const riseY = item.y - easeOutCubic(p) * 16;
      const fade = p < 0.68 ? 1 : 1 - (p - 0.68) / 0.32;

      const plaque = this.sprites.skillCallout(item.skillName, item.faction);
      const dw = plaque.width * scale;
      const dh = plaque.height * scale;
      ctx.globalAlpha = prevAlpha * Math.max(0, Math.min(0.92, fade * 0.92));
      ctx.drawImage(plaque, item.x - dw * 0.5, riseY - dh * 0.5, dw, dh);
    }

    ctx.globalAlpha = prevAlpha;
  }

  private renderDamageTexts(ctx: CanvasRenderingContext2D): void {
    const prevAlpha = ctx.globalAlpha;

    for (let i = 0; i < this.damageTexts.length; i++) {
      const item = this.damageTexts[i]!;
      if (!item.active) continue;
      const hasPassive = item.passiveProc !== null;
      const life = item.isCrit
        ? 0.84
        : hasPassive
          ? 0.8
          : item.isShred || item.isSkill
            ? 0.72
            : 0.6;
      const elapsed = this.currentSimTimeSec - item.startTick * TICK_DT;
      if (elapsed >= life || elapsed < 0) {
        item.active = false;
        continue;
      }
      const p = elapsed / life;
      const rawDrawX = item.x + item.offsetX + item.driftVx * elapsed;
      const riseDist = item.isCrit || hasPassive ? 50 : item.isShred || item.isSkill ? 38 : 30;
      // Snappy ballistic arc impulse on initial frames, settling cleanly upward
      const popArc = Math.sin(Math.min(1, p * 2.4) * Math.PI) * (item.isCrit ? 7 : 3.5);
      const riseY = item.y - easeOutCubic(p) * riseDist - popArc;
      const fade = p < 0.72 ? 1 : 1 - (p - 0.72) / 0.28;

      let scale: number;
      if (item.isCrit) {
        scale =
          p < 0.11
            ? 0.82 + (p / 0.11) * 0.54
            : p < 0.26
              ? 1.36 - ((p - 0.11) / 0.15) * 0.42
              : 0.94 - (p - 0.26) * 0.08;
      } else if (hasPassive || item.isShred || item.isSkill) {
        scale =
          p < 0.13
            ? 0.66 + (p / 0.13) * 0.38
            : 1.04 - Math.min(0.2, (p - 0.13) * 0.32);
      } else {
        scale =
          p < 0.13
            ? 0.54 + (p / 0.13) * 0.25
            : 0.79 - Math.min(0.17, (p - 0.13) * 0.28);
      }

      const formatted = formatDamageValue(item.value);
      const label = item.isCrit || item.isShred || hasPassive ? `${formatted}!` : formatted;
      const safeMarginX = Math.max(74, Math.ceil(label.length * 14 * scale) + 18);
      const drawX = Math.max(safeMarginX, Math.min(LOGICAL_WIDTH - safeMarginX, rawDrawX));
      const style = item.isCrit
        ? 'crit'
        : item.isShred
          ? 'shred'
          : item.isSkill || hasPassive
            ? 'skill'
            : 'normal';

      // Comic/Wuxia jagged impact starburst backdrop behind Critical / Armor-Shred hits!
      if ((item.isCrit || item.isShred) && p < 0.4) {
        const bp = p / 0.4;
        const burstScale = (0.52 + easeOutCubic(bp) * 0.36) * Math.min(1.15, scale);
        const burstSprite = item.isCrit
          ? this.sprites.critBurst('#ea580c', '#fef08a')
          : this.sprites.critBurst('#9333ea', '#f0abfc');
        const bw = burstSprite.width * burstScale;
        const bh = burstSprite.height * burstScale;
        ctx.globalAlpha = prevAlpha * (1 - bp) * 0.85;
        ctx.drawImage(burstSprite, drawX - bw * 0.5, riseY - bh * 0.5, bw, bh);
        ctx.globalAlpha = prevAlpha;
      }

      this.sprites.drawGlyphString(ctx, label, drawX, riseY, scale, fade, style);

      // Pre-rendered mini Wuxia stamp above passive proc / critical / armor-broken / heavy kill hits
      const badgeKind: HitBadgeKind | null =
        item.passiveProc !== null
          ? item.passiveProc
          : item.isCrit && item.isShred
            ? 'shred'
            : item.isCrit
              ? 'crit'
              : item.isShred
                ? 'shred'
                : item.isKill && item.value >= 180
                  ? 'kill'
                  : null;
      if (badgeKind) {
        const badge = this.sprites.hitBadge(badgeKind);
        const bScale = (item.isCrit || hasPassive ? 0.58 : 0.49) * Math.min(1.08, scale / 0.8);
        const bw = badge.width * bScale;
        const bh = badge.height * bScale;
        ctx.globalAlpha = prevAlpha * Math.max(0, Math.min(1, fade * 0.96));
        ctx.drawImage(badge, drawX - bw * 0.5, riseY - 24 * scale - bh * 0.75, bw, bh);
      }
    }

    ctx.globalAlpha = prevAlpha;
  }
}

function formatDamageValue(val: number): string {
  const n = Math.max(0, Math.round(val));
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(2)}M`;
  }
  if (n >= 10_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }
  if (n >= 1_000) {
    const k = Math.floor(n / 1_000);
    const rem = String(n % 1_000).padStart(3, '0');
    return `${k},${rem}`;
  }
  return String(n);
}
