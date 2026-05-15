/**
 * GameState — the single source of truth for player-facing state.
 *
 * All mutations route through `mutate(fn)` so save scheduling and UI updates
 * can fan out from one place (Constitution Principle IV; data-model.md §1).
 */
import { gameBalance } from '../config/gameBalance';

export type GameMode = 'home' | 'playing' | 'gameOver' | 'won';

export interface DropSlotState {
  id: 0 | 1 | 2;
  spawnX: number;
  nextReadyAtMs: number;
}

export interface GameStateSnapshot {
  mode: GameMode;
  coinBank: number;
  valuablesCollected: number;
}

export type SubscribeCallback = (state: GameStateSnapshot) => void;
export type SaveCallback = () => void;

export class GameState {
  mode: GameMode = 'home';
  coinBank: number;
  valuablesCollected = 0;
  pusherPhase = 0;
  saveDirty = false;
  readonly slots: DropSlotState[];

  private readonly subscribers = new Set<SubscribeCallback>();
  private saveCallback: SaveCallback | undefined;

  constructor() {
    this.coinBank = gameBalance.economy.startingBank;
    this.slots = gameBalance.spawning.slotPositionsX.map((x, i) => ({
      id: i as 0 | 1 | 2,
      spawnX: x,
      nextReadyAtMs: 0,
    }));
  }

  setSaveCallback(cb: SaveCallback): void {
    this.saveCallback = cb;
  }

  subscribe(cb: SubscribeCallback): () => void {
    this.subscribers.add(cb);
    cb(this.snapshot());
    return () => this.subscribers.delete(cb);
  }

  snapshot(): GameStateSnapshot {
    return {
      mode: this.mode,
      coinBank: this.coinBank,
      valuablesCollected: this.valuablesCollected,
    };
  }

  /** Apply mutations, mark dirty, notify subscribers, schedule a save. */
  mutate(fn: (s: GameState) => void): void {
    fn(this);
    this.saveDirty = true;
    const snap = this.snapshot();
    for (const cb of this.subscribers) cb(snap);
    if (this.saveCallback) this.saveCallback();
  }

  /** Convenience helpers used by gameplay modules. */
  canAffordDrop(): boolean {
    return this.coinBank >= gameBalance.economy.dropCostPerCoin * gameBalance.spawning.coinsPerTap;
  }

  tryDrop(): boolean {
    if (!this.canAffordDrop()) return false;
    this.mutate((s) => {
      s.coinBank -= gameBalance.economy.dropCostPerCoin * gameBalance.spawning.coinsPerTap;
    });
    return true;
  }

  awardCoinWin(): void {
    this.mutate((s) => {
      s.coinBank += gameBalance.economy.winValuePerCoin;
    });
  }

  awardValuableWin(): void {
    this.mutate((s) => {
      s.valuablesCollected += 1;
    });
    this.triggerWinIfAllValuablesCollected();
  }

  /**
   * Win condition (FR — “All Valuables Collected”): once every designated
   * valuable has been transferred into the collection bin, end the session
   * with a win. Functionally equivalent to game-over in that gameplay stops
   * and an overlay is shown, but distinct so the UI can celebrate.
   */
  triggerWinIfAllValuablesCollected(): void {
    if (this.mode !== 'playing') return;
    if (this.valuablesCollected < gameBalance.valuables.initialCount) return;
    this.mutate((s) => {
      s.mode = 'won';
    });
  }

  triggerGameOver(): void {
    if (this.mode !== 'playing') return;
    if (this.coinBank > 0) return;
    this.mutate((s) => {
      s.mode = 'gameOver';
    });
  }

  beginFreshSession(): void {
    this.mutate((s) => {
      s.mode = 'playing';
      s.coinBank = gameBalance.economy.startingBank;
      s.valuablesCollected = 0;
      s.pusherPhase = 0;
      for (const slot of s.slots) slot.nextReadyAtMs = 0;
    });
  }

  beginResumedSession(coinBank: number, valuablesCollected: number): void {
    this.mutate((s) => {
      s.mode = 'playing';
      s.coinBank = coinBank;
      s.valuablesCollected = valuablesCollected;
      s.pusherPhase = 0;
    });
  }

  applyContinueTopUp(): void {
    this.mutate((s) => {
      s.coinBank += gameBalance.economy.continueTopUpCoins;
      s.mode = 'playing';
    });
  }
}
