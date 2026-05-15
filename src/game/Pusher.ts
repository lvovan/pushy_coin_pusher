/**
 * Pusher — the kinematic plate that strokes back-and-forth, advancing coins
 * toward the front of the tray.
 *
 * Stroke equation (data-model.md §State machine, research §R3):
 *   z = basePositionZ + amplitude * (1 - cos(2π · phase)) / 2
 * where phase ∈ [0, 1) advances with elapsed ms / strokePeriodMs.
 */
import RAPIER from '@dimforge/rapier3d-compat';

import { gameBalance } from '../config/gameBalance';
import type { PhysicsWorld } from './PhysicsWorld';

const PUSHER_DEPTH = 0.45; // deep enough that the back stays behind the back wall through the full stroke
const PUSHER_HEIGHT = 0.025; // taller than a coin so coins can't slide over it
const PUSHER_WIDTH_MARGIN = 0.04;
const PUSHER_FLOOR_EMBED = 0.005; // sink the bottom face below the floor so coins can never slip under
const TWO_PI = Math.PI * 2;
const COS_OFFSET = 1;
const STROKE_HALF = 0.5;

export class Pusher {
  readonly body: RAPIER.RigidBody;
  readonly handle: number;
  private phase = 0;

  constructor(world: PhysicsWorld) {
    const halfWidth = (gameBalance.tray.width - PUSHER_WIDTH_MARGIN) * STROKE_HALF;
    const yCenter = PUSHER_HEIGHT * STROKE_HALF - PUSHER_FLOOR_EMBED; // bottom sits below floor surface
    const desc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      0,
      yCenter,
      gameBalance.pusher.basePositionZ,
    );
    this.body = world.world.createRigidBody(desc);
    const colDesc = RAPIER.ColliderDesc.cuboid(
      halfWidth,
      PUSHER_HEIGHT * STROKE_HALF,
      PUSHER_DEPTH * STROKE_HALF,
    ).setFriction(gameBalance.physics.coinFriction);
    const col = world.world.createCollider(colDesc, this.body);
    this.handle = col.handle;
  }

  update(dtMs: number): void {
    this.phase = (this.phase + dtMs / gameBalance.pusher.strokePeriodMs) % COS_OFFSET;
    const z =
      gameBalance.pusher.basePositionZ +
      gameBalance.pusher.strokeAmplitude *
        (COS_OFFSET - Math.cos(TWO_PI * this.phase)) *
        STROKE_HALF;
    this.body.setNextKinematicTranslation({
      x: 0,
      y: PUSHER_HEIGHT * STROKE_HALF - PUSHER_FLOOR_EMBED,
      z,
    });
  }

  getPhase(): number {
    return this.phase;
  }

  setPhase(phase: number): void {
    this.phase = phase % COS_OFFSET;
  }
}
