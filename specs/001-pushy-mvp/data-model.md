# Phase 1 Data Model: Pushy — Coin Pusher MVP

**Date**: 2026-05-14
**Branch**: `001-pushy-mvp`

This is the runtime data model — the in-memory shapes used by the game while running. The serialized (LocalStorage) shape is defined separately in `contracts/save-state.schema.json`; the tunable config shape is defined in `contracts/game-balance.schema.json`.

All TypeScript types below are descriptive — the implementation is free to refine field names — but **field count, semantics, and relationships are normative**.

---

## 1. `GameState` (root)

The single source of truth for player-facing state. All mutations route through `GameState.mutate(...)` so a save can be scheduled centrally.

```ts
type GameMode = 'home' | 'playing' | 'gameOver';

interface GameState {
  mode: GameMode;
  coinBank: number;           // FR-011, FR-012, FR-013, FR-016
  valuablesCollected: number; // FR-014
  pusherPhase: number;        // seconds into the current stroke cycle (0..period)
  bodies: BodyTable;          // see §2
  slots: DropSlotState[];     // length 3, FR-005
  saveDirty: boolean;         // true if mutated since last successful save
}
```

**State transitions** (`mode`):

```
       Start
home  ─────────►  playing
  ▲                  │
  │       Play       │  bank=0 & no motion (FR-016)
  │       Again      ▼
  └──────────────  gameOver
                     │
                     │  Continue (FR-016a)
                     └──── (mode → playing, bank += continueTopUpCoins)
```

**Invariants**:

- `coinBank ≥ 0` at all times.
- `valuablesCollected ≥ 0`.
- `mode === 'gameOver' ⇒ coinBank === 0 && no body in bodies has nonzero speed`.
- `mode === 'home' ⇒ bodies is empty AND slots are all idle`.
- `bodies.coins.length ≤ maxActiveCoins` (Game Config).

---

## 2. `BodyTable`

Tracks every active physics body. Coin storage uses a Structure-of-Arrays layout to minimize per-frame allocation; valuables are few and stored as objects.

```ts
interface BodyTable {
  coins: CoinSoA;          // §2.1
  valuables: ValuableBody[]; // §2.2
}
```

### 2.1 `CoinSoA` — Coins (Structure-of-Arrays)

```ts
interface CoinSoA {
  count: number;                   // number of active coin slots
  rapierHandle: Uint32Array;       // length = maxActiveCoins
  instanceIndex: Uint32Array;      // length = maxActiveCoins; index into InstancedMesh
  active: Uint8Array;              // 1 = in play, 0 = pooled out
  positionX: Float32Array;
  positionY: Float32Array;
  positionZ: Float32Array;
  quatX: Float32Array;
  quatY: Float32Array;
  quatZ: Float32Array;
  quatW: Float32Array;
}
```

**Lifecycle**:

| Event | Effect |
|-------|--------|
| `spawnCoin(slot)` | Pool finds slot where `active[i]=0`; sets `active[i]=1`, places body, increments `count`, decrements bank by `dropCostPerCoin`. |
| Physics step | Rapier updates body transforms; SoA buffers are refilled from body table once per render frame for instancing. |
| Win zone enter | Coin's `active[i]=0`, body disabled and parked off-screen, instance hidden, bank += `winValuePerCoin`. |
| Side fall-off (y below threshold OR x outside tray width) | Coin's `active[i]=0`, body disabled. No bank change. |

### 2.2 `ValuableBody`

```ts
interface ValuableBody {
  rapierHandle: number;
  meshId: number;             // index into ValuableMeshes
  variantId: number;          // 0..2 (mass class from valuableMassMultipliers)
  active: boolean;
  position: [number, number, number];
  rotation: [number, number, number, number]; // quaternion
}
```

**Lifecycle**:

| Event | Effect |
|-------|--------|
| Start / fresh game | `valuableInitialCount` valuables created with `variantId` chosen round-robin; placed by `Tray.placeValuables(rng)`. |
| Resume | Valuables reconstructed from save state at their saved positions/rotations (velocity = 0; Q3). |
| Win zone enter | `valuablesCollected += 1`; body disabled and pooled out. |
| Side fall-off | Body disabled and pooled out; counter unchanged. |
| Game Over → Continue | Valuables remain in place untouched (FR-016a). |
| Game Over → Play Again | All valuables despawned; next `Start` reseeds the initial set. |

---

## 3. `DropSlotState`

```ts
interface DropSlotState {
  id: 0 | 1 | 2;          // FR-005: exactly 3 slots
  spawnPositionX: number; // from Game Config (slotPositionsX)
  spawnPositionY: number; // top of machine
  spawnPositionZ: number; // back rail
  nextReadyAtMs: number;  // Performance.now() value after which a tap is accepted
}
```

**Logic** (`tapSlot(id, now)` — called once on initial press and again every animation frame while the slot remains held by the UI layer):

