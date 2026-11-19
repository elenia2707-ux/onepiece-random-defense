import { Pool } from '../core/Pool';
import { TICK_DT } from '../core/time';
import type { FactionId, VfxTrackKind } from '../data/types';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../platform/Viewport';
import type { CanvasStack } from '../render/CanvasStack';
import { PIXEL_OUTLINE } from '../render/ChibiPainter';
import { type IRenderable, RenderLayer } from '../render/RenderLayer';
import { hexWithAlpha, type SpriteCache } from '../render/SpriteCache';
import type { WeaponMotionStyle } from '../render/weaponProfiles';

const MAX_VFX_INSTANCES = 96;
const MAX_PARTICLES = 1500;
const MAX_SKILL_CALLOUTS = 2;

type InternalVfxKind =
  | 'ring'
  | 'craft_pillar'
  | 'hit_slash'
  | 'armor_shatter'
  | 'qi_resonance'
  | VfxTrackKind;

interface TrackVfxInstance {
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
  progress: number;
  renderableGround: IRenderable;
  renderableAir: IRenderable;
}

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
  isExecute: boolean;
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

/**
 * Pure presentation Wuxia VFX system synchronized to simulation clock:
 * t = (currentTick + alpha - startTick) * TICK_DT (AGENTS.md §3 & §4).
 * Screen banners use timeBase: 'real' (timestamp difference, never dt accumulation).
 * Screen shake is permanently disabled so the board remains rock-steady.
 * Never mutates simulation state.
 */
export class VfxSystem {
  private readonly sprites: SpriteCache;
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
  private currentSimTimeSec = 0;

  private readonly particleBatchRenderable: IRenderable;
  private readonly damageBatchRenderable: IRenderable;
  private readonly calloutBatchRenderable: IRenderable;

