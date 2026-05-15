/**
 * Congrats overlay — shown when GameState.mode === 'won' (every designated
 * valuable has been collected). Gameplay is already halted by the mode
 * change (slot buttons, shove meter, etc. subscribe to mode === 'playing');
 * this overlay celebrates the win and offers a single action: restart the
 * session.
 */
import type { GameState } from '../game/GameState';

export interface CongratsCallbacks {
  onPlayAgain(): void;
}

export class CongratsOverlay {
  private readonly root: HTMLElement;
  private unsubscribe: (() => void) | undefined;

  constructor(parent: HTMLElement, cb: CongratsCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'screen congrats-screen';
    this.root.style.display = 'none';
    this.root.innerHTML = `
      <div class="screen-inner">
        <h2 class="title">Congratulations!</h2>
        <p class="subtitle">You collected every valuable.</p>
        <button class="btn primary" data-action="play-again">Play Again</button>
      </div>
    `;
    const playBtn = this.root.querySelector('[data-action="play-again"]') as HTMLButtonElement;
    playBtn.addEventListener('click', () => cb.onPlayAgain());
    parent.appendChild(this.root);
  }

  attach(state: GameState): void {
    this.unsubscribe = state.subscribe((s) => {
      if (s.mode === 'won') this.show();
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
