/**
 * Generic free-list object pool.
 *
 * Pre-allocates `capacity` instances at construction; never grows at runtime.
 * Coin and Valuable pools (research.md §R4) use this to avoid per-spawn
 * allocation that would spike frame time.
 *
 * Maintains a dense `activeIndices` array (swap-pop on release) so hot-path
 * iterations over only the active subset are O(activeCount) without skipping
 * inactive items. Also exposes per-frame `justAcquired` / `released` queues so
 * renderers can seed interpolation state on spawn and zero out instance
 * matrices on release without iterating the full capacity.
 */

const NOT_IN_ACTIVE = -1;

export interface PoolItem {
  active: boolean;
}

export class ObjectPool<T extends PoolItem> {
  private readonly items: T[];
  private readonly free: number[] = [];
  private readonly _activeIndices: number[] = [];
  private readonly _positionInActive: Int32Array;
  private readonly _justAcquired: number[] = [];
  private readonly _released: number[] = [];

  constructor(capacity: number, factory: (index: number) => T) {
    if (capacity <= 0) throw new Error('ObjectPool: capacity must be > 0');
    this.items = new Array(capacity);
    this._positionInActive = new Int32Array(capacity).fill(NOT_IN_ACTIVE);
    for (let i = 0; i < capacity; i += 1) {
      const item = factory(i);
      item.active = false;
      this.items[i] = item;
      this.free.push(i);
    }
  }

  get capacity(): number {
    return this.items.length;
  }

  get activeCount(): number {
    return this._activeIndices.length;
  }

  /** Dense, read-only view of currently-active slot indices (no allocations). */
  get activeIndices(): readonly number[] {
    return this._activeIndices;
  }

  acquire(): T | undefined {
    const idx = this.free.pop();
    if (idx === undefined) return undefined;
    const item = this.items[idx]!;
    item.active = true;
    this._positionInActive[idx] = this._activeIndices.length;
    this._activeIndices.push(idx);
    this._justAcquired.push(idx);
    return item;
  }

  /**
   * Release by index (O(1)). Returns true if released; false if it was already free.
   */
  releaseAt(index: number): boolean {
    const item = this.items[index];
    if (!item || !item.active) return false;
    item.active = false;
    const pos = this._positionInActive[index]!;
    const lastIdx = this._activeIndices.pop()!;
    if (lastIdx !== index) {
      this._activeIndices[pos] = lastIdx;
      this._positionInActive[lastIdx] = pos;
    }
    this._positionInActive[index] = NOT_IN_ACTIVE;
    this.free.push(index);
    this._released.push(index);
    return true;
  }

  *inUse(): Iterable<T> {
    for (let i = 0; i < this._activeIndices.length; i += 1) {
      yield this.items[this._activeIndices[i]!]!;
    }
  }

  *all(): Iterable<T> {
    for (const item of this.items) yield item;
  }

  get(index: number): T | undefined {
    return this.items[index];
  }

  /** Read pending acquisitions since the last `clearJustAcquired()`. */
  get justAcquired(): readonly number[] {
    return this._justAcquired;
  }

  clearJustAcquired(): void {
    this._justAcquired.length = 0;
  }

  /** Read pending releases since the last `clearReleased()`. */
  get released(): readonly number[] {
    return this._released;
  }

  clearReleased(): void {
    this._released.length = 0;
  }

  releaseAll(): void {
    this.free.length = 0;
    for (let i = 0; i < this._activeIndices.length; i += 1) {
      this._released.push(this._activeIndices[i]!);
    }
    this._activeIndices.length = 0;
    for (let i = 0; i < this.items.length; i += 1) {
      this.items[i]!.active = false;
      this._positionInActive[i] = NOT_IN_ACTIVE;
      this.free.push(i);
    }
  }
}
