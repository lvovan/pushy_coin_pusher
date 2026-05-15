/**
 * PusherMesh — visual cuboid for the kinematic pusher arm. Position is read
 * from the Rapier body each render so it tracks physics exactly.
 */
import * as THREE from 'three';

import { gameBalance } from '../config/gameBalance';
import type { Pusher } from '../game/Pusher';

const HALF = 0.5;
const PUSHER_DEPTH = 0.45;
const PUSHER_HEIGHT = 0.025;
const PUSHER_WIDTH_MARGIN = 0.04;
const PUSHER_FLOOR_EMBED = 0.005;
// Must match Pusher.ts (game) — visual lip atop the pusher's front edge.
const PUSHER_LIP_DEPTH = 0.012;
const PUSHER_LIP_THICKNESS = 0.004;
const PUSHER_LIP_SLANT_RAD = 0.26;

export class PusherMesh {
  readonly mesh: THREE.Mesh;

  constructor(scene: THREE.Scene, private readonly pusher: Pusher) {
    const width = gameBalance.tray.width - PUSHER_WIDTH_MARGIN;
    const geom = new THREE.BoxGeometry(width, PUSHER_HEIGHT, PUSHER_DEPTH);
    const mat = new THREE.MeshStandardMaterial({
      color: gameBalance.render.pusherColor,
      metalness: gameBalance.render.coinMetalness * gameBalance.render.coinRoughness,
      roughness: gameBalance.render.coinRoughness,
    });
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.position.set(0, PUSHER_HEIGHT * HALF - PUSHER_FLOOR_EMBED, gameBalance.pusher.basePositionZ);

    // Front-edge lip — child mesh, moves with the pusher.
    const lipGeom = new THREE.BoxGeometry(width, PUSHER_LIP_THICKNESS, PUSHER_LIP_DEPTH);
    const lipMesh = new THREE.Mesh(lipGeom, mat);
    lipMesh.position.set(
      0,
      PUSHER_HEIGHT * HALF + PUSHER_LIP_THICKNESS * HALF,
      PUSHER_DEPTH * HALF - PUSHER_LIP_DEPTH * HALF,
    );
    lipMesh.rotation.x = -PUSHER_LIP_SLANT_RAD;
    this.mesh.add(lipMesh);

    scene.add(this.mesh);
  }

  sync(): void {
    const t = this.pusher.body.translation();
    const r = this.pusher.body.rotation();
    this.mesh.position.set(t.x, t.y, t.z);
    this.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }
}
