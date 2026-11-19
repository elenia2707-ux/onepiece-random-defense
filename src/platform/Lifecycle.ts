import type { GameLoop } from '../core/GameLoop';

export class Lifecycle {
  private readonly loop: GameLoop;
  private readonly onAutoPaused?: () => void;
  private readonly onFlushSave?: () => void;

  public constructor(loop: GameLoop, onAutoPaused?: () => void, onFlushSave?: () => void) {
    this.loop = loop;
    this.onAutoPaused = onAutoPaused;
    this.onFlushSave = onFlushSave;
  }

  public mount(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.onFlushSave?.();
        this.loop.pauseAndResetAccumulator();
        this.onAutoPaused?.();
      }
    });
    window.addEventListener('pagehide', () => {
      this.onFlushSave?.();
    });
    window.addEventListener('beforeunload', () => {
      this.onFlushSave?.();
    });
  }
}
