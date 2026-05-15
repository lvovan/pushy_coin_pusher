/**
 * SaveStateV1 — LocalStorage payload shape.
 *
 * Mirrors `contracts/save-state.schema.json`. Velocities intentionally NOT
 * persisted (Clarification Q3).
 */

export const SAVE_KEY = 'pushy.save.v1';
export const SAVE_SCHEMA_VERSION = 1;

export interface SavedBody {
  px: number;
  py: number;
  pz: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

export interface SavedValuable extends SavedBody {
  variantId: number;
}

export interface SaveStateV1 {
  schemaVersion: 1;
  savedAt: number;
  coinBank: number;
  valuablesCollected: number;
  coins: SavedBody[];
  valuables: SavedValuable[];
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function isSavedBody(x: unknown): x is SavedBody {
  if (!x || typeof x !== 'object') return false;
  const b = x as Record<string, unknown>;
  return (
    isFiniteNumber(b.px) &&
    isFiniteNumber(b.py) &&
    isFiniteNumber(b.pz) &&
    isFiniteNumber(b.qx) &&
    isFiniteNumber(b.qy) &&
    isFiniteNumber(b.qz) &&
    isFiniteNumber(b.qw)
  );
}

export function isSaveStateV1(x: unknown): x is SaveStateV1 {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  if (s.schemaVersion !== SAVE_SCHEMA_VERSION) return false;
  if (!isFiniteNumber(s.savedAt) || s.savedAt < 0) return false;
  if (!Number.isInteger(s.coinBank) || (s.coinBank as number) < 0) return false;
  if (!Number.isInteger(s.valuablesCollected) || (s.valuablesCollected as number) < 0) return false;
  if (!Array.isArray(s.coins) || !s.coins.every(isSavedBody)) return false;
  if (!Array.isArray(s.valuables)) return false;
  for (const v of s.valuables as unknown[]) {
    if (!isSavedBody(v)) return false;
    const variantId = (v as unknown as Record<string, unknown>).variantId;
    if (!Number.isInteger(variantId)) return false;
    const n = variantId as number;
    if (n < 0 || n > 2) return false;
  }
  return true;
}
