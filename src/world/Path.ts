import type { Vec2 } from '../data/types';

interface PathSegment {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly length: number;
  readonly startDist: number;
}

export class LoopPath {
  public readonly waypoints: readonly Vec2[];
  public readonly segments: readonly PathSegment[];
  public readonly totalLength: number;

  public constructor(waypoints: readonly Vec2[]) {
    if (waypoints.length < 3) {
      throw new Error('[LoopPath] requires at least 3 waypoints');
    }
    this.waypoints = waypoints;
    const segs: PathSegment[] = [];
    let acc = 0;

    for (let i = 0; i < waypoints.length; i++) {
      const a = waypoints[i]!;
      const b = waypoints[(i + 1) % waypoints.length]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      segs.push({
        ax: a.x,
        ay: a.y,
        bx: b.x,
        by: b.y,
        length: len,
        startDist: acc,
      });
      acc += len;
    }

    this.segments = segs;
    this.totalLength = acc;
  }

  public sample(distance: number): Vec2 {
    if (this.totalLength <= 0) {
      return this.waypoints[0]!;
    }
    let wrapped = distance % this.totalLength;
    if (wrapped < 0) {
      wrapped += this.totalLength;
    }

    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i]!;
      if (wrapped <= seg.startDist + seg.length || i === this.segments.length - 1) {
        const local = seg.length > 0 ? (wrapped - seg.startDist) / seg.length : 0;
        const t = Math.max(0, Math.min(1, local));
        return {
          x: seg.ax + (seg.bx - seg.ax) * t,
          y: seg.ay + (seg.by - seg.ay) * t,
        };
      }
    }
    return this.waypoints[0]!;
  }
}
