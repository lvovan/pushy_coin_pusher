/**
 * Generic free-list object pool.
 *
 * Pre-allocates `capacity` instances at construction; never grows at runtime.
 * Coin and Valuable pools (research.md §R4) use this to avoid per-spawn
 * allocation that would spike frame time.
 */

export interface PoolItem {
  active: boolean;
}

export class ObjectPool<T extends PoolItem> {
  private readonly items: T[];
  private readonly free: number[] = [];
  private _activeCount = 0;

  constructor(capacity: number, factory: (index: number) => T) {
    if (capacity <= 0) throw new Error('ObjectPool: capacity must be > 0');
    this.items = new Array(capacity);
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
    return this._activeCount;
  }

  acquire(): T | undefined {
    const idx = this.free.pop();
    if (idx === undefined) return undefined;
    const item = this.items[idx]!;
    item.active = true;
    this._activeCount += 1;
    return item;
  }

  /**
   * Release by index (O(1)). Returns true if released; false if it was already free.
   */
  releaseAt(index: number): boolean {
    const item = this.items[index];
    if (!item || !item.active) return false;
    item.active = false;
    this.free.push(index);
    this._activeCount -= 1;
    return true;
  }

  *inUse(): Iterable<T> {
    for (const item of this.items) {
      if (item.active) yield item;
    }
  }

  *all(): Iterable<T> {
    for (const item of this.items) yield item;
  }

  get(index: number): T | undefined {
    return this.items[index];
  }

  releaseAll(): void {
    this.free.length = 0;
    this._activeCount = 0;
    for (let i = 0; i < this.items.length; i += 1) {
      this.items[i]!.active = false;
      this.free.push(i);
    }
  }
}
