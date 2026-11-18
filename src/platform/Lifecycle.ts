import type { GameLoop } from '../core/GameLoop';

export class Lifecycle {
  private readonly loop: GameLoop;
  private readonly onAutoPaused?: () => void;

  public constructor(loop: GameLoop, onAutoPaused?: () => void) {
    this.loop = loop;
    this.onAutoPaused = onAutoPaused;
  }

  public mount(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.loop.pauseAndResetAccumulator();
        this.onAutoPaused?.();
      }
    });
  }
}
