/**
 * Coin instanced rendering. One `THREE.InstancedMesh` of `maxActiveCoins`
 * cylinders gives us one draw call regardless of coin count.
 *
 * Inactive slot matrices are written to zero-scale exactly once (at init and
 * on release) — never every frame — so the per-frame matrix work scales with
 * the *active* coin count, not the pool capacity. Per-frame buffer uploads
 * use `addUpdateRange` so only the touched slot matrices are pushed to the
 * GPU instead of the full instance buffer.
 *
 * Render-time interpolation: `captureCurrent` snapshots the pose after each
 * physics step, `snapshotPrev` rolls current → previous before the first
 * substep of the next frame, and `syncRender(alpha)` lerps/slerps using
 * `alpha = accumulator/stepMs`. This gives smooth motion on displays that
 * refresh faster than the 60 Hz physics rate without changing physics.
 */
import * as THREE from 'three';

import { gameBalance } from '../config/gameBalance';
import type { CoinPool } from '../game/CoinPool';

const CYLINDER_SEGMENTS = 24;
const ZERO_SCALE = 0;
const COIN_BASE_SCALE = 1;
const VEC3_STRIDE = 3;
const QUAT_STRIDE = 4;
const QUAT_W_OFFSET = 3;
const MATRIX_FLOATS = 16;

export class CoinInstances {
  readonly mesh: THREE.InstancedMesh;
  private readonly tmpMatrix = new THREE.Matrix4();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpQuatB = new THREE.Quaternion();
  private readonly tmpScale = new THREE.Vector3();
  private readonly zeroMatrix = new THREE.Matrix4();
  private readonly currPos: Float32Array;
  private readonly currQuat: Float32Array;
  private readonly prevPos: Float32Array;
  private readonly prevQuat: Float32Array;

  constructor(scene: THREE.Scene) {
    const cap = gameBalance.limits.maxActiveCoins;
    this.currPos = new Float32Array(cap * VEC3_STRIDE);
    this.currQuat = new Float32Array(cap * QUAT_STRIDE);
    this.prevPos = new Float32Array(cap * VEC3_STRIDE);
    this.prevQuat = new Float32Array(cap * QUAT_STRIDE);
    // Identity quaternions (w=1) so a slot rendered before its first capture
    // produces a degenerate (zero-scaled) but still well-defined matrix.
    for (let i = 0; i < cap; i += 1) {
      this.currQuat[i * QUAT_STRIDE + QUAT_W_OFFSET] = COIN_BASE_SCALE;
      this.prevQuat[i * QUAT_STRIDE + QUAT_W_OFFSET] = COIN_BASE_SCALE;
    }

    const geom = new THREE.CylinderGeometry(
      gameBalance.physics.coinRadius,
      gameBalance.physics.coinRadius,
      gameBalance.physics.coinThickness,
      CYLINDER_SEGMENTS,
    );
    // CylinderGeometry produces three groups: [0]=side wall, [1]=top cap,
    // [2]=bottom cap. We give the side wall a darker, more matte tone so
    // stacked coins show clear dark seams between every top face — the
    // silhouette/outline effect the player needs to count coins in a stack.
    const faceMat = new THREE.MeshStandardMaterial({
      color: gameBalance.render.coinColor,
      metalness: gameBalance.render.coinMetalness,
      roughness: gameBalance.render.coinRoughness,
    });
    const sideMat = new THREE.MeshStandardMaterial({
      color: gameBalance.render.coinSideColor,
      metalness: gameBalance.render.coinMetalness * gameBalance.render.coinRoughness,
      roughness: COIN_BASE_SCALE - gameBalance.render.coinRoughness,
    });
    this.mesh = new THREE.InstancedMesh(geom, [sideMat, faceMat, faceMat], cap);
    this.mesh.frustumCulled = false;
    // One-time zero-scale write for every slot. Re-released slots are
    // re-zeroed individually in `syncRender` so the buffer never holds a
    // stale live matrix for an inactive slot.
    this.tmpScale.set(ZERO_SCALE, ZERO_SCALE, ZERO_SCALE);
    this.tmpPos.set(ZERO_SCALE, ZERO_SCALE, ZERO_SCALE);
    this.tmpQuat.identity();
    this.zeroMatrix.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
    for (let i = 0; i < cap; i += 1) this.mesh.setMatrixAt(i, this.zeroMatrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);
  }