  public constructor(sprites: SpriteCache) {
    this.sprites = sprites;

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
        isExecute: false,
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
   * Wuxia sect skill VFX tracks synchronized to simulation hit tick:
   * - plum_blossom: 화산파 매화검기 (crescent sword qi + scattering pink plum petals)
   * - emperor_thunder: 남궁 제왕검형 (sky-to-ground cyan-blue thunder sword)
   * - golden_palm: 소림 금강권 (golden Dharma shockwave + '剛' Hanja seal)
   * - poison_rain: 사천당문 만천화우 (venom needle barrage + toxic jade mist)
   * - blood_slash: 사파 혈도/광마참 (crossed crimson-ink saber slashes)
   * - demonic_flame: 마교 마염 (obsidian-scarlet hellfire vortex)
   * - heavenly_demon: 마교 천마군림보 (black-crimson lightning spatial fracture)
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
    switch (track) {
      case 'plum_blossom': {
        const plumColor = skinPrimary ?? (gradeRank >= 4 ? '#db2777' : '#f43f5e');
        const petalLight = skinSecondary ?? '#fda4af';
        this.pushTrack({
          kind: 'plum_blossom',
          weaponStyle,
          startTick,
          durationSec: 0.46,
          fromX,
          fromY,
          x,
          y,
          fromRadius: 16,
          toRadius: radius,
          color: plumColor,
          secondaryColor: petalLight,
          lineWidth: 5,
          glowRadius: Math.min(84, radius * 0.8),
          gradeRank,
        });
        this.emitRadialBurst(x, y, skinPrimary ?? '#fb7185', 14, 140, 0.42, 35, startTick);
        this.emitRadialBurst(x, y, petalLight, 10, 95, 0.48, 45, startTick);
        break;
      }

      case 'emperor_thunder': {
        const boltMain = skinPrimary ?? '#0284c7';
        const boltSub = skinSecondary ?? '#7dd3fc';
        this.pushTrack({
          kind: 'emperor_thunder',
          weaponStyle,
          startTick,
          durationSec: 0.46,
          fromX,
          fromY,
          x,
          y,
          fromRadius: 14,
          toRadius: radius,
          color: boltMain,
          secondaryColor: boltSub,
          lineWidth: 5,
          glowRadius: Math.min(90, radius * 0.85),
          gradeRank,
        });
        this.emitRadialBurst(x, y, skinPrimary ?? '#38bdf8', 18, 175, 0.32, 20, startTick);
        break;
      }

      case 'golden_palm': {
        const palmMain = skinPrimary ?? '#d97706';
        const palmSub = skinSecondary ?? '#facc15';
        this.pushTrack({
          kind: 'golden_palm',
          weaponStyle,
          startTick,
          durationSec: 0.48,
          fromX,
          fromY,
          x,
          y,
          fromRadius: 14,
          toRadius: radius,
          color: palmMain,
          secondaryColor: palmSub,
          lineWidth: 5.5,
          glowRadius: Math.min(88, radius * 0.85),
          gradeRank,
        });
        this.emitRadialBurst(x, y, skinPrimary ?? '#f59e0b', 18, 155, 0.34, 0, startTick);
        break;
      }

      case 'poison_rain': {
        const poisonMain = skinPrimary ?? '#16a34a';
        const poisonSub = skinSecondary ?? '#a855f7';
        this.pushTrack({
          kind: 'poison_rain',
          weaponStyle,
          startTick,
          durationSec: weaponStyle === 'fan' ? 0.56 : 0.48,
          fromX,
          fromY,
          x,
          y,
          fromRadius: 16,
          toRadius: radius,
          color: poisonMain,
          secondaryColor: poisonSub,
          lineWidth: 4.5,
          glowRadius: Math.min(82, radius * 0.78),
          gradeRank,
        });
        this.emitRadialBurst(x, y, skinPrimary ?? '#22c55e', 15, 140, 0.36, 30, startTick);
        this.emitRadialBurst(x, y, skinSecondary ?? '#7e22ce', 8, 100, 0.34, 20, startTick);
        break;
      }

      case 'blood_slash': {
        const slashMain = skinPrimary ?? '#e11d48';
        const slashSub = skinSecondary ?? '#ffe4e6';
        this.pushTrack({
          kind: 'blood_slash',
          weaponStyle,
          startTick,
          durationSec: 0.44,
          fromX,
          fromY,
          x,
          y,
          fromRadius: 18,
          toRadius: radius,
          color: skinPrimary ?? '#be123c',
          secondaryColor: slashSub,
          lineWidth: 5.5,
          glowRadius: Math.min(92, radius * 0.85),
          gradeRank,
        });
        this.emitRadialBurst(x, y, slashMain, 20, 175, 0.34, 0, startTick);
        break;
      }

      case 'demonic_flame': {
        const flameMain = skinPrimary ?? '#dc2626';
        const flameSub = skinSecondary ?? '#a855f7';
        this.pushTrack({
          kind: 'demonic_flame',
          weaponStyle,
          startTick,
          durationSec: 0.5,
          fromX,
          fromY,
          x,
          y,
          fromRadius: 16,
          toRadius: radius,
          color: flameMain,
          secondaryColor: flameSub,
          lineWidth: 5.5,
          glowRadius: Math.min(96, radius * 0.88),
          gradeRank,
        });
        this.emitRadialBurst(x, y, flameMain, 18, 150, 0.38, -95, startTick);
        this.emitRadialBurst(x, y, skinSecondary ?? '#9333ea', 10, 105, 0.34, -110, startTick);
        break;
      }

      case 'heavenly_demon': {
        const demonMain = skinPrimary ?? '#be123c';
        const demonSub = skinSecondary ?? '#fde047';
        this.pushTrack({
          kind: 'heavenly_demon',
          weaponStyle,
          startTick,
          durationSec: 0.58,
          fromX,
          fromY,
          x,
          y,
          fromRadius: 20,
          toRadius: radius,
          color: demonMain,
          secondaryColor: demonSub,
          lineWidth: 7,
          glowRadius: Math.min(120, radius * 0.95),
          gradeRank,
        });
        this.emitRadialBurst(x, y, skinPrimary ?? '#e11d48', 26, 210, 0.44, 0, startTick);
        this.emitRadialBurst(x, y, PIXEL_OUTLINE, 16, 165, 0.4, 0, startTick);
        this.triggerScreenFlash(demonMain, gradeRank >= 6 ? 0.14 : 0.09, 0.16, startTick);
        break;
      }

      default: {
        this.emitRadialBurst(x, y, skinPrimary ?? color, 12, 120, 0.3, 0, startTick);
        break;
      }
    }
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
      | 'patriarch_summon',
    skillName: string,
    x: number,
    y: number,
    tilePositions: readonly { readonly x: number; readonly y: number }[],
    startTick: number,
  ): void {
    const calloutFaction: FactionId =
      skillKind === 'tiger_roar' || skillKind === 'tiger_sprint'
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
    }
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
  ): void {
    const burstCount = slain ? 16 : isCrit ? 12 : isSkill ? 9 : 6;
    const burstColor = isCrit ? '#facc15' : armorBroken ? '#e879f9' : color;
    this.emitRadialBurst(
      x,
      y,
      burstColor,
      burstCount,
      slain ? 162 : isCrit ? 144 : 104,
      isCrit || slain ? 0.28 : 0.22,
      18,
      startTick,
    );

    if (armorBroken) {
      this.emitRadialBurst(x, y, '#f43f5e', 5, 130, 0.24, 10, startTick);
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
      this.emitRadialBurst(x, y, '#fffbeb', isCrit ? 6 : 4, 120, 0.2, 0, startTick);
      this.pushTrack({
        kind: 'hit_slash',
        weaponStyle,
        startTick,
        durationSec: isCrit ? 0.27 : 0.22,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 8,
        toRadius: isCrit ? 46 : slain ? 38 : 32,
        color: isCrit ? '#facc15' : armorBroken ? '#e879f9' : color,
        secondaryColor: armorBroken ? '#f43f5e' : secondaryColor,
        lineWidth: isCrit ? 5.0 : 3.6,
        glowRadius: isCrit ? 34 : 20,
      });
      if (isCrit || slain) {
        this.pushTrack({
          kind: 'ring',
          startTick,
          durationSec: 0.23,
          fromX: x,
          fromY: y,
          x,
          y,
          fromRadius: 8,
          toRadius: isCrit ? 36 : 32,
          color: isCrit ? '#fde047' : '#fb7185',
          lineWidth: 3.0,
          glowRadius: 0,
        });
      }
    } else {
      // Bespoke per-weapon normal hit impact (fan gale, saber gash, kunai puncture, fist shockwave, etc.)
      this.pushTrack({
        kind: 'hit_slash',
        weaponStyle,
        startTick,
        durationSec: 0.17,
        fromX,
        fromY,
        x,
        y,
        fromRadius: 6,
        toRadius: 24,
        color: armorBroken ? '#e879f9' : color,
        secondaryColor,
        lineWidth: 2.8,
        glowRadius: 12,
      });
    }

    // Nudge floating damage numbers 14px outward from arena center (360, 404) onto the outer corridor
    // so damage numbers never overlap deployed heroes on the 6x3 inner grid!
    const outDx = x - 360;
    const outDy = y - 404;
    const outLen = Math.hypot(outDx, outDy) || 1;
    const dmgX = Math.max(36, Math.min(LOGICAL_WIDTH - 36, x + (outDx / outLen) * 14));
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
    this.banner = {
      startRealMs: realNowMs,
      durationSec: 1.65,
      sprite,
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

  private pushTrack(
    cfg: Omit<
      TrackVfxInstance,
      | 'renderableGround'
      | 'renderableAir'
      | 'progress'
      | 'gradeRank'
      | 'secondaryColor'
      | 'weaponStyle'
    > & {
      readonly gradeRank?: number;
      readonly secondaryColor?: string;
      readonly weaponStyle?: WeaponMotionStyle;
    },
  ): void {
    if (this.activeTracks.length >= MAX_VFX_INSTANCES) {
      const oldest = this.activeTracks.shift();
      if (oldest) {
        this.trackPool.release(oldest);
      }
    }
    const inst = this.trackPool.acquire();
    inst.kind = cfg.kind;
    inst.weaponStyle = cfg.weaponStyle ?? 'sword';
    inst.startTick = cfg.startTick;
    inst.durationSec = cfg.durationSec;
    inst.fromX = cfg.fromX;
    inst.fromY = cfg.fromY;
    inst.x = cfg.x;
    inst.y = cfg.y;
    inst.fromRadius = cfg.fromRadius;
    inst.toRadius = cfg.toRadius;
    inst.color = cfg.color;
    inst.secondaryColor = cfg.secondaryColor ?? '#fde047';
    inst.lineWidth = cfg.lineWidth;
    inst.glowRadius = cfg.glowRadius;
    inst.gradeRank = cfg.gradeRank ?? 1;
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

    if (inst.kind === 'poison_rain') {
      // Toxic jade-violet miasma pool on flagstones
      ctx.globalAlpha = inv * 0.24;
      ctx.beginPath();
      ctx.arc(inst.x, inst.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = inst.color;
      ctx.fill();
    } else if (inst.kind === 'heavenly_demon') {
      // Dark-crimson abyssal crater imprint
      ctx.globalAlpha = inv * 0.28;
      ctx.beginPath();
      ctx.arc(inst.x, inst.y, radius * 0.88, 0, Math.PI * 2);
      ctx.fillStyle = PIXEL_OUTLINE;
      ctx.fill();
    } else if (inst.kind === 'qi_resonance') {
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

    // Crisp outer dark-ink outline ring + colored shockwave ring for bright white-jade contrast
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

    if (inst.kind === 'golden_palm' || inst.kind === 'heavenly_demon' || inst.kind === 'craft_pillar') {
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

      case 'plum_blossom': {
        // Hwasan 매화검기: rose crescent sword-qi + 5 scattering pink plum blossoms
        const ang = Math.atan2(inst.y - inst.fromY, inst.x - inst.fromX);
        const arcR = inst.toRadius * (0.45 + easeOutCubic(p) * 0.52);
        ctx.save();
        ctx.translate(inst.x, inst.y);
        ctx.rotate(ang);
        ctx.globalAlpha = inv * 0.96;

        ctx.beginPath();
        ctx.arc(0, 0, arcR, -Math.PI * 0.44, Math.PI * 0.44);
        ctx.quadraticCurveTo(
          arcR * 0.42,
          0,
          Math.cos(-Math.PI * 0.44) * arcR,
          Math.sin(-Math.PI * 0.44) * arcR,
        );
        ctx.fillStyle = inst.color;
        ctx.fill();
        ctx.lineWidth = 2.8;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.restore();

        // 5-petal plum blossom silhouettes fluttering outward
        ctx.globalAlpha = inv * 0.95;
        for (let b = 0; b < 5; b++) {
          const ba = (b * Math.PI * 2) / 5 + p * 2.2 + (inst.startTick % 7);
          const br = arcR * (0.35 + p * 0.65);
          const bx = inst.x + Math.cos(ba) * br;
          const by = inst.y + Math.sin(ba) * br;
          ctx.beginPath();
          ctx.arc(bx, by, 5.2 * inv + 1.5, 0, Math.PI * 2);
          ctx.fillStyle = b % 2 === 0 ? inst.color : inst.secondaryColor;
          ctx.fill();
          ctx.lineWidth = 1.6;
          ctx.strokeStyle = PIXEL_OUTLINE;
          ctx.stroke();
        }
        break;
      }

      case 'emperor_thunder': {
        // Namgung / Wudang 제왕검형·태극천뢰: towering sky-to-ground cyan-blue & white lightning bolt
        ctx.globalAlpha = inv * 0.96;
        const skyY = inst.y - 190;
        const seed = inst.startTick * 17;
        const traceBolt = (w: number, col: string): void => {
          ctx.beginPath();
          ctx.moveTo(inst.x + ((seed % 19) - 9), skyY);
          const steps = 6;
          for (let s = 1; s < steps; s++) {
            const frac = s / steps;
            const jx = (((seed + s * 31) % 29) - 14) * (1 - frac * 0.4);
            ctx.lineTo(inst.x + jx, skyY + (inst.y - skyY) * frac);
          }
          ctx.lineTo(inst.x, inst.y);
          ctx.lineWidth = w * inv;
          ctx.strokeStyle = col;
          ctx.stroke();
        };
        traceBolt(12, PIXEL_OUTLINE);
        traceBolt(8, inst.color);
        traceBolt(4, inst.secondaryColor);
        traceBolt(2, '#ffffff');

        if (inst.gradeRank >= 3) {
          const seal = this.sprites.kanjiSeal('雷', inst.color);
          const size = (inst.gradeRank >= 5 ? 74 : 62) * (0.8 + inv * 0.25);
          ctx.globalAlpha = inv * 0.92;
          ctx.drawImage(seal, inst.x - size * 0.5, inst.y - 26 - p * 22 - size * 0.5, size, size);
        }
        break;
      }

      case 'golden_palm': {
        // Shaolin / Gaebang 금강권·항룡장: golden Hanja '剛' or '龍' martial seal rising above golden shockwave
        const hanja = inst.gradeRank >= 3 ? '龍' : '剛';
        const seal = this.sprites.kanjiSeal(hanja, inst.color);
        const pop = p < 0.25 ? 0.7 + (p / 0.25) * 0.45 : 1.15 - (p - 0.25) * 0.2;
        const size = 76 * pop;
        const liftY = inst.y - 16 - easeOutCubic(p) * 26;
        ctx.globalAlpha = inv * 0.96;
        ctx.drawImage(seal, inst.x - size * 0.5, liftY - size * 0.5, size, size);
        break;
      }

      case 'poison_rain': {
        // Tang Sect 만천화우: unfolding grand Tang folding fan (when weaponStyle === 'fan') + poison needle storm + '毒' seal
        ctx.globalAlpha = inv * 0.96;

        if (inst.weaponStyle === 'fan') {
          // Grand 7-rib Sichuan Tang Folding War Fan (만천화우선) snapping open above the poison storm!
          const openT = easeOutCubic(Math.min(1, p * 2.2));
          const halfSpan = 0.22 + openT * 1.12;
          const fanR = (38 + openT * 18) * (inst.gradeRank >= 4 ? 1.12 : 1);
          const innerR = 8;
          const fx = inst.x;
          const fy = inst.y - 38 - p * 8;
          // Point fan canopy downward (+PI/2) so needles rain out of its ribs onto monsters
          const centerA = Math.PI * 0.5;
          const a0 = centerA - halfSpan;
          const a1 = centerA + halfSpan;

          ctx.save();
          ctx.translate(fx, fy);

          ctx.beginPath();
          ctx.arc(0, 0, fanR, a0, a1);
          ctx.arc(0, 0, innerR, a1, a0, true);
          ctx.closePath();
          ctx.fillStyle = '#4c1d95';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(0, 0, fanR * 0.84, a0, a1);
          ctx.arc(0, 0, fanR * 0.44, a1, a0, true);
          ctx.closePath();
          ctx.fillStyle = inst.color;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(0, 0, fanR, a0, a1);
          ctx.arc(0, 0, fanR * 0.84, a1, a0, true);
          ctx.closePath();
          ctx.fillStyle = '#facc15';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(0, 0, fanR, a0, a1);
          ctx.arc(0, 0, innerR, a1, a0, true);
          ctx.closePath();
          ctx.lineWidth = 2.8;
          ctx.strokeStyle = PIXEL_OUTLINE;
          ctx.stroke();

          for (let rIdx = 0; rIdx < 7; rIdx++) {
            const ra = a0 + ((a1 - a0) * rIdx) / 6;
            ctx.beginPath();
            ctx.moveTo(Math.cos(ra) * 3, Math.sin(ra) * 3);
            ctx.lineTo(Math.cos(ra) * (fanR + 2), Math.sin(ra) * (fanR + 2));
            ctx.lineWidth = 2.6;
            ctx.strokeStyle = PIXEL_OUTLINE;
            ctx.stroke();
            ctx.lineWidth = 1.2;
            ctx.strokeStyle = '#fde68a';
            ctx.stroke();
          }

          ctx.beginPath();
          ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = '#facc15';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = PIXEL_OUTLINE;
          ctx.stroke();
          ctx.restore();
        }

        const seed = inst.startTick * 13;
        const needleCount = inst.weaponStyle === 'fan' ? 16 : 12;
        for (let n = 0; n < needleCount; n++) {
          const spreadX = (((seed + n * 23) % 56) - 28) * (inst.toRadius / 70);
          const spreadY = (((seed + n * 37) % 40) - 20) * (inst.toRadius / 70);
          const fall = (1 - p) * 46;
          const tx = inst.x + spreadX;
          const ty = inst.y + spreadY;
          const sx = tx - (inst.weaponStyle === 'fan' ? spreadX * 0.25 : fall * 0.55);
          const sy = ty - fall;

          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(tx, ty);
          ctx.lineWidth = 4.6;
          ctx.strokeStyle = PIXEL_OUTLINE;
          ctx.stroke();

          ctx.lineWidth = 2.3;
          ctx.strokeStyle =
            n % 3 === 0 ? '#ffffff' : n % 2 === 0 ? inst.color : inst.secondaryColor;
          ctx.stroke();
        }
        if (inst.gradeRank >= 2) {
          const seal = this.sprites.kanjiSeal('毒', inst.color);
          const size = (inst.gradeRank >= 4 ? 68 : 56) * (0.85 + inv * 0.2);
          ctx.globalAlpha = inv * 0.9;
          ctx.drawImage(seal, inst.x - size * 0.5, inst.y - 18 - p * 18 - size * 0.5, size, size);
        }
        break;
      }

      case 'blood_slash': {
        // Unorthodox 혈도·광마참: fierce X-crossed crimson-ink saber arcs + '血' seal
        const r = inst.toRadius * (0.55 + easeOutCubic(p) * 0.42);
        ctx.globalAlpha = inv * 0.96;
        const drawSlash = (w: number, col: string): void => {
          ctx.beginPath();
          ctx.moveTo(inst.x - r, inst.y - r * 0.55);
          ctx.quadraticCurveTo(inst.x, inst.y - 6, inst.x + r, inst.y + r * 0.55);
          ctx.moveTo(inst.x - r * 0.85, inst.y + r * 0.65);
          ctx.quadraticCurveTo(inst.x, inst.y + 6, inst.x + r * 0.85, inst.y - r * 0.65);
          ctx.lineCap = 'round';
          ctx.lineWidth = w * inv;
          ctx.strokeStyle = col;
          ctx.stroke();
        };
        drawSlash(11.5, PIXEL_OUTLINE);
        drawSlash(6.8, inst.color);
        drawSlash(2.6, inst.secondaryColor);

        if (inst.gradeRank >= 3) {
          const seal = this.sprites.kanjiSeal('血', inst.color);
          const size = (inst.gradeRank >= 5 ? 76 : 62) * (0.85 + inv * 0.2);
          ctx.globalAlpha = inv * 0.92;
          ctx.drawImage(seal, inst.x - size * 0.5, inst.y - 24 - p * 22 - size * 0.5, size, size);
        }
        break;
      }

      case 'demonic_flame': {
        // Demonic Cult 마염: swirling obsidian-crimson & violet hellfire rings + '魔' seal
        const r = inst.toRadius * (0.35 + p * 0.58);
        ctx.globalAlpha = inv * 0.92;
        ctx.beginPath();
        ctx.arc(inst.x, inst.y, r * 0.52, 0, Math.PI * 2);
        ctx.fillStyle = PIXEL_OUTLINE;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(inst.x, inst.y, r * 0.36, 0, Math.PI * 2);
        ctx.fillStyle = inst.secondaryColor;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(inst.x, inst.y, r, p * 4.5, p * 4.5 + Math.PI * 1.45);
        ctx.lineWidth = 7 * inv;
        ctx.strokeStyle = inst.color;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(inst.x, inst.y, r * 0.82, -p * 4, -p * 4 + Math.PI * 1.2);
        ctx.lineWidth = 4.5 * inv;
        ctx.strokeStyle = inst.secondaryColor;
        ctx.stroke();

        if (inst.gradeRank >= 3) {
          const seal = this.sprites.kanjiSeal('魔', inst.secondaryColor);
          const size = (inst.gradeRank >= 4 ? 72 : 60) * (0.85 + inv * 0.2);
          ctx.globalAlpha = inv * 0.92;
          ctx.drawImage(seal, inst.x - size * 0.5, inst.y - 24 - p * 22 - size * 0.5, size, size);
        }
        break;
      }

      case 'heavenly_demon': {
        // 천마군림보: pitch-black & blood-crimson lightning spatial fracture cracks + '天' seal!
        const maxR = inst.toRadius * (0.45 + easeOutCubic(p) * 0.58);
        ctx.globalAlpha = inv * 0.98;
        const traceFractures = (w: number, col: string): void => {
          ctx.beginPath();
          for (let b = 0; b < 7; b++) {
            const ang = (b * Math.PI * 2) / 7 + (inst.startTick % 9) * 0.18;
            const r1 = maxR * 0.46;
            const x1 = inst.x + Math.cos(ang + 0.18) * r1;
            const y1 = inst.y + Math.sin(ang + 0.18) * r1;
            ctx.moveTo(inst.x, inst.y);
            ctx.lineTo(x1, y1);
            ctx.lineTo(
              x1 + Math.cos(ang - 0.24) * (maxR * 0.54),
              y1 + Math.sin(ang - 0.24) * (maxR * 0.54),
            );
            ctx.moveTo(x1, y1);
            ctx.lineTo(
              x1 + Math.cos(ang + 0.42) * (maxR * 0.36),
              y1 + Math.sin(ang + 0.42) * (maxR * 0.36),
            );
          }
          ctx.lineCap = 'round';
          ctx.lineWidth = w * inv;
          ctx.strokeStyle = col;
          ctx.stroke();
        };
        traceFractures(9.5, PIXEL_OUTLINE);
        traceFractures(5, inst.color);
        traceFractures(1.8, inst.secondaryColor);

        if (inst.gradeRank >= 4) {
          const seal = this.sprites.kanjiSeal('天', inst.color);
          const size = (inst.gradeRank >= 6 ? 86 : 70) * (0.85 + inv * 0.25);
          ctx.globalAlpha = inv * 0.95;
          ctx.drawImage(seal, inst.x - size * 0.5, inst.y - 26 - p * 24 - size * 0.5, size, size);
        }
        break;
      }

      case 'hit_slash': {
        // 10 Bespoke Per-Weapon Monster Hit / Damage Impact VFX oriented along attack trajectory!
        const isHeavy = inst.lineWidth >= 3.4;
        const slashR = inst.fromRadius + (inst.toRadius - inst.fromRadius) * easeOutCubic(p);
        const hasDir = Math.abs(inst.x - inst.fromX) + Math.abs(inst.y - inst.fromY) > 2;
        const aimAng = hasDir
          ? Math.atan2(inst.y - inst.fromY, inst.x - inst.fromX)
          : (((inst.startTick * 37 + Math.round(inst.x) * 7) % 10) - 5) * 0.24 - Math.PI * 0.24;
        ctx.globalAlpha = inv * 0.98;

        const strokeCut = (ang: number, len: number, w: number, col: string): void => {
          const dx = Math.cos(ang) * len;
          const dy = Math.sin(ang) * len;
          ctx.beginPath();
          ctx.moveTo(inst.x - dx, inst.y - dy);
          ctx.lineTo(inst.x + dx, inst.y + dy);
          ctx.lineCap = 'round';
          ctx.lineWidth = Math.max(1, w * inv);
          ctx.strokeStyle = col;
          ctx.stroke();
        };

        switch (inst.weaponStyle) {
          case 'fan': {
            // 부채꼴 독풍 파열 + 5방 독침 (Snapping 5-rib Tang fan sector + 5 radiating poison needles!)
            ctx.save();
            ctx.translate(inst.x, inst.y);
            ctx.rotate(aimAng);
            const fr = slashR * 1.05;
            const span = 0.85;
            ctx.beginPath();
            ctx.arc(-fr * 0.35, 0, fr, -span, span);
            ctx.lineTo(-fr * 0.35, 0);
            ctx.closePath();
            ctx.fillStyle = hexWithAlpha(inst.color, 0.38 * inv);
            ctx.fill();

            ctx.beginPath();
            ctx.arc(-fr * 0.35, 0, fr, -span, span);
            ctx.lineCap = 'round';
            ctx.lineWidth = Math.max(1.5, (inst.lineWidth + 3.2) * inv);
            ctx.strokeStyle = PIXEL_OUTLINE;
            ctx.stroke();
            ctx.lineWidth = Math.max(1, inst.lineWidth * inv);
            ctx.strokeStyle = inst.secondaryColor;
            ctx.stroke();

            for (let k = -2; k <= 2; k++) {
              const na = k * 0.36;
              const n0 = fr * 0.35;
              const n1 = fr * 1.15;
              ctx.beginPath();
              ctx.moveTo(-fr * 0.35 + Math.cos(na) * n0, Math.sin(na) * n0);
              ctx.lineTo(-fr * 0.35 + Math.cos(na) * n1, Math.sin(na) * n1);
              ctx.lineWidth = Math.max(1.2, 3.4 * inv);
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.lineWidth = Math.max(1, 1.8 * inv);
              ctx.strokeStyle = k === 0 ? '#ffffff' : inst.color;
              ctx.stroke();
            }
            ctx.restore();
            break;
          }

          case 'dual_sword': {
            // 쌍검 X자 교차 참격 (Symmetrical X twin-blade cross-slash!)
            const a1 = aimAng + 0.62;
            const a2 = aimAng - 0.62;
            strokeCut(a1, slashR, inst.lineWidth + 4, PIXEL_OUTLINE);
            strokeCut(a1, slashR, inst.lineWidth + 0.8, inst.color);
            strokeCut(a1, slashR * 0.76, 1.9, '#ffffff');

            strokeCut(a2, slashR * 0.92, inst.lineWidth + 3.6, PIXEL_OUTLINE);
            strokeCut(a2, slashR * 0.92, inst.lineWidth + 0.6, inst.secondaryColor);
            strokeCut(a2, slashR * 0.7, 1.8, '#ffffff');
            break;
          }

          case 'flying_sword': {
            // 어검 삼중 비검 관통광 (3 converging spirit-sword light lances!)
            for (let k = -1; k <= 1; k++) {
              const ba = aimAng + k * 0.44;
              const len = slashR * (k === 0 ? 1.18 : 0.92);
              strokeCut(ba, len, inst.lineWidth + 3.2, PIXEL_OUTLINE);
              strokeCut(ba, len, inst.lineWidth + 0.4, k === 0 ? inst.color : inst.secondaryColor);
              strokeCut(ba, len * 0.78, 1.6, '#ffffff');
            }
            break;
          }

          case 'saber': {
            // 패도·대도 반달 중참격 (Thick curved heavy-cleave crescent gash + forge sparks!)
            ctx.save();
            ctx.translate(inst.x, inst.y);
            ctx.rotate(aimAng + (((inst.startTick & 1) === 0 ? 1 : -1) * 0.35));
            const cr = slashR * 0.95;
            ctx.beginPath();
            ctx.arc(-cr * 0.25, 0, cr, -0.95, 0.95);
            ctx.quadraticCurveTo(cr * 0.15, 0, -cr * 0.25 + Math.cos(-0.95) * cr, Math.sin(-0.95) * cr);
            ctx.closePath();
            ctx.fillStyle = inst.color;
            ctx.fill();
            ctx.lineWidth = Math.max(1.5, 2.8 * inv);
            ctx.strokeStyle = PIXEL_OUTLINE;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(-cr * 0.25, 0, cr - 2, -0.82, 0.82);
            ctx.lineWidth = Math.max(1.2, 2.2 * inv);
            ctx.strokeStyle = isHeavy ? '#ffffff' : inst.secondaryColor;
            ctx.stroke();
            ctx.restore();
            break;
          }

          case 'spear_staff': {
            // 창·봉 관통 충격파 (Directional piercing lance + perpendicular sonic shock ring!)
            ctx.save();
            ctx.translate(inst.x, inst.y);
            ctx.rotate(aimAng);
            ctx.beginPath();
            ctx.moveTo(-slashR * 0.85, 0);
            ctx.lineTo(slashR * 1.2, 0);
            ctx.lineCap = 'round';
            ctx.lineWidth = Math.max(1.5, (inst.lineWidth + 4.4) * inv);
            ctx.strokeStyle = PIXEL_OUTLINE;
            ctx.stroke();
            ctx.lineWidth = Math.max(1.2, (inst.lineWidth + 1.2) * inv);
            ctx.strokeStyle = inst.color;
            ctx.stroke();
            ctx.lineWidth = Math.max(1, 2 * inv);
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();

            ctx.beginPath();
            ctx.ellipse(0, 0, Math.max(2, slashR * 0.22), slashR * 0.68, 0, 0, Math.PI * 2);
            ctx.lineWidth = Math.max(1.2, 3.2 * inv);
            ctx.strokeStyle = PIXEL_OUTLINE;
            ctx.stroke();
            ctx.lineWidth = Math.max(1, 1.8 * inv);
            ctx.strokeStyle = inst.secondaryColor;
            ctx.stroke();
            ctx.restore();
            break;
          }

          case 'palm_fist': {
            // 권풍·경타 파열원진 (Concussive martial shockwave ring + 8-ray impact burst!)
            const pr = slashR * 0.82;
            ctx.beginPath();
            ctx.arc(inst.x, inst.y, pr, 0, Math.PI * 2);
            ctx.lineWidth = Math.max(1.5, (inst.lineWidth + 4.2) * inv);
            ctx.strokeStyle = PIXEL_OUTLINE;
            ctx.stroke();
            ctx.lineWidth = Math.max(1.2, (inst.lineWidth + 1.2) * inv);
            ctx.strokeStyle = inst.color;
            ctx.stroke();

            for (let rIdx = 0; rIdx < 6; rIdx++) {
              const ra = aimAng + (rIdx * Math.PI) / 3;
              const r0 = pr * 0.45;
              const r1 = pr * 1.22;
              ctx.beginPath();
              ctx.moveTo(inst.x + Math.cos(ra) * r0, inst.y + Math.sin(ra) * r0);
              ctx.lineTo(inst.x + Math.cos(ra) * r1, inst.y + Math.sin(ra) * r1);
              ctx.lineCap = 'round';
              ctx.lineWidth = Math.max(1, 2.4 * inv);
              ctx.strokeStyle = rIdx % 2 === 0 ? '#ffffff' : inst.secondaryColor;
              ctx.stroke();
            }
            break;
          }

          case 'dagger_hidden': {
            // 암기·독비수 3연 관통흔 (3 pinpoint poison-dagger puncture streaks!)
            for (let d = -1; d <= 1; d++) {
              const da = aimAng + d * 0.3;
              const offPerp = d * 4;
              const px = inst.x + Math.cos(aimAng + Math.PI * 0.5) * offPerp;
              const py = inst.y + Math.sin(aimAng + Math.PI * 0.5) * offPerp;
              const len = slashR * (d === 0 ? 1.05 : 0.8);
              ctx.beginPath();
              ctx.moveTo(px - Math.cos(da) * len * 0.7, py - Math.sin(da) * len * 0.7);
              ctx.lineTo(px + Math.cos(da) * len, py + Math.sin(da) * len);
              ctx.lineCap = 'round';
              ctx.lineWidth = Math.max(1.2, 4.2 * inv);
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.lineWidth = Math.max(1, 2.1 * inv);
              ctx.strokeStyle = d === 0 ? '#ffffff' : d < 0 ? inst.color : inst.secondaryColor;
              ctx.stroke();
            }
            break;
          }

          case 'staff_gourd': {
            // 독호리병 맹독 기포 파열 (Splashing emerald-violet venom ring + 5 rising poison bubbles!)
            const vr = slashR * 0.78;
            ctx.beginPath();
            ctx.arc(inst.x, inst.y, vr, 0, Math.PI * 2);
            ctx.fillStyle = hexWithAlpha(inst.color, 0.34 * inv);
            ctx.fill();
            ctx.lineWidth = Math.max(1.4, 3.2 * inv);
            ctx.strokeStyle = PIXEL_OUTLINE;
            ctx.stroke();
            ctx.lineWidth = Math.max(1, 1.8 * inv);
            ctx.strokeStyle = inst.color;
            ctx.stroke();

            for (let b = 0; b < 5; b++) {
              const ba = (b * Math.PI * 2) / 5 + p * 1.4;
              const bx = inst.x + Math.cos(ba) * vr * 0.75;
              const by = inst.y + Math.sin(ba) * vr * 0.65 - p * 10;
              const br = Math.max(1.8, (4.2 - (b % 2)) * inv);
              ctx.beginPath();
              ctx.arc(bx, by, br, 0, Math.PI * 2);
              ctx.fillStyle = b % 2 === 0 ? inst.color : inst.secondaryColor;
              ctx.fill();
              ctx.lineWidth = 1.4;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
            }
            break;
          }

          case 'sorcery_qi': {
            // 마교 혈마구·마염 폭발 (Dark-crimson core implosion + counter-rotating hellfire arcs!)
            const mr = slashR * 0.85;
            ctx.beginPath();
            ctx.arc(inst.x, inst.y, mr * 0.42, 0, Math.PI * 2);
            ctx.fillStyle = PIXEL_OUTLINE;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(inst.x, inst.y, mr * 0.26, 0, Math.PI * 2);
            ctx.fillStyle = '#fde047';
            ctx.fill();

            for (let ring = 0; ring < 2; ring++) {
              const aStart = (ring === 0 ? 1 : -1) * p * 5 + ring * Math.PI;
              ctx.beginPath();
              ctx.arc(inst.x, inst.y, mr * (0.72 + ring * 0.24), aStart, aStart + Math.PI * 1.25);
              ctx.lineCap = 'round';
              ctx.lineWidth = Math.max(1.4, 4.4 * inv);
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.lineWidth = Math.max(1, 2.2 * inv);
              ctx.strokeStyle = ring === 0 ? inst.color : inst.secondaryColor;
              ctx.stroke();
            }
            break;
          }

          case 'sword':
          default: {
            // 정통 명검 일섬 (Crisp diagonal Wuxia sword cut + optional heavy cross-flash!)
            const cutAng =
              aimAng + (((inst.startTick + Math.round(inst.x)) & 1) === 0 ? 0.34 : -0.34);
            strokeCut(cutAng, slashR * 1.08, inst.lineWidth + 4.4, PIXEL_OUTLINE);
            strokeCut(cutAng, slashR * 1.08, inst.lineWidth + 1.2, inst.color);
            strokeCut(cutAng, slashR * 0.84, 2.2, '#ffffff');

            if (isHeavy) {
              const crossAng = cutAng + Math.PI * 0.52;
              strokeCut(crossAng, slashR * 0.74, inst.lineWidth + 3.2, PIXEL_OUTLINE);
              strokeCut(crossAng, slashR * 0.74, inst.lineWidth, inst.secondaryColor);
              strokeCut(crossAng, slashR * 0.58, 1.8, '#fffbeb');
            }
            break;
          }
        }

        // Sharp central impact star glint during initial hit frames
        if (p < 0.5) {
          const starInv = 1 - p / 0.5;
          const sr = (isHeavy ? 12 : 8) * starInv;
          ctx.beginPath();
          ctx.arc(inst.x, inst.y, sr * 0.52, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.lineWidth = 1.8;
          ctx.strokeStyle = PIXEL_OUTLINE;
          ctx.stroke();
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

  private spawnOrMergeDamageText(
    entityId: number,
    x: number,
    y: number,
    damage: number,
    isCrit: boolean,
    isSkill: boolean,
    isShred: boolean,
    isExecute: boolean,
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
        item.isExecute = item.isExecute || isExecute;
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
        item.isExecute = isExecute;
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

    // 2. #overlay-canvas flash + BOSS WAVE / Ascension celebration banner
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

    if (!flashActive && !bannerActive) {
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

    if (bannerActive && this.banner) {
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
      const x = this.pOriginX[i]! + this.pVx[i]! * elapsed * drag;
      const y =
        this.pOriginY[i]! +
        this.pVy[i]! * elapsed * drag +
        0.5 * this.pGravity[i]! * elapsed * elapsed;
      const size = this.pSize[i]! * (0.45 + inv * 0.72);

      ctx.globalAlpha = inv * 0.95;
      ctx.fillStyle = PIXEL_OUTLINE;
      ctx.fillRect(x - size - 1, y - size - 1, size * 2 + 2, size * 2 + 2);
      ctx.fillStyle = this.pColor[i]!;
      ctx.fillRect(x - size, y - size, size * 2, size * 2);
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
      const life = item.isCrit ? 0.82 : item.isShred || item.isSkill ? 0.7 : 0.58;
      const elapsed = this.currentSimTimeSec - item.startTick * TICK_DT;
      if (elapsed >= life || elapsed < 0) {
        item.active = false;
        continue;
      }
      const p = elapsed / life;
      const rawDrawX = item.x + item.offsetX + item.driftVx * elapsed;
      const drawX = Math.max(34, Math.min(LOGICAL_WIDTH - 34, rawDrawX));
      const riseDist = item.isCrit ? 46 : item.isShred || item.isSkill ? 36 : 28;
      const riseY = item.y - easeOutCubic(p) * riseDist;
      const fade = p < 0.72 ? 1 : 1 - (p - 0.72) / 0.28;

      let scale: number;
      if (item.isCrit) {
        scale =
          p < 0.13
            ? 0.78 + (p / 0.13) * 0.48
            : p < 0.28
              ? 1.26 - ((p - 0.13) / 0.15) * 0.34
              : 0.92 - (p - 0.28) * 0.08;
      } else if (item.isShred || item.isSkill) {
        scale =
          p < 0.14
            ? 0.62 + (p / 0.14) * 0.32
            : 0.94 - Math.min(0.18, (p - 0.14) * 0.28);
      } else {
        scale =
          p < 0.14
            ? 0.52 + (p / 0.14) * 0.24
            : 0.76 - Math.min(0.16, (p - 0.14) * 0.28);
      }

      const formatted = formatDamageValue(item.value);
      const label = item.isCrit || item.isShred ? `${formatted}!` : formatted;
      const style = item.isCrit
        ? 'crit'
        : item.isShred
          ? 'shred'
          : item.isSkill
            ? 'skill'
            : 'normal';
      this.sprites.drawGlyphString(ctx, label, drawX, riseY, scale, fade, style);

      // Pre-rendered mini Wuxia impact stamp above critical / armor-broken / heavy execution hits
      const badgeKind =
        item.isCrit && item.isShred
          ? 'shred'
          : item.isCrit
            ? 'crit'
            : item.isShred
              ? 'shred'
              : item.isExecute && item.value >= 180
                ? 'execute'
                : null;
      if (badgeKind) {
        const badge = this.sprites.hitBadge(badgeKind);
        const bScale = (item.isCrit ? 0.56 : 0.48) * Math.min(1.08, scale / 0.8);
        const bw = badge.width * bScale;
        const bh = badge.height * bScale;
        ctx.globalAlpha = prevAlpha * Math.max(0, Math.min(1, fade * 0.96));
        ctx.drawImage(badge, drawX - bw * 0.5, riseY - 23 * scale - bh * 0.75, bw, bh);
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

function easeOutCubic(t: number): number {
  const inv = 1 - Math.max(0, Math.min(1, t));
  return 1 - inv * inv * inv;
}
