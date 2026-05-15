/**
 * ShoveGesture \u2014 detects a press-and-drag gesture (mouse or finger) anywhere
 * on the screen and translates it into a one-shot "shove" of the cabinet,
 * analogous to nudging a pinball machine.
 *
 * The drag direction maps to a world-space shove direction in the (X, Z)
 * plane (screen X \u2192 world X, screen Y \u2192 world Z, since the camera is
 * angled down and forward over the playfield). The coins receive an
 * impulse OPPOSITE to the drag direction (inertia in the cabinet's frame).
 * A short camera shake in the SHOVE direction provides visual feedback.
 *
 * Sound: AudioBus.playShove() is invoked on every successful shove.
 *
 * The gesture listens on `window` in the bubble phase so it co-exists with
 * the per-slot drop buttons \u2014 a quick tap on a slot triggers a drop, while
 * a press-and-drag triggers a shove on release.
 */
import type { AudioBus } from '../audio/AudioBus';
import type { CoinPool } from '../game/CoinPool';
import type { Renderer } from '../render/Renderer';
import type { ShoveMeter } from './ShoveMeter';

const MIN_DRAG_PX = 30; // pixel displacement below this is treated as a tap, not a shove
const MAX_DRAG_DURATION_MS = 800; // slow drags (e.g. accidental moves) are ignored
const PX_PER_VELOCITY = 200; // 200 px of drag \u2248 1.0 m/s coin velocity bump
const MAX_VELOCITY = 0.8; // m/s cap so a wild swipe can't yeet every coin// Per-axis attenuation on the impulse delivered to coins. The raw shove
// vector is way too strong — a single horizontal swipe could rearrange the
// entire playfield. Damp horizontal (X, left/right) to 30% and vertical
// (Z, forward/back, mapped from screen Y) to 10% of the gesture-derived
// magnitude. Camera shake is unaffected so visual feedback still feels
// crisp.
const SHOVE_X_GAIN = 0.3;
const SHOVE_Z_GAIN = 0.1;const COOLDOWN_MS = 200; // ignore retriggers within this window
const SHAKE_AMPLITUDE_M = 0.015; // metres camera shifts at full-strength shove
const SHAKE_DECAY_PER_SEC = 8; // exponential decay rate of the visual shake
const SHAKE_REST_EPSILON_M = 0.0001; // metres below which the shake is snapped to zero
const MS_PER_SECOND = 1000;

export class ShoveGesture {
  private pressed = false;
  private pressedPointerId = -1;
  private startX = 0;
  private startY = 0;
  private currentX = 0;
  private currentY = 0;
  private startTimeMs = 0;
  private lastShoveAtMs = -COOLDOWN_MS;

  // Camera shake state \u2014 added to the camera's base position each frame, then
  // decayed exponentially back to zero.
  private shakeX = 0;
  private shakeZ = 0;
  private readonly baseCamX: number;
  private readonly baseCamZ: number;

  constructor(
    private readonly coinPool: CoinPool,
    private readonly audio: AudioBus,
    private readonly renderer: Renderer,
    private readonly meter: ShoveMeter,
    private readonly onShove?: () => void,
  ) {
    this.baseCamX = renderer.camera.position.x;
    this.baseCamZ = renderer.camera.position.z;
    window.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancel);
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onCancel);
    this.renderer.camera.position.x = this.baseCamX;
    this.renderer.camera.position.z = this.baseCamZ;
  }

  /** Per-frame: decay the visual shake offset toward zero. */
  update(dtMs: number): void {
    if (this.shakeX === 0 && this.shakeZ === 0) return;
    const decay = Math.exp(-SHAKE_DECAY_PER_SEC * (dtMs / MS_PER_SECOND));
    this.shakeX *= decay;
    this.shakeZ *= decay;
    if (Math.abs(this.shakeX) < SHAKE_REST_EPSILON_M) this.shakeX = 0;
    if (Math.abs(this.shakeZ) < SHAKE_REST_EPSILON_M) this.shakeZ = 0;
    this.renderer.camera.position.x = this.baseCamX + this.shakeX;
    this.renderer.camera.position.z = this.baseCamZ + this.shakeZ;
  }

  private onDown = (e: PointerEvent): void => {
    // Track only the first active pointer; ignore secondary touches.
    if (this.pressed) return;
    this.pressed = true;
    this.pressedPointerId = e.pointerId;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.currentX = e.clientX;
    this.currentY = e.clientY;
    this.startTimeMs = performance.now();
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.pressed || e.pointerId !== this.pressedPointerId) return;
    this.currentX = e.clientX;
    this.currentY = e.clientY;
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.pressed || e.pointerId !== this.pressedPointerId) return;
    this.pressed = false;
    this.pressedPointerId = -1;
    const dx = this.currentX - this.startX;
    const dy = this.currentY - this.startY;
    const distSq = dx * dx + dy * dy;
    if (distSq < MIN_DRAG_PX * MIN_DRAG_PX) return;
    const now = performance.now();
    if (now - this.startTimeMs > MAX_DRAG_DURATION_MS) return;
    if (now - this.lastShoveAtMs < COOLDOWN_MS) return;
    // Overheat gate — the meter rejects shoves during its 15s lockout.
    if (!this.meter.tryConsume()) return;
    this.lastShoveAtMs = now;
    this.fire(dx, dy);
  };

  private onCancel = (e: PointerEvent): void => {
    if (e.pointerId !== this.pressedPointerId) return;
    this.pressed = false;
    this.pressedPointerId = -1;
  };

  private fire(dx: number, dy: number): void {
    const dist = Math.hypot(dx, dy);
    const mag = Math.min(MAX_VELOCITY, dist / PX_PER_VELOCITY);
    const nx = dx / dist;
    const ny = dy / dist;
    // Pinball nudge: cabinet jerks in the drag direction; from the playfield's
    // frame the loose coins inherit the OPPOSITE velocity. Per-axis gain
    // damps horizontal and (especially) forward/back impulses so a single
    // swipe nudges the coins instead of rearranging the whole playfield.
    this.coinPool.applyShove(-nx * mag * SHOVE_X_GAIN, -ny * mag * SHOVE_Z_GAIN);
    this.audio.playShove();
    this.onShove?.();
    // Visual feedback: camera shifts in the SHOVE (drag) direction, scaled by
    // the same magnitude, then decays back exponentially.
    const scale = (mag / MAX_VELOCITY) * SHAKE_AMPLITUDE_M;
    this.shakeX = nx * scale;
    this.shakeZ = ny * scale;
  }
}
