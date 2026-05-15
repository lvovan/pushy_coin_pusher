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
// Slanted retaining ramp along the plate's front (player-facing) edge: a
// thin gently-tilted slab whose back-top edge meets the plate's top
// surface flush (seamless) and whose back-bottom edge is hidden inside
// the plate. Coins climbing forward see one continuous ramp rising to a
// small lip at the front, mirroring a real arcade coin pusher's slanted
// plate edge.
const PLATE_LIP_LENGTH = 0.05;
const PLATE_LIP_THICKNESS = 0.0015;
const PLATE_LIP_SLANT_RAD = 0.12; // ~7°

export interface TrayHandles {
  floorHandle: number;
  binFloorHandle: number;
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
  // Top surface of the physical bin floor; awarded coins are released when
  // they settle here so the player sees them land in the bin.
  readonly binFloorY: number;

  constructor(world: PhysicsWorld) {
    const { tray, bin } = gameBalance;
    this.halfWidth = tray.width * HALF;
    this.halfDepth = tray.depth * HALF;
    this.binFloorY = bin.floorY;

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

    // Plate front ramp: thin slanted slab whose back-top edge sits flush
    // with the plate surface and whose back-bottom edge is hidden inside
    // the plate body, producing a seamless join. Rises gently to a small
    // lip at the plate's front edge.
    const plateLipCos = Math.cos(PLATE_LIP_SLANT_RAD);
    const plateLipSin = Math.sin(PLATE_LIP_SLANT_RAD);
    const plateLipSinH = Math.sin(PLATE_LIP_SLANT_RAD * HALF);
    const plateLipCosH = Math.cos(PLATE_LIP_SLANT_RAD * HALF);
    const plateLipCenterY =
      this.floorY -
      PLATE_LIP_THICKNESS * HALF * plateLipCos +
      PLATE_LIP_LENGTH * HALF * plateLipSin;
    const plateLipCenterZ =
      this.halfDepth -
      PLATE_LIP_LENGTH * HALF * plateLipCos +
      PLATE_LIP_THICKNESS * HALF * plateLipSin;
    const plateLipBody = world.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    plateLipBody.setTranslation({ x: 0, y: plateLipCenterY, z: plateLipCenterZ }, true);
    plateLipBody.setRotation({ x: -plateLipSinH, y: 0, z: 0, w: plateLipCosH }, true);
    world.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        this.halfWidth,
        PLATE_LIP_THICKNESS * HALF,
        PLATE_LIP_LENGTH * HALF,
      ).setFriction(gameBalance.physics.coinFriction),
      plateLipBody,
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

    // Bin: physical floor + perimeter walls so awarded coins land inside the
    // collection bin instead of falling through into the void. The bin spans
    // the FULL footprint of the play tray (z=-halfDepth..+halfDepth) and
    // extends further forward by `bin.depth` toward the player, so any coin
    // that falls below the plate — whether off the front edge, by side
    // clipping, or after a sideways bounce — has a physical surface to land
    // on instead of disappearing into the void.
    const binBackZ = -this.halfDepth;
    const binFrontZ = this.halfDepth + bin.depth;
    const binFullDepth = binFrontZ - binBackZ;
    const binCenterZ = (binBackZ + binFrontZ) * HALF;
    const binFloorBody = world.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    binFloorBody.setTranslation(
      { x: 0, y: bin.floorY - WALL_THICKNESS * HALF, z: binCenterZ },
      true,
    );
    const binFloorCol = world.world.createCollider(
      RAPIER.ColliderDesc.cuboid(this.halfWidth, WALL_THICKNESS * HALF, binFullDepth * HALF)
        .setFriction(gameBalance.physics.coinFriction)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      binFloorBody,
    );

    const binWallHalfY = bin.wallHeight * HALF;
    const binWallCenterY = bin.floorY + binWallHalfY;
    const binFrontBody = world.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    binFrontBody.setTranslation(
      { x: 0, y: binWallCenterY, z: binFrontZ - WALL_THICKNESS * HALF },
      true,
    );
    world.world.createCollider(
      RAPIER.ColliderDesc.cuboid(this.halfWidth, binWallHalfY, WALL_THICKNESS * HALF),
      binFrontBody,
    );

    const binBackBody = world.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    binBackBody.setTranslation(
      { x: 0, y: binWallCenterY, z: binBackZ + WALL_THICKNESS * HALF },
      true,
    );
    world.world.createCollider(
      RAPIER.ColliderDesc.cuboid(this.halfWidth, binWallHalfY, WALL_THICKNESS * HALF),
      binBackBody,
    );

    const binLeftBody = world.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    binLeftBody.setTranslation({ x: -this.halfWidth, y: binWallCenterY, z: binCenterZ }, true);
    world.world.createCollider(
      RAPIER.ColliderDesc.cuboid(WALL_THICKNESS * HALF, binWallHalfY, binFullDepth * HALF),
      binLeftBody,
    );

