import { describe, expect, it } from 'vitest';

import { FixedStepAccumulator } from '../../src/util/time';

describe('FixedStepAccumulator', () => {
  it('rejects non-positive step', () => {
    expect(() => new FixedStepAccumulator(0)).toThrow();
  });

  it('returns exact step count on multiples', () => {
    const acc = new FixedStepAccumulator(10);
    expect(acc.step(30)).toBe(3);
    expect(acc.step(0)).toBe(0);
    expect(acc.step(10)).toBe(1);
  });

  it('does not drift across many small frames', () => {
    const acc = new FixedStepAccumulator(16);
    let total = 0;
    for (let i = 0; i < 10; i += 1) total += acc.step(16);
    expect(total).toBe(10);
  });

  it('caps catch-up at 4 substeps and drops overflow', () => {
    const acc = new FixedStepAccumulator(10);
    expect(acc.step(1000)).toBe(4);
    // After dropping overflow, the next small delta should not trigger a step.
    expect(acc.step(5)).toBe(0);
  });

  it('reset clears the accumulator', () => {
    const acc = new FixedStepAccumulator(10);
    acc.step(7);
    acc.reset();
    expect(acc.step(9)).toBe(0);
  });

  it('ignores negative deltas', () => {
    const acc = new FixedStepAccumulator(10);
    expect(acc.step(-5)).toBe(0);
  });
});
