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
   * Pre-populate the playfield at the start of a fresh session. Runs in
   * two phases so the towers can settle under gravity BEFORE the rain
   * starts (otherwise falling scatter coins kick the topmost rings off
   * the towers as they land):
   *
   *   (1) build the two coin towers immediately and return — the caller
   *       starts the physics loop and the towers settle in place;
   *   (2) the returned `startRain()` callback is invoked by the caller
   *       after `rainDelayMs` of simulation has elapsed, at which point
   *       the remaining coins are spawned high above the playfield with
   *       positions rejection-sampled to avoid landing directly on a
   *       tower footprint.
   *
   * Tower construction — "Coin Tower (Interleaved Stack)": every layer
   * consists of three coins arranged in an equilateral triangle around
   * the tower's vertical axis. Each successive layer is rotated 30°
   * relative to the one below, producing an interleaved lattice that is
   * markedly more stable than a naïve same-orientation stack while
   * keeping a tall, narrow profile (footprint roughly two coin diameters
   * across, regardless of height). The total coin budget per surface is
   * preserved from the previous pyramid construction (14 on the pusher,
   * 140 on the plate). Deterministic per `placementSeed + 2`.
   */
  prefillCoins(coinPool: CoinPool): {
    towersPlaced: number;
    rainDelayMs: number;
    startRain: () => number;
  } {
    // Coin counts per construction — preserved from the previous pyramid
    // layout (3-layer pusher pyramid = 14 coins, 7-layer plate pyramid =
    // 140 coins) so the total prefill budget is unchanged at 154 coins.
    const PUSHER_TOWER_COIN_COUNT = 14;
    const PLATE_TOWER_COIN_COUNT = 140;
    // Pusher top surface Y derived from Pusher.ts geometry
    // (PUSHER_HEIGHT - PUSHER_FLOOR_EMBED).
    const PUSHER_TOP_SURFACE_Y = 0.02875;
    // Tower footprint is independent of height — three coins on a ring
    // of radius RING_SCALE × coinRadius, so the footprint half-extent is
    // (RING_SCALE + 1) × coinRadius. With RING_SCALE = 1.2 and a coin
    // radius of 0.0225 m, the footprint half-extent is ≈ 0.0495 m. That
    // makes the tower far narrower than the old 7-layer pyramid base
    // (≈ 0.161 m half-extent), so the centre placement windows can be
    // generous.
    //
    // Pusher visible top at phase 0 is z ∈ [-0.24, -0.10]. With a tower
    // footprint half ≈ 0.05 m and 0.01 m clearance, centre is constrained
    // to z ∈ [-0.18, -0.16].
    const PUSHER_TOWER_Z_MIN = -0.18;
    const PUSHER_TOWER_Z_MAX = -0.16;
    // Plate centre window: in front of the pusher's phase-0 front face
    // (z = -0.1) and inside the tray's front edge (z = +0.25), with
    // footprint clearance. The pusher will reach the tower's back during
    // peak stroke (front at z = 0) and topple it — same arcade behaviour
    // the pyramid had, only the tower scatters into a longer lattice.
    const PLATE_TOWER_Z_MIN = 0.07;
    const PLATE_TOWER_Z_MAX = 0.18;
    const TOWER_EDGE_MARGIN = 0.02;
    // Lift each tower base slightly above its surface so the bottom layer
    // settles cleanly under gravity once the loop starts.
    const PUSHER_TOWER_LIFT = 0.002;
    const PLATE_TOWER_LIFT = 0.002;
    // Scatter coins spawn high above the playfield so the falling animation
    // is clearly visible after the loop starts.
    const SCATTER_MARGIN = 0.03;
    const SCATTER_MIN_Y = 0.3;
    const SCATTER_Y_RANGE = 0.6;
    // Keep-out band around each tower footprint when sampling scatter
    // positions. Tower footprint is tiny compared to the old pyramids,
    // so the playfield has plenty of free area; a small margin (one coin
    // radius) is plenty.
    const TOWER_KEEP_OUT_MARGIN = 0.01;
    // Per-coin rejection-sampling budget. With towers occupying ~3% of
    // the playfield, P(all 32 samples land on a tower) ≈ 0.03^32 ≈ 10⁻⁵¹.
    // If the budget is ever exhausted we STOP spawning rather than fall
    // back to placing a coin on top of a tower, satisfying the contract
    // that no scatter coin ever falls directly onto a tower.
    const SCATTER_MAX_RETRIES = 32;
    const SEED_OFFSET = 2;
    // Delay between tower placement and rain start. The caller starts
    // the physics loop immediately after `prefillCoins` returns; this
    // window gives the towers time to settle on their supporting
    // surfaces under gravity before the first scatter coin lands. 600 ms
    // is enough for the 2 mm settle drop to complete and any low-energy
    // ring jitter to damp out, while still feeling snappy to the player.
    const RAIN_DELAY_MS = 600;

    const rng: Rng = createRng(gameBalance.valuables.placementSeed + SEED_OFFSET);
    const count = gameBalance.spawning.initialPileCount;
    const cr = gameBalance.physics.coinRadius;
    const ct = gameBalance.physics.coinThickness;
    const towerFootprintHalf = this.coinTowerFootprintHalf(cr);

    // Pick a random centre for each tower such that the entire footprint
    // remains inside its surface plus a small edge margin.
    const pusherX = rng.range(
      -this.halfWidth + towerFootprintHalf + TOWER_EDGE_MARGIN,
      this.halfWidth - towerFootprintHalf - TOWER_EDGE_MARGIN,
    );
    const pusherZ = rng.range(PUSHER_TOWER_Z_MIN, PUSHER_TOWER_Z_MAX);
    const plateX = rng.range(
      -this.halfWidth + towerFootprintHalf + TOWER_EDGE_MARGIN,
      this.halfWidth - towerFootprintHalf - TOWER_EDGE_MARGIN,
    );
    const plateZ = rng.range(PLATE_TOWER_Z_MIN, PLATE_TOWER_Z_MAX);

    // (1) Build both towers immediately.
    let towersPlaced = 0;
    const pusherBudget = Math.min(PUSHER_TOWER_COIN_COUNT, count - towersPlaced);
    towersPlaced += this.placeCoinTower(
      coinPool,
      pusherX,
      pusherZ,
      PUSHER_TOP_SURFACE_Y + PUSHER_TOWER_LIFT,
      cr,
      ct,
      pusherBudget,
    );
    const plateBudget = Math.min(PLATE_TOWER_COIN_COUNT, count - towersPlaced);
    towersPlaced += this.placeCoinTower(
      coinPool,
      plateX,
      plateZ,
      this.floorY + PLATE_TOWER_LIFT,
      cr,
      ct,
      plateBudget,
    );

    // (2) Deferred rain. The caller invokes this after RAIN_DELAY_MS of
    // simulation has elapsed so the towers settle before scatter coins
    // start landing.
    const xMin = -this.halfWidth + SCATTER_MARGIN;
    const xMax = this.halfWidth - SCATTER_MARGIN;
    const zMin = -this.halfDepth + SCATTER_MARGIN;
    const zMax = this.halfDepth - SCATTER_MARGIN;
    const keepRadius = towerFootprintHalf + TOWER_KEEP_OUT_MARGIN;
    const keepRadiusSq = keepRadius * keepRadius;
    const startRain = (): number => {
      // Tower coins keep gravityScale=0 indefinitely so the lattice
      // NEVER rains. Only the scatter coins spawned below are subject
      // to gravity. When the pusher eventually shoves a tower coin into
      // the win zone, WinZone.handleSensor restores its gravity so it
      // falls into the bin like any other winning coin.
      let placed = towersPlaced;
      while (placed < count) {
        let sx = 0;
        let sz = 0;
        let accepted = false;
        for (let r = 0; r < SCATTER_MAX_RETRIES; r += 1) {
          sx = rng.range(xMin, xMax);
          sz = rng.range(zMin, zMax);
          const dxp = sx - pusherX;
          const dzp = sz - pusherZ;
          const dxq = sx - plateX;
          const dzq = sz - plateZ;
          const inPusher = dxp * dxp + dzp * dzp < keepRadiusSq;
          const inPlate = dxq * dxq + dzq * dzq < keepRadiusSq;
          if (!inPusher && !inPlate) {
            accepted = true;
            break;
          }
        }
        if (!accepted) break;
        const y = SCATTER_MIN_Y + rng.next() * SCATTER_Y_RANGE;
        const coin = coinPool.spawn(sx, y, sz);
        if (!coin) break;
        placed += 1;
      }
      return placed - towersPlaced;
    };

    return { towersPlaced, rainDelayMs: RAIN_DELAY_MS, startRain };
  }

  /**
   * Half-extent of a coin tower's footprint in XZ (radius of the bounding
   * circle, used for surface-clearance maths and scatter keep-out). With
   * three coins on a ring of radius RING_SCALE × coinRadius, the outer
   * extent is (RING_SCALE + 1) × coinRadius.
   */
  private coinTowerFootprintHalf(coinRadius: number): number {
    const RING_SCALE = 1.2;
    return coinRadius * (RING_SCALE + 1);
  }

  /**
   * Build a "Coin Tower (Interleaved Stack)" of up to `count` coins at
   * (centerX, baseY, centerZ). Each layer holds three coins arranged in
   * an equilateral triangle around the central axis at radius
   * RING_SCALE × coinRadius. Layer k is rotated 30° relative to layer
   * k - 1, producing an interleaved lattice (a fresh layer is rotated
   * 30°, 60°, 90°, … relative to the bottom). The final layer may be a
   * partial ring if `count` is not a multiple of 3.
   *
   * Stability: an interleaved 3-coin stack is geometrically stable only
   * in the analytic sense — every real-time solver step introduces tiny
   * positional jitter, and with dozens of layers stacked the cumulative
   * normal-force impulses cause the lattice to creep apart and collapse
   * on its own under gravity. To preserve the tower as a *structure*
   * (it must be there from t = 0 and never rain) we set each tower
   * coin's gravity scale to 0. The bodies remain dynamic, so the pusher
   * and scatter coins can still nudge them, but gravity never tugs on
   * the lattice and the tower stays put indefinitely.
   *
   * Returns the number of coins actually placed.
   */
  private placeCoinTower(
    coinPool: CoinPool,
    centerX: number,
    centerZ: number,
    baseY: number,
    coinRadius: number,
    coinThickness: number,
    count: number,
  ): number {
    const RING_SCALE = 1.2;
    const COINS_PER_LAYER = 3;
    const LAYER_ROT_RAD = Math.PI / 6; // @no-magic-ok 30° per layer
    const FULL_TURN_RAD = Math.PI * 2;
    const LAYER_GAP = 0.001;
    const LIFT = 0.003;
    const ringRadius = coinRadius * RING_SCALE;
    const layerStep = coinThickness + LAYER_GAP;
    const angleStep = FULL_TURN_RAD / COINS_PER_LAYER;
    let placed = 0;
    let layer = 0;
    while (placed < count) {
      const y = baseY + LIFT + coinThickness * HALF + layer * layerStep;
      const baseAngle = layer * LAYER_ROT_RAD;
      for (let k = 0; k < COINS_PER_LAYER && placed < count; k += 1) {
        const a = baseAngle + k * angleStep;
        const x = centerX + Math.cos(a) * ringRadius;
        const z = centerZ + Math.sin(a) * ringRadius;
        const coin = coinPool.spawn(x, y, z);
        if (!coin) return placed;
        // Gravity-immune so the lattice never collapses on its own.
        coin.body.setGravityScale(0, true);
        placed += 1;
      }
      layer += 1;
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
