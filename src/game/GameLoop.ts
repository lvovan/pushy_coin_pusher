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
export type SensorCallback = (e: SensorEvent) => void;
export type ContactCallback = (c: ContactBetween) => void;

const MS_PER_SECOND = 1000;

export class GameLoop {
  private rafId: number | undefined;
  private lastFrameMs = 0;
  private readonly accumulator: FixedStepAccumulator;
  private readonly preStepCallbacks: StepCallback[] = [];
  private readonly postStepCallbacks: StepCallback[] = [];
  private readonly renderCallbacks: StepCallback[] = [];
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

  onRender(cb: StepCallback): void {
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

    for (const cb of this.renderCallbacks) cb(delta);
    this.renderer.render();
  }
}
