import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../platform/Viewport';
import type { Board } from '../world/Board';
import type { LoopPath } from '../world/Path';

/**
 * Paints Thousand Sunny wooden deck + Emerald Grand Line sea canal + 6x3 field & 6x2 bench
 * onto #bg-canvas ONLY on initialization and viewport resize.
 */
export class BackgroundPainter {
  public paint(ctx: CanvasRenderingContext2D, board: Board, path: LoopPath): void {
    const cfg = board.config;

    // 1. Bright Grand Line sunlit ocean backdrop
    const oceanGrad = ctx.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT);
    oceanGrad.addColorStop(0, '#0ea5e9');
    oceanGrad.addColorStop(0.45, '#0284c7');
    oceanGrad.addColorStop(1, '#075985');
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // Subtle cartoon ocean wave crests
    ctx.strokeStyle = 'rgba(224, 242, 254, 0.22)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let wy = 48; wy < LOGICAL_HEIGHT; wy += 96) {
      for (let wx = 18; wx < LOGICAL_WIDTH; wx += 140) {
        const off = ((wy / 96) % 2) * 55;
        ctx.beginPath();
        ctx.arc(wx + off, wy, 18, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
    }

    // 2. Thousand Sunny outer ship hull & white-crimson railing (arenaRect)
    const ar = cfg.arenaRect;
    // Hull drop shadow
    ctx.fillStyle = 'rgba(12, 34, 59, 0.45)';
    ctx.beginPath();
    ctx.roundRect(ar.x + 2, ar.y + 8, ar.w, ar.h, 28);
    ctx.fill();

    // Crimson Sunny hull outer trim
    ctx.beginPath();
    ctx.roundRect(ar.x, ar.y, ar.w, ar.h, 26);
    ctx.fillStyle = '#dc2626';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#27130a';
    ctx.stroke();

    // Sunny white inner railing band
    ctx.beginPath();
    ctx.roundRect(ar.x + 6, ar.y + 6, ar.w - 12, ar.h - 12, 21);
    ctx.fillStyle = '#fffbeb';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#451a03';
    ctx.stroke();

    // Warm teak main deck base inside railing
    const deckGrad = ctx.createLinearGradient(0, ar.y + 12, 0, ar.y + ar.h - 12);
    deckGrad.addColorStop(0, '#d99b52');
    deckGrad.addColorStop(1, '#b87632');
    ctx.beginPath();
    ctx.roundRect(ar.x + 12, ar.y + 12, ar.w - 24, ar.h - 24, 17);
    ctx.fillStyle = deckGrad;
    ctx.fill();

    // Horizontal ship deck plank lines
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(69, 26, 3, 0.18)';
    ctx.lineWidth = 1.5;
    for (let py = ar.y + 24; py < ar.y + ar.h - 12; py += 22) {
      ctx.beginPath();
      ctx.moveTo(ar.x + 12, py);
      ctx.lineTo(ar.x + ar.w - 12, py);
      ctx.stroke();
    }
    ctx.restore();

    // 3. Emerald Grand Line Sea Canal (Monster Loop Corridor)
    const wps = path.waypoints;
    if (wps.length >= 3) {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      const traceLoop = (): void => {
        ctx.beginPath();
        ctx.moveTo(wps[0]!.x, wps[0]!.y);
        for (let i = 1; i < wps.length; i++) {
          ctx.lineTo(wps[i]!.x, wps[i]!.y);
        }
        ctx.closePath();
      };

      // Dark timber canal curb
      traceLoop();
      ctx.lineWidth = cfg.path.corridorWidth + 14;
      ctx.strokeStyle = '#3b1d0a';
      ctx.stroke();

      // Cream stone canal rim
      traceLoop();
      ctx.lineWidth = cfg.path.corridorWidth + 8;
      ctx.strokeStyle = '#fef3c7';
      ctx.stroke();

      // Deep emerald sea canal base
      traceLoop();
      ctx.lineWidth = cfg.path.corridorWidth + 2;
      ctx.strokeStyle = '#0d9488';
      ctx.stroke();

      // Bright sunlit emerald-turquoise water channel
      traceLoop();
      ctx.lineWidth = cfg.path.corridorWidth - 8;
      ctx.strokeStyle = '#2dd4bf';
      ctx.stroke();

      // Shimmering sea-foam center stream
      ctx.setLineDash([12, 16]);
      traceLoop();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(240, 253, 250, 0.55)';
      ctx.stroke();
      ctx.setLineDash([]);

      // Directional water current chevrons
      const chevronCount = 16;
      for (let i = 0; i < chevronCount; i++) {
        const d1 = (path.totalLength * i) / chevronCount;
        const d2 = d1 + 6;
        const p1 = path.sample(d1);
        const p2 = path.sample(d2);
        const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);

        ctx.save();
        ctx.translate(p1.x, p1.y);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(-6, -7);
        ctx.lineTo(5, 0);
        ctx.lineTo(-6, 7);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.68)';
        ctx.stroke();
        ctx.restore();
      }

