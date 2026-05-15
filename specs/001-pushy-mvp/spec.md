# Feature Specification: Pushy — Coin Pusher MVP

**Feature Branch**: `001-pushy-mvp`
**Created**: 2026-05-14
**Status**: Draft
**Input**: User description: Implementation sequence for a mobile coin-pusher web game ("Pushy") covering environment & physics world, home/HUD UI, coin spawning & pooling, valuables & win logic, game-loop economy & persistence, and polish.

## Clarifications

### Session 2026-05-14

- Q: How do valuables get onto the tray during play? → A: Initial placement only at game start; no further spawns during play.
- Q: What can the player do from the Game Over state? → A: Overlay with two buttons — "Play Again" (fresh session) and "Continue with 50 coins" (top up bank by a configurable amount, default 50; keep all positions and valuables).
- Q: On Resume, should body velocities be restored? → A: No — restore all bodies at rest (velocity = 0); pusher resumes its normal stroke cycle.
- Q: Is the spawn-rate cap per-slot or global? → A: Per-slot cooldown — each slot has its own minimum interval between drops; tapping a different slot is unaffected.
- Q: How should a save written by an older game version be handled? → A: Treat schema mismatch as corruption — discard the save and fall back to a fresh session with no error surfaced.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Play one round of the coin pusher (Priority: P1)

A player opens the game, sees the Pushy home screen, taps **Start**, and is taken into a vertically oriented playfield showing a tray with a moving pusher and a coin bank. They tap one of three drop slots at the top of the machine; a coin falls onto the tray. The pusher slides back and forth, gradually nudging coins toward the front edge. When a coin tumbles over the front edge into the win zone, the coin bank increases. The player continues tapping until they choose to stop or run out of coins.

**Why this priority**: This is the entire core game loop. Without it there is no game. It is the smallest slice that demonstrates the product premise (tap → drop → push → win) and is independently shippable as the MVP.

**Independent Test**: Open the game, tap Start, tap a drop slot, observe a coin land on the tray, observe the pusher displace coins, observe at least one coin fall into the front win zone and the coin bank increase by the configured win amount.

**Acceptance Scenarios**:

1. **Given** the Home screen is displayed, **When** the player taps **Start**, **Then** the game view appears in portrait orientation showing the tray, the pusher in motion, three drop slots, and a HUD showing Coin Bank starting at the configured starting amount.
2. **Given** the player is in the game with coins remaining in the bank, **When** they tap or press-and-hold a drop slot, **Then** coins spawn at that slot with a small random offset and fall onto the tray under gravity at the per-slot cooldown rate for as long as the slot is held, and the Coin Bank decreases by the configured drop cost for each coin spawned.
3. **Given** coins are resting on the tray, **When** the pusher completes its forward stroke, **Then** coins in contact with the pusher are displaced toward the front of the tray without the pusher visibly clipping through them.
4. **Given** a coin tumbles over the front edge of the tray, **When** it enters the front win zone, **Then** the Coin Bank increases by the configured win value and the coin is removed from active play.
5. **Given** a coin slides off the left or right edge of the tray, **When** it leaves the play area, **Then** the coin is removed from active play with no change to the Coin Bank.
6. **Given** the player's Coin Bank reaches 0, **When** all remaining coins have come to rest (none in motion), **Then** the game shows a Game Over state and prevents further drops.

---

### User Story 2 - Resume an interrupted session (Priority: P2)

A player who closed the browser tab mid-game returns later, opens the game, and on the Home screen taps **Resume**. The game restores their previous Coin Bank, Valuables count, and the positions of coins and valuables on the tray so play continues from where it left off.

**Why this priority**: Mobile sessions are routinely interrupted. Without persistence, every interruption costs the player their progress, which destroys retention. Builds directly on P1 and is independently testable once P1 exists.

**Independent Test**: Play P1 to a non-trivial state (several coins on tray, bank changed from starting value, at least one valuable collected). Reload the browser. From the Home screen tap Resume. Verify Coin Bank, Valuables count, and on-tray coin positions match the pre-reload state within an acceptable tolerance.

**Acceptance Scenarios**:

