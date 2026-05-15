/**
 * T031 — GameState economy contract.
 *
 * GameState is independent of physics/render, so we can exercise it directly.
 */
import { describe, expect, it } from 'vitest';

import { gameBalance } from '../../src/config/gameBalance';
import { GameState } from '../../src/game/GameState';

describe('GameState economy', () => {
  it('initial coinBank equals startingBank, valuables 0, mode home', () => {
    const s = new GameState();
    expect(s.coinBank).toBe(gameBalance.economy.startingBank);
    expect(s.valuablesCollected).toBe(0);
    expect(s.mode).toBe('home');
  });

  it('tryDrop decrements bank by dropCostPerCoin and returns true', () => {
    const s = new GameState();
    const before = s.coinBank;
    expect(s.tryDrop()).toBe(true);
    expect(s.coinBank).toBe(
      before - gameBalance.economy.dropCostPerCoin * gameBalance.spawning.coinsPerTap,
    );
  });

  it('tryDrop returns false and leaves bank when insufficient (FR-015)', () => {
    const s = new GameState();
    s.mutate((g) => {
      g.coinBank = 0;
    });
    expect(s.tryDrop()).toBe(false);
    expect(s.coinBank).toBe(0);
  });

  it('awardCoinWin increments bank by winValuePerCoin', () => {
    const s = new GameState();
    const before = s.coinBank;
    s.awardCoinWin();
    expect(s.coinBank).toBe(before + gameBalance.economy.winValuePerCoin);
  });

  it('triggerGameOver only fires when bank=0 and mode=playing (FR-016)', () => {
    const s = new GameState();
    // bank > 0 → ignored
    s.beginFreshSession();
    s.triggerGameOver();
    expect(s.mode).toBe('playing');
    // bank = 0 → transitions
    s.mutate((g) => {
      g.coinBank = 0;
    });
    s.triggerGameOver();
    expect(s.mode).toBe('gameOver');
  });

  it('triggerGameOver is a no-op when not playing', () => {
    const s = new GameState();
    s.mutate((g) => {
      g.coinBank = 0;
    });
    s.triggerGameOver(); // mode still 'home'
    expect(s.mode).toBe('home');
  });

  it('applyContinueTopUp adds continueTopUpCoins and resumes playing', () => {
    const s = new GameState();
    s.beginFreshSession();
    s.mutate((g) => {
      g.coinBank = 0;
      g.mode = 'gameOver';
    });
    s.applyContinueTopUp();
    expect(s.coinBank).toBe(gameBalance.economy.continueTopUpCoins);
    expect(s.mode).toBe('playing');
  });
});
