/**
 * Coin — pool-backed dynamic Rapier body with cylinder collider.
 *
 * The CoinPool pre-allocates `maxActiveCoins` bodies at boot. Spawning a coin
 * acquires a slot, teleports its body, wakes it, and toggles a `visible` flag
 * so the renderer's InstancedMesh knows to draw it.
 */
import RAPIER from '@dimforge/rapier3d-compat';

import { gameBalance } from '../config/gameBalance';
import { ObjectPool } from './ObjectPool';
import type { PhysicsWorld } from './PhysicsWorld';

const PARK_Y = -100; // off-screen storage Y for inactive coins (impl detail)
const HALF = 0.5;
const REST_VELOCITY_EPSILON = 0.001;
const LINEAR_DAMPING = 0.1;
const ANGULAR_DAMPING = 0.2;

export interface CoinSlot {
  active: boolean;
  index: number;
  bodyHandle: number;
  colliderHandle: number;
  body: RAPIER.RigidBody;
}

export class CoinPool {
  readonly pool: ObjectPool<CoinSlot>;
  private readonly world: PhysicsWorld;
  private readonly handleToIndex = new Map<number, number>();

  constructor(world: PhysicsWorld) {
    this.world = world;
    const radius = gameBalance.physics.coinRadius;
    const thickness = gameBalance.physics.coinThickness;
    const mass = gameBalance.physics.coinMass;
    const friction = gameBalance.physics.coinFriction;
    const restitution = gameBalance.physics.coinRestitution;

    this.pool = new ObjectPool<CoinSlot>(gameBalance.limits.maxActiveCoins, (index) => {
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, PARK_Y - index, 0)
        .setCcdEnabled(true)
        .setLinearDamping(LINEAR_DAMPING)
        .setAngularDamping(ANGULAR_DAMPING);
      const body = world.world.createRigidBody(bodyDesc);
      const colDesc = RAPIER.ColliderDesc.cylinder(thickness * HALF, radius)
        .setDensity(mass / (Math.PI * radius * radius * thickness))
        .setFriction(friction)
        .setRestitution(restitution);
      const col = world.world.createCollider(colDesc, body);
      body.sleep();
      this.handleToIndex.set(col.handle, index);
      return {
        active: false,
        index,
        bodyHandle: body.handle,
        colliderHandle: col.handle,
        body,
      };
    });
  }

  spawn(x: number, y: number, z: number): CoinSlot | undefined {
    const slot = this.pool.acquire();
    if (!slot) return undefined;
    slot.body.setTranslation({ x, y, z }, true);
    slot.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    slot.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    slot.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    slot.body.wakeUp();
    return slot;
  }

  releaseByColliderHandle(colliderHandle: number): boolean {
    const idx = this.handleToIndex.get(colliderHandle);
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

  findByColliderHandle(handle: number): CoinSlot | undefined {
    const idx = this.handleToIndex.get(handle);
    if (idx === undefined) return undefined;
    return this.pool.get(idx);
  }

  *active(): Iterable<CoinSlot> {
    yield* this.pool.inUse();
  }

  get activeCount(): number {
    return this.pool.activeCount;
  }

  /** True when every active coin's linear + angular speed is below epsilon. */
  allAtRest(): boolean {
    for (const slot of this.active()) {
      const lv = slot.body.linvel();
      const av = slot.body.angvel();
      const lvSq = lv.x * lv.x + lv.y * lv.y + lv.z * lv.z;
      const avSq = av.x * av.x + av.y * av.y + av.z * av.z;
      if (lvSq > REST_VELOCITY_EPSILON || avSq > REST_VELOCITY_EPSILON) return false;
    }
    return true;
  }

  /**
   * Add a uniform horizontal velocity delta to every active coin \u2014 the
   * physics-side effect of a player "shove" of the cabinet. From the
   * playfield's reference frame the cabinet jerks in one direction, so every
   * loose coin inherits an opposite-direction velocity bump (inertia), the
   * same principle as nudging a pinball machine.
   */
  applyShove(dvx: number, dvz: number): void {
    for (const slot of this.active()) {
      const lv = slot.body.linvel();
      slot.body.setLinvel({ x: lv.x + dvx, y: lv.y, z: lv.z + dvz }, true);
      slot.body.wakeUp();
    }
  }
}
