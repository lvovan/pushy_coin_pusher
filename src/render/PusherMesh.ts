/**
 * PusherMesh — visual cuboid for the kinematic pusher arm. Position is read
 * from the Rapier body each render so it tracks physics exactly.
 */
import * as THREE from 'three';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import helvetikerBoldFont from 'three/examples/fonts/helvetiker_bold.typeface.json';

import { gameBalance } from '../config/gameBalance';
import type { Pusher } from '../game/Pusher';

const HALF = 0.5;
const PUSHER_DEPTH = 0.45;
const PUSHER_HEIGHT = 0.03375;
const PUSHER_WIDTH_MARGIN = 0.02; // matches Tray's WALL_THICKNESS so the visual pusher sits flush between the inner wall faces
const PUSHER_FLOOR_EMBED = 0.005;
// Must match Pusher.ts (game) — seamless slanted front ramp.
const PUSHER_LIP_LENGTH = 0.05;
const PUSHER_LIP_THICKNESS = 0.0015;
const PUSHER_LIP_SLANT_RAD = 0.12;
// "PUSHY" engraving on the back portion of the pusher's top face. Visual
// only — no collider. Looks like an industrially stamped/cast-in brand
// plate: very low relief, dark almost-black metal, slight bevel softening
// the edges, high roughness so the shading reads as a recessed cavity
// rather than a polished raised badge.
const ENGRAVING_TEXT = 'PUSHY';
const ENGRAVING_SIZE = 0.022;
const ENGRAVING_HEIGHT = 0.0015;
// Local Z places the text just in front of the tray's back wall (whose
// inner face is at local Z ≈ +0.085 in pusher space), so it sits at the
// very top of the visible pusher plate — "above the upward wall" from
// the player's perspective.
const ENGRAVING_LOCAL_Z = 0.1;
const ENGRAVING_BEVEL_THICKNESS = 0.00025;
const ENGRAVING_BEVEL_SIZE = 0.00025;
const ENGRAVING_BEVEL_SEGMENTS = 2;
const ENGRAVING_CURVE_SEGMENTS = 6;
const ENGRAVING_COLOR = 0x0a0c0e;
const ENGRAVING_METALNESS = 0.85;
const ENGRAVING_ROUGHNESS = 0.55;

export class PusherMesh {
  readonly mesh: THREE.Mesh;
  private readonly prevPos = new THREE.Vector3();
  private readonly currPos = new THREE.Vector3();
  private readonly prevQuat = new THREE.Quaternion();
  private readonly currQuat = new THREE.Quaternion();
  private readonly tmpQuat = new THREE.Quaternion();

  constructor(scene: THREE.Scene, private readonly pusher: Pusher) {
    const width = gameBalance.tray.width - PUSHER_WIDTH_MARGIN;
    const geom = new THREE.BoxGeometry(width, PUSHER_HEIGHT, PUSHER_DEPTH);
    const mat = new THREE.MeshStandardMaterial({
      color: gameBalance.render.pusherColor,
      metalness: gameBalance.render.coinMetalness * gameBalance.render.coinRoughness,
      roughness: gameBalance.render.coinRoughness,
    });
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.position.set(0, PUSHER_HEIGHT * HALF - PUSHER_FLOOR_EMBED, gameBalance.pusher.basePositionZ);
    this.currPos.copy(this.mesh.position);
    this.prevPos.copy(this.mesh.position);

    // Front-edge slanted ramp — child mesh, moves with the pusher. Back-top
    // edge meets the pusher top flush; back-bottom is hidden inside the
    // pusher so the seam is invisible.
    const lipCos = Math.cos(PUSHER_LIP_SLANT_RAD);
    const lipSin = Math.sin(PUSHER_LIP_SLANT_RAD);
    const lipGeom = new THREE.BoxGeometry(width, PUSHER_LIP_THICKNESS, PUSHER_LIP_LENGTH);
    const lipMesh = new THREE.Mesh(lipGeom, mat);
    lipMesh.position.set(
      0,
      PUSHER_HEIGHT * HALF -
        PUSHER_LIP_THICKNESS * HALF * lipCos +
        PUSHER_LIP_LENGTH * HALF * lipSin,
      PUSHER_DEPTH * HALF -
        PUSHER_LIP_LENGTH * HALF * lipCos +
        PUSHER_LIP_THICKNESS * HALF * lipSin,
    );
    lipMesh.rotation.x = -PUSHER_LIP_SLANT_RAD;
    this.mesh.add(lipMesh);

    // Industrially-stamped "PUSHY" engraving on the back portion of the
    // pusher's top face. TextGeometry is extruded along its local +Z then
    // rotated -90° about X so the extrusion ends up pointing along world
    // +Y (i.e. rising out of the pusher top). Centring the geometry first
    // means the rotation pivots around the text's own bounding-box centre.
    const font = new Font(helvetikerBoldFont);
    const textGeom = new TextGeometry(ENGRAVING_TEXT, {
      font,
      size: ENGRAVING_SIZE,
      // NOTE: TextGeometry's option is `height` (not `depth`). Internally
      // it rewrites `parameters.depth = parameters.height ?? 50`, so a
      // `depth` key is silently dropped and the extrusion defaults to 50
      // metres — producing massive vertical columns instead of low relief.
      height: ENGRAVING_HEIGHT,
      curveSegments: ENGRAVING_CURVE_SEGMENTS,
      bevelEnabled: true,
      bevelThickness: ENGRAVING_BEVEL_THICKNESS,
      bevelSize: ENGRAVING_BEVEL_SIZE,
      bevelOffset: 0,
      bevelSegments: ENGRAVING_BEVEL_SEGMENTS,
    });
    textGeom.center();
    textGeom.rotateX(-Math.PI * HALF);
    // After centring + rotation the geometry's Y extent is symmetric around
    // 0 (range = ±ENGRAVING_HEIGHT/2). Shift Y so the bottom face sits flush
    // on the pusher's top surface (local Y = +PUSHER_HEIGHT/2), then push
    // the whole thing toward the back of the pusher in local Z.
    textGeom.translate(0, PUSHER_HEIGHT * HALF + ENGRAVING_HEIGHT * HALF, ENGRAVING_LOCAL_Z);
    const textMat = new THREE.MeshStandardMaterial({
      color: ENGRAVING_COLOR,
      metalness: ENGRAVING_METALNESS,
      roughness: ENGRAVING_ROUGHNESS,
    });
    const textMesh = new THREE.Mesh(textGeom, textMat);
    this.mesh.add(textMesh);

    scene.add(this.mesh);
  }

  /** Snapshot current pose into previous in preparation for the next step. */
  snapshotPrev(): void {
    this.prevPos.copy(this.currPos);
    this.prevQuat.copy(this.currQuat);
  }

  /** Read the current pose from the kinematic body. */
  captureCurrent(): void {
    const t = this.pusher.body.translation();
    const r = this.pusher.body.rotation();
    this.currPos.set(t.x, t.y, t.z);
    this.currQuat.set(r.x, r.y, r.z, r.w);
  }

  /** Render-time interpolation; `alpha ∈ [0,1)` from FixedStepAccumulator. */
  syncRender(alpha: number): void {
    this.mesh.position.set(
      this.prevPos.x + (this.currPos.x - this.prevPos.x) * alpha,
      this.prevPos.y + (this.currPos.y - this.prevPos.y) * alpha,
      this.prevPos.z + (this.currPos.z - this.prevPos.z) * alpha,
    );
    this.tmpQuat.copy(this.prevQuat).slerp(this.currQuat, alpha);
    this.mesh.quaternion.copy(this.tmpQuat);
  }
}
