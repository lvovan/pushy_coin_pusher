/**
 * Coin instanced rendering. One `THREE.InstancedMesh` of `maxActiveCoins`
 * cylinders gives us one draw call regardless of coin count.
 *
 * Coins not currently active are scaled to zero so they vanish without paying
 * for a separate visibility flag in the shader.
 */
import * as THREE from 'three';

import { gameBalance } from '../config/gameBalance';
import type { CoinPool } from '../game/CoinPool';

const CYLINDER_SEGMENTS = 24;
const ZERO_SCALE = 0;
const COIN_BASE_SCALE = 1;
const ROTATION_X = Math.PI * 0.5;

export class CoinInstances {
  readonly mesh: THREE.InstancedMesh;
  private readonly tmpMatrix = new THREE.Matrix4();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpScale = new THREE.Vector3();
  private readonly upright = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(COIN_BASE_SCALE, ZERO_SCALE, ZERO_SCALE),
    ROTATION_X,
  );

  constructor(scene: THREE.Scene) {
    const geom = new THREE.CylinderGeometry(
      gameBalance.physics.coinRadius,
      gameBalance.physics.coinRadius,
      gameBalance.physics.coinThickness,
      CYLINDER_SEGMENTS,
    );
    const mat = new THREE.MeshStandardMaterial({
      color: gameBalance.render.coinColor,
      metalness: gameBalance.render.coinMetalness,
      roughness: gameBalance.render.coinRoughness,
    });
    this.mesh = new THREE.InstancedMesh(geom, mat, gameBalance.limits.maxActiveCoins);
    this.mesh.frustumCulled = false;
    this.tmpScale.set(ZERO_SCALE, ZERO_SCALE, ZERO_SCALE);
    this.tmpPos.set(ZERO_SCALE, ZERO_SCALE, ZERO_SCALE);
    this.tmpMatrix.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
    for (let i = 0; i < gameBalance.limits.maxActiveCoins; i += 1) {
      this.mesh.setMatrixAt(i, this.tmpMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);
  }

  syncFromPool(coinPool: CoinPool): void {
    const cap = gameBalance.limits.maxActiveCoins;
    // Reset all to zero scale, then overlay actives.
    this.tmpScale.set(ZERO_SCALE, ZERO_SCALE, ZERO_SCALE);
    this.tmpPos.set(ZERO_SCALE, ZERO_SCALE, ZERO_SCALE);
    this.tmpQuat.identity();
    this.tmpMatrix.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
    for (let i = 0; i < cap; i += 1) this.mesh.setMatrixAt(i, this.tmpMatrix);

    this.tmpScale.set(COIN_BASE_SCALE, COIN_BASE_SCALE, COIN_BASE_SCALE);
    for (const slot of coinPool.active()) {
      const t = slot.body.translation();
      const r = slot.body.rotation();
      this.tmpPos.set(t.x, t.y, t.z);
      this.tmpQuat.set(r.x, r.y, r.z, r.w);
      this.tmpMatrix.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
      this.mesh.setMatrixAt(slot.index, this.tmpMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
