import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../platform/Viewport';
import type { Board } from '../world/Board';
import type { LoopPath } from '../world/Path';

/**
 * Paints static arena, perimeter monster corridor, 6x3 field grid, and 6x2 bench grid
 * onto #bg-canvas ONLY on initialization and viewport resize.
 */
export class BackgroundPainter {
  public paint(ctx: CanvasRenderingContext2D, board: Board, path: LoopPath): void {
    const cfg = board.config;

    // 1. Base tactical slate backdrop
    const bgGrad = ctx.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT);
    bgGrad.addColorStop(0, '#09101d');
    bgGrad.addColorStop(0.55, '#0c1526');
    bgGrad.addColorStop(1, '#070c16');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // 2. Arena outer plate
    const ar = cfg.arenaRect;
    ctx.fillStyle = '#0f192c';
    ctx.beginPath();
    ctx.roundRect(ar.x, ar.y, ar.w, ar.h, 20);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(152, 177, 214, 0.2)';
    ctx.stroke();

    // 3. Monster loop corridor
    const wps = path.waypoints;
    if (wps.length >= 3) {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Corridor outer groove
      ctx.beginPath();
      ctx.moveTo(wps[0]!.x, wps[0]!.y);
      for (let i = 1; i < wps.length; i++) {
        ctx.lineTo(wps[i]!.x, wps[i]!.y);
      }
      ctx.closePath();
      ctx.lineWidth = cfg.path.corridorWidth + 6;
      ctx.strokeStyle = 'rgba(6, 10, 18, 0.9)';
      ctx.stroke();

      // Corridor road surface
      ctx.lineWidth = cfg.path.corridorWidth;
      ctx.strokeStyle = '#16243d';
      ctx.stroke();

      // Center guide line
      ctx.setLineDash([8, 12]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(240, 185, 75, 0.22)';
      ctx.stroke();
      ctx.setLineDash([]);

      // Directional chevrons along path
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
        ctx.moveTo(-5, -6);
        ctx.lineTo(4, 0);
        ctx.lineTo(-5, 6);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(148, 173, 210, 0.28)';
        ctx.stroke();
        ctx.restore();
      }

      // Spawn portal beacon at waypoint 0
      const sp = wps[0]!;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(242, 87, 87, 0.18)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(242, 87, 87, 0.65)';
      ctx.stroke();

      ctx.restore();
    }

    // 4. Inner raised bastion platform around 6x3 field
    const fieldPad = 12;
    const fSpec = cfg.field;
    const fw = fSpec.cols * fSpec.cellW + (fSpec.cols - 1) * fSpec.gapX;
    const fh = fSpec.rows * fSpec.cellH + (fSpec.rows - 1) * fSpec.gapY;
    ctx.fillStyle = '#111d33';
    ctx.beginPath();
    ctx.roundRect(
      fSpec.originX - fieldPad,
      fSpec.originY - fieldPad,
      fw + fieldPad * 2,
      fh + fieldPad * 2,
      16,
    );
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(212, 179, 106, 0.25)';
    ctx.stroke();

    // 5. Field 6x3 cells (18 slots)
    for (let i = 0; i < board.field.capacity; i++) {
      const r = board.field.getCellRect(i);
      ctx.fillStyle = '#172642';
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 12);
      ctx.fill();

      ctx.lineWidth = 1.25;
      ctx.strokeStyle = 'rgba(156, 182, 222, 0.22)';
      ctx.stroke();

      // Subtle center anchor dot
      ctx.beginPath();
      ctx.arc(r.x + r.w * 0.5, r.y + r.h * 0.5, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(156, 182, 222, 0.18)';
      ctx.fill();
    }

    // 6. Bench tray container (y: 708..944)
    ctx.fillStyle = '#0e1729';
    ctx.beginPath();
    ctx.roundRect(24, 708, 672, 236, 18);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(148, 173, 210, 0.18)';
    ctx.stroke();

    // Bench header label (painted once onto static bg-canvas)
    ctx.font = '800 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = '#8fa4c4';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('대기석 · BENCH (12칸 · 전투 미참여 / 조합 인덱싱 포함)', 44, 731);

    // 7. Bench 6x2 cells (12 slots)
    for (let i = 0; i < board.bench.capacity; i++) {
      const r = board.bench.getCellRect(i);
      ctx.fillStyle = '#142038';
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 11);
      ctx.fill();

      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(148, 173, 210, 0.18)';
      ctx.stroke();
    }
  }
}
