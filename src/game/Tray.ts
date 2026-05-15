/**
 * Tray — static floor, three walls (back, left, right), and a sensor collider
 * just past the front edge that fires the "win zone" enter event (spec FR-001,
 * FR-003).
 */
import RAPIER from '@dimforge/rapier3d-compat';

import { gameBalance } from '../config/gameBalance';
import { createRng, type Rng } from '../util/rng';
import type { CoinPool } from './CoinPool';
import type { PhysicsWorld } from './PhysicsWorld';
import type { ValuablePool } from './ValuablePool';

const HALF = 0.5;
const WALL_THICKNESS = 0.02; // physical wall thickness in meters; not gameplay-balance
const SIDE_LOSS_MARGIN = 0.05;
const SIDE_LOSS_Y = -0.5;

export interface TrayHandles {
  floorHandle: number;
  backWallHandle: number;
  leftWallHandle: number;
  rightWallHandle: number;
  winZoneSensorHandle: number;
}

export class Tray {
  readonly handles: TrayHandles;

  // Static geometry parameters exposed for downstream modules (placement, side-loss check).
  readonly halfWidth: number;
  readonly halfDepth: number;
  readonly floorY = 0;
  readonly sideLossY = SIDE_LOSS_Y;
  readonly sideLossMargin = SIDE_LOSS_MARGIN;

  constructor(world: PhysicsWorld) {
    const { tray } = gameBalance;
    this.halfWidth = tray.width * HALF;
    this.halfDepth = tray.depth * HALF;

    const floorBody = world.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const floorCol = world.world.createCollider(
      RAPIER.ColliderDesc.cuboid(this.halfWidth, WALL_THICKNESS * HALF, this.halfDepth).setFriction(
        gameBalance.physics.coinFriction,
      ),
      floorBody,
    );
    floorBody.setTranslation({ x: 0, y: -WALL_THICKNESS * HALF, z: 0 }, true);

    const wallY = tray.wallHeight * HALF;

    const backBody = world.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    backBody.setTranslation({ x: 0, y: wallY, z: -this.halfDepth }, true);
    const backCol = world.world.createCollider(
      RAPIER.ColliderDesc.cuboid(this.halfWidth, tray.wallHeight * HALF, WALL_THICKNESS * HALF),
      backBody,
    );

    const leftBody = world.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    leftBody.setTranslation({ x: -this.halfWidth, y: wallY, z: 0 }, true);
    const leftCol = world.world.createCollider(
      RAPIER.ColliderDesc.cuboid(WALL_THICKNESS * HALF, tray.wallHeight * HALF, this.halfDepth),
      leftBody,
    );

    const rightBody = world.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    rightBody.setTranslation({ x: this.halfWidth, y: wallY, z: 0 }, true);
    const rightCol = world.world.createCollider(
      RAPIER.ColliderDesc.cuboid(WALL_THICKNESS * HALF, tray.wallHeight * HALF, this.halfDepth),
      rightBody,
    );

    // Win zone: sensor cuboid placed just past the front edge.
    const sensorBody = world.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    sensorBody.setTranslation(
      { x: 0, y: SIDE_LOSS_Y * HALF, z: this.halfDepth + tray.winZoneDepth * HALF },
      true,
    );
    const sensorCol = world.world.createCollider(
      RAPIER.ColliderDesc.cuboid(this.halfWidth, Math.abs(SIDE_LOSS_Y) * HALF, tray.winZoneDepth * HALF)
        .setSensor(true)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      sensorBody,
    );

    this.handles = {
      floorHandle: floorCol.handle,
      backWallHandle: backCol.handle,
      leftWallHandle: leftCol.handle,
      rightWallHandle: rightCol.handle,
      winZoneSensorHandle: sensorCol.handle,
    };
  }

  /**
   * True if a body has fallen off the sides (x out of bounds) or below the kill plane.
   * Used by the per-step side-fall-off pass (FR-009).
   */
  isOutOfPlay(x: number, y: number): boolean {
    if (y < this.sideLossY) return true;
    if (Math.abs(x) > this.halfWidth + this.sideLossMargin) return true;
    return false;
  }

  /**
   * Seed the initial valuable layout (Clarification Q1 — once per session start).
   * Uses gameBalance.valuables.placementSeed so a fresh start is reproducible.
   */
  placeValuables(valuables: ValuablePool): number {
    const rng: Rng = createRng(gameBalance.valuables.placementSeed);
    const count = gameBalance.valuables.initialCount;
    const PLACEMENT_Y = 0.05;
    const PLACEMENT_MARGIN = 0.04;
    const VARIANT_COUNT = 3;
    const usable = {
      xMin: -this.halfWidth + PLACEMENT_MARGIN,
      xMax: this.halfWidth - PLACEMENT_MARGIN,
      zMin: -this.halfDepth + PLACEMENT_MARGIN,
      zMax: this.halfDepth - PLACEMENT_MARGIN,
    };
    let placed = 0;
    for (let i = 0; i < count; i += 1) {
      const variantId = i % VARIANT_COUNT;
      const x = rng.range(usable.xMin, usable.xMax);
      const z = rng.range(usable.zMin, usable.zMax);
      const ok = valuables.spawnVariant(variantId, x, PLACEMENT_Y, z);
      if (ok) placed += 1;
    }
    return placed;
  }

  /**
   * Pre-populate the tray with a random pile of coins at the start of a fresh
   * session. Coins are spawned at varied heights so they settle naturally onto
   * the floor and into a heap. Deterministic per `placementSeed + 2`.
   */
  prefillCoins(coinPool: CoinPool): number {
    const rng: Rng = createRng(gameBalance.valuables.placementSeed + 2);
    const count = gameBalance.spawning.initialPileCount;
    const MARGIN = 0.03;
    const MIN_Y = 0.04;
    const Y_RANGE = 0.5;
    const xMin = -this.halfWidth + MARGIN;
    const xMax = this.halfWidth - MARGIN;
    const zMin = -this.halfDepth + MARGIN;
    const zMax = this.halfDepth - MARGIN;
    let placed = 0;
    for (let i = 0; i < count; i += 1) {
      const x = rng.range(xMin, xMax);
      const z = rng.range(zMin, zMax);
      const y = MIN_Y + rng.next() * Y_RANGE;
      const coin = coinPool.spawn(x, y, z);
      if (!coin) break;
      placed += 1;
    }
    return placed;
  }
}
