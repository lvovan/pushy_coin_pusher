/**
 * Scene lighting: hemisphere + key + fill + warm rim, plus a procedural
 * environment map so metallic materials (coins) actually reflect something
 * and read as "shiny gold" rather than flat dark.
 */
import * as THREE from 'three';

import { gameBalance } from '../config/gameBalance';

const KEY_LIGHT_X = 0.6;
const KEY_LIGHT_Y = 1.4;
const KEY_LIGHT_Z = 0.4;
const FILL_LIGHT_X = -0.7;
const FILL_LIGHT_Y = 0.8;
const FILL_LIGHT_Z = -0.2;
const FILL_LIGHT_INTENSITY = 0.55;
const RIM_LIGHT_X = 0;
const RIM_LIGHT_Y = 0.4;
const RIM_LIGHT_Z = -0.6;
const RIM_LIGHT_INTENSITY = 0.5;
const RIM_LIGHT_COLOR = 0xffb060;
const HEMI_SKY = 0xfff1c4;
const HEMI_GROUND = 0x1a1418;
const HEMI_INTENSITY = 0.45;
const ACCENT_INTENSITY = 0.35;
const ACCENT_DISTANCE = 1.5;
const ACCENT_Y = 0.5;
const ACCENT_Z = 0.4;
const ACCENT_COLOR = 0xffe7c2;
const ENV_SKY_RADIUS = 10;
const ENV_SKY_WIDTH_SEG = 16;
const ENV_SKY_HEIGHT_SEG = 8;
const ENV_CUBE_SIZE = 128;
const ENV_CUBE_NEAR = 0.1;
const ENV_CUBE_FAR = 100;

/**
 * Build a tiny procedural environment map by rendering a colored hemisphere
 * dome into a cube target. The gold material samples this for specular
 * reflections, which is what makes it look "shiny" instead of dark-metallic.
 */
function buildEnvMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  const envScene = new THREE.Scene();
  envScene.add(new THREE.HemisphereLight(HEMI_SKY, HEMI_GROUND, 1));
  // Backdrop gradient via large sphere.
  const skyGeom = new THREE.SphereGeometry(ENV_SKY_RADIUS, ENV_SKY_WIDTH_SEG, ENV_SKY_HEIGHT_SEG);
  const skyMat = new THREE.MeshBasicMaterial({
    color: HEMI_SKY,
    side: THREE.BackSide,
  });
  envScene.add(new THREE.Mesh(skyGeom, skyMat));
  const target = new THREE.WebGLCubeRenderTarget(ENV_CUBE_SIZE);
  const cam = new THREE.CubeCamera(ENV_CUBE_NEAR, ENV_CUBE_FAR, target);
  cam.update(renderer, envScene);
  return target.texture;
}

export function installLighting(scene: THREE.Scene, renderer?: THREE.WebGLRenderer): void {
  const hemi = new THREE.HemisphereLight(HEMI_SKY, HEMI_GROUND, HEMI_INTENSITY);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(0xffffff, gameBalance.render.ambientIntensity);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, gameBalance.render.directionalIntensity);
  key.position.set(KEY_LIGHT_X, KEY_LIGHT_Y, KEY_LIGHT_Z);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, FILL_LIGHT_INTENSITY);
  fill.position.set(FILL_LIGHT_X, FILL_LIGHT_Y, FILL_LIGHT_Z);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(RIM_LIGHT_COLOR, RIM_LIGHT_INTENSITY);
  rim.position.set(RIM_LIGHT_X, RIM_LIGHT_Y, RIM_LIGHT_Z);
  scene.add(rim);

  const accent = new THREE.PointLight(ACCENT_COLOR, ACCENT_INTENSITY, ACCENT_DISTANCE);
  accent.position.set(0, ACCENT_Y, ACCENT_Z);
  scene.add(accent);

  if (renderer) {
    scene.environment = buildEnvMap(renderer);
  }
}
