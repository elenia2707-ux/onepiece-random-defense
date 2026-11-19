import type { BoonId, GradeId, RecipeId, RelicId, UnitId, UpgradeGroupId } from '../data/types';

export type SlotArea = 'field' | 'bench';

export interface SlotRef {
  readonly area: SlotArea;
  readonly index: number;
}

export type GameCommand =
  | { readonly type: 'summon' }
  | { readonly type: 'move'; readonly from: SlotRef; readonly to: SlotRef }
  | { readonly type: 'sell'; readonly uid: number }
  | { readonly type: 'sellSurplusCommon' }
  | { readonly type: 'lock'; readonly uid: number; readonly locked: boolean }
  | { readonly type: 'craft'; readonly recipeId: RecipeId; readonly chain: boolean }
  | { readonly type: 'useWisp'; readonly grade: GradeId; readonly unitId: UnitId }
  | { readonly type: 'gamble'; readonly tier: GradeId }
  | { readonly type: 'upgrade'; readonly group: UpgradeGroupId; readonly count?: number }
  | { readonly type: 'callBounty' }
  | { readonly type: 'autoArrange' }
  | { readonly type: 'enterEndless' }
  | { readonly type: 'pickBoon'; readonly boonId: BoonId }
  | { readonly type: 'syncRelics'; readonly relics: Readonly<Partial<Record<RelicId, number>>> }
  | { readonly type: 'grantTestCoin'; readonly amount: number }
  | {
      readonly type: 'grantTestResource';
      readonly luck?: number;
      readonly wispGrade?: GradeId;
    };

export interface StampedCommand {
  readonly tick: number;
  readonly command: GameCommand;
}

export class CommandQueue {
  private readonly pending: GameCommand[] = [];
  private readonly history: StampedCommand[] = [];

  public enqueue(command: GameCommand): void {
    this.pending.push(command);
  }

  public drainForTick(tick: number): StampedCommand[] {
    if (this.pending.length === 0) {
      return [];
    }
    const batch: StampedCommand[] = [];
    for (let i = 0; i < this.pending.length; i++) {
      const cmd = this.pending[i];
      if (cmd) {
        const stamped: StampedCommand = { tick, command: cmd };
        batch.push(stamped);
        this.history.push(stamped);
      }
    }
    this.pending.length = 0;
    return batch;
  }

  public getHistory(): readonly StampedCommand[] {
    return this.history;
  }
}
