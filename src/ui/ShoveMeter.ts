/**
 * ShoveMeter — overheat-style cooldown gauge for the press-and-drag shove
 * gesture. Sits as a horizontal bar across the top of the screen, just
 * below the HUD row.
 *
 * Mechanics
 * - Each successful shove adds 1 / CAPACITY_SHOVES to the meter.
 * - The meter decays linearly at DECAY_PER_SEC while not locked out.
 * - When the meter hits 1.0 the player is locked out for LOCKOUT_MS;
 *   `tryConsume()` returns `false` during this window. After the lockout
 *   the meter resumes normal decay from full.
 *
 * Visual
 * - Fill width tracks the meter level (0..1).
 * - Fill color is an HSL gradient from green (low) → yellow (mid) →
 *   red (overheat).
 * - During lockout an "OVERHEAT" label flashes and the bar stays red.
 */

const CAPACITY_SHOVES = 4; // shoves to reach full
const PER_SHOVE_INCREMENT = 1 / CAPACITY_SHOVES;
const DECAY_PER_SEC = 1 / 6; // full → empty in 6s of inactivity
const LOCKOUT_MS = 15_000; // overheat lockout duration
const MS_PER_SECOND = 1000;
const FULL_LEVEL = 1;
const HUE_GREEN = 120;
const HUE_RED = 0;
const SATURATION_PCT = 85;
const LIGHTNESS_PCT = 48;

export class ShoveMeter {
  private readonly root: HTMLElement;
  private readonly fillEl: HTMLElement;
  private readonly labelEl: HTMLElement;
  private level = 0;
  private lockedOutUntilMs = -1;
  private lastRenderedLevel = -1;
  private lastRenderedLocked = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'shove-meter';
    this.root.innerHTML = `
      <div class="shove-meter-track">
        <div class="shove-meter-fill" data-fill></div>
        <div class="shove-meter-label" data-label></div>
      </div>
    `;
    this.fillEl = this.root.querySelector('[data-fill]') as HTMLElement;
    this.labelEl = this.root.querySelector('[data-label]') as HTMLElement;
    parent.appendChild(this.root);
    this.render(true);
  }

  /** Returns true if the shove is allowed (meter not in lockout). On
   *  success the meter is bumped by one shove's worth. If the bump
   *  pushes it to full, the lockout starts immediately. */
  tryConsume(): boolean {
    if (this.isLockedOut()) return false;
    this.level = Math.min(FULL_LEVEL, this.level + PER_SHOVE_INCREMENT);
    if (this.level >= FULL_LEVEL) {
      this.lockedOutUntilMs = performance.now() + LOCKOUT_MS;
    }
    return true;
  }

  /** Per-frame: decay the meter while not locked out, then refresh DOM. */
  update(dtMs: number): void {
    const nowMs = performance.now();
    if (nowMs >= this.lockedOutUntilMs && this.lockedOutUntilMs > 0) {
      // Lockout window just ended — clamp meter so decay starts from full.
      this.lockedOutUntilMs = -1;
      this.level = FULL_LEVEL;
    }
    if (!this.isLockedOut() && this.level > 0) {
      this.level = Math.max(0, this.level - DECAY_PER_SEC * (dtMs / MS_PER_SECOND));
    }
    this.render(false);
  }

  show(): void {
    this.root.classList.remove('is-hidden');
  }

  hide(): void {
    this.root.classList.add('is-hidden');
  }

  dispose(): void {
    this.root.remove();
  }

  private isLockedOut(): boolean {
    return this.lockedOutUntilMs > 0 && performance.now() < this.lockedOutUntilMs;
  }

  private render(force: boolean): void {
    const locked = this.isLockedOut();
    const displayLevel = locked ? FULL_LEVEL : this.level;
    // Avoid hammering style writes when nothing visible changed.
    const levelChanged = Math.abs(displayLevel - this.lastRenderedLevel) > 0.005;
    const lockedChanged = locked !== this.lastRenderedLocked;
    if (!force && !levelChanged && !lockedChanged) return;
    this.lastRenderedLevel = displayLevel;
    this.lastRenderedLocked = locked;

    const widthPct = displayLevel * 100; // @no-magic-ok percentage conversion
    this.fillEl.style.width = `${widthPct}%`;
    const hue = HUE_GREEN + (HUE_RED - HUE_GREEN) * displayLevel;
    this.fillEl.style.background = `hsl(${hue}, ${SATURATION_PCT}%, ${LIGHTNESS_PCT}%)`;
    this.root.classList.toggle('is-overheat', locked);
    this.labelEl.textContent = locked ? 'OVERHEAT' : 'SHOVE';
  }
}
