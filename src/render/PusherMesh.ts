/**
 * PusherMesh — visual cuboid for the kinematic pusher arm. Position is read
 * from the Rapier body each render so it tracks physics exactly.
 */
import * as THREE from 'three';

import { gameBalance } from '../config/gameBalance';
import type { Pusher } from '../game/Pusher';

const HALF = 0.5;
const PUSHER_DEPTH = 0.45;
const PUSHER_HEIGHT = 0.03375;
const PUSHER_WIDTH_MARGIN = 0.02; // matches Tray's WALL_THICKNESS so the visual pusher sits flush between the inner wall faces
const PUSHER_FLOOR_EMBED = 0.005;
// Must match Pusher.ts (game) — seamless slanted front ramp.
const PUSHER_LIP_LENGTH = 0.05;
const PUSHER_LIP_THICKNESS = 0.0015;
const PUSHER_LIP_SLANT_RAD = 0.12;

export class PusherMesh {
  readonly mesh: THREE.Mesh;
  private readonly prevPos = new THREE.Vector3();
  private readonly currPos = new THREE.Vector3();
  private readonly prevQuat = new THREE.Quaternion();
  private readonly currQuat = new THREE.Quaternion();
  private readonly tmpQuat = new THREE.Quaternion();

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
    this.currPos.copy(this.mesh.position);
    this.prevPos.copy(this.mesh.position);

    // Front-edge slanted ramp — child mesh, moves with the pusher. Back-top
    // edge meets the pusher top flush; back-bottom is hidden inside the
    // pusher so the seam is invisible.
    const lipCos = Math.cos(PUSHER_LIP_SLANT_RAD);
    const lipSin = Math.sin(PUSHER_LIP_SLANT_RAD);
    const lipGeom = new THREE.BoxGeometry(width, PUSHER_LIP_THICKNESS, PUSHER_LIP_LENGTH);
    const lipMesh = new THREE.Mesh(lipGeom, mat);
    lipMesh.position.set(
      0,
      PUSHER_HEIGHT * HALF -
        PUSHER_LIP_THICKNESS * HALF * lipCos +
        PUSHER_LIP_LENGTH * HALF * lipSin,
      PUSHER_DEPTH * HALF -
        PUSHER_LIP_LENGTH * HALF * lipCos +
        PUSHER_LIP_THICKNESS * HALF * lipSin,
    );
    lipMesh.rotation.x = -PUSHER_LIP_SLANT_RAD;
    this.mesh.add(lipMesh);

    scene.add(this.mesh);
  }

  /** Snapshot current pose into previous in preparation for the next step. */
  snapshotPrev(): void {
    this.prevPos.copy(this.currPos);
    this.prevQuat.copy(this.currQuat);
  }

  /** Read the current pose from the kinematic body. */
  captureCurrent(): void {
    const t = this.pusher.body.translation();
    const r = this.pusher.body.rotation();
    this.currPos.set(t.x, t.y, t.z);
    this.currQuat.set(r.x, r.y, r.z, r.w);
  }

  /** Render-time interpolation; `alpha ∈ [0,1)` from FixedStepAccumulator. */
  syncRender(alpha: number): void {
    this.mesh.position.set(
      this.prevPos.x + (this.currPos.x - this.prevPos.x) * alpha,
      this.prevPos.y + (this.currPos.y - this.prevPos.y) * alpha,
      this.prevPos.z + (this.currPos.z - this.prevPos.z) * alpha,
    );
    this.tmpQuat.copy(this.prevQuat).slerp(this.currQuat, alpha);
    this.mesh.quaternion.copy(this.tmpQuat);
  }
}
