/**
 * DropSlots — orchestrates per-slot cooldown (Clarification Q4) and coin spawn.
 *
 * `tapSlot(id, nowMs)` returns true if a coin (or coinsPerTap coins) were
 * spawned. Returns false on cooldown, insufficient bank, or pool exhaustion.
 */
import { gameBalance } from '../config/gameBalance';
import { createRng } from '../util/rng';
import type { CoinPool } from './CoinPool';
import type { GameState } from './GameState';

const SPAWN_DROP_HEIGHT = 0.35;
const SPAWN_BACK_Z = -0.2;

export type SlotId = 0 | 1 | 2;

export class DropSlots {
  private readonly rng = createRng(gameBalance.valuables.placementSeed + 1);

  constructor(
    private readonly state: GameState,
    private readonly coinPool: CoinPool,
    private readonly onSpawn?: (spawnedCount: number, slotId: SlotId) => void,
    private readonly onTapRejected?: (slotId: SlotId, reason: 'cooldown' | 'broke' | 'pool_empty') => void,
  ) {}

  tapSlot(id: SlotId, nowMs: number): boolean {
    const slot = this.state.slots[id];
    if (!slot) return false;
    if (nowMs < slot.nextReadyAtMs) {
      this.onTapRejected?.(id, 'cooldown');
      return false;
    }
    if (!this.state.canAffordDrop()) {
      this.onTapRejected?.(id, 'broke');
      return false;
    }

    const coinsPerTap = gameBalance.spawning.coinsPerTap;
    const jitter = gameBalance.spawning.slotSpawnJitter;
    let spawned = 0;
    for (let i = 0; i < coinsPerTap; i += 1) {
      const dx = (this.rng.next() * 2 - 1) * jitter;
      const dz = (this.rng.next() * 2 - 1) * jitter;
      const coin = this.coinPool.spawn(slot.spawnX + dx, SPAWN_DROP_HEIGHT, SPAWN_BACK_Z + dz);
      if (!coin) break;
      spawned += 1;
    }
    if (spawned === 0) {
      this.onTapRejected?.(id, 'pool_empty');
      return false;
    }
    this.state.mutate((s) => {
      s.coinBank -= gameBalance.economy.dropCostPerCoin * spawned;
      s.slots[id]!.nextReadyAtMs = nowMs + gameBalance.spawning.perSlotCooldownMs;
    });
    this.onSpawn?.(spawned, id);
    return true;
  }
}
