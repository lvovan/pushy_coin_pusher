/**
 * TouchInput — single-tap drop trigger.
 *
 * Attaches passive:false touchstart + click on the canvas, calls
 * preventDefault to suppress synthetic clicks/pinch (research §R7), and emits
 * a single `tap` event. Multi-touch is ignored beyond the first contact.
 * The contextmenu handler suppresses long-press menus.
 */

export type TapHandler = () => void;

export class TouchInput {
  private readonly target: HTMLElement;
  private readonly onTouchStart: (e: TouchEvent) => void;
  private readonly onClick: (e: MouseEvent) => void;
  private readonly onContextMenu: (e: Event) => void;
  private readonly handlers: TapHandler[] = [];
  private lastTapMs = 0;

  constructor(target: HTMLElement) {
    this.target = target;
    this.onTouchStart = (e) => {
      e.preventDefault();
      this.fire();
    };
    this.onClick = (e) => {
      e.preventDefault();
      // Ignore synthetic mouse-click delivered right after a touch.
      const t = performance.now();
      const SYNTHETIC_WINDOW_MS = 600;
      if (t - this.lastTapMs < SYNTHETIC_WINDOW_MS) return;
      this.fire();
    };
    this.onContextMenu = (e) => e.preventDefault();
    target.addEventListener('touchstart', this.onTouchStart, { passive: false });
    target.addEventListener('click', this.onClick);
    target.addEventListener('contextmenu', this.onContextMenu);
  }

  onTap(cb: TapHandler): () => void {
    this.handlers.push(cb);
    return () => {
      const idx = this.handlers.indexOf(cb);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }

  private fire(): void {
    this.lastTapMs = performance.now();
    for (const cb of this.handlers) cb();
  }

  dispose(): void {
    this.target.removeEventListener('touchstart', this.onTouchStart);
    this.target.removeEventListener('click', this.onClick);
    this.target.removeEventListener('contextmenu', this.onContextMenu);
  }
}
