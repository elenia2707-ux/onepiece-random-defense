import { Pool } from '../core/Pool';
import { TICK_DT } from '../core/time';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../platform/Viewport';
import type { CanvasStack } from '../render/CanvasStack';
import { type IRenderable, RenderLayer } from '../render/RenderLayer';
import type { SpriteCache } from '../render/SpriteCache';

const MAX_VFX_INSTANCES = 64;
const MAX_PARTICLES = 1500;

interface RingVfxInstance {
  startTick: number;
  durationSec: number;
  x: number;
  y: number;
  fromRadius: number;
  toRadius: number;
  color: string;
  lineWidth: number;
  glowRadius: number;
  renderableGround: IRenderable;
  renderableAir: IRenderable;
  progress: number;
}

interface FloatingDamageItem {
  active: boolean;
  entityId: number;
  startTick: number;
  x: number;
  y: number;
  value: number;
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

/**
 * Pure presentation VFX system synchronized to simulation clock:
 * t = (currentTick + alpha - startTick) * TICK_DT (AGENTS.md §3 & §4).
 * Never mutates simulation state.
 */
export class VfxSystem {
  private readonly sprites: SpriteCache;
  private readonly activeRings: RingVfxInstance[] = [];
  private readonly ringPool: Pool<RingVfxInstance>;

  // SoA particle storage (zero GC per frame)
  private readonly pActive = new Uint8Array(MAX_PARTICLES);
  private readonly pStartTick = new Int32Array(MAX_PARTICLES);
  private readonly pLifeSec = new Float32Array(MAX_PARTICLES);
  private readonly pOriginX = new Float32Array(MAX_PARTICLES);
  private readonly pOriginY = new Float32Array(MAX_PARTICLES);
  private readonly pVx = new Float32Array(MAX_PARTICLES);
  private readonly pVy = new Float32Array(MAX_PARTICLES);
  private readonly pSize = new Float32Array(MAX_PARTICLES);
  private readonly pColor: string[] = new Array<string>(MAX_PARTICLES).fill('#ffffff');
  private particleCursor = 0;

  private readonly damageTexts: FloatingDamageItem[] = [];
  private flash: ScreenFlashState | null = null;
  private shake: ScreenShakeState | null = null;
  private currentSimTimeSec = 0;

  private readonly particleBatchRenderable: IRenderable;
  private readonly damageBatchRenderable: IRenderable;

  public constructor(sprites: SpriteCache) {
    this.sprites = sprites;

    this.ringPool = new Pool<RingVfxInstance>(
      () => {
        const inst: RingVfxInstance = {
          startTick: 0,
          durationSec: 0.4,
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
            render: (ctx) => {
              const p = inst.progress;
              const inv = 1 - p;
              const radius = inst.fromRadius + (inst.toRadius - inst.fromRadius) * easeOutCubic(p);
              const prevAlpha = ctx.globalAlpha;
              ctx.globalAlpha = inv * 0.85;
              ctx.beginPath();
              ctx.arc(inst.x, inst.y, radius, 0, Math.PI * 2);
              ctx.lineWidth = Math.max(1, inst.lineWidth * inv);
              ctx.strokeStyle = inst.color;
              ctx.stroke();
              ctx.globalAlpha = prevAlpha;
            },
          },
          renderableAir: {
            layer: RenderLayer.AirFx,
            sortY: 0,
            render: (ctx) => {
              if (inst.glowRadius <= 0) return;
              const p = inst.progress;
              const inv = 1 - p;
              const glow = this.sprites.glow(inst.color, inst.glowRadius);
              const r = inst.glowRadius * (0.75 + p * 0.45);
              const prevAlpha = ctx.globalAlpha;
              ctx.globalAlpha = inv * 0.65;
              ctx.drawImage(glow, inst.x - r, inst.y - r, r * 2, r * 2);
              ctx.globalAlpha = prevAlpha;
            },
          },
        };
        return inst;
      },
      (inst) => {
        inst.progress = 0;
      },
      16,
    );

