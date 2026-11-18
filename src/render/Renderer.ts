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

/**
 * Crisp nearest-neighbor sprite sizes (~110% of tile width) and foot offsets from slot center.
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

type WeaponMotionStyle =
  | 'sword'
  | 'saber'
  | 'spear_staff'
  | 'palm_fist'
  | 'dagger_hidden'
  | 'sorcery_qi';

type SectVisualId =
  | 'hwasan'
  | 'mudang'
  | 'shaolin'
  | 'namgung'
  | 'gaebang'
  | 'tang_poison'
  | 'sapa_blade'
  | 'haomun'
  | 'mad_demon'
  | 'magyo_sword'
  | 'magyo_flame'
  | 'magyo_bone';

interface UnitCombatProfile {
  readonly style: WeaponMotionStyle;
  readonly sect: SectVisualId;
  readonly primary: string;
  readonly secondary: string;
  readonly dualWield?: boolean;
}

const DEFAULT_PROFILE: UnitCombatProfile = {
  style: 'sword',
  sect: 'hwasan',
  primary: '#fb7185',
  secondary: '#ffe4e6',
};

/**
 * Bespoke martial weapon & sect visual profile for all 32 units in `units.json`.
 * Drives multi-phase weapon-swing choreography, blade/staff/palm smears, and sect projectiles.
 */
