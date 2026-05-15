# Pushy

A browser-based 3D coin pusher arcade game. Drop coins from three slots at the
back of a tray, watch the oscillating pusher arm shove the pile forward, and
collect coins (and brightly colored valuables) that fall off the front edge
into the win zone.

Built with **Three.js** (rendering), **Rapier.js** (3D rigid-body physics,
WASM), and **Vite** (dev server + bundler). No UI framework — overlays are
plain DOM driven from TypeScript.

## Features

- Fixed-timestep 60 Hz physics with up to 4 catch-up substeps per frame
- Object pools: 250 coins, 16 valuables, zero per-frame allocations
- Persistent save (localStorage) with 500 ms debounce + page-hide flush
- Home / HUD / Game Over overlays with Start, Resume, Continue, Play Again
- Token-bucket throttled clink audio (optional — degrades gracefully)
- Portrait-first responsive layout, ≥ 44 × 44 px tap targets

## Quick start

Requires Node.js 20+.

```sh
npm install
npm run dev          # local dev server on http://localhost:5173
npm run build        # production bundle in dist/
npm run preview      # serve the built bundle
```

## Test & check

```sh
npm run typecheck         # tsc --noEmit
npm run lint              # eslint
npm run check:no-magic    # forbids magic numbers in src/game and src/render
npm run test:unit         # vitest (jsdom)
npm run test:integration  # vitest (jsdom)
npm run test:e2e          # playwright (boots dev server)
npm run check             # everything above, in order
```

The `check:no-magic` script enforces the single-source-of-truth rule
(Constitution Principle V): every tunable lives in
[src/config/gameBalance.ts](src/config/gameBalance.ts) and the JSON Schema at
[specs/001-pushy-mvp/contracts/game-balance.schema.json](specs/001-pushy-mvp/contracts/game-balance.schema.json).

## Performance bench

[bench/200-coins.html](bench/200-coins.html) bypasses Home/HUD and spawns 200
coins immediately, rendering a rolling FPS readout. Used for the manual
Performance Gate. Serve it with `npm run dev` and navigate to
`/bench/200-coins.html`.

## Project layout

```text
src/
  audio/         AudioBus (single AudioContext, throttled clinks)
  config/        gameBalance.ts — all tunables live here
  game/          Pure logic: physics, pools, win zone, drop slots, persistence
  persistence/   localStorage save / load / debounced scheduler / snapshot
  render/        Three.js renderer, lighting, instanced coin mesh, valuables
  ui/            DOM overlays: Home, HUD, Game Over, drop-slot buttons
  util/          rng (mulberry32), fixed-step accumulator
  main.ts        Bootstrap & wiring
tests/
  unit/          Pure-logic vitest specs
  integration/   Multi-module vitest specs (jsdom)
  e2e/           Playwright portrait smoke
bench/           200-coin FPS bench page
specs/           Feature spec, plan, tasks, contracts
scripts/         CI helpers (no-magic-numbers checker)
```

## Game balance & tuning

Every tunable value (coin mass, pusher stroke, audio throttle rate, etc.) is
defined and frozen in [src/config/gameBalance.ts](src/config/gameBalance.ts).
Edit there and re-run `npm run check`.

## Documentation

- Specification: [specs/001-pushy-mvp/spec.md](specs/001-pushy-mvp/spec.md)
- Implementation plan: [specs/001-pushy-mvp/plan.md](specs/001-pushy-mvp/plan.md)
- Task breakdown: [specs/001-pushy-mvp/tasks.md](specs/001-pushy-mvp/tasks.md)
- Quickstart & acceptance scenarios: [specs/001-pushy-mvp/quickstart.md](specs/001-pushy-mvp/quickstart.md)
- Research notes: [specs/001-pushy-mvp/research.md](specs/001-pushy-mvp/research.md)

## License

Internal / unpublished.