    for (let i = 0; i < 48; i++) {
      this.damageTexts.push({
        active: false,
        entityId: -1,
        startTick: 0,
        x: 0,
        y: 0,
        value: 0,
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
    this.pushRing({
      startTick,
      durationSec: gradeRank >= 3 ? 0.55 : 0.36,
      x,
      y,
      fromRadius: 12,
      toRadius: gradeRank >= 3 ? 74 : 48,
      color,
      lineWidth: gradeRank >= 3 ? 5 : 3,
      glowRadius: gradeRank >= 3 ? 64 : 38,
    });

    const burstCount = gradeRank >= 4 ? 26 : gradeRank >= 2 ? 16 : 10;
    this.emitRadialBurst(x, y, color, burstCount, gradeRank >= 3 ? 165 : 115, 0.42, startTick);

    if (gradeRank >= 3) {
      this.triggerScreenShake(gradeRank >= 4 ? 7 : 4, 0.24, startTick);
      this.triggerScreenFlash(color, gradeRank >= 4 ? 0.28 : 0.16, 0.18, startTick);
    }
  }

  public spawnMovePulse(x: number, y: number, startTick: number): void {
    this.pushRing({
      startTick,
      durationSec: 0.24,
      x,
      y,
      fromRadius: 16,
      toRadius: 38,
      color: '#38c9b0',
      lineWidth: 2.5,
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
    startTick: number,
  ): void {
    this.emitRadialBurst(x, y, color, slain ? 12 : 5, slain ? 120 : 80, 0.26, startTick);
    this.spawnOrMergeDamageText(entityId, x, y - 16, damage, startTick);
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

  private pushRing(cfg: Omit<RingVfxInstance, 'renderableGround' | 'renderableAir' | 'progress'>): void {
    if (this.activeRings.length >= MAX_VFX_INSTANCES) {
      const oldest = this.activeRings.shift();
      if (oldest) {
        this.ringPool.release(oldest);
      }
    }
    const inst = this.ringPool.acquire();
    inst.startTick = cfg.startTick;
    inst.durationSec = cfg.durationSec;
    inst.x = cfg.x;
    inst.y = cfg.y;
    inst.fromRadius = cfg.fromRadius;
    inst.toRadius = cfg.toRadius;
    inst.color = cfg.color;
    inst.lineWidth = cfg.lineWidth;
    inst.glowRadius = cfg.glowRadius;
    inst.renderableGround.sortY = cfg.y;
    inst.renderableAir.sortY = cfg.y;
    this.activeRings.push(inst);
  }

  private emitRadialBurst(
    x: number,
    y: number,
    color: string,
    count: number,
    speed: number,
    lifeSec: number,
    startTick: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const idx = this.particleCursor;
      this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;

      // Deterministic visual spread angle from index + startTick (never touches simulation RNG)
      const angle = ((i + 0.37) / count) * Math.PI * 2 + (startTick % 17) * 0.19;
      const spdScale = 0.55 + ((i * 7 + startTick) % 11) * 0.055;

      this.pActive[idx] = 1;
      this.pStartTick[idx] = startTick;
      this.pLifeSec[idx] = lifeSec;
      this.pOriginX[idx] = x;
      this.pOriginY[idx] = y;
      this.pVx[idx] = Math.cos(angle) * speed * spdScale;
      this.pVy[idx] = Math.sin(angle) * speed * spdScale;
      this.pSize[idx] = 2.4 + (i % 3) * 1.1;
      this.pColor[idx] = color;
    }
  }

  private spawnOrMergeDamageText(
    entityId: number,
    x: number,
    y: number,
    damage: number,
    startTick: number,
  ): void {
    // Merge damage numbers on same target within 3 ticks (100ms at 30Hz) per docs §9
    for (let i = 0; i < this.damageTexts.length; i++) {
      const item = this.damageTexts[i]!;
      if (item.active && item.entityId === entityId && startTick - item.startTick <= 3) {
        item.value += damage;
        item.x = x;
        item.y = y;
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
        return;
      }
    }
  }

  public collect(currentTick: number, alpha: number, buckets: IRenderable[][]): void {
    this.currentSimTimeSec = (currentTick + alpha) * TICK_DT;

    for (let i = this.activeRings.length - 1; i >= 0; i--) {
      const r = this.activeRings[i]!;
      const elapsed = (currentTick + alpha - r.startTick) * TICK_DT;
      if (elapsed >= r.durationSec) {
        this.activeRings.splice(i, 1);
        this.ringPool.release(r);
        continue;
      }
      if (elapsed < 0) continue;
      r.progress = elapsed / r.durationSec;
      buckets[RenderLayer.GroundFx]!.push(r.renderableGround);
      if (r.glowRadius > 0) {
        buckets[RenderLayer.AirFx]!.push(r.renderableAir);
      }
    }

    buckets[RenderLayer.AirFx]!.push(this.particleBatchRenderable);
    buckets[RenderLayer.WorldUI]!.push(this.damageBatchRenderable);
  }

  public renderScreenFx(stack: CanvasStack, currentTick: number, alpha: number): void {
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

    // 2. #overlay-canvas flash (hidden when inactive)
    if (this.flash) {
      const elapsed = (currentTick + alpha - this.flash.startTick) * TICK_DT;
      if (elapsed >= this.flash.durationSec || elapsed < 0) {
        this.flash = null;
        stack.overlayCtx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        stack.setOverlayActive(false);
      } else {
        stack.setOverlayActive(true);
        const ctx = stack.overlayCtx;
        ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        const fade = 1 - elapsed / this.flash.durationSec;
        ctx.globalAlpha = this.flash.peakAlpha * fade;
        ctx.fillStyle = this.flash.color;
        ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        ctx.globalAlpha = 1;
      }
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
      const drag = 1 - p * 0.35;
      const x = this.pOriginX[i]! + this.pVx[i]! * elapsed * drag;
      const y = this.pOriginY[i]! + this.pVy[i]! * elapsed * drag;
      const size = this.pSize[i]! * (0.4 + inv * 0.7);

      ctx.globalAlpha = inv * 0.9;
      ctx.fillStyle = this.pColor[i]!;
      ctx.fillRect(x - size, y - size, size * 2, size * 2);
    }

    ctx.globalAlpha = prevAlpha;
  }

  private renderDamageTexts(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.damageTexts.length; i++) {
      const item = this.damageTexts[i]!;
      if (!item.active) continue;
      const elapsed = this.currentSimTimeSec - item.startTick * TICK_DT;
      if (elapsed >= 0.55 || elapsed < 0) {
        item.active = false;
        continue;
      }
      const p = elapsed / 0.55;
      const riseY = item.y - easeOutCubic(p) * 24;
      const fade = p < 0.65 ? 1 : 1 - (p - 0.65) / 0.35;
      this.sprites.drawGlyphString(ctx, String(item.value), item.x, riseY, 0.44, fade);
    }
  }
}

function easeOutCubic(t: number): number {
  const inv = 1 - Math.max(0, Math.min(1, t));
  return 1 - inv * inv * inv;
}
