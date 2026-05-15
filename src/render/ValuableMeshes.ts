/**
 * ValuableMeshes — per-valuable individual meshes (count ≤ 32, so InstancedMesh
 * is unnecessary). Each variant uses a different bright `MeshStandardMaterial`.
 */
import * as THREE from 'three';

import { gameBalance } from '../config/gameBalance';
import type { ValuablePool } from '../game/ValuablePool';

const SPHERE_SEGMENTS = 16;
const BOX_SMALL = 0.015;
const SPHERE_RADIUS = 0.018;
const BOX_LARGE = 0.022;
const HIDDEN_Y = -1000;
const VEC3_STRIDE = 3;
const QUAT_STRIDE = 4;
const QUAT_W_OFFSET = 3;

function buildGeometry(variantId: number): THREE.BufferGeometry {
  if (variantId === 0) return new THREE.BoxGeometry(BOX_SMALL, BOX_SMALL, BOX_SMALL);
  if (variantId === 1) return new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
  return new THREE.BoxGeometry(BOX_LARGE, BOX_LARGE, BOX_LARGE);
}

export class ValuableMeshes {
  private readonly meshes: THREE.Mesh[] = [];
  private readonly currPos: Float32Array;
  private readonly currQuat: Float32Array;
  private readonly prevPos: Float32Array;
  private readonly prevQuat: Float32Array;
  private readonly tmpQuatA = new THREE.Quaternion();
  private readonly tmpQuatB = new THREE.Quaternion();

  constructor(scene: THREE.Scene, pool: ValuablePool) {
    const cap = gameBalance.limits.maxActiveValuables;
    this.currPos = new Float32Array(cap * VEC3_STRIDE);
    this.currQuat = new Float32Array(cap * QUAT_STRIDE);
    this.prevPos = new Float32Array(cap * VEC3_STRIDE);
    this.prevQuat = new Float32Array(cap * QUAT_STRIDE);
    for (let i = 0; i < cap; i += 1) {
      this.currQuat[i * QUAT_STRIDE + QUAT_W_OFFSET] = 1;
      this.prevQuat[i * QUAT_STRIDE + QUAT_W_OFFSET] = 1;
    }
    for (let i = 0; i < cap; i += 1) {
      const slot = pool.pool.get(i)!;
      const mat = new THREE.MeshStandardMaterial({
        color: gameBalance.render.valuableColors[slot.variantId] ?? gameBalance.render.valuableColors[0],
        metalness: gameBalance.render.coinMetalness * gameBalance.render.coinRoughness,
        roughness: gameBalance.render.coinRoughness * 2,
      });
      const mesh = new THREE.Mesh(buildGeometry(slot.variantId), mat);
      mesh.position.set(0, HIDDEN_Y, 0);
      mesh.visible = false;
      scene.add(mesh);
      this.meshes.push(mesh);
    }
  }

  snapshotPrev(pool: ValuablePool): void {
    const indices = pool.pool.activeIndices;
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

  captureCurrent(pool: ValuablePool): void {
    const indices = pool.pool.activeIndices;
    for (let n = 0; n < indices.length; n += 1) {
      const i = indices[n]!;
      const slot = pool.pool.get(i)!;
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
    const justAcquired = pool.pool.justAcquired;
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
    pool.pool.clearJustAcquired();
  }

  syncRender(pool: ValuablePool, alpha: number): void {
    // Hide all meshes whose slots are no longer active. We use the released
    // queue for an O(released.length) sweep rather than walking all meshes.
    const released = pool.pool.released;
    for (let n = 0; n < released.length; n += 1) {
      const mesh = this.meshes[released[n]!];
      if (mesh) mesh.visible = false;
    }
    pool.pool.clearReleased();
    const indices = pool.pool.activeIndices;
    for (let n = 0; n < indices.length; n += 1) {
      const i = indices[n]!;
      const mesh = this.meshes[i];
      if (!mesh) continue;
      mesh.visible = true;
      const pi = i * VEC3_STRIDE;
      mesh.position.set(
        this.prevPos[pi]! + (this.currPos[pi]! - this.prevPos[pi]!) * alpha,
        this.prevPos[pi + 1]! + (this.currPos[pi + 1]! - this.prevPos[pi + 1]!) * alpha,
        this.prevPos[pi + 2]! + (this.currPos[pi + 2]! - this.prevPos[pi + 2]!) * alpha,
      );
      const qi = i * QUAT_STRIDE;
      this.tmpQuatA.set(
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
      this.tmpQuatA.slerp(this.tmpQuatB, alpha);
      mesh.quaternion.copy(this.tmpQuatA);
    }
  }
}
