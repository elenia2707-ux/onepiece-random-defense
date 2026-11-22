import type { SlotRef } from '../core/CommandQueue';
import type { CourtSkinDef } from '../data/types';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../platform/Viewport';
import type { Board } from '../world/Board';
import type { LoopPath } from '../world/Path';
import type { CellRect } from '../world/SlotGrid';
import { PIXEL_OUTLINE } from './ChibiPainter';
import { hexWithAlpha } from './SpriteCache';

/** Visual inflation of slot bounds for selection/hover highlights (hit-testing uses board.json). */
const FIELD_INFLATE_X = 2.5;
const FIELD_INFLATE_Y = 3;
const BENCH_INFLATE = 2.5;

/** Pavilion bench tray frame (logical px). */
const TRAY = { x: 36, y: 736, w: 648, h: 210, r: 20 } as const;

/** Drawn tile rect for a slot. Renderer uses it for selection/hover highlights. */
export function expandedSlotRect(board: Board, slot: SlotRef): CellRect {
  const r = board.getSlotRect(slot);
  const ix = slot.area === 'field' ? FIELD_INFLATE_X : BENCH_INFLATE;
  const iy = slot.area === 'field' ? FIELD_INFLATE_Y : BENCH_INFLATE;
  return { x: r.x - ix, y: r.y - iy, w: r.w + ix * 2, h: r.h + iy * 2 };
}

interface RingGeom {
  readonly ox: number;
  readonly oy: number;
  readonly ow: number;
  readonly oh: number;
  readonly ix: number;
  readonly iy: number;
  readonly iw: number;
  readonly ih: number;
}

/**
 * Paints the authentic Wuxia martial tournament sanctuary ('천하제일 무림 비무대'):
 * - Loads the bespoke 720x1280 pixel-art Wuxia sanctuary map (`public/bg/murim_arena_bg.png`)
 *   with grand tiled temple eaves, glowing red silk lanterns, Mount Hua plum blossoms,
 *   ancient pine & bamboo cliffs, carved dragon balustrades, Bagua Yin-Yang white-jade arena,
 *   dragon-relief bridge, and Dancheong sect waiting pavilion.
 * - Supports atmospheric courtyard skins (낙조 / 적월야 / 황실 금란비무전) via pure gradient glazes.
 * - Overlays delicate recessed stone slab seams & subtle standing markers aligned to the
 *   exact `board.json` 6x3 field & 6x2 bench slots for razor-sharp tactical clarity.
 * - Includes an instant architectural Wuxia fallback before the PNG finishes decoding.
 * Executed ONLY on initialization, image decode, theme switch, and viewport resize (zero text, zero filters).
 */
export class BackgroundPainter {
  private readonly stageImages = new Map<string, HTMLImageElement>();
  private courtSkin: CourtSkinDef | null = null;
  private readonly onReady?: () => void;

  public constructor(onReady?: () => void) {
    this.onReady = onReady;
    this.ensureStageImage('bg/murim_arena_bg.png');
  }

  public setCourtSkin(skin: CourtSkinDef | null): void {
    this.courtSkin = skin;
    if (skin?.bgImage) {
      this.ensureStageImage(skin.bgImage);
    }
  }

