import { describe, expect, it } from 'vitest';

import { ObjectPool } from '../../src/game/ObjectPool';

interface Token {
  active: boolean;
  id: number;
}

function makePool(cap: number): ObjectPool<Token> {
  return new ObjectPool<Token>(cap, (i) => ({ active: false, id: i }));
}

describe('ObjectPool', () => {
  it('pre-allocates exactly capacity items', () => {
    const pool = makePool(5);
    expect(pool.capacity).toBe(5);
    expect(pool.activeCount).toBe(0);
    expect([...pool.all()]).toHaveLength(5);
  });

  it('rejects non-positive capacity', () => {
    expect(() => makePool(0)).toThrow();
  });

  it('acquire returns distinct active items until exhausted', () => {
    const pool = makePool(3);
    const a = pool.acquire();
    const b = pool.acquire();
    const c = pool.acquire();
    expect(a && b && c).toBeTruthy();
    expect(new Set([a, b, c]).size).toBe(3);
    expect(pool.acquire()).toBeUndefined();
    expect(pool.activeCount).toBe(3);
  });

  it('releaseAt frees the slot and is idempotent', () => {
    const pool = makePool(2);
    const a = pool.acquire()!;
    expect(pool.releaseAt(a.id)).toBe(true);
    expect(pool.releaseAt(a.id)).toBe(false);
    expect(pool.activeCount).toBe(0);
    const a2 = pool.acquire()!;
    expect(a2.id).toBe(a.id);
  });

  it('inUse iterates only active items', () => {
    const pool = makePool(4);
    pool.acquire();
    const skip = pool.acquire()!;
    pool.acquire();
    pool.releaseAt(skip.id);
    const ids = [...pool.inUse()].map((t) => t.id).sort();
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain(skip.id);
  });

  it('releaseAll resets to empty', () => {
    const pool = makePool(3);
    pool.acquire();
    pool.acquire();
    pool.releaseAll();
    expect(pool.activeCount).toBe(0);
    expect([...pool.inUse()]).toHaveLength(0);
  });
});
