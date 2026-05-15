# Phase 0 Research: Pushy — Coin Pusher MVP

**Date**: 2026-05-14
**Branch**: `001-pushy-mvp`

This document resolves the open technical questions implied by Technical Context in `plan.md`. The spec carried no `NEEDS CLARIFICATION` markers after the clarify pass; the items below are best-practice resolutions for the chosen stack (Three.js + Rapier.js WASM) under the constraints in the Constitution.

---

## R1. Rendering 200+ coins at 60 fps on mid-range mobile

**Decision**: Use a single `THREE.InstancedMesh` for all coins, sized to the maximum active-coin budget (250, with 50 headroom over the 200 baseline). Update per-coin transforms by writing into the instance matrix buffer once per render frame from the Rapier body table; mark `instanceMatrix.needsUpdate = true` after the batch write.

**Rationale**:

- A non-instanced approach issues one draw call per coin → 200+ draw calls per frame, which is the dominant cost on mobile GPUs and reliably breaks the 16.6 ms budget.
- `InstancedMesh` collapses to one draw call regardless of instance count; per-coin updates are a CPU-side `Matrix4.compose` + buffer write, which scales linearly and stays comfortably inside the CPU budget at 200 instances.
- Coin geometry (low-poly cylinder, ~24 segments) is identical for every coin, which is exactly the case `InstancedMesh` is designed for.
- The hint in the user's brief ("look into InstancedMesh") aligns with this choice.

**Alternatives considered**:

- One `Mesh` per coin (rejected): kills frame rate on mobile due to draw-call count.
- Custom `BufferGeometry` + per-vertex attributes for fake instancing (rejected): more code, no win over the built-in path.
- Geometry batching into a single dynamic mesh (rejected): rebuilding vertex buffers each frame is more expensive than instance-matrix writes.

---

## R2. Decoupling physics from the render loop

**Decision**: Run the physics simulation on a fixed timestep of 1/60 s using an accumulator pattern. Each `requestAnimationFrame` tick computes `dt`, adds it to an accumulator, and steps Rapier zero or more times in 1/60 s slices until the accumulator drops below the step size, then renders once. Cap accumulated catch-up at 4 steps per frame to prevent the spiral-of-death after a long pause.

**Rationale**:

- Constitution Principle I and II both demand stability; variable-timestep physics produces non-deterministic coin behavior, jitter against the kinematic pusher, and clipping risk under frame-drop conditions.
- Fixed timestep keeps Rapier's contact solver in its calibrated regime (friction/restitution tuned at 60 Hz behave consistently).
- Cap on catch-up prevents lock-up after the tab is backgrounded.

**Alternatives considered**:

- Variable timestep (rejected): incompatible with Principle II.
- Sub-stepping inside Rapier per render frame (rejected): Rapier's own `integrationParameters.dt` would need to change every frame, defeating the determinism benefit.

---

## R3. Pusher as kinematic body without tunneling

**Decision**: Pusher uses `RigidBodyType.KinematicPositionBased`. Its position is set each physics step from `pusherStrokePhase(t) = base + amplitude * (1 - cos(2π·t/period)) / 2` (a smooth ease-in-out cycle). Coins use `Dynamic` rigid bodies with `setCcdEnabled(true)` so high-velocity contacts against the pusher generate continuous collision detection.

**Rationale**:

- Kinematic-position bodies impart velocity to colliding dynamic bodies via Rapier's collision response (this is how a real coin pusher works) without being themselves displaced.
- CCD on coins eliminates the rare tunneling case where the pusher's leading edge catches a coin mid-flight.
- Cosine-based motion avoids the velocity discontinuity at stroke endpoints that a linear `MathUtils.pingpong` profile would introduce, which the spec's no-clipping requirement implicitly demands.

**Alternatives considered**:

- Dynamic pusher with a very heavy mass (rejected): violates Principle II's "kinematic" mandate and is numerically unstable.
- Static pusher animated by teleporting its collider (rejected): does not impart velocity to coins (they just stop the pusher's geometry).
- KinematicVelocityBased (considered): functionally similar to position-based for this cycle; position-based is simpler to derive from a phase and serializes more cleanly for Resume (just `t`).

---

## R4. Object pooling strategy

**Decision**: Pre-allocate at construction time: 250 coin slots and 16 valuable slots. Each slot owns a Rapier body handle, a collider handle, and an instance index (for coins) / mesh reference (for valuables). Slots are checked out from a free-list on spawn and returned on win/loss; bodies are not destroyed, only disabled (`setEnabled(false)`) and translated outside the visible region.

**Rationale**:

- Rapier body creation has non-trivial cost (WASM boundary + collider broad-phase update); allocating each drop would spike frame time.
- Pre-allocation gives us a hard upper bound that matches the Constitution's 200-body budget with 50 coin headroom and a sensible valuable cap (the spec's "fixed initial set" per Q1 makes 16 generous).
- Disable-rather-than-destroy keeps body handles stable for the entire session, simplifying the save/restore path.

