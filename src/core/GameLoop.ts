import { MAX_TICKS_PER_FRAME, type Speed, TICK_DT } from './time';
import type { Simulation } from './Simulation';

export interface LoopFrameCallbacks {
  onRender(alpha: number, realNowSec: number): void;
  onSyncUI(nowMs: number, forcePriority: boolean): void;
  onFrameCostMs?(frameMs: number): void;
}

/**
 * Fixed-timestep GameLoop (TICK_HZ = 30, TICK_DT = 1/30).
 * Speed 1x/2x/3x only changes how many integer ticks run per real second, never TICK_DT.
 */
export class GameLoop {
  private readonly sim: Simulation;
  private readonly callbacks: LoopFrameCallbacks;

  private accumulator = 0;
  private lastTimestampMs: number | null = null;
  private rafId: number | null = null;
  private speed: Speed = 1;
  private paused = false;

  public constructor(sim: Simulation, callbacks: LoopFrameCallbacks) {
    this.sim = sim;
    this.callbacks = callbacks;
  }

  public getSpeed(): Speed {
    return this.speed;
  }

  public setSpeed(next: 1 | 2 | 3): void {
    this.speed = next;
  }

  public cycleSpeed(): 1 | 2 | 3 {
    const next: 1 | 2 | 3 = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1;
    this.speed = next;
    return next;
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.accumulator = 0;
    }
  }

  public togglePaused(): boolean {
    this.setPaused(!this.paused);
    return this.paused;
  }

  /**
   * Called by Lifecycle on visibilitychange(hidden) per AGENTS.md §3.
   */
  public pauseAndResetAccumulator(): void {
    this.paused = true;
    this.accumulator = 0;
    this.lastTimestampMs = null;
  }

  /**
   * Pure frame step function usable in both browser rAF and headless determinism tests.
   */
  public stepFrame(nowMs: number): number {
    if (this.lastTimestampMs === null) {
      this.lastTimestampMs = nowMs;
    }
    const rawDeltaSec = Math.max(0, (nowMs - this.lastTimestampMs) / 1000);
    const realDt = Math.min(rawDeltaSec, 0.25);
    this.lastTimestampMs = nowMs;

    const effectiveSpeed: Speed = this.paused ? 0 : this.speed;
    this.accumulator += realDt * effectiveSpeed;

    let ticksExecuted = 0;
    while (this.accumulator >= TICK_DT && ticksExecuted < MAX_TICKS_PER_FRAME) {
      this.sim.tick();
      this.accumulator -= TICK_DT;
      ticksExecuted++;
    }

    if (ticksExecuted === MAX_TICKS_PER_FRAME && this.accumulator >= TICK_DT) {
      // Drop excess accumulated time rather than spiraling (AGENTS.md §3)
      this.accumulator = 0;
    }

    const alpha = this.paused ? 0 : this.accumulator / TICK_DT;
    this.callbacks.onRender(alpha, nowMs / 1000);
    const priority = this.sim.consumePriorityDirty();
    this.callbacks.onSyncUI(nowMs, priority);

    return ticksExecuted;
  }

  public start(): void {
    if (this.rafId !== null) return;
    const onFrame = (nowMs: number): void => {
      const t0 = performance.now();
      this.stepFrame(nowMs);
      const elapsed = performance.now() - t0;
      this.callbacks.onFrameCostMs?.(elapsed);
      this.rafId = window.requestAnimationFrame(onFrame);
    };
    this.rafId = window.requestAnimationFrame(onFrame);
  }

  public stop(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.lastTimestampMs = null;
  }
}
