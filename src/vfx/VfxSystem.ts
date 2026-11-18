import { Pool } from '../core/Pool';
import { TICK_DT } from '../core/time';
import type { VfxTrackKind } from '../data/types';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../platform/Viewport';
import type { CanvasStack } from '../render/CanvasStack';
import { type IRenderable, RenderLayer } from '../render/RenderLayer';
import type { SpriteCache } from '../render/SpriteCache';

const MAX_VFX_INSTANCES = 64;
const MAX_PARTICLES = 1500;

type InternalVfxKind = 'ring' | 'craft_pillar' | VfxTrackKind;

interface TrackVfxInstance {
  kind: InternalVfxKind;
  startTick: number;
  durationSec: number;
  fromX: number;
  fromY: number;
  x: number;
  y: number;
  fromRadius: number;
  toRadius: number;
  color: string;
  lineWidth: number;
  glowRadius: number;
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
  value: number;
  isCrit: boolean;
}

interface ScreenFlashState {
  startTick: number;
  durationSec: number;
  color: string;
  peakAlpha: number;
}

interface ScreenShakeState {
  startTick: number;
  durationSec: number;
  intensity: number;
}

interface OverlayBannerState {
  startRealMs: number;
  durationSec: number;
  sprite: HTMLCanvasElement;
}