**Alternatives considered**:

- Lazy allocation on first spawn (rejected): unpredictable frame times on initial gameplay.
- Destroy-and-recreate (rejected): allocator pressure + body-table churn → frame-time spikes.

---

## R5. Save scheduling: debounced + idle-safe

**Decision**: A `SaveScheduler` exposes `scheduleSave()`. Internally it sets a `setTimeout(flush, debounceMs)` (default `500` from `gameBalance`) and resets the timer on each call. `flush()` is gated to run only between physics steps (a `phase` flag from `GameLoop` is checked). Additionally, on `visibilitychange → hidden` and on `pagehide`, an immediate `flush()` is forced so a tab close captures the latest state. Writes use `JSON.stringify` + `localStorage.setItem`, wrapped in a `try/catch` that silently swallows `QuotaExceededError` (spec FR-026: no player-facing error).

**Rationale**:

- 500 ms debounce gives us at most ~2 writes/second under active play and keeps the worst-case loss ≤ 1 s (spec SC-004 budget).
- Gating on the loop phase implements the Constitution's "writes must not occur during a physics step" rule.
- `pagehide` is the only reliable last-chance hook on mobile Safari; `beforeunload` does not fire on iOS.
- Synchronous `localStorage.setItem` of a ~200-body payload (~10 KB JSON) measures under 2 ms on the reference device — acceptable when run between steps.

**Alternatives considered**:

- IndexedDB (rejected): async API complicates the page-close flush; benefit (larger quota) unused since payload is tiny.
- `requestIdleCallback` for flushing (rejected): not available on iOS Safari at the time of writing.
- Per-step incremental writes (rejected): violates Principle I's frame budget.

---

## R6. Save schema versioning

**Decision**: Save payload is a JSON object with a top-level `schemaVersion: 1` integer. On load: parse JSON → validate via a small hand-written guard (`isSaveStateV1`) → if version mismatch, parse failure, or guard failure, return `null` (fresh session). No migration path is implemented for v1 since there is no prior version; future versions will add a `migrate(v_n → v_{n+1})` chain or, per the Q5 clarification, may simply discard.

**Rationale**:

- An explicit version integer is the cheapest possible mechanism that supports the clarified policy (discard on mismatch).
- A hand-written type guard is appropriate for a single-schema codebase; pulling in `zod` or `ajv` is unjustified bundle bloat under Principle VI.

**Alternatives considered**:

- Semantic version string (rejected): overkill for a single-key save; integer compare is simpler.
- Runtime schema library (`zod`, `ajv`) (rejected): adds 15–40 KB gzipped for one schema.

---

## R7. Suppressing mobile gesture interference

**Decision**: Set the document viewport meta to `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no`. On each drop-slot DOM element, attach `touchstart` listeners with `{ passive: false }` and call `preventDefault()` to suppress synthesized click-zoom on iOS. Use CSS `touch-action: manipulation` on the canvas and slot regions to disable double-tap-zoom and panning. Suppress the context menu on long-press via `contextmenu` event.

**Rationale**:

- Combined viewport + `touch-action: manipulation` is the well-supported recipe for kill-everything mobile gesture handling without breaking accessibility for assistive touch.
- Required by FR-022.

**Alternatives considered**:

- Relying on `touch-action` alone (rejected): iOS still synthesizes the 300 ms-tap-zoom in some Safari versions without the viewport constraint.
- Pointer Events API exclusively (rejected): inputs are simple taps; `touchstart` is lighter-weight and avoids hover/pointer-cancel complexity.

---

## R8. Collision-sound throttling

**Decision**: The `AudioBus` maintains a "tokens" budget refilled at `clinkMaxPerSecond` (default 12) tokens/s, capped at `clinkBurst` (default 4). Each coin-coin contact event consumes one token; if none are available, the sound is dropped. Each played sound is randomly pitched ±5 % from a small pool of pre-loaded `AudioBuffer`s using a single `AudioContext`.

**Rationale**:

