/**
 * T044 — Game Over flow integration.
 *
 * Verifies GameState→GameOverOverlay wiring: when state transitions to
 * 'gameOver', the overlay becomes visible.
 */
import { describe, expect, it } from 'vitest';

import { GameState } from '../../src/game/GameState';
import { GameOverOverlay } from '../../src/ui/GameOverOverlay';

describe('Game Over flow', () => {
  it('shows overlay when bank reaches zero in playing mode', () => {
    document.body.innerHTML = '<div id="overlay"></div>';
    const overlay = document.getElementById('overlay')!;
    const state = new GameState();
    const go = new GameOverOverlay(overlay, {
      onPlayAgain() {
        /* noop */
      },
      onContinue() {
        /* noop */
      },
    });
    go.attach(state);

    state.beginFreshSession();
    expect(go.isVisible()).toBe(false);

    state.mutate((s) => {
      s.coinBank = 0;
    });
    state.triggerGameOver();
    expect(state.mode).toBe('gameOver');
    expect(go.isVisible()).toBe(true);
  });

  it('hides overlay when continuing with top-up coins', () => {
    document.body.innerHTML = '<div id="overlay"></div>';
    const overlay = document.getElementById('overlay')!;
    const state = new GameState();
    const go = new GameOverOverlay(overlay, {
      onPlayAgain() {
        /* noop */
      },
      onContinue() {
        /* noop */
      },
    });
    go.attach(state);

    state.beginFreshSession();
    state.mutate((s) => {
      s.coinBank = 0;
    });
    state.triggerGameOver();
    expect(go.isVisible()).toBe(true);
    state.applyContinueTopUp();
    expect(state.mode).toBe('playing');
    expect(go.isVisible()).toBe(false);
  });
});
