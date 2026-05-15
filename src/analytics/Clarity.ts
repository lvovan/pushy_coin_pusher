/**
 * Microsoft Clarity — lightweight typed wrapper around the official
 * `clarity.ms` tag loader.
 *
 * Usage:
 *   const clarity = new Clarity();
 *   clarity.init();                              // reads VITE_CLARITY_PROJECT_ID
 *   clarity.event('session_start');              // custom event
 *   clarity.set('games_played', '7');            // custom tag (string value)
 *   clarity.upgrade('game_won');                 // prioritise this session
 *
 * Configuration:
 *   Set `VITE_CLARITY_PROJECT_ID` in a `.env` file (or environment) to enable
 *   tracking. When the variable is missing/empty the wrapper becomes a no-op
 *   so local development and tests don't ship telemetry.
 *
 * Privacy / safety:
 *   - All identifiers stay anonymous (no PII is collected by this module).
 *   - Cumulative counters (games_played, valuables_won_total) are stored in
 *     localStorage under the `pushy.analytics.*` namespace.
 *   - The wrapper is resilient: any failure to load the script, set a tag, or
 *     fire an event is swallowed and logged via `console.debug` only.
 */

// The Clarity script exposes a global `clarity()` queue function. We keep the
// surface area narrow and `unknown[]`-typed to match the upstream API.
type ClarityCommand =
  | ['event', string]
  | ['set', string, string | string[]]
  | ['identify', string, string?, string?, string?]
  | ['consent']
  | ['upgrade', string];

type ClarityFn = ((...args: ClarityCommand[number][]) => void) & {
  q?: unknown[];
};

declare global {
  interface Window {
    clarity?: ClarityFn;
  }
}

const STORAGE_PREFIX = 'pushy.analytics.';

function readCounter(key: string): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeCounter(key: string, value: number): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, String(value));
  } catch {
    /* localStorage may be unavailable (private mode, etc.) */
  }
}

export class Clarity {
  private enabled = false;
  private projectId: string | undefined;

  /** Inject the official Clarity loader. Safe to call multiple times. */
  init(projectId?: string): void {
    const id = projectId ?? (import.meta.env.VITE_CLARITY_PROJECT_ID as string | undefined);
    if (!id) {
      // Not configured — wrapper stays a no-op. Log once for dev visibility.
      console.debug('[clarity] disabled (VITE_CLARITY_PROJECT_ID not set)');
      return;
    }
    if (this.enabled) return;
    this.enabled = true;
    this.projectId = id;

    try {
      // Standard Clarity snippet, ported to TS. Creates the queue function
      // and async-loads the tag script.
      const w = window as Window & { clarity?: ClarityFn };
      const queue: ClarityFn = (w.clarity ?? (((...args: unknown[]) => {
        (queue.q = queue.q ?? []).push(args);
      }) as ClarityFn));
      queue.q = queue.q ?? [];
      w.clarity = queue;

      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.clarity.ms/tag/${encodeURIComponent(id)}`;
      const first = document.getElementsByTagName('script')[0];
      first?.parentNode?.insertBefore(script, first);
    } catch (err) {
      console.debug('[clarity] init failed', err);
      this.enabled = false;
    }
  }

  /** Fire a Clarity custom event. */
  event(name: string): void {
    if (!this.enabled) return;
    try {
      window.clarity?.('event', name);
    } catch (err) {
      console.debug('[clarity] event failed', name, err);
    }
  }

  /** Attach a custom tag (filterable dimension) to the session. */
  set(key: string, value: string | number | boolean): void {
    if (!this.enabled) return;
    try {
      window.clarity?.('set', key, String(value));
    } catch (err) {
      console.debug('[clarity] set failed', key, err);
    }
  }

  /**
   * Mark the current session as high-priority for recording. Use sparingly —
   * Clarity only uploads a capped number of "upgraded" sessions per day.
   */
  upgrade(reason: string): void {
    if (!this.enabled) return;
    try {
      window.clarity?.('upgrade', reason);
    } catch (err) {
      console.debug('[clarity] upgrade failed', reason, err);
    }
  }

  /** Increment a persistent counter and mirror its new value as a tag. */
  incrementTag(key: string, by = 1): number {
    const next = readCounter(key) + by;
    writeCounter(key, next);
    this.set(key, next);
    return next;
  }

  /** Read a persistent counter (no Clarity call). */
  getCounter(key: string): number {
    return readCounter(key);
  }

  /** Push every persistent counter as a tag (call once after init). */
  syncCountersToTags(keys: readonly string[]): void {
    for (const k of keys) this.set(k, readCounter(k));
  }
}
