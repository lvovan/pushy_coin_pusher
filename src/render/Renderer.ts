/**
 * Three.js renderer scaffold.
 *
 * Owns the WebGLRenderer, scene, and perspective camera framed for portrait
 * gameplay. The render call is driven by GameLoop once per rAF tick.
 */
import * as THREE from 'three';

import { gameBalance } from '../config/gameBalance';

const FOV_DEGREES = 50;
const NEAR_PLANE = 0.01;
const FAR_PLANE = 10;
const CAMERA_HEIGHT = 0.6;
const CAMERA_DEPTH = 0.55;
const CAMERA_LOOK_Y = 0;
const DPR_CLAMP = 2;

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, DPR_CLAMP));
    this.renderer.setClearColor(gameBalance.render.backgroundColor, 1);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(gameBalance.render.backgroundColor);

    this.camera = new THREE.PerspectiveCamera(FOV_DEGREES, 1, NEAR_PLANE, FAR_PLANE);
    this.camera.position.set(0, CAMERA_HEIGHT, CAMERA_DEPTH);
    this.camera.lookAt(0, CAMERA_LOOK_Y, 0);
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
