/**
 * TrayMeshes — visual geometry for the static tray (floor + 3 walls) plus the
 * coin-collection bin sitting below and in front of it. Mirrors the physics
 * cuboids created in `src/game/Tray.ts`. Awarded coins land in the bin as
 * regular physics bodies (rendered via `CoinInstances`), so there is no
 * separate visual pile to maintain here.
 */
import * as THREE from 'three';

import { gameBalance } from '../config/gameBalance';
import type { Tray } from '../game/Tray';

const HALF = 0.5;
const WALL_THICKNESS = 0.02;
const FLOOR_THICKNESS = 0.01;
// Plate front-edge lip (must match physics dimensions in src/game/Tray.ts).
const PLATE_LIP_DEPTH = 0.012;
const PLATE_LIP_THICKNESS = 0.004;
const PLATE_LIP_SLANT_RAD = 0.26;

// Coin-collection bin visuals — physical floor + walls live in src/game/Tray.ts.
// Kept intentionally dark and matte so the bin reads as a dimmer "well" below
// the brightly lit playfield even though the scene lighting is uniform.
const BIN_FLOOR_COLOR = 0x0c0e10;
const BIN_WALL_COLOR = 0x2a1808;
const BIN_MATTE_METALNESS = 0;
const BIN_MATTE_ROUGHNESS = 1;

export class TrayMeshes {
  readonly group = new THREE.Group();

  constructor(scene: THREE.Scene, tray: Tray) {
    const { width, depth, wallHeight } = gameBalance.tray;
    const trayMat = new THREE.MeshStandardMaterial({
      color: gameBalance.render.trayColor,
      metalness: gameBalance.render.coinMetalness * gameBalance.render.coinRoughness,
      roughness: gameBalance.render.coinRoughness * 2,
    });
    const wallMat = new THREE.MeshStandardMaterial({
      color: gameBalance.render.wallColor,
      metalness: gameBalance.render.coinMetalness * gameBalance.render.coinRoughness,
      roughness: gameBalance.render.coinRoughness * 2,
    });
    const binFloorMat = new THREE.MeshStandardMaterial({
      color: BIN_FLOOR_COLOR,
      metalness: BIN_MATTE_METALNESS,
      roughness: BIN_MATTE_ROUGHNESS,
    });
    const binWallMat = new THREE.MeshStandardMaterial({
      color: BIN_WALL_COLOR,
      metalness: BIN_MATTE_METALNESS,
      roughness: BIN_MATTE_ROUGHNESS,
    });

    // Floor — top surface at y=0 to match the physics floor collider.
    const floor = new THREE.Mesh(new THREE.BoxGeometry(width, FLOOR_THICKNESS, depth), trayMat);
    floor.position.set(0, tray.floorY - FLOOR_THICKNESS * HALF, 0);
    this.group.add(floor);

    // Back wall.
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(width, wallHeight, WALL_THICKNESS),
      wallMat,
    );
    back.position.set(0, wallHeight * HALF, -depth * HALF);
    this.group.add(back);

    // Left wall.
    const left = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_THICKNESS, wallHeight, depth),
      wallMat,
    );
    left.position.set(-width * HALF, wallHeight * HALF, 0);
    this.group.add(left);

    // Right wall.
    const right = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_THICKNESS, wallHeight, depth),
      wallMat,
    );
    right.position.set(width * HALF, wallHeight * HALF, 0);
    this.group.add(right);

    // Plate front lip — slanted retaining rim at the plate's front edge,
    // mirrors the physics ramp in src/game/Tray.ts.
    const plateLip = new THREE.Mesh(
      new THREE.BoxGeometry(width, PLATE_LIP_THICKNESS, PLATE_LIP_DEPTH),
      trayMat,
    );
    plateLip.position.set(0, PLATE_LIP_THICKNESS * HALF, depth * HALF - PLATE_LIP_DEPTH * HALF);
    plateLip.rotation.x = -PLATE_LIP_SLANT_RAD;
    this.group.add(plateLip);

    // ── Coin-collection bin ─────────────────────────────────────────────
    // The physical bin (in src/game/Tray.ts) spans the full play footprint
    // plus a forward extension toward the player. We only render the visible
    // portion (in front of the plate) since the under-plate region is
    // hidden by the plate floor anyway.
    const { depth: binDepth, floorY: binFloorY, wallHeight: binWallHeight } = gameBalance.bin;
    const binBackZ = -depth * HALF;
    const frontEdgeZ = depth * HALF;
    const binFrontZ = frontEdgeZ + binDepth;
    const binFullDepth = binFrontZ - binBackZ;
    const binCenterZ = (binBackZ + binFrontZ) * HALF;

    const binFloor = new THREE.Mesh(
      new THREE.BoxGeometry(width, FLOOR_THICKNESS, binFullDepth),
      binFloorMat,
    );
    binFloor.position.set(0, binFloorY - FLOOR_THICKNESS * HALF, binCenterZ);
    this.group.add(binFloor);

    const binFront = new THREE.Mesh(
      new THREE.BoxGeometry(width, binWallHeight, WALL_THICKNESS),
      binWallMat,
    );
    binFront.position.set(0, binFloorY + binWallHeight * HALF, binFrontZ - WALL_THICKNESS * HALF);
    this.group.add(binFront);

    const binBack = new THREE.Mesh(
      new THREE.BoxGeometry(width, binWallHeight, WALL_THICKNESS),
      binWallMat,
    );
    binBack.position.set(0, binFloorY + binWallHeight * HALF, binBackZ + WALL_THICKNESS * HALF);
    this.group.add(binBack);

    const binLeft = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_THICKNESS, binWallHeight, binFullDepth),
      binWallMat,
    );
    binLeft.position.set(-width * HALF, binFloorY + binWallHeight * HALF, binCenterZ);
    this.group.add(binLeft);

    const binRight = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_THICKNESS, binWallHeight, binFullDepth),
      binWallMat,
    );
    binRight.position.set(width * HALF, binFloorY + binWallHeight * HALF, binCenterZ);
    this.group.add(binRight);

    scene.add(this.group);
  }
}
