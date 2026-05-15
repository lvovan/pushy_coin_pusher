/**
 * T027 — Validates `gameBalance` against the JSON Schema contract.
 *
 * Hand-rolled validator: enough to catch type/shape regressions without
 * pulling in a runtime schema dependency. The schema only declares the
 * *gameplay* groups; the `render` group is allowed as an additive section.
 */
import { describe, expect, it } from 'vitest';

import { gameBalance } from '../../src/config/gameBalance';
import schema from '../../specs/001-pushy-mvp/contracts/game-balance.schema.json';

type JsonSchema = {
  required?: string[];
  properties?: Record<string, JsonSchema>;
  type?: string | string[];
  items?: JsonSchema | JsonSchema[];
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
};

function typeOf(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function validate(value: unknown, sch: JsonSchema, path: string, errs: string[]): void {
  if (sch.type) {
    const types = Array.isArray(sch.type) ? sch.type : [sch.type];
    const actual = typeOf(value);
    const ok = types.includes(actual) || (types.includes('integer') && actual === 'number');
    if (!ok) errs.push(`${path}: expected ${types.join('|')}, got ${actual}`);
  }
  if (sch.type === 'object' && value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const k of sch.required ?? []) {
      if (!(k in obj)) errs.push(`${path}: missing required "${k}"`);
    }
    for (const [k, childSchema] of Object.entries(sch.properties ?? {})) {
      if (k in obj) validate(obj[k], childSchema, `${path}.${k}`, errs);
    }
  }
  if (sch.type === 'array' && Array.isArray(value)) {
    if (sch.minItems !== undefined && value.length < sch.minItems)
      errs.push(`${path}: minItems ${sch.minItems}, got ${value.length}`);
    if (sch.maxItems !== undefined && value.length > sch.maxItems)
      errs.push(`${path}: maxItems ${sch.maxItems}, got ${value.length}`);
    const items = sch.items;
    if (items && !Array.isArray(items)) {
      for (let i = 0; i < value.length; i += 1) {
        validate(value[i], items, `${path}[${i}]`, errs);
      }
    }
  }
  if (typeof value === 'number') {
    if (sch.minimum !== undefined && value < sch.minimum)
      errs.push(`${path}: ${value} < minimum ${sch.minimum}`);
    if (sch.maximum !== undefined && value > sch.maximum)
      errs.push(`${path}: ${value} > maximum ${sch.maximum}`);
  }
}

describe('gameBalance contract', () => {
  it('matches game-balance.schema.json', () => {
    const errs: string[] = [];
    validate(gameBalance, schema as JsonSchema, '$', errs);
    expect(errs).toEqual([]);
  });

  it('has the additive render section needed by the renderer', () => {
    expect(gameBalance.render).toBeDefined();
    expect(typeof gameBalance.render.backgroundColor).toBe('number');
    expect(gameBalance.render.valuableColors).toHaveLength(3);
  });

  it('starting bank is non-zero so US1 can drop at least one coin', () => {
    expect(gameBalance.economy.startingBank).toBeGreaterThan(0);
    expect(gameBalance.economy.dropCostPerCoin).toBeGreaterThan(0);
  });
});
