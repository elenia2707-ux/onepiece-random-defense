import type { SlotRef } from '../core/CommandQueue';
import type { Simulation } from '../core/Simulation';
import { TICK_DT } from '../core/time';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../platform/Viewport';
import type { VfxSystem } from '../vfx/VfxSystem';
import type { CanvasStack } from './CanvasStack';
import { type IRenderable, RENDER_LAYER_COUNT, RenderLayer } from './RenderLayer';
import { expandedSlotRect } from './BackgroundPainter';
import { PIXEL_OUTLINE } from './ChibiPainter';
import { hexWithAlpha, type SpriteCache } from './SpriteCache';

/**
 * Crisp nearest-neighbor sprite sizes (~110% of tile width) and foot offsets from slot center.
 * Field expanded tile ~ 85px wide -> 94px sprite; Bench expanded tile ~ 99px wide -> 108px sprite.
 */
const FIELD_SPRITE = 96;
const BENCH_SPRITE = 104;
const FIELD_FOOT = 40;
const BENCH_FOOT = 34;
const MOB_SPRITE = 76;
const BOSS_SPRITE = 118;

export interface InteractionOverlayState {
  readonly selectedSlot: SlotRef | null;
  readonly draggingFromSlot: SlotRef | null;
  readonly dragLogicalX: number;
  readonly dragLogicalY: number;
  readonly hoverTargetSlot: SlotRef | null;
}

/**
 * Bucketed 7-layer world renderer.
 * Enforces `ctx.imageSmoothingEnabled = false` strictly for razor-sharp pixel art.
 */
export class Renderer {
  private readonly stack: CanvasStack;
  private readonly sprites: SpriteCache;
  private readonly vfx: VfxSystem;
  private readonly buckets: IRenderable[][];

  public constructor(stack: CanvasStack, sprites: SpriteCache, vfx: VfxSystem) {
    this.stack = stack;
    this.sprites = sprites;
    this.vfx = vfx;
    this.buckets = Array.from({ length: RENDER_LAYER_COUNT }, () => []);
  }

  public render(
    sim: Simulation,
    alpha: number,
    interaction: InteractionOverlayState,
  ): void {
    for (let i = 0; i < RENDER_LAYER_COUNT; i++) {
      this.buckets[i]!.length = 0;
    }

    const ctx = this.stack.worldCtx;
    const baseScale = this.stack.getMatrixScale();
    ctx.setTransform(baseScale, 0, 0, baseScale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    const tick = sim.tickCount;
    const simTimeSec = (tick + alpha) * TICK_DT;

    // 1. Collect slot selection / range circle / drop highlights into GroundFx & WorldUI
    this.collectBoardOverlays(sim, interaction, simTimeSec);

    // 2. Collect Monsters + Shadows + Hit Flash + Rounded HP bars
    this.collectMonsters(sim, tick, alpha);

    // 3. Collect Units + Martial Grade Aura Rings + Idle Bounce & Attack Lunge + Lock badges
    this.collectUnits(sim, tick, alpha, simTimeSec, interaction);

    // 4. Collect Sword-Qi / Martial Projectiles
    this.collectProjectiles(sim, alpha);

    // 5. Collect VFX tracks & particles
    this.vfx.collect(tick, alpha, this.buckets);

    // 6. Sort depth-ordered entity layers deterministically
    this.buckets[RenderLayer.Monster]!.sort((a, b) => a.sortY - b.sortY);
    this.buckets[RenderLayer.Unit]!.sort((a, b) => a.sortY - b.sortY);

    // 7. Execute 7 render passes with 'source-over' so vivid ink/petal/crimson VFX pop on white jade
    ctx.globalCompositeOperation = 'source-over';
    for (let layer = 0; layer < RENDER_LAYER_COUNT; layer++) {
      const list = this.buckets[layer]!;
      if (list.length === 0) continue;
      for (let j = 0; j < list.length; j++) {
        list[j]!.render(ctx, baseScale);
      }
    }

    // 8. Screen FX (#shake-layer CSS + #overlay-canvas)
    this.vfx.renderScreenFx(this.stack, tick, alpha);
  }

  private collectBoardOverlays(
    sim: Simulation,
    interaction: InteractionOverlayState,
    simTimeSec: number,
  ): void {
    const sel = interaction.selectedSlot;
    if (sel) {
      const rect = expandedSlotRect(sim.board, sel);
      const uid = sim.board.getUid(sel);
      const unit = uid !== null ? sim.getUnitByUid(uid) : undefined;
      const def = unit ? sim.data.unitsById.get(unit.unitId) : undefined;
      const grade = unit ? sim.data.gradesById.get(unit.grade) : undefined;

      this.buckets[RenderLayer.GroundFx]!.push({
        layer: RenderLayer.GroundFx,
        sortY: rect.y - 10,
        render: (ctx) => {
          // Attack range preview circle on bright white-jade arena
          if (sel.area === 'field' && def) {
            const cx = rect.x + rect.w * 0.5;
            const cy = rect.y + rect.h * 0.5;
            const accent = grade?.color ?? '#0d9488';

            ctx.beginPath();
            ctx.arc(cx, cy, def.range, 0, Math.PI * 2);
            ctx.fillStyle = hexWithAlpha(accent, 0.14);
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = hexWithAlpha(accent, 0.85);
            ctx.stroke();

            ctx.save();
            ctx.setLineDash([10, 8]);
            ctx.lineDashOffset = -simTimeSec * 24;
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(16, def.range - 5), 0, Math.PI * 2);
            ctx.lineWidth = 1.8;
            ctx.strokeStyle = 'rgba(26, 18, 36, 0.45)';
            ctx.stroke();
            ctx.restore();
          }

          // Crisp selected slot frame (pulsing imperial gold + ink outline)
          const pulse = 0.75 + Math.sin(simTimeSec * 6) * 0.25;
          ctx.beginPath();
          ctx.roundRect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4, 12);
          ctx.fillStyle = `rgba(234, 179, 8, ${(0.18 * pulse).toFixed(3)})`;
          ctx.fill();
          ctx.lineWidth = 5;
          ctx.strokeStyle = PIXEL_OUTLINE;
          ctx.stroke();
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#facc15';
          ctx.stroke();
        },
      });
    }