  /** Snapshot current pose buffer into previous, in preparation for the next
   * physics step. Only touches active slots. */
  snapshotPrev(coinPool: CoinPool): void {
    const indices = coinPool.pool.activeIndices;
    for (let n = 0; n < indices.length; n += 1) {
      const i = indices[n]!;
      const pi = i * VEC3_STRIDE;
      this.prevPos[pi] = this.currPos[pi]!;
      this.prevPos[pi + 1] = this.currPos[pi + 1]!;
      this.prevPos[pi + 2] = this.currPos[pi + 2]!;
      const qi = i * QUAT_STRIDE;
      this.prevQuat[qi] = this.currQuat[qi]!;
      this.prevQuat[qi + 1] = this.currQuat[qi + 1]!;
      this.prevQuat[qi + 2] = this.currQuat[qi + 2]!;
      this.prevQuat[qi + QUAT_W_OFFSET] = this.currQuat[qi + QUAT_W_OFFSET]!;
    }
  }

  /** Capture current pose from physics bodies for every active coin. Newly
   * spawned slots also have their prev buffer seeded so they don't streak
   * from the park position on their first rendered frame. */
  captureCurrent(coinPool: CoinPool): void {
    const indices = coinPool.pool.activeIndices;
    for (let n = 0; n < indices.length; n += 1) {
      const i = indices[n]!;
      const slot = coinPool.pool.get(i)!;
      const t = slot.body.translation();
      const r = slot.body.rotation();
      const pi = i * VEC3_STRIDE;
      this.currPos[pi] = t.x;
      this.currPos[pi + 1] = t.y;
      this.currPos[pi + 2] = t.z;
      const qi = i * QUAT_STRIDE;
      this.currQuat[qi] = r.x;
      this.currQuat[qi + 1] = r.y;
      this.currQuat[qi + 2] = r.z;
      this.currQuat[qi + QUAT_W_OFFSET] = r.w;
    }
    const justAcquired = coinPool.pool.justAcquired;
    for (let n = 0; n < justAcquired.length; n += 1) {
      const i = justAcquired[n]!;
      const pi = i * VEC3_STRIDE;
      this.prevPos[pi] = this.currPos[pi]!;
      this.prevPos[pi + 1] = this.currPos[pi + 1]!;
      this.prevPos[pi + 2] = this.currPos[pi + 2]!;
      const qi = i * QUAT_STRIDE;
      this.prevQuat[qi] = this.currQuat[qi]!;
      this.prevQuat[qi + 1] = this.currQuat[qi + 1]!;
      this.prevQuat[qi + 2] = this.currQuat[qi + 2]!;
      this.prevQuat[qi + QUAT_W_OFFSET] = this.currQuat[qi + QUAT_W_OFFSET]!;
    }
    coinPool.pool.clearJustAcquired();
  }

  /** Write interpolated matrices for every active coin and zero out matrices
   * of slots that were released since the last sync. Per-instance partial
   * uploads via `addUpdateRange` keep GPU traffic proportional to the active
   * set rather than the pool capacity. */
  syncRender(coinPool: CoinPool, alpha: number): void {
    const indices = coinPool.pool.activeIndices;
    this.tmpScale.set(COIN_BASE_SCALE, COIN_BASE_SCALE, COIN_BASE_SCALE);
    this.mesh.instanceMatrix.clearUpdateRanges();
    for (let n = 0; n < indices.length; n += 1) {
      const i = indices[n]!;
      const pi = i * VEC3_STRIDE;
      const qi = i * QUAT_STRIDE;
      this.tmpPos.set(
        this.prevPos[pi]! + (this.currPos[pi]! - this.prevPos[pi]!) * alpha,
        this.prevPos[pi + 1]! + (this.currPos[pi + 1]! - this.prevPos[pi + 1]!) * alpha,
        this.prevPos[pi + 2]! + (this.currPos[pi + 2]! - this.prevPos[pi + 2]!) * alpha,
      );
      this.tmpQuat.set(
        this.prevQuat[qi]!,
        this.prevQuat[qi + 1]!,
        this.prevQuat[qi + 2]!,
        this.prevQuat[qi + QUAT_W_OFFSET]!,
      );
      this.tmpQuatB.set(
        this.currQuat[qi]!,
        this.currQuat[qi + 1]!,
        this.currQuat[qi + 2]!,
        this.currQuat[qi + QUAT_W_OFFSET]!,
      );
      this.tmpQuat.slerp(this.tmpQuatB, alpha);
      this.tmpMatrix.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
      this.mesh.setMatrixAt(i, this.tmpMatrix);
      this.mesh.instanceMatrix.addUpdateRange(i * MATRIX_FLOATS, MATRIX_FLOATS);
    }
    const released = coinPool.pool.released;
    for (let n = 0; n < released.length; n += 1) {
      const i = released[n]!;
      this.mesh.setMatrixAt(i, this.zeroMatrix);
      this.mesh.instanceMatrix.addUpdateRange(i * MATRIX_FLOATS, MATRIX_FLOATS);
    }
    coinPool.pool.clearReleased();
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
