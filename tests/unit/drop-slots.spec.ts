/**
 * T030 — Per-slot cooldown contract (Clarification Q4).
 *
 * Uses fakes for CoinPool + GameState (the only public surfaces DropSlots
 * touches) to keep this a pure unit test, no Rapier dependency.
 */
import { describe, expect, it } from 'vitest';

import { gameBalance } from '../../src/config/gameBalance';
import type { CoinPool, CoinSlot } from '../../src/game/CoinPool';
import { DropSlots } from '../../src/game/DropSlots';
import type { GameState } from '../../src/game/GameState';

class FakeCoinPool {
  spawned: Array<{ x: number; y: number; z: number }> = [];
  capacity = 100;
  spawn(x: number, y: number, z: number): CoinSlot | undefined {
    if (this.spawned.length >= this.capacity) return undefined;
    this.spawned.push({ x, y, z });
    // Return a minimal CoinSlot shape — DropSlots only checks truthiness.
    return { active: true, index: this.spawned.length - 1 } as unknown as CoinSlot;
  }
}

interface FakeSlot {
  id: 0 | 1 | 2;
  spawnX: number;
  nextReadyAtMs: number;
}

class FakeState {
  coinBank = 100;
  slots: FakeSlot[] = [
    { id: 0, spawnX: -0.2, nextReadyAtMs: 0 },
    { id: 1, spawnX: 0, nextReadyAtMs: 0 },
    { id: 2, spawnX: 0.2, nextReadyAtMs: 0 },
  ];
  mutations = 0;
  canAffordDrop(): boolean {
    return this.coinBank >= gameBalance.economy.dropCostPerCoin * gameBalance.spawning.coinsPerTap;
  }
  mutate(fn: (s: FakeState) => void): void {
    fn(this);
    this.mutations += 1;
  }
}

function makeSlots(): { drops: DropSlots; pool: FakeCoinPool; state: FakeState } {
  const pool = new FakeCoinPool();
  const state = new FakeState();
  const drops = new DropSlots(
    state as unknown as GameState,
    pool as unknown as CoinPool,
  );
  return { drops, pool, state };
}

describe('DropSlots cooldown (FR-014, Clarification Q4)', () => {
  it('first tap on a slot spawns and decrements bank', () => {
    const { drops, pool, state } = makeSlots();
    expect(drops.tapSlot(0, 0)).toBe(true);
    expect(pool.spawned).toHaveLength(gameBalance.spawning.coinsPerTap);
    expect(state.coinBank).toBe(
      100 - gameBalance.economy.dropCostPerCoin * gameBalance.spawning.coinsPerTap,
    );
  });

  it('second tap on the same slot within cooldown is ignored', () => {
    const { drops, pool } = makeSlots();
    expect(drops.tapSlot(0, 0)).toBe(true);
    expect(drops.tapSlot(0, gameBalance.spawning.perSlotCooldownMs - 1)).toBe(false);
    expect(pool.spawned).toHaveLength(gameBalance.spawning.coinsPerTap);
  });

  it('tap on a different slot is accepted regardless of other slot cooldown', () => {
    const { drops, pool } = makeSlots();
    expect(drops.tapSlot(0, 0)).toBe(true);
    expect(drops.tapSlot(1, 10)).toBe(true);
    expect(pool.spawned).toHaveLength(gameBalance.spawning.coinsPerTap * 2);
  });

  it('cooldown clears at perSlotCooldownMs boundary', () => {
    const { drops, pool } = makeSlots();
    drops.tapSlot(0, 0);
    expect(drops.tapSlot(0, gameBalance.spawning.perSlotCooldownMs)).toBe(true);
    expect(pool.spawned).toHaveLength(gameBalance.spawning.coinsPerTap * 2);
  });

  it('rejects when bank cannot afford a drop (FR-015)', () => {
    const { drops, state } = makeSlots();
    state.coinBank = 0;
    expect(drops.tapSlot(0, 0)).toBe(false);
  });
});