      // Grand Line Whirlpool Spawn Portal at Waypoint 0
      const sp = wps[0]!;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 23, 0, Math.PI * 2);
      ctx.fillStyle = '#0284c7';
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#e0f2fe';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 13, 0.3, Math.PI * 1.75);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#bae6fd';
      ctx.stroke();

      // Sunny Mini Lion Medallion at top center of canal border
      const mx = ar.x + ar.w * 0.5;
      const my = ar.y + 14;
      for (let a = 0; a < 10; a++) {
        const ang = (a * Math.PI * 2) / 10;
        ctx.beginPath();
        ctx.arc(mx + Math.cos(ang) * 14, my + Math.sin(ang) * 14, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = '#f97316';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#27130a';
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(mx, my, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#facc15';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#27130a';
      ctx.stroke();

      ctx.restore();
    }

    // 4. Thousand Sunny Lush Lawn Island around 6x3 Field
    const fieldPad = 15;
    const fSpec = cfg.field;
    const fw = fSpec.cols * fSpec.cellW + (fSpec.cols - 1) * fSpec.gapX;
    const fh = fSpec.rows * fSpec.cellH + (fSpec.rows - 1) * fSpec.gapY;

    // Timber curb under lawn
    ctx.beginPath();
    ctx.roundRect(
      fSpec.originX - fieldPad - 3,
      fSpec.originY - fieldPad + 4,
      fw + (fieldPad + 3) * 2,
      fh + fieldPad * 2 + 2,
      22,
    );
    ctx.fillStyle = '#5c2d0c';
    ctx.fill();

    const lawnGrad = ctx.createLinearGradient(
      0,
      fSpec.originY - fieldPad,
      0,
      fSpec.originY + fh + fieldPad,
    );
    lawnGrad.addColorStop(0, '#4ade80');
    lawnGrad.addColorStop(1, '#16a34a');
    ctx.beginPath();
    ctx.roundRect(
      fSpec.originX - fieldPad,
      fSpec.originY - fieldPad,
      fw + fieldPad * 2,
      fh + fieldPad * 2,
      20,
    );
    ctx.fillStyle = lawnGrad;
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#27130a';
    ctx.stroke();

    // 5. Field 6x3 Bright Wooden Deck Tiles (18 slots)
    for (let i = 0; i < board.field.capacity; i++) {
      const r = board.field.getCellRect(i);
      this.paintWoodTile(ctx, r.x, r.y, r.w, r.h, 13, '#fef3c7', '#f5d096', '#b47431');
    }

    // 6. Sunny Quarterdeck Bench Tray (y: 708..944)
    // 3D drop bevel
    ctx.beginPath();
    ctx.roundRect(24, 714, 672, 234, 22);
    ctx.fillStyle = '#27130a';
    ctx.fill();

    const benchTrayGrad = ctx.createLinearGradient(0, 708, 0, 944);
    benchTrayGrad.addColorStop(0, '#9a5220');
    benchTrayGrad.addColorStop(1, '#6b3410');
    ctx.beginPath();
    ctx.roundRect(24, 708, 672, 234, 22);
    ctx.fillStyle = benchTrayGrad;
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#27130a';
    ctx.stroke();

    // Inner highlight rim
    ctx.beginPath();
    ctx.roundRect(29, 713, 662, 224, 18);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(254, 243, 199, 0.35)';
    ctx.stroke();

    // Bench header label (static once on bg-canvas)
    ctx.font = '900 15px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#27130a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const benchLabel = '⚓ 써니호 대기석 (12칸 · 전투 미참여 / 조합 재료 자동 포함)';
    ctx.strokeText(benchLabel, 44, 731);
    ctx.fillStyle = '#fef3c7';
    ctx.fillText(benchLabel, 44, 731);

    // 7. Bench 6x2 Warm Wood Slots (12 slots)
    for (let i = 0; i < board.bench.capacity; i++) {
      const r = board.bench.getCellRect(i);
      this.paintWoodTile(ctx, r.x, r.y, r.w, r.h, 12, '#fde8be', '#eab975', '#9a5d22');
    }
  }

  private paintWoodTile(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
    topColor: string,
    botColor: string,
    lipColor: string,
  ): void {
    // 3D bottom bevel lip
    ctx.beginPath();
    ctx.roundRect(x, y + 3, w, h, radius);
    ctx.fillStyle = lipColor;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#3b1d0a';
    ctx.stroke();

    // Main sunlit plank face
    const g = ctx.createLinearGradient(x, y, x, y + h - 3);
    g.addColorStop(0, topColor);
    g.addColorStop(1, botColor);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h - 3, radius);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#45210c';
    ctx.stroke();

    // Subtle wood plank seam & brass corner nails
    ctx.strokeStyle = 'rgba(120, 53, 15, 0.2)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + h * 0.5);
    ctx.lineTo(x + w - 8, y + h * 0.5);
    ctx.stroke();

    ctx.fillStyle = 'rgba(146, 64, 14, 0.42)';
    for (const [nx, ny] of [
      [x + 8, y + 8],
      [x + w - 8, y + 8],
      [x + 8, y + h - 10],
      [x + w - 8, y + h - 10],
    ] as const) {
      ctx.beginPath();
      ctx.arc(nx, ny, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