  private ensureStageImage(relPath: string): HTMLImageElement | null {
    const cached = this.stageImages.get(relPath);
    if (cached) {
      return cached.complete && cached.naturalWidth > 0 && cached.naturalHeight > 0 ? cached : null;
    }
    if (typeof Image === 'undefined') return null;
    const img = new Image();
    img.decoding = 'async';
    this.stageImages.set(relPath, img);
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        this.onReady?.();
      }
    };
    img.src = `${import.meta.env.BASE_URL}${relPath}`;
    return null;
  }

  public paint(ctx: CanvasRenderingContext2D, board: Board, path: LoopPath): void {
    const cfg = board.config;
    const half = cfg.path.corridorWidth * 0.5;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of path.waypoints) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const ring: RingGeom = {
      ox: minX - half,
      oy: minY - half,
      ow: maxX - minX + half * 2,
      oh: maxY - minY + half * 2,
      ix: minX + half,
      iy: minY + half,
      iw: maxX - minX - half * 2,
      ih: maxY - minY - half * 2,
    };

    const customImg = this.courtSkin?.bgImage ? this.ensureStageImage(this.courtSkin.bgImage) : null;
    const baseImg = this.ensureStageImage('bg/murim_arena_bg.png');
    const activeBg = customImg ?? baseImg;
    const hasCustomArt = customImg !== null;

    if (activeBg) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(activeBg, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      ctx.restore();

      this.paintCourtAtmosphere(ctx, board, ring, hasCustomArt);
      this.paintTacticalPathGuide(ctx, ring);
      this.paintEngravedGridSeams(ctx, board);
      return;
    }

    // Instant architectural Wuxia fallback before murim_arena_bg.png decodes
    this.paintWuxiaFallbackBackdrop(ctx);
    this.paintFallbackTrack(ctx, ring);
    this.paintFallbackCourtyard(ctx, board, ring);
    this.paintFallbackBench(ctx, board);
    this.paintCourtAtmosphere(ctx, board, ring, false);
    this.paintEngravedGridSeams(ctx, board);
  }

  private isDarkBespokeCourt(): boolean {
    const id = this.courtSkin?.id;
    return id === 'court_nether_abyss_forge' || id === 'court_primordial_cosmos';
  }

  private paintCourtAtmosphere(
    ctx: CanvasRenderingContext2D,
    board: Board,
    ring: RingGeom,
    hasCustomArt: boolean,
  ): void {
    const skin = this.courtSkin;
    if (!skin || skin.tintAlpha <= 0.001) return;

    ctx.save();
    // 1. Atmospheric sky-to-courtyard glaze (skip heavy full-screen wash on bespoke map art)
    if (!hasCustomArt) {
      const grad = ctx.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT);
      grad.addColorStop(0, hexWithAlpha(skin.tintColor, Math.min(0.45, skin.tintAlpha * 1.45)));
      grad.addColorStop(0.45, hexWithAlpha(skin.tintColor, skin.tintAlpha * 0.72));
      grad.addColorStop(1, hexWithAlpha(skin.tintColor, Math.min(0.42, skin.tintAlpha * 1.25)));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    }

    // 2. Crisp ornamental border trim around the inner courtyard & pavilion
    ctx.beginPath();
    ctx.roundRect(ring.ix + 2, ring.iy + 2, ring.iw - 4, ring.ih - 4, 10);
    ctx.lineWidth = hasCustomArt ? 2.2 : 2.5;
    ctx.strokeStyle = hexWithAlpha(skin.lanternColor, hasCustomArt ? 0.45 : 0.52);
    ctx.stroke();

    const f = board.config.field;
    const fw = f.cols * f.cellW + (f.cols - 1) * f.gapX;
    const fh = f.rows * f.cellH + (f.rows - 1) * f.gapY;
    const cx = f.originX + fw * 0.5;
    const cy = f.originY + fh * 0.5;
    const sealGrad = ctx.createRadialGradient(cx, cy, 12, cx, cy, 130);
    sealGrad.addColorStop(0, hexWithAlpha(skin.lanternColor, hasCustomArt ? 0.1 : 0.16));
    sealGrad.addColorStop(1, hexWithAlpha(skin.lanternColor, 0));
    ctx.fillStyle = sealGrad;
    ctx.fillRect(f.originX - 20, f.originY - 20, fw + 40, fh + 40);
    ctx.restore();
  }

  /**
   * Subtle worn sandstone runner along the loop centerline so monster pathing reads effortlessly
   * on top of the pixel-art Wuxia corridor without artificial arrows or grid blocks.
   */
  private paintTacticalPathGuide(ctx: CanvasRenderingContext2D, r: RingGeom): void {
    const midX = (r.ox + r.ix) * 0.5;
    const midY = (r.oy + r.iy) * 0.5;
    const midW = r.ow - (r.ix - r.ox);
    const midH = r.oh - (r.iy - r.oy);
    const dark = this.isDarkBespokeCourt();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(midX, midY, midW, midH, 14);
    ctx.lineWidth = 18;
    ctx.strokeStyle = dark ? 'rgba(255, 224, 178, 0.08)' : 'rgba(255, 248, 230, 0.16)';
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(midX, midY, midW, midH, 14);
    ctx.lineWidth = 2;
    ctx.strokeStyle = dark
      ? hexWithAlpha(this.courtSkin?.lanternColor ?? '#fb923c', 0.24)
      : 'rgba(120, 86, 46, 0.18)';
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Ultra-delicate recessed stone grout seams & subtle martial footwork rings aligned
   * 1:1 with `board.json` 6x3 field & 6x2 bench slots (preserves the Bagua Yin-Yang relief).
   */
  private paintEngravedGridSeams(ctx: CanvasRenderingContext2D, board: Board): void {
    const f = board.config.field;
    const fGridW = f.cols * f.cellW + (f.cols - 1) * f.gapX;
    const fGridH = f.rows * f.cellH + (f.rows - 1) * f.gapY;
    const fStepX = f.cellW + f.gapX;
    const fStepY = f.cellH + f.gapY;
    const dark = this.isDarkBespokeCourt();
    const darkAccent = this.courtSkin?.lanternColor ?? '#fb923c';

    ctx.save();
    // 6x3 비무대 recessed slab seams
    const fieldSeamDark = dark ? 'rgba(10, 6, 16, 0.52)' : 'rgba(134, 145, 126, 0.28)';
    const fieldSeamHi = dark ? hexWithAlpha(darkAccent, 0.26) : 'rgba(255, 255, 255, 0.52)';
    for (let c = 1; c < f.cols; c++) {
      const gx = Math.round(f.originX + c * fStepX - f.gapX * 0.5);
      ctx.strokeStyle = fieldSeamDark;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(gx, f.originY + 2);
      ctx.lineTo(gx, f.originY + fGridH - 2);
      ctx.stroke();

      ctx.strokeStyle = fieldSeamHi;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gx + 1.2, f.originY + 2);
      ctx.lineTo(gx + 1.2, f.originY + fGridH - 2);
      ctx.stroke();
    }
    for (let row = 1; row < f.rows; row++) {
      const gy = Math.round(f.originY + row * fStepY - f.gapY * 0.5);
      ctx.strokeStyle = fieldSeamDark;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(f.originX + 2, gy);
      ctx.lineTo(f.originX + fGridW - 2, gy);
      ctx.stroke();

      ctx.strokeStyle = fieldSeamHi;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(f.originX + 2, gy + 1.2);
      ctx.lineTo(f.originX + fGridW - 2, gy + 1.2);
      ctx.stroke();
    }

    for (let idx = 0; idx < board.field.capacity; idx++) {
      const cell = board.getSlotRect({ area: 'field', index: idx });
      const mx = cell.x + cell.w * 0.5;
      const my = cell.y + cell.h * 0.5 + 16;
      ctx.fillStyle = dark ? hexWithAlpha(darkAccent, 0.14) : 'rgba(138, 148, 128, 0.16)';
      ctx.beginPath();
      ctx.ellipse(mx, my, 17, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6x2 문파 대기석 recessed slab seams
    const b = board.config.bench;
    const bGridW = b.cols * b.cellW + (b.cols - 1) * b.gapX;
    const bGridH = b.rows * b.cellH + (b.rows - 1) * b.gapY;
    const bStepX = b.cellW + b.gapX;
    const bStepY = b.cellH + b.gapY;
    const benchSeamDark = dark ? 'rgba(10, 6, 16, 0.5)' : 'rgba(148, 114, 72, 0.26)';
    const benchSeamHi = dark ? hexWithAlpha(darkAccent, 0.22) : 'rgba(255, 250, 235, 0.45)';

    for (let c = 1; c < b.cols; c++) {
      const gx = Math.round(b.originX + c * bStepX - b.gapX * 0.5);
      ctx.strokeStyle = benchSeamDark;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(gx, b.originY + 2);
      ctx.lineTo(gx, b.originY + bGridH - 2);
      ctx.stroke();

      ctx.strokeStyle = benchSeamHi;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gx + 1.2, b.originY + 2);
      ctx.lineTo(gx + 1.2, b.originY + bGridH - 2);
      ctx.stroke();
    }
    for (let row = 1; row < b.rows; row++) {
      const gy = Math.round(b.originY + row * bStepY - b.gapY * 0.5);
      ctx.strokeStyle = benchSeamDark;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(b.originX + 2, gy);
      ctx.lineTo(b.originX + bGridW - 2, gy);
      ctx.stroke();

      ctx.strokeStyle = benchSeamHi;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(b.originX + 2, gy + 1.2);
      ctx.lineTo(b.originX + bGridW - 2, gy + 1.2);
      ctx.stroke();
    }

    for (let idx = 0; idx < board.bench.capacity; idx++) {
      const cell = board.getSlotRect({ area: 'bench', index: idx });
      const mx = cell.x + cell.w * 0.5;
      const my = cell.y + cell.h * 0.5 + 14;
      ctx.fillStyle = dark ? hexWithAlpha(darkAccent, 0.13) : 'rgba(148, 114, 72, 0.16)';
      ctx.beginPath();
      ctx.ellipse(mx, my, 17, 5.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------------- */
  /*  Instant Wuxia Sanctuary Fallback (pre-image decode)             */
  /* ---------------------------------------------------------------- */

  private paintWuxiaFallbackBackdrop(ctx: CanvasRenderingContext2D): void {
    const sky = ctx.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT);
    sky.addColorStop(0, '#cfd8dc');
    sky.addColorStop(0.14, '#7c9099');
    sky.addColorStop(0.55, '#2b3a42');
    sky.addColorStop(1, '#142029');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // Curved dark-slate Wuxia hall roof silhouette at top
    ctx.beginPath();
    ctx.moveTo(96, 74);
    ctx.quadraticCurveTo(220, 22, 360, 18);
    ctx.quadraticCurveTo(500, 22, 624, 74);
    ctx.lineTo(584, 122);
    ctx.lineTo(136, 122);
    ctx.closePath();
    ctx.fillStyle = '#2d3748';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.stroke();

    // Red silk lanterns along hall eaves
    for (const lx of [123, 174, 224, 302, 417, 496, 546, 597]) {
      ctx.beginPath();
      ctx.arc(lx, 78, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#dc2626';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();
    }
  }

  private paintFallbackTrack(ctx: CanvasRenderingContext2D, r: RingGeom): void {
    ctx.beginPath();
    ctx.roundRect(r.ox - 8, r.oy - 6, r.ow + 16, r.oh + 12, 18);
    ctx.fillStyle = '#dcb574';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.stroke();
  }

  private paintFallbackCourtyard(
    ctx: CanvasRenderingContext2D,
    board: Board,
    r: RingGeom,
  ): void {
    ctx.beginPath();
    ctx.roundRect(r.ix, r.iy, r.iw, r.ih, 12);
    ctx.fillStyle = '#9aa08e';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.stroke();

    const f = board.config.field;
    const fw = f.cols * f.cellW + (f.cols - 1) * f.gapX + 16;
    const fh = f.rows * f.cellH + (f.rows - 1) * f.gapY + 16;
    const fx = f.originX - 8;
    const fy = f.originY - 8;

    ctx.beginPath();
    ctx.roundRect(fx, fy, fw, fh, 10);
    ctx.fillStyle = '#ebf2e3';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#93a688';
    ctx.stroke();

    const cx = fx + fw * 0.5;
    const cy = fy + fh * 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 98, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(154, 160, 142, 0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  private paintFallbackBench(ctx: CanvasRenderingContext2D, _board: Board): void {
    const { x, y, w, h, r } = TRAY;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = '#7c2d26';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(x + 8, y + 8, w - 16, h - 16, r - 6);
    ctx.fillStyle = '#f2deb4';
    ctx.fill();
  }
}
