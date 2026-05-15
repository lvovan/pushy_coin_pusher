# Implementation Plan: Pushy — Coin Pusher MVP

**Branch**: `001-pushy-mvp` | **Date**: 2026-05-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-pushy-mvp/spec.md`

## Summary

Pushy is a single-player, portrait-orientation, browser-based 3D coin pusher game. The player taps one of three drop slots to spend coins from a bank; coins fall onto a kinematically-driven pusher tray, are nudged toward the front edge, and either credit the bank (front win zone), are lost (sides), or stay on the tray. A finite set of "valuables" is seeded at game start as a bonus collectible. State is persisted to LocalStorage so a Resume on the Home screen restores Coin Bank, Valuables count, and body positions.

The technical approach is mandated by the Constitution: **Three.js + WebGL** for rendering and **Rapier.js (WASM)** for physics, with a single `gameBalance` configuration module as the source of truth for tunable values. A fixed-timestep physics loop decoupled from rendering, instanced rendering for coins, an object pool for coin/valuable bodies, and debounced LocalStorage writes are the load-bearing techniques to meet the 60 fps / 200+ active body / single-file-tuning success criteria.

## Technical Context

**Language/Version**: TypeScript 5.5+ (ES2022 target), bundled to ES modules
**Primary Dependencies**: `three` (Three.js r160+), `@dimforge/rapier3d-compat` (Rapier.js 3D, WASM-compat build), Vite (dev server + bundler). No UI framework — Vanilla DOM overlay for Home/HUD/Game-Over.
**Storage**: Browser `localStorage` (single key: `pushy.save.v1`). No server, no IndexedDB.
**Testing**: Vitest (unit + module integration) for pure logic (economy, save/load, config). Playwright (smoke) for the end-to-end "Start → drop → win" mobile-viewport flow. Manual perf profiling for frame-budget validation.
**Target Platform**: Modern mobile web browsers (Chrome Android 110+, Safari iOS 16+) with WebGL 2 and WebAssembly support. Portrait orientation primary; desktop browsers supported as a superset.
**Project Type**: Single-page web application (static assets, no backend).
**Performance Goals**: 60 fps sustained with ≥200 active rigid bodies on the reference mid-range mobile device (per Constitution Principle I and spec SC-001). CPU work per frame target ≤ 10 ms.
**Constraints**:

- 16.6 ms render-frame budget; physics step on a fixed sub-step (e.g., 60 Hz) decoupled from `requestAnimationFrame`.
- Save writes debounced ≥ 500 ms; never executed during a physics step.
- Pusher is kinematic; coins/valuables are dynamic with tuned friction/restitution; no clipping/tunneling (Constitution II, spec SC-006).
- All balance values in a single `config/gameBalance.ts` (Constitution V, FR-027).
- Initial bundle target: ≤ 300 KB gzipped JS + ≤ 250 KB Rapier WASM; cold-start to interactive ≤ 3 s on reference device.

**Scale/Scope**: ~200 coin bodies + ~10 valuables active simultaneously, single session, single device, no networking, no accounts. Estimated source ~2–3 KLOC TypeScript.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (see end of file).*

| Principle | Pre-research assessment | Result |
|-----------|-------------------------|--------|
| I. Performance First (NON-NEGOTIABLE) | Plan mandates Rapier WASM for all physics, fixed-timestep decoupled simulation, InstancedMesh for coin rendering, body pooling, and ≤ 500 ms debounced saves. Frame budget and active-body count are tracked in Performance Goals. | ✅ |
| II. Physics Fidelity | Pusher modeled as kinematic body; coins/valuables dynamic; CCD enabled on coins to prevent tunneling at high pusher speed; friction/restitution sourced from `gameBalance`. No JS-side physics overrides. | ✅ |
| III. Mobile-First UX | Portrait-only canvas layout; tap-only inputs; DOM overlay sized in `vmin` units; double-tap-zoom suppression on drop-slot regions; no hover/keyboard required. | ✅ |
| IV. State Persistence | Single `pushy.save.v1` LocalStorage key, debounced writer, schema-versioned, fresh-fallback on parse failure (matches FR-026); save excludes velocities (per clarification). | ✅ |
| V. Parameterization | One file `src/config/gameBalance.ts` exposes the typed `GameBalance` interface; all gameplay/physics/UI code consumes via injection. Lint rule (custom or grep CI check) forbids numeric literals in physics/economy modules. | ✅ |
| VI. Technology Stack | Three.js + WebGL (rendering), Rapier.js WASM (physics) — both locked. No alternative engines introduced. | ✅ |

**Performance / Physics / UX / Persistence / Config / Audio gates** (from Constitution → Development Workflow):

- Performance gate: render loop and physics step modules will carry a perf-test scaffold (200-body benchmark scene) before merge of the renderer or physics modules.
- Physics gate: a Playwright + headless-WebGL automated check will exercise 30 s of pusher cycles against 50 coins, asserting zero pusher-coin penetrations via Rapier collision events.
- UX gate: Playwright runs at 390×844 (iPhone 14) and 360×800 (mid-range Android) viewports.
- Persistence gate: every gameplay state mutation routes through a single `GameState.mutate(...)` API that schedules a save; the type system makes this hard to bypass.
- Config gate: a CI check (`scripts/check-no-magic-numbers.mjs`) scans `src/game/**` for numeric literals outside an allowlist and fails the build if any appear.

**Result**: No violations. Complexity Tracking section is empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-pushy-mvp/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── game-balance.schema.json   # Game Config contract
│   └── save-state.schema.json     # LocalStorage save contract
├── checklists/
│   └── requirements.md  # Spec quality checklist (already complete)
└── tasks.md             # Phase 2 output (created by /speckit.tasks, NOT here)
```

### Source Code (repository root)

Single web application; no backend, no separate frontend package.

```text
pushy/
├── index.html                   # Single page; mounts the canvas + DOM overlay
├── public/
│   ├── audio/                   # coin-drop, coin-clink samples (short OGG/MP3)
│   └── favicon.svg
├── src/
│   ├── main.ts                  # Entry point: bootstraps app shell + scene
│   ├── config/
│   │   └── gameBalance.ts       # SOLE source of all tunable numbers (Principle V)
│   ├── game/
│   │   ├── PhysicsWorld.ts      # Rapier world, fixed-step loop, body registry
│   │   ├── Pusher.ts            # Kinematic pusher; stroke cycle from config
│   │   ├── Tray.ts              # Static floor + 3 walls + front sensor
│   │   ├── Coin.ts              # Coin body factory; cylinder collider + CCD
│   │   ├── Valuable.ts          # Valuable body factory (primitive variants)
│   │   ├── ObjectPool.ts        # Generic pool for coins/valuables
│   │   ├── DropSlots.ts         # 3 slot model; per-slot cooldown logic
│   │   ├── WinZone.ts           # Front sensor handler; emits win events
│   │   ├── GameLoop.ts          # Orchestrates physics step + render frame
│   │   └── GameState.ts         # Coin Bank, Valuables, Game Over machine, save scheduling
│   ├── render/
│   │   ├── Renderer.ts          # Three.js scene/camera/renderer setup
│   │   ├── CoinInstances.ts     # InstancedMesh manager for coins
│   │   ├── PusherMesh.ts        # Pusher mesh, synced from kinematic body
│   │   ├── TrayMeshes.ts        # Tray floor + back/left/right wall meshes
│   │   ├── ValuableMeshes.ts    # Per-valuable mesh management
│   │   ├── Lighting.ts          # Lights + materials (shiny gold, matte plastic)
│   │   └── ResizeManager.ts     # Portrait-locked viewport sizing
│   ├── ui/
│   │   ├── HomeScreen.ts        # Start / Resume buttons
│   │   ├── Hud.ts               # Coin Bank + Valuables Collected display
│   │   ├── GameOverOverlay.ts   # Play Again / Continue (+ N) buttons
│   │   ├── DropSlotButtons.ts   # Three narrow tap-zones aligned with drop columns; press-and-hold continuous flow
│   │   └── TouchInput.ts        # Tap routing + double-tap-zoom suppression
│   ├── persistence/
│   │   ├── SaveStore.ts         # LocalStorage read/write, schema versioning
│   │   └── SaveScheduler.ts     # Debounced writer (idle-time, never mid-step)
│   ├── audio/
│   │   └── AudioBus.ts          # Throttled sound playback
│   └── util/
│       ├── rng.ts               # Seeded RNG for spawn offsets
│       └── time.ts              # Fixed-step accumulator
├── tests/
│   ├── unit/                    # economy, save/load, cooldown, RNG
│   ├── integration/             # GameState ↔ PhysicsWorld ↔ SaveStore
│   └── e2e/                     # Playwright: portrait mobile smoke flow
├── scripts/
│   └── check-no-magic-numbers.mjs   # Config-gate CI check
├── package.json
├── tsconfig.json
├── vite.config.ts
└── playwright.config.ts
```

**Structure Decision**: Single web application, no monorepo split. Source is partitioned by **role** (`game/` for simulation, `render/` for Three.js, `ui/` for DOM overlay, `persistence/` for storage) rather than by feature, because the entire codebase implements one cohesive feature (the game itself) and role-based separation maps cleanly to the Constitution's principles: `game/` enforces Principle II, `render/` enforces Principle I, `ui/` enforces Principle III, `persistence/` enforces Principle IV, and `config/` enforces Principle V. The `scripts/check-no-magic-numbers.mjs` config gate scans `src/game/**` and `src/render/**` to keep tunable values out of those layers.

## Complexity Tracking

*Empty — Constitution Check passes with no violations.*

---

## Constitution Re-check (Post-Phase 1 Design)

| Principle | Post-design assessment | Result |
|-----------|------------------------|--------|
| I. Performance | Phase 0 confirmed `InstancedMesh` + Rapier WASM + body pooling can hit 60 fps with 200 bodies on reference hardware. Phase 1 data-model isolates the per-coin runtime state to a `Float32` SoA layout for cache-friendly updates. Save writes are debounced and idle-scheduled. | ✅ |
| II. Physics Fidelity | Phase 1 data-model defines pusher as `KinematicPositionBased`; coins as `Dynamic` with CCD enabled and `restitution=0.05`, `friction=0.5` (initial); contracts/save-state.schema.json deliberately excludes velocity to match the clarified Resume semantics (Q3). | ✅ |
| III. Mobile-First UX | Phase 1 quickstart documents portrait viewport testing (390×844, 360×800); UI module names mirror mobile-only surfaces (`TouchInput`, `Hud`, no mouse/keyboard paths). | ✅ |
| IV. State Persistence | `contracts/save-state.schema.json` versioned (`"schemaVersion": 1`), single LocalStorage key, fresh-fallback path tested via unit + integration. Schema mismatch handled per Q5. | ✅ |
| V. Parameterization | `contracts/game-balance.schema.json` enumerates every tunable; `gameBalance.ts` is the single import root for these values; CI gate enforces no literals in `game/` and `render/`. | ✅ |
| VI. Technology Stack | No new runtime dependencies beyond `three` and `@dimforge/rapier3d-compat`. Vite is build-time only. | ✅ |

**Result**: No new violations introduced by design. Plan is ready to hand off to `/speckit.tasks`.

---

**Phase 2 (task generation) is NOT performed by this command.** Run `/speckit.tasks` next to produce `tasks.md`.
