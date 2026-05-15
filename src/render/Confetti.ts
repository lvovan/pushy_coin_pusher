/**
 * Confetti — burst particle effect triggered when a valuable is scored.
 *
 * Uses a single `THREE.InstancedMesh` of small colored quads. A fixed-capacity
 * particle pool is updated each render frame: gravity-driven motion, spin,
 * and life-based fade-out. Hidden particles are scaled to zero so they cost
 * no fragment work.
 */
import * as THREE from 'three';

import { gameBalance } from '../config/gameBalance';

const HIDDEN_Y = -1000;
const HALF = 0.5;
const TAU = Math.PI * 2;
const MS_PER_SECOND = 1000;
const FADE_START_FRACTION = 0.6;
const COLOR_STRIDE = 3;

const tmpMatrix = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpColor = new THREE.Color();

export class Confetti {
  private readonly mesh: THREE.InstancedMesh;
  private readonly capacity: number;
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly rot: Float32Array;
  private readonly rotAxisX: Float32Array;
  private readonly rotAxisY: Float32Array;
  private readonly rotAxisZ: Float32Array;
  private readonly spin: Float32Array;
  private readonly life: Float32Array;
  private readonly lifeMax: Float32Array;
  private readonly baseR: Float32Array;
  private readonly baseG: Float32Array;
  private readonly baseB: Float32Array;
  private nextWriteIndex = 0;

  constructor(scene: THREE.Scene) {
    const { particlesPerBurst, maxBursts, particleSize } = gameBalance.confetti;
    this.capacity = particlesPerBurst * maxBursts;

    const geom = new THREE.PlaneGeometry(particleSize, particleSize);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geom, mat, this.capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    // Allocate per-instance color buffer.
    const colorArr = new Float32Array(this.capacity * COLOR_STRIDE);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colorArr, COLOR_STRIDE);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

    this.px = new Float32Array(this.capacity);
    this.py = new Float32Array(this.capacity);
    this.pz = new Float32Array(this.capacity);
    this.vx = new Float32Array(this.capacity);
    this.vy = new Float32Array(this.capacity);
    this.vz = new Float32Array(this.capacity);
    this.rot = new Float32Array(this.capacity);
    this.rotAxisX = new Float32Array(this.capacity);
    this.rotAxisY = new Float32Array(this.capacity);
    this.rotAxisZ = new Float32Array(this.capacity);
    this.spin = new Float32Array(this.capacity);
    this.life = new Float32Array(this.capacity);
    this.lifeMax = new Float32Array(this.capacity);
    this.baseR = new Float32Array(this.capacity);
    this.baseG = new Float32Array(this.capacity);
    this.baseB = new Float32Array(this.capacity);

    // Initialise all instances hidden (zero-scaled, off-screen).
    tmpPos.set(0, HIDDEN_Y, 0);
    tmpQuat.identity();
    tmpScale.set(0, 0, 0);
    for (let i = 0; i < this.capacity; i += 1) {
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      this.mesh.setMatrixAt(i, tmpMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);
  }

  /** Emit a burst at the given world position. */
  burst(x: number, y: number, z: number): void {
    const c = gameBalance.confetti;
    for (let n = 0; n < c.particlesPerBurst; n += 1) {
      const i = this.nextWriteIndex;
      this.nextWriteIndex = (this.nextWriteIndex + 1) % this.capacity;

      // Spherical-ish ejection biased upward.
      const angle = Math.random() * TAU;
      const lateral = c.lateralVelocity * (HALF + Math.random() * HALF);
      this.px[i] = x;
      this.py[i] = y;
      this.pz[i] = z;
      this.vx[i] = Math.cos(angle) * lateral;
      this.vz[i] = Math.sin(angle) * lateral;
      this.vy[i] = c.upwardVelocity + (Math.random() - HALF) * 2 * c.upwardVelocityJitter;

      // Random spin axis & rate.
      const ax = Math.random() - HALF;
      const ay = Math.random() - HALF;
      const az = Math.random() - HALF;
      const aLen = Math.hypot(ax, ay, az) || 1;
      this.rotAxisX[i] = ax / aLen;
      this.rotAxisY[i] = ay / aLen;
      this.rotAxisZ[i] = az / aLen;
      this.rot[i] = Math.random() * TAU;
      this.spin[i] = (Math.random() - HALF) * 2 * c.spinVelocity;

      this.life[i] = c.particleLifeMs;
      this.lifeMax[i] = c.particleLifeMs;

      const colorHex = c.colors[(Math.random() * c.colors.length) | 0] ?? c.colors[0]!;
      tmpColor.setHex(colorHex);
      this.baseR[i] = tmpColor.r;
      this.baseG[i] = tmpColor.g;
      this.baseB[i] = tmpColor.b;
    }
  }

  /** Per-frame update. `dtMs` is the elapsed wall-clock time since the last render. */
  update(dtMs: number): void {
    const c = gameBalance.confetti;
    const dt = dtMs / MS_PER_SECOND;
    const g = c.gravity;
    let anyVisible = false;
    for (let i = 0; i < this.capacity; i += 1) {
      if (this.life[i]! <= 0) {
        // Already hidden; keep its matrix zero-scaled (set when it expired).
        continue;
      }
      this.life[i]! -= dtMs;
      // Integrate.
      this.vy[i]! += g * dt;
      this.px[i]! += this.vx[i]! * dt;
      this.py[i]! += this.vy[i]! * dt;
      this.pz[i]! += this.vz[i]! * dt;
      this.rot[i]! += this.spin[i]! * dt;

      const remaining = this.life[i]!;
      if (remaining <= 0) {
        // Expire: hide by zero scale.
        tmpPos.set(0, HIDDEN_Y, 0);
        tmpQuat.identity();
        tmpScale.set(0, 0, 0);
        tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
        this.mesh.setMatrixAt(i, tmpMatrix);
        continue;
      }

      anyVisible = true;
      const lifeFrac = remaining / this.lifeMax[i]!;
      // Fade by shrinking the scale during the tail end of life.
      const scaleFrac = lifeFrac >= FADE_START_FRACTION
        ? 1
        : lifeFrac / FADE_START_FRACTION;

      tmpPos.set(this.px[i]!, this.py[i]!, this.pz[i]!);
      tmpQuat.setFromAxisAngle(
        tmpScale.set(this.rotAxisX[i]!, this.rotAxisY[i]!, this.rotAxisZ[i]!),
        this.rot[i]!,
      );
      tmpScale.set(scaleFrac, scaleFrac, scaleFrac);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      this.mesh.setMatrixAt(i, tmpMatrix);

      // Color stays constant; written once when the burst spawned but the
      // attribute is allocated, so push the value each update for simplicity.
      const ci = i * COLOR_STRIDE;
      const colorArr = this.mesh.instanceColor!.array as Float32Array;
      colorArr[ci] = this.baseR[i]!;
      colorArr[ci + 1] = this.baseG[i]!;
      colorArr[ci + 2] = this.baseB[i]!;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    // Bill the active range so the GPU skips hidden tail instances entirely.
    this.mesh.count = anyVisible ? this.capacity : 0;
  }

  reset(): void {
    for (let i = 0; i < this.capacity; i += 1) {
      this.life[i] = 0;
    }
    tmpPos.set(0, HIDDEN_Y, 0);
    tmpQuat.identity();
    tmpScale.set(0, 0, 0);
    for (let i = 0; i < this.capacity; i += 1) {
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      this.mesh.setMatrixAt(i, tmpMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.count = 0;
  }
}
