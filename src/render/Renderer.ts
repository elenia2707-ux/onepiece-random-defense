import type { SlotRef } from '../core/CommandQueue';
import type { Simulation } from '../core/Simulation';
import { TICK_DT } from '../core/time';
import type { CourtSkinDef, FactionId, HeroSkinDef, UnitId } from '../data/types';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../platform/Viewport';
import type { VfxSystem } from '../vfx/VfxSystem';
import { expandedSlotRect } from './BackgroundPainter';
import type { CanvasStack } from './CanvasStack';
import { PIXEL_OUTLINE } from './ChibiPainter';
import { type IRenderable, RENDER_LAYER_COUNT, RenderLayer } from './RenderLayer';
import { hexWithAlpha, type SpriteCache } from './SpriteCache';
import { getUnitCombatProfile, type UnitCombatProfile } from './weaponProfiles';

/**
 * Crisp nearest-neighbor sprite sizes (~110% of tile width) and foot offsets from slot center.
 */
const FIELD_SPRITE = 116;
const BENCH_SPRITE = 120;
const FIELD_FOOT = 45;
const BENCH_FOOT = 37;
const MOB_SPRITE = 82;
const BOSS_SPRITE = 128;

export interface InteractionOverlayState {
  readonly selectedSlot: SlotRef | null;
  readonly draggingFromSlot: SlotRef | null;
  readonly dragLogicalX: number;
  readonly dragLogicalY: number;
  readonly hoverTargetSlot: SlotRef | null;
}

/** Exact lantern coordinates on `public/bg/murim_arena_bg.png` (720x1280). */
const TEMPLE_LANTERNS: readonly { readonly x: number; readonly y: number; readonly r: number }[] = [
  { x: 123, y: 76, r: 22 },
  { x: 174, y: 80, r: 22 },
  { x: 224, y: 77, r: 22 },
  { x: 302, y: 80, r: 24 },
  { x: 417, y: 80, r: 24 },
  { x: 496, y: 77, r: 22 },
  { x: 546, y: 80, r: 22 },
  { x: 597, y: 76, r: 22 },
  { x: 272, y: 706, r: 28 },
  { x: 445, y: 707, r: 28 },
];

const INCENSE_BRAZIERS: readonly { readonly x: number; readonly y: number }[] = [
  { x: 114, y: 610 },
  { x: 606, y: 610 },
  { x: 90, y: 944 },
  { x: 630, y: 944 },
];

/**
 * Bucketed 7-layer world renderer.
 * Enforces `ctx.imageSmoothingEnabled = false` strictly for razor-sharp pixel art.
 */
export class Renderer {
  private readonly stack: CanvasStack;
  private readonly sprites: SpriteCache;
  private readonly vfx: VfxSystem;
  private readonly buckets: IRenderable[][];
  private readonly hpTrails = new Map<number, number>();
  private readonly activeMonsterIds = new Set<number>();
  private lastSimTimeSec = 0;
  private equippedHeroSkins: ReadonlyMap<UnitId, HeroSkinDef> = new Map();
  private courtSkin: CourtSkinDef | null = null;

  public constructor(stack: CanvasStack, sprites: SpriteCache, vfx: VfxSystem) {
    this.stack = stack;
    this.sprites = sprites;
    this.vfx = vfx;
    this.buckets = Array.from({ length: RENDER_LAYER_COUNT }, () => []);
  }

  public setCosmetics(
    heroSkinsByUnit: ReadonlyMap<UnitId, HeroSkinDef>,
    courtSkin: CourtSkinDef | null,
  ): void {
    this.equippedHeroSkins = heroSkinsByUnit;
    this.courtSkin = courtSkin;
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
    const simDeltaSec = Math.max(0, Math.min(0.25, simTimeSec - this.lastSimTimeSec));
    this.lastSimTimeSec = simTimeSec;

    // 1. Collect slot selection / range circle / drop highlights / boss tile hazards
    this.collectBoardOverlays(sim, interaction, tick, alpha, simTimeSec);

    // 2. Collect living Wuxia sanctuary atmosphere (lantern candlelight, incense wisps, drifting petals)
    this.collectAmbientMurimWorld(simTimeSec);

    // 3. Collect Monsters + Boss Auras + Hit Recoil/Flash + Delayed HP Drain Bars
    this.collectMonsters(sim, tick, alpha, simTimeSec, simDeltaSec);

    // 4. Collect Units + Faction Formations + Multi-Phase Weapon Swings + Lock badges
    this.collectUnits(sim, tick, alpha, simTimeSec, interaction);

    // 5. Collect Sect-Distinct Martial Projectiles
    this.collectProjectiles(sim, alpha, simTimeSec);

    // 6. Collect VFX tracks, particles, skill callouts & damage numbers
    this.vfx.collect(tick, alpha, this.buckets);

    // 7. Sort depth-ordered entity layers deterministically
    this.buckets[RenderLayer.Monster]!.sort((a, b) => a.sortY - b.sortY);
    this.buckets[RenderLayer.Unit]!.sort((a, b) => a.sortY - b.sortY);

    // 8. Execute 7 render passes
    ctx.globalCompositeOperation = 'source-over';
    for (let layer = 0; layer < RENDER_LAYER_COUNT; layer++) {
      const list = this.buckets[layer]!;
      if (list.length === 0) continue;
      for (let j = 0; j < list.length; j++) {
        list[j]!.render(ctx, baseScale);
      }
    }

    // 9. Screen FX (#shake-layer locked steady + #overlay-canvas banners)
    this.vfx.renderScreenFx(this.stack, tick, alpha);
  }

  /**
   * Living Wuxia courtyard atmosphere driven deterministically by `simTimeSec` (zero GC, zero RNG):
   * - Flickering warm lantern halos on the grand hall & dragon bridge
   * - Curling pale incense wisps rising from bronze braziers
   * - Drifting Mount Hua plum petals, bamboo leaves & golden inner-qi motes
   */
  private collectAmbientMurimWorld(simTimeSec: number): void {
    const lanternCol = this.courtSkin?.lanternColor ?? '#f97316';
    const petalPrimary = this.courtSkin?.petalPrimary ?? '#fb7185';
    const petalSecondary = this.courtSkin?.petalSecondary ?? '#fda4af';

    this.buckets[RenderLayer.AirFx]!.push({
      layer: RenderLayer.AirFx,
      sortY: 9400,
      render: (ctx) => {
        const prevAlpha = ctx.globalAlpha;

        // 1. Warm breathing candlelight on temple & bridge lanterns
        const lanternGlow = this.sprites.glow(lanternCol, 28);
        for (let i = 0; i < TEMPLE_LANTERNS.length; i++) {
          const lt = TEMPLE_LANTERNS[i]!;
          const flicker = 0.24 + Math.sin(simTimeSec * 4.2 + i * 1.37) * 0.08;
          ctx.globalAlpha = prevAlpha * flicker;
          ctx.drawImage(lanternGlow, lt.x - lt.r, lt.y - lt.r, lt.r * 2, lt.r * 2);
        }

        // 2. Gentle curling incense smoke wisps from bronze braziers
        for (let b = 0; b < INCENSE_BRAZIERS.length; b++) {
          const br = INCENSE_BRAZIERS[b]!;
          for (let w = 0; w < 2; w++) {
            const cycle = (simTimeSec * 0.48 + b * 0.31 + w * 0.5) % 1;
            const wx = br.x + Math.sin(cycle * Math.PI * 2 + b) * 5;
            const wy = br.y - cycle * 32;
            const wr = 2.4 + cycle * 4.2;
            ctx.globalAlpha = prevAlpha * (1 - cycle) * 0.22;
            ctx.beginPath();
            ctx.arc(wx, wy, wr, 0, Math.PI * 2);
            ctx.fillStyle = '#f1f5f9';
            ctx.fill();
          }
        }

        // 3. Drifting Mount Hua plum petals, bamboo leaves & golden qi fireflies
        for (let p = 0; p < 16; p++) {
          const speed = 22 + (p % 4) * 7;
          const rawX = (p * 97 + simTimeSec * speed) % (LOGICAL_WIDTH + 60) - 30;
          const rawY =
            110 + ((p * 139 + simTimeSec * (16 + (p % 3) * 6)) % 830);
          const swayX = rawX + Math.sin(simTimeSec * 2.1 + p * 1.7) * 14;
          const rot = simTimeSec * (1.8 + (p % 3) * 0.6) + p;

          ctx.save();
          ctx.translate(swayX, rawY);
          ctx.rotate(rot);
          ctx.globalAlpha = prevAlpha * 0.72;

          if (p % 3 === 0) {
            // Theme petal / ember
            ctx.beginPath();
            ctx.ellipse(0, 0, 4.2, 2.5, 0, 0, Math.PI * 2);
            ctx.fillStyle = p % 2 === 0 ? petalPrimary : petalSecondary;
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = PIXEL_OUTLINE;
            ctx.stroke();
          } else if (p % 3 === 1) {
            // Emerald bamboo leaf (or secondary motif when court skin is active)
            ctx.beginPath();
            ctx.ellipse(0, 0, 5.2, 1.8, 0, 0, Math.PI * 2);
            ctx.fillStyle = this.courtSkin ? petalSecondary : '#4ade80';
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = PIXEL_OUTLINE;
            ctx.stroke();
          } else {
            // Warm lantern mote
            ctx.beginPath();
            ctx.arc(0, 0, 2.1, 0, Math.PI * 2);
            ctx.fillStyle = this.courtSkin ? lanternCol : '#fde047';
            ctx.fill();
          }
          ctx.restore();
        }

        ctx.globalAlpha = prevAlpha;
      },
    });
  }

