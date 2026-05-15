/**
 * T058 — Valuable win: sensor enter on a valuable increments valuablesCollected,
 * coinBank unchanged.
 */
import { describe, expect, it } from 'vitest';

import type { CoinPool, CoinSlot } from '../../src/game/CoinPool';
import { GameState } from '../../src/game/GameState';
import type { SensorEvent } from '../../src/game/PhysicsWorld';
import type { Tray } from '../../src/game/Tray';
import type { ValuablePool, ValuableSlot } from '../../src/game/ValuablePool';
import { WinZone } from '../../src/game/WinZone';

const WIN_SENSOR_HANDLE = 555;

class FakeCoinPool {
  findByColliderHandle(_h: number): CoinSlot | undefined {
    return undefined;
  }
  releaseByIndex(_i: number): boolean {
    return false;
  }
  *active(): Iterable<CoinSlot> {
    /* none */
  }
}

class FakeValuablePool {
  private slots = new Map<number, ValuableSlot>();
  add(handle: number, variantId: number): ValuableSlot {
    const slot: ValuableSlot = {
      active: true,
      index: handle,
      variantId,
      bodyHandle: handle,
      colliderHandle: handle,
      body: {
        translation: () => ({ x: 0, y: 0, z: 0 }),
      } as unknown as ValuableSlot['body'],
    };
    this.slots.set(handle, slot);
    return slot;
  }
  findByColliderHandle(handle: number): ValuableSlot | undefined {
    return this.slots.get(handle);
  }
  releaseByIndex(index: number): boolean {
    const s = this.slots.get(index);
    if (!s) return false;
    s.active = false;
    this.slots.delete(index);
    return true;
  }
  *active(): Iterable<ValuableSlot> {
    for (const s of this.slots.values()) if (s.active) yield s;
  }
}

function makeFakeTray(): Tray {
  return {
    handles: { winZoneSensorHandle: WIN_SENSOR_HANDLE },
    isOutOfPlay: () => false,
  } as unknown as Tray;
}

describe('WinZone — valuable handling (US3)', () => {
  it('increments valuablesCollected, leaves coinBank unchanged', () => {
    const state = new GameState();
    state.beginFreshSession();
    const bankBefore = state.coinBank;

    const coins = new FakeCoinPool();
    const valuables = new FakeValuablePool();
    const v = valuables.add(77, 1);
    const wz = new WinZone(
      makeFakeTray(),
      coins as unknown as CoinPool,
      state,
      valuables as unknown as ValuablePool,
    );

    expect(state.valuablesCollected).toBe(0);
    const consumed = wz.handleSensor({
      sensorHandle: WIN_SENSOR_HANDLE,
      otherHandle: v.colliderHandle,
      started: true,
    } satisfies SensorEvent);

    expect(consumed).toBe(true);
    expect(state.valuablesCollected).toBe(1);
    expect(state.coinBank).toBe(bankBefore);
    expect(v.active).toBe(false);
  });

  it('ignores side fall-off for valuables (no counter change)', () => {
    const state = new GameState();
    state.beginFreshSession();
    const before = state.valuablesCollected;
    const coins = new FakeCoinPool();
    const valuables = new FakeValuablePool();
    valuables.add(88, 2);
    // Tray says everything is OUT of play → side fall-off path triggers.
    const tray = {
      handles: { winZoneSensorHandle: WIN_SENSOR_HANDLE },
      isOutOfPlay: () => true,
    } as unknown as Tray;
    const wz = new WinZone(
      tray,
      coins as unknown as CoinPool,
      state,
      valuables as unknown as ValuablePool,
    );
    const removed = wz.stepSideFallOff();
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(state.valuablesCollected).toBe(before);
  });
});
