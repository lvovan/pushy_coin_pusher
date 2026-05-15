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

async function main(): Promise<void> {
  const canvas = document.getElementById('stage');
  const overlay = document.getElementById('overlay');
  if (!(canvas instanceof HTMLCanvasElement) || !overlay) {
    throw new Error('Missing #stage canvas or #overlay div');
  }

  const renderer = new Renderer(canvas);
  const resize = new ResizeManager(renderer);
  installLighting(renderer.scene);

  const audio = new AudioBus();
  void audio.init();

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
  const drops = new DropSlots(state, coinPool, () => audio.playCoinDrop());
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

  const slotButtons = new DropSlotButtons(overlay, drops, renderer);
  slotButtons.hide();

  const gameOver = new GameOverOverlay(overlay, {
    onPlayAgain() {
      for (const slot of [...coinPool.active()]) coinPool.releaseByIndex(slot.index);
      for (const slot of [...valuablePool.active()]) valuablePool.releaseByIndex(slot.index);
      saveStore.clear();
      state.beginFreshSession();
      tray.placeValuables(valuablePool);
      tray.prefillCoins(coinPool);
    },
    onContinue() {
      state.applyContinueTopUp();
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
    if (coinPool.findByColliderHandle(c.handleA) && coinPool.findByColliderHandle(c.handleB)) {
      audio.playClink();
    }
  });
  loop.onRender(() => {
    pusherMesh.sync();
    coinInstances.syncFromPool(coinPool);
    valuableMeshes.syncFromPool(valuablePool);
  });

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
      state.beginFreshSession();
      tray.placeValuables(valuablePool);
      tray.prefillCoins(coinPool);
      home.hide();
      hud.show();
      loop.start();
    },
    onResume() {
      audio.resume();
      const save = saveStore.load();
      if (!save) return;
      restoreFromSave(save, coinPool, pusher, state, valuablePool);
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
