import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';
import { CraftIndex } from '../src/craft/CraftIndex';
import { InventoryIndex } from '../src/craft/InventoryIndex';
import { RecipeGraph } from '../src/craft/RecipeGraph';
import { loadGameData } from '../src/data/loader';

describe('CraftIndex delta evaluation equivalence', () => {
  it('matches full recomputation across 250 randomized add/remove/lock/move mutations', () => {
    const data = loadGameData();
    const graph = new RecipeGraph(data.units, data.gradesById, data.recipes);
    const inv = new InventoryIndex();
    const craft = new CraftIndex(graph, data.unitsById);
    const rng = new Rng(0x51515151);

    const activeUids: number[] = [];
    let nextUid = 1;

    for (let step = 0; step < 250; step++) {
      const roll = rng.nextInt(100);

      if (roll < 50 || activeUids.length === 0) {
        // Add random unit across all tiers onto field or bench
        const unitDef = data.units[rng.nextInt(data.units.length)]!;
        const area = rng.nextInt(2) === 0 ? 'field' : 'bench';
        const index = rng.nextInt(area === 'field' ? 18 : 12);
        const locked = rng.nextInt(6) === 0;
        const uid = nextUid++;
        inv.addUnit(uid, unitDef.id, { area, index }, locked);
        activeUids.push(uid);
      } else if (roll < 75) {
        // Remove random owned unit
        const pickIdx = rng.nextInt(activeUids.length);
        const uid = activeUids[pickIdx]!;
        activeUids.splice(pickIdx, 1);
        inv.removeUnit(uid);
      } else if (roll < 92) {
        // Toggle lock on random owned unit
        const uid = activeUids[rng.nextInt(activeUids.length)]!;
        inv.setLocked(uid, rng.nextInt(2) === 0);
      } else {
        // Move unit between slots
        const uid = activeUids[rng.nextInt(activeUids.length)]!;
        const area = rng.nextInt(2) === 0 ? 'field' : 'bench';
        const index = rng.nextInt(area === 'field' ? 18 : 12);
        inv.moveUnit(uid, { area, index });
      }

      const delta = inv.consumeDelta();
      craft.applyDelta(delta, inv);

      const deltaView = craft.getView();
      const fullView = craft.recomputeAllForTest(inv);

      expect(deltaView.readyCount).toBe(fullView.readyCount);
      expect(deltaView.chainReadyCount).toBe(fullView.chainReadyCount);
      expect(deltaView.byGrade).toEqual(fullView.byGrade);
      expect(deltaView.recipes).toEqual(fullView.recipes);
    }
  });
});
