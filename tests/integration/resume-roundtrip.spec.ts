/**
 * T054 — Resume round-trip integration.
 *
 * Drives GameState through mutations → SaveScheduler → SaveStore (in-memory) →
 * reload → restore. Uses fakes for CoinPool/Pusher so we don't need Rapier.
 */
import { describe, expect, it } from 'vitest';

import { gameBalance } from '../../src/config/gameBalance';
import type { CoinPool, CoinSlot } from '../../src/game/CoinPool';
import { GameState } from '../../src/game/GameState';
import type { Pusher } from '../../src/game/Pusher';
import { restoreFromSave } from '../../src/game/restore';
import type { ValuablePool } from '../../src/game/ValuablePool';
import { SaveScheduler, type PhaseSource } from '../../src/persistence/SaveScheduler';
import { SaveStore, type StorageAdapter } from '../../src/persistence/SaveStore';
import { buildSaveState } from '../../src/persistence/snapshot';

class MemoryStorage implements StorageAdapter {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
}

class FakePool {
  spawned: Array<{ x: number; y: number; z: number }> = [];
  private slots: CoinSlot[] = [];

  spawn(x: number, y: number, z: number): CoinSlot | undefined {
    const idx = this.slots.length;
    const slot: CoinSlot = {
      active: true,
      index: idx,
      bodyHandle: idx,
      colliderHandle: idx,
      body: {
        translation: () => ({ x, y, z }),
        rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
        setRotation: () => undefined,
        setLinvel: () => undefined,
        setAngvel: () => undefined,
        setTranslation: () => undefined,
        sleep: () => undefined,
        wakeUp: () => undefined,
      } as unknown as CoinSlot['body'],
    };
    this.slots.push(slot);
    this.spawned.push({ x, y, z });
    return slot;
  }

  *active(): Iterable<CoinSlot> {
    for (const s of this.slots) if (s.active) yield s;
  }

  get activeCount(): number {
    return this.slots.filter((s) => s.active).length;
  }
}

describe('Resume round-trip (US2)', () => {
  it('saves bank+pose then restores into a fresh state', () => {
    const storage = new MemoryStorage();
    const store = new SaveStore(storage);

    // Source session
    const state = new GameState();
    state.beginFreshSession();
    const pool = new FakePool() as unknown as CoinPool;
    pool.spawn(0.1, 0.5, -0.1);
    pool.spawn(-0.05, 0.5, -0.2);
    state.mutate((s) => {
      s.coinBank = 73;
      s.valuablesCollected = 2;
    });

    const phaseSource: PhaseSource = { phase: 'idle' };
    let flushed = 0;
    const scheduler = new SaveScheduler(
      phaseSource,
      () => {
        flushed += 1;
        const snap = buildSaveState(state, pool, undefined, 1000);
        store.save(snap);
      },
      { attachLifecycleListeners: false },
    );
    scheduler.scheduleSave();
    scheduler.flushImmediate();
    expect(flushed).toBe(1);

    // Reload session
    const loaded = store.load();
    expect(loaded).not.toBeNull();
    const fresh = new GameState();
    const newPool = new FakePool() as unknown as CoinPool;
    const stubPusher = { setPhase: () => undefined } as unknown as Pusher;
    restoreFromSave(loaded!, newPool, stubPusher, fresh, undefined as unknown as ValuablePool | undefined);

    expect(fresh.coinBank).toBe(73);
    expect(fresh.valuablesCollected).toBe(2);
    expect(fresh.mode).toBe('playing');
    expect(newPool.activeCount).toBe(2);
  });

  it('GameState.mutate triggers scheduled saves', () => {
    const storage = new MemoryStorage();
    const store = new SaveStore(storage);
    const state = new GameState();
    const pool = new FakePool() as unknown as CoinPool;
    const phaseSource: PhaseSource = { phase: 'idle' };
    let flushed = 0;
    const scheduler = new SaveScheduler(
      phaseSource,
      () => {
        flushed += 1;
        store.save(buildSaveState(state, pool, undefined, 0));
      },
      { attachLifecycleListeners: false },
    );
    state.setSaveCallback(() => scheduler.scheduleSave());

    state.beginFreshSession();
    state.mutate((s) => {
      s.coinBank = gameBalance.economy.startingBank - 5;
    });
    scheduler.flushImmediate();
    expect(flushed).toBeGreaterThanOrEqual(1);
    const loaded = store.load();
    expect(loaded?.coinBank).toBe(gameBalance.economy.startingBank - 5);
  });
});