```
if now < slots[id].nextReadyAtMs: return                  // ignored (FR-006 cooldown)
if gameState.coinBank < dropCostPerCoin: return           // FR-015
spawnCoin(id)
slots[id].nextReadyAtMs = now + perSlotCooldownMs         // Q4: per-slot
playSound('coinDrop')
```

**UI press state** (not part of `GameState`): the drop-slot UI tracks per-button `pressed: boolean` and a `requestAnimationFrame` handle. While `pressed === true`, the UI re-invokes `tapSlot(id, now)` each frame; the cooldown above caps the actual spawn rate to `1000 / perSlotCooldownMs` per slot.

---

## 4. `GameConfig` (frozen at boot)

Loaded once from `src/config/gameBalance.ts`; immutable at runtime. Full schema in `contracts/game-balance.schema.json`. Summary:

| Group | Fields |
|-------|--------|
| Economy | `startingBank`, `dropCostPerCoin`, `winValuePerCoin`, `continueTopUpCoins` |
| Spawning | `coinsPerTap`, `perSlotCooldownMs`, `slotPositionsX[3]`, `slotSpawnJitter`, `initialPileCount` |
| Pusher | `pusherStrokePeriodMs`, `pusherStrokeAmplitude`, `pusherBasePositionZ` |
| Physics | `gravity`, `coinMass`, `coinFriction`, `coinRestitution`, `coinRadius`, `coinThickness`, `valuableMassMultipliers[3]` |
| Tray | `trayWidth`, `trayDepth`, `wallHeight`, `winZoneDepth` |
| Valuables | `valuableInitialCount`, `valuablePlacementSeed` |
| Persistence | `saveDebounceMs` |
| Audio | `clinkMaxPerSecond`, `clinkBurst`, `coinDropVolume` (the AudioBus additionally enforces a hard cap of 10 concurrently-playing samples per FR-028) |
| Limits | `maxActiveCoins`, `maxActiveValuables` |

---

## 5. `SaveState` (serialized; written to LocalStorage)

Authoritative schema in `contracts/save-state.schema.json`. Mirrors the subset of runtime state needed to restore play.

```ts
interface SaveStateV1 {
  schemaVersion: 1;                       // R6, FR-026, Q5
  savedAt: number;                        // ms since epoch (for diagnostics; not used on load)
  coinBank: number;
  valuablesCollected: number;
  coins: Array<{
    px: number; py: number; pz: number;
    qx: number; qy: number; qz: number; qw: number;
  }>;
  valuables: Array<{
    variantId: number;
    px: number; py: number; pz: number;
    qx: number; qy: number; qz: number; qw: number;
  }>;
}
```

**Notes**:

- Velocities are intentionally absent (Q3). On load, all bodies are restored at rest and `pusherPhase` resets to `0`.
- Total payload at the body-count target: 200 coins × 7 floats + 6 valuables × 8 fields ≈ ~12 KB JSON.

**Load procedure** (`SaveStore.load()`):

```
raw = localStorage.getItem('pushy.save.v1')
if raw is null/empty: return null
try parsed = JSON.parse(raw); on failure: return null
if !isSaveStateV1(parsed): return null         // Q5: discard mismatch
return parsed
```

---

## 6. Pool Inventories

`ObjectPool<T>` is a generic free-list pool. Two instances exist:

| Pool | Capacity | Init time |
|------|---------:|-----------|
| Coin pool | `maxActiveCoins` (250) | Boot (pre-game) |
| Valuable pool | `maxActiveValuables` (16) | Boot (pre-game) |

Pools own the Rapier bodies/colliders and the renderable instance index / mesh reference; checkouts and returns are O(1) free-list operations. Pools never resize at runtime.

---

## 7. Event Flow Summary

```
Tap (drop slot)        ──► TouchInput ──► DropSlots.tapSlot
                                              │
                                              ▼
                                       Pool.checkoutCoin ──► PhysicsWorld.enableBody
                                              │                   │
                                              ▼                   ▼
                                       GameState.mutate ◄── (later) ContactEvent
                                              │
                          ┌───────────────────┴───────────────────┐
                          ▼                                       ▼
                  SaveScheduler.scheduleSave              UI: Hud refresh
                          │
                          ▼ (after debounceMs, between physics steps)
                  SaveStore.write
```

```
WinZone sensor.enter ──► classify body (coin | valuable)
                          │
                          ├── coin:     GameState.mutate(bank += winValue, removeCoin)
                          └── valuable: GameState.mutate(valuables += 1, removeValuable)

Side fall-off (y < trayY - 1 or |x| > trayWidth/2 + margin)
                       ──► GameState.mutate(removeBody) (no counter changes)
```

```
Each physics step:
  if mode === 'playing' and coinBank === 0 and no body has |velocity| > epsilon:
      GameState.mutate(mode = 'gameOver')
      UI: show GameOverOverlay (Play Again / Continue with N coins)
```

---

**Phase 1 data model complete**. Next: contracts.
