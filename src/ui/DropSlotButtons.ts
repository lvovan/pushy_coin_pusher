/**
 * DropSlotButtons — three full-height tap zones spanning the viewport, one per
 * coin column. The tap zone extends from the top of the screen to the bottom,
 * so a press anywhere in a column triggers its slot. On press, a subtle white
 * flash fades in/out over the touched column as a tactile hint.
 *
 * Press-and-hold (mouse or touch) produces a continuous flow of drops: while
 * pressed, `DropSlots.tapSlot()` is invoked every animation frame.
 * `tapSlot` itself enforces `perSlotCooldownMs`, so the rate is implicitly
 * capped and the bank depletes naturally.
 */
import * as THREE from 'three';

import { gameBalance } from '../config/gameBalance';
import type { DropSlots, SlotId } from '../game/DropSlots';
import type { Renderer } from '../render/Renderer';

const SLOT_COUNT = 3;
// Fallback flash height (fraction of viewport height) used until the
// projected back-wall position is known, e.g. before the camera has been
// updated for the first time.
const FLASH_HEIGHT_FALLBACK_FRAC = 0.4;
// Floor of the projected flash height in pixels so a tiny computed value
// (degenerate camera state on first frame, orientation change mid-render)
// never collapses the overlay to invisibility.
const FLASH_HEIGHT_MIN_PX = 80;

interface SlotEntry {
  readonly id: SlotId;
  readonly zone: HTMLButtonElement;
  readonly flash: HTMLDivElement;
  pressed: boolean;
  rafId: number;
}

export class DropSlotButtons {
  private readonly root: HTMLElement;
  private readonly slots: SlotEntry[] = [];
  private readonly onResize: () => void;
  private readonly renderer: Renderer;
  // Reusable Vector3 for back-wall world→screen projection so the layout
  // pass doesn't allocate every resize/orientation event.
  private readonly projection = new THREE.Vector3();

  constructor(parent: HTMLElement, drops: DropSlots, renderer: Renderer) {
    this.renderer = renderer;
    this.root = document.createElement('div');
    this.root.className = 'drop-slots';

    for (let i = 0; i < SLOT_COUNT; i += 1) {
      const id = i as SlotId;

      // Full-height invisible tap zone — catches presses anywhere in column.
      const zone = document.createElement('button');
      zone.className = 'drop-slot-zone';
      zone.setAttribute('data-slot-zone', String(i));
      zone.setAttribute('aria-label', `Drop slot ${i + 1}`);

      // Subtle white-flash overlay played each time the column is pressed.
      const flash = document.createElement('div');
      flash.className = 'drop-slot-flash';
      flash.addEventListener('animationend', () => {
        flash.classList.remove('is-flashing');
      });
      zone.appendChild(flash);

      this.root.appendChild(zone);

      const entry: SlotEntry = {
        id,
        zone,
        flash,
        pressed: false,
        rafId: 0,
      };
      this.slots.push(entry);
      this.attachPressHandlers(entry, drops);
    }

    parent.appendChild(this.root);

    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    this.layout();
  }

  private attachPressHandlers(entry: SlotEntry, drops: DropSlots): void {
    const stop = (): void => {
      if (!entry.pressed) return;
      entry.pressed = false;
      if (entry.rafId !== 0) {
        cancelAnimationFrame(entry.rafId);
        entry.rafId = 0;
      }
    };

    // Restart the column's flash animation. Called only after a tap
    // actually spawned a coin so the visual cue is never out-of-sync
    // with reality (e.g. when the bank is empty or the pool is full).
    const playFlash = (): void => {
      entry.flash.classList.remove('is-flashing');
      // Force reflow so re-adding the class restarts the animation.
      void entry.flash.offsetWidth;
      entry.flash.classList.add('is-flashing');
    };

    const tick = (): void => {
      if (!entry.pressed) return;
      if (drops.tapSlot(entry.id, performance.now())) playFlash();
      entry.rafId = requestAnimationFrame(tick);
    };

    const start = (e: PointerEvent): void => {
      e.preventDefault();
      if (entry.pressed) return;
      entry.pressed = true;
      entry.zone.setPointerCapture?.(e.pointerId);
      if (drops.tapSlot(entry.id, performance.now())) playFlash();
      entry.rafId = requestAnimationFrame(tick);
    };

    entry.zone.addEventListener('pointerdown', start);
    entry.zone.addEventListener('pointerup', stop);
    entry.zone.addEventListener('pointercancel', stop);
    entry.zone.addEventListener('pointerleave', stop);
    entry.zone.addEventListener('lostpointercapture', stop);
    entry.zone.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private layout(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const zoneWidth = width / SLOT_COUNT;
    for (let i = 0; i < this.slots.length; i += 1) {
      const entry = this.slots[i];
      entry.zone.style.left = `${zoneWidth * i}px`;
      entry.zone.style.width = `${zoneWidth}px`;
    }
    // Project the play-tray's back-wall top edge into screen space so the
    // flash gradient fades out exactly where the wall is rendered. We use
    // (x=0, y=floorY+wallHeight, z=-depth/2), i.e. the centre of the top
    // of the back wall, because the camera is centred on x=0 so any X is
    // equivalent for the Y projection. Three.js's `Vector3.project` maps
    // world coords to NDC [-1, +1]; we convert NDC y → CSS pixel y from
    // the top of the viewport.
    const camera = this.renderer.camera;
    const wallTopY = gameBalance.tray.wallHeight; // floorY is 0
    const wallBackZ = -gameBalance.tray.depth / 2;
    this.projection.set(0, wallTopY, wallBackZ);
    this.projection.project(camera);
    // NDC y in [-1, +1] → CSS pixel y from the top.
    let flashHeightPx = ((1 - this.projection.y) / 2) * height;
    if (!Number.isFinite(flashHeightPx) || flashHeightPx <= 0) {
      flashHeightPx = height * FLASH_HEIGHT_FALLBACK_FRAC;
    }
    if (flashHeightPx < FLASH_HEIGHT_MIN_PX) flashHeightPx = FLASH_HEIGHT_MIN_PX;
    if (flashHeightPx > height) flashHeightPx = height;
    const flashHeightCss = `${flashHeightPx.toFixed(1)}px`;
    for (const entry of this.slots) {
      entry.flash.style.setProperty('--flash-height', flashHeightCss);
    }
  }

  show(): void {
    this.root.style.display = '';
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    for (const entry of this.slots) {
      if (entry.rafId !== 0) cancelAnimationFrame(entry.rafId);
    }
    this.root.remove();
  }
}
