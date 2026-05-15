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
import { installLighting } from './render/Lighting';
import { PusherMesh } from './render/PusherMesh';
import { Renderer } from './render/Renderer';
import { ResizeManager } from './render/ResizeManager';
import { TrayMeshes } from './render/TrayMeshes';
import { ValuableMeshes } from './render/ValuableMeshes';
import { DropSlotButtons } from './ui/DropSlotButtons';
import { GameOverOverlay } from './ui/GameOverOverlay';
import { HomeScreen } from './ui/HomeScreen';
import { Hud } from './ui/Hud';
import { MuteButton } from './ui/MuteButton';

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
  const resetAudioArming = (): void => {
    audioArmed = false;
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
  void trayMeshes;

  const state = new GameState();
  const winZone = new WinZone(tray, coinPool, state, valuablePool);

  // Invariant: the number of physical coins inside the collection bin equals
  // `state.coinBank` (the HUD counter). Maintained by:
  //   - prefillBinToBank() — at session start, on Continue top-up, and on Resume
  //   - winZone.handleSensor() — wins add a coin to the bin AND the bank
  //   - releaseOneBinCoinPerDrop() — every player drop releases one bin coin
  const prefillBinToBank = (count: number): void => {
    const indices = tray.prefillBin(coinPool, count);
    for (const i of indices) winZone.addBinCoin(i);
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
  // can silence audio at any time. State is persisted to localStorage.
  const muteButton = new MuteButton(overlay, audio);
  void muteButton;

  const slotButtons = new DropSlotButtons(overlay, drops, renderer);
  slotButtons.hide();

  const gameOver = new GameOverOverlay(overlay, {
    onPlayAgain() {
      for (const slot of [...coinPool.active()]) coinPool.releaseByIndex(slot.index);
      for (const slot of [...valuablePool.active()]) valuablePool.releaseByIndex(slot.index);
      winZone.reset();
      saveStore.clear();
      state.beginFreshSession();
      tray.placeValuables(valuablePool);
      resetAudioArming();
      tray.prefillCoins(coinPool);
      prefillBinToBank(state.coinBank);
    },
    onContinue() {
      const previousBank = state.coinBank;
      state.applyContinueTopUp();
      const delta = state.coinBank - previousBank;
      if (delta > 0) prefillBinToBank(delta);
    },
  });
  gameOver.attach(state);

  loop.onPreStep((stepMs) => {
    pusher.update(stepMs);
  });
  loop.onPostStep(() => {
    winZone.stepSideFallOff();
    if (state.mode === 'playing' && state.coinBank === 0 && coinPool.allAtRest()) {
      state.triggerGameOver();
    }
  });
  loop.onSensor((e) => {
    winZone.handleSensor(e);
  });
  loop.onContact((c) => {
    if (!audioArmed) return;
    const coinA = coinPool.findByColliderHandle(c.handleA);
    const coinB = coinPool.findByColliderHandle(c.handleB);
    // Bin-landing clink: exactly one side is a coin, the other is the bin floor.
    if (coinA && coinB) return;
    const coin = coinA ?? coinB;
    if (!coin) return;
    const otherHandle = coinA ? c.handleB : c.handleA;
    if (otherHandle === tray.handles.binFloorHandle) {
      audio.playClink();
    }
  });
  loop.onRender(() => {
    pusherMesh.sync();
    coinInstances.syncFromPool(coinPool);
    valuableMeshes.syncFromPool(valuablePool);
  });

  // Coins that win at the front sensor stay as physics bodies and pile up
  // in the bin — there is no separate visual pile to keep in sync. The HUD
  // shows the running bank counter; the bin's accumulating coins are a
  // physical reflection of wins this session.
  state.subscribe((s) => {
    if (s.mode === 'playing') slotButtons.show();
    else slotButtons.hide();
  });

  const existingSave = saveStore.load();

  const home = new HomeScreen(overlay, {
    onStart() {
      audio.resume();
      saveStore.clear();
      for (const slot of [...coinPool.active()]) coinPool.releaseByIndex(slot.index);
      for (const slot of [...valuablePool.active()]) valuablePool.releaseByIndex(slot.index);
      winZone.reset();
      state.beginFreshSession();
      tray.placeValuables(valuablePool);
      resetAudioArming();
      tray.prefillCoins(coinPool);
      prefillBinToBank(state.coinBank);
      home.hide();
      hud.show();
      loop.start();
    },
    onResume() {
      audio.resume();
      const save = saveStore.load();
      if (!save) return;
      winZone.reset();
      resetAudioArming();
      restoreFromSave(save, coinPool, pusher, state, valuablePool);
      // The save only persists bank + valuables counters and free body poses,
      // not bin-membership. Re-establish the invariant by spawning a bin pile
      // sized to the restored bank counter.
      prefillBinToBank(state.coinBank);
      home.hide();
      hud.show();
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