/**
 * Pure presentation VFX system synchronized to simulation clock:
 * t = (currentTick + alpha - startTick) * TICK_DT (AGENTS.md §3 & §4).
 * Screen banners use timeBase: 'real' (timestamp difference, never dt accumulation).
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
  private flash: ScreenFlashState | null = null;
  private shake: ScreenShakeState | null = null;
  private banner: OverlayBannerState | null = null;
  private currentSimTimeSec = 0;

  private readonly particleBatchRenderable: IRenderable;
  private readonly damageBatchRenderable: IRenderable;

  public constructor(sprites: SpriteCache) {
    this.sprites = sprites;

    this.trackPool = new Pool<TrackVfxInstance>(
      () => {
        const inst: TrackVfxInstance = {
          kind: 'ring',
          startTick: 0,
          durationSec: 0.4,
          fromX: 0,
          fromY: 0,
          x: 0,
          y: 0,
          fromRadius: 8,
          toRadius: 48,
          color: '#ffffff',
          lineWidth: 3,
          glowRadius: 42,
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
      },
      24,
    );

    for (let i = 0; i < 56; i++) {
      this.damageTexts.push({
        active: false,
        entityId: -1,
        startTick: 0,
        x: 0,
        y: 0,
        value: 0,
        isCrit: false,
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
      glowRadius: gradeRank >= 3 ? 58 : 34,
    });

    const burstCount = gradeRank >= 4 ? 26 : gradeRank >= 2 ? 15 : 9;
    this.emitRadialBurst(x, y, color, burstCount, gradeRank >= 3 ? 160 : 110, 0.4, 0, startTick);
  }

  /**
   * Golden / Mythic vertical promotion pillar when crafting succeeds (Item 2 & Item 5).
   */
  public spawnCraftPillarFx(
    x: number,
    y: number,
    color: string,
    gradeRank: number,
    startTick: number,
  ): void {
    const pillarColor = gradeRank >= 6 ? '#fde047' : gradeRank >= 5 ? '#fb7185' : '#fbbf24';
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
      glowRadius: gradeRank >= 4 ? 80 : 52,
    });

    // Rising golden star fountain
    const sparkCount = gradeRank >= 4 ? 32 : 18;
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
      this.pColor[idx] = i % 2 === 0 ? '#fef08a' : color;
    }

    if (gradeRank >= 4) {
      this.triggerScreenShake(gradeRank >= 5 ? 9 : 6, 0.28, startTick);
      this.triggerScreenFlash(pillarColor, gradeRank >= 5 ? 0.3 : 0.2, 0.22, startTick);
    }
  }

  /**
   * Character-specific skill track playback synchronized to simulation hit tick.
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
  ): void {
    switch (track) {
      case 'gatling': {
        this.pushTrack({
          kind: 'gatling',
          startTick,
          durationSec: 0.36,
          fromX,
          fromY,
          x,
          y,
          fromRadius: 12,
          toRadius: radius,
          color: '#fb7185',
          lineWidth: 4,
          glowRadius: Math.min(72, radius * 0.75),
        });
        this.emitRadialBurst(x, y, '#fff1f2', 14, 145, 0.28, 0, startTick);
        break;
      }

      case 'red_hawk': {
        this.pushTrack({
          kind: 'red_hawk',
          startTick,
          durationSec: 0.46,
          fromX,
          fromY,
          x,
          y,
          fromRadius: 14,
          toRadius: radius,
          color: '#f97316',
          lineWidth: 5.5,
          glowRadius: Math.min(96, radius * 0.9),
        });
        this.emitRadialBurst(x, y, '#f97316', 18, 150, 0.38, -90, startTick);
        this.emitRadialBurst(x, y, '#fef08a', 10, 95, 0.32, -120, startTick);
        if (gradeRank >= 4) {
          this.triggerScreenShake(5, 0.18, startTick);
        }
        break;
      }

      case 'crescent_slash': {
        this.pushTrack({
          kind: 'crescent_slash',
          startTick,
          durationSec: 0.38,
          fromX,
          fromY,
          x,
          y,
          fromRadius: 18,
          toRadius: radius,
          color: gradeRank >= 4 ? '#c084fc' : '#38bdf8',
          lineWidth: 5,
          glowRadius: Math.min(78, radius * 0.8),
        });
        this.emitRadialBurst(
          x,
          y,
          gradeRank >= 4 ? '#e879f9' : '#bae6fd',
          14,
          155,
          0.3,
          0,
          startTick,
        );
        break;
      }

      case 'thunder_bolt': {
        this.pushTrack({
          kind: 'thunder_bolt',
          startTick,
          durationSec: 0.42,
          fromX,
          fromY,
          x,
          y,
          fromRadius: 12,
          toRadius: radius,
          color: '#facc15',
          lineWidth: 4.5,
          glowRadius: Math.min(84, radius * 0.85),
        });
        this.emitRadialBurst(x, y, '#fef08a', 16, 165, 0.32, 40, startTick);
        break;
      }

      case 'room_strike': {
        this.pushTrack({
          kind: 'room_strike',
          startTick,
          durationSec: 0.5,
          fromX,
          fromY,
          x,
          y,
          fromRadius: radius * 0.45,
          toRadius: radius,
          color: '#38bdf8',
          lineWidth: 3.5,
          glowRadius: Math.min(88, radius * 0.8),
        });
        this.emitRadialBurst(x, y, '#7dd3fc', 14, 130, 0.34, 0, startTick);
        break;
      }

      case 'conqueror_haki': {
        const hakiColor = gradeRank >= 6 ? '#c084fc' : '#f43f5e';
        this.pushTrack({
          kind: 'conqueror_haki',
          startTick,
          durationSec: 0.54,
          fromX,
          fromY,
          x,
          y,
          fromRadius: 16,
          toRadius: radius,
          color: hakiColor,
          lineWidth: 6.5,
          glowRadius: Math.min(115, radius * 0.95),
        });
        this.emitRadialBurst(x, y, hakiColor, 26, 200, 0.42, 0, startTick);
        this.triggerScreenShake(gradeRank >= 6 ? 8 : 6, 0.22, startTick);
        this.triggerScreenFlash(hakiColor, 0.16, 0.14, startTick);
        break;
      }

      case 'quake_shatter': {
        this.pushTrack({
          kind: 'quake_shatter',
          startTick,
          durationSec: 0.54,
          fromX,
          fromY,
          x,
          y,
          fromRadius: 20,
          toRadius: radius,
          color: '#67e8f9',
          lineWidth: 6,
          glowRadius: Math.min(110, radius * 0.9),
        });
        this.emitRadialBurst(x, y, '#ecfeff', 24, 185, 0.4, 0, startTick);
        this.triggerScreenShake(8, 0.25, startTick);
        this.triggerScreenFlash('#cffafe', 0.16, 0.14, startTick);
        break;
      }

      default: {
        this.emitRadialBurst(x, y, color, 12, 120, 0.3, 0, startTick);
        break;
      }
    }
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
      color: '#10b981',
      lineWidth: 3,
      glowRadius: 0,
    });
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
  ): void {
    const burstCount = slain ? 13 : isCrit ? 9 : 4;
    const burstColor = isCrit ? '#facc15' : color;
    this.emitRadialBurst(x, y, burstColor, burstCount, slain ? 130 : 85, 0.25, 0, startTick);
    this.spawnOrMergeDamageText(entityId, x, y - 18, damage, isCrit, startTick);
  }

  public showBossWaveBanner(wave: number, bossName: string, realNowMs: number): void {
    const sprite = this.sprites.overlayBanner(
      `boss:${wave}:${bossName}`,
      'boss',
      `⚠️ BOSS WAVE ${String(wave).padStart(2, '0')} ⚠️`,
      `${bossName} 출현!`,
      '#ef4444',
    );
    this.banner = {
      startRealMs: realNowMs,
      durationSec: 2.2,
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
      `✦ ${gradeName} 등급 강림! ✦`,
      `${unitName} 조합 성공!`,
      accentColor,
    );
    this.banner = {
      startRealMs: realNowMs,
      durationSec: 2.0,
      sprite,
    };
  }

  public triggerScreenShake(intensity: number, durationSec: number, startTick: number): void {
    this.shake = { startTick, durationSec, intensity };
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
    cfg: Omit<TrackVfxInstance, 'renderableGround' | 'renderableAir' | 'progress'>,
  ): void {
    if (this.activeTracks.length >= MAX_VFX_INSTANCES) {
      const oldest = this.activeTracks.shift();
      if (oldest) {
        this.trackPool.release(oldest);
      }
    }
    const inst = this.trackPool.acquire();
    inst.kind = cfg.kind;
    inst.startTick = cfg.startTick;
    inst.durationSec = cfg.durationSec;
    inst.fromX = cfg.fromX;
    inst.fromY = cfg.fromY;
    inst.x = cfg.x;
    inst.y = cfg.y;
    inst.fromRadius = cfg.fromRadius;
    inst.toRadius = cfg.toRadius;
    inst.color = cfg.color;
    inst.lineWidth = cfg.lineWidth;
    inst.glowRadius = cfg.glowRadius;
    inst.renderableGround.sortY = cfg.y;
    inst.renderableAir.sortY = cfg.y;
    this.activeTracks.push(inst);
  }

  private renderTrackGround(ctx: CanvasRenderingContext2D, inst: TrackVfxInstance): void {
    const p = inst.progress;
    const inv = 1 - p;
    const radius = inst.fromRadius + (inst.toRadius - inst.fromRadius) * easeOutCubic(p);
    const prevAlpha = ctx.globalAlpha;

    if (inst.kind === 'room_strike') {
      // Translucent cyan surgical ROOM dome on deck
      ctx.globalAlpha = inv * 0.24;
      ctx.beginPath();
      ctx.arc(inst.x, inst.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
    }

    ctx.globalAlpha = inv * 0.85;
    ctx.beginPath();
    ctx.arc(inst.x, inst.y, radius, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1.2, inst.lineWidth * inv);
    ctx.strokeStyle = inst.color;
    ctx.stroke();

    if (inst.kind === 'conqueror_haki' || inst.kind === 'craft_pillar') {
      ctx.beginPath();
      ctx.arc(inst.x, inst.y, radius * 0.62, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1, inst.lineWidth * 0.65 * inv);
      ctx.strokeStyle = '#ffffff';
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
      const r = inst.glowRadius * (0.72 + p * 0.45);
      ctx.globalAlpha = inv * 0.62;
      ctx.drawImage(glow, inst.x - r, inst.y - r, r * 2, r * 2);
    }

    switch (inst.kind) {
      case 'craft_pillar': {
        const colW = Math.max(6, (1 - p * 0.65) * 34);
        const colH = 190 * easeOutCubic(Math.min(1, p * 2.2));
        ctx.globalAlpha = inv * 0.78;
        ctx.fillStyle = inst.color;
        ctx.fillRect(inst.x - colW, inst.y - colH, colW * 2, colH + 14);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(inst.x - colW * 0.42, inst.y - colH, colW * 0.84, colH + 10);
        break;
      }

      case 'gatling': {
        // Multi-fist rapid shock-lines between unit and impact target
        const dx = inst.x - inst.fromX;
        const dy = inst.y - inst.fromY;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;

        ctx.globalAlpha = inv * 0.9;
        ctx.strokeStyle = '#fff1f2';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let k = -2; k <= 2; k++) {
          const off = k * 9;
          const sx = inst.fromX + dx * 0.25 + nx * off;
          const sy = inst.fromY + dy * 0.25 + ny * off;
          const ex = inst.fromX + dx * (0.65 + p * 0.35) + nx * off * 1.3;
          const ey = inst.fromY + dy * (0.65 + p * 0.35) + ny * off * 1.3;
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
        }
        ctx.stroke();
        break;
      }

      case 'red_hawk': {
        // Swirling flame rings & core flare
        const r = inst.toRadius * (0.35 + p * 0.55);
        ctx.globalAlpha = inv * 0.88;
        ctx.beginPath();
        ctx.arc(inst.x, inst.y, r * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = '#fde047';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(inst.x, inst.y, r, p * 4, p * 4 + Math.PI * 1.35);
        ctx.lineWidth = 6 * inv;
        ctx.strokeStyle = '#f97316';
        ctx.stroke();
        break;
      }

      case 'crescent_slash': {
        const ang = Math.atan2(inst.y - inst.fromY, inst.x - inst.fromX);
        const arcR = inst.toRadius * (0.45 + easeOutCubic(p) * 0.55);
        ctx.save();
        ctx.translate(inst.x, inst.y);
        ctx.rotate(ang);
        ctx.globalAlpha = inv * 0.95;

        ctx.beginPath();
        ctx.arc(0, 0, arcR, -Math.PI * 0.42, Math.PI * 0.42);
        ctx.quadraticCurveTo(arcR * 0.45, 0, Math.cos(-Math.PI * 0.42) * arcR, Math.sin(-Math.PI * 0.42) * arcR);
        ctx.fillStyle = inst.color;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.restore();
        break;
      }

      case 'thunder_bolt': {
        // Jagged vertical lightning bolt striking down from sky to target
        ctx.globalAlpha = inv * 0.96;
        const skyY = inst.y - 185;
        const seed = inst.startTick * 17;
        const drawBolt = (w: number, col: string): void => {
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
        drawBolt(8, '#facc15');
        drawBolt(3.5, '#ffffff');
        break;
      }

      case 'room_strike': {
        const r = inst.toRadius * 0.85;
        ctx.globalAlpha = inv * 0.92;
        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 3.5 * inv;
        ctx.beginPath();
        ctx.moveTo(inst.x - r, inst.y - r * 0.35);
        ctx.lineTo(inst.x + r, inst.y + r * 0.35);
        ctx.moveTo(inst.x - r * 0.4, inst.y + r * 0.85);
        ctx.lineTo(inst.x + r * 0.4, inst.y - r * 0.85);
        ctx.stroke();
        break;
      }

      case 'conqueror_haki': {
        // Radial Conqueror's Haki lightning arcs crackling outward
        const maxR = inst.toRadius * easeOutCubic(p);
        ctx.globalAlpha = inv * 0.95;
        ctx.lineWidth = 4 * inv;
        ctx.strokeStyle = inst.color;
        ctx.beginPath();
        for (let b = 0; b < 6; b++) {
          const baseAng = (b * Math.PI) / 3 + (inst.startTick % 11) * 0.2;
          const midR = maxR * 0.55;
          ctx.moveTo(inst.x, inst.y);
          ctx.lineTo(
            inst.x + Math.cos(baseAng + 0.16) * midR,
            inst.y + Math.sin(baseAng + 0.16) * midR,
          );
          ctx.lineTo(inst.x + Math.cos(baseAng) * maxR, inst.y + Math.sin(baseAng) * maxR);
        }
        ctx.stroke();
        break;
      }

      case 'quake_shatter': {
        // Whitebeard spatial air fracture lines
        const maxR = inst.toRadius * (0.5 + p * 0.5);
        ctx.globalAlpha = inv * 0.95;
        ctx.lineWidth = 3.5 * inv;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        for (let b = 0; b < 7; b++) {
          const ang = (b * Math.PI * 2) / 7 + 0.25;
          const r1 = maxR * 0.45;
          const x1 = inst.x + Math.cos(ang) * r1;
          const y1 = inst.y + Math.sin(ang) * r1;
          ctx.moveTo(inst.x, inst.y);
          ctx.lineTo(x1, y1);
          ctx.lineTo(
            x1 + Math.cos(ang + 0.38) * (maxR * 0.48),
            y1 + Math.sin(ang + 0.38) * (maxR * 0.48),
          );
          ctx.moveTo(x1, y1);
          ctx.lineTo(
            x1 + Math.cos(ang - 0.32) * (maxR * 0.38),
            y1 + Math.sin(ang - 0.32) * (maxR * 0.38),
          );
        }
        ctx.stroke();
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
      this.pSize[idx] = 2.6 + (i % 3) * 1.2;
      this.pColor[idx] = color;
    }
  }

  private spawnOrMergeDamageText(
    entityId: number,
    x: number,
    y: number,
    damage: number,
    isCrit: boolean,
    startTick: number,
  ): void {
    for (let i = 0; i < this.damageTexts.length; i++) {
      const item = this.damageTexts[i]!;
      if (item.active && item.entityId === entityId && startTick - item.startTick <= 3) {
        item.value += damage;
        item.x = x;
        item.y = y;
        item.isCrit = item.isCrit || isCrit;
        item.startTick = startTick;
        return;
      }
    }

    for (let i = 0; i < this.damageTexts.length; i++) {
      const item = this.damageTexts[i]!;
      if (!item.active) {
        item.active = true;
        item.entityId = entityId;
        item.startTick = startTick;
        item.x = x;
        item.y = y;
        item.value = damage;
        item.isCrit = isCrit;
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
    buckets[RenderLayer.WorldUI]!.push(this.damageBatchRenderable);
  }

  public renderScreenFx(
    stack: CanvasStack,
    currentTick: number,
    alpha: number,
    realNowMs = performance.now(),
  ): void {
    // 1. CSS transform shake on #shake-layer
    if (this.shake) {
      const elapsed = (currentTick + alpha - this.shake.startTick) * TICK_DT;
      if (elapsed >= this.shake.durationSec || elapsed < 0) {
        this.shake = null;
        stack.setShakeOffset(0, 0);
      } else {
        const decay = 1 - elapsed / this.shake.durationSec;
        const phase = elapsed * 58;
        const dx = Math.sin(phase) * this.shake.intensity * decay;
        const dy = Math.cos(phase * 1.31) * this.shake.intensity * decay;
        stack.setShakeOffset(dx, dy);
      }
    } else {
      stack.setShakeOffset(0, 0);
    }

    // 2. #overlay-canvas flash + BOSS WAVE / Legendary+ celebration banner
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
        slideScale = 0.78 + easeOutCubic(t) * 0.26;
        alphaBanner = t;
        offsetY = (1 - easeOutCubic(t)) * -28;
      } else if (bp < 0.22) {
        const t = (bp - 0.14) / 0.08;
        slideScale = 1.04 - t * 0.04;
      } else if (bp > 0.8) {
        const t = (bp - 0.8) / 0.2;
        alphaBanner = 1 - t;
        offsetY = -t * 22;
      }

      const drawW = 660 * slideScale;
      const drawH = 132 * slideScale;
      const bx = (LOGICAL_WIDTH - drawW) * 0.5;
      const by = 148 + offsetY - (drawH - 132) * 0.5;

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
      const size = this.pSize[i]! * (0.42 + inv * 0.72);

      ctx.globalAlpha = inv * 0.92;
      ctx.fillStyle = this.pColor[i]!;
      ctx.fillRect(x - size, y - size, size * 2, size * 2);
    }

    ctx.globalAlpha = prevAlpha;
  }

  private renderDamageTexts(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.damageTexts.length; i++) {
      const item = this.damageTexts[i]!;
      if (!item.active) continue;
      const life = item.isCrit ? 0.68 : 0.52;
      const elapsed = this.currentSimTimeSec - item.startTick * TICK_DT;
      if (elapsed >= life || elapsed < 0) {
        item.active = false;
        continue;
      }
      const p = elapsed / life;
      const riseY = item.y - easeOutCubic(p) * (item.isCrit ? 34 : 22);
      const fade = p < 0.68 ? 1 : 1 - (p - 0.68) / 0.32;

      let scale = 0.42;
      if (item.isCrit) {
        const pop = p < 0.16 ? 0.96 - (0.16 - p) * 1.4 : 0.72 - p * 0.08;
        scale = Math.max(0.62, pop);
      }

      const label = item.isCrit ? `${item.value}!` : String(item.value);
      this.sprites.drawGlyphString(ctx, label, item.x, riseY, scale, fade, item.isCrit);
    }
  }
}

function easeOutCubic(t: number): number {
  const inv = 1 - Math.max(0, Math.min(1, t));
  return 1 - inv * inv * inv;
}
