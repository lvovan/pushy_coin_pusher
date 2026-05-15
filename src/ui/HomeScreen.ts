/**
 * HomeScreen overlay (US1 entry, US2 resume).
 *
 * Shows the title, a Start button (always enabled), and a Resume button that
 * is only enabled when a save is present.
 */

export interface HomeScreenCallbacks {
  onStart(): void;
  onResume(): void;
}

export class HomeScreen {
  private readonly root: HTMLElement;
  private readonly resumeBtn: HTMLButtonElement;

  constructor(parent: HTMLElement, cb: HomeScreenCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'screen home-screen';
    this.root.innerHTML = `
      <div class="screen-inner">
        <h1 class="title">Pushy</h1>
        <p class="subtitle">Tap to drop. Get the valuables to win.</p>
        <button class="btn primary" data-action="start">Start</button>
        <button class="btn" data-action="resume" disabled>Resume</button>
      </div>
    `;
    const startBtn = this.root.querySelector('[data-action="start"]') as HTMLButtonElement;
    this.resumeBtn = this.root.querySelector('[data-action="resume"]') as HTMLButtonElement;
    startBtn.addEventListener('click', () => cb.onStart());
    this.resumeBtn.addEventListener('click', () => {
      if (!this.resumeBtn.disabled) cb.onResume();
    });
    parent.appendChild(this.root);
  }

  setResumeEnabled(enabled: boolean): void {
    this.resumeBtn.disabled = !enabled;
  }

  show(): void {
    this.root.style.display = '';
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  dispose(): void {
    this.root.remove();
  }
}
