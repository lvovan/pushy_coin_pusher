/**
 * DropSlotButtons — three narrow tap-zones positioned over the canvas, one per
 * coin column. Each zone projects the world-space drop point onto the screen
 * so the button visually marks exactly where coins will appear.
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
const SLOT_WIDTH_PX = 64;
const SLOT_HEIGHT_PX = 56;
const SLOT_TOP_OFFSET_PX = 12;
const SLOT_PROJECT_Z = -0.2; // matches SPAWN_BACK_Z in DropSlots
const SLOT_PROJECT_Y = 0;

interface SlotEntry {
  readonly id: SlotId;
  readonly button: HTMLButtonElement;
  readonly worldX: number;
  pressed: boolean;
  rafId: number;
}

export class DropSlotButtons {
  private readonly root: HTMLElement;
  private readonly slots: SlotEntry[] = [];
  private readonly onResize: () => void;

  constructor(parent: HTMLElement, drops: DropSlots, renderer: Renderer) {
    this.root = document.createElement('div');
    this.root.className = 'drop-slots';

    for (let i = 0; i < SLOT_COUNT; i += 1) {
      const id = i as SlotId;
      const button = document.createElement('button');
      button.className = 'drop-slot';
      button.setAttribute('data-slot', String(i));
      button.setAttribute('aria-label', `Drop slot ${i + 1}`);
      button.style.width = `${SLOT_WIDTH_PX}px`;
      button.style.height = `${SLOT_HEIGHT_PX}px`;
      this.root.appendChild(button);

      const entry: SlotEntry = {
        id,
        button,
        worldX: gameBalance.spawning.slotPositionsX[i] ?? 0,
        pressed: false,
        rafId: 0,
      };
      this.slots.push(entry);
      this.attachPressHandlers(entry, drops);
    }

    parent.appendChild(this.root);

    this.onResize = () => this.layout(renderer);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    this.layout(renderer);
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
      entry.button.setPointerCapture?.(e.pointerId);
      drops.tapSlot(entry.id, performance.now());
      entry.rafId = requestAnimationFrame(tick);
    };

    entry.button.addEventListener('pointerdown', start);
    entry.button.addEventListener('pointerup', stop);
    entry.button.addEventListener('pointercancel', stop);
    entry.button.addEventListener('pointerleave', stop);
    entry.button.addEventListener('lostpointercapture', stop);
    entry.button.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private layout(renderer: Renderer): void {
    const width = window.innerWidth;
    const v = new THREE.Vector3();
    for (const entry of this.slots) {
      v.set(entry.worldX, SLOT_PROJECT_Y, SLOT_PROJECT_Z);
      v.project(renderer.camera);
      const px = (v.x + 1) * 0.5 * width;
      entry.button.style.left = `${px - SLOT_WIDTH_PX * 0.5}px`;
      entry.button.style.top = `${SLOT_TOP_OFFSET_PX}px`;
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
