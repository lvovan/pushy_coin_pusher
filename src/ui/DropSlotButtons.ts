/**
 * DropSlotButtons — three full-height tap zones spanning the viewport, one per
 * coin column. The tap zone extends from the top of the screen to the bottom,
 * so a press anywhere in a column triggers its slot. On press, a subtle white
 * flash fades in/out over the touched column as a tactile hint.
 *
 * Drops fire on pointer-up, not pointer-down, so a shove gesture (press-and-
 * drag) does not accidentally drop a coin in the column where the gesture
 * began. If the pointer moves more than `DRAG_THRESHOLD_PX` while pressed,
 * the press is classified as a shove and no drop occurs on release.
 *
 * Press-and-hold (mouse or touch) still produces a continuous flow of drops:
 * after `HOLD_DELAY_MS` of being pressed without significant movement, the
 * column enters "hold mode" and `DropSlots.tapSlot()` is invoked every
 * animation frame. `tapSlot` itself enforces `perSlotCooldownMs`, so the
 * rate is implicitly capped and the bank depletes naturally.
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
// Pointer movement (in CSS pixels) above which a press is reclassified from
// a tap into a shove gesture. Mirrors `MIN_DRAG_PX` in `ShoveGesture` so the
// two systems agree on the tap/shove boundary.
const DRAG_THRESHOLD_PX = 30;
// Delay before a stationary press enters continuous "hold to drop" mode.
// Short enough that intentional holds feel responsive, long enough that a
// brief tap-release cycle never accidentally engages hold mode.
const HOLD_DELAY_MS = 180;

interface SlotEntry {
  readonly id: SlotId;
  readonly zone: HTMLButtonElement;
  readonly flash: HTMLDivElement;
  pressed: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  isShove: boolean;
  holdActive: boolean;
  holdTimerId: number;
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
        pointerId: -1,
        startX: 0,
        startY: 0,
        isShove: false,
        holdActive: false,
        holdTimerId: 0,
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
    // Restart the column's flash animation. Called only after a tap
    // actually spawned a coin so the visual cue is never out-of-sync
    // with reality (e.g. when the bank is empty or the pool is full).
    const playFlash = (): void => {
      entry.flash.classList.remove('is-flashing');
      // Force reflow so re-adding the class restarts the animation.
      void entry.flash.offsetWidth;
      entry.flash.classList.add('is-flashing');
    };

    const cancelHoldTimer = (): void => {
      if (entry.holdTimerId !== 0) {
        clearTimeout(entry.holdTimerId);
        entry.holdTimerId = 0;
      }
    };

    const cancelRaf = (): void => {
      if (entry.rafId !== 0) {
        cancelAnimationFrame(entry.rafId);
        entry.rafId = 0;
      }
    };

    // Continuous-drop loop engaged after HOLD_DELAY_MS of stationary press.
    const tick = (): void => {
      if (!entry.pressed || !entry.holdActive) return;
      if (drops.tapSlot(entry.id, performance.now())) playFlash();
      entry.rafId = requestAnimationFrame(tick);
    };

    const beginHold = (): void => {
      entry.holdTimerId = 0;
      if (!entry.pressed || entry.isShove) return;
      entry.holdActive = true;
      // First drop fires the moment hold mode engages.
      if (drops.tapSlot(entry.id, performance.now())) playFlash();
      entry.rafId = requestAnimationFrame(tick);
    };

    const reset = (): void => {
      entry.pressed = false;
      entry.pointerId = -1;
      entry.isShove = false;
      entry.holdActive = false;
      cancelHoldTimer();
      cancelRaf();
    };

    const start = (e: PointerEvent): void => {
      e.preventDefault();
      if (entry.pressed) return;
      entry.pressed = true;
      entry.pointerId = e.pointerId;
      entry.startX = e.clientX;
      entry.startY = e.clientY;
      entry.isShove = false;
      entry.holdActive = false;
      entry.zone.setPointerCapture?.(e.pointerId);
      entry.holdTimerId = window.setTimeout(beginHold, HOLD_DELAY_MS);
      // No drop fires here — drops are deferred to pointer-up (single tap)
      // or to the moment hold mode engages, after the press has been
      // disambiguated from a shove gesture.
    };

    const move = (e: PointerEvent): void => {
      if (!entry.pressed || e.pointerId !== entry.pointerId) return;
      if (entry.isShove) return;
      const dx = e.clientX - entry.startX;
      const dy = e.clientY - entry.startY;
      if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        // Press has become a shove — abort any pending hold timer or active
        // continuous drops and remember the press is no longer a tap.
        entry.isShove = true;
        cancelHoldTimer();
        cancelRaf();
        entry.holdActive = false;
      }
    };

    const end = (e: PointerEvent): void => {
      if (!entry.pressed || e.pointerId !== entry.pointerId) return;
      const wasShove = entry.isShove;
      const wasHold = entry.holdActive;
      reset();
      // Single-tap drop: short press with no significant movement and no
      // hold-mode engagement. A shove gesture or a hold session never
      // produces an additional drop on release.
      if (!wasShove && !wasHold) {
        if (drops.tapSlot(entry.id, performance.now())) playFlash();
      }
    };

    const cancel = (e: PointerEvent): void => {
      if (e.pointerId !== entry.pointerId) return;
      reset();
    };

    entry.zone.addEventListener('pointerdown', start);
    entry.zone.addEventListener('pointermove', move);
    entry.zone.addEventListener('pointerup', end);
    entry.zone.addEventListener('pointercancel', cancel);
    entry.zone.addEventListener('lostpointercapture', cancel);
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
      if (entry.holdTimerId !== 0) clearTimeout(entry.holdTimerId);
    }
    this.root.remove();
  }
}
