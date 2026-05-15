<!--
SYNC IMPACT REPORT
==================
Version change: (none) → 1.0.0
Rationale: Initial ratification of the project constitution. MAJOR bump establishes
the baseline governance and principles for the Pushy project.

Modified principles: N/A (initial adoption)
Added sections:
  - Core Principles (I. Performance First, II. Physics Fidelity, III. Mobile-First UX,
    IV. State Persistence, V. Parameterization, VI. Technology Stack)
  - Technology & Performance Standards
  - Development Workflow & Quality Gates
  - Governance
Removed sections: None

Templates requiring updates:
  - ✅ .specify/templates/plan-template.md (Constitution Check section is generic;
    gates resolve against this file by reference — no rename required)
  - ✅ .specify/templates/spec-template.md (no principle-specific scope sections)
  - ✅ .specify/templates/tasks-template.md (physics/persistence/config tasks fit
    existing categories; no rename required)
  - ⚠ README.md (not present at repo root — no propagation required yet)

Follow-up TODOs: None
-->

# Pushy Constitution

## Core Principles

### I. Performance First (NON-NEGOTIABLE)
The game MUST sustain 60 frames per second on mid-range mobile devices under
representative play conditions (200+ active rigid bodies in the simulation).
All physics computation MUST be executed by Rapier.js compiled to WebAssembly;
no physics work MAY be reimplemented in JavaScript hot paths. Any feature that
measurably drops the frame budget below 16.6 ms on the reference device
benchmark MUST be reworked or rejected before merge.

**Rationale**: Coin pusher gameplay depends on smooth, continuous motion; frame
drops break the perception of physical realism and degrade tap responsiveness.

### II. Physics Fidelity
Coins MUST be simulated as dynamic rigid bodies with realistic friction and
restitution values tuned to mimic metal-on-metal contact. The Pusher MUST be a
kinematic body (not dynamic, not static) so that coin displacement is
deterministic and the pusher geometry NEVER clips through coins. Penetration,
tunneling, and visible jitter are defects, not acceptable trade-offs.

**Rationale**: Predictable, believable physics is the core product. Kinematic
pusher motion is the only safe way to push large coin counts without instability.

### III. Mobile-First UX
The interface MUST be designed primarily for vertical (portrait) orientation
on touch devices. Coin drops MUST be triggered by tapping designated slot
areas; no feature MAY require a keyboard, mouse, hover state, or landscape
layout to be usable. Desktop support is permitted only as a strict superset of
the mobile experience and MUST NOT compromise mobile ergonomics.

**Rationale**: The target audience plays on phones in one hand; any UX decision
that assumes a larger viewport or precise pointer input fails the core user.

### IV. State Persistence
The game MUST automatically persist player state — coin count, valuables
collected, and current physics positions sufficient to resume play — to
browser LocalStorage. The Home Page "Resume" action MUST restore play without
data loss across browser sessions, refreshes, and tab restores. Writes MUST be
throttled to avoid frame-time impact (see Principle I).

**Rationale**: Sessions are short and interruption-prone on mobile; losing
progress destroys engagement and trust in the game.

### V. Parameterization
Core game-balance values — starting coins, gravity, pusher speed and stroke,
spawn rates, payout odds, and friction/restitution constants — MUST live in a
single configuration file consumed at runtime. Logic code MUST NOT hard-code
these values. Tuning a balance parameter MUST NOT require touching gameplay
logic, physics setup code, or rendering code.

**Rationale**: Rapid iteration on game feel requires that designers and
engineers change numbers in one place with predictable, isolated effects.

### VI. Technology Stack
The rendering stack MUST be Three.js over WebGL. The physics stack MUST be
Rapier.js (WASM). Alternative renderers, physics engines, or native shells
MUST NOT be introduced without an amendment to this constitution. New runtime
dependencies MUST be justified against bundle size and mobile cold-start
impact.

**Rationale**: A fixed, validated stack keeps performance characteristics
predictable across the lifetime of the project and prevents drift toward
incompatible toolchains.

## Technology & Performance Standards

- **Rendering**: Three.js over WebGL. WebGL 2 features MAY be used when a WebGL 1
  fallback is provided or when target devices are known to support them.
- **Physics**: Rapier.js compiled to WASM. The fixed simulation timestep MUST
  be decoupled from the render loop to keep determinism under variable frame
  rates.
- **Frame budget**: 16.6 ms per frame on the reference mid-range mobile device.
  CPU work per frame SHOULD stay under 10 ms to leave headroom for the GC and
  the compositor.
- **Active body budget**: The simulation MUST remain stable with at least 200
  active rigid bodies. Pooling and sleeping strategies SHOULD be used to keep
  active counts bounded.
- **Persistence**: LocalStorage writes MUST be debounced (recommended ≥ 500 ms
  between writes) and MUST NOT occur during a physics step.
- **Configuration**: A single config module (e.g., `config/gameBalance.*`) is
  the sole source of truth for tunable values; loaders MAY layer environment
  overrides but MUST NOT introduce additional canonical sources.

## Development Workflow & Quality Gates

- **Constitution Check**: Every implementation plan MUST include a Constitution
  Check that explicitly evaluates Principles I–VI against the proposed design.
  Violations MUST be resolved or justified before implementation begins.
- **Performance gate**: Changes touching the render loop, physics step, or
  asset pipeline MUST report measured frame-time impact on the reference
  device profile before merge.
- **Physics gate**: Changes to coin or pusher bodies MUST be validated against
  the no-clipping and no-tunneling requirements of Principle II.
- **UX gate**: New UI MUST be reviewed in portrait viewport sizes (e.g.,
  390×844, 360×800) before merge; landscape and desktop layouts are secondary.
- **Persistence gate**: Any state added to gameplay MUST also be added to the
  save/restore path or explicitly documented as ephemeral.
- **Config gate**: New tunable numbers MUST be added to the central config
  file in the same change that introduces them.

## Governance

This constitution supersedes ad-hoc practices and prior informal conventions
within the Pushy project. All pull requests and reviews MUST verify compliance
with the Core Principles and the gates in the Development Workflow section;
non-compliance MUST be either fixed or explicitly justified in the PR
description and approved by a maintainer.

Amendments to this constitution MUST be proposed via pull request that updates
this file, bumps the version per the policy below, updates the Last Amended
date, and propagates any consequent changes to dependent templates and
guidance documents.

**Versioning policy** (semantic):

- **MAJOR**: Backward-incompatible governance changes, removal or
  redefinition of a principle, or a change of the mandated technology stack.
- **MINOR**: Addition of a new principle or section, or materially expanded
  normative guidance.
- **PATCH**: Clarifications, wording fixes, and non-semantic refinements.

Compliance reviews SHOULD occur at each release boundary and whenever a new
principle is introduced. Runtime development guidance lives alongside feature
plans under `specs/` and MUST defer to this constitution when in conflict.

**Version**: 1.0.0 | **Ratified**: 2026-05-14 | **Last Amended**: 2026-05-14
