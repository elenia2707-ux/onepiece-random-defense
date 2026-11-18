import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../platform/Viewport';

export type QualityLevel = 'high' | 'mid' | 'low';

export const QUALITY_DPR_CAP: Readonly<Record<QualityLevel, number>> = {
  high: 2,
  mid: 1.5,
  low: 1,
};

/**
 * Owns the exact 3 physical canvases (#bg-canvas, #world-canvas, #overlay-canvas)
 * and #shake-layer. Sole location where DPR cap (<= 2) is calculated (AGENTS.md §2).
 */
export class CanvasStack {
  public readonly shakeLayer: HTMLElement;
  public readonly bgCanvas: HTMLCanvasElement;
  public readonly worldCanvas: HTMLCanvasElement;
  public readonly overlayCanvas: HTMLCanvasElement;

  public readonly bgCtx: CanvasRenderingContext2D;
  public readonly worldCtx: CanvasRenderingContext2D;
  public readonly overlayCtx: CanvasRenderingContext2D;

  private quality: QualityLevel = 'high';
  private currentScale = 1;
  private matrixScale = 1;
  private overlayVisible = false;
  private isShaking = false;

  public constructor() {
    const shake = document.getElementById('shake-layer');
    const bg = document.getElementById('bg-canvas');
    const world = document.getElementById('world-canvas');
    const overlay = document.getElementById('overlay-canvas');

    if (
      !(shake instanceof HTMLElement) ||
      !(bg instanceof HTMLCanvasElement) ||
      !(world instanceof HTMLCanvasElement) ||
      !(overlay instanceof HTMLCanvasElement)
    ) {
      throw new Error('[CanvasStack] Missing required 3-canvas DOM elements');
    }

    const bgCtx = bg.getContext('2d', { alpha: false });
    const worldCtx = world.getContext('2d', { alpha: true });
    const overlayCtx = overlay.getContext('2d', { alpha: true });

    if (!bgCtx || !worldCtx || !overlayCtx) {
      throw new Error('[CanvasStack] Failed to initialize 2D rendering contexts');
    }

    this.shakeLayer = shake;
    this.bgCanvas = bg;
    this.worldCanvas = world;
    this.overlayCanvas = overlay;
    this.bgCtx = bgCtx;
    this.worldCtx = worldCtx;
    this.overlayCtx = overlayCtx;

    this.overlayCanvas.style.display = 'none';
  }

  public getQuality(): QualityLevel {
    return this.quality;
  }

  public getMatrixScale(): number {
    return this.matrixScale;
  }

  public setQuality(next: QualityLevel): boolean {
    if (this.quality === next) return false;
    this.quality = next;
    this.resize(this.currentScale);
    return true;
  }

  public downgradeQuality(): boolean {
    if (this.quality === 'high') {
      return this.setQuality('mid');
    }
    if (this.quality === 'mid') {
      return this.setQuality('low');
    }
    return false;
  }

  public resize(scale: number): void {
    this.currentScale = scale;
    const renderDpr = Math.min(window.devicePixelRatio || 1, 2, QUALITY_DPR_CAP[this.quality]);
    const backingW = Math.max(1, Math.round(LOGICAL_WIDTH * scale * renderDpr));
    const backingH = Math.max(1, Math.round(LOGICAL_HEIGHT * scale * renderDpr));
    const cssW = `${(LOGICAL_WIDTH * scale).toFixed(2)}px`;
    const cssH = `${(LOGICAL_HEIGHT * scale).toFixed(2)}px`;

    this.matrixScale = scale * renderDpr;

    const configure = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void => {
      if (canvas.width !== backingW || canvas.height !== backingH) {
        canvas.width = backingW;
        canvas.height = backingH;
      }
      canvas.style.width = cssW;
      canvas.style.height = cssH;
      ctx.setTransform(this.matrixScale, 0, 0, this.matrixScale, 0, 0);
    };

    configure(this.bgCanvas, this.bgCtx);
    configure(this.worldCanvas, this.worldCtx);
    configure(this.overlayCanvas, this.overlayCtx);
  }

  public setOverlayActive(active: boolean): void {
    if (this.overlayVisible === active) return;
    this.overlayVisible = active;
    this.overlayCanvas.style.display = active ? 'block' : 'none';
  }

  public setShakeOffset(dxLogical: number, dyLogical: number): void {
    if (Math.abs(dxLogical) < 0.05 && Math.abs(dyLogical) < 0.05) {
      if (this.isShaking) {
        this.shakeLayer.style.transform = 'none';
        this.isShaking = false;
      }
      return;
    }
    const pxX = dxLogical * this.currentScale;
    const pxY = dyLogical * this.currentScale;
    this.shakeLayer.style.transform = `translate3d(${pxX.toFixed(2)}px, ${pxY.toFixed(2)}px, 0)`;
    this.isShaking = true;
  }
}
