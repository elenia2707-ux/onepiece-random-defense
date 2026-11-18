import { describe, expect, it } from 'vitest';
import type { StampedCommand } from '../src/core/CommandQueue';
import { GameLoop } from '../src/core/GameLoop';
import { Simulation } from '../src/core/Simulation';
import { loadGameData } from '../src/data/loader';

describe('Simulation fixed-timestep determinism (1x vs 3x)', () => {
  it('produces identical hashState() at tick 660 across 1x and 3x speeds including craft, wisp, gamble, and upgrade', () => {
    const data = loadGameData();
    const seed = 0x99887766;

    const commandLog: StampedCommand[] = [
      { tick: 2, command: { type: 'summon' } },
      { tick: 5, command: { type: 'summon' } },
      { tick: 9, command: { type: 'summon' } },
      { tick: 14, command: { type: 'summon' } },
      {
        tick: 22,
        command: {
          type: 'move',
          from: { area: 'field', index: 0 },
          to: { area: 'bench', index: 0 },
        },
      },
      {
        tick: 35,
        command: {
          type: 'move',
          from: { area: 'field', index: 1 },
          to: { area: 'field', index: 10 },
        },
      },
      {
        tick: 48,
        command: {
          type: 'move',
          from: { area: 'bench', index: 0 },
          to: { area: 'field', index: 10 },
        },
      },
      { tick: 60, command: { type: 'lock', uid: 2, locked: true } },
      { tick: 72, command: { type: 'useWisp', grade: 'common', unitId: 'zoro' } },
      { tick: 80, command: { type: 'useWisp', grade: 'common', unitId: 'marine_saber' } },
      { tick: 92, command: { type: 'useWisp', grade: 'uncommon', unitId: 'sanji_diable' } },
      { tick: 110, command: { type: 'gamble', tier: 'uncommon' } },
      { tick: 130, command: { type: 'gamble', tier: 'rare' } },
      { tick: 150, command: { type: 'lock', uid: 2, locked: false } },
      { tick: 185, command: { type: 'craft', recipeId: 'r_zoro_dual', chain: false } },
      { tick: 215, command: { type: 'upgrade', group: 'common' } },
      { tick: 240, command: { type: 'sell', uid: 1 } },
      { tick: 310, command: { type: 'summon' } },
      { tick: 420, command: { type: 'summon' } },
      { tick: 510, command: { type: 'upgrade', group: 'rare' } },
    ];

    const targetTicks = 660;

    // Run A: 1x speed driven by 60Hz frames
    const sim1x = new Simulation(data, seed);
    sim1x.scheduleCommandsForReplay(commandLog);
    const loop1x = new GameLoop(sim1x, {
      onRender: () => {},
      onSyncUI: () => {},
    });
    loop1x.setSpeed(1);

    let now1x = 0;
    loop1x.stepFrame(now1x);
    while (sim1x.tickCount < targetTicks) {
      const remainingTicks = targetTicks - sim1x.tickCount;
      const stepMs = remainingTicks === 1 ? 4 : 16;
      now1x += stepMs;
      loop1x.stepFrame(now1x);
    }

    // Run B: 3x speed driven by irregular jittered frame intervals
    const sim3x = new Simulation(data, seed);
    sim3x.scheduleCommandsForReplay(commandLog);
    const loop3x = new GameLoop(sim3x, {
      onRender: () => {},
      onSyncUI: () => {},
    });
    loop3x.setSpeed(3);

    let now3x = 0;
    let frameIdx = 0;
    loop3x.stepFrame(now3x);
    while (sim3x.tickCount < targetTicks) {
      const remainingTicks = targetTicks - sim3x.tickCount;
      const jitterMs = remainingTicks <= 3 ? 2 : frameIdx % 2 === 0 ? 13 : 21;
      now3x += jitterMs;
      frameIdx++;
      loop3x.stepFrame(now3x);
    }

    expect(sim1x.tickCount).toBe(targetTicks);
    expect(sim3x.tickCount).toBe(targetTicks);
    expect(sim1x.hashState()).toBe(sim3x.hashState());
  });
});