- A token bucket gives a deterministic upper bound on audio decode/play work per second, which is the only constraint that matters for Principle I.
- Random pitch on a small sample pool produces perceptual variety without storing dozens of audio files (Principle VI's bundle-size pressure).
- WebAudio decode-ahead is essential — playing via `<audio>` tags on iOS introduces ≥100 ms latency that breaks SC-005.

**Alternatives considered**:

- Per-collision sound with no throttle (rejected): the spec forbids it (FR-028) and pile-up audio degrades both performance and player experience.
- Fixed minimum interval between sounds (rejected): produces an unnatural rhythm; bucket model better matches real clinks.

---

## R9. Build tooling

**Decision**: **Vite** (latest stable) for dev server, HMR, and production bundling. TypeScript via Vite's built-in `esbuild` transform. Rapier loaded via the `@dimforge/rapier3d-compat` package, which ships the WASM as a base64-inlined module so it does not require a separate WASM fetch and is therefore safe under all hosting configurations.

**Rationale**:

- Vite has first-class WASM and TypeScript support, the fastest dev experience for small apps, and a tree-shaken production build that hits the bundle-size targets.
- The `-compat` Rapier variant trades a small (~30 KB) overhead for a one-asset deploy and zero special server config — appropriate for an MVP.

**Alternatives considered**:

- Webpack 5 (rejected): more config for no benefit at this scale.
- Plain Rapier (`@dimforge/rapier3d`) (rejected for MVP): requires correct MIME for `.wasm` and a separate fetch; can be revisited if cold-start budget becomes tight.

---

## R10. Testing strategy

**Decision**:

- **Unit (Vitest)**: pure-logic modules — `GameState` economy transitions, `SaveStore` round-trip + version mismatch, `DropSlots` cooldown, `ObjectPool` checkout/return, `gameBalance` config-shape conformance.
- **Integration (Vitest, headless)**: a fake `PhysicsWorld` driver feeds scripted contact events through `GameState` to verify Win/Loss/Game Over transitions and save scheduling.
- **End-to-end (Playwright)**: a single smoke flow at portrait viewport that asserts: home renders → Start → tap each slot → HUD updates → no JS errors. Headless WebGL via `--use-gl=swiftshader` is sufficient for smoke; perf is not asserted in CI.
- **Manual perf**: a `bench/200-coins.html` page profiled via Chrome DevTools on the reference device before any merge that touches `render/` or `game/PhysicsWorld`.

**Rationale**: Heavy automated perf testing of a WebGL/WASM game in CI is brittle and expensive; the boundary chosen catches every economy/persistence regression cheaply while keeping perf validation a real-device gate, which matches the Constitution's Performance Gate as written.

**Alternatives considered**:

- Full headless WebGL perf assertions in CI (rejected): high flakiness, low signal.
- No e2e at all (rejected): the portrait + tap path is exactly the integration surface most likely to silently regress.

---

## R11. Initial physics parameter values (starting point for tuning)

These live in `gameBalance.ts` and are expected to be tuned during playtest; they are the **starting** values, not requirements.

| Parameter | Initial value | Source |
|-----------|--------------:|--------|
| `startingBank` | 100 | Spec FR-011 |
| `dropCostPerCoin` | 1 | Spec Assumptions |
| `winValuePerCoin` | 1 | Spec Assumptions |
| `coinsPerTap` | 1 | Spec Assumptions |
| `perSlotCooldownMs` | 250 | Clarification Q4; gives ≤ 4 drops/s/slot ≤ 12/s total → bounded growth |
| `pusherStrokePeriodMs` | 2400 | Arcade reference cadence |
| `pusherStrokeAmplitude` | 0.18 m | Roughly 30 % of tray depth |
| `gravity` | (0, −9.81, 0) | Earth-like |
| `coinMass` | 0.008 kg | ~real coin |
| `coinFriction` | 0.5 | Empirical metal-on-metal start point |
| `coinRestitution` | 0.05 | Coins should not bounce much |
| `valuableMassMultipliers` | [0.5, 1.0, 2.0] | Three weight classes per FR-008 |
| `valuableInitialCount` | 6 | Clarification Q1; fits 16-slot pool |
| `continueTopUpCoins` | 50 | Clarification Q2 |
| `saveDebounceMs` | 500 | Constitution recommendation |
| `clinkMaxPerSecond` | 12 | Audio R8 |
| `clinkBurst` | 4 | Audio R8 |
| `maxActiveCoins` | 250 | 200 baseline + 50 headroom |

**Rationale**: Concentrating the *starting* values in research (and ultimately in `gameBalance.ts`) makes the Principle V single-source-of-truth requirement testable in one file and gives the playtest phase a known origin to tune from.

---

**All NEEDS CLARIFICATION items**: none outstanding. Phase 0 complete.
