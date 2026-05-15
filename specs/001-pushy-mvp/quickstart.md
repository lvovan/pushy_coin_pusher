# Quickstart: Pushy — Developer Onramp

**Date**: 2026-05-14
**Branch**: `001-pushy-mvp`
**Audience**: Developers picking up this feature for implementation, review, or playtest.

This is the minimum you need to know to run the game locally, change a balance value, and exercise the core acceptance scenarios from the spec.

---

## 1. Prerequisites

- Node.js 20 LTS or newer.
- A Chromium-based browser for local play (Edge / Chrome). iOS Safari and Android Chrome are the official test targets for portrait flows.
- (Optional) An actual mid-range mobile device on the same Wi-Fi for real-device perf validation.

---

## 2. Bootstrap

```powershell
# from repo root
npm install
npm run dev
```

`npm run dev` starts Vite at `http://localhost:5173`. Open it in **mobile-emulation mode** (DevTools → Toggle Device Toolbar → iPhone 14, 390×844) and confirm you see the **Pushy** home screen with **Start** (and **Resume** disabled, because no save exists yet).

---

## 3. Project layout (where to look first)

| You want to change… | Edit… |
|---------------------|-------|
| Any balance value (coins, gravity, pusher speed, mass, etc.) | `src/config/gameBalance.ts` — **only this file** |
| Pusher motion profile | `src/game/Pusher.ts` |
| Coin spawning / cooldown logic | `src/game/DropSlots.ts`, `src/game/Coin.ts` |
| Win/loss accounting | `src/game/GameState.ts` |
| HUD or Game Over UI | `src/ui/Hud.ts`, `src/ui/GameOverOverlay.ts` |
| Save/restore behavior | `src/persistence/SaveStore.ts`, `src/persistence/SaveScheduler.ts` |
| Coin rendering performance | `src/render/CoinInstances.ts` (InstancedMesh) |

If you find a numeric literal in `src/game/**` or `src/render/**` that isn't from `gameBalance`, the **config gate CI check** will (and should) fail your PR.

---

## 4. Exercising the core acceptance scenarios

These mirror the User Stories in `spec.md`. Run them in DevTools mobile-emulation mode (portrait).

### 4.1 User Story 1 — Play one round (P1)

1. Hard-refresh the page. Confirm **Home** appears with the title **Pushy**, a **Start** button, and **Resume** disabled.
2. Tap **Start**. Confirm:
   - Game view in portrait.
   - HUD shows **Coin Bank: 100** and **Valuables Collected: 0** (assuming default `startingBank: 100`).
   - The pusher is visibly stroking back-and-forth.
   - Six valuables are scattered on the tray (assuming default `valuableInitialCount: 6`).
3. Tap the leftmost drop slot. Confirm one coin spawns at the back-left, falls onto the tray, and **Coin Bank** decrements to **99**.
4. Tap any drop slot ~20 times. Watch the pusher push coins toward the front; eventually a coin falls off the front edge. Confirm **Coin Bank** ticks up by `winValuePerCoin` on each front-edge fall.
5. Press-and-hold any drop slot. Confirm coins drop continuously at roughly `1000 / perSlotCooldownMs` per second (~4 drops/second at the default 250 ms cooldown) for as long as you hold and the Coin Bank can cover them. Release and confirm drops stop immediately. Press-and-hold a *different* slot during the cooldown of the first — confirm the second slot starts its own continuous flow independently.
6. Spend the bank to 0 and let all coins settle. Confirm the **Game Over** overlay appears with **Play Again** and **Continue with 50 coins** buttons.
7. Tap **Continue with 50 coins**. Confirm bank jumps to **50**, all coins and valuables remain at their previous positions, and drops are accepted again.
8. Spend down to 0 again. Tap **Play Again**. Confirm a fresh session: bank back to **100**, tray reseeded with the original valuables, all prior coins gone.

### 4.2 User Story 2 — Resume an interrupted session (P2)

