import type { Viewport } from '../platform/Viewport';
import type { DragController } from './DragController';

/**
 * Binds pointer listeners exclusively to #world-canvas (AGENTS.md §2).
 */
export class InputManager {
  private readonly worldCanvas: HTMLCanvasElement;
  private readonly viewport: Viewport;
  private readonly drag: DragController;

  public constructor(worldCanvas: HTMLCanvasElement, viewport: Viewport, drag: DragController) {
    this.worldCanvas = worldCanvas;
    this.viewport = viewport;
    this.drag = drag;
  }

  public mount(): void {
    this.worldCanvas.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      this.worldCanvas.setPointerCapture(e.pointerId);
      const pt = this.viewport.clientToLogical(e.clientX, e.clientY, this.worldCanvas);
      this.drag.onPointerDown(e.pointerId, pt.x, pt.y);
    });

    this.worldCanvas.addEventListener('pointermove', (e: PointerEvent) => {
      const pt = this.viewport.clientToLogical(e.clientX, e.clientY, this.worldCanvas);
      this.drag.onPointerMove(e.pointerId, pt.x, pt.y);
    });

    this.worldCanvas.addEventListener('pointerup', (e: PointerEvent) => {
      if (this.worldCanvas.hasPointerCapture(e.pointerId)) {
        this.worldCanvas.releasePointerCapture(e.pointerId);
      }
      const pt = this.viewport.clientToLogical(e.clientX, e.clientY, this.worldCanvas);
      this.drag.onPointerUp(e.pointerId, pt.x, pt.y);
    });

    this.worldCanvas.addEventListener('pointercancel', (e: PointerEvent) => {
      this.drag.onPointerCancel(e.pointerId);
    });
  }
}
