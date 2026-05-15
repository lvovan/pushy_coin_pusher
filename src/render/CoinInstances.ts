/**
 * Coin instanced rendering. One `THREE.InstancedMesh` of `maxActiveCoins`
 * cylinders gives us one draw call regardless of coin count.
 *
 * Per-frame work scales with the *active* coin count, not the pool capacity:
 *   - Inactive slot matrices are written to zero-scale exactly once (at init
 *     and on release) — never every frame.
 *   - Steady-state sleeping bodies skip the read+compose+write after their
 *     final resting frame (the GPU instance buffer still holds the resting
 *     matrix).
 *   - The instance buffer is uploaded to the GPU at most once per frame with
 *     a single `gl.bufferSubData`.
 *
 * Render rate is capped at the physics rate (60 Hz), so render-time
 * interpolation would only ever land at α≈1.0 — i.e. compute values we
 * already have. We therefore write body poses directly with no prev/curr
 * blending; this removes a snapshotPrev pass, a captureCurrent pass, a
 * buffer-diff comparison and a per-coin slerp from the hot path.
 */
import * as THREE from 'three';

import { gameBalance } from '../config/gameBalance';
import type { CoinPool } from '../game/CoinPool';

const CYLINDER_SEGMENTS = 24;
const ZERO_SCALE = 0;
const COIN_BASE_SCALE = 1;
const AWAKE = 0;
const SLEEPING = 1;

export class CoinInstances {
  readonly mesh: THREE.InstancedMesh;
  private readonly tmpMatrix = new THREE.Matrix4();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpScale = new THREE.Vector3();
  private readonly zeroMatrix = new THREE.Matrix4();
  /**
   * Per-slot "last write was for a sleeping body" flag. Sleeping bodies don't
   * move, so once we have written their resting pose into the GPU instance
   * buffer there is no point reading + composing + writing the same matrix
   * every subsequent frame. The flag lets us emit exactly one write on the
   * awake→sleep transition (when the body just went to sleep but we have not
   * yet captured that final pose) and then skip until something wakes it.
   * Freshly-acquired slots and freshly-released slots reset the flag to
   * AWAKE so the next frame is guaranteed to write.
   */
  private readonly lastSleeping: Uint8Array;

  constructor(scene: THREE.Scene) {
    const cap = gameBalance.limits.maxActiveCoins;
    this.lastSleeping = new Uint8Array(cap);

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

  /** Read body poses for active coins and write the instance matrix. Skips
   * coins that were sleeping on the previous write (their GPU matrix is
   * already correct) and zeroes the matrices of slots released since the
   * last call. */
  syncRender(coinPool: CoinPool): void {
    const indices = coinPool.pool.activeIndices;
    this.tmpScale.set(COIN_BASE_SCALE, COIN_BASE_SCALE, COIN_BASE_SCALE);
    let touched = false;
    // Newly-acquired slots must always write at least once, even if the
    // body reports sleeping on the very first frame.
    const justAcquired = coinPool.pool.justAcquired;
    for (let n = 0; n < justAcquired.length; n += 1) {
      this.lastSleeping[justAcquired[n]!] = AWAKE;
    }
    coinPool.pool.clearJustAcquired();
    for (let n = 0; n < indices.length; n += 1) {
      const i = indices[n]!;
      const slot = coinPool.pool.get(i)!;
      const sleeping = slot.body.isSleeping();
      // Steady-state sleeping body: GPU buffer already holds the resting
      // matrix, so don't pay for translation+rotation+compose+upload.
      if (sleeping && this.lastSleeping[i] === SLEEPING) continue;
      const t = slot.body.translation();
      const r = slot.body.rotation();
      this.tmpPos.set(t.x, t.y, t.z);
      this.tmpQuat.set(r.x, r.y, r.z, r.w);
      this.tmpMatrix.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
      this.mesh.setMatrixAt(i, this.tmpMatrix);
      this.lastSleeping[i] = sleeping ? SLEEPING : AWAKE;
      touched = true;
    }
    const released = coinPool.pool.released;
    for (let n = 0; n < released.length; n += 1) {
      const i = released[n]!;
      // A slot can appear in `released` and also be currently active when
      // it was released and immediately reacquired in the same frame
      // (e.g. Play Again: release-all then prefill, reusing the same
      // free-list indices). Skip the zero-write in that case so we don't
      // erase the freshly-drawn matrix.
      if (coinPool.pool.get(i)!.active) continue;
      this.mesh.setMatrixAt(i, this.zeroMatrix);
      this.lastSleeping[i] = AWAKE;
      touched = true;
    }
    coinPool.pool.clearReleased();
    if (touched) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