    const binRightBody = world.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    binRightBody.setTranslation({ x: this.halfWidth, y: binWallCenterY, z: binCenterZ }, true);
    world.world.createCollider(
      RAPIER.ColliderDesc.cuboid(WALL_THICKNESS * HALF, binWallHalfY, binFullDepth * HALF),
      binRightBody,
    );

    this.handles = {
      floorHandle: floorCol.handle,
      binFloorHandle: binFloorCol.handle,
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
   * Pre-populate the playfield at the start of a fresh session. Mimics a
   * real arcade coin pusher's initial setup:
   *   (1) compute how many coins each pyramid construction needs;
   *   (2) build the two pyramids first (a small square step-pyramid on the
   *       pusher, a slightly larger one on the plate, each placed at a
   *       random position within its surface);
   *   (3) spawn the remaining coins high above the playfield so the player
   *       sees them rain down — positions are rejection-sampled to avoid
   *       dropping directly onto a pyramid footprint.
   * Pyramid construction follows the classic arcade pattern observed in
   * coin-pusher cabinets: a square footprint where each successive layer
   * shrinks by one position on every side, coins lying flat with layer
   * height equal to one coin thickness. Deterministic per `placementSeed + 2`.
   */
  prefillCoins(coinPool: CoinPool): number {
    const PUSHER_PYRAMID_LAYERS = 3;
    const PLATE_PYRAMID_LAYERS = 4;
    // Pusher top surface Y derived from Pusher.ts geometry
    // (PUSHER_HEIGHT - PUSHER_FLOOR_EMBED).
    const PUSHER_TOP_SURFACE_Y = 0.02875;
    // Random-placement Z ranges per surface. Pusher pyramid stays inside
    // the visible portion of the moving plate (between the back wall and
    // the pusher's front edge at phase 0). Plate pyramid is biased toward
    // the front half so it's clearly visible in front of the pusher.
    const PUSHER_PYRAMID_Z_MIN = -0.2;
    const PUSHER_PYRAMID_Z_MAX = -0.14;
    const PLATE_PYRAMID_Z_MIN = -0.05;
    const PLATE_PYRAMID_Z_MAX = 0.13;
    const PYRAMID_EDGE_MARGIN = 0.02;
    const PYRAMID_SPACING_MULT = 2.05;
    // Lift each pyramid base slightly above its surface so the bottom layer
    // settles cleanly under gravity once the loop starts.
    const PUSHER_PYRAMID_LIFT = 0.002;
    const PLATE_PYRAMID_LIFT = 0.002;
    // Scatter coins spawn high above the playfield so the falling animation
    // is clearly visible after the loop starts.
    const SCATTER_MARGIN = 0.03;
    const SCATTER_MIN_Y = 0.3;
    const SCATTER_Y_RANGE = 0.6;
    // Extra clearance around each pyramid footprint when sampling scatter
    // positions, so dropped coins miss the pyramids rather than knocking
    // them over.
    const PYRAMID_KEEP_OUT_MARGIN = 0.02;
    const SCATTER_MAX_RETRIES = 16;
    const SEED_OFFSET = 2;

    const rng: Rng = createRng(gameBalance.valuables.placementSeed + SEED_OFFSET);
    const count = gameBalance.spawning.initialPileCount;
    const cr = gameBalance.physics.coinRadius;
    const ct = gameBalance.physics.coinThickness;

    // (1) Pyramid sizing — half-extent of the base layer footprint in XZ.
    const spacing = cr * PYRAMID_SPACING_MULT;
    const pusherBaseHalf = (PUSHER_PYRAMID_LAYERS - 1) * spacing * HALF + cr;
    const plateBaseHalf = (PLATE_PYRAMID_LAYERS - 1) * spacing * HALF + cr;

    // Pick a random centre for each pyramid such that the entire footprint
    // remains inside its surface plus a small edge margin.
    const pusherX = rng.range(
      -this.halfWidth + pusherBaseHalf + PYRAMID_EDGE_MARGIN,
      this.halfWidth - pusherBaseHalf - PYRAMID_EDGE_MARGIN,
    );
    const pusherZ = rng.range(PUSHER_PYRAMID_Z_MIN, PUSHER_PYRAMID_Z_MAX);
    const plateX = rng.range(
      -this.halfWidth + plateBaseHalf + PYRAMID_EDGE_MARGIN,
      this.halfWidth - plateBaseHalf - PYRAMID_EDGE_MARGIN,
    );
    const plateZ = rng.range(PLATE_PYRAMID_Z_MIN, PLATE_PYRAMID_Z_MAX);

    // (2) Build both pyramids first.
    let placed = 0;
    placed += this.placePyramid(
      coinPool,
      pusherX,
      pusherZ,
      PUSHER_TOP_SURFACE_Y + PUSHER_PYRAMID_LIFT,
      cr,
      ct,
      PUSHER_PYRAMID_LAYERS,
      count - placed,
    );
    placed += this.placePyramid(
      coinPool,
      plateX,
      plateZ,
      this.floorY + PLATE_PYRAMID_LIFT,
      cr,
      ct,
      PLATE_PYRAMID_LAYERS,
      count - placed,
    );

    // (3) Spawn the remaining coins high above the playfield. Reject
    // positions that fall inside either pyramid's footprint (plus a small
    // keep-out margin) so the rain misses the constructions.
    const xMin = -this.halfWidth + SCATTER_MARGIN;
    const xMax = this.halfWidth - SCATTER_MARGIN;
    const zMin = -this.halfDepth + SCATTER_MARGIN;
    const zMax = this.halfDepth - SCATTER_MARGIN;
    const pusherKeepHalf = pusherBaseHalf + PYRAMID_KEEP_OUT_MARGIN;
    const plateKeepHalf = plateBaseHalf + PYRAMID_KEEP_OUT_MARGIN;
    while (placed < count) {
      let sx = 0;
      let sz = 0;
      for (let r = 0; r < SCATTER_MAX_RETRIES; r += 1) {
        sx = rng.range(xMin, xMax);
        sz = rng.range(zMin, zMax);
        const inPusher =
          Math.abs(sx - pusherX) < pusherKeepHalf && Math.abs(sz - pusherZ) < pusherKeepHalf;
        const inPlate =
          Math.abs(sx - plateX) < plateKeepHalf && Math.abs(sz - plateZ) < plateKeepHalf;
        if (!inPusher && !inPlate) break;
      }
      const y = SCATTER_MIN_Y + rng.next() * SCATTER_Y_RANGE;
      const coin = coinPool.spawn(sx, y, sz);
      if (!coin) break;
      placed += 1;
    }
    return placed;
  }

  /**
   * Place a square-base pyramid of coins, layer L from the bottom holding
   * (layers - L)² coins arranged in a grid of pitch `2.05 × coinRadius`.
   * Each layer is lifted by `coinThickness` plus a small gap so the stack
   * settles cleanly under gravity. Returns the number of coins placed,
   * never exceeding `maxCoins`.
   */
  private placePyramid(
    coinPool: CoinPool,
    centerX: number,
    centerZ: number,
    baseY: number,
    coinRadius: number,
    coinThickness: number,
    layers: number,
    maxCoins: number,
  ): number {
    const SPACING_MULT = 2.05;
    const LAYER_GAP = 0.001;
    const LIFT = 0.003;
    const spacing = coinRadius * SPACING_MULT;
    const layerStep = coinThickness + LAYER_GAP;
    let placed = 0;
    for (let l = 0; l < layers; l += 1) {
      if (placed >= maxCoins) return placed;
      const side = layers - l;
      const halfExtent = (side - 1) * spacing * HALF;
      const y = baseY + LIFT + coinThickness * HALF + l * layerStep;
      for (let i = 0; i < side; i += 1) {
        for (let j = 0; j < side; j += 1) {
          if (placed >= maxCoins) return placed;
          const x = centerX - halfExtent + i * spacing;
          const z = centerZ - halfExtent + j * spacing;
          const coin = coinPool.spawn(x, y, z);
          if (!coin) return placed;
          placed += 1;
        }
      }
    }
    return placed;
  }

  /**
   * Spawn `count` coins inside the collection bin so the bin's physical coin
   * count tracks the player's bank counter. Returns the spawned slot indices
   * so callers (main.ts) can register them with WinZone.binCoins.
   * Deterministic per `placementSeed + 3`.
   */
  prefillBin(coinPool: CoinPool, count: number): number[] {
    const SEED_OFFSET = 3;
    const rng: Rng = createRng(gameBalance.valuables.placementSeed + SEED_OFFSET);
    const { bin } = gameBalance;
    const MARGIN = 0.02;
    const Y_LIFT = 0.02;
    const Y_STACK = 0.15;
    // Spawn only in the visible front portion of the bin (in front of the
    // plate), so the pile the player sees represents their banked coins.
    const xMin = -this.halfWidth + MARGIN;
    const xMax = this.halfWidth - MARGIN;
    const zMin = this.halfDepth + MARGIN;
    const zMax = this.halfDepth + bin.depth - MARGIN;
    const yBase = bin.floorY + Y_LIFT;
    const indices: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const x = rng.range(xMin, xMax);
      const z = rng.range(zMin, zMax);
      const y = yBase + rng.next() * Y_STACK;
      const coin = coinPool.spawn(x, y, z);
      if (!coin) break;
      indices.push(coin.index);
    }
    return indices;
  }
}
