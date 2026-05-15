/**
 * T057 — Valuable placement determinism (Clarification Q1 + research §R10).
 *
 * Calls `Tray.placeValuables` twice with a fake ValuablePool that records
 * spawn calls. With a fixed seed, both calls must produce identical
 * positions; positions must be within tray bounds.
 */
import { describe, expect, it } from 'vitest';

import { gameBalance } from '../../src/config/gameBalance';
import { Tray } from '../../src/game/Tray';
import type { ValuablePool, ValuableSlot } from '../../src/game/ValuablePool';
import type { PhysicsWorld } from '../../src/game/PhysicsWorld';

class FakeValuablePool {
  spawns: Array<{ variantId: number; x: number; y: number; z: number }> = [];
  spawnVariant(variantId: number, x: number, y: number, z: number): ValuableSlot | undefined {
    this.spawns.push({ variantId, x, y, z });
    return { active: true, index: this.spawns.length - 1, variantId } as unknown as ValuableSlot;
  }
}

/** Build a Tray without going through Rapier. We only need width/depth + handles. */
function makeTray(): Tray {
  const halfWidth = gameBalance.tray.width / 2;
  const halfDepth = gameBalance.tray.depth / 2;
  // Skip the constructor; clone the prototype methods onto a plain object.
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

describe('Tray.placeValuables (FR-008a, Q1)', () => {
  it('places exactly initialCount valuables', () => {
    const tray = makeTray();
    const pool = new FakeValuablePool();
    const placed = tray.placeValuables(pool as unknown as ValuablePool);
    expect(placed).toBe(gameBalance.valuables.initialCount);
    expect(pool.spawns).toHaveLength(gameBalance.valuables.initialCount);
  });

  it('is deterministic across calls with the same seed', () => {
    const tray = makeTray();
    const a = new FakeValuablePool();
    const b = new FakeValuablePool();
    tray.placeValuables(a as unknown as ValuablePool);
    tray.placeValuables(b as unknown as ValuablePool);
    expect(b.spawns).toEqual(a.spawns);
  });

  it('places valuables within tray bounds', () => {
    const tray = makeTray();
    const pool = new FakeValuablePool();
    tray.placeValuables(pool as unknown as ValuablePool);
    const halfW = gameBalance.tray.width / 2;
    const halfD = gameBalance.tray.depth / 2;
    for (const s of pool.spawns) {
      expect(Math.abs(s.x)).toBeLessThan(halfW);
      expect(Math.abs(s.z)).toBeLessThan(halfD);
    }
  });

  it('cycles variant IDs 0/1/2 round-robin', () => {
    const tray = makeTray();
    const pool = new FakeValuablePool();
    tray.placeValuables(pool as unknown as ValuablePool);
    for (let i = 0; i < pool.spawns.length; i += 1) {
      expect(pool.spawns[i]!.variantId).toBe(i % 3);
    }
  });
});

// Suppress unused import warning when Rapier types aren't referenced at runtime.
type _Unused = PhysicsWorld;
