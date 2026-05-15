/**
 * Rapier physics world wrapper.
 *
 * - Async init (Rapier WASM compat).
 * - Fixed-timestep simulation owned by GameLoop.
 * - Exposes a `phase` flag ('idle' | 'stepping') consumed by SaveScheduler so
 *   serialization never runs mid-step (Constitution Principle IV; research §R5).
 */
import RAPIER from '@dimforge/rapier3d-compat';

import { gameBalance } from '../config/gameBalance';

export type PhysicsPhase = 'idle' | 'stepping';

// Rapier's default solver runs `numSolverIterations = 4` PGS iterations
// per step. For piles of small rigid bodies that's not enough to resolve
// stacked contacts cleanly: the solver leaves residual velocity in the
// pile every step, which the integrator then turns into visible
// position jitter — even on bodies resting on a completely static
// floor. Doubling the iteration count is the standard Rapier recipe for
// "stuff jitters when stacked": it costs a small amount of CPU per
// step but eliminates the jitter at the source. We do NOT change
// `lengthUnit` — shrinking it scales contact stiffness up, which makes
// stacks bouncier, not calmer.
const SOLVER_ITERATIONS = 12;
const FRICTION_ITERATIONS = 12;

let rapierReady: Promise<void> | undefined;

async function ensureRapier(): Promise<void> {
  if (!rapierReady) rapierReady = RAPIER.init();
  return rapierReady;
}

export interface ContactBetween {
  handleA: number;
  handleB: number;
}

export interface SensorEvent {
  sensorHandle: number;
  otherHandle: number;
  started: boolean; // true = enter, false = exit
}

export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly eventQueue: RAPIER.EventQueue;
  phase: PhysicsPhase = 'idle';

  private constructor(world: RAPIER.World) {
    this.world = world;
    this.eventQueue = new RAPIER.EventQueue(true);
    const g = gameBalance.physics.gravity;
    this.world.gravity = { x: g[0], y: g[1], z: g[2] };
    const ip = this.world.integrationParameters;
    ip.dt = 1 / gameBalance.physics.fixedTimestepHz;
    ip.numSolverIterations = SOLVER_ITERATIONS;
    ip.numAdditionalFrictionIterations = FRICTION_ITERATIONS;
  }

  static async create(): Promise<PhysicsWorld> {
    await ensureRapier();
    const g = gameBalance.physics.gravity;
    const world = new RAPIER.World({ x: g[0], y: g[1], z: g[2] });
    const ip = world.integrationParameters;
    ip.dt = 1 / gameBalance.physics.fixedTimestepHz;
    ip.numSolverIterations = SOLVER_ITERATIONS;
    ip.numAdditionalFrictionIterations = FRICTION_ITERATIONS;
    return new PhysicsWorld(world);
  }

  /** Run one fixed step. Drains sensor + contact events via the callbacks. */
  step(onSensor?: (e: SensorEvent) => void, onContact?: (c: ContactBetween) => void): void {
    this.phase = 'stepping';
    this.world.step(this.eventQueue);
    if (onSensor) {
      this.eventQueue.drainCollisionEvents((h1, h2, started) => {
        const c1 = this.world.getCollider(h1);
        const c2 = this.world.getCollider(h2);
        if (!c1 || !c2) return;
        if (c1.isSensor() && !c2.isSensor()) {
          onSensor({ sensorHandle: h1, otherHandle: h2, started });
        } else if (c2.isSensor() && !c1.isSensor()) {
          onSensor({ sensorHandle: h2, otherHandle: h1, started });
        } else if (onContact && started) {
          onContact({ handleA: h1, handleB: h2 });
        }
      });
    } else {
      this.eventQueue.drainCollisionEvents(() => {
        /* discard */
      });
    }
    this.phase = 'idle';
  }

  dispose(): void {
    this.eventQueue.free();
    this.world.free();
  }
}

export { RAPIER };
