import type { SlotRef } from '../core/CommandQueue';
import type { Simulation } from '../core/Simulation';
import { TICK_DT } from '../core/time';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../platform/Viewport';
import type { VfxSystem } from '../vfx/VfxSystem';
import type { CanvasStack } from './CanvasStack';
import { type IRenderable, RENDER_LAYER_COUNT, RenderLayer } from './RenderLayer';
import type { SpriteCache } from './SpriteCache';

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

    // 1. Collect slot selection / range circle / drop highlights into GroundFx & WorldUI
    this.collectBoardOverlays(sim, interaction);

    // 2. Collect Monsters + Shadows + HP bars
    this.collectMonsters(sim, alpha);

    // 3. Collect Units + Shadows + Lock badges
    this.collectUnits(sim, tick, alpha, interaction);

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

  private collectBoardOverlays(sim: Simulation, interaction: InteractionOverlayState): void {
    const sel = interaction.selectedSlot;
    if (sel) {
      const rect = sim.board.getSlotRect(sel);
      const uid = sim.board.getUid(sel);
      const unit = uid !== null ? sim.getUnitByUid(uid) : undefined;
      const def = unit ? sim.data.unitsById.get(unit.unitId) : undefined;

      this.buckets[RenderLayer.GroundFx]!.push({
        layer: RenderLayer.GroundFx,
        sortY: rect.y,
        render: (ctx) => {
          // Attack range preview circle when a field unit is selected
          if (sel.area === 'field' && def) {
            const cx = rect.x + rect.w * 0.5;
            const cy = rect.y + rect.h * 0.5;
            ctx.beginPath();
            ctx.arc(cx, cy, def.range, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(74, 168, 255, 0.06)';
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = 'rgba(74, 168, 255, 0.35)';
            ctx.stroke();
          }

          // Selected slot border
          ctx.beginPath();
          ctx.roundRect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4, 13);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#f0b94b';
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
          ctx.roundRect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4, 13);
          ctx.fillStyle = occupied ? 'rgba(240, 185, 75, 0.16)' : 'rgba(56, 201, 176, 0.18)';
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = occupied ? '#f0b94b' : '#38c9b0';
          ctx.stroke();
        },
      });
    }
  }

  private collectMonsters(sim: Simulation, alpha: number): void {
    const monsters = sim.getMonsters();
    if (monsters.length === 0) return;

    this.buckets[RenderLayer.Shadow]!.push({
      layer: RenderLayer.Shadow,
      sortY: 0,
      render: (ctx) => {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
        for (let i = 0; i < monsters.length; i++) {
          const m = monsters[i]!;
          const x = m.prevX + (m.currX - m.prevX) * alpha;
          const y = m.prevY + (m.currY - m.prevY) * alpha;
          ctx.beginPath();
          ctx.ellipse(x, y + m.radius * 0.82, m.radius * 0.9, m.radius * 0.42, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    });

    for (let i = 0; i < monsters.length; i++) {
      const m = monsters[i]!;
      const x = m.prevX + (m.currX - m.prevX) * alpha;
      const y = m.prevY + (m.currY - m.prevY) * alpha;

      this.buckets[RenderLayer.Monster]!.push({
        layer: RenderLayer.Monster,
        sortY: y,
        render: (ctx) => {
          ctx.beginPath();
          ctx.arc(x, y, m.radius, 0, Math.PI * 2);
          ctx.fillStyle = '#d94854';
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#360d13';
          ctx.stroke();

          // Inner core highlight
          ctx.beginPath();
          ctx.arc(x - m.radius * 0.25, y - m.radius * 0.25, m.radius * 0.4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 196, 201, 0.45)';
          ctx.fill();
        },
      });

      if (m.hp < m.maxHp) {
        this.buckets[RenderLayer.WorldUI]!.push({
          layer: RenderLayer.WorldUI,
          sortY: y,
          render: (ctx) => {
            const barW = 30;
            const barH = 5;
            const bx = x - barW * 0.5;
            const by = y - m.radius - 10;
            const ratio = Math.max(0, Math.min(1, m.hp / m.maxHp));

            ctx.fillStyle = 'rgba(7, 11, 19, 0.85)';
            ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
            ctx.fillStyle = ratio > 0.45 ? '#4ade80' : '#f87171';
            ctx.fillRect(bx, by, barW * ratio, barH);
          },
        });
      }
    }
  }

  private collectUnits(
    sim: Simulation,
    currentTick: number,
    alpha: number,
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

      // Smooth 4-tick tactical glide when moved/swapped on simulation clock
      const moveElapsedSec = (currentTick + alpha - u.moveStartTick) * TICK_DT;
      let drawX = u.prevX + (u.currX - u.prevX) * alpha;
      let drawY = u.prevY + (u.currY - u.prevY) * alpha;
      if (moveElapsedSec >= 0 && moveElapsedSec < 0.14) {
        const mt = 1 - Math.pow(1 - moveElapsedSec / 0.14, 3);
        drawX = u.moveFromX + (u.currX - u.moveFromX) * mt;
        drawY = u.moveFromY + (u.currY - u.moveFromY) * mt;
      }

      // Spawn pop-in scale on simulation clock
      const spawnElapsedSec = (currentTick + alpha - u.spawnTick) * TICK_DT;
      let popScale = 1;
      if (spawnElapsedSec >= 0 && spawnElapsedSec < 0.18) {
        const st = spawnElapsedSec / 0.18;
        popScale = 0.65 + Math.sin(st * Math.PI * 0.75) * 0.42;
      }

      const tokenSize = (u.slot.area === 'field' ? 62 : 58) * popScale;
      const sprite = this.sprites.unitToken(def, grade);

      this.buckets[RenderLayer.Shadow]!.push({
        layer: RenderLayer.Shadow,
        sortY: drawY,
        render: (ctx) => {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.44)';
          ctx.beginPath();
          ctx.ellipse(
            drawX,
            drawY + tokenSize * 0.42,
            tokenSize * 0.38,
            tokenSize * 0.16,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        },
      });

      this.buckets[RenderLayer.Unit]!.push({
        layer: RenderLayer.Unit,
        sortY: drawY,
        render: (ctx) => {
          const prevAlpha = ctx.globalAlpha;
          if (isDraggedOrigin) {
            ctx.globalAlpha = 0.36;
          }
          ctx.drawImage(
            sprite,
            drawX - tokenSize * 0.5,
            drawY - tokenSize * 0.5,
            tokenSize,
            tokenSize,
          );
          ctx.globalAlpha = prevAlpha;
        },
      });

      if (u.locked) {
        this.buckets[RenderLayer.WorldUI]!.push({
          layer: RenderLayer.WorldUI,
          sortY: drawY + 1,
          render: (ctx) => {
            const lx = drawX + tokenSize * 0.32;
            const ly = drawY - tokenSize * 0.32;
            ctx.beginPath();
            ctx.arc(lx, ly, 9, 0, Math.PI * 2);
            ctx.fillStyle = '#0c1626';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#38c9b0';
            ctx.stroke();
            ctx.fillStyle = '#38c9b0';
            ctx.fillRect(lx - 4, ly - 1, 8, 6);
          },
        });
      }

      if (isDraggedOrigin) {
        const ghostSize = 70;
        const gx = interaction.dragLogicalX;
        const gy = interaction.dragLogicalY - 18;
        this.buckets[RenderLayer.WorldUI]!.push({
          layer: RenderLayer.WorldUI,
          sortY: 9500,
          render: (ctx) => {
            const prevAlpha = ctx.globalAlpha;
            ctx.globalAlpha = 0.92;
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

          ctx.beginPath();
          ctx.moveTo(p.prevX, p.prevY);
          ctx.lineTo(x, y);
          ctx.lineWidth = 3;
          ctx.strokeStyle = p.color;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(x, y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }
      },
    });
  }
}
