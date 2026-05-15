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

function buildGeometry(variantId: number): THREE.BufferGeometry {
  if (variantId === 0) return new THREE.BoxGeometry(BOX_SMALL, BOX_SMALL, BOX_SMALL);
  if (variantId === 1) return new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
  return new THREE.BoxGeometry(BOX_LARGE, BOX_LARGE, BOX_LARGE);
}

export class ValuableMeshes {
  private readonly meshes: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene, pool: ValuablePool) {
    const cap = gameBalance.limits.maxActiveValuables;
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

  syncFromPool(pool: ValuablePool): void {
    for (const mesh of this.meshes) mesh.visible = false;
    for (const slot of pool.active()) {
      const t = slot.body.translation();
      const r = slot.body.rotation();
      const mesh = this.meshes[slot.index];
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(t.x, t.y, t.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }
}
