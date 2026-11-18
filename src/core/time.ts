export const TICK_HZ = 30;
export const TICK_DT = 1 / TICK_HZ;
export const MAX_TICKS_PER_FRAME = 12;

export type Speed = 0 | 1 | 2 | 3;

export function secToTicks(seconds: number): number {
  return Math.round(seconds * TICK_HZ);
}

export function ticksToClock(ticks: number): string {
  const clamped = Math.max(0, ticks);
  const totalSeconds = Math.ceil(clamped / TICK_HZ);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