1. **Given** an active in-game session with coins on the tray and a modified Coin Bank, **When** the page is reloaded and the player taps **Resume** on the Home screen, **Then** the previous Coin Bank, Valuables count, and coin/valuable positions and orientations are restored and play continues.
2. **Given** no prior session exists in local storage, **When** the Home screen renders, **Then** the **Resume** button is disabled or hidden and only **Start** is offered.
3. **Given** a previously saved session exists, **When** the player taps **Start** from the Home screen, **Then** the saved state is discarded and a fresh game begins at the configured starting Coin Bank.
4. **Given** a save is in progress, **When** the player drops a coin, **Then** game responsiveness remains within the performance budget (saves never block input or stall the physics step).

---

### User Story 3 - Collect valuables for bragging rights (Priority: P3)

When a new session begins, the tray is seeded with a fixed set of brightly colored "valuables" (plastic toys) mixed in with the starting playfield. No additional valuables appear during play — the only valuables a player can collect in a session are those present at session start (or those persisted from a prior session via Resume). When a valuable is pushed off the front edge into the win zone, a separate **Valuables Collected** counter on the HUD increments. Valuables behave physically differently from coins (different weight/feel) so they create interesting interactions with the coin pile.

**Why this priority**: Valuables add long-term play motivation beyond the coin economy. The game is playable without them; they enhance, not enable, the experience.

**Independent Test**: With Story 1 in place, enable valuables and play until a valuable falls into the front win zone. Verify the Valuables counter increments while the Coin Bank does not change from that event.

**Acceptance Scenarios**:

1. **Given** a valuable is present on the tray, **When** it falls into the front win zone, **Then** the Valuables counter increments by 1 and the Coin Bank is unchanged from that event.
2. **Given** a valuable falls off the left or right edge of the tray, **When** it leaves the play area, **Then** the valuable is removed and the Valuables counter does not change.
3. **Given** coins and valuables share the tray, **When** the pusher strokes, **Then** valuables and coins interact physically in a believable way (valuables of different mass push coins differently and vice versa) without clipping or tunneling.

---

### Edge Cases

- **Bank hits 0 with coins still in motion**: drops are disabled but the simulation continues; any in-flight coins that reach the front win zone still credit the bank, and Game Over is only declared once motion settles.
- **Bank hits 0 with coins still on the tray but none moving**: Game Over is declared even though coins remain on the playfield.
- **Press-and-hold or rapid tapping of a drop slot**: each drop slot enforces its own per-slot cooldown from the configuration. Holding a slot produces a continuous stream of drops paced by that cooldown until the player releases or the Coin Bank cannot cover the next drop. Taps on the same slot within its cooldown window are ignored (no queueing); presses on a different slot are processed independently. This protects the active-body budget while keeping cross-slot play responsive.
- **Two coins spawn at the same instant on the same slot**: a small random offset is applied per drop so coins do not initialize in perfect overlap.
- **Tab is closed or device is locked while coins are moving**: the most recent debounced save is restored on Resume; sub-debounce-window state may be lost but the game remains internally consistent.
- **LocalStorage is unavailable, full, or corrupted**: the game starts a fresh session and the Resume button is hidden/disabled; no crash.
- **Browser attempts double-tap zoom on a drop slot**: gesture is suppressed so rapid drop tapping does not zoom the viewport.
- **Device rotated to landscape**: the playfield remains vertically composed; layout adapts but the portrait gameplay framing is preserved.
- **Coin gets stuck against a wall and never moves**: the pusher motion eventually frees it; coins do not need to be manually un-stuck by the player.
- **Many coins accumulate on the tray**: the simulation remains stable and within the frame budget up to the documented active-body target.

## Requirements *(mandatory)*

### Functional Requirements

**Playfield & physics**

- **FR-001**: The game MUST present a vertically composed playfield consisting of a tray (floor), a back wall, and two side walls.
- **FR-002**: The pusher MUST move back and forth along the tray's depth axis on a deterministic cycle and MUST never visibly clip through coins or valuables.
- **FR-003**: A front sensor MUST detect when an object passes off the front edge of the tray (the "win zone").
- **FR-004**: Coins and valuables MUST behave as physical objects with gravity, friction, restitution, and collisions with each other, the tray, the walls, and the pusher.

**Coin & valuable lifecycle**

