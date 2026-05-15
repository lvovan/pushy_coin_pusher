---
description: "Implementation tasks for Pushy MVP (feature 001-pushy-mvp)"
---

# Tasks: Pushy — Coin Pusher MVP

**Input**: Design documents from `specs/001-pushy-mvp/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Test tasks are included because the plan's Technical Context and Phase 0 research (R10) explicitly adopt Vitest + Playwright as the testing strategy. They are written **alongside** implementation, not strictly TDD, except where explicitly marked "write tests first".

**Organization**: Tasks are grouped by user story so each story can be implemented, tested, and shipped independently. **User Story 1 alone is the shippable MVP.**

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: `[US1]`, `[US2]`, `[US3]` for user-story phases only
- All file paths are repository-relative; the source layout follows `plan.md → Project Structure`

## Path Conventions

Single-page web application at the repository root:

- Source: `src/**`
- Tests: `tests/unit/**`, `tests/integration/**`, `tests/e2e/**`
- Static: `index.html`, `public/**`
- Scripts: `scripts/**`
- Config: `package.json`, `tsconfig.json`, `vite.config.ts`, `playwright.config.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, toolchain, and the directory skeleton.

- [X] T001 Initialize npm project at repo root: create `package.json` with name `pushy`, type `module`, scripts `dev`, `build`, `preview`, `test:unit`, `test:integration`, `test:e2e`, `check:no-magic`, `lint`, `typecheck`.
- [X] T002 [P] Install runtime dependencies: `three`, `@dimforge/rapier3d-compat`.
- [X] T003 [P] Install dev dependencies: `typescript@^5.5`, `vite`, `@types/three`, `vitest`, `@vitest/coverage-v8`, `@playwright/test`, `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `prettier`.
- [X] T004 [P] Create `tsconfig.json` (target ES2022, module ESNext, strict, moduleResolution bundler, jsx none, types `vite/client`).
- [X] T005 [P] Create `vite.config.ts` configuring root, `optimizeDeps.exclude: ['@dimforge/rapier3d-compat']`, and a portrait-mobile dev server alias.
- [X] T006 [P] Create `playwright.config.ts` with two portrait device profiles: iPhone 14 (390×844) and a 360×800 Android profile.
- [X] T007 [P] Create ESLint + Prettier configs (`.eslintrc.cjs`, `.prettierrc`) with TypeScript-aware rules.
- [X] T008 Create the source directory skeleton: `src/{config,game,render,ui,persistence,audio,util}/`, `tests/{unit,integration,e2e}/`, `public/audio/`, `scripts/`.
- [X] T009 Create `index.html` with `viewport` meta (`width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no`), a `<canvas id="stage">`, a `<div id="overlay">` for DOM UI, and `<script type="module" src="/src/main.ts">`.
- [X] T010 Create `src/main.ts` as the bootstrap entry point (empty `init()` for now; will be wired up across later tasks).
---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that ALL user stories depend on. Must complete before any user-story phase begins.

**⚠️ CRITICAL**: No `[US1]`/`[US2]`/`[US3]` task may begin until this phase is checkpoint-complete.

- [X] T011 Implement `src/config/gameBalance.ts` exporting a `gameBalance` constant typed as `GameBalance`, populated with the defaults from [contracts/game-balance.schema.json](./contracts/game-balance.schema.json) and Phase 0 research §R11.
- [X] T012 Implement `src/util/time.ts` exporting `now(): number` (wraps `performance.now()`) and a `FixedStepAccumulator` class with `step(deltaMs)` returning the number of fixed steps to run (cap = 4).
- [X] T013 [P] Implement `src/util/rng.ts` exporting a small deterministic RNG seeded from `gameBalance.valuables.placementSeed` (e.g., mulberry32).
- [X] T014 [P] Implement `src/game/ObjectPool.ts`: generic free-list pool with `acquire(): T | undefined`, `release(t: T): void`, and `inUse(): Iterable<T>`; pre-allocates at construction.
- [X] T015 Implement `src/game/PhysicsWorld.ts`: initializes Rapier (await `RAPIER.init()`), creates a `World` with gravity from config, exposes `step()`, `addBody(desc, collider)`, `removeBody(handle)`, contact-event drain, and a `phase` flag (`'stepping' | 'idle'`) consumed by `SaveScheduler` (per Phase 0 R5).
- [X] T016 Implement `src/game/Tray.ts`: builds the static floor and three walls (back, left, right) from `gameBalance.tray` and exposes `winZoneSensorHandle` (a sensor collider positioned just past the front edge per FR-003).
- [X] T017 Implement `src/render/Renderer.ts`: creates `THREE.WebGLRenderer`, scene, perspective camera framed for portrait, attaches to `<canvas id="stage">`; exposes `render(scene, camera)` and `dispose()`.
- [X] T018 [P] Implement `src/render/ResizeManager.ts`: portrait-locked viewport sizing (CSS `100vw × 100vh`, `devicePixelRatio` clamp to 2), wires `resize` and `orientationchange`.
- [X] T019 [P] Implement `src/render/Lighting.ts`: ambient + directional + a subtle point light, added to the scene by `Renderer`.
- [X] T020 Implement `src/game/GameState.ts`: holds `mode`, `coinBank`, `valuablesCollected`, `pusherPhase`, `bodies`, `slots`, `saveDirty`; exposes `mutate(fn)` which runs `fn(this)` then marks `saveDirty` and notifies subscribers. Implements the state machine from [data-model.md §1](./data-model.md). Drop/win/loss helpers stubbed (filled in US1).
- [X] T021 Implement `src/game/GameLoop.ts`: orchestrates `requestAnimationFrame` → drives `FixedStepAccumulator` → calls `PhysicsWorld.step()` N times → calls `Renderer.render()`. Exposes `start()`, `stop()`. Sets `PhysicsWorld.phase` around each step.
- [X] T022 [P] Implement `src/ui/TouchInput.ts`: utility that attaches `touchstart` (with `{ passive: false }`) and `click` to a DOM element, calls `preventDefault()` to suppress double-tap zoom, and invokes a callback. Suppresses `contextmenu`.
- [X] T023 [P] Implement `src/ui/Hud.ts`: read-only DOM overlay showing `Coin Bank: N` and `Valuables Collected: N`. Subscribes to `GameState` and re-renders on change. Mounts into `#overlay`.
- [X] T024 Implement `src/ui/HomeScreen.ts`: full-screen DOM overlay with the title **Pushy**, a **Start** button, and a **Resume** button (disabled in this phase — wired in US2). Mounts into `#overlay`. Wires `Start` to dispatch a `start` event handled by `main.ts`.
- [X] T025 [P] Create `scripts/check-no-magic-numbers.mjs`: walks `src/game/**` and `src/render/**`, fails (exit 1) on numeric literals other than an allowlist (`0`, `1`, `-1`, `2`, `0.5`) outside `gameBalance.ts`. Wire as the `check:no-magic` npm script.
- [X] T026 Wire `src/main.ts` to: load `gameBalance`, instantiate `Renderer`, `ResizeManager`, `PhysicsWorld` (awaiting Rapier init), `Tray`, `GameState`, `GameLoop`, and show `HomeScreen`. On `Start` event, hide `HomeScreen`, mount `Hud`, set `GameState.mode = 'playing'`, call `GameLoop.start()`.
- [X] T027 [P] Write `tests/unit/game-balance.spec.ts`: validates the exported `gameBalance` object against `contracts/game-balance.schema.json` using a minimal hand-rolled validator (asserts presence + types + ranges of every property).
- [X] T028 [P] Write `tests/unit/object-pool.spec.ts`: asserts capacity, acquire/release semantics, exhaustion returns `undefined`, `inUse` iteration.
- [X] T029 [P] Write `tests/unit/fixed-step-accumulator.spec.ts`: asserts step counting, catch-up cap = 4, no drift under exact-multiple inputs.

**Checkpoint**: Booting the app shows the **Pushy** home screen on a portrait viewport with a styled **Start** button (disabled **Resume**). Pressing Start switches to an empty-tray scene with the pusher position fixed (US1 will animate it). All foundational unit tests pass. The config gate runs and passes.

---

## Phase 3: User Story 1 — Play one round of the coin pusher (Priority: P1) 🎯 MVP

**Goal**: Player taps a drop slot, a coin spawns, the pusher pushes coins toward the front, coins that fall off the front credit the bank, side fall-offs are lost, and the game declares Game Over when the bank is 0 with no motion. The MVP demo.

**Independent Test**: From a fresh load, tap Start → see HUD `Coin Bank: 100`, `Valuables Collected: 0` → tap a drop slot → coin lands on tray → bank decrements → after several drops a coin falls off the front → bank increments → spend bank to 0 and let coins settle → Game Over overlay appears with Play Again and Continue with 50 coins.

### Tests for User Story 1 (write tests first where marked)

- [X] T030 [P] [US1] Write `tests/unit/drop-slots.spec.ts` **first**: asserts per-slot cooldown (tap within `perSlotCooldownMs` ignored; tap on a different slot accepted; cooldown advances correctly across taps).
- [X] T031 [P] [US1] Write `tests/unit/game-state-economy.spec.ts` **first**: asserts `tryDrop()` decrements bank by `dropCostPerCoin`, rejects when bank < cost (FR-015); `awardCoinWin()` increments by `winValuePerCoin`; `triggerGameOver()` only fires when bank=0 AND no motion (FR-016).
- [X] T032 [P] [US1] Write `tests/integration/win-and-loss.spec.ts` **first**: with a fake `PhysicsWorld` that emits scripted sensor-enter events, verify a coin entering the win sensor increments bank; a coin classified as "side fall-off" leaves bank unchanged.

### Implementation for User Story 1

- [X] T033 [US1] Implement `src/game/Pusher.ts`: kinematic-position-based Rapier body, box collider sized to span tray width minus margin, cosine stroke `position.z = basePositionZ + amplitude * (1 - cos(2π·phase/period)) / 2`. Exposes `update(dtMs)` advancing phase, called by `GameLoop` between physics steps.
- [X] T034 [US1] Implement `src/game/Coin.ts`: factory `createCoinBody(world, x, y, z)` returning a `Dynamic` Rapier body with cylinder collider (`coinRadius`, `coinThickness`), `coinMass`, `coinFriction`, `coinRestitution`, CCD enabled. Bodies start disabled; `enableCoinBody(handle, x, y, z)` re-enables and teleports.
- [X] T035 [US1] Extend `src/game/ObjectPool.ts` usage: in `main.ts` (or a new `src/game/CoinPool.ts`) pre-allocate `maxActiveCoins` coin bodies (all disabled) at boot and own them via an `ObjectPool<CoinSlot>`.
- [X] T036 [P] [US1] Implement `src/render/CoinInstances.ts`: `THREE.InstancedMesh` of `maxActiveCoins` cylinders; `syncFromPool(coinPool)` iterates active coins and writes `Matrix4.compose(position, quat, scale)` into `instanceMatrix`; sets `needsUpdate = true`. Hidden coins parked at the origin with `Matrix4.makeScale(0,0,0)`.
- [X] T037 [US1] Implement `src/game/DropSlots.ts`: holds 3 `DropSlotState` records; `tapSlot(id, now)` enforces per-slot cooldown (Clarification Q4), checks bank (FR-015), spawns `coinsPerTap` coins via the coin pool with a `slotSpawnJitter` random offset, calls `GameState.mutate(s => s.coinBank -= dropCostPerCoin * coinsPerTap)`.
- [X] T038 [US1] Add three DOM drop-slot regions (positioned over the top of the canvas) in `src/ui/Hud.ts` or a new `src/ui/DropSlotButtons.ts`; wire each through `TouchInput` to `DropSlots.tapSlot(id, performance.now())`. CSS `touch-action: manipulation` on each region.
- [X] T039 [US1] Implement `src/game/WinZone.ts`: subscribes to `Tray.winZoneSensorHandle` collision events; on enter, classifies the other body as coin (via `coinPool.findByHandle`); if found, calls `GameState.mutate(s => s.coinBank += winValuePerCoin)` and returns the coin slot to the pool. Side fall-off handled by a per-step pass that releases bodies whose `y < -0.5` or `|x| > trayWidth/2 + 0.05` (FR-009).
- [X] T040 [US1] Implement Game Over detection in `GameLoop`: after each physics step, if `mode === 'playing' && coinBank === 0 && allCoinsAtRest()` (linear+angular speed below `1e-3` for every active coin), call `GameState.mutate(s => s.mode = 'gameOver')`.
- [X] T041 [US1] Implement `src/ui/GameOverOverlay.ts`: DOM overlay shown when `GameState.mode === 'gameOver'` with two buttons: **Play Again** (calls a `resetSession()` helper that clears the coin pool, resets `coinBank = startingBank`, sets `mode = 'playing'`) and **Continue with N coins** (label uses `continueTopUpCoins`; calls `continueSession()` that adds `continueTopUpCoins` to the bank and sets `mode = 'playing'` without touching bodies). Blocks drop input while visible (FR-016a).
- [X] T042 [P] [US1] Wire `CoinInstances.syncFromPool(coinPool)` into `GameLoop` once per render frame (after physics step batch, before `Renderer.render`).
- [X] T043 [US1] Update `src/main.ts` to instantiate `Pusher`, `CoinPool`, `DropSlots`, `CoinInstances`, `WinZone`, and to register `Pusher.update` + side-fall-off pass + Game-Over check with `GameLoop`. Mount `GameOverOverlay`.
- [X] T044 [US1] Write `tests/integration/game-over.spec.ts`: drive `GameState` to bank=0, simulate `allCoinsAtRest = true`, assert `mode` transitions to `gameOver` and `GameOverOverlay` becomes visible.

**Checkpoint**: User Story 1 is fully playable on a portrait viewport. Tapping slots spawns coins, the pusher pushes, coins win or lose at the edges, Game Over fires correctly with both buttons functional. **This is the shippable MVP.**

---

## Phase 4: User Story 2 — Resume an interrupted session (Priority: P2)

**Goal**: Player state (Coin Bank, Valuables Collected, body positions) survives tab close / refresh; Resume restores it; Start discards it; corruption and schema mismatch fall back to a fresh session silently.

**Independent Test**: With US1 working, play to a non-trivial state (bank changed, coins on tray). Refresh the page. Confirm **Resume** is now enabled. Tap Resume. Confirm bank, valuables, and on-tray coin positions match pre-refresh.

### Tests for User Story 2 (write tests first where marked)

- [X] T045 [P] [US2] Write `tests/unit/save-store.spec.ts` **first**: round-trips a sample `SaveStateV1` through `SaveStore.save` + `SaveStore.load`; verifies that `load` returns `null` for missing key, invalid JSON, missing `schemaVersion`, and `schemaVersion !== 1` (Clarifications Q5, FR-026); verifies no error is thrown to the caller.
- [X] T046 [P] [US2] Write `tests/unit/save-scheduler.spec.ts` **first**: with a fake clock, asserts that multiple `scheduleSave()` calls within the debounce window result in a single flush; that flush waits for `phase === 'idle'`; that `pagehide` triggers an immediate flush.

### Implementation for User Story 2

- [X] T047 [P] [US2] Implement `src/persistence/SaveStore.ts`: `save(state: SaveStateV1): void` (sync `localStorage.setItem` wrapped in `try/catch`, swallows quota errors silently); `load(): SaveStateV1 | null` implementing the load procedure from [data-model.md §5](./data-model.md); `clear(): void`. Uses key `pushy.save.v1`. Includes the `isSaveStateV1` type guard.
- [X] T048 [P] [US2] Implement `src/persistence/SaveScheduler.ts`: holds a reference to `PhysicsWorld.phase`, debounces at `saveDebounceMs`, ensures flush runs only when phase is `'idle'`, attaches `visibilitychange` / `pagehide` listeners for immediate flush.
- [X] T049 [US2] Add `snapshotBodies(coinPool, valuablePool): { coins, valuables }` helper (in `src/persistence/snapshot.ts`) that reads positions/rotations from active pool entries into the `SaveStateV1` shape. Velocities deliberately excluded (Clarification Q3).
- [X] T050 [US2] Wire `GameState.mutate()` to call `SaveScheduler.scheduleSave()` after each mutation. The scheduled flush reads `coinBank`, `valuablesCollected`, calls `snapshotBodies`, and writes via `SaveStore.save`.
- [X] T051 [US2] Implement `restoreFromSave(save: SaveStateV1)` in `src/game/restore.ts`: for each saved coin, acquire from coin pool and place at saved position/rotation with zero velocity; same for valuables (variant-aware — needs T056 from US3 if valuables present, but for US2 with bank-only saves the coin path is sufficient). Reset `Pusher.phase = 0` (Clarification Q3).
- [X] T052 [US2] Update `src/ui/HomeScreen.ts`: on mount, call `SaveStore.load()`; if non-null, enable the **Resume** button. Wire **Resume** to call `restoreFromSave(save)`, set `mode = 'playing'`, start `GameLoop`, mount `Hud`. Wire **Start** to call `SaveStore.clear()` before starting a fresh session.
- [X] T053 [US2] Update `resetSession()` (from T041) to also call `SaveStore.clear()` so a Play Again click discards the save (matches FR-018 semantics extended to Game Over).
- [X] T054 [US2] Write `tests/integration/resume-roundtrip.spec.ts`: with a fake `PhysicsWorld` and fake `SaveStore` backed by an in-memory map, mutate `GameState`, advance fake clock past debounce, assert one `save` write; load via `SaveStore`; restore into a fresh state; assert bank/valuables/coin count match.
- [X] T055 [P] [US2] Manual test: in DevTools, set `localStorage` quota to 0 / block storage; assert `SaveStore.save` swallows the error and `SaveStore.load` returns `null`; Home shows **Resume** disabled; **Start** still works (FR-026).
- [X] T056 [P] [US2] Manual test: corrupt `pushy.save.v1` to invalid JSON and to a mismatched `schemaVersion`; assert Resume is unavailable and no error UI appears (Clarification Q5).

**Checkpoint**: A refresh during play preserves Coin Bank, Valuables count, and coin layout. Schema mismatch is silently discarded. Per-frame save overhead is invisible (debounced).

---

## Phase 5: User Story 3 — Collect valuables (Priority: P3)

**Goal**: A fixed initial set of valuables (toys) is seeded at game Start; collecting one off the front increments a separate counter; collecting one off the sides does nothing; no new valuables spawn during play.

**Independent Test**: Start a fresh session, identify the brightly-colored valuables on the tray, push one off the front edge — Valuables Collected increments by 1, Coin Bank unchanged. Push one off the side — no change.

### Tests for User Story 3 (write tests first where marked)

- [X] T057 [P] [US3] Write `tests/unit/valuable-placement.spec.ts` **first**: given a fixed `placementSeed` and `initialCount = 6`, asserts the placement RNG returns the same positions on repeated runs (determinism) and that positions are within tray bounds.
- [X] T058 [P] [US3] Write `tests/integration/valuable-win.spec.ts` **first**: drive a fake sensor-enter event for a valuable; assert `valuablesCollected` increments by 1 and `coinBank` is unchanged from that event.

### Implementation for User Story 3

- [X] T059 [US3] Implement `src/game/Valuable.ts`: factory `createValuableBody(world, variantId)` returning a `Dynamic` Rapier body. Three variants (0/1/2) use mass = `coinMass * valuableMassMultipliers[variantId]` and a simple primitive collider (e.g., variant 0 = small box, 1 = sphere, 2 = larger box). Friction/restitution from `valuableFriction` / `valuableRestitution`.
- [X] T060 [US3] Implement a `ValuablePool` (instance of `ObjectPool<ValuableSlot>`) sized to `maxActiveValuables`, pre-allocated at boot like `CoinPool`. Created in `main.ts`.
- [X] T061 [P] [US3] Implement `src/render/ValuableMeshes.ts`: per-valuable `THREE.Mesh` objects (no instancing — count is small); per-frame sync of position/rotation from `ValuablePool` active slots. Bright `MeshStandardMaterial` colors per variant (e.g., red, yellow, blue).
- [X] T062 [US3] Implement `placeValuables()` in `src/game/Tray.ts`: uses the seeded RNG to choose `initialCount` non-overlapping positions on the tray, acquires `initialCount` slots from `ValuablePool`, places bodies with variant cycling round-robin. Called only by `resetSession()` (US1) and on a `Start`-from-home transition.
- [X] T063 [US3] Update `src/game/WinZone.ts` to classify the entering body: lookup in `coinPool` first; if not found, lookup in `valuablePool`; if a valuable, `GameState.mutate(s => s.valuablesCollected += 1)`, release the valuable slot. Coin path unchanged.
- [X] T064 [US3] Update the side fall-off pass (T039) to also iterate active valuables and release the slot on side exit (no counter change, FR-009).
- [X] T065 [US3] Update `src/ui/Hud.ts` so `Valuables Collected` is wired to `GameState.valuablesCollected` (was already declared in T023; this task confirms binding).
- [X] T066 [US3] Update `continueSession()` (from T041): leaves all valuable bodies untouched (FR-016a — Continue keeps positions and valuables).
- [X] T067 [US3] Update `resetSession()` (from T041): clears valuable pool and calls `Tray.placeValuables()` so a fresh game reseeds the initial set (Clarification Q1).
- [X] T068 [US3] Extend `snapshotBodies()` (T049) to include valuables: each saved valuable carries `variantId` plus position/rotation. Extend `restoreFromSave` (T051) to acquire the matching variant from `ValuablePool`.
- [X] T069 [US3] Write `tests/integration/no-valuable-spawning.spec.ts`: drive 1000 simulated `tapSlot()` and physics steps in a fake world; assert `valuablePool.activeCount` never exceeds the post-`placeValuables` count (no in-play spawning — Q1).

**Checkpoint**: All three user stories work end-to-end. Valuables behave physically distinctly, only spawn at game start, persist through save/resume, and remain in place on Continue.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Visual/audio polish, performance gates, and CI plumbing. Required for spec SC-001 (60 fps), SC-006 (no clipping), FR-028 (audio), Constitution Performance/UX gates.

- [X] T070 [P] Implement `src/audio/AudioBus.ts`: single `AudioContext`, preloads `public/audio/coin-drop.ogg` and `public/audio/clink.ogg` as `AudioBuffer`s, exposes `playCoinDrop()` (no throttle) and `playClink()` (token-bucket throttled per Phase 0 R8: `clinkMaxPerSecond`, `clinkBurst`, random pitch ±5 %).
- [ ] T071 [P] Add `public/audio/coin-drop.ogg` and `public/audio/clink.ogg` (short, < 50 ms samples). Document in [quickstart.md](./quickstart.md) §3 if asset replacement is needed.
- [X] T072 Wire audio: call `AudioBus.playCoinDrop()` from `DropSlots.tapSlot` on a successful spawn; subscribe to Rapier coin-coin contact events in `PhysicsWorld` and call `AudioBus.playClink()` per contact (the bucket handles throttling) — FR-028.
- [X] T073 [P] Polish materials in `src/render/Lighting.ts` and per-mesh materials: shiny gold `MeshStandardMaterial` (`metalness = 0.9`, `roughness = 0.25`, `color = 0xffd24a`) for the coin `InstancedMesh`; matte plastic for valuables. Constants live in `gameBalance.ts` (extend the schema if needed; remember to re-validate T027 against the schema).
- [X] T074 [P] CSS pass on `src/ui/*.ts` overlays: use `vmin` units, ensure tap targets ≥ 44×44 px, `touch-action: manipulation` on drop slots and overlay buttons, `user-select: none` globally on the overlay (FR-021, FR-022, Constitution Principle III).
- [X] T075 [P] Create `tests/e2e/portrait-smoke.spec.ts` (Playwright): at iPhone 14 viewport, load app → assert Home with disabled Resume → click Start → tap each drop slot once → assert HUD Coin Bank decreased by 3 → wait 5 s → assert no JS console errors.
- [X] T076 [P] Create `bench/200-coins.html` and `bench/main.ts`: a standalone Vite-served page that bypasses Home and immediately spawns 200 coins; renders an on-screen rolling FPS readout. Used for the manual Performance Gate per [quickstart.md §7](./quickstart.md).
- [X] T077 Wire the CI script chain in `package.json`: `npm run check` = `typecheck && lint && check:no-magic && test:unit && test:integration && test:e2e`.
- [X] T078 [P] Add a `README.md` at repo root with a 10-line orientation pointing to [specs/001-pushy-mvp/quickstart.md](./quickstart.md).
- [ ] T079 Run the full [quickstart.md](./quickstart.md) §4 acceptance scenarios manually on the reference mid-range mobile device; record observed FPS and any defects in the PR description (Constitution Performance Gate).
- [X] T080 Final pass: run `npm run check`; resolve any remaining lint/typecheck/no-magic-number violations; tag commit `mvp-001-ready`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** — T001..T010: no external dependencies; start immediately.
- **Foundational (Phase 2)** — T011..T029: depends on Phase 1 completion; **blocks all user-story phases**.
- **US1 (Phase 3)**: depends on Phase 2 checkpoint.
- **US2 (Phase 4)**: depends on Phase 2 checkpoint. Can run in parallel with US1 by a different developer; integration of save with body pools requires US1's `CoinPool` to exist for T051 / T054 in their full form.
- **US3 (Phase 5)**: depends on Phase 2 checkpoint. T068 cross-references US2's `snapshotBodies` and `restoreFromSave`; if US2 not yet done, T068 can stub the valuable-save path.
- **Polish (Phase 6)**: depends on US1 at minimum (the MVP must be playable to polish). T070..T072 (audio) and T076 (bench) can technically begin after Phase 2.

### Within Each User Story

- **Tests-first tasks** (T030, T031, T032, T045, T046, T057, T058): write and confirm failing before the matching implementation tasks.
- Body factories before pools; pools before spawn logic; spawn logic before win-zone classification.
- HUD/Overlay UI after the state changes they reflect are implemented.

### Critical Path

`T001 → T002 → T011 → T015 → T020 → T033 → T034 → T035 → T037 → T039 → T040 → T041` is the shortest path to a playable demo.

### Parallel Opportunities

- **Setup**: T002, T003, T004, T005, T006, T007 all in parallel after T001.
- **Foundational**: T013, T014, T018, T019, T022, T023, T025, T027, T028, T029 all in parallel after their direct prerequisites land.
- **US1**: T030, T031, T032 (tests) in parallel; T036, T042 in parallel with each other after their pool/instances scaffolding exists.
- **US2**: T045, T046 in parallel; T047, T048 in parallel; T055, T056 manual checks in parallel.
- **US3**: T057, T058 in parallel; T059, T061 in parallel after T060.
- **Polish**: T070, T071, T073, T074, T075, T076, T078 all in parallel.

---

## Parallel Example: User Story 1 fast-start

Once Phase 2 is checkpoint-green, three developers can pick these up simultaneously:

```text
Dev A:  T030 (test: drop slots)           → T037 (DropSlots)
Dev B:  T031 (test: economy)              → T040 (Game Over check)
Dev C:  T032 (test: win/loss integration) → T034 (Coin factory) → T039 (WinZone)
```

T033 (Pusher), T036 (InstancedMesh), T038 (drop-slot DOM), T041 (Game Over UI), and T042 (instance sync wiring) merge in after these land.

---

## Implementation Strategy

### MVP (ship first)

Complete Phases 1 + 2 + 3 only (T001–T044). At that point the game is playable per spec User Story 1 — bank, drops, pushing, winning, losing, Game Over with both buttons. No persistence yet (Refresh = fresh session), no valuables yet (clean tray). Ship to internal playtest as **Pushy MVP-0.1**.

### Incremental delivery

- **MVP-0.2**: + Phase 4 (US2) — sessions survive refresh.
- **MVP-0.3**: + Phase 5 (US3) — valuables visible and collectible.
- **MVP-1.0**: + Phase 6 (Polish) — audio, materials, perf-gated, CI-gated.

Each increment is independently demoable and independently rollback-able.

---

## Validation Summary

- **Total tasks**: 80
- **Tasks per phase**: Setup 10, Foundational 19, US1 15, US2 12, US3 13, Polish 11
- **Test tasks**: 13 (3 US1 + 4 US2 incl. 2 manual + 3 US3 + 3 foundational unit + 1 e2e smoke)
- **Parallel-marked tasks**: 40
- **Independent test criteria**: each user-story phase has an explicit "Independent Test" paragraph at its head.
- **Format check**: every task uses `- [ ] TXXX [P?] [Story?] description with file path` per the prompt requirements.
- **Suggested MVP scope**: **Phases 1 + 2 + 3 only** (User Story 1). All three user stories ship together for v1.0.
