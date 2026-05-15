/**
 * Pushy — application bootstrap (Phase 4 wiring).
 */
import { Clarity } from './analytics/Clarity';
import { AudioBus } from './audio/AudioBus';
import { CoinPool } from './game/CoinPool';
import { DropSlots } from './game/DropSlots';
import { GameLoop } from './game/GameLoop';
import { GameState } from './game/GameState';
import { PhysicsWorld } from './game/PhysicsWorld';
import { Pusher } from './game/Pusher';
import { restoreFromSave } from './game/restore';
import { Tray } from './game/Tray';
import { ValuablePool } from './game/ValuablePool';
import { WinZone } from './game/WinZone';
import { SaveScheduler } from './persistence/SaveScheduler';
import { SaveStore } from './persistence/SaveStore';
import { buildSaveState } from './persistence/snapshot';
import { CoinInstances } from './render/CoinInstances';
import { Confetti } from './render/Confetti';
import { installLighting } from './render/Lighting';
import { PusherMesh } from './render/PusherMesh';
import { Renderer } from './render/Renderer';
import { ResizeManager } from './render/ResizeManager';
import { TrayMeshes } from './render/TrayMeshes';
import { ValuableMeshes } from './render/ValuableMeshes';
import { CongratsOverlay } from './ui/CongratsOverlay';
import { DropSlotButtons } from './ui/DropSlotButtons';
import { GameOverOverlay } from './ui/GameOverOverlay';
import { HomeScreen } from './ui/HomeScreen';
import { Hud } from './ui/Hud';
import { MuteButton } from './ui/MuteButton';
import { ShoveGesture } from './ui/ShoveGesture';
import { ShoveMeter } from './ui/ShoveMeter';

