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
import type { DropSlots, SlotId } from '../game/DropSlots';
import type { Renderer } from '../render/Renderer';

const SLOT_COUNT = 3;

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

  constructor(parent: HTMLElement, drops: DropSlots, _renderer: Renderer) {
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

    const tick = (): void => {
      if (!entry.pressed) return;
      drops.tapSlot(entry.id, performance.now());
      entry.rafId = requestAnimationFrame(tick);
    };

    const start = (e: PointerEvent): void => {
      e.preventDefault();
      if (entry.pressed) return;
      entry.pressed = true;
      // Restart the flash animation each press.
      entry.flash.classList.remove('is-flashing');
      // Force reflow so re-adding the class restarts the animation.
      void entry.flash.offsetWidth;
      entry.flash.classList.add('is-flashing');
      entry.zone.setPointerCapture?.(e.pointerId);
      drops.tapSlot(entry.id, performance.now());
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
    const zoneWidth = width / SLOT_COUNT;
    for (let i = 0; i < this.slots.length; i += 1) {
      const entry = this.slots[i];
      entry.zone.style.left = `${zoneWidth * i}px`;
      entry.zone.style.width = `${zoneWidth}px`;
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
