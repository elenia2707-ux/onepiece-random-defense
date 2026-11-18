import type { SlotRef } from '../core/CommandQueue';
import type { BoardConfig, Vec2 } from '../data/types';
import { type CellRect, SlotGrid } from './SlotGrid';

export class Board {
  public readonly config: BoardConfig;
  public readonly field: SlotGrid;
  public readonly bench: SlotGrid;

  public constructor(config: BoardConfig) {
    this.config = config;
    this.field = new SlotGrid('field', config.field);
    this.bench = new SlotGrid('bench', config.bench);
  }

  public getGrid(area: SlotRef['area']): SlotGrid {
    return area === 'field' ? this.field : this.bench;
  }

  public isValidSlot(ref: SlotRef): boolean {
    const grid = this.getGrid(ref.area);
    return Number.isInteger(ref.index) && ref.index >= 0 && ref.index < grid.capacity;
  }

  public getUid(ref: SlotRef): number | null {
    return this.getGrid(ref.area).getUidAt(ref.index);
  }

  public setUid(ref: SlotRef, uid: number | null): void {
    this.getGrid(ref.area).setUidAt(ref.index, uid);
  }

  public getSlotRect(ref: SlotRef): CellRect {
    return this.getGrid(ref.area).getCellRect(ref.index);
  }

  public getSlotCenter(ref: SlotRef): Vec2 {
    return this.getGrid(ref.area).getCellCenter(ref.index);
  }

  public hitTest(logicalX: number, logicalY: number): SlotRef | null {
    const fieldIdx = this.field.hitTest(logicalX, logicalY);
    if (fieldIdx !== -1) {
      return { area: 'field', index: fieldIdx };
    }
    const benchIdx = this.bench.hitTest(logicalX, logicalY);
    if (benchIdx !== -1) {
      return { area: 'bench', index: benchIdx };
    }
    return null;
  }

  /**
   * Placement priority (AGENTS.md §5):
   * 1) Consumed field slot (if provided and empty)
   * 2) First empty field slot
   * 3) First empty bench slot
   */
  public findPlacementSlot(preferredFieldIndex?: number): SlotRef | null {
    if (
      preferredFieldIndex !== undefined &&
      preferredFieldIndex >= 0 &&
      preferredFieldIndex < this.field.capacity &&
      this.field.getUidAt(preferredFieldIndex) === null
    ) {
      return { area: 'field', index: preferredFieldIndex };
    }
    const emptyField = this.field.firstEmptyIndex();
    if (emptyField !== -1) {
      return { area: 'field', index: emptyField };
    }
    const emptyBench = this.bench.firstEmptyIndex();
    if (emptyBench !== -1) {
      return { area: 'bench', index: emptyBench };
    }
    return null;
  }
}
