import type { SlotRef } from '../core/CommandQueue';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../platform/Viewport';
import type { Board } from '../world/Board';
import type { LoopPath } from '../world/Path';
import type { CellRect } from '../world/SlotGrid';
import { PIXEL_OUTLINE } from './ChibiPainter';

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

/** Deterministic 0..1 hash (render-only decoration; never touches simulation RNG). */
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
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
 * Paints the atmospheric '청죽림 백옥 비무대':
 * 1. Muted misty dawn/night bamboo forest & deep celadon pond so the central arena & heroes pop.
 * 2. Smooth continuous ochre-sandstone martial earth loop path with delicate pebbles & edge grass tufts.
 * 3. Open ancient white-jade / limestone slab courtyard for 6x3 비무대 & 6x2 대기석 with thin engraved grout lines
 *    (no grid-heavy board-game squares or heavy red borders per tile).
 * Executed ONLY on initialization and viewport resize (zero text, zero filters).
 */
export class BackgroundPainter {
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

    this.paintMistyBambooBackdrop(ctx);
    this.paintTerrace(ctx, board);
    this.paintSmoothEarthTrack(ctx, ring);
    this.paintOpenCourtyardSlab(ctx, board, ring);
    this.paintOpenBenchSlab(ctx, board);
  }

  /* ---------------------------------------------------------------- */
  /*  1. Muted Misty Night/Dawn Bamboo Forest Backdrop                */
  /* ---------------------------------------------------------------- */

  private paintMistyBambooBackdrop(ctx: CanvasRenderingContext2D): void {
    const g = ctx.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT);
    g.addColorStop(0, '#0a1f21');
    g.addColorStop(0.35, '#113032');
    g.addColorStop(0.7, '#0d2629');
    g.addColorStop(1, '#071719');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // Soft dawn mist aura behind the central martial terrace
    const mist = ctx.createRadialGradient(360, 440, 120, 360, 460, 660);
    mist.addColorStop(0, 'rgba(167, 215, 206, 0.14)');
    mist.addColorStop(0.55, 'rgba(94, 155, 146, 0.08)');
    mist.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = mist;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // Subtle mist water ripples
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.6;
    for (let row = 0, wy = 36; wy < LOGICAL_HEIGHT; wy += 72, row++) {
      for (let wx = (row % 2) * 64 - 12; wx < LOGICAL_WIDTH + 30; wx += 128) {
        const h = hash2(wx, wy);
        ctx.strokeStyle = `rgba(186, 226, 219, ${(0.04 + h * 0.045).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(wx + h * 24, wy, 14 + h * 10, Math.PI * 1.12, Math.PI * 1.88);
        ctx.stroke();
      }
    }

    // Subdued dusk-sage lotus pads (muted contrast so heroes stand out cleanly)
    const lotusSpots = [
      { x: 54, y: 100, r: 18, flower: true },
      { x: 668, y: 103, r: 17, flower: true },
      { x: 28, y: 726, r: 16, flower: false },
      { x: 692, y: 724, r: 16, flower: false },
      { x: 96, y: 970, r: 18, flower: true },
      { x: 626, y: 968, r: 17, flower: false },
    ];
    for (const lp of lotusSpots) {
      ctx.beginPath();
      ctx.arc(lp.x, lp.y, lp.r + 5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(186, 226, 219, 0.14)';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(lp.x, lp.y);
      ctx.arc(lp.x, lp.y, lp.r, 0.25, Math.PI * 2 - 0.25);
      ctx.closePath();
      ctx.fillStyle = '#244d41';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = '#112a24';
      ctx.stroke();

      if (lp.flower) {
        const fx = lp.x + lp.r * 0.42;
        const fy = lp.y - lp.r * 0.34;
        for (let p = 0; p < 5; p++) {
          const a = (p * Math.PI * 2) / 5 - Math.PI * 0.5;
          ctx.beginPath();
          ctx.ellipse(fx + Math.cos(a) * 4, fy + Math.sin(a) * 4, 4, 2.3, a, 0, Math.PI * 2);
          ctx.fillStyle = p % 2 === 0 ? '#d8a4b0' : '#bc7a8c';
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(fx, fy, 2.1, 0, Math.PI * 2);
        ctx.fillStyle = '#e5c158';
        ctx.fill();
      }
    }

    // Desaturated misty night bamboo silhouettes framing outer margins
    const bambooStalks = [
      { x: 7, tilt: 0.028, w: 8 },
      { x: 19, tilt: -0.018, w: 6.5 },
      { x: 701, tilt: -0.028, w: 8 },
      { x: 713, tilt: 0.018, w: 6.5 },
    ];
    for (const st of bambooStalks) {
      ctx.save();
      ctx.translate(st.x, 0);
      for (let segY = 0; segY < 1030; segY += 78) {
        const sx = Math.sin(segY * 0.01) * st.tilt * 72;
        const grad = ctx.createLinearGradient(sx - st.w * 0.5, 0, sx + st.w * 0.5, 0);
        grad.addColorStop(0, '#3a685b');
        grad.addColorStop(0.48, '#234a40');
        grad.addColorStop(1, '#102722');
        ctx.fillStyle = grad;
        ctx.fillRect(sx - st.w * 0.5, segY, st.w, 75);
        // Subtle muted node band
        ctx.fillStyle = '#4e8071';
        ctx.fillRect(sx - st.w * 0.58, segY + 74, st.w * 1.16, 2.5);
      }
      ctx.restore();
    }

    // Muted sage bamboo leaf clusters
    const leafClusters = [
      { x: 16, y: 86, dir: 1 },
      { x: 14, y: 260, dir: 1 },
      { x: 16, y: 560, dir: 1 },
      { x: 17, y: 705, dir: 1 },
      { x: 704, y: 90, dir: -1 },
      { x: 706, y: 270, dir: -1 },
      { x: 704, y: 570, dir: -1 },
      { x: 703, y: 710, dir: -1 },
    ];
    for (const lc of leafClusters) {
      for (let k = -1; k <= 1; k++) {
        const ang = (lc.dir > 0 ? 0.36 : Math.PI - 0.36) + k * 0.34;
        ctx.save();
        ctx.translate(lc.x, lc.y);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.ellipse(14, 0, 15, 3.8, 0, 0, Math.PI * 2);
        ctx.fillStyle = k === 0 ? '#2f5d4f' : '#20443a';
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = '#112722';
        ctx.stroke();
        ctx.restore();
      }
    }

    // Soft veil overlay so side foliage recedes softly behind arena
    const sideMist = ctx.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT);
    sideMist.addColorStop(0, 'rgba(13, 38, 40, 0.28)');
    sideMist.addColorStop(0.5, 'rgba(16, 48, 50, 0.14)');
    sideMist.addColorStop(1, 'rgba(7, 23, 25, 0.34)');
    ctx.fillStyle = sideMist;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  }

  /* ---------------------------------------------------------------- */
  /*  2. Ancient Stone Terrace Base                                    */
  /* ---------------------------------------------------------------- */

  private paintTerrace(ctx: CanvasRenderingContext2D, board: Board): void {
    const ar = board.config.arenaRect;

    // 3D drop shadow lip
    ctx.beginPath();
    ctx.roundRect(ar.x, ar.y + 8, ar.w, ar.h, 24);
    ctx.fillStyle = PIXEL_OUTLINE;
    ctx.fill();

    // Carved dark timber & ancient stone perimeter frame
    ctx.beginPath();
    ctx.roundRect(ar.x, ar.y, ar.w, ar.h, 24);
    const g = ctx.createLinearGradient(0, ar.y, 0, ar.y + ar.h);
    g.addColorStop(0, '#5a3a2e');
    g.addColorStop(0.5, '#462b22');
    g.addColorStop(1, '#311d17');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.stroke();

    // Subtle warm brass inlay trim
    ctx.beginPath();
    ctx.roundRect(ar.x + 5, ar.y + 5, ar.w - 10, ar.h - 10, 20);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(217, 179, 108, 0.45)';
    ctx.stroke();
  }

  /* ---------------------------------------------------------------- */
  /*  3. Smooth Continuous Ochre-Bluestone Earth Track (No Blocks!)    */
  /* ---------------------------------------------------------------- */

  private paintSmoothEarthTrack(ctx: CanvasRenderingContext2D, r: RingGeom): void {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(r.ox, r.oy, r.ow, r.oh, 18);
    ctx.roundRect(r.ix, r.iy, r.iw, r.ih, 14);
    ctx.clip('evenodd');

    // Continuous sunlit sandy-ochre & limestone path base
    const roadGrad = ctx.createLinearGradient(0, r.oy, 0, r.oy + r.oh);
    roadGrad.addColorStop(0, '#e3cfa7');
    roadGrad.addColorStop(0.5, '#d6be90');
    roadGrad.addColorStop(1, '#c6aa78');
    ctx.fillStyle = roadGrad;
    ctx.fillRect(r.ox, r.oy, r.ow, r.oh);

    // Smooth worn centerline rut running continuously around the entire track
    const midX = (r.ox + r.ix) * 0.5;
    const midY = (r.oy + r.iy) * 0.5;
    const midW = r.ow - (r.ix - r.ox);
    const midH = r.oh - (r.iy - r.oy);

    ctx.beginPath();
    ctx.roundRect(midX, midY, midW, midH, 16);
    ctx.lineWidth = 22;
    ctx.strokeStyle = 'rgba(255, 247, 232, 0.28)';
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(midX, midY, midW, midH, 16);
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(156, 121, 74, 0.12)';
    ctx.stroke();

    // Subtle organic pebbles & grass tufts along outer/inner path edges (NO square grid blocks!)
    const paintPebble = (px: number, py: number, seed: number): void => {
      const h = hash2(px + seed, py - seed);
      if (h < 0.48) return;
      const rx = 2.2 + h * 2.6;
      const ry = 1.5 + h * 1.4;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate((h - 0.5) * 1.8);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = h > 0.8 ? '#93a2a8' : h > 0.65 ? '#b8a07a' : '#ccb792';
      ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = 'rgba(72, 54, 34, 0.38)';
      ctx.stroke();
      ctx.restore();
    };

    const paintTuft = (gx: number, gy: number, seed: number): void => {
      const h = hash2(gx * 0.7, gy + seed);
      if (h < 0.62) return;
      ctx.strokeStyle = h > 0.82 ? '#5a8057' : '#6c8f62';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx - 3, gy - 5);
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + 0.5, gy - 6);
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + 3.5, gy - 4.5);
      ctx.stroke();
    };

    const roadT = r.iy - r.oy;
    // Top & bottom edges
    for (let sx = r.ox + 22; sx < r.ox + r.ow - 22; sx += 26) {
      paintPebble(sx, r.oy + 9 + hash2(sx, 1) * 8, 1);
      paintPebble(sx + 9, r.oy + roadT - 9 - hash2(sx, 2) * 7, 2);
      paintPebble(sx + 5, r.iy + r.ih + 9 + hash2(sx, 3) * 8, 3);
      paintPebble(sx + 13, r.oy + r.oh - 9 - hash2(sx, 4) * 7, 4);
      paintTuft(sx + 12, r.oy + 7, 11);
      paintTuft(sx + 6, r.oy + r.oh - 4, 12);
    }
    // Left & right edges
    for (let sy = r.oy + roadT + 14; sy < r.iy + r.ih - 14; sy += 28) {
      paintPebble(r.ox + 9 + hash2(1, sy) * 8, sy, 5);
      paintPebble(r.ix - 9 - hash2(2, sy) * 7, sy + 10, 6);
      paintPebble(r.ix + r.iw + 9 + hash2(3, sy) * 8, sy + 4, 7);
      paintPebble(r.ox + r.ow - 9 - hash2(4, sy) * 7, sy + 12, 8);
      paintTuft(r.ox + 8, sy + 16, 13);
      paintTuft(r.ox + r.ow - 8, sy + 16, 14);
    }

    ctx.restore();

    // Clean warm stone curbs along path boundaries
    this.paintTrackCurb(ctx, r.ox, r.oy, r.ow, r.oh, 18);
    this.paintTrackCurb(ctx, r.ix, r.iy, r.iw, r.ih, 14);
  }

  private paintTrackCurb(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    rad: number,
  ): void {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, rad);
    ctx.lineWidth = 6.5;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(x, y, w, h, rad);
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = '#9c7853';
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(x, y, w, h, rad);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#e7d5b2';
    ctx.stroke();
  }

  /* ---------------------------------------------------------------- */
  /*  4. Open White-Jade Courtyard Slab (6x3 Arena, Unified Stone)     */
  /* ---------------------------------------------------------------- */

  private paintOpenCourtyardSlab(
    ctx: CanvasRenderingContext2D,
    board: Board,
    r: RingGeom,
  ): void {
    // Inner grassy-jade garden apron between the dirt path and stone arena slab
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(r.ix, r.iy, r.iw, r.ih, 14);
    ctx.clip();

    const mossGrad = ctx.createLinearGradient(0, r.iy, 0, r.iy + r.ih);
    mossGrad.addColorStop(0, '#c8d6bf');
    mossGrad.addColorStop(0.5, '#bdcdae');
    mossGrad.addColorStop(1, '#aebfa1');
    ctx.fillStyle = mossGrad;
    ctx.fillRect(r.ix, r.iy, r.iw, r.ih);
    ctx.restore();

    // Continuous unified 6x3 White-Jade / Limestone Martial Courtyard Slab
    const f = board.config.field;
    const gridW = f.cols * f.cellW + (f.cols - 1) * f.gapX;
    const gridH = f.rows * f.cellH + (f.rows - 1) * f.gapY;
    const padX = 12;
    const padY = 12;
    const sx = f.originX - padX;
    const sy = f.originY - padY;
    const sw = gridW + padX * 2;
    const sh = gridH + padY * 2;

    // 3D plinth lip under unified courtyard slab
    ctx.beginPath();
    ctx.roundRect(sx, sy + 5, sw, sh, 16);
    ctx.fillStyle = '#3c2b22';
    ctx.fill();

    // Outer dark timber / dancheong rim framing the WHOLE 6x3 courtyard once
    ctx.beginPath();
    ctx.roundRect(sx, sy, sw, sh, 16);
    ctx.fillStyle = '#6d3128';
    ctx.fill();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.stroke();

    // Unified wide ivory white-jade stone floor
    const fx = sx + 5;
    const fy = sy + 5;
    const fw = sw - 10;
    const fh = sh - 10;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(fx, fy, fw, fh, 12);
    ctx.clip();

    const slabGrad = ctx.createLinearGradient(0, fy, 0, fy + fh);
    slabGrad.addColorStop(0, '#f8f4e8');
    slabGrad.addColorStop(0.52, '#efe7d4');
    slabGrad.addColorStop(1, '#e3d6bc');
    ctx.fillStyle = slabGrad;
    ctx.fillRect(fx, fy, fw, fh);

    // Subtle stone texture speckles across the unified slab
    for (let py = fy + 16; py < fy + fh - 10; py += 28) {
      for (let px = fx + 18; px < fx + fw - 10; px += 34) {
        const h = hash2(px, py);
        if (h > 0.55) {
          ctx.fillStyle = h > 0.8 ? 'rgba(255,255,255,0.42)' : 'rgba(148,125,94,0.12)';
          ctx.fillRect(px + h * 8, py + h * 5, 4, 2);
        }
      }
    }

    // Engraved Taiji martial circle watermark across center of the stone yard
    const cx = fx + fw * 0.5;
    const cy = fy + fh * 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 118, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(166, 141, 106, 0.22)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 78, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(166, 141, 106, 0.16)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Faint recessed stone grout seams aligned cleanly between the 6x3 slot midpoints
    const stepX = f.cellW + f.gapX;
    const stepY = f.cellH + f.gapY;
    for (let c = 1; c < f.cols; c++) {
      const gx = f.originX + c * stepX - f.gapX * 0.5;
      ctx.strokeStyle = 'rgba(136, 114, 84, 0.28)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(gx, fy + 6);
      ctx.lineTo(gx, fy + fh - 6);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gx + 1.4, fy + 6);
      ctx.lineTo(gx + 1.4, fy + fh - 6);
      ctx.stroke();
    }
    for (let row = 1; row < f.rows; row++) {
      const gy = f.originY + row * stepY - f.gapY * 0.5;
      ctx.strokeStyle = 'rgba(136, 114, 84, 0.28)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(fx + 6, gy);
      ctx.lineTo(fx + fw - 6, gy);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fx + 6, gy + 1.4);
      ctx.lineTo(fx + fw - 6, gy + 1.4);
      ctx.stroke();
    }

    // Tiny subtle stone cross-hair markers at tile centers (clean tactical cue, no boxes)
    for (let idx = 0; idx < board.field.capacity; idx++) {
      const cell = board.getSlotRect({ area: 'field', index: idx });
      const mx = cell.x + cell.w * 0.5;
      const my = cell.y + cell.h * 0.5 + 14;
      ctx.fillStyle = 'rgba(150, 126, 94, 0.2)';
      ctx.beginPath();
      ctx.ellipse(mx, my, 18, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Inner stone edge highlight & shadow
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.fillRect(fx, fy, fw, 3);
    ctx.restore();

    // Inner golden trim line
    ctx.beginPath();
    ctx.roundRect(fx, fy, fw, fh, 12);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(202, 165, 92, 0.7)';
    ctx.stroke();
  }

  /* ---------------------------------------------------------------- */
  /*  5. Open Bench Slab (6x2 대기석 — Continuous Stone Courtyard)      */
  /* ---------------------------------------------------------------- */

  private paintOpenBenchSlab(ctx: CanvasRenderingContext2D, board: Board): void {
    const { x, y, w, h, r } = TRAY;

    // 3D drop shadow
    ctx.beginPath();
    ctx.roundRect(x, y + 7, w, h, r);
    ctx.fillStyle = PIXEL_OUTLINE;
    ctx.fill();

    // Single outer warm timber & dancheong pavilion curb
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    const frameGrad = ctx.createLinearGradient(0, y, 0, y + h);
    frameGrad.addColorStop(0, '#6d3128');
    frameGrad.addColorStop(0.55, '#52221c');
    frameGrad.addColorStop(1, '#361511');
    ctx.fillStyle = frameGrad;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.stroke();

    // Continuous unified ivory limestone slab inside bench
    const ix = x + 7;
    const iy = y + 7;
    const iw = w - 14;
    const ih = h - 14;
    const ir = r - 5;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(ix, iy, iw, ih, ir);
    ctx.clip();

    const slab = ctx.createLinearGradient(0, iy, 0, iy + ih);
    slab.addColorStop(0, '#f5efe0');
    slab.addColorStop(0.6, '#eae0c9');
    slab.addColorStop(1, '#dcd0b4');
    ctx.fillStyle = slab;
    ctx.fillRect(ix, iy, iw, ih);

    // Subtle engraved stone grout seams for 6x2 대기석 (zero chunky per-slot borders)
    const b = board.config.bench;
    const stepX = b.cellW + b.gapX;
    const stepY = b.cellH + b.gapY;
    for (let c = 1; c < b.cols; c++) {
      const gx = b.originX + c * stepX - b.gapX * 0.5;
      ctx.strokeStyle = 'rgba(136, 114, 84, 0.28)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(gx, iy + 5);
      ctx.lineTo(gx, iy + ih - 5);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.52)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gx + 1.3, iy + 5);
      ctx.lineTo(gx + 1.3, iy + ih - 5);
      ctx.stroke();
    }
    for (let row = 1; row < b.rows; row++) {
      const gy = b.originY + row * stepY - b.gapY * 0.5;
      ctx.strokeStyle = 'rgba(136, 114, 84, 0.28)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(ix + 6, gy);
      ctx.lineTo(ix + iw - 6, gy);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.52)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ix + 6, gy + 1.3);
      ctx.lineTo(ix + iw - 6, gy + 1.3);
      ctx.stroke();
    }

    // Subtle circular stand spots per slot
    for (let idx = 0; idx < board.bench.capacity; idx++) {
      const cell = board.getSlotRect({ area: 'bench', index: idx });
      const mx = cell.x + cell.w * 0.5;
      const my = cell.y + cell.h * 0.5 + 14;
      ctx.fillStyle = 'rgba(150, 126, 94, 0.19)';
      ctx.beginPath();
      ctx.ellipse(mx, my, 17, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillRect(ix, iy, iw, 2.5);
    ctx.restore();

    ctx.beginPath();
    ctx.roundRect(ix, iy, iw, ih, ir);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(202, 165, 92, 0.68)';
    ctx.stroke();
  }
}
