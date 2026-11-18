import type { SlotRef } from '../core/CommandQueue';
import type { UnitId } from '../data/types';

export interface IndexedUnitEntry {
  readonly uid: number;
  readonly unitId: UnitId;
  slot: SlotRef;
  locked: boolean;
}

/**
 * Tracks all owned units across field + bench and maintains unlocked counts per UnitId.
 * Selection policy (AGENTS.md §5): unlocked only -> bench first -> field from back slot to front.
 */
export class InventoryIndex {
  private readonly byUid = new Map<number, IndexedUnitEntry>();
  private readonly byUnitId = new Map<UnitId, IndexedUnitEntry[]>();
  private readonly unlockedCounts = new Map<UnitId, number>();
  private readonly pendingDelta = new Set<UnitId>();

  public addUnit(uid: number, unitId: UnitId, slot: SlotRef, locked = false): void {
    const entry: IndexedUnitEntry = { uid, unitId, slot, locked };
    this.byUid.set(uid, entry);
    const list = this.byUnitId.get(unitId) ?? [];
    list.push(entry);
    this.byUnitId.set(unitId, list);

    if (!locked) {
      this.unlockedCounts.set(unitId, (this.unlockedCounts.get(unitId) ?? 0) + 1);
      this.pendingDelta.add(unitId);
    }
  }

  public removeUnit(uid: number): IndexedUnitEntry | undefined {
    const entry = this.byUid.get(uid);
    if (!entry) return undefined;
    this.byUid.delete(uid);

    const list = this.byUnitId.get(entry.unitId);
    if (list) {
      const idx = list.findIndex((item) => item.uid === uid);
      if (idx !== -1) {
        list.splice(idx, 1);
      }
      if (list.length === 0) {
        this.byUnitId.delete(entry.unitId);
      }
    }

    if (!entry.locked) {
      const next = Math.max(0, (this.unlockedCounts.get(entry.unitId) ?? 0) - 1);
      if (next === 0) {
        this.unlockedCounts.delete(entry.unitId);
      } else {
        this.unlockedCounts.set(entry.unitId, next);
      }
      this.pendingDelta.add(entry.unitId);
    }
    return entry;
  }

  public moveUnit(uid: number, nextSlot: SlotRef): void {
    const entry = this.byUid.get(uid);
    if (entry) {
      entry.slot = nextSlot;
    }
  }

  public setLocked(uid: number, locked: boolean): boolean {
    const entry = this.byUid.get(uid);
    if (!entry || entry.locked === locked) {
      return false;
    }
    entry.locked = locked;
    const prev = this.unlockedCounts.get(entry.unitId) ?? 0;
    const next = locked ? Math.max(0, prev - 1) : prev + 1;
    if (next === 0) {
      this.unlockedCounts.delete(entry.unitId);
    } else {
      this.unlockedCounts.set(entry.unitId, next);
    }
    this.pendingDelta.add(entry.unitId);
    return true;
  }

  public getAvailableCount(unitId: UnitId): number {
    return this.unlockedCounts.get(unitId) ?? 0;
  }

  public getAvailableMap(): ReadonlyMap<UnitId, number> {
    return this.unlockedCounts;
  }

  public consumeDelta(): UnitId[] {
    if (this.pendingDelta.size === 0) {
      return [];
    }
    const out = [...this.pendingDelta].sort((a, b) => a.localeCompare(b));
    this.pendingDelta.clear();
    return out;
  }

  /**
   * Deterministic candidate selection for crafting:
   * 1) Exclude locked
   * 2) Bench slots first (ascending bench index -> deterministic)
   * 3) Field slots from back index to front index (descending field index)
   */
  public pickIngredientUids(unitId: UnitId, count: number, excludeUids?: ReadonlySet<number>): number[] | null {
    const list = this.byUnitId.get(unitId);
    if (!list || list.length < count) {
      return null;
    }
    const candidates = list.filter(
      (e) => !e.locked && (!excludeUids || !excludeUids.has(e.uid)),
    );
    if (candidates.length < count) {
      return null;
    }

    candidates.sort((a, b) => {
      if (a.slot.area !== b.slot.area) {
        return a.slot.area === 'bench' ? -1 : 1;
      }
      if (a.slot.area === 'bench') {
        return a.slot.index !== b.slot.index ? a.slot.index - b.slot.index : a.uid - b.uid;
      }
      return a.slot.index !== b.slot.index ? b.slot.index - a.slot.index : a.uid - b.uid;
    });

    return candidates.slice(0, count).map((c) => c.uid);
  }
}
