/**
 * AudioBus — single shared `AudioContext`, preloads coin-drop and clink samples,
 * applies a token-bucket throttle to clink playback (research §R8).
 *
 * FR-028: audio is optional and must never block gameplay; if asset fetch fails
 * or the context cannot start, calls silently no-op.
 */
import { gameBalance } from '../config/gameBalance';

const PITCH_VARIANCE = 0.05;
const PITCH_BASE = 1;
const SECONDS_PER_MS = 0.001;
const MS_PER_SECOND = 1000;
const TWO = 2;
const MAX_CONCURRENT_SOURCES = 10;

export interface AudioBusOptions {
  readonly coinDropUrl?: string;
  readonly clinkUrl?: string;
}

export class AudioBus {
  private ctx: AudioContext | undefined;
  private coinDropBuffer: AudioBuffer | undefined;
  private clinkBuffer: AudioBuffer | undefined;
  private gain: GainNode | undefined;
  private muted = false;

  private bucket: number;
  private lastRefillMs: number;
  private readonly maxPerSecond: number;
  private readonly burst: number;
  private activeSources = 0;

  constructor(private readonly options: AudioBusOptions = {}) {
    this.maxPerSecond = gameBalance.audio.clinkMaxPerSecond;
    this.burst = gameBalance.audio.clinkBurst;
    this.bucket = this.burst;
    this.lastRefillMs = 0;
  }

  async init(): Promise<void> {
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.muted ? 0 : gameBalance.audio.coinDropVolume;
      this.gain.connect(this.ctx.destination);
      const coinUrl = this.options.coinDropUrl ?? '/audio/coin-drop.ogg';
      const clinkUrl = this.options.clinkUrl ?? '/audio/clink.ogg';
      [this.coinDropBuffer, this.clinkBuffer] = await Promise.all([
        this.tryLoad(coinUrl),
        this.tryLoad(clinkUrl),
      ]);
    } catch {
      // Audio is best-effort — never block gameplay.
    }
  }

  /** Resume the context after a user gesture (required by some browsers). */
  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  /** Returns the current mute state. */
  get isMuted(): boolean {
    return this.muted;
  }

  /** Mute or unmute the master output. Persists across calls; takes effect
   * immediately on the master GainNode. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.gain) {
      this.gain.gain.value = muted ? 0 : gameBalance.audio.coinDropVolume;
    }
  }

  playCoinDrop(): void {
    // User-action sound — always play, bypassing the concurrency cap so a
    // burst of physics clinks can never silently swallow the drop tap response.
    this.playBuffer(this.coinDropBuffer, PITCH_BASE, PITCH_BASE, true);
  }

  /** Throttled via token bucket (Phase 0 R8). `volume` scales this call only (0..1). */
  playClink(nowMs: number = performance.now(), volume: number = PITCH_BASE): void {
    if (!this.refill(nowMs)) return;
    const variance = (Math.random() * TWO - 1) * PITCH_VARIANCE;
    this.playBuffer(this.clinkBuffer, PITCH_BASE + variance, volume);
  }

  private refill(nowMs: number): boolean {
    if (this.lastRefillMs === 0) this.lastRefillMs = nowMs;
    const dt = (nowMs - this.lastRefillMs) * SECONDS_PER_MS;
    this.bucket = Math.min(this.burst, this.bucket + dt * this.maxPerSecond);
    this.lastRefillMs = nowMs;
    if (this.bucket < PITCH_BASE) return false;
    this.bucket -= PITCH_BASE;
    return true;
  }

  private async tryLoad(url: string): Promise<AudioBuffer | undefined> {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return undefined;
      const arr = await resp.arrayBuffer();
      if (!this.ctx) return undefined;
      return await this.ctx.decodeAudioData(arr);
    } catch {
      return undefined;
    }
  }

  private playBuffer(
    buf: AudioBuffer | undefined,
    playbackRate: number,
    volume: number = PITCH_BASE,
    bypassCap: boolean = false,
  ): void {
    if (!this.ctx || !this.gain || !buf) return;
    // Hard cap on overlapping sources so a burst of physics contacts at startup
    // cannot queue minutes of audio. Extras are dropped silently. `bypassCap`
    // is set for user-action sounds (slot-tap drop) so they always play.
    if (!bypassCap && this.activeSources >= MAX_CONCURRENT_SOURCES) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = playbackRate;
    let tail: AudioNode = src;
    if (volume !== PITCH_BASE) {
      const perCallGain = this.ctx.createGain();
      perCallGain.gain.value = volume;
      src.connect(perCallGain);
      tail = perCallGain;
    }
    tail.connect(this.gain);
    this.activeSources += 1;
    src.onended = () => {
      this.activeSources = Math.max(0, this.activeSources - 1);
    };
    src.start(this.ctx.currentTime);
  }
}

/** Convenience for tests / non-DOM contexts. */
export const MS_PER_SECOND_EXPORT = MS_PER_SECOND;
