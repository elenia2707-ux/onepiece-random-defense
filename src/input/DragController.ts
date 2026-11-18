import type { GameCommand, SlotRef } from '../core/CommandQueue';
import type { Simulation } from '../core/Simulation';
import type { InteractionOverlayState } from '../render/Renderer';

const DRAG_THRESHOLD_LOGICAL = 10;

export class DragController {
  private readonly sim: Simulation;
  private readonly dispatch: (cmd: GameCommand) => void;
  private readonly onSelectionChanged: () => void;

  private selectedSlot: SlotRef | null = null;
  private pointerDownSlot: SlotRef | null = null;
  private pointerId: number | null = null;
  private startX = 0;
  private startY = 0;
  private currX = 0;
  private currY = 0;
  private isDragging = false;
  private hoverTargetSlot: SlotRef | null = null;

  public constructor(
    sim: Simulation,
    dispatch: (cmd: GameCommand) => void,
    onSelectionChanged: () => void,
  ) {
    this.sim = sim;
    this.dispatch = dispatch;
    this.onSelectionChanged = onSelectionChanged;
  }

  public getSelectedSlot(): SlotRef | null {
    if (this.selectedSlot && this.sim.board.getUid(this.selectedSlot) === null) {
      this.selectedSlot = null;
    }
    return this.selectedSlot;
  }

  public clearSelection(): void {
    if (this.selectedSlot !== null) {
      this.selectedSlot = null;
      this.onSelectionChanged();
    }
  }

  public onPointerDown(pointerId: number, logicalX: number, logicalY: number): void {
    if (this.pointerId !== null) return;
    this.pointerId = pointerId;
    this.startX = logicalX;
    this.startY = logicalY;
    this.currX = logicalX;
    this.currY = logicalY;
    this.isDragging = false;
    this.hoverTargetSlot = null;

    const hit = this.sim.board.hitTest(logicalX, logicalY);
    this.pointerDownSlot = hit;
  }

  public onPointerMove(pointerId: number, logicalX: number, logicalY: number): void {
    if (this.pointerId !== pointerId) return;
    this.currX = logicalX;
    this.currY = logicalY;

    if (!this.isDragging && this.pointerDownSlot !== null) {
      const hasUnit = this.sim.board.getUid(this.pointerDownSlot) !== null;
      if (hasUnit) {
        const dist = Math.hypot(logicalX - this.startX, logicalY - this.startY);
        if (dist >= DRAG_THRESHOLD_LOGICAL) {
          this.isDragging = true;
          this.selectedSlot = this.pointerDownSlot;
          this.onSelectionChanged();
        }
      }
    }

    if (this.isDragging) {
      this.hoverTargetSlot = this.sim.board.hitTest(logicalX, logicalY);
    }
  }

  public onPointerUp(pointerId: number, logicalX: number, logicalY: number): void {
    if (this.pointerId !== pointerId) return;
    const hitUp = this.sim.board.hitTest(logicalX, logicalY);

    if (this.isDragging && this.pointerDownSlot !== null) {
      if (
        hitUp !== null &&
        !(hitUp.area === this.pointerDownSlot.area && hitUp.index === this.pointerDownSlot.index)
      ) {
        this.dispatch({ type: 'move', from: this.pointerDownSlot, to: hitUp });
        this.selectedSlot = hitUp;
      }
      this.resetGesture();
      this.onSelectionChanged();
      return;
    }

    // Tap interaction: tap unit to select; tap another slot while selected to move/swap
    if (hitUp === null) {
      this.selectedSlot = null;
    } else {
      const currentSelected = this.getSelectedSlot();
      if (currentSelected === null) {
        if (this.sim.board.getUid(hitUp) !== null) {
          this.selectedSlot = hitUp;
        }
      } else if (
        currentSelected.area === hitUp.area &&
        currentSelected.index === hitUp.index
      ) {
        this.selectedSlot = null;
      } else {
        this.dispatch({ type: 'move', from: currentSelected, to: hitUp });
        this.selectedSlot = hitUp;
      }
    }

    this.resetGesture();
    this.onSelectionChanged();
  }

  public onPointerCancel(pointerId: number): void {
    if (this.pointerId !== pointerId) return;
    this.resetGesture();
    this.onSelectionChanged();
  }

  private resetGesture(): void {
    this.pointerId = null;
    this.pointerDownSlot = null;
    this.isDragging = false;
    this.hoverTargetSlot = null;
  }

  public getOverlayState(): InteractionOverlayState {
    return {
      selectedSlot: this.getSelectedSlot(),
      draggingFromSlot: this.isDragging ? this.pointerDownSlot : null,
      dragLogicalX: this.currX,
      dragLogicalY: this.currY,
      hoverTargetSlot: this.isDragging ? this.hoverTargetSlot : null,
    };
  }
}
