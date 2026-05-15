/**
 * DropSlotButtons — three full-height tap zones spanning the viewport, one per
 * coin column. A small visual marker sits at the top of each zone showing the
 * projected world-space drop point so players still see where coins will
 * appear; the tap zone itself extends from the top of the screen to the
 * bottom, so a press anywhere in a column triggers its slot.
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
  readonly zone: HTMLButtonElement;
  readonly marker: HTMLDivElement;
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

      // Full-height invisible tap zone — catches presses anywhere in column.
      const zone = document.createElement('button');
      zone.className = 'drop-slot-zone';
      zone.setAttribute('data-slot-zone', String(i));
      zone.setAttribute('aria-label', `Drop slot ${i + 1}`);
      this.root.appendChild(zone);

      // Small visual marker projected onto the world-space spawn point.
      const marker = document.createElement('div');
      marker.className = 'drop-slot';
      marker.setAttribute('data-slot', String(i));
      marker.style.width = `${SLOT_WIDTH_PX}px`;
      marker.style.height = `${SLOT_HEIGHT_PX}px`;
      this.root.appendChild(marker);

      const entry: SlotEntry = {
        id,
        zone,
        marker,
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
      entry.marker.classList.remove('is-pressed');
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
      entry.marker.classList.add('is-pressed');
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

  private layout(renderer: Renderer): void {
    const width = window.innerWidth;
    const zoneWidth = width / SLOT_COUNT;
    const v = new THREE.Vector3();
    for (let i = 0; i < this.slots.length; i += 1) {
      const entry = this.slots[i];
      // Full-height tap zone: one of three equal vertical columns spanning the
      // entire viewport. Pressing anywhere in a column triggers its slot.
      entry.zone.style.left = `${zoneWidth * i}px`;
      entry.zone.style.width = `${zoneWidth}px`;

      // Visual marker stays anchored to the projected world-space spawn point.
      v.set(entry.worldX, SLOT_PROJECT_Y, SLOT_PROJECT_Z);
      v.project(renderer.camera);
      const px = (v.x + 1) * 0.5 * width;
      entry.marker.style.left = `${px - SLOT_WIDTH_PX * 0.5}px`;
      entry.marker.style.top = `${SLOT_TOP_OFFSET_PX}px`;
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
