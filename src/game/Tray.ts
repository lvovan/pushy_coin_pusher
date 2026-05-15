/**
 * Tray — static floor, three walls (back, left, right), and a sensor collider
 * just past the front edge that fires the "win zone" enter event (spec FR-001,
 * FR-003).
 */
import RAPIER from '@dimforge/rapier3d-compat';

import { gameBalance } from '../config/gameBalance';
import { createRng, type Rng } from '../util/rng';
import type { CoinPool, CoinSlot } from './CoinPool';
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
   * two strictly ordered phases so the pre-built coin towers are stable
   * BEFORE rain begins:
   *
   *   (1) Phase 1 — Deterministic tower construction. Each tower coin is
   *       spawned directly at its final lattice position on top of its
   *       supporting surface (pusher top / plate floor). No coin "rains
   *       down" during this phase. The lattice used is an interleaved
   *       coin-pusher: each layer holds four coins arranged in a 2×2
   *       square (touching, at 90° around a common vertical axis), and
   *       every successive layer is rotated by 45° relative to the one
   *       below. Each upper coin therefore rests symmetrically on its
   *       two adjacent lower coins (45° away on either side), giving a
   *       balanced, lattice-like column that holds its shape under
   *       gravity. Coins spawn AT their final lattice position with
   *       essentially zero drop so no initial momentum is imparted to
   *       the column.
   *
   *   (2) Phase 2 — Controlled rain. After `rainDelayMs` of simulation
   *       has elapsed (caller-scheduled) the returned `startRain()`
   *       callback spawns the remaining coins high above the playfield.
   *       A square no-rain zone is enforced above each tower footprint
   *       (rejection sampling) so a rain coin NEVER spawns directly
   *       above a tower. Once a rain coin lands on the plate or pusher
   *       it is subject to normal physics — it may still bounce sideways
   *       and nudge a tower, which is the desired arcade behaviour.
   *
   * Deterministic per `placementSeed + 2`.
   */
  prefillCoins(coinPool: CoinPool): {
    placedBeforeRain: number;
    rainDelayMs: number;
    startRain: () => number;
  } {
    // Coin-tower sizes — tall, narrow interleaved stacks (4 coins per
    // layer, every layer rotated 45° relative to the one below):
    //   pusher : 14 layers (14 × 4 =  56 coins)
    //   plate  : 28 layers (28 × 4 = 112 coins)
    // Both columns trimmed 30% from their original heights (20 / 40)
    // to free budget for a loose surface scatter on the pusher and
    // plate — coins the player can actually push around immediately
    // instead of locking them inside a tall stack.
    const PUSHER_TOWER_LAYERS = 14;
    const PLATE_TOWER_LAYERS = 28;
    // Pusher top surface Y derived from Pusher.ts geometry
    // (PUSHER_HEIGHT - PUSHER_FLOOR_EMBED).
    const PUSHER_TOP_SURFACE_Y = 0.02875;
    // Random-placement Z ranges per surface. Pusher tower stays inside
    // the visible portion of the moving plate (between the back wall and
    // the pusher's front edge at phase 0). Plate tower is biased toward
    // the front half so it's clearly visible in front of the pusher and
    // stays clear of the plate's slanted front lip.
    //
    // CRITICAL: The plate tower's back edge MUST stay clear of the
    // pusher's FULLY-EXTENDED front face (including the front lip),
    // otherwise the pusher hits the tower on its first forward stroke
    // and topples it. Geometry derived from gameBalance + Pusher.ts:
    //   pusher front face at full extension =
    //     basePositionZ + PUSHER_DEPTH/2 + strokeAmplitude
    //     = -0.325 + 0.225 + 0.1 = 0.00 m
    //   plus PUSHER_LIP_LENGTH ≈ 0.05 m of slanted ramp riding the top
    //     → effective leading edge at full extension ≈ +0.05 m
    // With a tower footprint half-extent of ~0.055 m and a 0.01 m
    // safety margin, the tower centre must satisfy tower_z >= 0.115.
    // On the front side, the plate's flat floor ends at z ≈ +0.20
    // (where the plate's slanted front lip begins), so tower_z must
    // also stay <= 0.20 − 0.055 − 0.01 ≈ 0.135 to keep the tower's
    // front edge on flat floor. The Z window below sits inside that
    // safe band.
    const PUSHER_TOWER_Z_MIN = -0.2;
    const PUSHER_TOWER_Z_MAX = -0.14;
    const PLATE_TOWER_Z_MIN = 0.12;
    const PLATE_TOWER_Z_MAX = 0.13;
    const TOWER_EDGE_MARGIN = 0.02;
    // Per-layer ring radius as a multiple of `coinRadius`. With 4 coins
    // arranged on the ring (90° apart) the in-layer chord is
    // 2·d·sin(45°) = d·√2, so coins exactly touch when d = √2·r. We
    // use a hair more (1.43) so the contact solver is never asked to
    // resolve initial inter-penetration between in-layer neighbours
    // while still preserving the "2×2 square" look from the reference
    // (even-level) image.
    const TOWER_RING_RADIUS_MULT = 1.43;
    // Lift each tower base by an essentially-zero margin above its
    // supporting surface. The tower is spawned coin-by-coin AT its
    // final lattice position, not rained in — so any non-trivial drop
    // would impart vertical momentum that cascades up the column and
    // collapses it. 0.1 mm is enough to keep the bottom face from
    // initially interpenetrating the floor collider, and small enough
    // that the settle motion is imperceptible.
    const PUSHER_TOWER_LIFT = 0.0001;
    const PLATE_TOWER_LIFT = 0.0001;
    // Scatter coins spawn high above the playfield so the falling
    // animation is clearly visible after the loop starts.
    const SCATTER_MARGIN = 0.03;
    const SCATTER_MIN_Y = 0.3;
    const SCATTER_Y_RANGE = 0.6;
    // Extra clearance around each tower footprint when sampling
    // scatter positions, so rain coins NEVER spawn directly above (or
    // close to) a tower. Sized at roughly 2.5× the coin radius so even
    // a rain coin that lands at the very edge of the keep-out band
    // cannot strike the outer ring of the tower as it bounces. The
    // tower's own footprint half-extent is only ~2.18·r, so this
    // margin keeps a clean gap of >= 1 coin-diameter around the
    // column.
    const TOWER_KEEP_OUT_MARGIN = 0.06;
    // Per-coin rejection-sampling budget. If the budget is ever
    // exhausted we STOP spawning rather than fall back to placing a
    // coin above a tower, satisfying the contract that no rain coin
    // ever falls directly onto a tower.
    const SCATTER_MAX_RETRIES = 32;
    const SEED_OFFSET = 2;
    // Delay between tower placement and rain start. The caller starts
    // the physics loop immediately after `prefillCoins` returns; this
    // window gives the pyramids time to settle on their supporting
    // surfaces under gravity before the first rain coin lands. 600 ms
    // is enough for the ~2 mm settle drop to damp out while still
    // feeling snappy to the player.
    const RAIN_DELAY_MS = 600;

    const rng: Rng = createRng(gameBalance.valuables.placementSeed + SEED_OFFSET);
    const count = gameBalance.spawning.initialPileCount;
    const cr = gameBalance.physics.coinRadius;
    const ct = gameBalance.physics.coinThickness;

    // Tower footprint half-extent in XZ — the ring radius plus a coin
    // radius (each in-layer coin's outer edge). Identical for both
    // towers because the ring geometry is independent of layer count.
    const ringRadius = cr * TOWER_RING_RADIUS_MULT;
    const towerHalfExtent = ringRadius + cr;

    // Pick a random centre for each tower such that the entire
    // footprint remains inside its surface plus a small edge margin.
    const pusherX = rng.range(
      -this.halfWidth + towerHalfExtent + TOWER_EDGE_MARGIN,
      this.halfWidth - towerHalfExtent - TOWER_EDGE_MARGIN,
    );
    const pusherZ = rng.range(PUSHER_TOWER_Z_MIN, PUSHER_TOWER_Z_MAX);
    const plateX = rng.range(
      -this.halfWidth + towerHalfExtent + TOWER_EDGE_MARGIN,
      this.halfWidth - towerHalfExtent - TOWER_EDGE_MARGIN,
    );
    const plateZ = rng.range(PLATE_TOWER_Z_MIN, PLATE_TOWER_Z_MAX);

    // (1) Phase 1 — Deterministic tower construction. Coins spawn
    //     directly at their final lattice positions on the supporting
    //     surface; no coin "rains down" in this phase.
    let placedBeforeRain = 0;
    placedBeforeRain += this.placeCoinTower(
      coinPool,
      pusherX,
      pusherZ,
      PUSHER_TOP_SURFACE_Y + PUSHER_TOWER_LIFT,
      ringRadius,
      ct,
      PUSHER_TOWER_LAYERS,
      count - placedBeforeRain,
    );
    placedBeforeRain += this.placeCoinTower(
      coinPool,
      plateX,
      plateZ,
      this.floorY + PLATE_TOWER_LIFT,
      ringRadius,
      ct,
      PLATE_TOWER_LAYERS,
      count - placedBeforeRain,
    );

    // (1b) Phase 1b — Even surface scatter. The 30% trim on tower
    //      height frees ~72 coins of budget; we spend them as a
    //      lightly-piled spread across the pusher top and the plate
    //      floor so the player starts with coins they can
    //      immediately push, not just locked inside towers. Coins
    //      are placed on a jittered grid (one coin per cell, ±40%
    //      cell-size random offset) so the pile is visibly even
    //      instead of clumping like a pure random scatter would.
    //      Cells that overlap the respective tower footprint are
    //      skipped. Coins spawn at small per-cell-staggered heights
    //      above their supporting surface so the rare near-collision
    //      between adjacent cells resolves as a tiny natural pile.
    const PUSHER_SCATTER_COUNT = 36;
    const PLATE_SCATTER_COUNT = 36;
    // Z windows for each surface's scatter pile. The pusher window
    // sits inside the always-on-pusher band (between back wall and
    // the pusher's fully-retracted front face); the plate window
    // sits forward of the pusher's fully-extended front edge plus
    // lip, and behind the tray's slanted front lip — the same safe
    // bands derived in the tower-placement geometry comments above.
    const PUSHER_SCATTER_Z_MIN = -0.25;
    const PUSHER_SCATTER_Z_MAX = -0.10;
    const PLATE_SCATTER_Z_MIN = 0.06;
    const PLATE_SCATTER_Z_MAX = 0.17;
    // Vertical staggering: spawn each scatter coin at a slightly
    // higher Y than the previous so that any two coins that happen to
    // sample nearby XZ positions resolve their contact as a tiny
    // gravity-driven pile rather than as an interpenetrating spawn.
    const SCATTER_LIFT_BASE = 0.005;
    const SCATTER_LIFT_STEP_MULT = 1.2;
    const SCATTER_LIFT_STEP = ct * SCATTER_LIFT_STEP_MULT;
    // Per-cell jitter as a fraction of cell size. 0.4 leaves a small
    // guard band between adjacent cells so the placements never
    // visibly collapse into a strict grid pattern, while preventing
    // jittered points in two neighbouring cells from crossing into
    // each other's territory.
    const SCATTER_JITTER_FRAC = 0.4;
    const scatterXMin = -this.halfWidth + SCATTER_MARGIN;
    const scatterXMax = this.halfWidth - SCATTER_MARGIN;
    const pusherKeepHalfForScatter = towerHalfExtent + TOWER_KEEP_OUT_MARGIN;
    const plateKeepHalfForScatter = towerHalfExtent + TOWER_KEEP_OUT_MARGIN;

    const scatterOnSurface = (
      surfaceY: number,
      zMin: number,
      zMax: number,
      keepX: number,
      keepZ: number,
      keepHalf: number,
      requested: number,
    ): number => {
      // Build a grid whose cells are as close to square as the
      // surface aspect ratio allows, sized so cell count >= requested.
      // `cell ≈ √(area / requested)` is the canonical size that lays
      // `requested` square cells onto the surface; we then round nx and
      // nz independently and grow the smaller dimension if rounding
      // landed us short of `requested` cells.
      const width = scatterXMax - scatterXMin;
      const depth = zMax - zMin;
      const cellTarget = Math.sqrt((width * depth) / Math.max(1, requested));
      let nx = Math.max(1, Math.round(width / cellTarget));
      let nz = Math.max(1, Math.round(depth / cellTarget));
      while (nx * nz < requested) {
        if (width / (nx + 1) >= depth / (nz + 1)) nx += 1;
        else nz += 1;
      }
      const cellW = width / nx;
      const cellD = depth / nz;
      const jitterX = cellW * SCATTER_JITTER_FRAC;
      const jitterZ = cellD * SCATTER_JITTER_FRAC;
      let placed = 0;
      for (let row = 0; row < nz && placed < requested; row += 1) {
        for (let col = 0; col < nx && placed < requested; col += 1) {
          if (placedBeforeRain >= count) return placed;
          const cx = scatterXMin + (col + HALF) * cellW + rng.range(-jitterX, jitterX);
          const cz = zMin + (row + HALF) * cellD + rng.range(-jitterZ, jitterZ);
          // Skip cells whose jittered point falls inside the tower
          // keep-out box. We do NOT retry — accepting an even hole
          // around the tower keeps the visual rhythm of the grid.
          if (Math.abs(cx - keepX) < keepHalf && Math.abs(cz - keepZ) < keepHalf) continue;
          const y = surfaceY + SCATTER_LIFT_BASE + placed * SCATTER_LIFT_STEP;
          const coin = coinPool.spawn(cx, y, cz);
          if (!coin) return placed;
          placed += 1;
          placedBeforeRain += 1;
        }
      }
      return placed;
    };

    scatterOnSurface(
      PUSHER_TOP_SURFACE_Y,
      PUSHER_SCATTER_Z_MIN,
      PUSHER_SCATTER_Z_MAX,
      pusherX,
      pusherZ,
      pusherKeepHalfForScatter,
      PUSHER_SCATTER_COUNT,
    );
    scatterOnSurface(
      this.floorY,
      PLATE_SCATTER_Z_MIN,
      PLATE_SCATTER_Z_MAX,
      plateX,
      plateZ,
      plateKeepHalfForScatter,
      PLATE_SCATTER_COUNT,
    );

    // (2) Phase 2 — Controlled rain. Invoked by the caller after
    //     RAIN_DELAY_MS so the towers are stable before any rain coin
    //     lands. A square no-rain zone is enforced above each tower
    //     footprint via rejection sampling.
    const xMin = -this.halfWidth + SCATTER_MARGIN;
    const xMax = this.halfWidth - SCATTER_MARGIN;
    const zMin = -this.halfDepth + SCATTER_MARGIN;
    const zMax = this.halfDepth - SCATTER_MARGIN;
    const pusherKeepHalf = towerHalfExtent + TOWER_KEEP_OUT_MARGIN;
    const plateKeepHalf = towerHalfExtent + TOWER_KEEP_OUT_MARGIN;
    const startRain = (): number => {
      let placed = placedBeforeRain;
      while (placed < count) {
        let sx = 0;
        let sz = 0;
        let accepted = false;
        for (let r = 0; r < SCATTER_MAX_RETRIES; r += 1) {
          sx = rng.range(xMin, xMax);
          sz = rng.range(zMin, zMax);
          const inPusher =
            Math.abs(sx - pusherX) < pusherKeepHalf && Math.abs(sz - pusherZ) < pusherKeepHalf;
          const inPlate =
            Math.abs(sx - plateX) < plateKeepHalf && Math.abs(sz - plateZ) < plateKeepHalf;
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
      return placed - placedBeforeRain;
    };

    return { placedBeforeRain, rainDelayMs: RAIN_DELAY_MS, startRain };
  }

  /**
   * Place an interleaved "coin tower": every layer contains four coins
   * arranged at 90° around a common vertical axis at distance
   * `ringRadius` from `(centerX, centerZ)` (a 2×2 square footprint),
   * and successive layers are rotated by 45° relative to the one
   * below. The 45° offset (= half the in-layer angular pitch) places
   * every upper coin symmetrically between two adjacent lower coins,
   * giving each upper coin a balanced two-coin support footprint and
   * the classic ABAB interleaved-stack stability. Coins are spawned
   * with default rotation (cylinder axis = Y → coins lying flat) and
   * default gravity scale, so the tower is held together by gravity
   * + contact forces alone — no per-body hacks. Returns the number of
   * coins placed, never exceeding `maxCoins`.
   */
  private placeCoinTower(
    coinPool: CoinPool,
    centerX: number,
    centerZ: number,
    baseY: number,
    ringRadius: number,
    coinThickness: number,
    layers: number,
    maxCoins: number,
  ): number {
    const COINS_PER_LAYER = 4;
    // 2π / COINS_PER_LAYER — angular spacing between coins in one ring
    // (90° for a 4-coin ring).
    const COIN_ANGLE_STEP_RAD = (Math.PI * 2) / COINS_PER_LAYER;
    // Per-layer rotation = half the in-layer angular pitch
    // (π / COINS_PER_LAYER = 45° for a 4-coin ring). This produces a
    // textbook ABAB interleave: every upper coin sits exactly between
    // two adjacent lower coins, supported symmetrically on both sides.
    const LAYER_ROTATION_RAD = Math.PI / COINS_PER_LAYER;
    // Near-zero spawn gap: spawn each layer just barely above the one
    // below so there is no free-fall settling at game start. Any
    // non-trivial gap, multiplied across 20 layers, would generate
    // enough downward momentum to start the column oscillating.
    const LAYER_GAP = 0.00005;
    const LIFT = 0.00005;
    const layerStep = coinThickness + LAYER_GAP;
    let placed = 0;
    for (let l = 0; l < layers; l += 1) {
      if (placed >= maxCoins) return placed;
      const y = baseY + LIFT + coinThickness * HALF + l * layerStep;
      const baseAngle = l * LAYER_ROTATION_RAD;
      for (let k = 0; k < COINS_PER_LAYER; k += 1) {
        if (placed >= maxCoins) return placed;
        const angle = baseAngle + k * COIN_ANGLE_STEP_RAD;
        const x = centerX + Math.cos(angle) * ringRadius;
        const z = centerZ + Math.sin(angle) * ringRadius;
        const coin = coinPool.spawn(x, y, z);
        if (!coin) return placed;
        placed += 1;
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
  prefillBin(coinPool: CoinPool, count: number): CoinSlot[] {
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
    const slots: CoinSlot[] = [];
    for (let i = 0; i < count; i += 1) {
      const x = rng.range(xMin, xMax);
      const z = rng.range(zMin, zMax);
      const y = yBase + rng.next() * Y_STACK;
      const coin = coinPool.spawn(x, y, z);
      if (!coin) break;
      slots.push(coin);
    }
    return slots;
  }
}
