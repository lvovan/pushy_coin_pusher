/**
 * WinZone + side-fall-off pass.
 *
 * - `handleSensor(event)`: classifies enter events from the tray's win-zone
 *   sensor collider; marks coins/valuables as awarded so the bank credit
 *   can be applied when the body finally drops past the kill plane (so the
 *   player sees the coin fall into the bin instead of teleporting).
 * - `stepSideFallOff()`: per-step pass that releases bodies that have slipped
 *   off the side or below the kill plane (FR-009). Bodies that were marked
 *   awarded by the win sensor credit the bank here; unmarked bodies are
 *   silently lost (side-loss).
 */
import type { CoinPool } from './CoinPool';
import type { GameState } from './GameState';
import type { SensorEvent } from './PhysicsWorld';
import type { Tray } from './Tray';
import type { ValuablePool } from './ValuablePool';

/**
 * WinZone — awards the bank/valuables counters the moment a coin or valuable
 * crosses the win-zone sensor at the front of the play tray. The triggering
 * physical body keeps falling into the collection bin and remains there as a
 * persistent physics body (it is NOT released or swapped for a separate
 * visual pile). This way the same object lives across the playfield → bin
 * boundary so the player sees a single continuous trajectory.
 *
 * Per step, bodies that have left the play volume sideways (clipped past a
 * wall) are released to keep the pool from leaking active slots.
 */
export class WinZone {
  // Slot indices that have already been credited at the sensor crossing; used
  // to prevent re-credit if a body bounces in and out of the sensor.
  private readonly creditedCoins = new Set<number>();
  private readonly creditedValuables = new Set<number>();
  // Slot indices of coins that currently reside in the collection bin.
  // Invariant (maintained by main.ts): `binCoins.size === state.coinBank`.
  // - Increases by 1 when a coin is awarded at the win sensor (`handleSensor`).
  // - Increases by 1 per coin prefilled into the bin at session start, on
  //   resume from save, or after a Continue top-up.
  // - Decreases by 1 when the player taps a drop slot (`releaseOneBinCoin`).
  // - Decreases by 1 if a bin coin ever escapes side-fall (defensive).
  private readonly binCoins = new Set<number>();

  constructor(
    private readonly tray: Tray,
    private readonly coinPool: CoinPool,
    private readonly state: GameState,
    private readonly valuablePool: ValuablePool | undefined = undefined,
    private readonly onValuableWin: ((x: number, y: number, z: number) => void) | undefined = undefined,
  ) {}

  /** Clears the credited-slot bookkeeping. Call when the pools are mass-released
   * (e.g. on Play Again) so reused indices don't inherit "already credited". */
  reset(): void {
    this.creditedCoins.clear();
    this.creditedValuables.clear();
    this.binCoins.clear();
  }

  /** Number of physical coins currently in the collection bin. */
  get binCoinCount(): number {
    return this.binCoins.size;
  }

  /** Register a coin (by slot index) as residing in the collection bin. Also
   * marks it as credited so the sensor will not double-award if it brushes
   * the sensor volume while resting. */
  addBinCoin(index: number): void {
    this.binCoins.add(index);
    this.creditedCoins.add(index);
  }

  /** Release one physical coin from the bin (chosen arbitrarily). Returns the
   * released slot index, or undefined if the bin was empty. */
  releaseOneBinCoin(): number | undefined {
    const iter = this.binCoins.values().next();
    if (iter.done) return undefined;
    const index = iter.value as number;
    this.binCoins.delete(index);
    this.creditedCoins.delete(index);
    this.coinPool.releaseByIndex(index);
    return index;
  }

  /** Returns true if the event was consumed. */
  handleSensor(e: SensorEvent): boolean {
    if (!e.started) return false;
    if (e.sensorHandle !== this.tray.handles.winZoneSensorHandle) return false;
    const coin = this.coinPool.findByColliderHandle(e.otherHandle);
    if (coin && coin.active) {
      if (!this.creditedCoins.has(coin.index)) {
        this.creditedCoins.add(coin.index);
        this.binCoins.add(coin.index);
        this.state.awardCoinWin();
      }
      return true;
    }
    if (this.valuablePool) {
      const v = this.valuablePool.findByColliderHandle(e.otherHandle);
      if (v && v.active) {
        if (!this.creditedValuables.has(v.index)) {
          this.creditedValuables.add(v.index);
          this.state.awardValuableWin();
          if (this.onValuableWin) {
            const t = v.body.translation();
            this.onValuableWin(t.x, t.y, t.z);
          }
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Releases bodies that left the play volume from the side. Already-credited
   * coins that escape sideways are released without double-credit; uncredited
   * coins that escape are released without credit (lost). Coins resting in
   * the bin (in-play) stay as physics bodies — they are the player's winnings.
   */
  stepSideFallOff(): number {
    let removed = 0;
    // Snapshot the active set into a local array, then iterate backward so
    // the pool's swap-pop release during iteration doesn't skip elements.
    // (The original `for (const slot of pool.active())` form had a latent
    // skip bug because releasing the current slot moves the last active
    // element into the current position, which the forward iterator then
    // walks past.) Allocating one array per frame is acceptable now that
    // this pass runs once per rAF tick (in onAfterSteps) instead of once
    // per physics substep.
    const coinSlots = Array.from(this.coinPool.active());
    for (let n = coinSlots.length - 1; n >= 0; n -= 1) {
      const slot = coinSlots[n]!;
      if (!slot.active) continue;
      const t = slot.body.translation();
      if (this.tray.isOutOfPlay(t.x, t.y)) {
        this.creditedCoins.delete(slot.index);
        this.binCoins.delete(slot.index);
        this.coinPool.releaseByIndex(slot.index);
        removed += 1;
      }
    }
    if (this.valuablePool) {
      const vSlots = Array.from(this.valuablePool.active());
      for (let n = vSlots.length - 1; n >= 0; n -= 1) {
        const slot = vSlots[n]!;
        if (!slot.active) continue;
        const t = slot.body.translation();
        if (this.tray.isOutOfPlay(t.x, t.y)) {
          this.creditedValuables.delete(slot.index);
          this.valuablePool.releaseByIndex(slot.index);
          removed += 1;
        }
      }
    }
    return removed;
  }
}
