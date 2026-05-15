/**
 * Hud — DOM overlay showing coin bank + valuables (spec FR-007, FR-008).
 *
 * Read-only; subscribes to GameState and re-renders text nodes only when
 * values change (no DOM rebuild churn).
 */
import type { GameState } from '../game/GameState';

export class Hud {
  private readonly root: HTMLElement;
  private readonly bankEl: HTMLElement;
  private readonly valuablesEl: HTMLElement;
  private lastBank = Number.NaN;
  private lastValuables = Number.NaN;
  private unsubscribe: (() => void) | undefined;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-row"><span class="hud-label">Coins</span><span class="hud-value" data-bank>0</span></div>
      <div class="hud-row"><span class="hud-label">Valuables</span><span class="hud-value" data-valuables>0</span></div>
    `;
    this.bankEl = this.root.querySelector('[data-bank]') as HTMLElement;
    this.valuablesEl = this.root.querySelector('[data-valuables]') as HTMLElement;
    parent.appendChild(this.root);
  }

  attach(state: GameState): void {
    this.unsubscribe = state.subscribe((s) => {
      if (s.coinBank !== this.lastBank) {
        this.lastBank = s.coinBank;
        this.bankEl.textContent = String(s.coinBank);
      }
      if (s.valuablesCollected !== this.lastValuables) {
        this.lastValuables = s.valuablesCollected;
        this.valuablesEl.textContent = String(s.valuablesCollected);
      }
    });
  }

  show(): void {
    this.root.style.display = '';
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  dispose(): void {
    this.unsubscribe?.();
    this.root.remove();
  }
}
