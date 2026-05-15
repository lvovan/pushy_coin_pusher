/**
 * Scene lighting: hemisphere fill + one key directional light + a procedural
 * environment map. The env map provides ambient bounce and specular for the
 * gold coin material; combined with one directional shaper this gives a
 * convincing "shiny gold" read while keeping the fragment cost of the
 * standard PBR shader minimal on mobile GPUs.
 *
 * (We previously stacked hemisphere + ambient + 3 directional + point lights;
 * with `MeshStandardMaterial`, each extra light is per-fragment work, which
 * was the dominant cost at 200+ visible instanced coins.)
 */
import * as THREE from 'three';

import { gameBalance } from '../config/gameBalance';

const KEY_LIGHT_X = 0.6;
const KEY_LIGHT_Y = 1.4;
const KEY_LIGHT_Z = 0.4;
const HEMI_SKY = 0xfff1c4;
const HEMI_GROUND = 0x1a1418;
const HEMI_INTENSITY = 0.45;
const ENV_SKY_RADIUS = 10;
const ENV_SKY_WIDTH_SEG = 16;
const ENV_SKY_HEIGHT_SEG = 8;
const ENV_CUBE_SIZE = 128;
const ENV_CUBE_NEAR = 0.1;
const ENV_CUBE_FAR = 100;
const KEY_COLOR = 0xffffff;

/**
 * Build a tiny procedural environment map by rendering a colored hemisphere
 * dome into a cube target. The gold material samples this for specular
 * reflections, which is what makes it look "shiny" instead of dark-metallic.
 */
function buildEnvMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  const envScene = new THREE.Scene();
  envScene.add(new THREE.HemisphereLight(HEMI_SKY, HEMI_GROUND, 1));
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

  const key = new THREE.DirectionalLight(KEY_COLOR, gameBalance.render.directionalIntensity);
  key.position.set(KEY_LIGHT_X, KEY_LIGHT_Y, KEY_LIGHT_Z);
  scene.add(key);

  if (renderer) {
    scene.environment = buildEnvMap(renderer);
  }
}