- **FR-005**: The game MUST provide exactly three drop slots positioned across the top of the playfield.
- **FR-006**: Activating a drop slot — by tap or by press-and-hold — MUST spawn coins at that slot with a small randomized positional offset. While the slot remains held, drops MUST repeat at the per-slot cooldown rate (FR-006b) for as long as the Coin Bank can cover them. Each activation MUST debit the Coin Bank by the configured drop cost per coin spawned.
- **FR-006a**: Each drop slot's tap zone MUST be a narrow on-screen region positioned over the actual world-space coin spawn column so the player can see exactly where coins will appear. Tap-zone screen positions MUST update on viewport resize and orientation change.
- **FR-007**: Coins MUST be cylindrical and visually distinct from valuables.
- **FR-008**: Valuables MUST be visually bright/colorful, use simple primitive shapes, and MUST have physics properties (mass) that differ from coins.
- **FR-008a**: A configurable initial set of valuables (count, shape mix, and starting placement parameters from Game Config) MUST be placed on the tray when a new session begins via **Start**. The system MUST NOT spawn additional valuables during play; once a session's valuables are collected or lost off the sides, no more appear until the next **Start**.
- **FR-009**: Coins and valuables that leave the playfield (front win zone or side edges) MUST be removed from the active simulation.
- **FR-010**: Coin and valuable objects MUST be reused via an object pool rather than created and destroyed on each spawn.

**Economy & scoring**

- **FR-011**: New players MUST begin with a Coin Bank of 100 (configurable starting value).
- **FR-012**: Each coin drop MUST decrease the Coin Bank by the configured drop cost (default 1 per coin spawned).
- **FR-013**: Each coin that enters the front win zone MUST increase the Coin Bank by the configured win value.
- **FR-014**: Each valuable that enters the front win zone MUST increment the Valuables Collected counter by 1 and MUST NOT affect the Coin Bank.
- **FR-015**: The system MUST prevent dropping coins when the Coin Bank cannot cover the drop cost.
- **FR-016**: The system MUST declare Game Over when the Coin Bank is 0 AND no coins are in motion.
- **FR-016a**: On Game Over, the system MUST display an overlay offering exactly two actions: **Play Again** — discards the current save and starts a fresh session at the configured starting bank; and **Continue** — tops up the Coin Bank by the configured continue amount (default 50) while leaving all coin and valuable positions, orientations, and the Valuables Collected counter unchanged, then dismisses the overlay and resumes play. The Game Over overlay MUST remain visible and block drop input until the player selects one of the two actions.

**UI / UX**

- **FR-017**: The game MUST present a Home screen with the title "Pushy" prominently displayed, plus **Start** and **Resume** controls.
- **FR-018**: **Start** MUST discard any saved state and begin a fresh session at the configured starting bank.
- **FR-019**: **Resume** MUST restore the most recent saved state and MUST be unavailable when no valid saved state exists.
- **FR-020**: An in-game HUD MUST display the current Coin Bank and Valuables Collected at all times.
- **FR-021**: The interface MUST be designed for vertical (portrait) orientation and operable by single-finger taps; it MUST NOT require a keyboard, mouse, hover, or landscape layout to play.
- **FR-022**: The drop-slot tap area MUST suppress browser double-tap-zoom, context menus, text selection, and similar gesture behaviors that would interfere with rapid tapping or press-and-hold drops.

**Persistence**

- **FR-023**: The system MUST automatically save the player's current Coin Bank, Valuables count, and the position and rotation of every active coin and valuable to browser local storage. Linear and angular velocities MUST NOT be persisted.
- **FR-024**: Save writes MUST be debounced so they do not occur on every physics step and MUST NOT block input or the simulation step.
- **FR-025**: On Resume, the system MUST reconstruct the playfield from saved positions and rotations with all body velocities initialized to zero, and the pusher MUST begin its normal stroke cycle from its default phase. The restored state MUST be functionally indistinguishable from the saved state for the purpose of continued play (small settling motion as bodies come to rest is acceptable).
- **FR-026**: If saved state is missing, unreadable, fails validation, or carries a schema version incompatible with the current build, the system MUST silently discard it and fall back to a fresh session without crashing and without surfacing a player-facing error.

**Configuration**

