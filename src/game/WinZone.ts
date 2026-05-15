/**
 * WinZone + side-fall-off pass.
 *
 * - `handleSensor(event)`: classifies enter events from the tray's win-zone
 *   sensor collider; if a coin entered, credits the bank; if a valuable
 *   entered, increments valuablesCollected (US3). Releases the slot.
 * - `stepSideFallOff()`: per-step pass that releases bodies that have slipped
 *   off the side or below the kill plane (FR-009).
 */
import type { CoinPool } from './CoinPool';
import type { GameState } from './GameState';
import type { SensorEvent } from './PhysicsWorld';
import type { Tray } from './Tray';
import type { ValuablePool } from './ValuablePool';

export class WinZone {
  constructor(
    private readonly tray: Tray,
    private readonly coinPool: CoinPool,
    private readonly state: GameState,
    private readonly valuablePool: ValuablePool | undefined = undefined,
  ) {}

  /** Returns true if the event was consumed. */
  handleSensor(e: SensorEvent): boolean {
    if (!e.started) return false;
    if (e.sensorHandle !== this.tray.handles.winZoneSensorHandle) return false;
    const coin = this.coinPool.findByColliderHandle(e.otherHandle);
    if (coin && coin.active) {
      this.state.awardCoinWin();
      this.coinPool.releaseByIndex(coin.index);
      return true;
    }
    if (this.valuablePool) {
      const v = this.valuablePool.findByColliderHandle(e.otherHandle);
      if (v && v.active) {
        this.state.awardValuableWin();
        this.valuablePool.releaseByIndex(v.index);
        return true;
      }
    }
    return false;
  }

  /** Drops bodies that left the play volume from the side/bottom. */
  stepSideFallOff(): number {
    let removed = 0;
    for (const slot of this.coinPool.active()) {
      const t = slot.body.translation();
      if (this.tray.isOutOfPlay(t.x, t.y)) {
        this.coinPool.releaseByIndex(slot.index);
        removed += 1;
      }
    }
    if (this.valuablePool) {
      for (const slot of this.valuablePool.active()) {
        const t = slot.body.translation();
        if (this.tray.isOutOfPlay(t.x, t.y)) {
          this.valuablePool.releaseByIndex(slot.index);
          removed += 1;
        }
      }
    }
    return removed;
  }
}