1. From the Home screen, tap **Start**, drop some coins, collect at least one valuable.
2. Hard-refresh the browser tab (Ctrl+Shift+R).
3. On the Home screen, confirm **Resume** is now enabled.
4. Tap **Resume**. Confirm:
   - **Coin Bank** matches the value just before the refresh.
   - **Valuables Collected** matches.
   - Coins are present on the tray at the same positions (small settling motion is acceptable; per Clarification Q3, velocities are not restored).
   - The pusher resumes stroking from phase 0.

### 4.3 User Story 3 — Valuables (P3)

1. Start a fresh session. Identify the colored valuables on the tray.
2. Drive a valuable off the front edge using the pusher (drop coins behind it).
3. Confirm **Valuables Collected** increments by exactly **1** and **Coin Bank** is unchanged from that event.
4. Drive a valuable off the **side** edge. Confirm **Valuables Collected** does NOT change.
5. Continue playing. Confirm no new valuables appear (initial set only — Clarification Q1).

### 4.4 Edge cases worth a manual pass

- **LocalStorage disabled**: in DevTools → Application → Local storage → set it to "Block site data". Refresh. Confirm Home renders, Resume is hidden/disabled, Start works, and there is no error UI (FR-026).
- **Corrupt save**: in DevTools → Application → Local storage, edit `pushy.save.v1` to invalid JSON. Refresh. Confirm Resume is unavailable and no error is surfaced.
- **Schema mismatch**: edit `pushy.save.v1` and change `"schemaVersion": 1` to `2`. Refresh. Confirm same behavior as corruption (Clarification Q5).
- **Double-tap zoom**: rapidly double-tap a drop slot in mobile emulation. Confirm the viewport does NOT zoom (FR-022).

---

## 5. Tuning a balance value (Principle V check)

Change `dropCostPerCoin` from `1` to `5` in `src/config/gameBalance.ts`. Save. Hot-reload in the browser. Confirm:

- Each drop now subtracts **5** from the bank.
- No other source file was modified.
- No code paths outside `src/config/` reference the literal `5` for cost.

If this check passes, the **Config Gate** is healthy.

---

## 6. Running the tests

```powershell
npm run test:unit          # Vitest — economy, save round-trip, cooldown, pool
npm run test:integration   # Vitest — GameState ↔ fake PhysicsWorld ↔ SaveStore
npm run test:e2e           # Playwright — portrait mobile smoke flow
npm run check:no-magic     # Config-gate CI check (scripts/check-no-magic-numbers.mjs)
npm run lint
npm run typecheck
```

PR gate: all six commands must pass.

---

## 7. Real-device performance pass

Before any merge that touches `src/render/**`, `src/game/PhysicsWorld.ts`, or `src/game/Pusher.ts`:

1. `npm run build && npm run preview -- --host`.
2. Open the printed LAN URL on the reference mid-range mobile device.
3. From the home screen, tap **Start**, then drop coins continuously into all three slots for 30 seconds until ≥ 200 coins are active.
4. Use Chrome DevTools → **Performance Monitor** (remote-device debugging) to confirm sustained ≥ 55 fps with ≤ 10 ms scripting time per frame.
5. Use Rapier's debug-render mode (toggled via a temporary URL param `?debug=1`) to visually confirm no pusher-coin penetration.

Record the result in the PR description; this is the Constitution's **Performance Gate**.

---

## 8. Where the spec lives

- Feature spec: [spec.md](./spec.md)
- Implementation plan: [plan.md](./plan.md)
- Research decisions: [research.md](./research.md)
- Data model: [data-model.md](./data-model.md)
- Contracts: [contracts/](./contracts/)
- Tasks (next step): generated by `/speckit.tasks` → `tasks.md`

---

**You're ready.** Anything not covered here is by design left to implementation discretion; if it surprises you on review, prefer to update this quickstart rather than expand the spec.
