import type { SlotRef } from '../core/CommandQueue';
import type { Simulation } from '../core/Simulation';
import { TICK_DT } from '../core/time';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../platform/Viewport';
import type { VfxSystem } from '../vfx/VfxSystem';
import type { CanvasStack } from './CanvasStack';
import { type IRenderable, RENDER_LAYER_COUNT, RenderLayer } from './RenderLayer';
import { hexWithAlpha, type SpriteCache } from './SpriteCache';

export interface InteractionOverlayState {
  readonly selectedSlot: SlotRef | null;
  readonly draggingFromSlot: SlotRef | null;
  readonly dragLogicalX: number;
  readonly dragLogicalY: number;
  readonly hoverTargetSlot: SlotRef | null;
}

/**
 * Bucketed 7-layer world renderer.
 * Reads Simulation state strictly as read-only and interpolates prev -> curr with alpha.
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
    ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    const tick = sim.tickCount;
    const simTimeSec = (tick + alpha) * TICK_DT;

    // 1. Collect slot selection / range circle / drop highlights into GroundFx & WorldUI
    this.collectBoardOverlays(sim, interaction, simTimeSec);

    // 2. Collect Monsters + Shadows + Hit Flash + Rounded HP bars
    this.collectMonsters(sim, tick, alpha);

    // 3. Collect Units + Grade Aura Rings + Idle Bounce & Attack Lunge + Lock badges
    this.collectUnits(sim, tick, alpha, simTimeSec, interaction);

    // 4. Collect Projectiles
    this.collectProjectiles(sim, alpha);

    // 5. Collect VFX tracks & particles
    this.vfx.collect(tick, alpha, this.buckets);

    // 6. Sort depth-ordered entity layers deterministically
    this.buckets[RenderLayer.Monster]!.sort((a, b) => a.sortY - b.sortY);
    this.buckets[RenderLayer.Unit]!.sort((a, b) => a.sortY - b.sortY);

    // 7. Execute 7 render passes; switch globalCompositeOperation ONLY once for AirFx
    for (let layer = 0; layer < RENDER_LAYER_COUNT; layer++) {
      const list = this.buckets[layer]!;
      if (list.length === 0) continue;

      if (layer === RenderLayer.AirFx) {
        ctx.globalCompositeOperation = 'lighter';
      }

      for (let j = 0; j < list.length; j++) {
        list[j]!.render(ctx, baseScale);
      }

      if (layer === RenderLayer.AirFx) {
        ctx.globalCompositeOperation = 'source-over';
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
      const rect = sim.board.getSlotRect(sel);
      const uid = sim.board.getUid(sel);
      const unit = uid !== null ? sim.getUnitByUid(uid) : undefined;
      const def = unit ? sim.data.unitsById.get(unit.unitId) : undefined;
      const grade = unit ? sim.data.gradesById.get(unit.grade) : undefined;

      this.buckets[RenderLayer.GroundFx]!.push({
        layer: RenderLayer.GroundFx,
        sortY: rect.y - 10,
        render: (ctx) => {
          // Attack range preview circle when a unit is selected on field
          if (sel.area === 'field' && def) {
            const cx = rect.x + rect.w * 0.5;
            const cy = rect.y + rect.h * 0.5;
            const accent = grade?.color ?? '#38bdf8';

            ctx.beginPath();
            ctx.arc(cx, cy, def.range, 0, Math.PI * 2);
            ctx.fillStyle = hexWithAlpha(accent, 0.14);
            ctx.fill();
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = hexWithAlpha(accent, 0.72);
            ctx.stroke();

            ctx.save();
            ctx.setLineDash([10, 8]);
            ctx.lineDashOffset = -simTimeSec * 24;
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(16, def.range - 5), 0, Math.PI * 2);
            ctx.lineWidth = 1.6;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
            ctx.stroke();
            ctx.restore();
          }

          // Crisp selected slot highlight frame
          ctx.beginPath();
          ctx.roundRect(rect.x - 3, rect.y - 3, rect.w + 6, rect.h + 6, 15);
          ctx.lineWidth = 4;
          ctx.strokeStyle = '#181122';
          ctx.stroke();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#fde047';
          ctx.stroke();
        },
      });
    }

    const hover = interaction.hoverTargetSlot;
    if (hover && interaction.draggingFromSlot) {
      const rect = sim.board.getSlotRect(hover);
      const occupied = sim.board.getUid(hover) !== null;
      this.buckets[RenderLayer.WorldUI]!.push({
        layer: RenderLayer.WorldUI,
        sortY: rect.y,
        render: (ctx) => {
          ctx.beginPath();
          ctx.roundRect(rect.x - 3, rect.y - 3, rect.w + 6, rect.h + 6, 15);
          ctx.fillStyle = occupied ? 'rgba(250, 204, 21, 0.25)' : 'rgba(52, 211, 153, 0.28)';
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = occupied ? '#facc15' : '#10b981';
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
        ctx.fillStyle = 'rgba(15, 23, 42, 0.36)';
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

      // Walking bob & tilt
      const isStunned = currentTick < m.stunUntilTick;
      const isSlowed = currentTick < m.slowUntilTick;
      const walkCycle = isStunned ? 0 : Math.sin(distInterp * 0.16 + m.entityId);
      const bobY = Math.abs(walkCycle) * -3.5;
      const facingLeft = m.currX - m.prevX < -0.05;

      const drawSize = m.isBoss ? 78 : 48;
      const baseSprite = this.sprites.monsterSprite(m.kind, false);
      const hitAgeSec = (currentTick + alpha - m.lastHitTick) * TICK_DT;
      const showHitFlash = hitAgeSec >= 0 && hitAgeSec < 0.1;

      if (isSlowed) {
        this.buckets[RenderLayer.GroundFx]!.push({
          layer: RenderLayer.GroundFx,
          sortY: y - 1,
          render: (ctx) => {
            ctx.beginPath();
            ctx.ellipse(x, y + m.radius * 0.7, m.radius * 1.05, m.radius * 0.48, 0, 0, Math.PI * 2);
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2.2;
            ctx.stroke();
          },
        });
      }

      this.buckets[RenderLayer.Monster]!.push({
        layer: RenderLayer.Monster,
        sortY: y,
        render: (ctx) => {
          ctx.save();
          ctx.translate(x, y + bobY);
          if (facingLeft) {
            ctx.scale(-1, 1);
          }
          ctx.drawImage(
            baseSprite,
            -drawSize * 0.5,
            -drawSize * 0.56,
            drawSize,
            drawSize,
          );

          if (showHitFlash) {
            const flashSprite = this.sprites.monsterSprite(m.kind, true);
            const prevA = ctx.globalAlpha;
            ctx.globalAlpha = (1 - hitAgeSec / 0.1) * 0.82;
            ctx.drawImage(
              flashSprite,
              -drawSize * 0.5,
              -drawSize * 0.56,
              drawSize,
              drawSize,
            );
            ctx.globalAlpha = prevA;
          }
          ctx.restore();
        },
      });

      // Rounded capsule HP bar (always shown on Bosses, shown when damaged on Mobs)
      if (m.isBoss || m.hp < m.maxHp || isStunned) {
        this.buckets[RenderLayer.WorldUI]!.push({
          layer: RenderLayer.WorldUI,
          sortY: y + 1,
          render: (ctx) => {
            const barW = m.isBoss ? 68 : 36;
            const barH = m.isBoss ? 9 : 6;
            const bx = x - barW * 0.5;
            const by = y - (m.isBoss ? 44 : 29);
            const ratio = Math.max(0, Math.min(1, m.hp / m.maxHp));

            // Rounded outer track
            ctx.beginPath();
            ctx.roundRect(bx - 1.5, by - 1.5, barW + 3, barH + 3, 99);
            ctx.fillStyle = '#181122';
            ctx.fill();

            if (ratio > 0) {
              ctx.beginPath();
              ctx.roundRect(bx, by, Math.max(barH, barW * ratio), barH, 99);
              ctx.fillStyle = m.isBoss
                ? '#f43f5e'
                : ratio > 0.5
                  ? '#22c55e'
                  : ratio > 0.25
                    ? '#f59e0b'
                    : '#ef4444';
              ctx.fill();

              // Top gloss highlight
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
                ctx.arc(x + Math.cos(sa) * 11, by - 6 + Math.sin(sa) * 3, 2.6, 0, Math.PI * 2);
                ctx.fillStyle = '#fde047';
                ctx.fill();
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
        popScale = 0.62 + Math.sin(st * Math.PI * 0.76) * 0.44;
      }

      // Idle breathing bounce (squash & stretch)
      const idlePhase = simTimeSec * 4.4 + u.uid * 1.37;
      const breath = Math.sin(idlePhase);
      let scaleX = 1 - breath * 0.032;
      let scaleY = 1 + breath * 0.042;

      // Attack lunge toward target on simulation clock
      let lungeX = 0;
      let lungeY = 0;
      const atkElapsedSec = (currentTick + alpha - u.lastAttackTick) * TICK_DT;
      if (u.slot.area === 'field' && atkElapsedSec >= 0 && atkElapsedSec < 0.18) {
        const lungeCurve =
          atkElapsedSec < 0.045
            ? atkElapsedSec / 0.045
            : Math.max(0, 1 - (atkElapsedSec - 0.045) / 0.135);
        const distLunge = lungeCurve * 13;
        lungeX = u.attackDirX * distLunge;
        lungeY = u.attackDirY * distLunge;
        scaleX *= 1 + lungeCurve * 0.08;
        scaleY *= 1 - lungeCurve * 0.06;
      }

      const drawX = baseX + lungeX;
      const drawY = baseY + lungeY;
      const baseSize = (u.slot.area === 'field' ? 72 : 64) * popScale;
      const sprite = this.sprites.unitToken(def, grade);
      const facingLeft = u.slot.area === 'field' && u.attackDirX < -0.2;

      // 1. Grade-specific rotating/pulsing aura ring under feet
      const footY = baseY + (u.slot.area === 'field' ? 24 : 21);
      this.buckets[RenderLayer.GroundFx]!.push({
        layer: RenderLayer.GroundFx,
        sortY: baseY - 2,
        render: (ctx) => {
          const pulse = 1 + Math.sin(simTimeSec * 3.8 + u.uid) * 0.07;
          const rx = (u.slot.area === 'field' ? 27 : 24) * pulse;
          const ry = rx * 0.46;

          if (grade.rank >= 4) {
            const glow = this.sprites.glow(grade.color, 36);
            const prevA = ctx.globalAlpha;
            ctx.globalAlpha = grade.rank >= 5 ? 0.52 : 0.36;
            ctx.drawImage(glow, baseX - 34, footY - 18, 68, 36);
            ctx.globalAlpha = prevA;
          }

          // Base aura fill
          ctx.beginPath();
          ctx.ellipse(baseX, footY, rx, ry, 0, 0, Math.PI * 2);
          ctx.fillStyle = hexWithAlpha(grade.color, grade.rank >= 3 ? 0.28 : 0.18);
          ctx.fill();
          ctx.lineWidth = grade.rank >= 4 ? 3 : 2.2;
          ctx.strokeStyle = grade.color;
          ctx.stroke();

          // Rotating segmented crest for Uncommon+
          if (grade.rank >= 2) {
            const segs = Math.min(6, grade.rank + 1);
            const rot = simTimeSec * (grade.rank >= 5 ? 2.4 : 1.5);
            ctx.lineWidth = grade.rank >= 5 ? 2.8 : 2;
            ctx.strokeStyle =
              grade.fx === 'rainbow'
                ? '#c084fc'
                : grade.rank >= 4
                  ? '#fffbeb'
                  : hexWithAlpha(grade.color, 0.95);
            for (let s = 0; s < segs; s++) {
              const a0 = rot + (s * Math.PI * 2) / segs;
              const a1 = a0 + Math.PI / (segs + 1);
              ctx.beginPath();
              ctx.ellipse(baseX, footY, rx + 3.5, ry + 2, 0, a0, a1);
              ctx.stroke();
            }
          }
        },
      });

      // 2. Crisp drop shadow
      this.buckets[RenderLayer.Shadow]!.push({
        layer: RenderLayer.Shadow,
        sortY: drawY,
        render: (ctx) => {
          ctx.fillStyle = 'rgba(24, 17, 34, 0.36)';
          ctx.beginPath();
          ctx.ellipse(
            drawX,
            drawY + baseSize * 0.33,
            baseSize * 0.32 * scaleX,
            baseSize * 0.13,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        },
      });

      // 3. Cel-shaded 2-head SD Character Sprite
      this.buckets[RenderLayer.Unit]!.push({
        layer: RenderLayer.Unit,
        sortY: drawY,
        render: (ctx) => {
          ctx.save();
          if (isDraggedOrigin) {
            ctx.globalAlpha *= 0.38;
          }
          const anchorFootY = drawY + baseSize * 0.34;
          ctx.translate(drawX, anchorFootY);
          ctx.scale(facingLeft ? -scaleX : scaleX, scaleY);
          ctx.drawImage(sprite, -baseSize * 0.5, -baseSize * 0.92, baseSize, baseSize);
          ctx.restore();
        },
      });

      // 4. Lock badge
      if (u.locked) {
        this.buckets[RenderLayer.WorldUI]!.push({
          layer: RenderLayer.WorldUI,
          sortY: drawY + 2,
          render: (ctx) => {
            const lx = drawX + baseSize * 0.31;
            const ly = drawY - baseSize * 0.34;
            ctx.beginPath();
            ctx.arc(lx, ly, 9.5, 0, Math.PI * 2);
            ctx.fillStyle = '#181122';
            ctx.fill();
            ctx.lineWidth = 2.2;
            ctx.strokeStyle = '#fde047';
            ctx.stroke();
            ctx.fillStyle = '#fde047';
            ctx.fillRect(lx - 4, ly - 1, 8, 6);
            ctx.beginPath();
            ctx.arc(lx, ly - 1.5, 2.8, Math.PI, 0);
            ctx.lineWidth = 1.8;
            ctx.stroke();
          },
        });
      }

      // 5. Drag Ghost
      if (isDraggedOrigin) {
        const ghostSize = 80;
        const gx = interaction.dragLogicalX;
        const gy = interaction.dragLogicalY - 20;
        this.buckets[RenderLayer.WorldUI]!.push({
          layer: RenderLayer.WorldUI,
          sortY: 9500,
          render: (ctx) => {
            const prevAlpha = ctx.globalAlpha;
            ctx.globalAlpha = 0.94;
            ctx.drawImage(
              sprite,
              gx - ghostSize * 0.5,
              gy - ghostSize * 0.5,
              ghostSize,
              ghostSize,
            );
            ctx.globalAlpha = prevAlpha;
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
          const orbR = p.isSkill ? 7.5 : p.isCrit ? 6 : 4.8;

          // Trail streak
          ctx.beginPath();
          ctx.moveTo(p.prevX, p.prevY);
          ctx.lineTo(x, y);
          ctx.lineWidth = p.isSkill ? 6 : 3.8;
          ctx.lineCap = 'round';
          ctx.strokeStyle = p.isSkill ? '#facc15' : p.color;
          ctx.stroke();

          // Dark cartoon outline + bright core orb
          ctx.beginPath();
          ctx.arc(x, y, orbR + 2, 0, Math.PI * 2);
          ctx.fillStyle = '#181122';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(x, y, orbR, 0, Math.PI * 2);
          ctx.fillStyle = p.isSkill ? '#fde047' : p.color;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(x - orbR * 0.25, y - orbR * 0.25, orbR * 0.48, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }
      },
    });
  }
}