const UNIT_COMBAT_PROFILES: Readonly<Record<string, UnitCombatProfile>> = {
  // 구파일방 · 정파 (화산파 매화검)
  hwasan_novice: { style: 'sword', sect: 'hwasan', primary: '#fb7185', secondary: '#ffe4e6' },
  plum_swordsman: { style: 'sword', sect: 'hwasan', primary: '#f43f5e', secondary: '#fda4af' },
  plum_elder: { style: 'sword', sect: 'hwasan', primary: '#e11d48', secondary: '#fbcfe8' },
  hwasan_master: { style: 'sword', sect: 'hwasan', primary: '#c026d3', secondary: '#f9a8d4' },
  sword_saint: {
    style: 'sword',
    sect: 'hwasan',
    primary: '#38bdf8',
    secondary: '#f472b6',
    dualWield: true,
  },
  sword_immortal: {
    style: 'sword',
    sect: 'namgung',
    primary: '#38bdf8',
    secondary: '#fde047',
    dualWield: true,
  },

  // 구파일방 · 정파 (무당파 태극검)
  mudang_disciple: { style: 'sword', sect: 'mudang', primary: '#06b6d4', secondary: '#e0f2fe' },
  mudang_master: { style: 'sword', sect: 'mudang', primary: '#0284c7', secondary: '#bae6fd' },

  // 구파일방 · 정파 (소림사 나한권·금강권 정권 지르기)
  shaolin_novice: { style: 'palm_fist', sect: 'shaolin', primary: '#f59e0b', secondary: '#fef08a' },
  shaolin_monk: { style: 'palm_fist', sect: 'shaolin', primary: '#fbbf24', secondary: '#fffbeb' },

  // 구파일방 · 정파 (남궁세가 & 무림맹 뇌전패검)
  namgung_thunder: { style: 'sword', sect: 'namgung', primary: '#0284c7', secondary: '#fde047' },
  murim_lord: { style: 'sword', sect: 'namgung', primary: '#eab308', secondary: '#7dd3fc' },

  // 구파일방 · 정파 (개방 타구봉 & 청옥쌍도)
  gaebang_beggar: { style: 'spear_staff', sect: 'gaebang', primary: '#16a34a', secondary: '#bbf7d0' },
  gaebang_elder: {
    style: 'dagger_hidden',
    sect: 'gaebang',
    primary: '#10b981',
    secondary: '#fde047',
    dualWield: true,
  },

  // 사파 (사천당문 & 독수약왕 암기·맹독)
  tang_assassin: {
    style: 'dagger_hidden',
    sect: 'tang_poison',
    primary: '#22c55e',
    secondary: '#a855f7',
  },
  poison_healer: {
    style: 'dagger_hidden',
    sect: 'tang_poison',
    primary: '#4ade80',
    secondary: '#c084fc',
  },
  tang_patriarch: {
    style: 'dagger_hidden',
    sect: 'tang_poison',
    primary: '#16a34a',
    secondary: '#d8b4fe',
  },

  // 사파 (녹림·하오문·혈도문·광마 패도 & 혈조)
  nokrim_bandit: { style: 'saber', sect: 'sapa_blade', primary: '#ea580c', secondary: '#fed7aa' },
  nokrim_chief: { style: 'saber', sect: 'sapa_blade', primary: '#dc2626', secondary: '#fde047' },
  haomun_ronin: { style: 'sword', sect: 'haomun', primary: '#64748b', secondary: '#f8fafc' },
  blood_blade: { style: 'saber', sect: 'sapa_blade', primary: '#e11d48', secondary: '#fecdd3' },
  blood_demon: { style: 'saber', sect: 'sapa_blade', primary: '#be123c', secondary: '#fda4af' },
  mad_demon: { style: 'palm_fist', sect: 'mad_demon', primary: '#e11d48', secondary: '#fde047' },
  asura_emperor: {
    style: 'saber',
    sect: 'sapa_blade',
    primary: '#e11d48',
    secondary: '#4ade80',
    dualWield: true,
  },

  // 천마신교 · 마교 (흑살도·백골창·흑풍쌍검·마염·천마검)
  cult_initiate: { style: 'saber', sect: 'magyo_sword', primary: '#be123c', secondary: '#fda4af' },
  bone_fiend: { style: 'spear_staff', sect: 'magyo_bone', primary: '#a855f7', secondary: '#f43f5e' },
  black_wind: {
    style: 'sword',
    sect: 'magyo_sword',
    primary: '#e11d48',
    secondary: '#cbd5e1',
    dualWield: true,
  },
  cult_protector: { style: 'palm_fist', sect: 'magyo_flame', primary: '#db2777', secondary: '#a855f7' },
  cult_elder: { style: 'sorcery_qi', sect: 'magyo_flame', primary: '#dc2626', secondary: '#c084fc' },
  sword_demon: {
    style: 'sword',
    sect: 'magyo_sword',
    primary: '#9f1239',
    secondary: '#f43f5e',
    dualWield: true,
  },
  flame_demon: { style: 'sorcery_qi', sect: 'magyo_flame', primary: '#ea580c', secondary: '#a855f7' },
  cheonma: { style: 'sword', sect: 'magyo_sword', primary: '#e11d48', secondary: '#fde047' },
};

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

    // 1. Collect slot selection / range circle / drop highlights
    this.collectBoardOverlays(sim, interaction, simTimeSec);

    // 2. Collect living Wuxia sanctuary atmosphere (lantern candlelight, incense wisps, drifting petals)
    this.collectAmbientMurimWorld(simTimeSec);

    // 3. Collect Monsters + Shadows + Hit Squash/Flash + Rounded HP bars
    this.collectMonsters(sim, tick, alpha);

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
    simTimeSec: number,
  ): void {
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
        this.buckets[RenderLayer.GroundFx]!.push({
          layer: RenderLayer.GroundFx,
          sortY: 195,
          render: (ctx) => {
            const pulse = 0.72 + Math.sin(simTimeSec * 6.5) * 0.28;
            for (let k = 0; k < neighbors.length; k++) {
              const nRect = expandedSlotRect(sim.board, { area: 'field', index: neighbors[k]! });
              ctx.beginPath();
              ctx.roundRect(nRect.x + 1, nRect.y + 1, nRect.w - 2, nRect.h - 2, 10);
              ctx.fillStyle = `rgba(16, 185, 129, ${(0.2 * pulse).toFixed(3)})`;
              ctx.fill();
              ctx.lineWidth = 4;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.lineWidth = 2.2;
              ctx.strokeStyle = '#34d399';
              ctx.stroke();
            }
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
      const isArmorShredded = currentTick < m.shredExpireTick && m.armorShred > 0;
      const isArmorBroken = isArmorShredded && m.armor - m.armorShred < 0;
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

      if (m.isBoss || m.hp < m.maxHp || isStunned || isArmorShredded) {
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
              ctx.roundRect(bx + 1, by + 1, Math.max(2, barW * ratio - 2), barH * 0.36, 99);
              ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
              ctx.fill();
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
      const baseProfile = UNIT_COMBAT_PROFILES[u.unitId] ?? DEFAULT_PROFILE;
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
      const spriteSize = Math.round((isField ? FIELD_SPRITE : BENCH_SPRITE) * popScale);
      const breath = Math.sin(simTimeSec * 3.4 + u.uid * 0.87);

      // Multi-phase smooth martial weapon swing choreography (NO rigid shoulder-checking!)
      const atkDurSec = Math.min(0.34, Math.max(0.24, def.attackIntervalTicks * TICK_DT * 0.74));
      const atkElapsedSec = (currentTick + alpha - u.lastAttackTick) * TICK_DT;
      const isAttacking = isField && atkElapsedSec >= 0 && atkElapsedSec < atkDurSec;
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
        const windUpTilt = isFist ? -0.04 : style === 'sorcery_qi' ? -0.08 : -0.18;
        const peakTilt =
          style === 'saber'
            ? 0.3
            : style === 'sword'
              ? comboSide > 0
                ? 0.25
                : 0.18
              : style === 'spear_staff'
                ? 0.09
                : isFist
                  ? 0.03 // Upright horse-stance spine (마보충권) — zero headbutt!
                  : style === 'dagger_hidden'
                    ? 0.16
                    : 0.06;

        let stepDist = 0;
        if (atkP < 0.22) {
          // Phase 1: Wind-up chamber (sink into horse stance / pull weapon back)
          const t = easeOutQuad(atkP / 0.22);
          stepDist = (isFist ? -2.2 : -3.2) * t;
          bodyTilt = windUpTilt * t;
          animScaleX = 1 + (isFist ? 0.068 : 0.055) * t;
          animScaleY = 1 - (isFist ? 0.075 : 0.062) * t;
          hopY = isFist ? 0 : style === 'sorcery_qi' ? 4.5 * t : isSkillStrike ? 2.2 * t : 0;
        } else if (atkP < 0.5) {
          // Phase 2: Explosive straight punch thrust / rotational blade cleave
          const t = easeOutCubic((atkP - 0.22) / 0.28);
          stepDist = isFist ? -2.2 + 6.0 * t : -3.2 + 7.8 * t;
          bodyTilt = windUpTilt + (peakTilt - windUpTilt) * t;
          const reachX = isFist ? 0.06 : style === 'spear_staff' ? 0.075 : 0.045;
          animScaleX = (isFist ? 1.068 : 1.055) - 0.03 * t + reachX * t;
          animScaleY = isFist
            ? 0.925 + 0.055 * t
            : 0.938 + (comboSide < 0 && style === 'sword' ? 0.11 * t : 0.045 * t);
          hopY = isFist
            ? 0
            : style === 'sorcery_qi'
              ? 4.5 + 4.5 * t
              : style === 'dagger_hidden'
                ? Math.sin(t * Math.PI) * 6.5
                : (isSkillStrike ? 5.0 : 2.2) * Math.sin(t * Math.PI);
        } else if (atkP < 0.7) {
          // Phase 3: Martial follow-through hold (잔심)
          const t = (atkP - 0.5) / 0.2;
          const holdFrom = isFist ? 3.8 : 4.6;
          stepDist = holdFrom - 1.4 * t;
          bodyTilt = peakTilt * (1 - 0.42 * t);
          animScaleX = (isFist ? 1.08 : 1.05) * (1 - 0.035 * t);
          animScaleY = isFist ? 0.98 : 0.99;
          hopY = style === 'sorcery_qi' ? 9 * (1 - 0.35 * t) : 0;
        } else {
          // Phase 4: Smooth recovery ease back into idle breathing stance
          const t = smoothstep((atkP - 0.7) / 0.3);
          const recFrom = isFist ? 2.4 : 3.2;
          stepDist = recFrom * (1 - t);
          bodyTilt = peakTilt * 0.58 * (1 - t);
          animScaleX = 1.02 + (1 - breath * 0.018 - 1.02) * t;
          animScaleY = 0.99 + (1 + breath * 0.024 - 0.99) * t;
          hopY = style === 'sorcery_qi' ? 5.8 * (1 - t) : 0;
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

      // 1. Faction-distinct martial formation ring under feet (정파 팔괘진 / 사파 혈독진 / 마교 천마혈진)
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
            equippedSkin?.primaryColor,
            equippedSkin?.secondaryColor,
          );
        },
      });

      // 2. Crisp ink drop shadow on white-jade courtyard
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
          ctx.translate(Math.round(drawX), Math.round(drawFootY - hopY));
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

      // 4. Weapon Blade / Staff / Palm / Dagger Swing Arc right at the hero!
      if (isAttacking && atkP >= 0.14 && atkP <= 0.84) {
        const swingProg = (atkP - 0.14) / 0.7;
        const aimAngle = Math.atan2(u.attackDirY, u.attackDirX);
        const swingOriginX = drawX + u.attackDirX * 6;
        const swingOriginY = drawFootY - hopY - spriteSize * 0.42 + u.attackDirY * 4;
        const rankScale = 0.92 + Math.min(5, grade.rank - 1) * 0.08 + (isSkillStrike ? 0.16 : 0);

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
              profile,
            );
          },
        });
      }

      // 5. Subtle floating sect aura motes on high-tier masters (절정 rank >= 4 or skinned hero)
      if (isField && (grade.rank >= 4 || equippedSkin !== null) && !isDraggedOrigin) {
        this.buckets[RenderLayer.AirFx]!.push({
          layer: RenderLayer.AirFx,
          sortY: drawY + 2,
          render: (ctx) => {
            const count = grade.rank >= 5 || equippedSkin ? 3 : 2;
            const prevA = ctx.globalAlpha;
            ctx.globalAlpha = prevA * 0.85;
            for (let m = 0; m < count; m++) {
              const orbit = simTimeSec * 2.6 + u.uid + (m * Math.PI * 2) / count;
              const ox = drawX + Math.cos(orbit) * 28;
              const oy =
                drawFootY - 34 + Math.sin(orbit * 1.5) * 12 - (grade.rank >= 5 ? 4 : 0);
              ctx.beginPath();
              ctx.arc(ox, oy, grade.rank >= 6 ? 3.6 : 2.8, 0, Math.PI * 2);
              ctx.fillStyle = m % 2 === 0 ? profile.primary : profile.secondary;
              ctx.fill();
              ctx.lineWidth = 1.2;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
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

      // 7. Drag Ghost (crisp nearest-neighbor)
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

  /**
   * Renders 3 distinct faction martial formations under each unit's feet:
   * - 정파 (orthodox): 8-sided Bagua octagon (팔괘 정종진) in celadon/azure/gold
   * - 사파 (unorthodox): 6-fang serrated blade ring (사파 만독혈진) in emerald/crimson
   * - 마교 (demonic): 8-spike obsidian-blood star seal (천마혈해대진)
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
    skinPrimary?: string,
    skinSecondary?: string,
  ): void {
    const pulse = 1 + Math.sin(simTimeSec * 3.8 + uid) * 0.06;
    const rx = (isField ? 31 : 28) * pulse;
    const ry = rx * 0.4;
    const rot = simTimeSec * (rank >= 5 ? 1.9 : 1.2);

    if (rank >= 4 || skinPrimary) {
      const glowColor =
        skinPrimary ??
        (faction === 'demonic' ? '#e11d48' : faction === 'unorthodox' ? '#22c55e' : gradeColor);
      const glow = this.sprites.glow(glowColor, 38);
      const prevA = ctx.globalAlpha;
      ctx.globalAlpha = rank >= 5 || skinPrimary ? 0.5 : 0.34;
      ctx.drawImage(glow, cx - 38, cy - 19, 76, 38);
      ctx.globalAlpha = prevA;
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
      ctx.fillStyle = hexWithAlpha(mainCol, rank >= 3 ? 0.28 : 0.2);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();
      ctx.lineWidth = rank >= 4 ? 2.6 : 2;
      ctx.strokeStyle = mainCol;
      ctx.stroke();

      if (rank >= 2) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx * 0.68, ry * 0.68, 0, 0, Math.PI * 2);
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = skinSecondary ?? (rank >= 4 ? '#facc15' : '#bae6fd');
        ctx.stroke();
      }
    } else if (faction === 'unorthodox') {
      // Serrated 6-fang Sapa formation (만독혈진)
      ctx.beginPath();
      const teeth = 12;
      for (let k = 0; k < teeth; k++) {
        const a = -rot * 0.9 + (k * Math.PI * 2) / teeth;
        const radScale = k % 2 === 0 ? 1.1 : 0.84;
        const px = cx + Math.cos(a) * rx * radScale;
        const py = cy + Math.sin(a) * ry * radScale;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = hexWithAlpha(skinPrimary ?? (rank >= 3 ? '#16a34a' : gradeColor), 0.25);
      ctx.fill();
      ctx.lineWidth = 3.8;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();
      ctx.lineWidth = 2.1;
      ctx.strokeStyle = skinSecondary ?? (rank >= 4 ? '#f43f5e' : gradeColor);
      ctx.stroke();
    } else {
      // Obsidian-crimson Demonic Cult star seal (천마혈진)
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 1.04, ry * 1.04, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(26, 10, 22, 0.48)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = skinPrimary ?? (rank >= 4 ? '#e11d48' : gradeColor);
      ctx.stroke();

      const spikes = rank >= 4 ? 8 : 6;
      ctx.beginPath();
      for (let k = 0; k < spikes; k++) {
        const a = rot + (k * Math.PI * 2) / spikes;
        ctx.moveTo(cx + Math.cos(a) * rx * 0.55, cy + Math.sin(a) * ry * 0.55);
        ctx.lineTo(cx + Math.cos(a) * (rx + 4.5), cy + Math.sin(a) * (ry + 2.2));
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = skinSecondary ?? (rank >= 5 ? '#fde047' : '#fb7185');
      ctx.stroke();
    }
  }

  /**
   * Draws an animated weapon blade/staff/palm/dagger swing smear right around the attacking hero
   * so every sword, saber, staff, palm, hidden dagger, and demonic spell visibly whips through the air!
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
  ): void {
    const fade = sp < 0.62 ? 1 : 1 - (sp - 0.62) / 0.38;
    if (fade <= 0.01) return;

    const prevAlpha = ctx.globalAlpha;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.rotate(aimAngle);
    ctx.globalAlpha = prevAlpha * fade;

    const style = profile.style;

    if (style === 'sword' || style === 'saber') {
      const isSaber = style === 'saber';
      const maxArc = isSaber ? 1.38 : 1.22;
      const radius = (isSaber ? 48 : 44) * rankScale;
      const sweepT = easeOutCubic(Math.min(1, sp * 1.45));
      const startA = -maxArc * comboSide;
      const curA = (startA + maxArc * 2 * sweepT * comboSide);
      const trailStartA = startA + maxArc * 2 * Math.max(0, sp - 0.38) * 1.15 * comboSide;

      // 1. Tapered crescent blade-qi slash smear
      const drawCrescent = (
        a0: number,
        a1: number,
        rOuter: number,
        bellyRatio: number,
      ): void => {
        const anti = a1 < a0;
        ctx.beginPath();
        ctx.arc(0, 0, rOuter, a0, a1, anti);
        const midA = (a0 + a1) * 0.5;
        const innerR = rOuter * bellyRatio;
        ctx.quadraticCurveTo(
          Math.cos(midA) * innerR,
          Math.sin(midA) * innerR,
          Math.cos(a0) * rOuter,
          Math.sin(a0) * rOuter,
        );
        ctx.closePath();
        ctx.fillStyle = profile.primary;
        ctx.fill();
        ctx.lineWidth = isSaber ? 3.4 : 2.6;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();

        // Bright gleaming outer cutting edge
        ctx.beginPath();
        ctx.arc(0, 0, rOuter - 2, a0, a1, anti);
        ctx.lineWidth = isSaber ? 3 : 2.2;
        ctx.strokeStyle = isSkill ? '#ffffff' : profile.secondary;
        ctx.stroke();
      };

      drawCrescent(trailStartA, curA, radius, isSaber ? 0.34 : 0.54);

      // Dual-wielding cross-crescent for 흑풍대원 / 검마 / 검성
      if (profile.dualWield && sp > 0.12) {
        drawCrescent(-trailStartA * 0.85, -curA * 0.9, radius * 0.84, 0.58);
      }

      // 2. Physical swinging sword / broad-saber blade silhouette at leading edge (sp < 0.72)
      if (sp < 0.75) {
        ctx.save();
        ctx.rotate(curA);
        ctx.beginPath();
        if (isSaber) {
          // Broad curved Wuxia Dadao / Blood Saber blade
          ctx.moveTo(8, -2.5 * comboSide);
          ctx.lineTo(radius + 6, -5.5 * comboSide);
          ctx.quadraticCurveTo(radius + 11, 2 * comboSide, radius - 2, 5.5 * comboSide);
          ctx.lineTo(8, 2.5 * comboSide);
        } else {
          // Sleek double-edged Wuxia Jian sword blade
          ctx.moveTo(8, -2.2);
          ctx.lineTo(radius + 5, -1.4);
          ctx.lineTo(radius + 11, 0);
          ctx.lineTo(radius + 5, 1.4);
          ctx.lineTo(8, 2.2);
        }
        ctx.closePath();
        ctx.fillStyle = profile.sect === 'magyo_sword' ? '#1e1b2e' : '#f8fafc';
        ctx.fill();
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.restore();
      }

      // 3. Sect-signature swing accents along the arc!
      if (profile.sect === 'hwasan') {
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
        // Crackling lightning sparks along sword swing
        ctx.beginPath();
        for (let s = 0; s <= 4; s++) {
          const la = trailStartA + (curA - trailStartA) * (s / 4);
          const lr = radius + (s % 2 === 0 ? 4 : -4);
          const lx = Math.cos(la) * lr;
          const ly = Math.sin(la) * lr;
          if (s === 0) ctx.moveTo(lx, ly);
          else ctx.lineTo(lx, ly);
        }
        ctx.lineWidth = 2;
        ctx.strokeStyle = profile.sect === 'namgung' ? '#fde047' : '#f43f5e';
        ctx.stroke();
      } else if (profile.sect === 'mudang') {
        // Spinning Yin-Yang qi bead at sword tip
        const tx = Math.cos(curA) * radius;
        const ty = Math.sin(curA) * radius;
        ctx.beginPath();
        ctx.arc(tx, ty, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#e0f2fe';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
      }
    } else if (style === 'spear_staff') {
      // Piercing forward staff/spear thrust lance + sonic wind ring!
      const reach = (18 + easeOutCubic(Math.min(1, sp * 1.6)) * 42) * rankScale;
      ctx.beginPath();
      ctx.moveTo(4, -5.5);
      ctx.lineTo(reach, 0);
      ctx.lineTo(4, 5.5);
      ctx.closePath();
      ctx.fillStyle = profile.primary;
      ctx.fill();
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(8, -2);
      ctx.lineTo(reach - 4, 0);
      ctx.lineTo(8, 2);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Sonic thrust ring around shaft
      const ringX = reach * 0.52;
      ctx.beginPath();
      ctx.ellipse(ringX, 0, 5, 13 * rankScale, 0, 0, Math.PI * 2);
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = profile.secondary;
      ctx.stroke();
    } else if (style === 'palm_fist') {
      const punchExt =
        sp < 0.55
          ? easeOutCubic(Math.min(1, sp / 0.36))
          : 1 - smoothstep((sp - 0.55) / 0.45) * 0.35;
      const fistReach = (10 + punchExt * 36) * rankScale;

      if (profile.sect === 'mad_demon') {
        // Berserker savage fist + triple crimson claw rend (광마혈조)!
        const yMain = comboSide * 3;
        drawClenchedFist(ctx, fistReach * 0.88, yMain, 0.95 * rankScale, '#fda4af', '#e11d48', '#44403c');
        for (let k = -1; k <= 1; k++) {
          const yOff = k * 9;
          ctx.beginPath();
          ctx.moveTo(8, yOff - 4 * comboSide);
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
        // Authentic Straight Fist Punch (소림 나한권·금강권 / 마교 흑염권 정권 지르기)!
        const isShaolin = profile.sect === 'shaolin';
        const yOff = comboSide * 4;
        const knuckleCol = isShaolin ? '#fde047' : '#fda4af';
        const auraCol = isShaolin ? '#f59e0b' : '#db2777';
        const cuffCol = isShaolin ? '#c2410c' : '#312e81';

        // 1. Tapered punch qi piston cone + 3 crisp speed streaks from shoulder to wrist
        ctx.beginPath();
        ctx.moveTo(4, yOff - 4.5);
        ctx.lineTo(Math.max(8, fistReach - 6), yOff - 8.5 * rankScale);
        ctx.lineTo(Math.max(8, fistReach - 6), yOff + 8.5 * rankScale);
        ctx.lineTo(4, yOff + 4.5);
        ctx.closePath();
        ctx.fillStyle = hexWithAlpha(auraCol, 0.36);
        ctx.fill();

        ctx.lineCap = 'round';
        for (let s = -1; s <= 1; s++) {
          const sy = yOff + s * 5.2;
          ctx.beginPath();
          ctx.moveTo(4 + Math.abs(s) * 4, sy);
          ctx.lineTo(Math.max(8, fistReach - 7), sy);
          ctx.lineWidth = s === 0 ? 3.4 : 2.2;
          ctx.strokeStyle = s === 0 ? '#ffffff' : profile.secondary;
          ctx.stroke();
        }

        // 2. Sonic compression ring around punching forearm
        const ringX = fistReach * 0.5;
        ctx.beginPath();
        ctx.ellipse(ringX, yOff, 4.8, 12.5 * rankScale, 0, 0, Math.PI * 2);
        ctx.lineWidth = 3.2;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = profile.secondary;
        ctx.stroke();

        // 3. Skill secondary barrage fist (쌍권 연타) on everyN proc
        if (isSkill && sp > 0.08) {
          drawClenchedFist(
            ctx,
            fistReach * 0.68,
            -yOff * 1.55,
            0.88 * rankScale,
            knuckleCol,
            auraCol,
            cuffCol,
          );
        }

        // 4. Primary cel-shaded Clenched Martial Fist (정권 주먹)
        drawClenchedFist(
          ctx,
          fistReach,
          yOff,
          (isSkill ? 1.18 : 1.02) * rankScale,
          knuckleCol,
          auraCol,
          cuffCol,
        );

        // 5. Front knuckle shockwave arc + 4-point impact spark at full extension
        if (sp >= 0.14 && sp <= 0.72) {
          const tipX = fistReach + 9 * rankScale;
          ctx.beginPath();
          ctx.arc(fistReach + 2, yOff, 13 * rankScale, -Math.PI * 0.36, Math.PI * 0.36);
          ctx.lineWidth = 4.6;
          ctx.strokeStyle = PIXEL_OUTLINE;
          ctx.stroke();
          ctx.lineWidth = 2.4;
          ctx.strokeStyle = isSkill ? '#ffffff' : profile.secondary;
          ctx.stroke();

          const sparkR = (isSkill ? 9 : 6.5) * rankScale;
          ctx.beginPath();
          ctx.moveTo(tipX - sparkR, yOff);
          ctx.lineTo(tipX + sparkR, yOff);
          ctx.moveTo(tipX, yOff - sparkR);
          ctx.lineTo(tipX, yOff + sparkR);
          ctx.lineWidth = 2.2;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        }
      }
    } else if (style === 'dagger_hidden') {
      // Swift wrist-flick fan arc + triple glinting throwing blades
      const fanR = 38 * rankScale;
      const a0 = -0.85 * comboSide;
      const a1 = a0 + 1.7 * easeOutCubic(Math.min(1, sp * 1.5)) * comboSide;
      ctx.beginPath();
      ctx.arc(0, 0, fanR, a0, a1, a1 < a0);
      ctx.lineCap = 'round';
      ctx.lineWidth = 6;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = profile.primary;
      ctx.stroke();

      for (let d = -1; d <= 1; d++) {
        const da = d * 0.28;
        const dStart = 12 + sp * 12;
        const dEnd = dStart + 14;
        ctx.beginPath();
        ctx.moveTo(Math.cos(da) * dStart, Math.sin(da) * dStart);
        ctx.lineTo(Math.cos(da) * dEnd, Math.sin(da) * dEnd);
        ctx.lineWidth = 3.6;
        ctx.strokeStyle = PIXEL_OUTLINE;
        ctx.stroke();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = d === 0 ? '#ffffff' : profile.secondary;
        ctx.stroke();
      }
    } else {
      // sorcery_qi: swirling demonic blood/hellfire casting ring
      const castR = (20 + easeOutCubic(sp) * 14) * rankScale;
      ctx.beginPath();
      ctx.arc(12, 0, castR, sp * 4, sp * 4 + Math.PI * 1.4);
      ctx.lineCap = 'round';
      ctx.lineWidth = 6;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = profile.primary;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(12, 0, castR * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = profile.secondary;
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();
    }

    ctx.restore();
    ctx.globalAlpha = prevAlpha;
  }

  /**
   * Sect-distinct flying projectiles so every clan & faction looks unmistakably unique in battle.
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
          const baseProfile = UNIT_COMBAT_PROFILES[p.unitId] ?? DEFAULT_PROFILE;
          const cMain = skin ? skin.primaryColor : baseProfile.primary;
          const cSub = skin ? skin.secondaryColor : baseProfile.secondary;
          const scale = p.isSkill ? 1.38 : p.isCrit ? 1.16 : 1;

          ctx.save();
          ctx.translate(x, y);

          switch (baseProfile.sect) {
            case 'hwasan': {
              // Curved pink-crimson Mount Hua crescent sword-qi + trailing plum petal
              ctx.rotate(ang);
              const r = 11 * scale;
              ctx.beginPath();
              ctx.arc(-2, 0, r, -Math.PI * 0.44, Math.PI * 0.44);
              ctx.quadraticCurveTo(r * 0.35, 0, Math.cos(-Math.PI * 0.44) * r - 2, Math.sin(-Math.PI * 0.44) * r);
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
              break;
            }

            case 'mudang': {
              // Cyan Taiji sword-ray + spinning Yin-Yang orb core
              ctx.rotate(ang);
              ctx.beginPath();
              ctx.moveTo(-16 * scale, 0);
              ctx.lineTo(7 * scale, 0);
              ctx.lineCap = 'round';
              ctx.lineWidth = 7 * scale;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.lineWidth = 3.8 * scale;
              ctx.strokeStyle = skin ? cMain : '#38bdf8';
              ctx.stroke();

              ctx.rotate(simTimeSec * 14 + p.id);
              ctx.beginPath();
              ctx.arc(0, 0, 5.2 * scale, 0, Math.PI * 2);
              ctx.fillStyle = skin ? cSub : '#ffffff';
              ctx.fill();
              ctx.beginPath();
              ctx.arc(0, 0, 5.2 * scale, 0, Math.PI);
              ctx.fillStyle = PIXEL_OUTLINE;
              ctx.fill();
              ctx.lineWidth = 1.6;
              ctx.strokeStyle = skin ? cMain : '#06b6d4';
              ctx.stroke();
              break;
            }

            case 'namgung': {
              // Crackling imperial azure-gold lightning sword-lance
              ctx.rotate(ang);
              ctx.beginPath();
              ctx.moveTo(-18 * scale, 0);
              ctx.lineTo(-9 * scale, -4 * scale);
              ctx.lineTo(-2 * scale, 3.5 * scale);
              ctx.lineTo(8 * scale, 0);
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.lineWidth = 7.5 * scale;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.lineWidth = 4.2 * scale;
              ctx.strokeStyle = cMain;
              ctx.stroke();
              ctx.lineWidth = 1.8 * scale;
              ctx.strokeStyle = skin ? cSub : '#fef08a';
              ctx.stroke();
              break;
            }

            case 'shaolin': {
              // Flying Golden Arhat / Vajra Qi Fist (황금 나한권강 주먹)!
              ctx.rotate(ang);
              ctx.beginPath();
              ctx.moveTo(-15 * scale, 0);
              ctx.lineTo(0, 0);
              ctx.lineCap = 'round';
              ctx.lineWidth = 8.5 * scale;
              ctx.strokeStyle = hexWithAlpha(skin ? cMain : '#f59e0b', 0.55);
              ctx.stroke();
              drawClenchedFist(
                ctx,
                2 * scale,
                0,
                0.78 * scale,
                skin ? cSub : p.isSkill ? '#fef08a' : '#fbbf24',
                skin ? cMain : '#f59e0b',
                '#c2410c',
              );
              break;
            }

            case 'gaebang': {
              // Emerald bamboo-dragon shock crescent
              ctx.rotate(ang);
              const r = 9.5 * scale;
              ctx.beginPath();
              ctx.arc(-2, 0, r, -Math.PI * 0.42, Math.PI * 0.42);
              ctx.lineCap = 'round';
              ctx.lineWidth = 7.2 * scale;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.lineWidth = 4 * scale;
              ctx.strokeStyle = skin ? cMain : p.isSkill ? '#4ade80' : cMain;
              ctx.stroke();
              ctx.beginPath();
              ctx.arc(1, 0, 3.2 * scale, 0, Math.PI * 2);
              ctx.fillStyle = skin ? cSub : '#dcfce7';
              ctx.fill();
              break;
            }

            case 'tang_poison': {
              // Spinning emerald-violet poisoned throwing dagger (or bubbling venom orb for poison_healer)
              if (p.unitId === 'poison_healer') {
                ctx.beginPath();
                ctx.arc(0, 0, 6 * scale, 0, Math.PI * 2);
                ctx.fillStyle = skin ? cMain : '#22c55e';
                ctx.fill();
                ctx.lineWidth = 2.4;
                ctx.strokeStyle = PIXEL_OUTLINE;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(-2, -2, 2.2 * scale, 0, Math.PI * 2);
                ctx.fillStyle = skin ? cSub : '#d8b4fe';
                ctx.fill();
              } else {
                ctx.rotate(simTimeSec * 22 + p.id * 1.7);
                ctx.beginPath();
                ctx.moveTo(-9 * scale, 0);
                ctx.lineTo(0, -3.5 * scale);
                ctx.lineTo(10 * scale, 0);
                ctx.lineTo(0, 3.5 * scale);
                ctx.closePath();
                ctx.fillStyle = skin ? cMain : '#4ade80';
                ctx.fill();
                ctx.lineWidth = 2.2;
                ctx.strokeStyle = PIXEL_OUTLINE;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(0, 0, 2 * scale, 0, Math.PI * 2);
                ctx.fillStyle = skin ? cSub : '#a855f7';
                ctx.fill();
              }
              break;
            }

            case 'sapa_blade':
            case 'haomun':
            case 'mad_demon': {
              // Brutal wide crimson-scarlet saber wave (혈도참기)
              ctx.rotate(ang);
              const r = 11.5 * scale;
              ctx.beginPath();
              ctx.arc(-3, 0, r, -Math.PI * 0.46, Math.PI * 0.46);
              ctx.lineCap = 'round';
              ctx.lineWidth = 7.8 * scale;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.lineWidth = 4.4 * scale;
              ctx.strokeStyle = skin ? cMain : baseProfile.sect === 'haomun' ? '#e2e8f0' : '#e11d48';
              ctx.stroke();
              ctx.lineWidth = 1.6 * scale;
              ctx.strokeStyle = skin ? cSub : '#fff1f2';
              ctx.stroke();
              break;
            }

            case 'magyo_bone':
            case 'magyo_flame': {
              // Swirling obsidian-scarlet & violet hellfire / ghost-bone projectile
              ctx.rotate(ang);
              ctx.beginPath();
              ctx.moveTo(-14 * scale, 0);
              ctx.lineTo(4 * scale, 0);
              ctx.lineCap = 'round';
              ctx.lineWidth = 7 * scale;
              ctx.strokeStyle = skin ? cSub : '#9333ea';
              ctx.stroke();

              ctx.beginPath();
              ctx.arc(2 * scale, 0, 6.2 * scale, 0, Math.PI * 2);
              ctx.fillStyle = PIXEL_OUTLINE;
              ctx.fill();
              ctx.beginPath();
              ctx.arc(2 * scale, 0, 4.4 * scale, 0, Math.PI * 2);
              ctx.fillStyle = skin ? cMain : baseProfile.sect === 'magyo_bone' ? '#c084fc' : '#ef4444';
              ctx.fill();
              ctx.beginPath();
              ctx.arc(3 * scale, -1, 2 * scale, 0, Math.PI * 2);
              ctx.fillStyle = skin ? cSub : '#fde047';
              ctx.fill();
              break;
            }

            case 'magyo_sword':
            default: {
              // Pitch-black & blood-crimson Heavenly Demon crescent slash (천마흑뢰검기)
              ctx.rotate(ang);
              const r = 12 * scale;
              ctx.beginPath();
              ctx.arc(-3, 0, r, -Math.PI * 0.48, Math.PI * 0.48);
              ctx.lineCap = 'round';
              ctx.lineWidth = 8.4 * scale;
              ctx.strokeStyle = PIXEL_OUTLINE;
              ctx.stroke();
              ctx.lineWidth = 4.4 * scale;
              ctx.strokeStyle = skin ? cMain : '#e11d48';
              ctx.stroke();
              ctx.lineWidth = 1.6 * scale;
              ctx.strokeStyle = skin ? cSub : p.isSkill ? '#fde047' : '#fda4af';
              ctx.stroke();
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
