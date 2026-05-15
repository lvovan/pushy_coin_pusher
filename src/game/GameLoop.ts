/**
 * GameLoop — orchestrates the rAF tick: fixed-step physics → per-step updates →
 * render. Steps catch up via FixedStepAccumulator capped at 4 substeps per
 * frame (research §R2).
 */
import { gameBalance } from '../config/gameBalance';
import type { Renderer } from '../render/Renderer';
import { FixedStepAccumulator, now } from '../util/time';
import type { PhysicsWorld, SensorEvent, ContactBetween } from './PhysicsWorld';

export type StepCallback = (stepMs: number) => void;
export type RenderCallback = (dtMs: number) => void;
export type FrameCallback = () => void;
export type SensorCallback = (e: SensorEvent) => void;
export type ContactCallback = (c: ContactBetween) => void;

const MS_PER_SECOND = 1000;

export class GameLoop {
  private rafId: number | undefined;
  private lastFrameMs = 0;
  private readonly accumulator: FixedStepAccumulator;
  private readonly preStepCallbacks: StepCallback[] = [];
  private readonly postStepCallbacks: StepCallback[] = [];
  private readonly afterStepsCallbacks: FrameCallback[] = [];
  private readonly renderCallbacks: RenderCallback[] = [];
  private sensorCallback: SensorCallback | undefined;
  private contactCallback: ContactCallback | undefined;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly renderer: Renderer,
  ) {
    const stepMs = MS_PER_SECOND / gameBalance.physics.fixedTimestepHz;
    this.accumulator = new FixedStepAccumulator(stepMs);
  }

  onPreStep(cb: StepCallback): void {
    this.preStepCallbacks.push(cb);
  }

  onPostStep(cb: StepCallback): void {
    this.postStepCallbacks.push(cb);
  }

  /**
   * Fires once per rAF tick *after* the last physics substep of that tick,
   * but only when at least one substep ran. Use for work that only needs the
   * final post-step state of the frame (side-fall-off cleanup, game-over
   * checks, pose-write for rendering). Running this per-frame instead of
   * per-substep collapses N × substeps WASM crossings into N, which is
   * the dominant cost when several substeps fire in a single frame.
   */
  onAfterSteps(cb: FrameCallback): void {
    this.afterStepsCallbacks.push(cb);
  }

  onRender(cb: RenderCallback): void {
    this.renderCallbacks.push(cb);
  }

  onSensor(cb: SensorCallback): void {
    this.sensorCallback = cb;
  }

  onContact(cb: ContactCallback): void {
    this.contactCallback = cb;
  }

  start(): void {
    if (this.rafId !== undefined) return;
    this.lastFrameMs = now();
    this.accumulator.reset();
    const tick = (): void => {
      this.rafId = requestAnimationFrame(tick);
      this.tick();
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.rafId !== undefined) {
      cancelAnimationFrame(this.rafId);
      this.rafId = undefined;
    }
  }

  private tick(): void {
    const t = now();
    const delta = t - this.lastFrameMs;
    this.lastFrameMs = t;

    const steps = this.accumulator.step(delta);
    const stepMs = this.accumulator.stepMs;
    for (let i = 0; i < steps; i += 1) {
      for (const cb of this.preStepCallbacks) cb(stepMs);
      this.physics.step(this.sensorCallback, this.contactCallback);
      for (const cb of this.postStepCallbacks) cb(stepMs);
    }
    if (steps > 0) {
      for (const cb of this.afterStepsCallbacks) cb();
    }

    for (const cb of this.renderCallbacks) cb(delta);
    this.renderer.render();
  }
}
