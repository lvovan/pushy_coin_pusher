/**
 * T069 — No new valuables spawn during play (Clarification Q1).
 *
 * Simulate many `tapSlot` calls and assert that no spawn path increases the
 * valuable count beyond what `placeValuables` produced at session start.
 */
import { describe, expect, it } from 'vitest';

import { gameBalance } from '../../src/config/gameBalance';
import type { CoinPool, CoinSlot } from '../../src/game/CoinPool';
import { DropSlots } from '../../src/game/DropSlots';
import { GameState } from '../../src/game/GameState';
import { Tray } from '../../src/game/Tray';
import type { ValuablePool, ValuableSlot } from '../../src/game/ValuablePool';

class FakeCoinPool {
  spawned = 0;
  spawn(): CoinSlot | undefined {
    this.spawned += 1;
    return { active: true, index: this.spawned - 1 } as unknown as CoinSlot;
  }
}

class FakeValuablePool {
  spawns: Array<{ variantId: number; x: number; y: number; z: number }> = [];
  spawnVariant(variantId: number, x: number, y: number, z: number): ValuableSlot | undefined {
    this.spawns.push({ variantId, x, y, z });
    return { active: true, index: this.spawns.length - 1, variantId } as unknown as ValuableSlot;
  }
  get activeCount(): number {
    return this.spawns.length;
  }
}

function makeTray(): Tray {
  const halfWidth = gameBalance.tray.width / 2;
  const halfDepth = gameBalance.tray.depth / 2;
  const proto = Tray.prototype;
  const fake = Object.create(proto) as Tray;
  Object.assign(fake, {
    halfWidth,
    halfDepth,
    floorY: 0,
    sideLossY: -0.5,
    sideLossMargin: 0.05,
    handles: {
      floorHandle: 0,
      backWallHandle: 0,
      leftWallHandle: 0,
      rightWallHandle: 0,
      winZoneSensorHandle: 0,
    },
  });
  return fake;
}

describe('No valuable spawning during play (Q1)', () => {
  it('1000 taps do not grow valuable count beyond initial placement', () => {
    const state = new GameState();
    state.beginFreshSession();
    const coinPool = new FakeCoinPool();
    const valPool = new FakeValuablePool();
    const tray = makeTray();
    tray.placeValuables(valPool as unknown as ValuablePool);
    const baseline = valPool.activeCount;
    expect(baseline).toBe(gameBalance.valuables.initialCount);

    const drops = new DropSlots(state, coinPool as unknown as CoinPool);
    let nowMs = 0;
    for (let i = 0; i < 1000; i += 1) {
      drops.tapSlot((i % 3) as 0 | 1 | 2, nowMs);
      nowMs += gameBalance.spawning.perSlotCooldownMs + 1;
    }
    expect(valPool.activeCount).toBe(baseline);
  });
});