- **FR-027**: All balance-affecting numeric values — starting bank, drop cost, win value per coin, coins-per-tap range, per-slot drop cooldown, pusher speed and stroke length, gravity, coin and valuable mass, friction, restitution, initial valuable count and placement parameters, and the Game Over continue top-up amount — MUST be defined in a single runtime configuration file. Changing these values MUST NOT require modifying gameplay or rendering code.

**Audio & feedback (polish)**

- **FR-028**: The game MUST play a coin-drop sound on each drop and a collision "clink" sound on coin-to-coin contacts. Collision sounds MUST be throttled so high collision counts do not degrade frame rate, and the total number of audio samples playing concurrently MUST be capped at 10. When the cap is reached, additional sound effect requests MUST be dropped silently rather than queued, so a burst of physics contacts cannot produce a long backlog of sequentially-playing audio.

### Key Entities

- **Coin**: A cylindrical playfield object with mass, friction, and restitution. Spawned at a drop slot; removed when it enters the front win zone or leaves the sides. Affects the Coin Bank on win.
- **Valuable**: A bright primitive-shape playfield object with mass/friction distinct from a coin. Affects the Valuables Collected counter on win.
- **Pusher**: A kinematically driven box that strokes back and forth along the depth axis. Drives gameplay; not affected by collisions (one-way force imparter).
- **Tray**: Static floor surface with three walls (back, left, right) and an open front edge.
- **Win Zone**: A sensor region just past the front edge of the tray that detects objects falling off the front.
- **Coin Bank**: Integer counter of the player's current spendable coins.
- **Valuables Collected**: Integer counter of valuables won in the current session.
- **Drop Slot**: One of three tap targets above the tray that spawns coins when activated.
- **Save State**: Snapshot of Coin Bank, Valuables Collected, the position and rotation of every active coin and valuable, and a schema version identifier, persisted to browser local storage. Velocities are not included.
- **Game Config**: Single source of truth for all tunable numeric balance values.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a representative mid-range mobile device, the game sustains a smooth perceived frame rate (60 frames per second target) with at least 200 active coins on the tray under continuous play.
- **SC-002**: A first-time player can go from opening the game to dropping their first coin in fewer than 10 seconds.
- **SC-003**: After interrupting and resuming a session, at least 99% of trial players (or observation) confirm that the game resumed in the same state they left it — Coin Bank, Valuables count, and visible coin layout all preserved.
- **SC-004**: From any point during play, the most recent save is at most one debounce interval (≤ 1 second by default) old, so a tab close or refresh loses at most 1 second of progress.
- **SC-005**: Tapping a drop slot results in a visible coin drop within 100 ms of the tap.
- **SC-006**: Across a typical play session, fewer than 0.1% of coin-pusher contacts result in a visible clip, penetration, or tunneling event.
- **SC-007**: A game designer can change any single balance value (starting bank, drop cost, pusher speed, gravity, coin mass, etc.) by editing one file and reloading the page, with no other code changes required.
- **SC-008**: The game is fully playable to completion (Start → drop coins → win/lose) using only single-finger taps on a portrait phone screen, with no pinch, swipe, multi-touch, or rotation required.
- **SC-009**: When local storage is unavailable or corrupted, the game launches into a fresh playable session within 1 second and never displays an error that requires player action.

## Assumptions

- The game targets modern mobile web browsers with WebGL and WebAssembly support; legacy browsers are out of scope.
- The reference target device is a mid-range smartphone from the last three model years, held in portrait orientation.
- Gameplay is single-player and entirely client-side; no server, account, leaderboard, or networking is required for the MVP.
- A new player starts with 100 coins; default drop cost is 1 coin per coin spawned; default win value is 1 coin per coin reaching the front win zone. These are configurable per FR-027.
- Default coins-per-tap is 1, configurable up to N per FR-006; the spawn-rate cap protects the active-body budget.
- Valuables are placed only at session start (per FR-008a); no in-play spawning. The initial valuable count, shape mix, and placement parameters live in Game Config.
- Audio is enabled by default but the game remains fully playable with audio muted by the system or browser.
- LocalStorage is the only persistence layer; cross-device sync, cloud save, and account-based progression are explicitly out of scope.
- The save debounce interval defaults to ≤ 1 second; the precise value lives in Game Config.
- The mandated rendering and physics technologies are governed by the project Constitution (Principle VI) and are intentionally not restated as user-facing requirements here.
