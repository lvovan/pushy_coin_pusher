/**
 * Performance bench. Bypasses Home/HUD and spawns N coins from random slots
 * at startup, then renders a rolling FPS + body-count readout.
 *
 * Coin count is read from the `?coins=N` query parameter (default = the
 * configured `initialPileCount`, so the bench matches what a fresh game
 * session actually runs). Pass `?coins=500` to stress-test beyond the
 * pool cap; the spawn loop stops cleanly at pool exhaustion.
 */
import { gameBalance } from '../src/config/gameBalance';
import { CoinPool } from '../src/game/CoinPool';
import { GameLoop } from '../src/game/GameLoop';
import { PhysicsWorld } from '../src/game/PhysicsWorld';
import { Pusher } from '../src/game/Pusher';
import { Tray } from '../src/game/Tray';
import { CoinInstances } from '../src/render/CoinInstances';
import { installLighting } from '../src/render/Lighting';
import { Renderer } from '../src/render/Renderer';
import { ResizeManager } from '../src/render/ResizeManager';

const SPAWN_HEIGHT = 0.3;
const SPREAD_X = 0.5;
const SPREAD_Z = 0.4;
const FPS_WINDOW_MS = 500;

function targetCoinCount(): number {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('coins');
  if (raw !== null) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return gameBalance.spawning.initialPileCount;
}

async function main(): Promise<void> {
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const fpsEl = document.getElementById('fps') as HTMLDivElement;
  const renderer = new Renderer(canvas);
  void new ResizeManager(renderer);
  installLighting(renderer.scene, renderer.renderer);

  const physics = await PhysicsWorld.create();
  const tray = new Tray(physics);
  void tray;
  const pusher = new Pusher(physics);
  const coinPool = new CoinPool(physics);
  const coinInstances = new CoinInstances(renderer.scene);

  const target = targetCoinCount();
  for (let i = 0; i < target; i += 1) {
    const x = (Math.random() - 0.5) * SPREAD_X;
    const z = (Math.random() - 0.5) * SPREAD_Z;
    const ok = coinPool.spawn(x, SPAWN_HEIGHT + i * 0.005, z);
    if (!ok) break;
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