    const hover = interaction.hoverTargetSlot;
    if (hover && interaction.draggingFromSlot) {
      const rect = expandedSlotRect(sim.board, hover);
      const occupied = sim.board.getUid(hover) !== null;
      this.buckets[RenderLayer.WorldUI]!.push({
        layer: RenderLayer.WorldUI,
        sortY: rect.y,
        render: (ctx) => {
          ctx.beginPath();
          ctx.roundRect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4, 12);
          ctx.fillStyle = occupied ? 'rgba(234, 179, 8, 0.26)' : 'rgba(16, 185, 129, 0.28)';
          ctx.fill();
          ctx.lineWidth = 3.5;
          ctx.strokeStyle = occupied ? '#d97706' : '#059669';
          ctx.stroke();
        },
      });
    }
  }

  private collectMonsters(sim: Simulation, currentTick: number, alpha: number): void {
    const monsters = sim.getMonsters();
    if (monsters.length === 0) return;

    this.buckets[RenderLayer.Shadow]!.push({
      layer: RenderLayer.Shadow,
      sortY: 0,
      render: (ctx) => {
        ctx.fillStyle = 'rgba(26, 18, 36, 0.28)';
        for (let i = 0; i < monsters.length; i++) {
          const m = monsters[i]!;
          const x = m.prevX + (m.currX - m.prevX) * alpha;
          const y = m.prevY + (m.currY - m.prevY) * alpha;
          const sr = m.isBoss ? m.radius * 1.15 : m.radius * 0.95;
          ctx.beginPath();
          ctx.ellipse(x, y + m.radius * 0.78, sr, sr * 0.42, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    });

    for (let i = 0; i < monsters.length; i++) {
      const m = monsters[i]!;
      const x = m.prevX + (m.currX - m.prevX) * alpha;
      const y = m.prevY + (m.currY - m.prevY) * alpha;
      const distInterp = m.prevDistance + (m.currDistance - m.prevDistance) * alpha;

      const isStunned = currentTick < m.stunUntilTick;
      const isSlowed = currentTick < m.slowUntilTick;
      const drawSize = m.isBoss ? BOSS_SPRITE : MOB_SPRITE;
      const strideSin = isStunned
        ? 0
        : Math.abs(Math.sin(distInterp * (m.kind === 'jiangshi' ? 0.13 : 0.11) + m.entityId * 0.9));
      const walkHop = strideSin * (m.kind === 'jiangshi' ? 6.5 : m.isBoss ? 2.6 : 3.4);
      const facingLeft = m.currX - m.prevX < -0.05;
      const footOff = Math.round(m.radius * 0.85);

      const baseSprite = this.sprites.monsterSprite(m.kind, false);
      const hitAgeSec = (currentTick + alpha - m.lastHitTick) * TICK_DT;
      const showHitFlash = hitAgeSec >= 0 && hitAgeSec < 0.11;
      const hitT = showHitFlash ? 1 - hitAgeSec / 0.11 : 0;

      if (isSlowed) {
        this.buckets[RenderLayer.GroundFx]!.push({
          layer: RenderLayer.GroundFx,
          sortY: y - 1,
          render: (ctx) => {
            ctx.beginPath();
            ctx.ellipse(x, y + m.radius * 0.7, m.radius * 1.05, m.radius * 0.48, 0, 0, Math.PI * 2);
            ctx.strokeStyle = '#16a34a';
            ctx.lineWidth = 2.5;
            ctx.stroke();
          },
        });
      }

      this.buckets[RenderLayer.Monster]!.push({
        layer: RenderLayer.Monster,
        sortY: y,
        render: (ctx) => {
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          const sx = (facingLeft ? -1 : 1) * (1 - strideSin * 0.02 + hitT * 0.15);
          const sy = 1 + strideSin * 0.026 - hitT * 0.13;
          ctx.translate(Math.round(x), Math.round(y + footOff - walkHop));
          ctx.scale(sx, sy);

          const halfW = Math.round(drawSize * 0.5);
          const spriteTop = Math.round(-drawSize * (47 / 48));
          ctx.drawImage(baseSprite, -halfW, spriteTop, drawSize, drawSize);

          if (showHitFlash) {
            const flashSprite = this.sprites.monsterSprite(m.kind, true);
            const prevA = ctx.globalAlpha;
            ctx.globalAlpha = hitT * 0.78;
            ctx.drawImage(flashSprite, -halfW, spriteTop, drawSize, drawSize);
            ctx.globalAlpha = prevA;
          }
          ctx.restore();
        },
      });

      if (m.isBoss || m.hp < m.maxHp || isStunned) {
        this.buckets[RenderLayer.WorldUI]!.push({
          layer: RenderLayer.WorldUI,
          sortY: y + 1,
          render: (ctx) => {
            const barW = m.isBoss ? 82 : 44;
            const barH = m.isBoss ? 10 : 6;
            const bx = Math.round(x - barW * 0.5);
            const rawBy = Math.round(y + footOff - drawSize * 0.92 - barH - 4);
            const by = Math.max(102, rawBy);
            const ratio = Math.max(0, Math.min(1, m.hp / m.maxHp));

            ctx.beginPath();
            ctx.roundRect(bx - 1.5, by - 1.5, barW + 3, barH + 3, 99);
            ctx.fillStyle = PIXEL_OUTLINE;
            ctx.fill();
            ctx.beginPath();
            ctx.roundRect(bx, by, barW, barH, 99);
            ctx.fillStyle = '#3b1d2e';
            ctx.fill();

            if (ratio > 0) {
              ctx.beginPath();
              ctx.roundRect(bx, by, Math.max(barH, barW * ratio), barH, 99);
              ctx.fillStyle = m.isBoss
                ? '#e11d48'
                : ratio > 0.5
                  ? '#16a34a'
                  : ratio > 0.25
                    ? '#f59e0b'
                    : '#dc2626';
              ctx.fill();

              ctx.beginPath();
              ctx.roundRect(bx + 1, by + 1, Math.max(2, barW * ratio - 2), barH * 0.36, 99);
              ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
              ctx.fill();
            }

            if (isStunned) {
              const spin = (currentTick + alpha) * 0.35;
              for (let s = 0; s < 3; s++) {
                const sa = spin + (s * Math.PI * 2) / 3;
                ctx.beginPath();
                ctx.arc(x + Math.cos(sa) * 11, by - 6 + Math.sin(sa) * 3, 2.8, 0, Math.PI * 2);
                ctx.fillStyle = '#facc15';
                ctx.fill();
                ctx.lineWidth = 1.2;
                ctx.strokeStyle = PIXEL_OUTLINE;
                ctx.stroke();
              }
            }
          },
        });
      }
    }
  }

  private collectUnits(
    sim: Simulation,
    currentTick: number,
    alpha: number,
    simTimeSec: number,
    interaction: InteractionOverlayState,
  ): void {
    const units = sim.getUnits();
    const draggingFrom = interaction.draggingFromSlot;

    for (let i = 0; i < units.length; i++) {
      const u = units[i]!;
      const def = sim.data.unitsById.get(u.unitId);
      const grade = sim.data.gradesById.get(u.grade);
      if (!def || !grade) continue;

      const isDraggedOrigin =
        draggingFrom !== null &&
        u.slot.area === draggingFrom.area &&
        u.slot.index === draggingFrom.index;

      // Smooth tactical glide when moved/swapped on simulation clock
      const moveElapsedSec = (currentTick + alpha - u.moveStartTick) * TICK_DT;
      let baseX = u.prevX + (u.currX - u.prevX) * alpha;
      let baseY = u.prevY + (u.currY - u.prevY) * alpha;
      if (moveElapsedSec >= 0 && moveElapsedSec < 0.14) {
        const mt = 1 - Math.pow(1 - moveElapsedSec / 0.14, 3);
        baseX = u.moveFromX + (u.currX - u.moveFromX) * mt;
        baseY = u.moveFromY + (u.currY - u.moveFromY) * mt;
      }

      // Spawn pop-in scale on simulation clock
      const spawnElapsedSec = (currentTick + alpha - u.spawnTick) * TICK_DT;
      let popScale = 1;
      if (spawnElapsedSec >= 0 && spawnElapsedSec < 0.2) {
        const st = spawnElapsedSec / 0.2;
        popScale = 0.65 + Math.sin(st * Math.PI * 0.76) * 0.41;
      }

      const isField = u.slot.area === 'field';
      const spriteSize = Math.round((isField ? FIELD_SPRITE : BENCH_SPRITE) * popScale);
      const breath = Math.sin(simTimeSec * 3.4 + u.uid * 0.87);

      // Attack lunge + crisp martial strike snap on simulation clock
      let lungeX = 0;
      let lungeY = 0;
      let lungeLift = 0;
      let lungeSnap = 0;
      const atkElapsedSec = (currentTick + alpha - u.lastAttackTick) * TICK_DT;
      if (isField && atkElapsedSec >= 0 && atkElapsedSec < 0.18) {
        const lungeCurve =
          atkElapsedSec < 0.045
            ? atkElapsedSec / 0.045
            : Math.max(0, 1 - (atkElapsedSec - 0.045) / 0.135);
        const distLunge = lungeCurve * 14;
        lungeX = u.attackDirX * distLunge;
        lungeY = u.attackDirY * distLunge;
        lungeLift = lungeCurve * 5;
        lungeSnap = lungeCurve;
      }

      const drawX = baseX + lungeX;
      const drawY = baseY + lungeY;
      const footY = baseY + (isField ? FIELD_FOOT : BENCH_FOOT);
      const drawFootY = footY + lungeY;
      const sprite = this.sprites.unitToken(def, grade);
      const facingLeft = isField && u.attackDirX < -0.2;

      // 1. Martial grade aura ring under feet (high contrast on bright white jade)
      this.buckets[RenderLayer.GroundFx]!.push({
        layer: RenderLayer.GroundFx,
        sortY: baseY - 2,
        render: (ctx) => {
          const pulse = 1 + Math.sin(simTimeSec * 3.8 + u.uid) * 0.07;
          const rx = (isField ? 31 : 29) * pulse;
          const ry = rx * 0.38;

          if (grade.rank >= 4) {
            const glow = this.sprites.glow(grade.color, 38);
            const prevA = ctx.globalAlpha;
            ctx.globalAlpha = grade.rank >= 5 ? 0.52 : 0.36;
            ctx.drawImage(glow, baseX - 38, footY - 19, 76, 38);
            ctx.globalAlpha = prevA;
          }

          ctx.beginPath();
          ctx.ellipse(baseX, footY, rx, ry, 0, 0, Math.PI * 2);
          ctx.fillStyle = hexWithAlpha(grade.color, grade.rank >= 3 ? 0.3 : 0.22);
          ctx.fill();
          ctx.lineWidth = 4;
          ctx.strokeStyle = PIXEL_OUTLINE;
          ctx.stroke();
          ctx.lineWidth = grade.rank >= 4 ? 2.6 : 2;
          ctx.strokeStyle = grade.color;
          ctx.stroke();

          // Rotating martial formation arcs for 이류(rank 2)+
          if (grade.rank >= 2) {
            const segs = Math.min(6, grade.rank + 1);
            const rot = simTimeSec * (grade.rank >= 5 ? 2.4 : 1.5);
            ctx.lineWidth = grade.rank >= 5 ? 2.8 : 2.1;
            ctx.strokeStyle =
              grade.fx === 'rainbow'
                ? '#dc2626'
                : grade.rank >= 4
                  ? '#b45309'
                  : grade.color;
            for (let s = 0; s < segs; s++) {
              const a0 = rot + (s * Math.PI * 2) / segs;
              const a1 = a0 + Math.PI / (segs + 1);
              ctx.beginPath();
              ctx.ellipse(baseX, footY, rx + 4, ry + 2.5, 0, a0, a1);
              ctx.stroke();
            }
          }
        },
      });

      // 2. Crisp ink drop shadow on white jade
      this.buckets[RenderLayer.Shadow]!.push({
        layer: RenderLayer.Shadow,
        sortY: drawY,
        render: (ctx) => {
          ctx.fillStyle = 'rgba(26, 18, 36, 0.28)';
          ctx.beginPath();
          ctx.ellipse(
            drawX,
            drawFootY + 1,
            spriteSize * 0.28,
            spriteSize * 0.088,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        },
      });

      // 3. Strictly nearest-neighbor pixel-art sprite with smooth breathing & strike snap
      this.buckets[RenderLayer.Unit]!.push({
        layer: RenderLayer.Unit,
        sortY: drawY,
        render: (ctx) => {
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          if (isDraggedOrigin) {
            ctx.globalAlpha *= 0.38;
          }
          const sx = (facingLeft ? -1 : 1) * (1 - breath * 0.02 + lungeSnap * 0.065);
          const sy = 1 + breath * 0.026 - lungeSnap * 0.045;
          ctx.translate(Math.round(drawX), Math.round(drawFootY - lungeLift));
          ctx.scale(sx, sy);
          const halfW = Math.round(spriteSize * 0.5);
          const topOff = Math.round(-spriteSize * (47 / 48));
          ctx.drawImage(sprite, -halfW, topOff, spriteSize, spriteSize);
          ctx.restore();
        },
      });

      // 4. Lock badge
      if (u.locked) {
        this.buckets[RenderLayer.WorldUI]!.push({
          layer: RenderLayer.WorldUI,
          sortY: drawY + 2,
          render: (ctx) => {
            const lx = drawX + spriteSize * 0.33;
            const ly = drawFootY - spriteSize * 0.78;
            ctx.beginPath();
            ctx.arc(lx, ly, 10, 0, Math.PI * 2);
            ctx.fillStyle = PIXEL_OUTLINE;
            ctx.fill();
            ctx.lineWidth = 2.2;
            ctx.strokeStyle = '#facc15';
            ctx.stroke();
            ctx.fillStyle = '#facc15';
            ctx.fillRect(lx - 4, ly - 1, 8, 6);
            ctx.beginPath();
            ctx.arc(lx, ly - 1.5, 2.8, Math.PI, 0);
            ctx.lineWidth = 1.8;
            ctx.stroke();
          },
        });
      }

      // 5. Drag Ghost (crisp nearest-neighbor)
      if (isDraggedOrigin) {
        const ghostSize = 98;
        const gx = Math.round(interaction.dragLogicalX);
        const gy = Math.round(interaction.dragLogicalY + ghostSize * 0.3);
        this.buckets[RenderLayer.WorldUI]!.push({
          layer: RenderLayer.WorldUI,
          sortY: 9500,
          render: (ctx) => {
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.globalAlpha = 0.94;
            ctx.drawImage(sprite, gx - ghostSize * 0.5, gy - ghostSize, ghostSize, ghostSize);
            ctx.restore();
          },
        });
      }
    }
  }

  private collectProjectiles(sim: Simulation, alpha: number): void {
    const projs = sim.getProjectiles();
    if (projs.length === 0) return;

    this.buckets[RenderLayer.Projectile]!.push({
      layer: RenderLayer.Projectile,
      sortY: 0,
      render: (ctx) => {
        for (let i = 0; i < projs.length; i++) {
          const p = projs[i]!;
          const x = p.prevX + (p.currX - p.prevX) * alpha;
          const y = p.prevY + (p.currY - p.prevY) * alpha;
          const ang = Math.atan2(y - p.fromY, x - p.fromX);
          const len = p.isSkill ? 22 : p.isCrit ? 16 : 12;

          // Sword-qi / martial energy bolt with dark ink outline for crisp visibility on white jade
          ctx.beginPath();
          ctx.moveTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len);
          ctx.lineTo(x + Math.cos(ang) * 5, y + Math.sin(ang) * 5);
          ctx.lineCap = 'round';
          ctx.lineWidth = p.isSkill ? 9.5 : p.isCrit ? 7.5 : 6;
          ctx.strokeStyle = PIXEL_OUTLINE;
          ctx.stroke();

          ctx.lineWidth = p.isSkill ? 5.6 : p.isCrit ? 4.2 : 3.4;
          ctx.strokeStyle = p.isSkill ? '#facc15' : p.color;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(x, y, p.isSkill ? 4.6 : p.isCrit ? 3.8 : 3, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }
      },
    });
  }
}
