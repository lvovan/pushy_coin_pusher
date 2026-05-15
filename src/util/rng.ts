/**
 * Tiny seeded RNG (mulberry32). Deterministic given the same seed — used for
 * valuable placement so a save's "fresh start" can be reproducible during dev
 * and so unit tests can assert deterministic placement.
 */

export interface Rng {
  next(): number; // [0, 1)
  range(min: number, max: number): number; // [min, max)
  pick<T>(items: readonly T[]): T;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  if (s === 0) s = 0x6d2b79f5;

  function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    range(min: number, max: number): number {
      return min + next() * (max - min);
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('rng.pick: empty array');
      const idx = Math.floor(next() * items.length);
      return items[idx]!;
    },
  };
}
