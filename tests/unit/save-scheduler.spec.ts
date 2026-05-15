import { describe, expect, it } from 'vitest';

import { gameBalance } from '../../src/config/gameBalance';
import { SaveScheduler, type PhaseSource } from '../../src/persistence/SaveScheduler';

class FakeClock {
  private nowMs = 0;
  private timers: { handle: number; due: number; fn: () => void }[] = [];
  private nextHandle = 1;

  now = (): number => this.nowMs;
  setTimeout = (fn: () => void, ms: number): number => {
    const handle = this.nextHandle++;
    this.timers.push({ handle, due: this.nowMs + ms, fn });
    return handle;
  };
  clearTimeout = (handle: unknown): void => {
    this.timers = this.timers.filter((t) => t.handle !== handle);
  };
  advance(ms: number): void {
    this.nowMs += ms;
    // Fire any due timers in scheduled order.
    let due = this.timers.filter((t) => t.due <= this.nowMs).sort((a, b) => a.due - b.due);
    while (due.length > 0) {
      const next = due[0]!;
      this.timers = this.timers.filter((t) => t.handle !== next.handle);
      next.fn();
      due = this.timers.filter((t) => t.due <= this.nowMs).sort((a, b) => a.due - b.due);
    }
  }
}

function setup(initialPhase: 'idle' | 'stepping' = 'idle'): {
  clock: FakeClock;
  phaseSource: { phase: 'idle' | 'stepping' };
  flushes: number;
  scheduler: SaveScheduler;
} {
  const clock = new FakeClock();
  const phaseSource: { phase: 'idle' | 'stepping' } = { phase: initialPhase };
  const flushes = { count: 0 };
  const scheduler = new SaveScheduler(phaseSource as PhaseSource, () => {
    flushes.count += 1;
  }, {
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    attachLifecycleListeners: false,
  });
  return {
    clock,
    phaseSource,
    get flushes() { return flushes.count; },
    scheduler,
  } as unknown as {
    clock: FakeClock;
    phaseSource: { phase: 'idle' | 'stepping' };
    flushes: number;
    scheduler: SaveScheduler;
  };
}

describe('SaveScheduler', () => {
  it('coalesces multiple scheduleSave calls into one flush after debounce', () => {
    const ctx = setup();
    ctx.scheduler.scheduleSave();
    ctx.clock.advance(100);
    ctx.scheduler.scheduleSave();
    ctx.clock.advance(100);
    ctx.scheduler.scheduleSave();
    ctx.clock.advance(gameBalance.persistence.saveDebounceMs + 1);
    expect(ctx.flushes).toBe(1);
  });

  it('does not flush while phase is stepping; retries until idle', () => {
    const ctx = setup('stepping');
    ctx.scheduler.scheduleSave();
    ctx.clock.advance(gameBalance.persistence.saveDebounceMs + 1);
    expect(ctx.flushes).toBe(0);
    ctx.phaseSource.phase = 'idle';
    ctx.clock.advance(20);
    expect(ctx.flushes).toBe(1);
  });

  it('flushImmediate writes synchronously when idle', () => {
    const ctx = setup('idle');
    ctx.scheduler.scheduleSave();
    ctx.scheduler.flushImmediate();
    expect(ctx.flushes).toBe(1);
    // The scheduled debounce is canceled.
    ctx.clock.advance(gameBalance.persistence.saveDebounceMs + 100);
    expect(ctx.flushes).toBe(1);
  });

  it('flushImmediate does NOT flush when phase is stepping', () => {
    const ctx = setup('stepping');
    ctx.scheduler.scheduleSave();
    ctx.scheduler.flushImmediate();
    expect(ctx.flushes).toBe(0);
  });
});
