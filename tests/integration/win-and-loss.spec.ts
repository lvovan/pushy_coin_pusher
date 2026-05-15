/**
 * T032 — Win zone & side fall-off integration with a scripted PhysicsWorld.
 *
 * We don't load Rapier here — we feed `WinZone.handleSensor` directly and we
 * stub `CoinPool` to track which coin handles map to which slot. This keeps
 * the test fast and deterministic; the "real" Rapier path is exercised by the
 * e2e playthrough.
 */
import { describe, expect, it } from 'vitest';

import { gameBalance } from '../../src/config/gameBalance';
import type { CoinPool, CoinSlot } from '../../src/game/CoinPool';
import { GameState } from '../../src/game/GameState';
import type { SensorEvent } from '../../src/game/PhysicsWorld';
import type { Tray } from '../../src/game/Tray';
import { WinZone } from '../../src/game/WinZone';

const WIN_SENSOR_HANDLE = 999;

class FakeCoinPool {
  private readonly slots = new Map<number, CoinSlot>();
  private readonly translations = new Map<number, { x: number; y: number; z: number }>();

  add(colliderHandle: number, x = 0, y = 0): CoinSlot {
    const pos = { x, y, z: 0 };
    this.translations.set(colliderHandle, pos);
    const slot: CoinSlot = {
      active: true,
      index: colliderHandle,
      bodyHandle: colliderHandle,
      colliderHandle,
      body: {
        translation: () => this.translations.get(colliderHandle)!,
      } as unknown as CoinSlot['body'],
    };
    this.slots.set(colliderHandle, slot);
    return slot;
  }

  setPosition(handle: number, x: number, y: number): void {
    const pos = this.translations.get(handle);
    if (pos) {
      pos.x = x;
      pos.y = y;
    }
  }

  findByColliderHandle(handle: number): CoinSlot | undefined {
    return this.slots.get(handle);
  }

  releaseByIndex(index: number): boolean {
    const slot = this.slots.get(index);
    if (!slot) return false;
    slot.active = false;
    this.slots.delete(index);
    return true;
  }

  *active(): Iterable<CoinSlot> {
    for (const s of this.slots.values()) if (s.active) yield s;
  }
}

function fakeTray(): Tray {
  return {
    handles: { winZoneSensorHandle: WIN_SENSOR_HANDLE },
    halfWidth: gameBalance.tray.width / 2,
    halfDepth: gameBalance.tray.depth / 2,
    floorY: 0,
    sideLossY: -0.5,
    sideLossMargin: 0.05,
    binFloorY: gameBalance.bin.floorY,
    isOutOfPlay(x: number, y: number) {
      if (y < -0.5) return true;
      if (Math.abs(x) > gameBalance.tray.width / 2 + 0.05) return true;
      return false;
    },
  } as unknown as Tray;
}

describe('WinZone — sensor handling (FR-003, FR-013)', () => {
  it('credits bank immediately when an awarded coin crosses the win sensor', () => {
    const state = new GameState();
    state.beginFreshSession();
    const pool = new FakeCoinPool();
    // Coin is still on the tray (y = 0) when it enters the sensor.
    const coin = pool.add(42, 0, 0);
    const wz = new WinZone(fakeTray(), pool as unknown as CoinPool, state);

    const before = state.coinBank;
    const consumed = wz.handleSensor({
      sensorHandle: WIN_SENSOR_HANDLE,
      otherHandle: coin.colliderHandle,
      started: true,
    } satisfies SensorEvent);

    // Sensor crossing credits the bank right away; the body keeps falling as
    // a normal physics object so the player sees a continuous trajectory.
    expect(consumed).toBe(true);
    expect(state.coinBank).toBe(before + gameBalance.economy.winValuePerCoin);
    expect(coin.active).toBe(true);

    // The body has not been released — the bin holds it as a real physics
    // object until it either rests in the bin or escapes out of play.
    const removed = wz.stepSideFallOff();
    expect(removed).toBe(0);
    expect(coin.active).toBe(true);

    // Re-entering the sensor (e.g. via a bounce) must not double-credit.
    wz.handleSensor({
      sensorHandle: WIN_SENSOR_HANDLE,
      otherHandle: coin.colliderHandle,
      started: true,
    } satisfies SensorEvent);
    expect(state.coinBank).toBe(before + gameBalance.economy.winValuePerCoin);
  });

  it('ignores exit events and non-coin handles', () => {
    const state = new GameState();
    state.beginFreshSession();
    const pool = new FakeCoinPool();
    pool.add(42);
    const wz = new WinZone(fakeTray(), pool as unknown as CoinPool, state);

    const before = state.coinBank;
    expect(
      wz.handleSensor({ sensorHandle: WIN_SENSOR_HANDLE, otherHandle: 42, started: false }),
    ).toBe(false);
    expect(
      wz.handleSensor({ sensorHandle: WIN_SENSOR_HANDLE, otherHandle: 99, started: true }),
    ).toBe(false);
    expect(state.coinBank).toBe(before);
  });

  it('side fall-off releases coins without changing bank (FR-009)', () => {
    const state = new GameState();
    state.beginFreshSession();
    const pool = new FakeCoinPool();
    pool.add(1, 999, 0); // far off the side — never crossed the win sensor
    pool.add(2, 0, 0); // safely on tray
    const wz = new WinZone(fakeTray(), pool as unknown as CoinPool, state);

    const before = state.coinBank;
    const removed = wz.stepSideFallOff();
    expect(removed).toBe(1);
    expect(state.coinBank).toBe(before);
  });
});
