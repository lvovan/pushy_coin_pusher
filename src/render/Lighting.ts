/**
 * Scene lighting: ambient + directional, with a subtle accent point light.
 */
import * as THREE from 'three';

import { gameBalance } from '../config/gameBalance';

const DIR_LIGHT_X = 0.4;
const DIR_LIGHT_Y = 1.2;
const DIR_LIGHT_Z = 0.3;
const POINT_LIGHT_INTENSITY = 0.3;
const POINT_LIGHT_DISTANCE = 1.5;
const POINT_LIGHT_Y = 0.5;
const POINT_LIGHT_Z = 0.4;
const POINT_LIGHT_COLOR = 0xffe7c2;

export function installLighting(scene: THREE.Scene): void {
  const ambient = new THREE.AmbientLight(0xffffff, gameBalance.render.ambientIntensity);
  scene.add(ambient);

  const dir = new THREE.DirectionalLight(0xffffff, gameBalance.render.directionalIntensity);
  dir.position.set(DIR_LIGHT_X, DIR_LIGHT_Y, DIR_LIGHT_Z);
  scene.add(dir);

  const accent = new THREE.PointLight(POINT_LIGHT_COLOR, POINT_LIGHT_INTENSITY, POINT_LIGHT_DISTANCE);
  accent.position.set(0, POINT_LIGHT_Y, POINT_LIGHT_Z);
  scene.add(accent);
}
