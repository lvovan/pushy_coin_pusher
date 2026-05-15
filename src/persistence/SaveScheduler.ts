/**
 * SaveScheduler — debounced flush gated on PhysicsWorld.phase === 'idle'.
 *
 * Multiple `scheduleSave()` calls within `saveDebounceMs` coalesce into one
 * flush. `flushImmediate()` writes synchronously and runs on `pagehide` /
 * `visibilitychange === 'hidden'` to capture last-moment state (research §R5).
 *
 * Injecting the timer/now functions keeps the unit test pure.
 */
import { gameBalance } from '../config/gameBalance';

export interface PhaseSource {
  readonly phase: 'idle' | 'stepping';
}

export interface SchedulerDeps {
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  attachLifecycleListeners?: boolean;
}

export class SaveScheduler {
  private timer: unknown = undefined;
  private readonly nowFn: () => number;
  private readonly setT: (fn: () => void, ms: number) => unknown;
  private readonly clearT: (handle: unknown) => void;
  private static readonly PHASE_RETRY_MS = 16;

  constructor(
    private readonly phaseSource: PhaseSource,
    private readonly flush: () => void,
    deps: SchedulerDeps = {},
  ) {
    this.nowFn = deps.now ?? (() => performance.now());
    this.setT = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearT = deps.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    if (deps.attachLifecycleListeners !== false && typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.flushImmediate());
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.flushImmediate();
      });
    }
  }

  scheduleSave(): void {
    if (this.timer !== undefined) this.clearT(this.timer);
    this.timer = this.setT(
      () => this.attemptFlush(),
      gameBalance.persistence.saveDebounceMs,
    );
  }

  private attemptFlush(): void {
    this.timer = undefined;
    if (this.phaseSource.phase !== 'idle') {
      this.timer = this.setT(() => this.attemptFlush(), SaveScheduler.PHASE_RETRY_MS);
      return;
    }
    this.flush();
  }

  /** Run a flush synchronously regardless of debounce, if phase is idle. */
  flushImmediate(): void {
    if (this.timer !== undefined) {
      this.clearT(this.timer);
      this.timer = undefined;
    }
    if (this.phaseSource.phase === 'idle') this.flush();
  }
}