async function main(): Promise<void> {
  const canvas = document.getElementById('stage');
  const overlay = document.getElementById('overlay');
  if (!(canvas instanceof HTMLCanvasElement) || !overlay) {
    throw new Error('Missing #stage canvas or #overlay div');
  }

  const renderer = new Renderer(canvas);
  const resize = new ResizeManager(renderer);
  installLighting(renderer.scene, renderer.renderer);

  // Microsoft Clarity — anonymous behavioural analytics. No-op locally when
  // VITE_CLARITY_PROJECT_ID is not set. Cumulative counters (games_played,
  // valuables_won_total) persist in localStorage and are mirrored as tags
  // on every session so they show up as filterable dimensions in Clarity.
  const clarity = new Clarity();
  clarity.init();
  clarity.syncCountersToTags([
    'games_played',
    'valuables_won_total',
    'sessions_resumed',
    'games_won_total',
    'continues_used',
    'shoves_used_total',
    'rage_taps_total',
    'slot_taps_0',
    'slot_taps_1',
    'slot_taps_2',
  ]);
  // Static device tags — useful for filtering by form factor.
  clarity.set('device_pixel_ratio', window.devicePixelRatio.toFixed(2));
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  clarity.set('viewport_aspect', aspect.toFixed(2));
  clarity.set('orientation', aspect < 1 ? 'portrait' : 'landscape');

  const audio = new AudioBus();
  void audio.init();

  // Audio is armed only after the player taps a drop slot for the first time.
  // This silences the initial pile-settle (325 coins all contacting at once)
  // and any pre-gameplay ambience, then enables both the slot drop sound and
  // the bin-landing clinks for the rest of the session.
  let audioArmed = false;
  const armAudio = (): void => {
    audioArmed = true;
  };
  // Track coin collider handles that have already played their bin-landing
  // clink so micro-bounces in the settled bin pile don't retrigger the sound
  // every frame (Rapier emits a fresh `started` collision event each time a
  // jittering coin separates from and re-touches the bin floor).
  const clinkedCoinHandles = new Set<number>();
  const resetAudioArming = (): void => {
    audioArmed = false;
    clinkedCoinHandles.clear();
  };

  // Per-session analytics counters (reset on every fresh / resumed session).
  let sessionDropCount = 0;
  let sessionStartMs = 0;
  let sessionStartingBank = 0;
  let sessionPeakBank = 0;
  let sessionFirstDropMs = -1; // -1 = no drop yet this session
  const sessionSlotTaps: [number, number, number] = [0, 0, 0];
  // Rage-tap detection: rolling buffer of failed-while-broke tap timestamps.
  // 5+ failed taps within 1s while bank=0 emits a single `rage_tap` event
  // (with a 3s cooldown so a sustained mash doesn't spam Clarity).
  const RAGE_WINDOW_MS = 1000;
  const RAGE_THRESHOLD = 5;
  const RAGE_COOLDOWN_MS = 3000;
  const rageTapTimes: number[] = [];
  let lastRageTapAtMs = -RAGE_COOLDOWN_MS;
  // FPS sampling: keep last N frame intervals, compute p50/p05 at session end.
  const FPS_SAMPLE_CAP = 600; // ~10s at 60fps; ring-buffered
  const frameMsSamples: number[] = [];
  let frameSampleHead = 0;
  const recordFrameMs = (dtMs: number): void => {
    if (dtMs <= 0 || dtMs > 1000) return; // ignore tab-switch / debugger pauses
    if (frameMsSamples.length < FPS_SAMPLE_CAP) {
      frameMsSamples.push(dtMs);
    } else {
      frameMsSamples[frameSampleHead] = dtMs;
      frameSampleHead = (frameSampleHead + 1) % FPS_SAMPLE_CAP;
    }
  };
  const computeFpsPercentile = (pct: number): number => {
    if (frameMsSamples.length === 0) return 0;
    const sorted = [...frameMsSamples].sort((a, b) => a - b);
    // pct here is for FPS (higher = better). To get the low-end (p05) FPS we
    // want the high-end (p95) of frame time. Convert: frameMs percentile is
    // (1 - pct/100). For p50 FPS use frameMs p50.
    const idx = Math.min(sorted.length - 1, Math.floor((1 - pct / 100) * sorted.length));
    const ms = sorted[idx] ?? 0;
    return ms > 0 ? Math.round(1000 / ms) : 0;
  };
  const resetSessionMetrics = (startingBank: number): void => {
    sessionDropCount = 0;
    sessionStartMs = performance.now();
    sessionStartingBank = startingBank;
    sessionPeakBank = startingBank;
    sessionFirstDropMs = -1;
    sessionSlotTaps[0] = sessionSlotTaps[1] = sessionSlotTaps[2] = 0;
    rageTapTimes.length = 0;
    frameMsSamples.length = 0;
    frameSampleHead = 0;
  };
  const flushSessionMetrics = (outcome: 'game_over' | 'won' | 'abandoned'): void => {
    const durationMs = Math.round(performance.now() - sessionStartMs);
    clarity.set('last_session_outcome', outcome);
    clarity.set('last_session_drops', sessionDropCount);
    clarity.set('last_session_duration_s', Math.round(durationMs / 1000));
    clarity.set('last_session_starting_bank', sessionStartingBank);
    clarity.set('last_session_peak_bank', sessionPeakBank);
    clarity.set('last_session_valuables', state.valuablesCollected);
    if (sessionFirstDropMs >= 0) {
      clarity.set('last_session_time_to_first_drop_ms', sessionFirstDropMs);
    }
    clarity.set('last_session_slot_taps_0', sessionSlotTaps[0]);
    clarity.set('last_session_slot_taps_1', sessionSlotTaps[1]);
    clarity.set('last_session_slot_taps_2', sessionSlotTaps[2]);
    clarity.set('last_session_fps_p50', computeFpsPercentile(50));
    clarity.set('last_session_fps_p05', computeFpsPercentile(5));
    clarity.event(`session_end_${outcome}`);
  };

  const physics = await PhysicsWorld.create();
  const tray = new Tray(physics);
  const pusher = new Pusher(physics);
  const coinPool = new CoinPool(physics);
  const valuablePool = new ValuablePool(physics);
  const trayMeshes = new TrayMeshes(renderer.scene, tray);
  const pusherMesh = new PusherMesh(renderer.scene, pusher);
  const coinInstances = new CoinInstances(renderer.scene);
  const valuableMeshes = new ValuableMeshes(renderer.scene, valuablePool);
  const confetti = new Confetti(renderer.scene);
  void trayMeshes;

  const state = new GameState();
  const winZone = new WinZone(tray, coinPool, state, valuablePool, (x, y, z) => {
    confetti.burst(x, y, z);
    if (audioArmed) audio.playValuable();
    clarity.event('valuable_win');
    clarity.incrementTag('valuables_won_total');
  });

  // Invariant: the number of physical coins inside the collection bin equals
  // `state.coinBank` (the HUD counter). Maintained by:
  //   - prefillBinToBank() — at session start, on Continue top-up, and on Resume
  //   - winZone.handleSensor() — wins add a coin to the bin AND the bank
  //   - releaseOneBinCoinPerDrop() — every player drop releases one bin coin
  const prefillBinToBank = (count: number): void => {
    // The physical bin is capped; the bank counter is unbounded. Spawn only
    // up to the remaining cap; the rest of the bank exists as the counter
    // alone (and is visible via the bin's count label).
    const remaining = WinZone.BIN_PHYSICAL_CAP - winZone.binCoinCount;
    if (remaining <= 0) return;
    const toSpawn = Math.min(count, remaining);
    if (toSpawn <= 0) return;
    const slots = tray.prefillBin(coinPool, toSpawn);
    for (const slot of slots) {
      winZone.addBinCoin(slot.index);
      // These coins are synthetic — they didn't cross the win sensor, so
      // their inevitable contact with the bin floor must NOT play a clink.
      // Pre-mark their collider handles as already-clinked so the contact
      // handler suppresses the landing sound.
      clinkedCoinHandles.add(slot.colliderHandle);
    }
  };
  const releaseOneBinCoinPerDrop = (spawnedCount: number): void => {
    for (let i = 0; i < spawnedCount; i += 1) winZone.releaseOneBinCoin();
  };
  const drops = new DropSlots(
    state,
    coinPool,
    (spawnedCount, slotId) => {
      armAudio();
      audio.playCoinDrop();
      releaseOneBinCoinPerDrop(spawnedCount);
      sessionDropCount += spawnedCount;
      sessionSlotTaps[slotId] += 1;
      clarity.incrementTag(`slot_taps_${slotId}`);
      if (sessionFirstDropMs < 0 && sessionStartMs > 0) {
        sessionFirstDropMs = Math.round(performance.now() - sessionStartMs);
        clarity.set('time_to_first_drop_ms', sessionFirstDropMs);
      }
    },
    (slotId, reason) => {
      // Rage-tap signal: rapid failed taps while broke. Cooldown-rejections
      // are normal (the player is mashing on purpose) so we ignore them.
      void slotId;
      if (reason !== 'broke') return;
      const now = performance.now();
      rageTapTimes.push(now);
      while (rageTapTimes.length > 0 && now - (rageTapTimes[0] as number) > RAGE_WINDOW_MS) {
        rageTapTimes.shift();
      }
      if (
        rageTapTimes.length >= RAGE_THRESHOLD &&
        now - lastRageTapAtMs >= RAGE_COOLDOWN_MS
      ) {
        lastRageTapAtMs = now;
        clarity.event('rage_tap');
        clarity.incrementTag('rage_taps_total');
      }
    },
  );
  const loop = new GameLoop(physics, renderer);

  const saveStore = new SaveStore();
  const saveScheduler = new SaveScheduler(physics, () => {
    const payload = buildSaveState(state, coinPool, valuablePool, performance.now());
    saveStore.save(payload);
  });
  state.setSaveCallback(() => saveScheduler.scheduleSave());

  const hud = new Hud(overlay);
  hud.attach(state);
  hud.hide();

  // Mute button is always visible (Home, Playing, Game Over) so the player
  // can silence audio at any time. It is mounted inside the HUD next to the
  // Coins counter; the HUD root stays present even when its data rows are
  // hidden so the mute toggle remains accessible. State is persisted to
  // localStorage.
  const muteButton = new MuteButton(hud.getMuteSlot(), audio, (muted) => {
    clarity.event(muted ? 'mute_on' : 'mute_off');
    clarity.incrementTag('mute_toggles_total');
  });
  void muteButton;

  const slotButtons = new DropSlotButtons(overlay, drops, renderer);
  slotButtons.hide();

  // Press-and-drag anywhere on the screen "shoves" the cabinet (pinball-
  // style nudge) — every active coin gets an opposite-direction velocity
  // bump, the camera briefly shifts in the drag direction, and shove.ogg
  // plays. The gesture is tracked at the window level so it co-exists with
  // the drop-slot tap zones (tap = drop, press-and-drag = shove).
  const shoveMeter = new ShoveMeter(overlay);
  shoveMeter.hide();
  const shoveGesture = new ShoveGesture(coinPool, audio, renderer, shoveMeter, () => {
    clarity.event('shove');
    clarity.incrementTag('shoves_used_total');
  });

  const startFreshSession = (): void => {
    for (const slot of [...coinPool.active()]) coinPool.releaseByIndex(slot.index);
    for (const slot of [...valuablePool.active()]) valuablePool.releaseByIndex(slot.index);
    winZone.reset();
    confetti.reset();
    saveStore.clear();
    state.beginFreshSession();
    tray.placeValuables(valuablePool);
    resetAudioArming();
    const prefill = tray.prefillCoins(coinPool);
    window.setTimeout(prefill.startRain, prefill.rainDelayMs);
    prefillBinToBank(state.coinBank);
    clarity.incrementTag('games_played');
    clarity.event('session_start');
    resetSessionMetrics(state.coinBank);
  };

  const gameOver = new GameOverOverlay(overlay, {
    onPlayAgain: startFreshSession,
    onContinue() {
      const previousBank = state.coinBank;
      state.applyContinueTopUp();
      const delta = state.coinBank - previousBank;
      if (delta > 0) prefillBinToBank(delta);
      clarity.incrementTag('continues_used');
      clarity.event('continue');
    },
  });
  gameOver.attach(state);

  const congrats = new CongratsOverlay(overlay, {
    onPlayAgain: startFreshSession,
  });
  congrats.attach(state);

  loop.onPreStep((stepMs) => {
    pusher.update(stepMs);
  });
  loop.onAfterSteps(() => {
    // Per-frame (not per-substep) work: side-fall-off cleanup, game-over
    // poll, and pose-write into the GPU instance buffer. Doing these once
    // after all substeps collapses Rapier WASM crossings from
    // (active_count × substeps) to (active_count) per frame.
    winZone.stepSideFallOff();
    if (state.mode === 'playing' && state.coinBank === 0 && coinPool.allAtRest()) {
      state.triggerGameOver();
    }
    pusherMesh.syncRender();
    coinInstances.syncRender(coinPool);
    valuableMeshes.syncRender(valuablePool);
  });
  loop.onSensor((e) => {
    winZone.handleSensor(e);
  });
  loop.onContact((c) => {
    if (!audioArmed) return;
    // After moving COLLISION_EVENTS to the bin floor + win sensor only, contact
    // events are emitted exclusively when a coin/valuable touches the bin
    // floor. Coin-on-coin contacts no longer fire, so we don't need to filter
    // them out here.
    const coin = coinPool.findByColliderHandle(c.handleA) ?? coinPool.findByColliderHandle(c.handleB);
    if (!coin) return;
    const otherHandle = c.handleA === coin.colliderHandle ? c.handleB : c.handleA;
    if (otherHandle === tray.handles.binFloorHandle) {
      if (clinkedCoinHandles.has(coin.colliderHandle)) return;
      clinkedCoinHandles.add(coin.colliderHandle);
      audio.playClink();
    }
  });
  loop.onRender((dtMs) => {
    confetti.update(dtMs);
    shoveGesture.update(dtMs);
    shoveMeter.update(dtMs);
    if (state.mode === 'playing') recordFrameMs(dtMs);
  });

  // Coins that win at the front sensor stay as physics bodies and pile up
  // in the bin — there is no separate visual pile to keep in sync. The HUD
  // shows the running bank counter; the bin's accumulating coins are a
  // physical reflection of wins this session.
  state.subscribe((s) => {
    if (s.mode === 'playing') slotButtons.show();
    else slotButtons.hide();
  });
  state.subscribe((s) => {
    trayMeshes.setCoinCount(s.coinBank);
  });
  state.subscribe((s) => {
    if (s.mode === 'playing' && s.coinBank > sessionPeakBank) sessionPeakBank = s.coinBank;
  });

  // Session-end analytics: fire once per transition into a terminal state.
  // `upgrade()` flags wins as priority recordings (Clarity caps these per day,
  // so we reserve it for the most informative sessions).
  let lastReportedMode: typeof state.mode = state.mode;
  state.subscribe((s) => {
    if (s.mode === lastReportedMode) return;
    if (s.mode === 'gameOver') {
      flushSessionMetrics('game_over');
    } else if (s.mode === 'won') {
      flushSessionMetrics('won');
      clarity.incrementTag('games_won_total');
      clarity.upgrade('game_won');
    }
    lastReportedMode = s.mode;
  });

  const existingSave = saveStore.load();

  const home = new HomeScreen(overlay, {
    onStart() {
      audio.resume();
      saveStore.clear();
      for (const slot of [...coinPool.active()]) coinPool.releaseByIndex(slot.index);
      for (const slot of [...valuablePool.active()]) valuablePool.releaseByIndex(slot.index);
      winZone.reset();
      confetti.reset();
      state.beginFreshSession();
      tray.placeValuables(valuablePool);
      resetAudioArming();
      const prefill = tray.prefillCoins(coinPool);
      window.setTimeout(prefill.startRain, prefill.rainDelayMs);
      prefillBinToBank(state.coinBank);
      home.hide();
      hud.show();
      shoveMeter.show();
      loop.start();
      clarity.incrementTag('games_played');
      clarity.event('session_start');
      resetSessionMetrics(state.coinBank);
    },
    onResume() {
      audio.resume();
      const save = saveStore.load();
      if (!save) return;
      winZone.reset();
      confetti.reset();
      resetAudioArming();
      try {
        restoreFromSave(save, coinPool, pusher, state, valuablePool);
      } catch (err) {
        // Save schema drifted or a body refused to spawn — surface via
        // Clarity, wipe the bad save, and fall back to a fresh session so
        // the player is never stuck on a broken resume.
        console.error('[pushy] restore failed', err);
        clarity.event('save_restore_failed');
        clarity.incrementTag('save_restore_failed_total');
        saveStore.clear();
        startFreshSession();
        home.hide();
        hud.show();
        shoveMeter.show();
        loop.start();
        return;
      }
      // The save only persists bank + valuables counters and free body poses,
      // not bin-membership. Re-establish the invariant by spawning a bin pile
      // sized to the restored bank counter.
      prefillBinToBank(state.coinBank);
      home.hide();
      hud.show();
      shoveMeter.show();
      loop.start();
      clarity.incrementTag('sessions_resumed');
      clarity.event('session_resume');
      resetSessionMetrics(state.coinBank);
    },
  });
  home.setResumeEnabled(existingSave !== null);

  Object.assign(window as unknown as Record<string, unknown>, {
    __pushy: { renderer, physics, state, loop, resize, coinPool, drops, pusher, saveStore },
  });
}

main().catch((err) => {
  console.error('[pushy] fatal during bootstrap', err);
});
