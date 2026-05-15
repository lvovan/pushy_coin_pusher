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
const PUSHER_HEIGHT = 0.03375; // 35% taller than the original 0.025 so coins falling off the pusher onto the plate drop further
const PUSHER_WIDTH_MARGIN = 0.02; // matches the tray's wall thickness so the pusher sits flush between the inner faces of the left/right walls
const PUSHER_FLOOR_EMBED = 0.005; // sink the bottom face below the floor so coins can never slip under
// Slanted retaining lip along the pusher's leading (front) edge: a thin
// gently-tilted ramp whose back-top edge meets the pusher's top face
// flush (seamless) while its back-bottom edge is hidden inside the
// pusher. Coins climbing forward see one continuous ramp emerging from
// the pusher and rising to a small lip at the front, mirroring a real
// arcade coin-pusher's slanted front edge.
const PUSHER_LIP_LENGTH = 0.05; // ramp length along its own (tilted) axis
const PUSHER_LIP_THICKNESS = 0.0015; // perpendicular thickness of the ramp slab
const PUSHER_LIP_SLANT_RAD = 0.12; // ~7° — gentle slope; rises ~6mm over 50mm
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

    // Pusher front ramp — the lip is a thin slanted slab attached as a
    // child collider so it moves with the kinematic body. Its back-top
    // edge meets the pusher's top face flush (seamless transition) and it
    // rises gently toward the pusher's front edge; the back-bottom edge
    // is hidden inside the pusher so there is no step for coins to catch
    // on. Mathematically: with the ramp centered at (cy, cz) and rotated
    // by -slant around X, the back-top corner sits at (top, front-len*cos).
    const lipCos = Math.cos(PUSHER_LIP_SLANT_RAD);
    const lipSin = Math.sin(PUSHER_LIP_SLANT_RAD);
    const lipSinH = Math.sin(PUSHER_LIP_SLANT_RAD * STROKE_HALF);
    const lipCosH = Math.cos(PUSHER_LIP_SLANT_RAD * STROKE_HALF);
    const lipCenterY =
      PUSHER_HEIGHT * STROKE_HALF -
      PUSHER_LIP_THICKNESS * STROKE_HALF * lipCos +
      PUSHER_LIP_LENGTH * STROKE_HALF * lipSin;
    const lipCenterZ =
      PUSHER_DEPTH * STROKE_HALF -
      PUSHER_LIP_LENGTH * STROKE_HALF * lipCos +
      PUSHER_LIP_THICKNESS * STROKE_HALF * lipSin;
    const lipDesc = RAPIER.ColliderDesc.cuboid(
      halfWidth,
      PUSHER_LIP_THICKNESS * STROKE_HALF,
      PUSHER_LIP_LENGTH * STROKE_HALF,
    )
      .setTranslation(0, lipCenterY, lipCenterZ)
      .setRotation({ x: -lipSinH, y: 0, z: 0, w: lipCosH })
      .setFriction(gameBalance.physics.coinFriction);
    world.world.createCollider(lipDesc, this.body);
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
