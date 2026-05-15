/**
 * Three.js renderer scaffold.
 *
 * Owns the WebGLRenderer, scene, and perspective camera framed for portrait
 * gameplay. The render call is driven by GameLoop once per rAF tick.
 */
import * as THREE from 'three';

import { gameBalance } from '../config/gameBalance';

const FOV_DEGREES = 55;
const NEAR_PLANE = 0.01;
const FAR_PLANE = 10;
const CAMERA_X = 0;
const CAMERA_HEIGHT = 0.7;
const CAMERA_DEPTH = 0.85;
const CAMERA_LOOK_Y = -0.08;
const CAMERA_LOOK_Z = 0.06;
const DPR_CLAMP_DESKTOP = 2;
const DPR_CLAMP_TOUCH = 1.5;
const TONE_MAPPING_EXPOSURE = 1.15;

/**
 * True if the device is touch-first (coarse pointer or has touch points).
 * We use the same heuristic on mobile + tablets to drop MSAA and clamp DPR,
 * both of which are dominant costs on tiled GPUs.
 */
function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator;
  if (nav && typeof nav.maxTouchPoints === 'number' && nav.maxTouchPoints > 0) return true;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) {
    return true;
  }
  return 'ontouchstart' in window;
}

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  constructor(canvas: HTMLCanvasElement) {
    const touch = isTouchDevice();
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      // MSAA is the dominant fragment-shader cost on tiled mobile GPUs. We
      // skip it on touch devices and rely on the smaller DPR ceiling plus
      // built-in shader filtering to keep edges acceptable.
      antialias: !touch,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    const dprCap = touch ? DPR_CLAMP_TOUCH : DPR_CLAMP_DESKTOP;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
    this.renderer.setClearColor(gameBalance.render.backgroundColor, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(gameBalance.render.backgroundColor);

    this.camera = new THREE.PerspectiveCamera(FOV_DEGREES, 1, NEAR_PLANE, FAR_PLANE);
    this.camera.position.set(CAMERA_X, CAMERA_HEIGHT, CAMERA_DEPTH);
    this.camera.lookAt(CAMERA_X, CAMERA_LOOK_Y, CAMERA_LOOK_Z);
  }

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
