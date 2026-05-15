import { describe, expect, it } from 'vitest';

import { SAVE_KEY, type SaveStateV1 } from '../../src/persistence/SaveState';
import { SaveStore, type StorageAdapter } from '../../src/persistence/SaveStore';

class MemoryStorage implements StorageAdapter {
  private map = new Map<string, string>();
  fail = false;
  getItem(key: string): string | null {
    if (this.fail) throw new Error('storage disabled');
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    if (this.fail) throw new Error('quota exceeded');
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  rawSet(key: string, value: string): void {
    this.map.set(key, value);
  }
}

function sample(): SaveStateV1 {
  return {
    schemaVersion: 1,
    savedAt: 12345,
    coinBank: 42,
    valuablesCollected: 3,
    coins: [{ px: 0.1, py: 0.2, pz: 0.3, qx: 0, qy: 0, qz: 0, qw: 1 }],
    valuables: [
      { variantId: 1, px: -0.1, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1 },
    ],
  };
}

describe('SaveStore', () => {
  it('round-trips a SaveStateV1', () => {
    const storage = new MemoryStorage();
    const store = new SaveStore(storage);
    const original = sample();
    expect(store.save(original)).toBe(true);
    const loaded = store.load();
    expect(loaded).toEqual(original);
  });

  it('returns null for missing key', () => {
    const store = new SaveStore(new MemoryStorage());
    expect(store.load()).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    const storage = new MemoryStorage();
    storage.rawSet(SAVE_KEY, '{not valid json');
    expect(new SaveStore(storage).load()).toBeNull();
  });

  it('returns null when schemaVersion is missing', () => {
    const storage = new MemoryStorage();
    const { schemaVersion: _, ...rest } = sample();
    storage.rawSet(SAVE_KEY, JSON.stringify(rest));
    expect(new SaveStore(storage).load()).toBeNull();
  });

  it('returns null when schemaVersion does not match', () => {
    const storage = new MemoryStorage();
    storage.rawSet(SAVE_KEY, JSON.stringify({ ...sample(), schemaVersion: 2 }));
    expect(new SaveStore(storage).load()).toBeNull();
  });

  it('returns null when shape is wrong', () => {
    const storage = new MemoryStorage();
    storage.rawSet(SAVE_KEY, JSON.stringify({ ...sample(), coins: 'nope' }));
    expect(new SaveStore(storage).load()).toBeNull();
  });

  it('swallows save errors (FR-026 quota / private mode)', () => {
    const storage = new MemoryStorage();
    storage.fail = true;
    const store = new SaveStore(storage);
    expect(() => store.save(sample())).not.toThrow();
    expect(store.save(sample())).toBe(false);
  });

  it('swallows load errors', () => {
    const storage = new MemoryStorage();
    storage.fail = true;
    expect(new SaveStore(storage).load()).toBeNull();
  });
});
