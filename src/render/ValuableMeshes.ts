/**
 * ValuableMeshes — per-valuable individual meshes (count ≤ 32, so InstancedMesh
 * is unnecessary). Each variant uses a different bright `MeshStandardMaterial`.
 *
 * Render rate is capped at the physics rate so we write body poses directly
 * without prev/curr interpolation (see CoinInstances for rationale).
 */
import * as THREE from 'three';

import { gameBalance } from '../config/gameBalance';
import type { ValuablePool } from '../game/ValuablePool';

const SPHERE_SEGMENTS = 16;
const BOX_SMALL = 0.015;
const SPHERE_RADIUS = 0.018;
const BOX_LARGE = 0.022;
const HIDDEN_Y = -1000;
const AWAKE = 0;
const SLEEPING = 1;

function buildGeometry(variantId: number): THREE.BufferGeometry {
  if (variantId === 0) return new THREE.BoxGeometry(BOX_SMALL, BOX_SMALL, BOX_SMALL);
  if (variantId === 1) return new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
  return new THREE.BoxGeometry(BOX_LARGE, BOX_LARGE, BOX_LARGE);
}

export class ValuableMeshes {
  private readonly meshes: THREE.Mesh[] = [];
  private readonly lastSleeping: Uint8Array;

  constructor(scene: THREE.Scene, pool: ValuablePool) {
    const cap = gameBalance.limits.maxActiveValuables;
    this.lastSleeping = new Uint8Array(cap);
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

  syncRender(pool: ValuablePool): void {
    // Hide all meshes whose slots are no longer active. Skip slots that
    // were released and immediately reacquired in the same frame.
    const released = pool.pool.released;
    for (let n = 0; n < released.length; n += 1) {
      const idx = released[n]!;
      if (pool.pool.get(idx)?.active) continue;
      const mesh = this.meshes[idx];
      if (mesh) mesh.visible = false;
      this.lastSleeping[idx] = AWAKE;
    }
    pool.pool.clearReleased();
    // Newly-acquired slots must always write at least once.
    const justAcquired = pool.pool.justAcquired;
    for (let n = 0; n < justAcquired.length; n += 1) {
      this.lastSleeping[justAcquired[n]!] = AWAKE;
    }
    pool.pool.clearJustAcquired();
    const indices = pool.pool.activeIndices;
    for (let n = 0; n < indices.length; n += 1) {
      const i = indices[n]!;
      const mesh = this.meshes[i];
      if (!mesh) continue;
      const slot = pool.pool.get(i)!;
      const sleeping = slot.body.isSleeping();
      if (sleeping && this.lastSleeping[i] === SLEEPING) continue;
      const t = slot.body.translation();
      const r = slot.body.rotation();
      mesh.visible = true;
      mesh.position.set(t.x, t.y, t.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
      this.lastSleeping[i] = sleeping ? SLEEPING : AWAKE;
    }
  }
}
