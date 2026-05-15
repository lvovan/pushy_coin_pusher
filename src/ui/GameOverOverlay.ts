/**
 * Game Over overlay — shows when GameState.mode === 'gameOver' (FR-016a).
 *
 * Two actions:
 *   - Play Again: dispatches `onPlayAgain` (fresh session, clears pool).
 *   - Continue with N coins: dispatches `onContinue` (top-up, keeps state).
 */
import { gameBalance } from '../config/gameBalance';
import type { GameState } from '../game/GameState';

export interface GameOverCallbacks {
  onPlayAgain(): void;
  onContinue(): void;
}

export class GameOverOverlay {
  private readonly root: HTMLElement;
  private unsubscribe: (() => void) | undefined;

  constructor(parent: HTMLElement, cb: GameOverCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'screen game-over-screen';
    this.root.style.display = 'none';
    this.root.innerHTML = `
      <div class="screen-inner">
        <h2 class="title">Game Over</h2>
        <p class="subtitle">You're out of coins.</p>
        <button class="btn primary" data-action="play-again">Play Again</button>
        <button class="btn" data-action="continue">Continue with ${gameBalance.economy.continueTopUpCoins} coins</button>
      </div>
    `;
    const playBtn = this.root.querySelector('[data-action="play-again"]') as HTMLButtonElement;
    const contBtn = this.root.querySelector('[data-action="continue"]') as HTMLButtonElement;
    playBtn.addEventListener('click', () => cb.onPlayAgain());
    contBtn.addEventListener('click', () => cb.onContinue());
    parent.appendChild(this.root);
  }

  attach(state: GameState): void {
    this.unsubscribe = state.subscribe((s) => {
      if (s.mode === 'gameOver') this.show();
      else this.hide();
    });
  }

  show(): void {
    this.root.style.display = '';
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  isVisible(): boolean {
    return this.root.style.display !== 'none';
  }

  dispose(): void {
    this.unsubscribe?.();
    this.root.remove();
  }
}
