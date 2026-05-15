/**
 * Pushy — Game Balance configuration.
 *
 * SINGLE SOURCE OF TRUTH for every tunable runtime value (Constitution Principle V,
 * spec FR-027). The shape mirrors the JSON Schema at
 *   specs/001-pushy-mvp/contracts/game-balance.schema.json
 *
 * The CI script `scripts/check-no-magic-numbers.mjs` forbids numeric literals in
 * `src/game/**` and `src/render/**`; everything must come from this object.
 *
 * Defaults are the initial tuning starting point from
 *   specs/001-pushy-mvp/research.md §R11
 */

export interface GameBalance {
  readonly economy: {
    readonly startingBank: number;
    readonly dropCostPerCoin: number;
    readonly winValuePerCoin: number;
    readonly continueTopUpCoins: number;
  };
  readonly spawning: {
    readonly coinsPerTap: number;
    readonly perSlotCooldownMs: number;
    readonly slotPositionsX: readonly [number, number, number];
    readonly slotSpawnJitter: number;
    readonly initialPileCount: number;
  };
  readonly pusher: {
    readonly strokePeriodMs: number;
    readonly strokeAmplitude: number;
    readonly basePositionZ: number;
  };
  readonly physics: {
    readonly gravity: readonly [number, number, number];
    readonly fixedTimestepHz: number;
    readonly coinMass: number;
    readonly coinFriction: number;
    readonly coinRestitution: number;
    readonly coinRadius: number;
    readonly coinThickness: number;
    readonly valuableMassMultipliers: readonly [number, number, number];
    readonly valuableFriction: number;
    readonly valuableRestitution: number;
  };
  readonly tray: {
    readonly width: number;
    readonly depth: number;
    readonly wallHeight: number;
    readonly winZoneDepth: number;
  };
  readonly valuables: {
    readonly initialCount: number;
    readonly placementSeed: number;
  };
  readonly persistence: {
    readonly saveDebounceMs: number;
  };
  readonly audio: {
    readonly clinkMaxPerSecond: number;
    readonly clinkBurst: number;
    readonly coinDropVolume: number;
  };
  readonly limits: {
    readonly maxActiveCoins: number;
    readonly maxActiveValuables: number;
  };
  readonly render: {
    readonly coinColor: number;
    readonly coinMetalness: number;
    readonly coinRoughness: number;
    readonly valuableColors: readonly [number, number, number];
    readonly pusherColor: number;
    readonly trayColor: number;
    readonly wallColor: number;
    readonly backgroundColor: number;
    readonly ambientIntensity: number;
    readonly directionalIntensity: number;
  };
}

export const gameBalance: GameBalance = Object.freeze({
  economy: Object.freeze({
    startingBank: 100,
    dropCostPerCoin: 1,
    winValuePerCoin: 1,
    continueTopUpCoins: 50,
  }),
  spawning: Object.freeze({
    coinsPerTap: 1,
    perSlotCooldownMs: 250,
    slotPositionsX: Object.freeze([-0.2, 0, 0.2]) as readonly [number, number, number],
    slotSpawnJitter: 0.01,
    initialPileCount: 325,
  }),
  pusher: Object.freeze({
    strokePeriodMs: 3429,
    strokeAmplitude: 0.1,
    basePositionZ: -0.325,
  }),
  physics: Object.freeze({
    gravity: Object.freeze([0, -9.81, 0]) as readonly [number, number, number],
    fixedTimestepHz: 60,
    coinMass: 0.008,
    coinFriction: 0.5,
    coinRestitution: 0.05,
    coinRadius: 0.018,
    coinThickness: 0.003,
    valuableMassMultipliers: Object.freeze([0.5, 1.0, 2.0]) as readonly [number, number, number],
    valuableFriction: 0.6,
    valuableRestitution: 0.15,
  }),
  tray: Object.freeze({
    width: 0.6,
    depth: 0.5,
    wallHeight: 0.05,
    winZoneDepth: 0.05,
  }),
  valuables: Object.freeze({
    initialCount: 6,
    placementSeed: 1,
  }),
  persistence: Object.freeze({
    saveDebounceMs: 500,
  }),
  audio: Object.freeze({
    clinkMaxPerSecond: 12,
    clinkBurst: 4,
    coinDropVolume: 0.8,
  }),
  limits: Object.freeze({
    maxActiveCoins: 750,
    maxActiveValuables: 16,
  }),
  render: Object.freeze({
    coinColor: 0xffd24a,
    coinMetalness: 0.9,
    coinRoughness: 0.25,
    valuableColors: Object.freeze([0xff5050, 0xffe14a, 0x4aa3ff]) as readonly [
      number,
      number,
      number,
    ],
    pusherColor: 0x555c66,
    trayColor: 0x2c3038,
    wallColor: 0x3a4049,
    backgroundColor: 0x0b0d10,
    ambientIntensity: 0.5,
    directionalIntensity: 0.9,
  }),
});
