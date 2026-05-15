/**
 * Portrait-locked viewport sizing. Listens for resize and orientationchange and
 * keeps the renderer's drawing buffer in sync with the visible viewport.
 */
import type { Renderer } from './Renderer';

export class ResizeManager {
  private readonly renderer: Renderer;
  private readonly onResize: () => void;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.onResize = () => this.apply();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    this.apply();
  }

  apply(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
  }
}
