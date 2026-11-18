import type { SlotRef } from '../core/CommandQueue';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../platform/Viewport';
import type { Board } from '../world/Board';
import type { LoopPath } from '../world/Path';
import type { CellRect } from '../world/SlotGrid';

/** Visual inflation of slot tiles into the configured gaps (hit-testing still uses board.json). */
const FIELD_INFLATE_X = 3;
const FIELD_INFLATE_Y = 4;
const BENCH_INFLATE = 3;

/** Bench tray frame (logical px) — shared with the DOM "대기석" badge position in app.css. */
const TRAY = { x: 34, y: 736, w: 652, h: 208, r: 24 } as const;

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
 * Paints the calm deep-ocean map: navy sea → stone island → log-railed cobblestone loop track →
 * dark deck plaza with engraved wood/metal slot tiles → iron-framed bench tray.
 * Executed ONLY on initialization and viewport resize (no text, no filters).
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

    this.paintOcean(ctx);
    this.paintIsland(ctx, board);
    this.paintPlaza(ctx, ring);
    this.paintTrack(ctx, ring);
    this.paintFieldPanel(ctx, board);
    for (let i = 0; i < board.field.capacity; i++) {
      this.paintFieldTile(ctx, expandedSlotRect(board, { area: 'field', index: i }));
    }
    this.paintBenchTray(ctx);
    for (let i = 0; i < board.bench.capacity; i++) {
      this.paintBenchTile(ctx, expandedSlotRect(board, { area: 'bench', index: i }));
    }
  }

  /* ---------------------------------------------------------------- */

  private paintOcean(ctx: CanvasRenderingContext2D): void {
    const g = ctx.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT);
    g.addColorStop(0, '#0b1d3a');
    g.addColorStop(0.45, '#0a2a52');
    g.addColorStop(1, '#071a33');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // Soft vignette light pool in the middle
    const rg = ctx.createRadialGradient(360, 560, 60, 360, 560, 760);
    rg.addColorStop(0, 'rgba(40, 110, 190, 0.22)');
    rg.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // Gentle wave crests
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.5;
    for (let row = 0, wy = 26; wy < LOGICAL_HEIGHT; wy += 58, row++) {
      for (let wx = (row % 2) * 60 - 20; wx < LOGICAL_WIDTH + 40; wx += 120) {
        const h = hash2(wx, wy);
        ctx.strokeStyle = `rgba(140, 195, 255, ${(0.05 + h * 0.07).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(wx + h * 30, wy, 14 + h * 8, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
    }
    // Twinkles
    for (let i = 0; i < 70; i++) {
      const x = hash2(i, 3) * LOGICAL_WIDTH;
      const y = hash2(7, i) * LOGICAL_HEIGHT;
      ctx.fillStyle = `rgba(200, 230, 255, ${(0.08 + hash2(i, i) * 0.18).toFixed(3)})`;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  private paintIsland(ctx: CanvasRenderingContext2D, board: Board): void {
    const ar = board.config.arenaRect;
    // Foam halo
    ctx.beginPath();
    ctx.roundRect(ar.x - 8, ar.y - 8, ar.w + 16, ar.h + 22, 40);
    ctx.fillStyle = 'rgba(160, 210, 255, 0.10)';
    ctx.fill();
    // 3D bottom lip
    ctx.beginPath();
    ctx.roundRect(ar.x, ar.y + 10, ar.w, ar.h, 34);
    ctx.fillStyle = '#050c1c';
    ctx.fill();
    // Stone foundation
    ctx.beginPath();
    ctx.roundRect(ar.x, ar.y, ar.w, ar.h, 34);
    const g = ctx.createLinearGradient(0, ar.y, 0, ar.y + ar.h);
    g.addColorStop(0, '#2b3b58');
    g.addColorStop(1, '#1a2640');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#050c1c';
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(ar.x + 4, ar.y + 4, ar.w - 8, ar.h - 8, 30);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.stroke();
  }

  private paintPlaza(ctx: CanvasRenderingContext2D, r: RingGeom): void {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(r.ix, r.iy, r.iw, r.ih, 10);
    ctx.clip();
    const g = ctx.createLinearGradient(0, r.iy, 0, r.iy + r.ih);
    g.addColorStop(0, '#16294d');
    g.addColorStop(1, '#0f1f3d');
    ctx.fillStyle = g;
    ctx.fillRect(r.ix, r.iy, r.iw, r.ih);
    // Dark deck planks
    const plankH = 26;
    for (let row = 0, y = r.iy; y < r.iy + r.ih; y += plankH, row++) {
      ctx.fillStyle = row % 2 === 0 ? 'rgba(255, 255, 255, 0.025)' : 'rgba(0, 0, 0, 0.06)';
      ctx.fillRect(r.ix, y, r.iw, plankH);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fillRect(r.ix, y + plankH - 2, r.iw, 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(r.ix, y, r.iw, 1);
      const off = (row % 3) * 70;
      for (let x = r.ix + 40 + off; x < r.ix + r.iw; x += 210) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(x, y, 2, plankH - 2);
      }
    }
    // Inner edge ambient occlusion
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(2, 6, 18, 0.35)';
    ctx.strokeRect(r.ix, r.iy, r.iw, r.ih);
    ctx.restore();
  }

  private paintTrack(ctx: CanvasRenderingContext2D, r: RingGeom): void {
    const outerR = 30;
    const innerR = 10;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(r.ox, r.oy, r.ow, r.oh, outerR);
    ctx.roundRect(r.ix, r.iy, r.iw, r.ih, innerR);
    ctx.clip('evenodd');

    ctx.fillStyle = '#3a3f4e';
    ctx.fillRect(r.ox, r.oy, r.ow, r.oh);

    // Cobblestones (brick offset, hashed tones)
    const palette = ['#7d8394', '#8a90a0', '#727889', '#938b7c', '#857e70', '#9aa0ad'];
    const sh = 14;
    for (let row = 0, y = r.oy; y < r.oy + r.oh; y += sh, row++) {
      const offset = row % 2 === 0 ? 0 : 9;
      let x = r.ox - offset;
      let col = 0;
      while (x < r.ox + r.ow) {
        const h = hash2(col * 3 + 1, row * 7 + 2);
        const sw = 15 + Math.floor(h * 8);
        const c = palette[Math.floor(hash2(col, row) * palette.length)] ?? palette[0]!;
        ctx.beginPath();
        ctx.roundRect(x + 1.5, y + 1.5, sw - 3, sh - 3, 4);
        ctx.fillStyle = c;
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fillRect(x + 3, y + 2, sw - 7, 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.fillRect(x + 3, y + sh - 5, sw - 6, 2);
        x += sw;
        col++;
      }
    }
    // Depth: shade near both rails
    ctx.lineWidth = 16;
    ctx.strokeStyle = 'rgba(8, 10, 22, 0.32)';
    ctx.beginPath();
    ctx.roundRect(r.ox, r.oy, r.ow, r.oh, outerR);
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(r.ix, r.iy, r.iw, r.ih, innerR);
    ctx.stroke();
    ctx.restore();

    // Log rails on both edges
    this.paintLogRail(ctx, r.ox, r.oy, r.ow, r.oh, outerR);
    this.paintLogRail(ctx, r.ix, r.iy, r.iw, r.ih, innerR);
  }

  private paintLogRail(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
  ): void {
    const stroke = (lw: number, color: string, dy = 0): void => {
      ctx.beginPath();
      ctx.roundRect(x, y + dy, w, h, radius);
      ctx.lineWidth = lw;
      ctx.strokeStyle = color;
      ctx.stroke();
    };
    stroke(13, '#1a0f07', 2);
    stroke(10, '#6b4220');
    stroke(5, '#8f5c2e', -1);
    stroke(1.5, 'rgba(255, 214, 160, 0.55)', -3);

    // Log joints & rings on straight segments
    ctx.fillStyle = '#2a170a';
    const step = 46;
    for (let px = x + radius + 14; px < x + w - radius - 6; px += step) {
      ctx.fillRect(px, y - 5, 2, 10);
      ctx.fillRect(px, y + h - 5, 2, 10);
    }
    for (let py = y + radius + 14; py < y + h - radius - 6; py += step) {
      ctx.fillRect(x - 5, py, 10, 2);
      ctx.fillRect(x + w - 5, py, 10, 2);
    }
  }

  private paintFieldPanel(ctx: CanvasRenderingContext2D, board: Board): void {
    const f = board.config.field;
    const w = f.cols * f.cellW + (f.cols - 1) * f.gapX;
    const h = f.rows * f.cellH + (f.rows - 1) * f.gapY;
    const x = f.originX - 14;
    const y = f.originY - 14;
    // Raised outer bevel
    ctx.beginPath();
    ctx.roundRect(x - 4, y - 4, w + 36, h + 40, 20);
    ctx.fillStyle = '#050c1c';
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x - 4, y - 6, w + 36, h + 36, 20);
    ctx.fillStyle = '#3d2814';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#120a04';
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(x - 1, y - 3, w + 30, h + 30, 17);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 210, 150, 0.25)';
    ctx.stroke();
    // Recessed inner bed
    ctx.beginPath();
    ctx.roundRect(x + 4, y + 2, w + 20, h + 20, 14);
    const g = ctx.createLinearGradient(0, y, 0, y + h + 24);
    g.addColorStop(0, '#060e22');
    g.addColorStop(1, '#0d1c3a');
    ctx.fillStyle = g;
    ctx.fill();
    // Corner rivets
    const rivets: ReadonlyArray<readonly [number, number]> = [
      [x + 4, y + 1],
      [x + w + 24, y + 1],
      [x + 4, y + h + 24],
      [x + w + 24, y + h + 24],
    ];
    for (const [rx, ry] of rivets) this.rivet(ctx, rx, ry, 4);
  }

  private paintFieldTile(ctx: CanvasRenderingContext2D, r: CellRect): void {
    // Drop lip
    ctx.beginPath();
    ctx.roundRect(r.x, r.y + 3, r.w, r.h, 11);
    ctx.fillStyle = '#03070f';
    ctx.fill();
    // Wood frame
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 11);
    const fg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    fg.addColorStop(0, '#9a6634');
    fg.addColorStop(1, '#5c3a1a');
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#140b04';
    ctx.stroke();
    // Frame top highlight
    ctx.fillStyle = 'rgba(255, 220, 170, 0.35)';
    ctx.fillRect(r.x + 9, r.y + 2, r.w - 18, 1.5);
    // Engraved well
    const inset = 5;
    const wx = r.x + inset;
    const wy = r.y + inset;
    const ww = r.w - inset * 2;
    const wh = r.h - inset * 2;
    ctx.beginPath();
    ctx.roundRect(wx, wy, ww, wh, 7);
    const wg = ctx.createLinearGradient(0, wy, 0, wy + wh);
    wg.addColorStop(0, '#081530');
    wg.addColorStop(0.5, '#10244a');
    wg.addColorStop(1, '#173264');
    ctx.fillStyle = wg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#04091a';
    ctx.stroke();
    // Inner top shadow & bottom bounce light
    const sg = ctx.createLinearGradient(0, wy, 0, wy + 12);
    sg.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
    sg.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = sg;
    ctx.fillRect(wx + 2, wy + 1, ww - 4, 12);
    ctx.fillStyle = 'rgba(120, 175, 255, 0.22)';
    ctx.fillRect(wx + 6, wy + wh - 2.5, ww - 12, 1.5);
    // Stand spot
    ctx.beginPath();
    ctx.ellipse(r.x + r.w * 0.5, wy + wh - 16, ww * 0.34, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(120, 175, 255, 0.07)';
    ctx.fill();
    // Rivets
    this.rivet(ctx, r.x + 5, r.y + 5, 2.4);
    this.rivet(ctx, r.x + r.w - 5, r.y + 5, 2.4);
    this.rivet(ctx, r.x + 5, r.y + r.h - 5, 2.4);
    this.rivet(ctx, r.x + r.w - 5, r.y + r.h - 5, 2.4);
  }

  private paintBenchTray(ctx: CanvasRenderingContext2D): void {
    const t = TRAY;
    ctx.beginPath();
    ctx.roundRect(t.x, t.y + 8, t.w, t.h, t.r);
    ctx.fillStyle = '#03070f';
    ctx.fill();
    // Iron outer frame
    ctx.beginPath();
    ctx.roundRect(t.x, t.y, t.w, t.h, t.r);
    const mg = ctx.createLinearGradient(0, t.y, 0, t.y + t.h);
    mg.addColorStop(0, '#7a879f');
    mg.addColorStop(0.5, '#4b566d');
    mg.addColorStop(1, '#2d3547');
    ctx.fillStyle = mg;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#05080f';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(t.x + t.r, t.y + 2.5, t.w - t.r * 2, 1.5);
    // Dark wood inner bed
    const ix = t.x + 9;
    const iy = t.y + 9;
    const iw = t.w - 18;
    const ih = t.h - 18;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(ix, iy, iw, ih, t.r - 8);
    ctx.clip();
    const wg = ctx.createLinearGradient(0, iy, 0, iy + ih);
    wg.addColorStop(0, '#2a1a0e');
    wg.addColorStop(1, '#3b2614');
    ctx.fillStyle = wg;
    ctx.fillRect(ix, iy, iw, ih);
    for (let y = iy; y < iy + ih; y += 22) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(ix, y + 20, iw, 2);
      ctx.fillStyle = 'rgba(255, 200, 140, 0.05)';
      ctx.fillRect(ix, y, iw, 1);
    }
    const sg = ctx.createLinearGradient(0, iy, 0, iy + 16);
    sg.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    sg.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = sg;
    ctx.fillRect(ix, iy, iw, 16);
    ctx.restore();
    ctx.beginPath();
    ctx.roundRect(ix, iy, iw, ih, t.r - 8);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0a0603';
    ctx.stroke();
    // Frame bolts
    const bolts: ReadonlyArray<readonly [number, number]> = [
      [t.x + 14, t.y + 14],
      [t.x + t.w - 14, t.y + 14],
      [t.x + 14, t.y + t.h - 14],
      [t.x + t.w - 14, t.y + t.h - 14],
    ];
    for (const [bx, by] of bolts) this.rivet(ctx, bx, by, 4);
  }

  private paintBenchTile(ctx: CanvasRenderingContext2D, r: CellRect): void {
    ctx.beginPath();
    ctx.roundRect(r.x, r.y + 3, r.w, r.h, 12);
    ctx.fillStyle = '#05030a';
    ctx.fill();
    // Iron frame
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 12);
    const fg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    fg.addColorStop(0, '#9aa6bd');
    fg.addColorStop(1, '#4a546a');
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#06090f';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillRect(r.x + 10, r.y + 2, r.w - 20, 1.5);
    // Well
    const inset = 5;
    const wx = r.x + inset;
    const wy = r.y + inset;
    const ww = r.w - inset * 2;
    const wh = r.h - inset * 2;
    ctx.beginPath();
    ctx.roundRect(wx, wy, ww, wh, 8);
    const wg = ctx.createLinearGradient(0, wy, 0, wy + wh);
    wg.addColorStop(0, '#120d16');
    wg.addColorStop(1, '#2a2233');
    ctx.fillStyle = wg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#05030a';
    ctx.stroke();
    const sg = ctx.createLinearGradient(0, wy, 0, wy + 12);
    sg.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
    sg.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = sg;
    ctx.fillRect(wx + 2, wy + 1, ww - 4, 12);
    ctx.fillStyle = 'rgba(255, 200, 150, 0.16)';
    ctx.fillRect(wx + 6, wy + wh - 2.5, ww - 12, 1.5);
    ctx.beginPath();
    ctx.ellipse(r.x + r.w * 0.5, wy + wh - 14, ww * 0.32, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 220, 180, 0.05)';
    ctx.fill();
  }

  private rivet(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath();
    ctx.arc(x, y + 0.6, r, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0d16';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = '#c3cbdc';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
}