  private collectBoardOverlays(
    sim: Simulation,
    interaction: InteractionOverlayState,
    currentTick: number,
    alpha: number,
    simTimeSec: number,
  ): void {
    // 0a. Seeded Spirit Vein Sanctuary Tiles (영맥 명당 2칸: ☀ 화양혈 / 🍃 청풍혈)
    const spiritTiles = sim.getSpiritTiles();
    for (let i = 0; i < spiritTiles.length; i++) {
      const st = spiritTiles[i]!;
      const rect = expandedSlotRect(sim.board, { area: 'field', index: st.fieldIndex });
      const cx = rect.x + rect.w * 0.5;
      const cy = rect.y + rect.h * 0.5;
      const isSolar = st.kind === 'solar';
      const primary = isSolar ? '#f59e0b' : '#06b6d4';
      const deepStroke = isSolar ? '#b45309' : '#0f766e';
      const highlight = isSolar ? '#fef08a' : '#a5f3fc';
      const glowSpr = this.sprites.glow(primary, 32);

      this.buckets[RenderLayer.GroundFx]!.push({
        layer: RenderLayer.GroundFx,
        sortY: rect.y - 2,
        render: (ctx) => {
          const pulse = 0.72 + Math.sin(simTimeSec * 3.2 + i * 2.1) * 0.24;
          const prevAlpha = ctx.globalAlpha;

          // Warm aura glow underneath tile
          ctx.globalAlpha = prevAlpha * (0.36 * pulse);
          ctx.drawImage(glowSpr, cx - rect.w * 0.58, cy - rect.h * 0.54, rect.w * 1.16, rect.h * 1.08);

          // Rich tinted sanctuary floor pad with crisp dark-ink outer outline for high contrast on jade tiles
          ctx.globalAlpha = prevAlpha * 0.96;
          ctx.beginPath();
          ctx.roundRect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4, 10);
          ctx.fillStyle = isSolar
            ? `rgba(245, 158, 11, ${(0.22 + 0.08 * pulse).toFixed(3)})`
            : `rgba(6, 182, 212, ${(0.20 + 0.08 * pulse).toFixed(3)})`;
          ctx.fill();
          ctx.lineWidth = 4.2;
          ctx.strokeStyle = PIXEL_OUTLINE;
          ctx.stroke();
          ctx.lineWidth = 2.4;
          ctx.strokeStyle = isSolar ? '#f59e0b' : '#06b6d4';
          ctx.stroke();

          // Four bold ink-framed ornamental corner brackets
          const pad = 6;
          const leg = 13;
          ctx.beginPath();
          // Top-left
          ctx.moveTo(rect.x + pad, rect.y + pad + leg);
          ctx.lineTo(rect.x + pad, rect.y + pad);
          ctx.lineTo(rect.x + pad + leg, rect.y + pad);
          // Top-right
          ctx.moveTo(rect.x + rect.w - pad - leg, rect.y + pad);
          ctx.lineTo(rect.x + rect.w - pad, rect.y + pad);
          ctx.lineTo(rect.x + rect.w - pad, rect.y + pad + leg);
          // Bottom-left
          ctx.moveTo(rect.x + pad, rect.y + rect.h - pad - leg);
          ctx.lineTo(rect.x + pad, rect.y + rect.h - pad);
          ctx.lineTo(rect.x + pad + leg, rect.y + rect.h - pad);
          // Bottom-right
          ctx.moveTo(rect.x + rect.w - pad - leg, rect.y + rect.h - pad);
          ctx.lineTo(rect.x + rect.w - pad, rect.y + rect.h - pad);
          ctx.lineTo(rect.x + rect.w - pad, rect.y + rect.h - pad - leg);
          ctx.lineWidth = 4;
          ctx.strokeStyle = PIXEL_OUTLINE;
          ctx.stroke();
          ctx.lineWidth = 2.2;
          ctx.strokeStyle = highlight;
          ctx.stroke();

          // Rotating inner rune motif (Solar lotus diamond vs Wind spiral ring)
          ctx.save();
          ctx.translate(cx, cy + 10);
          ctx.rotate(simTimeSec * (isSolar ? 0.55 : -0.9));
          const runeR = Math.min(rect.w, rect.h) * 0.27;
          ctx.globalAlpha = prevAlpha * (0.68 + 0.2 * pulse);
          if (isSolar) {
            ctx.strokeStyle = deepStroke;
            ctx.lineWidth = 2.6;
            ctx.strokeRect(-runeR * 0.72, -runeR * 0.72, runeR * 1.44, runeR * 1.44);
            ctx.strokeStyle = '#fde047';
            ctx.lineWidth = 1.4;
            ctx.strokeRect(-runeR * 0.72, -runeR * 0.72, runeR * 1.44, runeR * 1.44);
            ctx.rotate(Math.PI * 0.25);
            ctx.strokeStyle = '#ea580c';
            ctx.lineWidth = 2.2;
            ctx.strokeRect(-runeR * 0.72, -runeR * 0.72, runeR * 1.44, runeR * 1.44);
          } else {
            ctx.strokeStyle = deepStroke;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, runeR * 0.92, 0, Math.PI * 1.45);
            ctx.stroke();
            ctx.strokeStyle = '#67e8f9';
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.arc(0, 0, runeR * 0.56, Math.PI * 0.7, Math.PI * 2.15);
            ctx.stroke();
          }
          ctx.restore();

          // Crisp corner Spirit Vein sigil medallion (visible even when a hero stands on the tile)
          const badgeX = rect.x + rect.w - 13;
          const badgeY = rect.y + 13;
          ctx.globalAlpha = prevAlpha * 0.98;
          ctx.beginPath();
          ctx.arc(badgeX, badgeY, 9.5, 0, Math.PI * 2);
          ctx.fillStyle = deepStroke;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = PIXEL_OUTLINE;
          ctx.stroke();
          ctx.beginPath();
          if (isSolar) {
            // 4-point solar sun star
            ctx.moveTo(badgeX, badgeY - 5.5);
            ctx.lineTo(badgeX + 2.2, badgeY - 2.2);
            ctx.lineTo(badgeX + 5.5, badgeY);
            ctx.lineTo(badgeX + 2.2, badgeY + 2.2);
            ctx.lineTo(badgeX, badgeY + 5.5);
            ctx.lineTo(badgeX - 2.2, badgeY + 2.2);
            ctx.lineTo(badgeX - 5.5, badgeY);
            ctx.lineTo(badgeX - 2.2, badgeY - 2.2);
            ctx.closePath();
            ctx.fillStyle = '#fde047';
            ctx.fill();
          } else {
            // Wind crescent-leaf emblem
            ctx.arc(badgeX, badgeY, 4.6, -Math.PI * 0.85, Math.PI * 0.65);
            ctx.lineWidth = 2.2;
            ctx.strokeStyle = '#a5f3fc';
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(badgeX + 1.5, badgeY - 1.5, 1.8, 0, Math.PI * 2);
            ctx.fillStyle = '#34d399';
            ctx.fill();
          }

          ctx.globalAlpha = prevAlpha;
        },
      });
    }

    // 0b. Blood Patriarch Tile Hazards (2.0s telegraph magic circle -> 4.5s blood-jade seal)
    const hazards = sim.getTileHazards();
    for (let i = 0; i < hazards.length; i++) {
      const h = hazards[i]!;
      if (currentTick >= h.expireTick) continue;
      const rect = expandedSlotRect(sim.board, { area: 'field', index: h.fieldIndex });
      const cx = rect.x + rect.w * 0.5;
      const cy = rect.y + rect.h * 0.5;
      const occupied = sim.board.field.getUidAt(h.fieldIndex) !== null;

      const isThunder = h.hazardKind === 'thunder';

      if (currentTick < h.activateTick) {
        const span = Math.max(1, h.activateTick - h.startTick);
        const prog = Math.max(0, Math.min(1, (currentTick + alpha - h.startTick) / span));

        this.buckets[RenderLayer.GroundFx]!.push({
          layer: RenderLayer.GroundFx,
          sortY: rect.y + 4,
          render: (ctx) => {
            const flash = 0.62 + Math.sin(simTimeSec * 14) * 0.35;
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2, 10);
            ctx.fillStyle = isThunder
              ? `rgba(14, 165, 233, ${(0.22 + 0.16 * flash).toFixed(3)})`
              : `rgba(225, 29, 72, ${(0.22 + 0.16 * flash).toFixed(3)})`;
            ctx.fill();
            ctx.lineWidth = 4.2;
            ctx.strokeStyle = PIXEL_OUTLINE;
            ctx.stroke();
            ctx.lineWidth = 2.4;
            ctx.strokeStyle = flash > 0.7 ? '#facc15' : isThunder ? '#38bdf8' : '#fb7185';
            ctx.stroke();

            // Rotating 8-point warning sigil + filling countdown ring
            const r = Math.min(rect.w, rect.h) * 0.38;
            ctx.translate(cx, cy + 8);
            ctx.save();
            ctx.rotate(simTimeSec * (isThunder ? -3.4 : 2.8));
            ctx.strokeStyle = isThunder ? '#7dd3fc' : '#fda4af';
            ctx.lineWidth = 2;
            ctx.strokeRect(-r * 0.68, -r * 0.68, r * 1.36, r * 1.36);
            ctx.rotate(Math.PI * 0.25);
            ctx.strokeStyle = '#facc15';
            ctx.strokeRect(-r * 0.68, -r * 0.68, r * 1.36, r * 1.36);
            ctx.restore();

            ctx.beginPath();
            ctx.arc(0, 0, r, -Math.PI * 0.5, -Math.PI * 0.5 + prog * Math.PI * 2);
            ctx.lineWidth = 4.5;
            ctx.strokeStyle = PIXEL_OUTLINE;
            ctx.stroke();
            ctx.lineWidth = 2.6;
            ctx.strokeStyle = isThunder ? '#67e8f9' : '#fde047';
            ctx.stroke();
            ctx.restore();
          },
        });

        this.buckets[RenderLayer.WorldUI]!.push({
          layer: RenderLayer.WorldUI,
          sortY: cy + 52,
          render: (ctx) => {
            const badge = this.sprites.statusBadge(isThunder ? 'thunder_warn' : 'warn');
            const bob = Math.sin(simTimeSec * 11) * 3;
            const bw = 92;
            const bh = 25;
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(badge, Math.round(cx - bw * 0.5), Math.round(rect.y - 12 + bob), bw, bh);
            ctx.restore();
          },
        });
      } else {
        const span = Math.max(1, h.expireTick - h.activateTick);
        const rem = Math.max(0, Math.min(1, (h.expireTick - (currentTick + alpha)) / span));

        this.buckets[RenderLayer.GroundFx]!.push({
          layer: RenderLayer.GroundFx,
          sortY: rect.y + 5,
          render: (ctx) => {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2, 10);
            ctx.fillStyle = isThunder ? 'rgba(12, 74, 110, 0.38)' : 'rgba(88, 28, 135, 0.36)';
            ctx.fill();
            ctx.lineWidth = 4.5;
            ctx.strokeStyle = PIXEL_OUTLINE;
            ctx.stroke();
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = isThunder ? '#38bdf8' : '#e11d48';
            ctx.stroke();

            // Crossed chains / lightning arcs on floor
            ctx.beginPath();
            ctx.moveTo(rect.x + 10, rect.y + 10);
            ctx.lineTo(rect.x + rect.w - 10, rect.y + rect.h - 10);
            ctx.moveTo(rect.x + rect.w - 10, rect.y + 10);
            ctx.lineTo(rect.x + 10, rect.y + rect.h - 10);
            ctx.lineWidth = 4;
            ctx.strokeStyle = PIXEL_OUTLINE;
            ctx.stroke();
            ctx.lineWidth = 2;
            ctx.strokeStyle = isThunder ? '#fde047' : '#c084fc';
            ctx.stroke();

            // Draining duration arc
            const r = Math.min(rect.w, rect.h) * 0.36;
            ctx.beginPath();
            ctx.arc(cx, cy + 8, r, -Math.PI * 0.5, -Math.PI * 0.5 + rem * Math.PI * 2);
            ctx.lineWidth = 3;
            ctx.strokeStyle = isThunder ? '#67e8f9' : '#fb7185';
            ctx.stroke();
            ctx.restore();
          },
        });

        if (occupied) {
          this.buckets[RenderLayer.AirFx]!.push({
            layer: RenderLayer.AirFx,
            sortY: cy + 44,
            render: (ctx) => {
              ctx.save();
              const prevA = ctx.globalAlpha;
              ctx.globalAlpha = prevA * 0.52;
              ctx.beginPath();
              ctx.moveTo(cx, cy - 42);
              ctx.lineTo(cx + 28, cy - 16);
              ctx.lineTo(cx + 22, cy + 26);
              ctx.lineTo(cx, cy + 36);
              ctx.lineTo(cx - 22, cy + 26);
              ctx.lineTo(cx - 28, cy - 16);
              ctx.closePath();
              ctx.fillStyle = isThunder ? '#0284c7' : '#be123c';
              ctx.fill();
              ctx.globalAlpha = prevA * 0.9;
              ctx.lineWidth = 3.6;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.lineWidth = 1.8;
              ctx.strokeStyle = isThunder ? '#fef08a' : '#f472b6';
              ctx.stroke();
              ctx.restore();
            },
          });
        }

        this.buckets[RenderLayer.WorldUI]!.push({
          layer: RenderLayer.WorldUI,
          sortY: cy + 54,
          render: (ctx) => {
            const badge = this.sprites.statusBadge(isThunder ? 'thunder_seal' : 'sealed');
            const bw = 82;
            const bh = 24;
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(
              badge,
              Math.round(cx - bw * 0.5),
              Math.round(occupied ? rect.y - 16 : cy - 8),
              bw,
              bh,
            );
            ctx.restore();
          },
        });
      }
    }

    // 1. Live 6x3 orthogonal supportAura qi links & buffed-tile corner emblems
    const tileBuffs = sim.computeFieldTileBuffs();
    const fieldCap = sim.board.field.capacity;
    let hasAnyAuraLink = false;
    for (let idx = 0; idx < fieldCap; idx++) {
      if (tileBuffs[idx]!.atkPct > 0 || tileBuffs[idx]!.speedPct > 0) {
        hasAnyAuraLink = true;
        break;
      }
    }
    if (hasAnyAuraLink) {
      this.buckets[RenderLayer.GroundFx]!.push({
        layer: RenderLayer.GroundFx,
        sortY: 180,
        render: (ctx) => {
          const prevA = ctx.globalAlpha;
          const pulse = 0.65 + Math.sin(simTimeSec * 4.5) * 0.25;

          // Draw qi conduit lines from totem heroes to occupied orthogonal neighbors
          for (let fIdx = 0; fIdx < fieldCap; fIdx++) {
            const uid = sim.board.field.getUidAt(fIdx);
            if (uid === null) continue;
            const uEnt = sim.getUnitByUid(uid);
            const uDef = uEnt ? sim.data.unitsById.get(uEnt.unitId) : undefined;
            if (!uDef?.supportAura) continue;

            const fromPos = sim.board.getSlotCenter({ area: 'field', index: fIdx });
            const neighbors = sim.getOrthogonalFieldNeighbors(fIdx);
            for (let k = 0; k < neighbors.length; k++) {
              const nIdx = neighbors[k]!;
              if (sim.board.field.getUidAt(nIdx) === null) continue;
              const toPos = sim.board.getSlotCenter({ area: 'field', index: nIdx });

              ctx.save();
              ctx.globalAlpha = prevA * 0.55 * pulse;
              ctx.setLineDash([6, 6]);
              ctx.lineDashOffset = -simTimeSec * 22;
              ctx.beginPath();
              ctx.moveTo(fromPos.x, fromPos.y + 18);
              ctx.lineTo(toPos.x, toPos.y + 18);
              ctx.lineWidth = 4.2;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.lineWidth = 2.2;
              ctx.strokeStyle = '#34d399';
              ctx.stroke();
              ctx.restore();
            }
          }

          // Draw compact jade-gold corner pip on occupied buffed tiles
          for (let fIdx = 0; fIdx < fieldCap; fIdx++) {
            const buff = tileBuffs[fIdx]!;
            if (buff.atkPct <= 0 && buff.speedPct <= 0) continue;
            if (sim.board.field.getUidAt(fIdx) === null) continue;
            const r = expandedSlotRect(sim.board, { area: 'field', index: fIdx });
            const px = r.x + 10;
            const py = r.y + 10;
            ctx.globalAlpha = prevA * 0.92;
            ctx.beginPath();
            ctx.moveTo(px, py - 5);
            ctx.lineTo(px + 5, py);
            ctx.lineTo(px, py + 5);
            ctx.lineTo(px - 5, py);
            ctx.closePath();
            ctx.fillStyle = buff.atkPct >= 25 ? '#facc15' : '#34d399';
            ctx.fill();
            ctx.lineWidth = 1.8;
            ctx.strokeStyle = PIXEL_OUTLINE;
            ctx.stroke();
          }
          ctx.globalAlpha = prevA;
        },
      });
    }

    // 2. Highlight 4 orthogonal neighbor tiles when selecting or dragging a supportAura totem hero
    let totemPreviewFieldIdx: number | null = null;
    if (interaction.draggingFromSlot && interaction.hoverTargetSlot?.area === 'field') {
      const dUid = sim.board.getUid(interaction.draggingFromSlot);
      const dUnit = dUid !== null ? sim.getUnitByUid(dUid) : undefined;
      const dDef = dUnit ? sim.data.unitsById.get(dUnit.unitId) : undefined;
      if (dDef?.supportAura) {
        totemPreviewFieldIdx = interaction.hoverTargetSlot.index;
      }
    } else if (interaction.selectedSlot?.area === 'field') {
      const sUid = sim.board.getUid(interaction.selectedSlot);
      const sUnit = sUid !== null ? sim.getUnitByUid(sUid) : undefined;
      const sDef = sUnit ? sim.data.unitsById.get(sUnit.unitId) : undefined;
      if (sDef?.supportAura) {
        totemPreviewFieldIdx = interaction.selectedSlot.index;
      }
    }

    if (totemPreviewFieldIdx !== null) {
      const neighbors = sim.getOrthogonalFieldNeighbors(totemPreviewFieldIdx);
      if (neighbors.length > 0) {
        const originPos = sim.board.getSlotCenter({ area: 'field', index: totemPreviewFieldIdx });
        this.buckets[RenderLayer.GroundFx]!.push({
          layer: RenderLayer.GroundFx,
          sortY: 195,
          render: (ctx) => {
            const pulse = 0.72 + Math.sin(simTimeSec * 6.5) * 0.28;
            for (let k = 0; k < neighbors.length; k++) {
              const nIdx = neighbors[k]!;
              const nRect = expandedSlotRect(sim.board, { area: 'field', index: nIdx });
              ctx.beginPath();
              ctx.roundRect(nRect.x + 1, nRect.y + 1, nRect.w - 2, nRect.h - 2, 10);
              ctx.fillStyle = `rgba(16, 185, 129, ${(0.22 * pulse).toFixed(3)})`;
              ctx.fill();
              ctx.lineWidth = 4;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.lineWidth = 2.2;
              ctx.strokeStyle = '#34d399';
              ctx.stroke();

              // Animated outgoing qi conduit preview
              const nPos = sim.board.getSlotCenter({ area: 'field', index: nIdx });
              ctx.save();
              ctx.setLineDash([6, 5]);
              ctx.lineDashOffset = -simTimeSec * 28;
              ctx.beginPath();
              ctx.moveTo(originPos.x, originPos.y + 16);
              ctx.lineTo(nPos.x, nPos.y + 16);
              ctx.lineWidth = 4;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.lineWidth = 2.2;
              ctx.strokeStyle = '#6ee7b7';
              ctx.stroke();
              ctx.restore();
            }
          },
        });
      }
    }

    // 2b. Incoming totem-aura preview when dragging ANY hero over a field tile adjacent to a supportAura totem
    if (interaction.draggingFromSlot && interaction.hoverTargetSlot?.area === 'field') {
      const hoverIdx = interaction.hoverTargetSlot.index;
      const fromSlot = interaction.draggingFromSlot;
      const neighbors = sim.getOrthogonalFieldNeighbors(hoverIdx);
      const sourceTotemIndices: number[] = [];
      for (let k = 0; k < neighbors.length; k++) {
        const nIdx = neighbors[k]!;
        if (fromSlot.area === 'field' && fromSlot.index === nIdx) continue;
        const nUid = sim.board.field.getUidAt(nIdx);
        if (nUid === null) continue;
        const nUnit = sim.getUnitByUid(nUid);
        const nDef = nUnit ? sim.data.unitsById.get(nUnit.unitId) : undefined;
        if (nDef?.supportAura) {
          sourceTotemIndices.push(nIdx);
        }
      }
      if (sourceTotemIndices.length > 0) {
        const targetPos = sim.board.getSlotCenter({ area: 'field', index: hoverIdx });
        const targetRect = expandedSlotRect(sim.board, { area: 'field', index: hoverIdx });
        this.buckets[RenderLayer.GroundFx]!.push({
          layer: RenderLayer.GroundFx,
          sortY: 196,
          render: (ctx) => {
            const pulse = 0.72 + Math.sin(simTimeSec * 7.5) * 0.28;
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(targetRect.x - 1, targetRect.y - 1, targetRect.w + 2, targetRect.h + 2, 11);
            ctx.fillStyle = `rgba(250, 204, 21, ${(0.2 * pulse).toFixed(3)})`;
            ctx.fill();
            ctx.lineWidth = 3.2;
            ctx.strokeStyle = '#facc15';
            ctx.stroke();

            for (let k = 0; k < sourceTotemIndices.length; k++) {
              const sPos = sim.board.getSlotCenter({ area: 'field', index: sourceTotemIndices[k]! });
              ctx.setLineDash([6, 5]);
              ctx.lineDashOffset = -simTimeSec * 30;
              ctx.beginPath();
              ctx.moveTo(sPos.x, sPos.y + 16);
              ctx.lineTo(targetPos.x, targetPos.y + 16);
              ctx.lineWidth = 4.4;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.lineWidth = 2.4;
              ctx.strokeStyle = '#fde047';
              ctx.stroke();
            }
            ctx.restore();
          },
        });
      }
    }

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
      const isHazardous = hover.area === 'field' && sim.hasFieldHazard(hover.index);
      this.buckets[RenderLayer.WorldUI]!.push({
        layer: RenderLayer.WorldUI,
        sortY: rect.y,
        render: (ctx) => {
          ctx.beginPath();
          ctx.roundRect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4, 12);
          ctx.fillStyle = isHazardous
            ? 'rgba(225, 29, 72, 0.3)'
            : occupied
              ? 'rgba(234, 179, 8, 0.26)'
              : 'rgba(16, 185, 129, 0.28)';
          ctx.fill();
          ctx.lineWidth = 3.5;
          ctx.strokeStyle = isHazardous ? '#e11d48' : occupied ? '#d97706' : '#059669';
          ctx.stroke();
        },
      });
    }
  }

  private collectMonsters(
    sim: Simulation,
    currentTick: number,
    alpha: number,
    simTimeSec: number,
    simDeltaSec: number,
  ): void {
    const monsters = sim.getMonsters();
    if (monsters.length === 0) {
      if (this.hpTrails.size > 0) this.hpTrails.clear();
      return;
    }

    this.activeMonsterIds.clear();
    for (let i = 0; i < monsters.length; i++) {
      this.activeMonsterIds.add(monsters[i]!.entityId);
    }
    if (this.hpTrails.size > monsters.length) {
      for (const id of this.hpTrails.keys()) {
        if (!this.activeMonsterIds.has(id)) {
          this.hpTrails.delete(id);
        }
      }
    }

    this.buckets[RenderLayer.Shadow]!.push({
      layer: RenderLayer.Shadow,
      sortY: 0,
      render: (ctx) => {
        ctx.fillStyle = 'rgba(26, 18, 36, 0.3)';
        for (let i = 0; i < monsters.length; i++) {
          const m = monsters[i]!;
          const x = m.prevX + (m.currX - m.prevX) * alpha;
          const y = m.prevY + (m.currY - m.prevY) * alpha;
          const sr = m.isBoss ? m.radius * 1.22 : m.radius * 0.96;
          ctx.beginPath();
          ctx.ellipse(x, y + m.radius * 0.78, sr, sr * 0.43, 0, 0, Math.PI * 2);
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
      const isArmorShredded = currentTick < m.shredExpireTick && m.armorShred > 0;
      const isArmorBroken = isArmorShredded && m.armor - m.armorShred < 0;
      const hasShield = m.shieldHp > 0 && currentTick < m.shieldExpireTick;
      const isHasted = currentTick < m.hasteUntilTick;
      const drawSize = m.isBoss ? BOSS_SPRITE : MOB_SPRITE;
      const strideSin = isStunned
        ? 0
        : Math.abs(Math.sin(distInterp * (m.kind === 'jiangshi' ? 0.13 : 0.11) + m.entityId * 0.9));
      const walkHop = strideSin * (m.kind === 'jiangshi' ? 6.5 : m.isBoss ? 2.6 : 3.4);
      const facingLeft = m.currX - m.prevX < -0.05;
      const footOff = Math.round(m.radius * 0.85);

      const baseSprite = this.sprites.monsterSprite(m.kind, false);
      const hitAgeSec = (currentTick + alpha - m.lastHitTick) * TICK_DT;
      const showHitFlash = hitAgeSec >= 0 && hitAgeSec < 0.14;
      const hitT = showHitFlash ? 1 - hitAgeSec / 0.14 : 0;

      // Update presentation-only delayed damage-drain HP trail
      const hpRatio = Math.max(0, Math.min(1, m.hp / m.maxHp));
      let trailRatio = this.hpTrails.get(m.entityId);
      if (trailRatio === undefined || hpRatio > trailRatio) {
        trailRatio = hpRatio;
      } else if (trailRatio > hpRatio) {
        // Hold briefly during peak hit flash, then smoothly slide down
        const drainRate = hitAgeSec >= 0 && hitAgeSec < 0.08 ? 0.18 : 1.35;
        trailRatio = Math.max(hpRatio, trailRatio - simDeltaSec * drainRate);
      }
      this.hpTrails.set(m.entityId, trailRatio);

      // Menacing Boss ground formation ring under Boss monsters
      if (m.isBoss && !m.isBounty) {
        this.buckets[RenderLayer.GroundFx]!.push({
          layer: RenderLayer.GroundFx,
          sortY: y - 2.5,
          render: (ctx) => {
            const pulse = 1 + Math.sin(simTimeSec * 4.5 + m.entityId) * 0.06;
            const bx = x;
            const by = y + m.radius * 0.78;
            const rx = m.radius * 1.48 * pulse;
            const ry = m.radius * 0.62 * pulse;
            const bossCol =
              m.kind === 'white_tiger'
                ? '#38bdf8'
                : m.kind === 'black_serpent'
                  ? '#10b981'
                  : m.kind === 'azure_dragon'
                    ? '#0ea5e9'
                    : m.kind === 'vermilion_bird'
                      ? '#f97316'
                      : '#e11d48';
            const glow = this.sprites.glow(bossCol, 42);
            const prevA = ctx.globalAlpha;
            ctx.globalAlpha = prevA * 0.42;
            ctx.drawImage(glow, bx - rx * 1.15, by - ry * 1.35, rx * 2.3, ry * 2.7);
            ctx.globalAlpha = prevA;

            ctx.beginPath();
            ctx.ellipse(bx, by, rx, ry, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(26, 12, 24, 0.28)';
            ctx.fill();
            ctx.lineWidth = 4.2;
            ctx.strokeStyle = PIXEL_OUTLINE;
            ctx.stroke();
            ctx.lineWidth = 2.2;
            ctx.strokeStyle = bossCol;
            ctx.stroke();

            // Rotating outer warning pips
            const spin = simTimeSec * 1.6;
            for (let k = 0; k < 6; k++) {
              const a = spin + (k * Math.PI) / 3;
              const px = bx + Math.cos(a) * rx;
              const py = by + Math.sin(a) * ry;
              ctx.beginPath();
              ctx.arc(px, py, 2.6, 0, Math.PI * 2);
              ctx.fillStyle =
                m.kind === 'azure_dragon'
                  ? '#67e8f9'
                  : m.kind === 'vermilion_bird'
                    ? '#fb923c'
                    : '#fef08a';
              ctx.fill();
              ctx.lineWidth = 1.2;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
            }
          },
        });
      }

      if (m.isBounty) {
        this.buckets[RenderLayer.GroundFx]!.push({
          layer: RenderLayer.GroundFx,
          sortY: y - 2,
          render: (ctx) => {
            const pulse = 1 + Math.sin((currentTick + alpha) * 0.22) * 0.08;
            ctx.beginPath();
            ctx.ellipse(
              x,
              y + m.radius * 0.76,
              m.radius * 1.28 * pulse,
              m.radius * 0.56 * pulse,
              0,
              0,
              Math.PI * 2,
            );
            ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
            ctx.fill();
            ctx.lineWidth = 2.6;
            ctx.strokeStyle = '#facc15';
            ctx.stroke();
          },
        });
      }

      if (isArmorShredded) {
        this.buckets[RenderLayer.GroundFx]!.push({
          layer: RenderLayer.GroundFx,
          sortY: y - 1.5,
          render: (ctx) => {
            ctx.save();
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.ellipse(
              x,
              y + m.radius * 0.72,
              m.radius * 1.14,
              m.radius * 0.5,
              0,
              0,
              Math.PI * 2,
            );
            ctx.strokeStyle = isArmorBroken ? '#f43f5e' : '#c084fc';
            ctx.lineWidth = isArmorBroken ? 2.8 : 2.1;
            ctx.stroke();
            ctx.restore();
          },
        });
      }

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
          // Snappy hit recoil micro-jitter + directional flinch squash-and-stretch
          const recoilSign = (m.lastHitTick + m.entityId) % 2 === 0 ? 1 : -1;
          const hitJitterX = showHitFlash
            ? Math.sin(hitAgeSec * 92 + m.entityId) * hitT * (m.isBoss ? 2.2 : 3.2) * recoilSign
            : 0;
          const hitLiftY = showHitFlash ? Math.sin(hitT * Math.PI) * (m.isBoss ? 2.0 : 3.4) : 0;
          const hitTilt = showHitFlash ? recoilSign * hitT * (m.isBoss ? 0.045 : 0.085) : 0;
          const sx = (facingLeft ? -1 : 1) * (1 - strideSin * 0.02 + hitT * 0.18);
          const sy = 1 + strideSin * 0.026 - hitT * 0.15;

          ctx.translate(Math.round(x + hitJitterX), Math.round(y + footOff - walkHop - hitLiftY));
          if (hitTilt !== 0) ctx.rotate(hitTilt);
          ctx.scale(sx, sy);

          const halfW = Math.round(drawSize * 0.5);
          const spriteTop = Math.round(-drawSize * (47 / 48));
          ctx.drawImage(baseSprite, -halfW, spriteTop, drawSize, drawSize);

          if (showHitFlash) {
            const useGoldFlash = (isArmorBroken || m.isBounty) && hitT > 0.45;
            const flashSprite = this.sprites.monsterSprite(
              m.kind,
              true,
              useGoldFlash ? 'gold' : 'white',
            );
            const prevA = ctx.globalAlpha;
            ctx.globalAlpha = Math.min(0.88, hitT * 0.92);
            ctx.drawImage(flashSprite, -halfW, spriteTop, drawSize, drawSize);
            ctx.globalAlpha = prevA;
          }
          ctx.restore();
        },
      });

      if (hasShield) {
        const isPhoenixEgg = m.kind === 'vermilion_bird';
        this.buckets[RenderLayer.AirFx]!.push({
          layer: RenderLayer.AirFx,
          sortY: y + 4,
          render: (ctx) => {
            ctx.save();
            const spin = (currentTick + alpha) * 0.07;
            const r = m.radius * 1.55;
            const cy = y - m.radius * 0.35;
            ctx.translate(x, cy);
            if (isPhoenixEgg) {
              // Blazing solar Nirvana flame-egg cocoon
              const pulse = 1 + Math.sin(spin * 2.8) * 0.06;
              ctx.beginPath();
              ctx.ellipse(0, -2, r * 0.92 * pulse, r * 1.12 * pulse, 0, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(249, 115, 22, 0.26)';
              ctx.fill();
              ctx.lineWidth = 4.6;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.lineWidth = 2.6;
              ctx.strokeStyle = '#fde047';
              ctx.stroke();

              // 4 orbiting solar flame tongues
              for (let f = 0; f < 4; f++) {
                const fa = spin * 1.8 + (f * Math.PI) / 2;
                const fx = Math.cos(fa) * r * 0.95;
                const fy = Math.sin(fa) * r * 0.85;
                ctx.beginPath();
                ctx.arc(fx, fy, 3.8, 0, Math.PI * 2);
                ctx.fillStyle = f % 2 === 0 ? '#fef08a' : '#fb923c';
                ctx.fill();
              }
            } else {
              ctx.rotate(spin);
              ctx.beginPath();
              for (let v = 0; v < 6; v++) {
                const ang = (v * Math.PI) / 3;
                const vx = Math.cos(ang) * r;
                const vy = Math.sin(ang) * r * 0.85;
                if (v === 0) ctx.moveTo(vx, vy);
                else ctx.lineTo(vx, vy);
              }
              ctx.closePath();
              ctx.fillStyle = 'rgba(20, 184, 166, 0.22)';
              ctx.fill();
              ctx.lineWidth = 4.5;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.lineWidth = 2.4;
              ctx.strokeStyle = '#5eead4';
              ctx.stroke();
            }
            ctx.restore();
          },
        });
      }

      if (isHasted) {
        this.buckets[RenderLayer.AirFx]!.push({
          layer: RenderLayer.AirFx,
          sortY: y + 3,
          render: (ctx) => {
            ctx.save();
            const dir = facingLeft ? 1 : -1;
            const cy = y - m.radius * 0.32;
            for (let l = 0; l < 3; l++) {
              const ly = cy - 16 + l * 15;
              const lx = x + dir * (18 + ((currentTick + l * 5) % 9) * 2.5);
              ctx.beginPath();
              ctx.moveTo(lx, ly);
              ctx.lineTo(lx + dir * 24, ly);
              ctx.lineWidth = 4;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.lineWidth = 2;
              ctx.strokeStyle = l === 1 ? '#fef08a' : '#f59e0b';
              ctx.stroke();
            }
            ctx.restore();
          },
        });
      }

      if (m.isBoss || m.hp < m.maxHp || isStunned || isArmorShredded || hasShield || isHasted) {
        const capturedTrail = trailRatio;
        this.buckets[RenderLayer.WorldUI]!.push({
          layer: RenderLayer.WorldUI,
          sortY: y + 1,
          render: (ctx) => {
            const barW = m.isBoss ? 86 : 46;
            const barH = m.isBoss ? 10 : 6.5;
            const bx = Math.round(x - barW * 0.5);
            const rawBy = Math.round(y + footOff - drawSize * 0.92 - barH - 4);
            const by = Math.max(102, rawBy);
            const ratio = hpRatio;

            ctx.beginPath();
            ctx.roundRect(bx - 1.8, by - 1.8, barW + 3.6, barH + 3.6, 99);
            ctx.fillStyle = showHitFlash && hitT > 0.55 ? '#fffbeb' : PIXEL_OUTLINE;
            ctx.fill();
            ctx.beginPath();
            ctx.roundRect(bx, by, barW, barH, 99);
            ctx.fillStyle = '#2d1424';
            ctx.fill();

            // Delayed damage-drain white-gold chunk bar
            if (capturedTrail > ratio + 0.006) {
              ctx.beginPath();
              ctx.roundRect(bx, by, Math.max(barH, barW * capturedTrail), barH, 99);
              ctx.fillStyle = showHitFlash ? '#ffffff' : '#fde047';
              ctx.fill();
            }

            if (ratio > 0) {
              ctx.beginPath();
              ctx.roundRect(bx, by, Math.max(barH, barW * ratio), barH, 99);
              ctx.fillStyle = m.isBounty
                ? '#f59e0b'
                : m.isBoss
                  ? '#e11d48'
                  : ratio > 0.5
                    ? '#16a34a'
                    : ratio > 0.25
                      ? '#f59e0b'
                      : '#dc2626';
              ctx.fill();

              ctx.beginPath();
              ctx.roundRect(bx + 1, by + 1, Math.max(2, barW * ratio - 2), barH * 0.38, 99);
              ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
              ctx.fill();
            }

            if (hasShield && m.shieldMaxHp > 0) {
              const sRatio = Math.max(0, Math.min(1, m.shieldHp / m.shieldMaxHp));
              const sy = by + barH + 3;
              const sh = 6;
              ctx.beginPath();
              ctx.roundRect(bx - 1.5, sy - 1.5, barW + 3, sh + 3, 99);
              ctx.fillStyle = PIXEL_OUTLINE;
              ctx.fill();
              ctx.beginPath();
              ctx.roundRect(bx, sy, barW, sh, 99);
              ctx.fillStyle = m.kind === 'vermilion_bird' ? '#431407' : '#0f292e';
              ctx.fill();
              if (sRatio > 0) {
                ctx.beginPath();
                ctx.roundRect(bx, sy, Math.max(sh, barW * sRatio), sh, 99);
                ctx.fillStyle = m.kind === 'vermilion_bird' ? '#fb923c' : '#2dd4bf';
                ctx.fill();
              }
            }

            if (hasShield || isHasted) {
              const badge = this.sprites.statusBadge(
                hasShield
                  ? m.kind === 'vermilion_bird'
                    ? 'phoenix_egg'
                    : 'shield'
                  : 'haste',
              );
              const bw = 88;
              const bh = 24;
              ctx.save();
              ctx.imageSmoothingEnabled = false;
              ctx.drawImage(badge, Math.round(x - bw * 0.5), Math.round(by - 26), bw, bh);
              ctx.restore();
            }

            if (isArmorShredded) {
              // Cracked shield icon at left edge of HP bar (bright crimson when broken < 0)
              const sx = bx - 8;
              const sy = by + barH * 0.5;
              ctx.beginPath();
              ctx.moveTo(sx, sy - 5);
              ctx.lineTo(sx + 4.5, sy - 2.5);
              ctx.lineTo(sx + 3.5, sy + 3);
              ctx.lineTo(sx, sy + 5.5);
              ctx.lineTo(sx - 3.5, sy + 3);
              ctx.lineTo(sx - 4.5, sy - 2.5);
              ctx.closePath();
              ctx.fillStyle = isArmorBroken ? '#f43f5e' : '#a855f7';
              ctx.fill();
              ctx.lineWidth = 1.5;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              // Crack slash across shield
              ctx.beginPath();
              ctx.moveTo(sx - 2, sy - 3);
              ctx.lineTo(sx + 2, sy + 3);
              ctx.lineWidth = 1.4;
              ctx.strokeStyle = '#fffbeb';
              ctx.stroke();
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

      const equippedSkin = this.equippedHeroSkins.get(u.unitId) ?? null;
      const baseProfile = getUnitCombatProfile(u.unitId);
      const profile: UnitCombatProfile = equippedSkin
        ? {
            ...baseProfile,
            primary: equippedSkin.primaryColor,
            secondary: equippedSkin.secondaryColor,
          }
        : baseProfile;

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
      const isSealed = isField && sim.isFieldSlotSealed(u.slot.index);
      const spriteSize = Math.round((isField ? FIELD_SPRITE : BENCH_SPRITE) * popScale);
      const breath = isSealed ? 0 : Math.sin(simTimeSec * 3.4 + u.uid * 0.87);

      // Multi-phase smooth martial weapon swing choreography tailored to all 10 weapons
      const atkDurSec = Math.min(0.36, Math.max(0.25, def.attackIntervalTicks * TICK_DT * 0.76));
      const atkElapsedSec = (currentTick + alpha - u.lastAttackTick) * TICK_DT;
      const isAttacking = isField && !isSealed && atkElapsedSec >= 0 && atkElapsedSec < atkDurSec;
      const atkP = isAttacking ? atkElapsedSec / atkDurSec : 0;
      const comboSide = (u.attackCount & 1) === 0 ? 1 : -1;
      const isSkillStrike = u.attackCount > 0 && u.attackCount % def.skill.everyN === 0;

      let stepX = 0;
      let stepY = 0;
      let hopY = 0;
      let bodyTilt = 0;
      let animScaleX = 1 - breath * 0.018;
      let animScaleY = 1 + breath * 0.024;

      if (isAttacking) {
        const style = profile.style;
        const isFist = style === 'palm_fist';
        const isHover = style === 'sorcery_qi' || style === 'flying_sword';
        const windUpTilt =
          isFist || style === 'flying_sword'
            ? -0.04
            : style === 'sorcery_qi'
              ? -0.07
              : style === 'fan'
                ? -0.11
                : style === 'saber'
                  ? -0.22
                  : -0.16;
        const peakTilt =
          style === 'saber'
            ? 0.31
            : style === 'dual_sword'
              ? 0.24
              : style === 'sword'
                ? comboSide > 0
                  ? 0.24
                  : 0.17
                : style === 'fan'
                  ? 0.15
                  : style === 'staff_gourd'
                    ? 0.14
                    : style === 'spear_staff'
                      ? 0.1
                      : isFist
                        ? 0.03 // Upright horse-stance spine (마보충권)
                        : style === 'flying_sword'
                          ? 0.05 // Regal Sword-Immortal finger command
                          : style === 'dagger_hidden'
                            ? 0.17
                            : 0.06;

        const windUpBack =
          style === 'spear_staff'
            ? -4.0
            : isFist
              ? -2.2
              : style === 'flying_sword'
                ? -1.4
                : style === 'fan'
                  ? -2.2
                  : -3.2;
        const thrustForward =
          style === 'spear_staff'
            ? 8.4
            : style === 'dual_sword'
              ? 8.2
              : isFist
                ? 6.0
                : style === 'flying_sword'
                  ? 3.2
                  : style === 'fan'
                    ? 5.6
                    : 7.6;

        let stepDist = 0;
        if (atkP < 0.22) {
          // Phase 1: Wind-up chamber (coil weapon / fold fan / chamber fist)
          const t = easeOutQuad(atkP / 0.22);
          stepDist = windUpBack * t;
          bodyTilt = windUpTilt * t;
          animScaleX = 1 + (isFist ? 0.068 : 0.052) * t;
          animScaleY = 1 - (isFist ? 0.072 : 0.058) * t;
          hopY = isFist ? 0 : isHover ? 4.2 * t : isSkillStrike ? 2.0 * t : 0;
        } else if (atkP < 0.5) {
          // Phase 2: Explosive weapon release (unfold fan / cleave saber / thrust staff / command swords)
          const t = easeOutCubic((atkP - 0.22) / 0.28);
          stepDist = windUpBack + thrustForward * t;
          bodyTilt = windUpTilt + (peakTilt - windUpTilt) * t;
          const reachX =
            isFist ? 0.06 : style === 'spear_staff' ? 0.078 : style === 'fan' ? 0.055 : 0.045;
          animScaleX = (isFist ? 1.068 : 1.052) - 0.03 * t + reachX * t;
          animScaleY = isFist
            ? 0.928 + 0.054 * t
            : 0.942 + (comboSide < 0 && style === 'sword' ? 0.1 * t : 0.048 * t);
          hopY = isFist
            ? 0
            : isHover
              ? 4.2 + 4.2 * t
              : style === 'dagger_hidden'
                ? Math.sin(t * Math.PI) * 6.5
                : style === 'dual_sword' || style === 'fan'
                  ? Math.sin(t * Math.PI) * 3.4
                  : (isSkillStrike ? 4.8 : 2.0) * Math.sin(t * Math.PI);
        } else if (atkP < 0.7) {
          // Phase 3: Martial follow-through hold (잔심)
          const t = (atkP - 0.5) / 0.2;
          const holdFrom = windUpBack + thrustForward;
          stepDist = holdFrom * (1 - 0.32 * t);
          bodyTilt = peakTilt * (1 - 0.42 * t);
          animScaleX = (isFist ? 1.078 : 1.048) * (1 - 0.032 * t);
          animScaleY = isFist ? 0.982 : 0.99;
          hopY = isHover ? 8.4 * (1 - 0.35 * t) : 0;
        } else {
          // Phase 4: Smooth recovery ease back into idle breathing stance
          const t = smoothstep((atkP - 0.7) / 0.3);
          const recFrom = (windUpBack + thrustForward) * 0.68;
          stepDist = recFrom * (1 - t);
          bodyTilt = peakTilt * 0.58 * (1 - t);
          animScaleX = 1.02 + (1 - breath * 0.018 - 1.02) * t;
          animScaleY = 0.99 + (1 + breath * 0.024 - 0.99) * t;
          hopY = isHover ? 5.5 * (1 - t) : 0;
        }

        stepX = u.attackDirX * stepDist;
        stepY = u.attackDirY * stepDist;
      }

      const drawX = baseX + stepX;
      const drawY = baseY + stepY;
      const footY = baseY + (isField ? FIELD_FOOT : BENCH_FOOT);
      const drawFootY = footY + stepY;
      const sprite = this.sprites.unitToken(def, grade, equippedSkin);
      const facingLeft = isField && u.attackDirX < -0.15;
      const skillReady =
        isField &&
        !isSealed &&
        def.skill.everyN > 1 &&
        (u.attackCount + 1) % def.skill.everyN === 0;
      const idleHoverY =
        isField && !isSealed && (profile.style === 'flying_sword' || grade.rank >= 6)
          ? 2.6 + Math.sin(simTimeSec * 3.1 + u.uid * 1.17) * 2.4
          : 0;

      // 1. Sculpted 3D faction martial formation & rank pedestal under feet
      this.buckets[RenderLayer.GroundFx]!.push({
        layer: RenderLayer.GroundFx,
        sortY: baseY - 2,
        render: (ctx) => {
          this.renderFactionAura(
            ctx,
            baseX,
            footY,
            isField,
            def.faction,
            grade.rank,
            grade.color,
            simTimeSec,
            u.uid,
            skillReady,
            equippedSkin?.primaryColor,
            equippedSkin?.secondaryColor,
          );
        },
      });

      // 2. Crisp ink contact shadow on white-jade courtyard (shrinks subtly while levitating/hopping)
      this.buckets[RenderLayer.Shadow]!.push({
        layer: RenderLayer.Shadow,
        sortY: drawY,
        render: (ctx) => {
          const liftScale = Math.max(0.76, 1 - (hopY + idleHoverY) * 0.016);
          ctx.fillStyle = 'rgba(26, 18, 36, 0.3)';
          ctx.beginPath();
          ctx.ellipse(
            drawX,
            drawFootY + 1.5,
            spriteSize * 0.27 * liftScale,
            spriteSize * 0.085 * liftScale,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        },
      });

      // 2b. High-tier Martial Back-Halo (절정 광기 / 화경 광륜 / 현경·신마 광배 / Lv.5 화신 무신광배)
      const isAvatarMaster = sim.getHeroMasteryAtkPct(u.unitId) >= 15;
      const eqArmSlot = sim.getEquippedArmamentSlotForUid(u.uid);
      const armResonance = Boolean(
        eqArmSlot && eqArmSlot.def.resonance.faction === def.faction,
      );

      if (
        isField &&
        (grade.rank >= 4 || equippedSkin !== null || isAvatarMaster) &&
        !isDraggedOrigin
      ) {
        this.buckets[RenderLayer.Unit]!.push({
          layer: RenderLayer.Unit,
          sortY: drawY - 0.12,
          render: (ctx) => {
            this.renderUnitBackHalo(
              ctx,
              drawX,
              drawFootY - hopY - idleHoverY - spriteSize * 0.44,
              def.faction,
              isAvatarMaster ? Math.max(5, grade.rank) : grade.rank,
              isAvatarMaster && grade.rank < 5 ? '#f59e0b' : grade.color,
              profile.primary,
              profile.secondary,
              simTimeSec,
              u.uid,
              skillReady,
              isAvatarMaster,
            );
          },
        });
      }

      // 3. Pixel-art hero sprite with ankle-pivoted martial swing choreography
      this.buckets[RenderLayer.Unit]!.push({
        layer: RenderLayer.Unit,
        sortY: drawY,
        render: (ctx) => {
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          if (isDraggedOrigin) {
            ctx.globalAlpha *= 0.38;
          }
          ctx.translate(Math.round(drawX), Math.round(drawFootY - hopY - idleHoverY));
          ctx.scale(facingLeft ? -1 : 1, 1);
          // Pivot near ankles (-14px) so feet remain grounded while shoulders & blade whip smoothly
          ctx.translate(0, -14);
          ctx.rotate(bodyTilt);
          ctx.scale(animScaleX, animScaleY);
          ctx.translate(0, 14);

          const halfW = Math.round(spriteSize * 0.5);
          const topOff = Math.round(-spriteSize * (47 / 48));
          ctx.drawImage(sprite, -halfW, topOff, spriteSize, spriteSize);
          ctx.restore();
        },
      });

      // 4. Outward-Projected Weapon Motion (in front of weapon hand — never obscures hero's face!)
      if (isAttacking && atkP >= 0.12 && atkP <= 0.86) {
        const swingProg = (atkP - 0.12) / 0.74;
        const aimAngle = Math.atan2(u.attackDirY, u.attackDirX);
        const swingOriginX = drawX + u.attackDirX * 18;
        const swingOriginY = drawFootY - hopY - idleHoverY - spriteSize * 0.38 + u.attackDirY * 12;
        const rankScale =
          0.92 +
          Math.min(5, grade.rank - 1) * 0.075 +
          (isSkillStrike ? 0.16 : 0) +
          (isAvatarMaster ? 0.14 : 0) +
          (eqArmSlot ? 0.1 : 0);
        const evolvedProfile: UnitCombatProfile = eqArmSlot
          ? {
              ...profile,
              secondary: eqArmSlot.def.color,
            }
          : isAvatarMaster
            ? {
                ...profile,
                secondary: '#fde047',
              }
            : profile;

        this.buckets[RenderLayer.AirFx]!.push({
          layer: RenderLayer.AirFx,
          sortY: drawY + 3,
          render: (ctx) => {
            this.renderWeaponSwing(
              ctx,
              swingOriginX,
              swingOriginY,
              aimAngle,
              swingProg,
              comboSide,
              rankScale,
              isSkillStrike,
              evolvedProfile,
              isAvatarMaster,
              eqArmSlot?.def.color ?? null,
            );
          },
        });
      }

      // 5. Floating sect qi-diamond motes on high-tier masters (절정+), Lv.5 화신, or skill-charged heroes
      if (
        isField &&
        (grade.rank >= 4 || equippedSkin !== null || skillReady || isAvatarMaster) &&
        !isDraggedOrigin
      ) {
        this.buckets[RenderLayer.AirFx]!.push({
          layer: RenderLayer.AirFx,
          sortY: drawY + 2,
          render: (ctx) => {
            const count =
              grade.rank >= 6 || isAvatarMaster
                ? 4
                : grade.rank >= 5 || equippedSkin
                  ? 3
                  : 2;
            const prevA = ctx.globalAlpha;
            ctx.globalAlpha =
              prevA * (grade.rank >= 4 || equippedSkin || isAvatarMaster ? 0.92 : 0.72);
            for (let m = 0; m < count; m++) {
              const orbit =
                simTimeSec * (skillReady || isAvatarMaster ? 3.5 : 2.5) +
                u.uid +
                (m * Math.PI * 2) / count;
              const radX = grade.rank >= 5 || isAvatarMaster ? 32 : 26;
              const ox = drawX + Math.cos(orbit) * radX;
              const oy =
                drawFootY -
                idleHoverY -
                32 +
                Math.sin(orbit * 1.45) * 12 -
                (grade.rank >= 5 || isAvatarMaster ? 5 : 0);
              const r = grade.rank >= 6 ? 4.2 : grade.rank >= 5 || isAvatarMaster ? 3.7 : 2.9;
              ctx.beginPath();
              ctx.moveTo(ox, oy - r * 1.25);
              ctx.lineTo(ox + r * 0.85, oy);
              ctx.lineTo(ox, oy + r * 1.25);
              ctx.lineTo(ox - r * 0.85, oy);
              ctx.closePath();
              ctx.fillStyle =
                (skillReady || isAvatarMaster) && m === 0
                  ? '#fef08a'
                  : isAvatarMaster && m === 2
                    ? '#fb7185'
                    : m % 2 === 0
                      ? profile.primary
                      : profile.secondary;
              ctx.fill();
              ctx.lineWidth = 1.3;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
            }
            ctx.globalAlpha = prevA;
          },
        });
      }

      // 5b. Orbiting Divine Armament Spirit Blade (신병 어검령) when equipped on a hero
      if (eqArmSlot && !isDraggedOrigin) {
        this.buckets[RenderLayer.AirFx]!.push({
          layer: RenderLayer.AirFx,
          sortY: drawY + 2.4,
          render: (ctx) => {
            const bladeCount = armResonance ? 2 : 1;
            const prevA = ctx.globalAlpha;
            ctx.globalAlpha = prevA * 0.95;
            for (let b = 0; b < bladeCount; b++) {
              const ang = simTimeSec * 3.2 + u.uid * 0.7 + b * Math.PI;
              const bx = drawX + Math.cos(ang) * (isField ? 29 : 23);
              const by = drawFootY - idleHoverY - 28 + Math.sin(ang) * 9;
              ctx.save();
              ctx.translate(bx, by);
              ctx.rotate(ang + Math.PI * 0.5);
              ctx.beginPath();
              ctx.moveTo(0, -9);
              ctx.lineTo(3.2, 2);
              ctx.lineTo(0, 7);
              ctx.lineTo(-3.2, 2);
              ctx.closePath();
              ctx.fillStyle = b === 0 ? eqArmSlot.def.color : eqArmSlot.def.secondaryColor;
              ctx.fill();
              ctx.lineWidth = 1.6;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(0, -8);
              ctx.lineTo(0, 3);
              ctx.lineWidth = 1.2;
              ctx.strokeStyle = '#ffffff';
              ctx.stroke();
              ctx.restore();
            }
            ctx.globalAlpha = prevA;
          },
        });
      }

      // 6. Lock badge
      if (u.locked) {
        this.buckets[RenderLayer.WorldUI]!.push({
          layer: RenderLayer.WorldUI,
          sortY: drawY + 2,
          render: (ctx) => {
            const lx = drawX + spriteSize * 0.33;
            const ly = drawFootY - idleHoverY - spriteSize * 0.78;
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

      // 6b. Awakening star pips (★ / ★★ / ★★★) — pre-rendered sprite (zero per-frame fillText)
      const starLv = u.starLevel ?? 0;
      if (starLv > 0 && !isDraggedOrigin) {
        this.buckets[RenderLayer.WorldUI]!.push({
          layer: RenderLayer.WorldUI,
          sortY: drawY + 3,
          render: (ctx) => {
            const badge = this.sprites.starBadge(starLv);
            const scale = 0.62;
            const bw = badge.width * scale;
            const bh = badge.height * scale;
            const sy = drawFootY - idleHoverY - spriteSize * 0.9;
            ctx.drawImage(badge, Math.round(drawX - bw * 0.5), Math.round(sy - bh * 0.5), bw, bh);
          },
        });
      }

      // 6c. Equipped Divine Armament Seal Badge ('✦자하' / '현중' ...) — pre-rendered sprite
      if (eqArmSlot && !isDraggedOrigin) {
        this.buckets[RenderLayer.WorldUI]!.push({
          layer: RenderLayer.WorldUI,
          sortY: drawY + 3.2,
          render: (ctx) => {
            const badge = this.sprites.armamentSealBadge(
              eqArmSlot.def.id,
              eqArmSlot.def.badge,
              eqArmSlot.def.color,
              armResonance,
            );
            const bw = isField ? 42 : 36;
            const bh = isField ? 20 : 17;
            const bx = drawX - spriteSize * 0.34;
            const by = drawFootY - idleHoverY - spriteSize * 0.8;
            ctx.drawImage(badge, Math.round(bx - bw * 0.5), Math.round(by - bh * 0.5), bw, bh);
          },
        });
      }

      // 6d. Lv.5 Avatar Mastery ('화신') or Hidden Primordial ('✦태고') golden crest seal
      if ((def.hiddenMythic || isAvatarMaster) && !isDraggedOrigin) {
        const isPrimordial = Boolean(def.hiddenMythic);
        this.buckets[RenderLayer.WorldUI]!.push({
          layer: RenderLayer.WorldUI,
          sortY: drawY + 3.1,
          render: (ctx) => {
            const badge = isPrimordial
              ? this.sprites.primordialMythicSealBadge()
              : this.sprites.avatarMasterySealBadge();
            const bw = isPrimordial ? (isField ? 48 : 41) : isField ? 38 : 32;
            const bh = isPrimordial ? (isField ? 18 : 15) : isField ? 17 : 14;
            const bx = drawX + spriteSize * 0.32;
            const by = drawFootY - idleHoverY - spriteSize * 0.22;
            ctx.drawImage(badge, Math.round(bx - bw * 0.5), Math.round(by - bh * 0.5), bw, bh);
          },
        });
      }

      // 6e. Bench passive active jade emblem ('진') — pre-rendered sprite (zero per-frame fillText)
      if (!isField && def.benchPassive && !isDraggedOrigin) {
        this.buckets[RenderLayer.WorldUI]!.push({
          layer: RenderLayer.WorldUI,
          sortY: drawY + 3,
          render: (ctx) => {
            const badge = this.sprites.benchPassiveBadge();
            const sz = 23;
            const bx = drawX - spriteSize * 0.32;
            const by = drawFootY - spriteSize * (eqArmSlot ? 0.52 : 0.76);
            ctx.drawImage(badge, Math.round(bx - sz * 0.5), Math.round(by - sz * 0.5), sz, sz);
          },
        });
      }

      // 7. Drag Ghost (crisp nearest-neighbor)
      if (isDraggedOrigin) {
        const ghostSize = 118;
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

  /**
   * Renders rank-tiered celestial / demonic back-halos behind 절정(4)·화경(5)·현경(6) & Lv.5 화신 heroes.
   * Placed behind the hero sprite in `RenderLayer.Unit` so silhouettes stay crisp and regal.
   */
  private renderUnitBackHalo(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    faction: FactionId,
    rank: number,
    gradeColor: string,
    primary: string,
    secondary: string,
    simTimeSec: number,
    uid: number,
    skillReady: boolean,
    isAvatarMaster = false,
  ): void {
    const prevA = ctx.globalAlpha;
    const pulse = 1 + Math.sin(simTimeSec * 4.2 + uid) * 0.05;
    const baseR = (rank >= 6 ? 35 : rank >= 5 ? 30 : 24) * pulse;
    const glowR = rank >= 6 || isAvatarMaster ? 50 : rank >= 5 ? 42 : 34;

    // Soft aura halo glow behind torso
    const auraCol = isAvatarMaster ? '#f59e0b' : rank >= 6 ? primary : gradeColor;
    const glow = this.sprites.glow(auraCol, glowR);
    ctx.globalAlpha = prevA * (rank >= 6 || isAvatarMaster ? 0.48 : rank >= 5 ? 0.34 : 0.24);
    ctx.drawImage(glow, cx - glowR, cy - glowR, glowR * 2, glowR * 2);

    if (rank >= 5) {
      const rot = simTimeSec * (rank >= 6 ? 1.15 : 0.8) * (faction === 'unorthodox' ? -1 : 1);
      ctx.save();
      ctx.translate(cx, cy);

      // Outer celestial/demonic ring with crisp dark ink outline
      ctx.globalAlpha = prevA * (rank >= 6 ? 0.86 : 0.72);
      ctx.beginPath();
      ctx.arc(0, 0, baseR, 0, Math.PI * 2);
      ctx.lineWidth = rank >= 6 ? 5.2 : 4.2;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();
      ctx.lineWidth = rank >= 6 ? 2.6 : 2.0;
      ctx.strokeStyle = rank >= 6 || isAvatarMaster ? '#fde047' : gradeColor;
      ctx.stroke();

      // Inner counter-rotating sacred ring (Immortal rank 6 or Lv.5 Avatar Master)
      if (rank >= 6 || isAvatarMaster) {
        ctx.save();
        ctx.rotate(-rot * 1.4);
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.arc(0, 0, baseR * 0.76, 0, Math.PI * 2);
        ctx.lineWidth = 2.0;
        ctx.strokeStyle = isAvatarMaster ? '#fb7185' : primary;
        ctx.stroke();
        ctx.restore();
      }

      // Cardinal martial crest diamonds / spikes around halo perimeter
      const nodeCount = rank >= 6 || isAvatarMaster ? 6 : 4;
      for (let k = 0; k < nodeCount; k++) {
        const a = rot + (k * Math.PI * 2) / nodeCount;
        const nx = Math.cos(a) * baseR;
        const ny = Math.sin(a) * baseR;
        const nr = rank >= 6 || isAvatarMaster ? (k % 2 === 0 ? 5.0 : 3.6) : 3.8;
        ctx.beginPath();
        ctx.moveTo(nx + Math.cos(a) * nr * 1.4, ny + Math.sin(a) * nr * 1.4);
        ctx.lineTo(nx + Math.cos(a + Math.PI * 0.5) * nr * 0.7, ny + Math.sin(a + Math.PI * 0.5) * nr * 0.7);
        ctx.lineTo(nx - Math.cos(a) * nr * 0.9, ny - Math.sin(a) * nr * 0.9);
        ctx.lineTo(nx + Math.cos(a - Math.PI * 0.5) * nr * 0.7, ny + Math.sin(a - Math.PI * 0.5) * nr * 0.7);
        ctx.closePath();
        ctx.fillStyle = k % 2 === 0 ? '#fffbeb' : isAvatarMaster ? '#f59e0b' : secondary;
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
      }

      ctx.restore();
    } else if (rank === 4 || skillReady) {
      // Subtle upward golden crescent arc behind 절정(rank 4) heroes
      ctx.save();
      ctx.translate(cx, cy + 4);
      ctx.globalAlpha = prevA * 0.62;
      ctx.beginPath();
      ctx.arc(0, 0, baseR, -Math.PI * 0.85, -Math.PI * 0.15);
      ctx.lineCap = 'round';
      ctx.lineWidth = 4.4;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();
      ctx.lineWidth = 2.1;
      ctx.strokeStyle = skillReady ? '#fef08a' : gradeColor;
      ctx.stroke();
      ctx.restore();
    }

    ctx.globalAlpha = prevA;
  }

  /**
   * Renders sculpted 3D faction martial formations & grade-tier pedestals under each unit's feet:
   * - 정파 (orthodox): 8-sided Bagua octagon (팔괘 정종진) in celadon/azure/gold
   * - 사파 (unorthodox): 6-fang serrated blade ring (사파 만독혈진) in emerald/crimson
   * - 마교 (demonic): 8-spike obsidian-blood star seal (천마혈해대진)
   * Includes subtle skill-ready pulse & crisp grade gem pip at the front rim.
   */
  private renderFactionAura(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    isField: boolean,
    faction: FactionId,
    rank: number,
    gradeColor: string,
    simTimeSec: number,
    uid: number,
    skillReady: boolean,
    skinPrimary?: string,
    skinSecondary?: string,
  ): void {
    const pulse = 1 + Math.sin(simTimeSec * (skillReady ? 6.2 : 3.6) + uid) * (skillReady ? 0.07 : 0.045);
    const rx = (isField ? 32 : 29) * pulse;
    const ry = rx * 0.41;
    const rot = simTimeSec * (rank >= 5 ? 1.85 : rank >= 3 ? 1.3 : 0.9);

    // 0. Radiant floor glow for rank >= 3, skinned, or skill-ready heroes
    if (rank >= 3 || skinPrimary || skillReady) {
      const glowColor =
        skinPrimary ??
        (skillReady && rank < 4
          ? '#facc15'
          : faction === 'demonic'
            ? '#e11d48'
            : faction === 'unorthodox'
              ? '#22c55e'
              : gradeColor);
      const glow = this.sprites.glow(glowColor, rank >= 5 ? 42 : 36);
      const prevA = ctx.globalAlpha;
      ctx.globalAlpha =
        rank >= 6 ? 0.56 : rank >= 5 || skinPrimary ? 0.46 : rank >= 4 ? 0.34 : 0.24;
      const gw = rank >= 5 ? 84 : 72;
      ctx.drawImage(glow, cx - gw * 0.5, cy - gw * 0.25, gw, gw * 0.5);
      ctx.globalAlpha = prevA;
    }

    // 1. Subtle 3D grounded pedestal lip directly underneath formation so heroes feel anchored
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2.6, rx * 0.96, ry * 0.94, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(26, 18, 36, 0.36)';
    ctx.fill();

    // 2. Skill-ready outer pulse ring telegraph
    if (skillReady) {
      const chargeP = 0.55 + Math.sin(simTimeSec * 8.5 + uid) * 0.45;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 1.14, ry * 1.14, 0, 0, Math.PI * 2);
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = hexWithAlpha('#fde047', 0.42 + chargeP * 0.45);
      ctx.stroke();
    }

    if (faction === 'orthodox') {
      // Octagonal Bagua formation (팔괘진)
      const mainCol = skinPrimary ?? gradeColor;
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = rot * 0.65 + (k * Math.PI) / 4;
        const px = cx + Math.cos(a) * rx;
        const py = cy + Math.sin(a) * ry;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = hexWithAlpha(mainCol, rank >= 4 ? 0.34 : rank >= 3 ? 0.28 : 0.22);
      ctx.fill();
      ctx.lineWidth = 4.2;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();
      ctx.lineWidth = rank >= 4 ? 2.8 : 2.1;
      ctx.strokeStyle = mainCol;
      ctx.stroke();

      if (rank >= 2) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx * 0.68, ry * 0.68, 0, 0, Math.PI * 2);
        ctx.lineWidth = rank >= 5 ? 2.0 : 1.6;
        ctx.strokeStyle = skinSecondary ?? (rank >= 4 ? '#fde047' : '#bae6fd');
        ctx.stroke();
      }
      // Four cardinal Bagua trigram ticks for rank >= 3
      if (rank >= 3) {
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const a = -rot * 0.8 + (k * Math.PI) / 2;
          ctx.moveTo(cx + Math.cos(a) * rx * 0.68, cy + Math.sin(a) * ry * 0.68);
          ctx.lineTo(cx + Math.cos(a) * rx * 0.94, cy + Math.sin(a) * ry * 0.94);
        }
        ctx.lineWidth = 2.0;
        ctx.strokeStyle = rank >= 5 ? '#fffbeb' : '#facc15';
        ctx.stroke();
      }
    } else if (faction === 'unorthodox') {
      // Serrated 6-fang Sapa formation (만독혈진)
      ctx.beginPath();
      const teeth = 12;
      for (let k = 0; k < teeth; k++) {
        const a = -rot * 0.9 + (k * Math.PI * 2) / teeth;
        const radScale = k % 2 === 0 ? 1.12 : 0.84;
        const px = cx + Math.cos(a) * rx * radScale;
        const py = cy + Math.sin(a) * ry * radScale;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = hexWithAlpha(skinPrimary ?? (rank >= 3 ? '#16a34a' : gradeColor), rank >= 4 ? 0.34 : 0.25);
      ctx.fill();
      ctx.lineWidth = 4.0;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();
      ctx.lineWidth = rank >= 4 ? 2.6 : 2.1;
      ctx.strokeStyle = skinSecondary ?? (rank >= 4 ? '#f43f5e' : gradeColor);
      ctx.stroke();

      if (rank >= 3) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx * 0.62, ry * 0.62, 0, 0, Math.PI * 2);
        ctx.lineWidth = 1.7;
        ctx.strokeStyle = rank >= 5 ? '#fde047' : '#4ade80';
        ctx.stroke();
      }
    } else {
      // Obsidian-crimson Demonic Cult star seal (천마혈진)
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 1.04, ry * 1.04, 0, 0, Math.PI * 2);
      ctx.fillStyle = rank >= 5 ? 'rgba(42, 6, 24, 0.56)' : 'rgba(26, 10, 22, 0.48)';
      ctx.fill();
      ctx.lineWidth = 4.2;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();
      ctx.lineWidth = rank >= 4 ? 2.6 : 2.2;
      ctx.strokeStyle = skinPrimary ?? (rank >= 4 ? '#e11d48' : gradeColor);
      ctx.stroke();

      const spikes = rank >= 4 ? 8 : 6;
      ctx.beginPath();
      for (let k = 0; k < spikes; k++) {
        const a = rot + (k * Math.PI * 2) / spikes;
        ctx.moveTo(cx + Math.cos(a) * rx * 0.54, cy + Math.sin(a) * ry * 0.54);
        ctx.lineTo(cx + Math.cos(a) * (rx + 4.8), cy + Math.sin(a) * (ry + 2.4));
      }
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = skinSecondary ?? (rank >= 5 ? '#fde047' : '#fb7185');
      ctx.stroke();
    }

    // 3. Crisp front-rim grade gem pip (instant color-coded rank readability on crowded grids)
    const gemY = cy + ry + 0.5;
    const gemR = rank >= 6 ? 5.2 : rank >= 5 ? 4.6 : rank >= 4 ? 4.1 : 3.5;
    ctx.beginPath();
    ctx.moveTo(cx, gemY - gemR);
    ctx.lineTo(cx + gemR * 1.15, gemY);
    ctx.lineTo(cx, gemY + gemR);
    ctx.lineTo(cx - gemR * 1.15, gemY);
    ctx.closePath();
    ctx.fillStyle = gradeColor;
    ctx.fill();
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.stroke();

    // Top specular jewel facet
    ctx.beginPath();
    ctx.arc(cx - gemR * 0.25, gemY - gemR * 0.25, Math.max(1.1, gemR * 0.34), 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  /**
   * Draws an animated cel-shaded weapon motion right in front of the attacking hero's hand
   * across all 10 Murim weapon archetypes + Lv.5 Avatar Mastery & Divine Armament outer sword-qi arc.
   */
  private renderWeaponSwing(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    aimAngle: number,
    sp: number,
    comboSide: number,
    rankScale: number,
    isSkill: boolean,
    profile: UnitCombatProfile,
    isAvatarMaster = false,
    armamentColor: string | null = null,
  ): void {
    const fade = sp < 0.64 ? 1 : 1 - (sp - 0.64) / 0.36;
    if (fade <= 0.01) return;

    const prevAlpha = ctx.globalAlpha;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.rotate(aimAngle);
    ctx.globalAlpha = prevAlpha * fade;

    // Evolved outer Sword-Qi Shockwave Rim when wielding a Divine Armament or Lv.5 Avatar Mastery!
    if ((isAvatarMaster || armamentColor !== null) && sp > 0.05 && sp < 0.85) {
      const evoP = Math.min(1, (sp - 0.05) / 0.55);
      const evoR = (38 + evoP * 20) * rankScale;
      const evoCol = armamentColor ?? '#fde047';
      ctx.beginPath();
      ctx.arc(4, 0, evoR, -Math.PI * 0.42, Math.PI * 0.42);
      ctx.lineCap = 'round';
      ctx.lineWidth = 4.2;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = hexWithAlpha(evoCol, 0.88 * (1 - evoP * 0.35));
      ctx.stroke();
      if (isAvatarMaster) {
        ctx.beginPath();
        ctx.arc(4, 0, evoR + 4.5, -Math.PI * 0.32, Math.PI * 0.32);
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = hexWithAlpha('#fb7185', 0.72 * (1 - evoP * 0.4));
        ctx.stroke();
      }
    }

    const style = profile.style;

    // Shared calligraphic multi-layer crescent helper for sword, dual_sword, and saber
    const drawBladeCrescent = (
      a0: number,
      a1: number,
      rOuter: number,
      bellyRatio: number,
      fillCol: string,
      edgeCol: string,
      lineW: number,
    ): void => {
      const anti = a1 < a0;
      const midA = (a0 + a1) * 0.5;
      const innerR = rOuter * bellyRatio;

      // 1. Subtle outer ink-brush aura shadow halo
      ctx.beginPath();
      ctx.arc(0, 0, rOuter + 2.2, a0, a1, anti);
      ctx.quadraticCurveTo(
        Math.cos(midA) * Math.max(4, innerR - 3),
        Math.sin(midA) * Math.max(4, innerR - 3),
        Math.cos(a0) * (rOuter + 2.2),
        Math.sin(a0) * (rOuter + 2.2),
      );
      ctx.closePath();
      ctx.fillStyle = hexWithAlpha(fillCol, 0.28);
      ctx.fill();

      // 2. Main cel-shaded crescent blade body with crisp dark ink outline
      ctx.beginPath();
      ctx.arc(0, 0, rOuter, a0, a1, anti);
      ctx.quadraticCurveTo(
        Math.cos(midA) * innerR,
        Math.sin(midA) * innerR,
        Math.cos(a0) * rOuter,
        Math.sin(a0) * rOuter,
      );
      ctx.closePath();
      ctx.fillStyle = fillCol;
      ctx.fill();
      ctx.lineWidth = lineW;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();

      // 3. Inner bright core ribbon tapering along the leading half of the arc
      const coreStart = a0 + (a1 - a0) * 0.22;
      const coreMid = (coreStart + a1) * 0.5;
      const coreInnerR = rOuter * Math.min(0.86, bellyRatio + (1 - bellyRatio) * 0.48);
      ctx.beginPath();
      ctx.arc(0, 0, rOuter - 1.6, coreStart, a1, anti);
      ctx.quadraticCurveTo(
        Math.cos(coreMid) * coreInnerR,
        Math.sin(coreMid) * coreInnerR,
        Math.cos(coreStart) * (rOuter - 1.6),
        Math.sin(coreStart) * (rOuter - 1.6),
      );
      ctx.closePath();
      ctx.fillStyle = edgeCol;
      ctx.fill();

      // 4. Blinding white-hot razor leading edge along outer rim
      ctx.beginPath();
      ctx.arc(0, 0, rOuter - 1.4, a0 + (a1 - a0) * 0.35, a1, anti);
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1.5, lineW * 0.62);
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // 5. Crisp trailing wind-cut speed line
      ctx.beginPath();
      ctx.arc(0, 0, rOuter + 5.2, a0 + (a1 - a0) * 0.18, a1 - (a1 - a0) * 0.06, anti);
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = hexWithAlpha(edgeCol, 0.78);
      ctx.stroke();
    };

    if (style === 'fan') {
      // === 사천당가 만독철선 / 북해빙궁 빙련선 부채 펼치기 ===
      const isIceFan = profile.sect === 'mudang';
      const fanBaseCol = isIceFan ? '#0c4a6e' : '#4c1d95';
      const fanTrimCol = isIceFan ? '#e0f2fe' : '#facc15';
      const fanRibOuter = isIceFan ? '#bae6fd' : '#facc15';
      const fanRibInner = isIceFan ? '#ffffff' : '#fde68a';
      const openT = easeOutCubic(Math.min(1, sp * 2.05));
      const sweepT = easeOutQuad(Math.min(1, sp * 1.45));
      const fanCenterA = (-0.26 + sweepT * 0.52) * comboSide;
      const halfSpan = (0.16 + openT * 0.98) * (isSkill ? 1.12 : 1);
      const aStart = fanCenterA - halfSpan;
      const aEnd = fanCenterA + halfSpan;
      const fanR = (isSkill ? 39 : 33) * rankScale;
      const innerR = 6.5 * rankScale;

      // 1. Sweeping poison/frost gale wave ahead of the snapping fan
      if (sp > 0.08) {
        const galeR = fanR + (6 + sweepT * 12) * rankScale;
        ctx.beginPath();
        ctx.arc(0, 0, galeR, aStart * 0.92, aEnd * 0.92);
        ctx.arc(0, 0, galeR - 7 * rankScale, aEnd * 0.92, aStart * 0.92, true);
        ctx.closePath();
        ctx.fillStyle = hexWithAlpha(profile.primary, 0.38);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, 0, galeR, aStart * 0.88, aEnd * 0.88);
        ctx.lineCap = 'round';
        ctx.lineWidth = 4.2;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = isSkill ? '#ffffff' : profile.secondary;
        ctx.stroke();
      }

      // 2. Unfolded Oriental War-Fan Canopy
      ctx.beginPath();
      ctx.arc(0, 0, fanR, aStart, aEnd);
      ctx.arc(0, 0, innerR, aEnd, aStart, true);
      ctx.closePath();
      ctx.fillStyle = fanBaseCol;
      ctx.fill();

      // Middle jade-venom / frost-lotus silk band
      ctx.beginPath();
      ctx.arc(0, 0, fanR * 0.84, aStart, aEnd);
      ctx.arc(0, 0, fanR * 0.44, aEnd, aStart, true);
      ctx.closePath();
      ctx.fillStyle = profile.primary;
      ctx.fill();

      // Outer silk trim
      ctx.beginPath();
      ctx.arc(0, 0, fanR, aStart, aEnd);
      ctx.arc(0, 0, fanR * 0.84, aEnd, aStart, true);
      ctx.closePath();
      ctx.fillStyle = fanTrimCol;
      ctx.fill();

      // Crisp cel-shaded outer border of the unfolded fan
      ctx.beginPath();
      ctx.arc(0, 0, fanR, aStart, aEnd);
      ctx.arc(0, 0, innerR, aEnd, aStart, true);
      ctx.closePath();
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();

      // 3. Seven Radiating Fan Ribs (7개의 부챗살)
      const ribCount = 7;
      ctx.lineCap = 'round';
      for (let rIdx = 0; rIdx < ribCount; rIdx++) {
        const ra = aStart + ((aEnd - aStart) * rIdx) / (ribCount - 1);
        const rx0 = Math.cos(ra) * (innerR * 0.45);
        const ry0 = Math.sin(ra) * (innerR * 0.45);
        const rx1 = Math.cos(ra) * (fanR + 1.8);
        const ry1 = Math.sin(ra) * (fanR + 1.8);

        ctx.beginPath();
        ctx.moveTo(rx0, ry0);
        ctx.lineTo(rx1, ry1);
        ctx.lineWidth = 2.8;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(rx0, ry0);
        ctx.lineTo(rx1, ry1);
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = rIdx === 0 || rIdx === ribCount - 1 ? fanRibOuter : fanRibInner;
        ctx.stroke();
      }

      // 4. Fan Pivot Pin & Fluttering Tassel
      ctx.beginPath();
      ctx.arc(0, 0, 4.2 * rankScale, 0, Math.PI * 2);
      ctx.fillStyle = fanTrimCol;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-1, 2 * comboSide);
      ctx.quadraticCurveTo(-7 * rankScale, 8 * comboSide, -11 * rankScale, 12 * comboSide);
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = profile.secondary;
      ctx.stroke();

      // 5. Darting Sichuan Poison Needles (만천화우 독침) firing out from between the fan ribs!
      if (sp > 0.14) {
        const needleP = easeOutQuad(Math.min(1, (sp - 0.14) / 0.72));
        const needleCount = isSkill ? 7 : 5;
        for (let n = 0; n < needleCount; n++) {
          const na = aStart * 0.82 + (aEnd - aStart) * 0.82 * (n / (needleCount - 1));
          const nStart = fanR * 0.88 + needleP * (isSkill ? 24 : 16) * rankScale;
          const nLen = (isSkill ? 14 : 10.5) * rankScale;
          const nx0 = Math.cos(na) * nStart;
          const ny0 = Math.sin(na) * nStart;
          const nx1 = Math.cos(na) * (nStart + nLen);
          const ny1 = Math.sin(na) * (nStart + nLen);

          ctx.beginPath();
          ctx.moveTo(nx0, ny0);
          ctx.lineTo(nx1, ny1);
          ctx.lineWidth = 3.8;
          ctx.strokeStyle = PIXEL_OUTLINE;
          ctx.stroke();
          ctx.lineWidth = 1.9;
          ctx.strokeStyle = n % 2 === 0 ? '#ffffff' : profile.primary;
          ctx.stroke();

          if (isSkill) {
            ctx.beginPath();
            ctx.arc(nx1, ny1, 2.2 * rankScale, 0, Math.PI * 2);
            ctx.fillStyle = profile.secondary;
            ctx.fill();
          }
        }
      }
    } else if (style === 'dual_sword') {
      // === 쌍검·쌍단검 X자 교차 난무 (Twin-Blade X-Cross Scissor Slash) ===
      const maxArc = 1.18;
      const radius = 42 * rankScale;
      const sweep1 = easeOutCubic(Math.min(1, sp * 1.55));
      const sweep2 = easeOutCubic(Math.min(1, Math.max(0, sp - 0.07) * 1.65));

      const a0A = -maxArc * comboSide;
      const a1A = a0A + maxArc * 2 * sweep1 * comboSide;
      const t0A = a0A + maxArc * 2 * Math.max(0, sp - 0.34) * 1.2 * comboSide;

      const a0B = maxArc * 0.92 * comboSide;
      const a1B = a0B - maxArc * 1.84 * sweep2 * comboSide;
      const t0B = a0B - maxArc * 1.84 * Math.max(0, sp - 0.38) * 1.2 * comboSide;

      drawBladeCrescent(
        t0A,
        a1A,
        radius,
        0.56,
        profile.primary,
        isSkill ? '#ffffff' : profile.secondary,
        2.5,
      );
      if (sp > 0.07) {
        drawBladeCrescent(
          t0B,
          a1B,
          radius * 0.9,
          0.58,
          profile.secondary,
          '#ffffff',
          2.4,
        );
      }

      // Twin physical crossed blades at leading edges
      if (sp < 0.76) {
        const bladeFill = profile.sect === 'magyo_sword' ? '#1e1b2e' : '#ecfdf5';
        const drawTwinBlade = (ang: number, len: number): void => {
          ctx.save();
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.moveTo(6, -2.1);
          ctx.lineTo(len, -1.3);
          ctx.lineTo(len + 9, 0);
          ctx.lineTo(len, 1.3);
          ctx.lineTo(6, 2.1);
          ctx.closePath();
          ctx.fillStyle = bladeFill;
          ctx.fill();
          ctx.lineWidth = 2.2;
          ctx.strokeStyle = PIXEL_OUTLINE;
          ctx.stroke();
          ctx.restore();
        };
        drawTwinBlade(a1A, radius + 2);
        if (sp > 0.07) {
          drawTwinBlade(a1B, radius * 0.9 + 2);
        }
      }

      // Central X-intersection spark flash
      if (sp >= 0.18 && sp <= 0.68) {
        const cx = radius * 0.72;
        const sr = (isSkill ? 9.5 : 7) * rankScale;
        ctx.beginPath();
        ctx.moveTo(cx - sr, -sr);
        ctx.lineTo(cx + sr, sr);
        ctx.moveTo(cx - sr, sr);
        ctx.lineTo(cx + sr, -sr);
        ctx.lineCap = 'round';
        ctx.lineWidth = 4.2;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.lineWidth = 2.1;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
    } else if (style === 'flying_sword') {
      // === 어검술·만검귀종 다중 비검 출격 (Sword-Immortal Levitating Spirit Sword Array) ===
      const sealR = 12.5 * rankScale;
      // 1. Glowing Sword-Command Seal Ring (어검인 원진) at hero's sword-finger
      ctx.beginPath();
      ctx.arc(2, 0, sealR, 0, Math.PI * 2);
      ctx.lineWidth = 3.4;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();
      ctx.lineWidth = 1.9;
      ctx.strokeStyle = profile.secondary;
      ctx.stroke();

      ctx.save();
      ctx.translate(2, 0);
      ctx.rotate(sp * Math.PI * 1.5);
      ctx.beginPath();
      const dr = sealR * 0.65;
      ctx.moveTo(dr, 0);
      ctx.lineTo(0, dr);
      ctx.lineTo(-dr, 0);
      ctx.lineTo(0, -dr);
      ctx.closePath();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = profile.primary;
      ctx.stroke();
      ctx.restore();

      // 2. Fan of 3 (or 5 on skill) levitating spirit swords surging forward!
      const count = isSkill ? 5 : 3;
      const mid = (count - 1) * 0.5;
      for (let sIdx = 0; sIdx < count; sIdx++) {
        const offsetIdx = sIdx - mid;
        const sa = offsetIdx * (isSkill ? 0.2 : 0.24);
        const stagger = Math.abs(offsetIdx) * 0.08;
        const launchT = easeOutCubic(Math.min(1, Math.max(0, (sp - stagger) * 1.65)));
        const dist = (10 + launchT * (isSkill ? 36 : 28)) * rankScale;
        const bLen = (isSkill ? 20 : 17) * rankScale;

        ctx.save();
        ctx.rotate(sa);
        ctx.translate(dist, 0);

        // Trailing azure/gold spirit wake
        ctx.beginPath();
        ctx.moveTo(-12 * rankScale, 0);
        ctx.lineTo(0, 0);
        ctx.lineCap = 'round';
        ctx.lineWidth = 4.2;
        ctx.strokeStyle = hexWithAlpha(profile.primary, 0.55);
        ctx.stroke();

        // Spirit Jian Crossguard
        ctx.beginPath();
        ctx.moveTo(0, -4.6 * rankScale);
        ctx.lineTo(0, 4.6 * rankScale);
        ctx.lineWidth = 3.4;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.lineWidth = 1.9;
        ctx.strokeStyle = '#facc15';
        ctx.stroke();

        // Glowing Spirit Jian Blade
        ctx.beginPath();
        ctx.moveTo(0, -2.2 * rankScale);
        ctx.lineTo(bLen - 5 * rankScale, -1.6 * rankScale);
        ctx.lineTo(bLen, 0);
        ctx.lineTo(bLen - 5 * rankScale, 1.6 * rankScale);
        ctx.lineTo(0, 2.2 * rankScale);
        ctx.closePath();
        ctx.fillStyle = sIdx % 2 === 0 ? profile.primary : profile.secondary;
        ctx.fill();
        ctx.lineWidth = 2.1;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();

        // White-hot center fuller line
        ctx.beginPath();
        ctx.moveTo(2, 0);
        ctx.lineTo(bLen - 3, 0);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.restore();
      }
    } else if (style === 'sword' || style === 'saber') {
      // === 정통 장검·중검 (Sword) & 패도·대도·중도끼 (Heavy Saber) ===
      const isSaber = style === 'saber';
      const isHeavy = Boolean(profile.heavyBlade) || isSaber;
      const maxArc = isSaber ? 1.38 : 1.18;
      const radius = (isSaber ? 46 : isHeavy ? 44 : 40) * rankScale;
      const sweepT = easeOutCubic(Math.min(1, sp * 1.48));
      const startA = -maxArc * comboSide;
      const curA = startA + maxArc * 2 * sweepT * comboSide;
      const trailStartA = startA + maxArc * 2 * Math.max(0, sp - 0.36) * 1.18 * comboSide;

      drawBladeCrescent(
        trailStartA,
        curA,
        radius,
        isSaber ? 0.28 : isHeavy ? 0.42 : 0.56,
        profile.primary,
        isSkill ? '#ffffff' : profile.secondary,
        isSaber ? 3.4 : 2.6,
      );

      // Counter-cleave for dual-saber warlords (녹림왕 패왕쌍대도, 혈해수라왕 적혈만독쌍도)
      if (profile.dualWield && sp > 0.1) {
        drawBladeCrescent(
          -trailStartA * 0.84,
          -curA * 0.88,
          radius * 0.84,
          0.44,
          profile.secondary,
          '#ffffff',
          2.6,
        );
      }

      // Physical swinging blade silhouette at leading edge
      if (sp < 0.76) {
        ctx.save();
        ctx.rotate(curA);
        ctx.beginPath();
        if (isSaber) {
          // Broad curved Wuxia Dadao / Blood Cleaver with notched spine
          ctx.moveTo(6, -2.6 * comboSide);
          ctx.lineTo(radius + 4, -6.2 * comboSide);
          ctx.quadraticCurveTo(radius + 12, 2.2 * comboSide, radius - 2, 6.4 * comboSide);
          ctx.lineTo(6, 2.8 * comboSide);
        } else if (isHeavy) {
          // Imperial / Heavenly Demon Heavy Greatsword (중검·패왕검)
          ctx.moveTo(6, -3.2);
          ctx.lineTo(radius + 4, -2.6);
          ctx.lineTo(radius + 11, 0);
          ctx.lineTo(radius + 4, 2.6);
          ctx.lineTo(6, 3.2);
        } else {
          // Sleek double-edged Wuxia Jian sword
          ctx.moveTo(6, -2.1);
          ctx.lineTo(radius + 4, -1.3);
          ctx.lineTo(radius + 10, 0);
          ctx.lineTo(radius + 4, 1.3);
          ctx.lineTo(6, 2.1);
        }
        ctx.closePath();
        ctx.fillStyle =
          profile.sect === 'magyo_sword'
            ? '#1e1b2e'
            : profile.sect === 'namgung' && isHeavy
              ? '#fef08a'
              : '#f8fafc';
        ctx.fill();
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.restore();
      }

      // Sect-signature accents along the swing arc
      if (isSaber) {
        // Flying forge/blood sparks along heavy saber cleave
        for (let s = 0; s < 3; s++) {
          const sa = trailStartA + (curA - trailStartA) * ((s + 1) / 3.4);
          const sr = radius + (s % 2 === 0 ? 5 : 8);
          ctx.beginPath();
          ctx.arc(Math.cos(sa) * sr, Math.sin(sa) * sr, 2.6, 0, Math.PI * 2);
          ctx.fillStyle = s === 1 ? '#ffffff' : profile.secondary;
          ctx.fill();
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = PIXEL_OUTLINE;
          ctx.stroke();
        }
      } else if (profile.sect === 'hwasan') {
        // Drifting Mount Hua plum blossom petals (매화검수 꽃잎)
        for (let b = 0; b < 3; b++) {
          const pa = trailStartA + (curA - trailStartA) * ((b + 1) / 3.5);
          const pr = radius * (0.82 + b * 0.09);
          ctx.beginPath();
          ctx.arc(Math.cos(pa) * pr, Math.sin(pa) * pr, 3.3, 0, Math.PI * 2);
          ctx.fillStyle = b % 2 === 0 ? '#fb7185' : '#fbcfe8';
          ctx.fill();
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = PIXEL_OUTLINE;
          ctx.stroke();
        }
      } else if (profile.sect === 'namgung' || profile.sect === 'magyo_sword') {
        // Crackling thunderbolt sparks along blade arc
        ctx.beginPath();
        for (let s = 0; s <= 4; s++) {
          const la = trailStartA + (curA - trailStartA) * (s / 4);
          const lr = radius + (s % 2 === 0 ? 4.5 : -4);
          const lx = Math.cos(la) * lr;
          const ly = Math.sin(la) * lr;
          if (s === 0) ctx.moveTo(lx, ly);
          else ctx.lineTo(lx, ly);
        }
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = profile.sect === 'namgung' ? '#fde047' : '#f43f5e';
        ctx.stroke();
      } else if (profile.sect === 'mudang') {
        // Spinning Yin-Yang Taiji pearl at sword tip
        const tx = Math.cos(curA) * radius;
        const ty = Math.sin(curA) * radius;
        ctx.beginPath();
        ctx.arc(tx, ty, 4.6, 0, Math.PI * 2);
        ctx.fillStyle = '#e0f2fe';
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
      } else if (profile.sect === 'haomun') {
        // Quick-draw Iai silver flash chord (발도술 일섬)
        ctx.beginPath();
        ctx.moveTo(Math.cos(trailStartA) * radius, Math.sin(trailStartA) * radius);
        ctx.lineTo(Math.cos(curA) * (radius + 4), Math.sin(curA) * (radius + 4));
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
    } else if (style === 'spear_staff') {
      // === 장창·타구봉·목봉 찌르기 & 선풍격 (Monk Oak Staff / Beggar Bamboo Staff / Ghost Bone Spear) ===
      const thrustT = easeOutCubic(Math.min(1, sp * 1.65));
      const reach = (16 + thrustT * 42) * rankScale;
      const isBoneSpear = profile.sect === 'magyo_bone';
      const isBamboo = profile.sect === 'gaebang';
      const shaftColor = isBoneSpear ? '#e2e8f0' : isBamboo ? '#16a34a' : '#b45309';

      // Optional skill 360° whirl-staff ring (타구봉 선풍 / 소림 회전봉)
      if (isSkill) {
        const whirlR = 24 * rankScale;
        ctx.beginPath();
        ctx.arc(10, 0, whirlR, sp * 5, sp * 5 + Math.PI * 1.35);
        ctx.lineCap = 'round';
        ctx.lineWidth = 5.2;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.lineWidth = 2.6;
        ctx.strokeStyle = profile.secondary;
        ctx.stroke();
      }

      // 1. Qi thrust cone envelope
      ctx.beginPath();
      ctx.moveTo(4, -6 * rankScale);
      ctx.lineTo(reach + 8 * rankScale, 0);
      ctx.lineTo(4, 6 * rankScale);
      ctx.closePath();
      ctx.fillStyle = hexWithAlpha(profile.primary, 0.42);
      ctx.fill();

      // 2. Physical wooden/bamboo/bone polearm shaft
      ctx.beginPath();
      ctx.roundRect(-6, -2.8 * rankScale, reach, 5.6 * rankScale, 2.5);
      ctx.fillStyle = shaftColor;
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();

      // 3. Spearhead (for bone_fiend) OR Brass/Jade Staff Cap (for shaolin_novice / gaebang_beggar)
      if (isBoneSpear) {
        ctx.beginPath();
        ctx.moveTo(reach - 6, -5.2 * rankScale);
        ctx.lineTo(reach + 11 * rankScale, 0);
        ctx.lineTo(reach - 6, 5.2 * rankScale);
        ctx.closePath();
        ctx.fillStyle = profile.secondary;
        ctx.fill();
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.roundRect(reach - 7, -3.6 * rankScale, 9 * rankScale, 7.2 * rankScale, 2.5);
        ctx.fillStyle = isBamboo ? '#bbf7d0' : '#facc15';
        ctx.fill();
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
      }

      // 4. Double sonic shock rings around thrusting shaft
      for (let r = 0; r < 2; r++) {
        const ringX = reach * (0.42 + r * 0.28);
        const ringH = (13 - r * 2.5) * rankScale;
        ctx.beginPath();
        ctx.ellipse(ringX, 0, 4.6, ringH, 0, 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.lineWidth = 1.7;
        ctx.strokeStyle = r === 0 ? '#ffffff' : profile.secondary;
        ctx.stroke();
      }
    } else if (style === 'palm_fist') {
      // === 금강권·흑염권 정권 지르기 & 광마 혈조 (Vajra Fist / Black-Flame Fist / Berserk Blood Claw) ===
      const punchExt =
        sp < 0.55
          ? easeOutCubic(Math.min(1, sp / 0.36))
          : 1 - smoothstep((sp - 0.55) / 0.45) * 0.35;
      const fistReach = (8 + punchExt * 34) * rankScale;

      if (profile.sect === 'mad_demon') {
        const yMain = comboSide * 3;
        drawClenchedFist(
          ctx,
          fistReach * 0.85,
          yMain,
          0.94 * rankScale,
          '#fda4af',
          '#e11d48',
          '#44403c',
        );
        for (let k = -1; k <= 1; k++) {
          const yOff = k * 9;
          ctx.beginPath();
          ctx.moveTo(6, yOff - 4 * comboSide);
          ctx.quadraticCurveTo(fistReach * 0.72, yOff, fistReach + 14, yOff + 5 * comboSide);
          ctx.lineCap = 'round';
          ctx.lineWidth = 5.5;
          ctx.strokeStyle = PIXEL_OUTLINE;
          ctx.stroke();
          ctx.lineWidth = 2.8;
          ctx.strokeStyle = k === 0 ? '#fde047' : '#e11d48';
          ctx.stroke();
        }
      } else {
        const isShaolin = profile.sect === 'shaolin';
        const yOff = comboSide * 3.5;
        const knuckleCol = isShaolin ? '#fde047' : '#fda4af';
        const auraCol = isShaolin ? '#f59e0b' : '#db2777';
        const cuffCol = isShaolin ? '#c2410c' : '#312e81';

        ctx.beginPath();
        ctx.moveTo(2, yOff - 4.5);
        ctx.lineTo(Math.max(7, fistReach - 6), yOff - 8.5 * rankScale);
        ctx.lineTo(Math.max(7, fistReach - 6), yOff + 8.5 * rankScale);
        ctx.lineTo(2, yOff + 4.5);
        ctx.closePath();
        ctx.fillStyle = hexWithAlpha(auraCol, 0.36);
        ctx.fill();

        ctx.lineCap = 'round';
        for (let s = -1; s <= 1; s++) {
          const sy = yOff + s * 5;
          ctx.beginPath();
          ctx.moveTo(3 + Math.abs(s) * 4, sy);
          ctx.lineTo(Math.max(7, fistReach - 7), sy);
          ctx.lineWidth = s === 0 ? 3.2 : 2.1;
          ctx.strokeStyle = s === 0 ? '#ffffff' : profile.secondary;
          ctx.stroke();
        }

        const ringX = fistReach * 0.48;
        ctx.beginPath();
        ctx.ellipse(ringX, yOff, 4.6, 12 * rankScale, 0, 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.lineWidth = 1.7;
        ctx.strokeStyle = profile.secondary;
        ctx.stroke();

        if (isSkill && sp > 0.08) {
          drawClenchedFist(
            ctx,
            fistReach * 0.66,
            -yOff * 1.5,
            0.86 * rankScale,
            knuckleCol,
            auraCol,
            cuffCol,
          );
        }

        drawClenchedFist(
          ctx,
          fistReach,
          yOff,
          (isSkill ? 1.15 : 1.0) * rankScale,
          knuckleCol,
          auraCol,
          cuffCol,
        );

        if (sp >= 0.14 && sp <= 0.72) {
          const tipX = fistReach + 8.5 * rankScale;
          ctx.beginPath();
          ctx.arc(fistReach + 2, yOff, 12.5 * rankScale, -Math.PI * 0.36, Math.PI * 0.36);
          ctx.lineWidth = 4.4;
          ctx.strokeStyle = PIXEL_OUTLINE;
          ctx.stroke();
          ctx.lineWidth = 2.3;
          ctx.strokeStyle = isSkill ? '#ffffff' : profile.secondary;
          ctx.stroke();

          const sparkR = (isSkill ? 8.5 : 6) * rankScale;
          ctx.beginPath();
          ctx.moveTo(tipX - sparkR, yOff);
          ctx.lineTo(tipX + sparkR, yOff);
          ctx.moveTo(tipX, yOff - sparkR);
          ctx.lineTo(tipX, yOff + sparkR);
          ctx.lineWidth = 2.1;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        }
      }
    } else if (style === 'dagger_hidden') {
      // === 사천당문 쌍독비수·암기 투척 (Twin Poison Daggers + 3-Kunai Fan Volley) ===
      const whipR = 34 * rankScale;
      const a0 = -0.88 * comboSide;
      const a1 = a0 + 1.76 * easeOutCubic(Math.min(1, sp * 1.55)) * comboSide;
      ctx.beginPath();
      ctx.arc(0, 0, whipR, a0, a1, a1 < a0);
      ctx.lineCap = 'round';
      ctx.lineWidth = 5.6;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();
      ctx.lineWidth = 2.8;
      ctx.strokeStyle = profile.primary;
      ctx.stroke();

      // Three diamond-bladed throwing kunai fanning outward
      const kunaiCount = isSkill ? 5 : 3;
      const kMid = (kunaiCount - 1) * 0.5;
      for (let d = 0; d < kunaiCount; d++) {
        const da = (d - kMid) * 0.24;
        const dDist = (10 + easeOutQuad(Math.min(1, sp * 1.4)) * 20) * rankScale;
        ctx.save();
        ctx.rotate(da);
        ctx.translate(dDist, 0);

        ctx.beginPath();
        ctx.moveTo(-4 * rankScale, 0);
        ctx.lineTo(2 * rankScale, -3.2 * rankScale);
        ctx.lineTo(12 * rankScale, 0);
        ctx.lineTo(2 * rankScale, 3.2 * rankScale);
        ctx.closePath();
        ctx.fillStyle = d === Math.round(kMid) ? '#ffffff' : profile.primary;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();

        // Kunai ring pommel
        ctx.beginPath();
        ctx.arc(-5.5 * rankScale, 0, 2 * rankScale, 0, Math.PI * 2);
        ctx.strokeStyle = profile.secondary;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.restore();
      }
    } else if (style === 'staff_gourd') {
      // === 독수약왕 독호리병 기울이기 & 만독연무 분사 (Calabash Poison Gourd Uncorking) ===
      const pourT = easeOutCubic(Math.min(1, sp * 1.55));
      const mistReach = (18 + pourT * 28) * rankScale;

      // 1. Billowing toxic mist cone uncorking toward the target
      ctx.beginPath();
      ctx.moveTo(8 * rankScale, -3 * rankScale);
      ctx.lineTo(mistReach, -13 * rankScale);
      ctx.arc(mistReach, 0, 13 * rankScale, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.lineTo(8 * rankScale, 3 * rankScale);
      ctx.closePath();
      ctx.fillStyle = hexWithAlpha(profile.primary, 0.36);
      ctx.fill();

      // 2. Tilting Emerald Double-Bulb Calabash Gourd (독호리병) with crimson waist ribbon
      ctx.save();
      ctx.translate(2 * rankScale, -2 * rankScale);
      ctx.rotate(0.32 * pourT);

      // Rear larger gourd bulb
      ctx.beginPath();
      ctx.arc(-4.5 * rankScale, 0, 6.8 * rankScale, 0, Math.PI * 2);
      ctx.fillStyle = '#16a34a';
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();

      // Front upper gourd bulb
      ctx.beginPath();
      ctx.arc(4 * rankScale, 0, 4.8 * rankScale, 0, Math.PI * 2);
      ctx.fillStyle = profile.primary;
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();

      // Spout mouth
      ctx.beginPath();
      ctx.roundRect(7.5 * rankScale, -2.2 * rankScale, 4 * rankScale, 4.4 * rankScale, 1.4);
      ctx.fillStyle = '#fde047';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();

      // Crimson silk waist cord at gourd constriction
      ctx.beginPath();
      ctx.moveTo(0.2 * rankScale, -4.6 * rankScale);
      ctx.lineTo(0.2 * rankScale, 4.6 * rankScale);
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = '#ef4444';
      ctx.stroke();

      ctx.restore();

      // 3. Bubbling emerald & violet poison globes drifting out of the gourd mouth
      const bubbleCount = isSkill ? 5 : 3;
      for (let b = 0; b < bubbleCount; b++) {
        const bx = (13 + pourT * (10 + b * 6.5)) * rankScale;
        const by = ((b % 2 === 0 ? -1 : 1) * (2.5 + b * 2.2) * pourT) * rankScale;
        const br = (isSkill ? 4.4 : 3.5) * rankScale - b * 0.35;
        ctx.beginPath();
        ctx.arc(bx, by, Math.max(2, br), 0, Math.PI * 2);
        ctx.fillStyle = b % 2 === 0 ? profile.primary : profile.secondary;
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
      }
    } else {
      // === sorcery_qi: 마교 해골장 혈마구 & 염마 양수 마염화구 (Demonic Rune Circle & Hellfire Orbs) ===
      const castR = (16 + easeOutCubic(sp) * 12) * rankScale;
      const orbX = 11 * rankScale;

      // 1. Rotating demonic rune circle + inner triangle/hexagram
      ctx.beginPath();
      ctx.arc(orbX, 0, castR, sp * 4.2, sp * 4.2 + Math.PI * 1.55);
      ctx.lineCap = 'round';
      ctx.lineWidth = 5.4;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();
      ctx.lineWidth = 2.8;
      ctx.strokeStyle = profile.primary;
      ctx.stroke();

      ctx.save();
      ctx.translate(orbX, 0);
      ctx.rotate(-sp * 3.6);
      for (let tri = 0; tri < 2; tri++) {
        ctx.beginPath();
        for (let v = 0; v < 3; v++) {
          const va = tri * (Math.PI / 3) + (v * Math.PI * 2) / 3;
          const vx = Math.cos(va) * castR * 0.76;
          const vy = Math.sin(va) * castR * 0.76;
          if (v === 0) ctx.moveTo(vx, vy);
          else ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = profile.secondary;
        ctx.stroke();
      }
      ctx.restore();

      // 2. Pulsing obsidian-crimson/hellfire core orb (twin orbiting orbs for flame_demon!)
      if (profile.dualWield) {
        for (let side = -1; side <= 1; side += 2) {
          const oyOff = Math.sin(sp * Math.PI * 2 + side) * 6.5 * rankScale;
          ctx.beginPath();
          ctx.arc(orbX + side * 3, oyOff, castR * 0.36, 0, Math.PI * 2);
          ctx.fillStyle = side > 0 ? profile.primary : profile.secondary;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = PIXEL_OUTLINE;
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.arc(orbX, 0, castR * 0.46, 0, Math.PI * 2);
        ctx.fillStyle = profile.secondary;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(orbX, 0, castR * 0.24, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    }

    ctx.restore();
    ctx.globalAlpha = prevAlpha;
  }

  /**
   * Weapon-accurate & sect-distinct flying projectiles for all 32 Murim heroes!
   */
  private collectProjectiles(sim: Simulation, alpha: number, simTimeSec: number): void {
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
          const skin = this.equippedHeroSkins.get(p.unitId);
          const baseProfile = getUnitCombatProfile(p.unitId);
          const cMain = skin ? skin.primaryColor : baseProfile.primary;
          const cSub = skin ? skin.secondaryColor : baseProfile.secondary;
          const scale = p.isSkill ? 1.36 : p.isCrit ? 1.15 : 1;

          ctx.save();
          ctx.translate(x, y);

          if (p.isSkill || p.isCrit) {
            const gR = p.isSkill ? 18 : 13;
            const pGlow = this.sprites.glow(p.isCrit ? '#fde047' : cMain, gR);
            const prevA = ctx.globalAlpha;
            ctx.globalAlpha = prevA * (p.isSkill ? 0.52 : 0.36);
            ctx.drawImage(pGlow, -gR, -gR, gR * 2, gR * 2);
            ctx.globalAlpha = prevA;
          }

          switch (baseProfile.style) {
            case 'fan': {
              // Gliding Unfolded War-Fan Wave + 3 Needles (만독철선 / 북해 빙련선)!
              const isIceFan = baseProfile.sect === 'mudang';
              ctx.rotate(ang);
              const fr = 11.5 * scale;
              ctx.beginPath();
              ctx.arc(-4 * scale, 0, fr, -0.78, 0.78);
              ctx.lineTo(-4 * scale, 0);
              ctx.closePath();
              ctx.fillStyle = isIceFan ? '#0c4a6e' : '#4c1d95';
              ctx.fill();

              ctx.beginPath();
              ctx.arc(-4 * scale, 0, fr, -0.78, 0.78);
              ctx.arc(-4 * scale, 0, fr * 0.52, 0.78, -0.78, true);
              ctx.closePath();
              ctx.fillStyle = cMain;
              ctx.fill();
              ctx.lineWidth = 2.2;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();

              // 5 crisp miniature fan ribs + 3 leading needles
              for (let rIdx = -2; rIdx <= 2; rIdx++) {
                const ra = rIdx * 0.36;
                ctx.beginPath();
                ctx.moveTo(-4 * scale, 0);
                ctx.lineTo(-4 * scale + Math.cos(ra) * fr, Math.sin(ra) * fr);
                ctx.lineWidth = 1.3;
                ctx.strokeStyle = isIceFan ? '#e0f2fe' : '#fde047';
                ctx.stroke();

                if (Math.abs(rIdx) <= 1) {
                  const n0 = fr + 1.5 * scale;
                  const n1 = fr + 7.5 * scale;
                  ctx.beginPath();
                  ctx.moveTo(-4 * scale + Math.cos(ra) * n0, Math.sin(ra) * n0);
                  ctx.lineTo(-4 * scale + Math.cos(ra) * n1, Math.sin(ra) * n1);
                  ctx.lineWidth = 2.4;
                  ctx.strokeStyle = rIdx === 0 ? '#ffffff' : cSub;
                  ctx.stroke();
                }
              }
              break;
            }

            case 'dagger_hidden': {
              // Point-forward Poison Kunai + trailing shadow blade
              ctx.rotate(ang);
              ctx.beginPath();
              ctx.moveTo(-13 * scale, 0);
              ctx.lineTo(-2 * scale, 0);
              ctx.lineCap = 'round';
              ctx.lineWidth = 4.5 * scale;
              ctx.strokeStyle = hexWithAlpha(cSub, 0.55);
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(-4 * scale, 0);
              ctx.lineTo(1.5 * scale, -3.6 * scale);
              ctx.lineTo(11 * scale, 0);
              ctx.lineTo(1.5 * scale, 3.6 * scale);
              ctx.closePath();
              ctx.fillStyle = cMain;
              ctx.fill();
              ctx.lineWidth = 2.2;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();

              ctx.beginPath();
              ctx.arc(-6 * scale, 0, 2.2 * scale, 0, Math.PI * 2);
              ctx.lineWidth = 1.8;
              ctx.strokeStyle = cSub;
              ctx.stroke();
              break;
            }

            case 'staff_gourd': {
              // Bubbling Calabash Venom Globe + trailing toxic droplets
              ctx.rotate(ang);
              ctx.beginPath();
              ctx.arc(-8 * scale, -2.5 * scale, 2.8 * scale, 0, Math.PI * 2);
              ctx.arc(-12 * scale, 2 * scale, 2 * scale, 0, Math.PI * 2);
              ctx.fillStyle = cSub;
              ctx.fill();

              ctx.beginPath();
              ctx.arc(1 * scale, 0, 6.2 * scale, 0, Math.PI * 2);
              ctx.fillStyle = cMain;
              ctx.fill();
              ctx.lineWidth = 2.4;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();

              ctx.beginPath();
              ctx.arc(-1 * scale, -2 * scale, 2.2 * scale, 0, Math.PI * 2);
              ctx.fillStyle = '#ffffff';
              ctx.fill();
              break;
            }

            case 'flying_sword': {
              // Miniature Levitating Spirit Sword (어검 비검) flying point-first!
              ctx.rotate(ang);
              ctx.beginPath();
              ctx.moveTo(-18 * scale, 0);
              ctx.lineTo(-4 * scale, 0);
              ctx.lineCap = 'round';
              ctx.lineWidth = 5 * scale;
              ctx.strokeStyle = hexWithAlpha(cMain, 0.52);
              ctx.stroke();

              // Gold crossguard + pommel
              ctx.beginPath();
              ctx.moveTo(-3 * scale, -4.8 * scale);
              ctx.lineTo(-3 * scale, 4.8 * scale);
              ctx.moveTo(-7.5 * scale, 0);
              ctx.lineTo(-3 * scale, 0);
              ctx.lineWidth = 3.2;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.lineWidth = 1.8;
              ctx.strokeStyle = '#facc15';
              ctx.stroke();

              // Glowing spirit blade
              ctx.beginPath();
              ctx.moveTo(-2.5 * scale, -2.4 * scale);
              ctx.lineTo(8 * scale, -1.7 * scale);
              ctx.lineTo(13.5 * scale, 0);
              ctx.lineTo(8 * scale, 1.7 * scale);
              ctx.lineTo(-2.5 * scale, 2.4 * scale);
              ctx.closePath();
              ctx.fillStyle = p.isSkill ? cSub : cMain;
              ctx.fill();
              ctx.lineWidth = 2.1;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(-1 * scale, 0);
              ctx.lineTo(10 * scale, 0);
              ctx.lineWidth = 1.2;
              ctx.strokeStyle = '#ffffff';
              ctx.stroke();
              break;
            }

            case 'dual_sword': {
              // Twin Crossed X-Blade Qi Crescents!
              ctx.rotate(ang);
              const r = 10 * scale;
              for (let k = -1; k <= 1; k += 2) {
                ctx.save();
                ctx.rotate(k * 0.28);
                ctx.beginPath();
                ctx.arc(-2, 0, r, -Math.PI * 0.4, Math.PI * 0.4);
                ctx.lineCap = 'round';
                ctx.lineWidth = 6.2 * scale;
                ctx.strokeStyle = PIXEL_OUTLINE;
                ctx.stroke();
                ctx.lineWidth = 3.2 * scale;
                ctx.strokeStyle = k < 0 ? cMain : cSub;
                ctx.stroke();
                ctx.restore();
              }
              break;
            }

            case 'spear_staff': {
              // Piercing Polearm Lance + Sonic Wind Ring
              ctx.rotate(ang);
              ctx.beginPath();
              ctx.moveTo(-15 * scale, 0);
              ctx.lineTo(11 * scale, 0);
              ctx.lineCap = 'round';
              ctx.lineWidth = 6.6 * scale;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.lineWidth = 3.6 * scale;
              ctx.strokeStyle = cMain;
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(4 * scale, -4 * scale);
              ctx.lineTo(13 * scale, 0);
              ctx.lineTo(4 * scale, 4 * scale);
              ctx.closePath();
              ctx.fillStyle = '#ffffff';
              ctx.fill();
              ctx.lineWidth = 1.8;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();

              ctx.beginPath();
              ctx.ellipse(-2 * scale, 0, 2.8 * scale, 7.2 * scale, 0, 0, Math.PI * 2);
              ctx.lineWidth = 1.8;
              ctx.strokeStyle = cSub;
              ctx.stroke();
              break;
            }

            case 'palm_fist': {
              ctx.rotate(ang);
              if (baseProfile.sect === 'mad_demon') {
                // Triple Crimson Blood-Claw Wave (광마혈조파)
                for (let k = -1; k <= 1; k++) {
                  const yOff = k * 4.5 * scale;
                  ctx.beginPath();
                  ctx.moveTo(-9 * scale, yOff);
                  ctx.quadraticCurveTo(0, yOff, 9 * scale, yOff * 0.85);
                  ctx.lineCap = 'round';
                  ctx.lineWidth = 4.6 * scale;
                  ctx.strokeStyle = PIXEL_OUTLINE;
                  ctx.stroke();
                  ctx.lineWidth = 2.3 * scale;
                  ctx.strokeStyle = k === 0 ? cSub : cMain;
                  ctx.stroke();
                }
              } else {
                // Flying Vajra / Black-Flame Qi Fist (금강권강 · 흑염권강)!
                const isShaolin = baseProfile.sect === 'shaolin';
                ctx.beginPath();
                ctx.moveTo(-14 * scale, 0);
                ctx.lineTo(0, 0);
                ctx.lineCap = 'round';
                ctx.lineWidth = 8 * scale;
                ctx.strokeStyle = hexWithAlpha(cMain, 0.52);
                ctx.stroke();
                drawClenchedFist(
                  ctx,
                  2 * scale,
                  0,
                  0.76 * scale,
                  skin ? cSub : isShaolin ? '#fbbf24' : '#fda4af',
                  cMain,
                  isShaolin ? '#c2410c' : '#312e81',
                );
              }
              break;
            }

            case 'saber': {
              // Heavy Curved Dadao Saber Cleave Wave (패도참기)!
              ctx.rotate(ang);
              const r = 12 * scale;
              ctx.beginPath();
              ctx.arc(-3, 0, r, -Math.PI * 0.48, Math.PI * 0.48);
              ctx.quadraticCurveTo(
                r * 0.2,
                0,
                Math.cos(-Math.PI * 0.48) * r - 3,
                Math.sin(-Math.PI * 0.48) * r,
              );
              ctx.closePath();
              ctx.fillStyle = cMain;
              ctx.fill();
              ctx.lineWidth = 2.6;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();

              ctx.beginPath();
              ctx.arc(-3, 0, r - 1.8, -Math.PI * 0.44, Math.PI * 0.44);
              ctx.lineWidth = 2;
              ctx.strokeStyle = p.isSkill ? '#ffffff' : cSub;
              ctx.stroke();
              break;
            }

            case 'sorcery_qi': {
              // Swirling Obsidian-Crimson & Violet Hellfire / Blood-Sorcery Orb!
              ctx.rotate(ang);
              ctx.beginPath();
              ctx.moveTo(-14 * scale, 0);
              ctx.lineTo(3 * scale, 0);
              ctx.lineCap = 'round';
              ctx.lineWidth = 7 * scale;
              ctx.strokeStyle = cSub;
              ctx.stroke();

              ctx.beginPath();
              ctx.arc(2 * scale, 0, 6.4 * scale, 0, Math.PI * 2);
              ctx.fillStyle = PIXEL_OUTLINE;
              ctx.fill();
              ctx.beginPath();
              ctx.arc(2 * scale, 0, 4.6 * scale, 0, Math.PI * 2);
              ctx.fillStyle = cMain;
              ctx.fill();
              ctx.beginPath();
              ctx.arc(3 * scale, -1, 2 * scale, 0, Math.PI * 2);
              ctx.fillStyle = '#fde047';
              ctx.fill();
              break;
            }

            case 'sword':
            default: {
              if (baseProfile.sect === 'mudang') {
                // Cyan Taiji sword-ray + spinning Yin-Yang orb core
                ctx.rotate(ang);
                ctx.beginPath();
                ctx.moveTo(-16 * scale, 0);
                ctx.lineTo(7 * scale, 0);
                ctx.lineCap = 'round';
                ctx.lineWidth = 6.8 * scale;
                ctx.strokeStyle = PIXEL_OUTLINE;
                ctx.stroke();
                ctx.lineWidth = 3.6 * scale;
                ctx.strokeStyle = skin ? cMain : '#38bdf8';
                ctx.stroke();

                ctx.rotate(simTimeSec * 14 + p.id);
                ctx.beginPath();
                ctx.arc(0, 0, 5 * scale, 0, Math.PI * 2);
                ctx.fillStyle = skin ? cSub : '#ffffff';
                ctx.fill();
                ctx.beginPath();
                ctx.arc(0, 0, 5 * scale, 0, Math.PI);
                ctx.fillStyle = PIXEL_OUTLINE;
                ctx.fill();
                ctx.lineWidth = 1.6;
                ctx.strokeStyle = cMain;
                ctx.stroke();
              } else if (baseProfile.sect === 'namgung') {
                // Crackling imperial azure-gold lightning sword-lance
                ctx.rotate(ang);
                ctx.beginPath();
                ctx.moveTo(-18 * scale, 0);
                ctx.lineTo(-9 * scale, -4 * scale);
                ctx.lineTo(-2 * scale, 3.5 * scale);
                ctx.lineTo(9 * scale, 0);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.lineWidth = 7.4 * scale;
                ctx.strokeStyle = PIXEL_OUTLINE;
                ctx.stroke();
                ctx.lineWidth = 4 * scale;
                ctx.strokeStyle = cMain;
                ctx.stroke();
                ctx.lineWidth = 1.8 * scale;
                ctx.strokeStyle = skin ? cSub : '#fef08a';
                ctx.stroke();
              } else if (baseProfile.sect === 'hwasan') {
                // Mount Hua crescent sword-qi + trailing plum petal
                ctx.rotate(ang);
                const r = 11 * scale;
                ctx.beginPath();
                ctx.arc(-2, 0, r, -Math.PI * 0.44, Math.PI * 0.44);
                ctx.quadraticCurveTo(
                  r * 0.35,
                  0,
                  Math.cos(-Math.PI * 0.44) * r - 2,
                  Math.sin(-Math.PI * 0.44) * r,
                );
                ctx.closePath();
                ctx.fillStyle = skin ? cMain : p.isSkill ? '#f43f5e' : cMain;
                ctx.fill();
                ctx.lineWidth = 2.4;
                ctx.strokeStyle = PIXEL_OUTLINE;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(-11 * scale, 0, 2.8 * scale, 0, Math.PI * 2);
                ctx.fillStyle = skin ? cSub : '#fda4af';
                ctx.fill();
              } else if (baseProfile.sect === 'haomun') {
                // Quick-draw silver Iai sword flash
                ctx.rotate(ang);
                const r = 11 * scale;
                ctx.beginPath();
                ctx.arc(-2, 0, r, -Math.PI * 0.42, Math.PI * 0.42);
                ctx.lineCap = 'round';
                ctx.lineWidth = 6.8 * scale;
                ctx.strokeStyle = PIXEL_OUTLINE;
                ctx.stroke();
                ctx.lineWidth = 3.4 * scale;
                ctx.strokeStyle = skin ? cMain : '#e2e8f0';
                ctx.stroke();
                ctx.lineWidth = 1.5 * scale;
                ctx.strokeStyle = '#ffffff';
                ctx.stroke();
              } else {
                // Heavenly Demon black-crimson thunder sword-qi (천마흑뢰검기)
                ctx.rotate(ang);
                const r = 12 * scale;
                ctx.beginPath();
                ctx.arc(-3, 0, r, -Math.PI * 0.48, Math.PI * 0.48);
                ctx.lineCap = 'round';
                ctx.lineWidth = 8.2 * scale;
                ctx.strokeStyle = PIXEL_OUTLINE;
                ctx.stroke();
                ctx.lineWidth = 4.2 * scale;
                ctx.strokeStyle = cMain;
                ctx.stroke();
                ctx.lineWidth = 1.6 * scale;
                ctx.strokeStyle = p.isSkill ? '#fde047' : cSub;
                ctx.stroke();
              }
              break;
            }
          }

          ctx.restore();
        }
      },
    });
  }
}

/**
 * Draws a crisp cel-shaded clenched martial fist (정권 주먹) oriented along +X:
 * wrist cuff + clenched 4-knuckle head + tucked thumb + blazing qi halo.
 */
function drawClenchedFist(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  fistScale: number,
  knuckleColor: string,
  auraColor: string,
  cuffColor: string,
): void {
  const s = fistScale;
  ctx.save();
  ctx.translate(cx, cy);

  // 1. Blazing qi aura wrapping the fist
  ctx.beginPath();
  ctx.ellipse(0.5 * s, 0, 11.5 * s, 10.5 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = hexWithAlpha(auraColor, 0.45);
  ctx.fill();

  // 2. Forearm cuff / monk sleeve band
  ctx.beginPath();
  ctx.roundRect(-12.5 * s, -5.4 * s, 7.5 * s, 10.8 * s, 2.5 * s);
  ctx.fillStyle = cuffColor;
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = PIXEL_OUTLINE;
  ctx.stroke();

  // 3. Clenched 4-knuckle fist block
  ctx.beginPath();
  ctx.roundRect(-6.2 * s, -7.8 * s, 13.8 * s, 15.6 * s, [3 * s, 5.2 * s, 5.2 * s, 3 * s]);
  ctx.fillStyle = knuckleColor;
  ctx.fill();
  ctx.lineWidth = 2.7;
  ctx.strokeStyle = PIXEL_OUTLINE;
  ctx.stroke();

  // 4. Top specular knuckle highlight
  ctx.beginPath();
  ctx.roundRect(-3.8 * s, -5.8 * s, 8.8 * s, 3.6 * s, 1.8 * s);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.fill();

  // 5. Three crisp finger-knuckle creases along front face
  ctx.beginPath();
  for (let k = -1; k <= 1; k++) {
    const ky = k * 3.8 * s;
    ctx.moveTo(2.4 * s, ky);
    ctx.lineTo(6.6 * s, ky);
  }
  ctx.lineWidth = 1.7;
  ctx.strokeStyle = PIXEL_OUTLINE;
  ctx.stroke();

  // 6. Tucked martial thumb locked across lower palm
  ctx.beginPath();
  ctx.roundRect(-4.6 * s, 2.2 * s, 8.2 * s, 4.6 * s, 2.2 * s);
  ctx.fillStyle = knuckleColor;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PIXEL_OUTLINE;
  ctx.stroke();

  ctx.restore();
}

function easeOutQuad(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 1 - (1 - c) * (1 - c);
}

function easeOutCubic(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  const inv = 1 - c;
  return 1 - inv * inv * inv;
}

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}
