import type { SlotArea } from '../core/CommandQueue';
import type { GridSpec, Vec2 } from '../data/types';

export interface CellRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export class SlotGrid {
  public readonly area: SlotArea;
  public readonly spec: GridSpec;
  public readonly capacity: number;
  private readonly slots: Array<number | null>;

  public constructor(area: SlotArea, spec: GridSpec) {
    this.area = area;
    this.spec = spec;
    this.capacity = spec.cols * spec.rows;
    this.slots = new Array<number | null>(this.capacity).fill(null);
  }

  public getUidAt(index: number): number | null {
    if (index < 0 || index >= this.capacity) {
      return null;
    }
    return this.slots[index] ?? null;
  }

  public setUidAt(index: number, uid: number | null): void {
    if (index < 0 || index >= this.capacity) {
      throw new Error(`[SlotGrid:${this.area}] out of bounds slot index ${index}`);
    }
    this.slots[index] = uid;
  }

  public firstEmptyIndex(): number {
    for (let i = 0; i < this.capacity; i++) {
      if (this.slots[i] === null) {
        return i;
      }
    }
    return -1;
  }

  public countOccupied(): number {
    let count = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.slots[i] !== null) {
        count++;
      }
    }
    return count;
  }

  public getCellRect(index: number): CellRect {
    const col = index % this.spec.cols;
    const row = Math.floor(index / this.spec.cols);
    const x = this.spec.originX + col * (this.spec.cellW + this.spec.gapX);
    const y = this.spec.originY + row * (this.spec.cellH + this.spec.gapY);
    return { x, y, w: this.spec.cellW, h: this.spec.cellH };
  }

  public getCellCenter(index: number): Vec2 {
    const rect = this.getCellRect(index);
    return {
      x: rect.x + rect.w * 0.5,
      y: rect.y + rect.h * 0.5,
    };
  }

  public hitTest(logicalX: number, logicalY: number): number {
    for (let i = 0; i < this.capacity; i++) {
      const r = this.getCellRect(i);
      if (
        logicalX >= r.x &&
        logicalX <= r.x + r.w &&
        logicalY >= r.y &&
        logicalY <= r.y + r.h
      ) {
        return i;
      }
    }
    return -1;
  }
}
