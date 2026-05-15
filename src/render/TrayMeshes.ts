/**
 * TrayMeshes — visual geometry for the static tray (floor + 3 walls). Mirrors
 * the physics cuboids created in `src/game/Tray.ts`. The renderer adds these
 * to the scene; they never move.
 */
import * as THREE from 'three';

import { gameBalance } from '../config/gameBalance';
import type { Tray } from '../game/Tray';

const HALF = 0.5;
const WALL_THICKNESS = 0.02;
const FLOOR_THICKNESS = 0.01;

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

    scene.add(this.group);
  }
}
