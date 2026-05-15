/**
 * Time utilities: monotonic clock and a fixed-step accumulator with catch-up cap.
 *
 * See research.md §R2 — fixed-timestep physics decoupled from rAF, capped at 4
 * substeps per frame to prevent the spiral-of-death after tab backgrounding.
 */

export function now(): number {
  return performance.now();
}

const MAX_CATCH_UP_STEPS = 4;

export class FixedStepAccumulator {
  private accumulatorMs = 0;
  readonly stepMs: number;

  constructor(stepMs: number) {
    if (stepMs <= 0) throw new Error('FixedStepAccumulator: stepMs must be > 0');
    this.stepMs = stepMs;
  }

  /**
   * Add elapsed wall time and return the number of fixed steps to run.
   * Caps catch-up at MAX_CATCH_UP_STEPS to avoid lock-up after a long pause.
   */
  step(deltaMs: number): number {
    if (deltaMs < 0) return 0;
    this.accumulatorMs += deltaMs;
    let steps = 0;
    while (this.accumulatorMs >= this.stepMs && steps < MAX_CATCH_UP_STEPS) {
      this.accumulatorMs -= this.stepMs;
      steps += 1;
    }
    if (steps === MAX_CATCH_UP_STEPS && this.accumulatorMs >= this.stepMs) {
      // Drop overflow rather than chasing it.
      this.accumulatorMs = 0;
    }
    return steps;
  }

  reset(): void {
    this.accumulatorMs = 0;
  }

  /**
   * Fraction of a step remaining in the accumulator at the moment of the
   * call (range [0, 1)). Used by the renderer to interpolate body poses
   * between the previous and current physics states, giving smooth motion on
   * displays that refresh faster than the physics rate (e.g. 120 Hz phones).
   */
  get alpha(): number {
    return this.accumulatorMs / this.stepMs;
  }
}
