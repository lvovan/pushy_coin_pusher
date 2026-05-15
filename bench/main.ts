/**
 * 200-coin performance bench (T076).
 *
 * Bypasses Home/HUD. Spawns 200 coins from random slots at startup and renders
 * a rolling FPS readout. Used for the manual Performance Gate (quickstart §7).
 */
import { CoinPool } from '../src/game/CoinPool';
import { GameLoop } from '../src/game/GameLoop';
import { PhysicsWorld } from '../src/game/PhysicsWorld';
import { Pusher } from '../src/game/Pusher';
import { Tray } from '../src/game/Tray';
import { CoinInstances } from '../src/render/CoinInstances';
import { installLighting } from '../src/render/Lighting';
import { Renderer } from '../src/render/Renderer';
import { ResizeManager } from '../src/render/ResizeManager';

const COIN_COUNT = 200;
const SPAWN_HEIGHT = 0.3;
const SPREAD_X = 0.5;
const SPREAD_Z = 0.4;
const FPS_WINDOW_MS = 500;

async function main(): Promise<void> {
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const fpsEl = document.getElementById('fps') as HTMLDivElement;
  const renderer = new Renderer(canvas);
  void new ResizeManager(renderer);
  installLighting(renderer.scene);

  const physics = await PhysicsWorld.create();
  const tray = new Tray(physics);
  void tray;
  const pusher = new Pusher(physics);
  const coinPool = new CoinPool(physics);
  const coinInstances = new CoinInstances(renderer.scene);

  for (let i = 0; i < COIN_COUNT; i += 1) {
    const x = (Math.random() - 0.5) * SPREAD_X;
    const z = (Math.random() - 0.5) * SPREAD_Z;
    coinPool.spawn(x, SPAWN_HEIGHT + i * 0.005, z);
  }

  const loop = new GameLoop(physics, renderer);
  loop.onPreStep((dt) => pusher.update(dt));
  loop.onRender(() => coinInstances.syncRender(coinPool));

  let frames = 0;
  let lastWindowMs = performance.now();
  loop.onRender(() => {
    frames += 1;
    const now = performance.now();
    if (now - lastWindowMs >= FPS_WINDOW_MS) {
      const fps = (frames * 1000) / (now - lastWindowMs);
      fpsEl.textContent = `${fps.toFixed(1)} fps  (${coinPool.activeCount} coins)`;
      frames = 0;
      lastWindowMs = now;
    }
  });
  loop.start();
}

void main();
