import type { SlotRef } from '../core/CommandQueue';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../platform/Viewport';
import type { Board } from '../world/Board';
import type { LoopPath } from '../world/Path';
import type { CellRect } from '../world/SlotGrid';
import { PIXEL_OUTLINE } from './ChibiPainter';

/** Visual inflation of slot tiles into configured gaps (hit-testing still uses board.json). */
const FIELD_INFLATE_X = 2.5;
const FIELD_INFLATE_Y = 3;
const BENCH_INFLATE = 2.5;

/** Dancheong bench pavilion tray frame (logical px). */
const TRAY = { x: 34, y: 734, w: 652, h: 214, r: 22 } as const;

/** Drawn (inflated) tile rect for a slot. Renderer uses it for selection/hover highlights. */
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
 * Paints the bright '청죽림 백옥 비무대' (Azure Bamboo Forest & White-Jade Martial Arena):
 * 1. Refreshing celadon-jade lotus pond moat + green bamboo stalks & leaves along perimeter.
 * 2. White-granite & vermilion terrace foundation.
 * 3. Sunlit ochre & bluestone (황토·청석) flagstone monster track with red dancheong rails.
 * 4. Warm white-jade (백옥) courtyard plaza with engraved Taiji medallion.
 * 5. Bright ivory white-jade slot tiles framed by red dancheong wood on both 6x3 arena & 6x2 bench.
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

    this.paintJadePondAndBamboo(ctx);
    this.paintTerrace(ctx, board);
    this.paintWhiteJadePlaza(ctx, ring);
    this.paintOchreBluestoneTrack(ctx, ring);
    this.paintFieldFrame(ctx, board);
    for (let i = 0; i < board.field.capacity; i++) {
      this.paintJadeDancheongTile(ctx, expandedSlotRect(board, { area: 'field', index: i }), true);
    }
    this.paintBenchTray(ctx);
    for (let i = 0; i < board.bench.capacity; i++) {
      this.paintJadeDancheongTile(ctx, expandedSlotRect(board, { area: 'bench', index: i }), false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  1. Jade Lotus Pond Moat + Green Bamboo Forest Perimeter          */
  /* ---------------------------------------------------------------- */

  private paintJadePondAndBamboo(ctx: CanvasRenderingContext2D): void {
    const g = ctx.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT);
    g.addColorStop(0, '#125e57');
    g.addColorStop(0.35, '#1c8579');
    g.addColorStop(0.72, '#177066');
    g.addColorStop(1, '#0f4c45');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // Sunlit jade water caustics around the arena
    const rg = ctx.createRadialGradient(360, 480, 80, 360, 480, 700);
    rg.addColorStop(0, 'rgba(110, 231, 183, 0.25)');
    rg.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // Gentle pond ripples
    ctx.lineCap = 'round';
    ctx.lineWidth = 2;
    for (let row = 0, wy = 32; wy < LOGICAL_HEIGHT; wy += 64, row++) {
      for (let wx = (row % 2) * 58 - 10; wx < LOGICAL_WIDTH + 30; wx += 118) {
        const h = hash2(wx, wy);
        ctx.strokeStyle = `rgba(204, 251, 241, ${(0.08 + h * 0.08).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(wx + h * 24, wy, 14 + h * 9, Math.PI * 1.12, Math.PI * 1.88);
        ctx.stroke();
      }
    }

    // Floating lotus pads (연잎) & pink lotus buds (연꽃) in top/side pond water
    const lotusSpots = [
      { x: 54, y: 102, r: 20, flower: true },
      { x: 668, y: 105, r: 19, flower: true },
      { x: 26, y: 420, r: 16, flower: false },
      { x: 696, y: 360, r: 16, flower: false },
      { x: 30, y: 724, r: 18, flower: true },
      { x: 690, y: 722, r: 17, flower: false },
      { x: 96, y: 970, r: 20, flower: true },
      { x: 626, y: 968, r: 19, flower: true },
    ];
    for (const lp of lotusSpots) {
      // Water ripple ring
      ctx.beginPath();
      ctx.arc(lp.x, lp.y, lp.r + 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(204, 251, 241, 0.25)';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Notched green lotus leaf
      ctx.beginPath();
      ctx.moveTo(lp.x, lp.y);
      ctx.arc(lp.x, lp.y, lp.r, 0.25, Math.PI * 2 - 0.25);
      ctx.closePath();
      ctx.fillStyle = '#16a34a';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#14532d';
      ctx.stroke();

      // Inner leaf highlight
      ctx.beginPath();
      ctx.arc(lp.x - 2, lp.y - 2, lp.r * 0.55, 0.4, Math.PI * 1.8);
      ctx.strokeStyle = '#86efac';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      if (lp.flower) {
        const fx = lp.x + lp.r * 0.45;
        const fy = lp.y - lp.r * 0.35;
        for (let p = 0; p < 5; p++) {
          const a = (p * Math.PI * 2) / 5 - Math.PI * 0.5;
          ctx.beginPath();
          ctx.ellipse(fx + Math.cos(a) * 4.5, fy + Math.sin(a) * 4.5, 4.5, 2.6, a, 0, Math.PI * 2);
          ctx.fillStyle = p % 2 === 0 ? '#fda4af' : '#fb7185';
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(fx, fy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fde047';
        ctx.fill();
      }
    }

    // Green Bamboo Forest (청죽림) stalks & leaf clusters framing left & right edges
    const bambooStalks = [
      { x: 8, tilt: 0.03, w: 9 },
      { x: 20, tilt: -0.02, w: 7 },
      { x: 700, tilt: -0.03, w: 9 },
      { x: 712, tilt: 0.02, w: 7 },
    ];
    for (const st of bambooStalks) {
      ctx.save();
      ctx.translate(st.x, 0);
      for (let segY = 0; segY < 1020; segY += 76) {
        const sx = Math.sin(segY * 0.01) * st.tilt * 80;
        const grad = ctx.createLinearGradient(sx - st.w * 0.5, 0, sx + st.w * 0.5, 0);
        grad.addColorStop(0, '#86efac');
        grad.addColorStop(0.45, '#22c55e');
        grad.addColorStop(1, '#14532d');
        ctx.fillStyle = grad;
        ctx.fillRect(sx - st.w * 0.5, segY, st.w, 73);
        // Bamboo node joint
        ctx.fillStyle = '#dcfce7';
        ctx.fillRect(sx - st.w * 0.6, segY + 72, st.w * 1.2, 3);
      }
      ctx.restore();
    }

    // Pointed bamboo leaf clusters (댓잎) along outer corners
    const leafClusters = [
      { x: 18, y: 84, dir: 1 },
      { x: 14, y: 240, dir: 1 },
      { x: 16, y: 540, dir: 1 },
      { x: 18, y: 695, dir: 1 },
      { x: 702, y: 88, dir: -1 },
      { x: 706, y: 255, dir: -1 },
      { x: 704, y: 555, dir: -1 },
      { x: 702, y: 700, dir: -1 },
    ];
    for (const lc of leafClusters) {
      for (let k = -1; k <= 1; k++) {
        const ang = (lc.dir > 0 ? 0.35 : Math.PI - 0.35) + k * 0.34;
        ctx.save();
        ctx.translate(lc.x, lc.y);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.ellipse(15, 0, 16, 4.2, 0, 0, Math.PI * 2);
        ctx.fillStyle = k === 0 ? '#4ade80' : '#16a34a';
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = '#14532d';
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /*  2. White-Granite & Vermilion Pavilion Terrace                    */
  /* ---------------------------------------------------------------- */

  private paintTerrace(ctx: CanvasRenderingContext2D, board: Board): void {
    const ar = board.config.arenaRect;
    // Soft pond reflection halo
    ctx.beginPath();
    ctx.roundRect(ar.x - 6, ar.y - 6, ar.w + 12, ar.h + 18, 28);
    ctx.fillStyle = 'rgba(204, 251, 241, 0.16)';
    ctx.fill();

    // 3D granite plinth lip
    ctx.beginPath();
    ctx.roundRect(ar.x, ar.y + 9, ar.w, ar.h, 24);
    ctx.fillStyle = PIXEL_OUTLINE;
    ctx.fill();

    // Carved white-granite & vermilion border foundation
    ctx.beginPath();
    ctx.roundRect(ar.x, ar.y, ar.w, ar.h, 24);
    const g = ctx.createLinearGradient(0, ar.y, 0, ar.y + ar.h);
    g.addColorStop(0, '#991b1b');
    g.addColorStop(0.5, '#7f1d1d');
    g.addColorStop(1, '#581313');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.stroke();
  }

  /* ---------------------------------------------------------------- */
  /*  3. White-Jade Inner Courtyard Plaza + Taiji Medallion            */
  /* ---------------------------------------------------------------- */

  private paintWhiteJadePlaza(ctx: CanvasRenderingContext2D, r: RingGeom): void {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(r.ix, r.iy, r.iw, r.ih, 10);
    ctx.clip();

    const g = ctx.createLinearGradient(0, r.iy, 0, r.iy + r.ih);
    g.addColorStop(0, '#efe9da');
    g.addColorStop(1, '#dfd5be');
    ctx.fillStyle = g;
    ctx.fillRect(r.ix, r.iy, r.iw, r.ih);

    // Subtle white-jade stone masonry grid
    ctx.strokeStyle = 'rgba(146, 125, 96, 0.22)';
    ctx.lineWidth = 1.2;
    for (let y = r.iy + 44; y < r.iy + r.ih; y += 44) {
      ctx.beginPath();
      ctx.moveTo(r.ix, y);
      ctx.lineTo(r.ix + r.iw, y);
      ctx.stroke();
    }

    // Subtle carved Taiji (태극) watermark at plaza center
    const cx = r.ix + r.iw * 0.5;
    const cy = r.iy + r.ih * 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 138, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(161, 138, 104, 0.25)';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.restore();
  }

  /* ---------------------------------------------------------------- */
  /*  4. Bright Ochre & Bluestone (황토·청석) Monster Loop Track       */
  /* ---------------------------------------------------------------- */

  private paintOchreBluestoneTrack(ctx: CanvasRenderingContext2D, r: RingGeom): void {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(r.ox, r.oy, r.ow, r.oh, 18);
    ctx.roundRect(r.ix, r.iy, r.iw, r.ih, 10);
    ctx.clip('evenodd');

    // Warm sunlit 황토 (ochre earth) base
    const roadGrad = ctx.createLinearGradient(0, r.oy, 0, r.oy + r.oh);
    roadGrad.addColorStop(0, '#ebd5b0');
    roadGrad.addColorStop(0.5, '#e0c496');
    roadGrad.addColorStop(1, '#d2b27e');
    ctx.fillStyle = roadGrad;
    ctx.fillRect(r.ox, r.oy, r.ow, r.oh);

    // Alternating 청석 (pale bluestone) & 황석 (warm sandstone) flagstones along the loop
    const step = 36;
    const pad = 8;
    const drawFlagstone = (fx: number, fy: number, fw: number, fh: number, idx: number): void => {
      const isBlue = idx % 2 === 0;
      ctx.beginPath();
      ctx.roundRect(fx, fy, fw, fh, 5);
      ctx.fillStyle = isBlue ? '#d7e2ea' : '#efe0c2';
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = 'rgba(120, 95, 65, 0.42)';
      ctx.stroke();

      // Top highlight edge
      ctx.fillStyle = 'rgba(255, 255, 255, 0.48)';
      ctx.fillRect(fx + 3, fy + 2, fw - 6, 2.5);
    };

    let idx = 0;
    // Top & bottom corridors
    for (let sx = r.ox + 14; sx < r.ox + r.ow - 42; sx += step) {
      drawFlagstone(sx, r.oy + pad, step - 6, r.iy - r.oy - pad * 2, idx++);
      drawFlagstone(sx, r.iy + r.ih + pad, step - 6, r.oy + r.oh - (r.iy + r.ih) - pad * 2, idx++);
    }
    // Left & right corridors
    for (let sy = r.iy + 8; sy < r.iy + r.ih - 28; sy += step) {
      drawFlagstone(r.ox + pad, sy, r.ix - r.ox - pad * 2, step - 6, idx++);
      drawFlagstone(r.ix + r.iw + pad, sy, r.ox + r.ow - (r.ix + r.iw) - pad * 2, step - 6, idx++);
    }

    ctx.restore();

    // Vermilion & gold Dancheong wooden rails framing outer and inner track edges
    this.paintDancheongRail(ctx, r.ox, r.oy, r.ow, r.oh, 18);
    this.paintDancheongRail(ctx, r.ix, r.iy, r.iw, r.ih, 10);
  }

  private paintDancheongRail(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    rad: number,
  ): void {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, rad);
    ctx.lineWidth = 8.5;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(x, y, w, h, rad);
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = '#b91c1c';
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(x, y, w, h, rad);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#fca5a5';
    ctx.stroke();

    // 4 golden brass corner studs
    const posts = [
      [x + 6, y + 6],
      [x + w - 6, y + 6],
      [x + w - 6, y + h - 6],
      [x + 6, y + h - 6],
    ] as const;
    for (const [px, py] of posts) {
      ctx.beginPath();
      ctx.arc(px, py, 5.2, 0, Math.PI * 2);
      ctx.fillStyle = '#facc15';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = PIXEL_OUTLINE;
      ctx.stroke();
    }
  }

  /* ---------------------------------------------------------------- */
  /*  5. Field Frame & Bench Pavilion Tray                             */
  /* ---------------------------------------------------------------- */

  private paintFieldFrame(ctx: CanvasRenderingContext2D, board: Board): void {
    const f = board.config.field;
    const totalW = f.cols * f.cellW + (f.cols - 1) * f.gapX;
    const totalH = f.rows * f.cellH + (f.rows - 1) * f.gapY;
    const pad = 9;
    const x = f.originX - pad;
    const y = f.originY - pad;
    const w = totalW + pad * 2;
    const h = totalH + pad * 2;

    // Jade-green & vermilion Dancheong platform mat under the 6x3 slots
    ctx.beginPath();
    ctx.roundRect(x, y + 4, w, h, 16);
    ctx.fillStyle = 'rgba(26, 18, 36, 0.2)';
    ctx.fill();

    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 16);
    ctx.fillStyle = '#115e59';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(x + 3, y + 3, w - 6, h - 6, 13);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#eab308';
    ctx.stroke();
  }

  private paintBenchTray(ctx: CanvasRenderingContext2D): void {
    const { x, y, w, h, r } = TRAY;

    // 3D drop shadow
    ctx.beginPath();
    ctx.roundRect(x, y + 8, w, h, r);
    ctx.fillStyle = PIXEL_OUTLINE;
    ctx.fill();

    // Vermilion Dancheong wooden pavilion frame
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    const frameGrad = ctx.createLinearGradient(0, y, 0, y + h);
    frameGrad.addColorStop(0, '#b91c1c');
    frameGrad.addColorStop(0.5, '#881337');
    frameGrad.addColorStop(1, '#4c0519');
    ctx.fillStyle = frameGrad;
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.stroke();

    // Warm jade-stone recessed bed inside tray
    ctx.beginPath();
    ctx.roundRect(x + 9, y + 9, w - 18, h - 18, r - 6);
    ctx.fillStyle = '#d6cbb5';
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#eab308';
    ctx.stroke();
  }

  /* ---------------------------------------------------------------- */
  /*  6. Bright White-Jade Tile + Red Dancheong Wood Border            */
  /* ---------------------------------------------------------------- */

  private paintJadeDancheongTile(
    ctx: CanvasRenderingContext2D,
    r: CellRect,
    isField: boolean,
  ): void {
    const rad = isField ? 11 : 10;

    // Subtle 3D bottom lip
    ctx.beginPath();
    ctx.roundRect(r.x, r.y + 3, r.w, r.h, rad);
    ctx.fillStyle = PIXEL_OUTLINE;
    ctx.fill();

    // Outer Red Dancheong wood border (붉은 단청 나무 테두리)
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, rad);
    const wood = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    wood.addColorStop(0, '#c82828');
    wood.addColorStop(0.55, '#991b1b');
    wood.addColorStop(1, '#6b1212');
    ctx.fillStyle = wood;
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = PIXEL_OUTLINE;
    ctx.stroke();

    // Inner bright White-Jade / Hanji recessed slab (화사한 백옥 톤 — zero dark navy!)
    const inset = 4.5;
    const ix = r.x + inset;
    const iy = r.y + inset;
    const iw = r.w - inset * 2;
    const ih = r.h - inset * 2;
    const irad = Math.max(5, rad - 3);

    ctx.beginPath();
    ctx.roundRect(ix, iy, iw, ih, irad);
    const jade = ctx.createLinearGradient(0, iy, 0, iy + ih);
    if (isField) {
      jade.addColorStop(0, '#fbf8f0');
      jade.addColorStop(0.6, '#f3ecdc');
      jade.addColorStop(1, '#e6dcc6');
    } else {
      jade.addColorStop(0, '#f8f3e6');
      jade.addColorStop(0.65, '#eee5d1');
      jade.addColorStop(1, '#dfd3ba');
    }
    ctx.fillStyle = jade;
    ctx.fill();

    // Soft top recessed inner bevel + crisp ivory bottom catchlight
    ctx.beginPath();
    ctx.roundRect(ix + 1, iy + 1, iw - 2, ih - 2, irad - 1);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(154, 132, 102, 0.42)';
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(ix + 5, iy + 2, iw - 10, 2.5);

    // Subtle traditional oriental corner fret line on white jade
    ctx.strokeStyle = 'rgba(180, 158, 125, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ix + 5, iy + 6, iw - 10, ih - 12);

    // Tiny golden dancheong corner pins on outer wood frame
    ctx.fillStyle = '#facc15';
    ctx.fillRect(r.x + 2.5, r.y + 2.5, 2.5, 2.5);
    ctx.fillRect(r.x + r.w - 5, r.y + 2.5, 2.5, 2.5);
    ctx.fillRect(r.x + 2.5, r.y + r.h - 5, 2.5, 2.5);
    ctx.fillRect(r.x + r.w - 5, r.y + r.h - 5, 2.5, 2.5);
  }
}
