/**
 * ValuablePool — small pool of distinctive prizes seeded at game start.
 *
 * Three variants (0/1/2) use the corresponding mass multiplier from
 * gameBalance.physics.valuableMassMultipliers and a simple primitive
 * collider per variant: 0 = small box, 1 = sphere, 2 = larger box.
 *
 * Per Clarification Q1, valuables are placed once at session start and never
 * respawn during play.
 */
import RAPIER from '@dimforge/rapier3d-compat';

import { gameBalance } from '../config/gameBalance';
import { ObjectPool } from './ObjectPool';
import type { PhysicsWorld } from './PhysicsWorld';

const PARK_Y = -200;
const HALF = 0.5;
const VARIANT_COUNT = 3;
const VARIANT_BOX_SMALL = 0.015;
const VARIANT_SPHERE_RADIUS = 0.018;
const VARIANT_BOX_LARGE = 0.022;
const LINEAR_DAMPING = 0.2;
const ANGULAR_DAMPING = 0.25;

export interface ValuableSlot {
  active: boolean;
  index: number;
  variantId: number;
  bodyHandle: number;
  colliderHandle: number;
  body: RAPIER.RigidBody;
}

function variantHalfExtents(variantId: number): { type: 'box' | 'sphere'; size: number } {
  if (variantId === 0) return { type: 'box', size: VARIANT_BOX_SMALL };
  if (variantId === 1) return { type: 'sphere', size: VARIANT_SPHERE_RADIUS };
  return { type: 'box', size: VARIANT_BOX_LARGE };
}

export class ValuablePool {
  readonly pool: ObjectPool<ValuableSlot>;
  private readonly world: PhysicsWorld;
  private readonly handleToIndex = new Map<number, number>();

  constructor(world: PhysicsWorld) {
    this.world = world;
    const cap = gameBalance.limits.maxActiveValuables;
    this.pool = new ObjectPool<ValuableSlot>(cap, (index) => {
      const variantId = index % VARIANT_COUNT;
      const shape = variantHalfExtents(variantId);
      const massMult = gameBalance.physics.valuableMassMultipliers[variantId] ?? 1;
      const mass = gameBalance.physics.coinMass * massMult;

      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, PARK_Y - index, 0)
        .setCcdEnabled(true)
        .setLinearDamping(LINEAR_DAMPING)
        .setAngularDamping(ANGULAR_DAMPING);
      const body = world.world.createRigidBody(bodyDesc);

      let colDesc: RAPIER.ColliderDesc;
      if (shape.type === 'sphere') {
        const r = shape.size;
        const volume = (4 / 3) * Math.PI * r * r * r; // @no-magic-ok
        colDesc = RAPIER.ColliderDesc.ball(r).setDensity(mass / volume);
      } else {
        const h = shape.size * HALF;
        const volume = shape.size * shape.size * shape.size;
        colDesc = RAPIER.ColliderDesc.cuboid(h, h, h).setDensity(mass / volume);
      }
      colDesc = colDesc
        .setFriction(gameBalance.physics.valuableFriction)
        .setRestitution(gameBalance.physics.valuableRestitution)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      const col = world.world.createCollider(colDesc, body);
      body.sleep();
      this.handleToIndex.set(col.handle, index);
      return {
        active: false,
        index,
        variantId,
        bodyHandle: body.handle,
        colliderHandle: col.handle,
        body,
      };
    });
  }

  /**
   * Acquire a slot. If a free slot of the requested variant exists, prefer it
   * so save/restore preserves variant identity; otherwise return any free slot.
   */
  spawnVariant(variantId: number, x: number, y: number, z: number): ValuableSlot | undefined {
    let slot: ValuableSlot | undefined;
    for (const candidate of this.pool.all()) {
      if (!candidate.active && candidate.variantId === variantId) {
        slot = candidate;
        break;
      }
    }
    if (slot) {
      // Manual acquire on a specific slot: we use the public API consistently
      // by releasing into a free list isn't possible, so we directly mark active.
      // This bypasses the ObjectPool free-list bookkeeping for a one-shot match.
      // Safe because we only do this at session start / restore.
      this.acquireSpecific(slot);
    } else {
      slot = this.pool.acquire();
    }
    if (!slot) return undefined;
    slot.body.setTranslation({ x, y, z }, true);
    slot.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    slot.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    slot.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    slot.body.wakeUp();
    return slot;
  }

  private acquireSpecific(slot: ValuableSlot): void {
    // Find the slot via ObjectPool by repeatedly acquiring + releasing until we
    // expose the target. This keeps the free-list invariant intact.
    const trail: ValuableSlot[] = [];
    for (;;) {
      const next = this.pool.acquire();
      if (!next) break;
      if (next.index === slot.index) {
        // Release everything we held in reverse.
        for (let i = trail.length - 1; i >= 0; i -= 1) this.pool.releaseAt(trail[i]!.index);
        return;
      }
      trail.push(next);
    }
    // If we couldn't find it (already active or capacity issue), release trail.
    for (let i = trail.length - 1; i >= 0; i -= 1) this.pool.releaseAt(trail[i]!.index);
  }

  releaseByColliderHandle(handle: number): boolean {
    const idx = this.handleToIndex.get(handle);
    if (idx === undefined) return false;
    return this.releaseByIndex(idx);
  }

  releaseByIndex(index: number): boolean {
    const slot = this.pool.get(index);
    if (!slot || !slot.active) return false;
    slot.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    slot.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    slot.body.setTranslation({ x: 0, y: PARK_Y - index, z: 0 }, true);
    slot.body.sleep();
    return this.pool.releaseAt(index);
  }

  findByColliderHandle(handle: number): ValuableSlot | undefined {
    const idx = this.handleToIndex.get(handle);
    if (idx === undefined) return undefined;
    return this.pool.get(idx);
  }

  *active(): Iterable<ValuableSlot> {
    yield* this.pool.inUse();
  }

  get activeCount(): number {
    return this.pool.activeCount;
  }
}
