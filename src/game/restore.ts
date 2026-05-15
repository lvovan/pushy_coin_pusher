/**
 * restoreFromSave — rehydrate a SaveStateV1 into the live pools + state.
 *
 * Per Clarification Q3, restored bodies start at rest (no velocity replay).
 * Pusher phase resets to 0 so visual cadence is consistent after load.
 */
import type { CoinPool } from './CoinPool';
import type { GameState } from './GameState';
import type { Pusher } from './Pusher';
import type { ValuablePool } from './ValuablePool';
import type { SaveStateV1 } from '../persistence/SaveState';

export function restoreFromSave(
  save: SaveStateV1,
  coinPool: CoinPool,
  pusher: Pusher,
  state: GameState,
  valuables: ValuablePool | undefined,
): void {
  for (const c of save.coins) {
    const slot = coinPool.spawn(c.px, c.py, c.pz);
    if (!slot) break;
    slot.body.setRotation({ x: c.qx, y: c.qy, z: c.qz, w: c.qw }, true);
  }
  if (valuables) {
    for (const v of save.valuables) {
      const slot = valuables.spawnVariant(v.variantId, v.px, v.py, v.pz);
      if (!slot) break;
      slot.body.setRotation({ x: v.qx, y: v.qy, z: v.qz, w: v.qw }, true);
    }
  }
  pusher.setPhase(0);
  state.beginResumedSession(save.coinBank, save.valuablesCollected);
}
