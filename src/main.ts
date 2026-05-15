/**
 * Pushy — application bootstrap (Phase 4 wiring).
 */
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
  });

  // Invariant: the number of physical coins inside the collection bin equals
  // `state.coinBank` (the HUD counter). Maintained by:
  //   - prefillBinToBank() — at session start, on Continue top-up, and on Resume
  //   - winZone.handleSensor() — wins add a coin to the bin AND the bank
  //   - releaseOneBinCoinPerDrop() — every player drop releases one bin coin
  const prefillBinToBank = (count: number): void => {
    const slots = tray.prefillBin(coinPool, count);
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
  const drops = new DropSlots(state, coinPool, (spawnedCount) => {
    armAudio();
    audio.playCoinDrop();
    releaseOneBinCoinPerDrop(spawnedCount);
  });
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
  const muteButton = new MuteButton(hud.getMuteSlot(), audio);
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
  const shoveGesture = new ShoveGesture(coinPool, audio, renderer, shoveMeter);

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
  };

  const gameOver = new GameOverOverlay(overlay, {
    onPlayAgain: startFreshSession,
    onContinue() {
      const previousBank = state.coinBank;
      state.applyContinueTopUp();
      const delta = state.coinBank - previousBank;
      if (delta > 0) prefillBinToBank(delta);
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
    },
    onResume() {
      audio.resume();
      const save = saveStore.load();
      if (!save) return;
      winZone.reset();
      confetti.reset();
      resetAudioArming();
      restoreFromSave(save, coinPool, pusher, state, valuablePool);
      // The save only persists bank + valuables counters and free body poses,
      // not bin-membership. Re-establish the invariant by spawning a bin pile
      // sized to the restored bank counter.
      prefillBinToBank(state.coinBank);
      home.hide();
      hud.show();
      shoveMeter.show();
      loop.start();
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
