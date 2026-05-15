/**
 * Snapshot — extract pose data from active pool entries for SaveStateV1.
 *
 * Velocities deliberately excluded (Clarification Q3): restored bodies start
 * at rest to avoid replaying potentially-divergent simulation state.
 */
import type { CoinPool } from '../game/CoinPool';
import type { GameState } from '../game/GameState';
import type { ValuablePool } from '../game/ValuablePool';
import type { SaveStateV1, SavedBody, SavedValuable } from './SaveState';
import { SAVE_SCHEMA_VERSION } from './SaveState';

export function snapshotBodies(
  coinPool: CoinPool,
  valuables: ValuablePool | undefined,
): { coins: SavedBody[]; valuables: SavedValuable[] } {
  const coinList: SavedBody[] = [];
  for (const slot of coinPool.active()) {
    const t = slot.body.translation();
    const r = slot.body.rotation();
    coinList.push({ px: t.x, py: t.y, pz: t.z, qx: r.x, qy: r.y, qz: r.z, qw: r.w });
  }
  const valuableList: SavedValuable[] = [];
  if (valuables) {
    for (const v of valuables.active()) {
      const t = v.body.translation();
      const r = v.body.rotation();
      valuableList.push({
        variantId: v.variantId,
        px: t.x,
        py: t.y,
        pz: t.z,
        qx: r.x,
        qy: r.y,
        qz: r.z,
        qw: r.w,
      });
    }
  }
  return { coins: coinList, valuables: valuableList };
}

export function buildSaveState(
  state: GameState,
  coinPool: CoinPool,
  valuables: ValuablePool | undefined,
  nowMs: number,
): SaveStateV1 {
  const { coins, valuables: vals } = snapshotBodies(coinPool, valuables);
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: Math.floor(nowMs),
    coinBank: state.coinBank,
    valuablesCollected: state.valuablesCollected,
    coins,
    valuables: vals,
  };
}
