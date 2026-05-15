/**
 * SaveStore — synchronous LocalStorage wrapper.
 *
 * `save` swallows quota / unavailable errors so the game keeps playing in
 * private-browsing mode (FR-026, data-model.md §5).
 * `load` returns null for any of:
 *   - missing key
 *   - non-JSON payload
 *   - missing or non-matching schemaVersion
 *   - shape failing isSaveStateV1
 * Clarification Q5: silent fallback to fresh start; no error UI.
 */
import { SAVE_KEY, type SaveStateV1, isSaveStateV1 } from './SaveState';

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class SaveStore {
  constructor(private readonly storage: StorageAdapter = globalThis.localStorage) {}

  save(state: SaveStateV1): boolean {
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  load(): SaveStateV1 | null {
    let raw: string | null;
    try {
      raw = this.storage.getItem(SAVE_KEY);
    } catch {
      return null;
    }
    if (raw === null || raw === undefined) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    return isSaveStateV1(parsed) ? parsed : null;
  }

  clear(): void {
    try {
      this.storage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  }
}
