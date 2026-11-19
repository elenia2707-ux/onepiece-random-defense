import type { Vec2 } from '../data/types';

export const LOGICAL_WIDTH = 720;
export const LOGICAL_HEIGHT = 1280;

export class Viewport {
  private readonly appEl: HTMLElement;
  private readonly onResizeCallback: (scale: number) => void;
  private scale = 1;
  private desktopWide = false;
  private extraLogicalH = 0;
  private rafPending = false;
  private resizeObserver: ResizeObserver | null = null;

  public constructor(appEl: HTMLElement, onResizeCallback: (scale: number) => void) {
    this.appEl = appEl;
    this.onResizeCallback = onResizeCallback;
  }

  public getScale(): number {
    return this.scale;
  }

  public isDesktopWide(): boolean {
    return this.desktopWide;
  }

  public getExtraLogicalHeight(): number {
    return this.extraLogicalH;
  }

  public mount(): void {
    const scheduleMeasure = (): void => {
      if (this.rafPending) return;
      this.rafPending = true;
      window.requestAnimationFrame(() => {
        this.rafPending = false;
        this.measureNow();
      });
    };

    this.resizeObserver = new ResizeObserver(scheduleMeasure);
    this.resizeObserver.observe(this.appEl);

    window.visualViewport?.addEventListener('resize', scheduleMeasure);
    window.addEventListener('orientationchange', scheduleMeasure);

    // Block iOS Safari pinch / gesture zoom (ignores user-scalable=no on iOS)
    const preventGesture = (e: Event): void => {
      e.preventDefault();
    };
    document.addEventListener('gesturestart', preventGesture, { passive: false });
    document.addEventListener('gesturechange', preventGesture, { passive: false });

    this.measureNow();
  }

  public measureNow(): void {
    const style = window.getComputedStyle(this.appEl);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padRight = parseFloat(style.paddingRight) || 0;
    const padTop = parseFloat(style.paddingTop) || 0;
    const padBottom = parseFloat(style.paddingBottom) || 0;

    const availW = Math.max(120, this.appEl.clientWidth - padLeft - padRight);
    const availH = Math.max(200, this.appEl.clientHeight - padTop - padBottom);

    const isWide = availW >= 1060 && availH >= 580;
    this.desktopWide = isWide;

    // Reserve space for the 2x 276px side wings + gaps on wide desktop viewports
    const stageAvailW = isWide ? Math.max(360, availW - 600) : availW;
    const nextScale = Math.max(0.2, Math.min(stageAvailW / LOGICAL_WIDTH, availH / LOGICAL_HEIGHT));
    this.scale = nextScale;

    // Tall modern phones (e.g. 390x844 ~9:19.5): expand #game-root vertically to eliminate top/bottom void
    const rawExtra = isWide ? 0 : Math.floor(availH / nextScale - LOGICAL_HEIGHT);
    const extraH = rawExtra >= 18 ? Math.min(340, rawExtra) : 0;
    const extraTop = extraH > 0 ? Math.min(112, Math.round(extraH * 0.42)) : 0;
    this.extraLogicalH = extraH;

    this.appEl.style.setProperty('--scale', nextScale.toFixed(5));
    this.appEl.style.setProperty('--extra-h', `${extraH}px`);
    this.appEl.style.setProperty('--extra-top', `${extraTop}px`);
    this.appEl.classList.toggle('is-tall-mobile', extraH >= 40);
    this.appEl.classList.toggle('is-desktop-wide', isWide);
    this.onResizeCallback(nextScale);
  }

  public clientToLogical(clientX: number, clientY: number, canvasEl: HTMLCanvasElement): Vec2 {
    const rect = canvasEl.getBoundingClientRect();
    const relX = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    const relY = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
    return {
      x: relX * LOGICAL_WIDTH,
      y: relY * LOGICAL_HEIGHT,
    };
  }
}
