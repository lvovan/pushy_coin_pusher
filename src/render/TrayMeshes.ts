/**
 * TrayMeshes — visual geometry for the static tray (floor + 3 walls) plus the
 * coin-collection bin sitting below and in front of it. Mirrors the physics
 * cuboids created in `src/game/Tray.ts`. Awarded coins land in the bin as
 * regular physics bodies (rendered via `CoinInstances`), so there is no
 * separate visual pile to maintain here.
 */
import * as THREE from 'three';

import { gameBalance } from '../config/gameBalance';
import type { Tray } from '../game/Tray';

const HALF = 0.5;
const WALL_THICKNESS = 0.02;
const FLOOR_THICKNESS = 0.01;
// Plate front-edge ramp (must match physics dimensions in src/game/Tray.ts).
const PLATE_LIP_LENGTH = 0.05;
const PLATE_LIP_THICKNESS = 0.0015;
const PLATE_LIP_SLANT_RAD = 0.12;

// Coin-collection bin visuals — physical floor + walls live in src/game/Tray.ts.
// Kept intentionally dark and matte so the bin reads as a dimmer "well" below
// the brightly lit playfield even though the scene lighting is uniform.
const BIN_FLOOR_COLOR = 0x0c0e10;
const BIN_WALL_COLOR = 0x2a1808;
const BIN_MATTE_METALNESS = 0;
const BIN_MATTE_ROUGHNESS = 1;

// Embossed coin-count label on the front face of the bin.
const COUNT_LABEL_WIDTH_RATIO = 0.7; // fraction of bin front-wall width
const COUNT_LABEL_HEIGHT_RATIO = 0.75; // fraction of bin front-wall height
const COUNT_LABEL_Z_OFFSET = 0.0008; // tiny lift so the decal sits just in front of the wall
const COUNT_CANVAS_WIDTH_PX = 512;
const COUNT_CANVAS_HEIGHT_PX = 128;
const COUNT_FONT_SIZE_PX = 96;
const COUNT_LIGHT_SHADOW_OFFSET_PX = 2;
const COUNT_DARK_SHADOW_OFFSET_PX = -2;
const COUNT_FILL_COLOR = '#f4c45a';
const COUNT_HIGHLIGHT_COLOR = 'rgba(255, 230, 170, 0.9)';
const COUNT_SHADOW_COLOR = 'rgba(0, 0, 0, 0.95)';
const COUNT_HALF_PX = 0.5;

export class TrayMeshes {
  readonly group = new THREE.Group();
  private readonly countCanvas: HTMLCanvasElement;
  private readonly countCtx: CanvasRenderingContext2D;
  private readonly countTexture: THREE.CanvasTexture;
  private lastCount = -1;

  constructor(scene: THREE.Scene, tray: Tray) {
    const { width, depth, wallHeight } = gameBalance.tray;
    const trayMat = new THREE.MeshStandardMaterial({
      color: gameBalance.render.trayColor,
      metalness: gameBalance.render.coinMetalness * gameBalance.render.coinRoughness,
      roughness: gameBalance.render.coinRoughness * 2,
    });
    const wallMat = new THREE.MeshStandardMaterial({
      color: gameBalance.render.wallColor,
      metalness: gameBalance.render.coinMetalness * gameBalance.render.coinRoughness,
      roughness: gameBalance.render.coinRoughness * 2,
    });
    const binFloorMat = new THREE.MeshStandardMaterial({
      color: BIN_FLOOR_COLOR,
      metalness: BIN_MATTE_METALNESS,
      roughness: BIN_MATTE_ROUGHNESS,
    });
    const binWallMat = new THREE.MeshStandardMaterial({
      color: BIN_WALL_COLOR,
      metalness: BIN_MATTE_METALNESS,
      roughness: BIN_MATTE_ROUGHNESS,
    });

    // Floor — top surface at y=0 to match the physics floor collider.
    const floor = new THREE.Mesh(new THREE.BoxGeometry(width, FLOOR_THICKNESS, depth), trayMat);
    floor.position.set(0, tray.floorY - FLOOR_THICKNESS * HALF, 0);
    this.group.add(floor);

    // Back wall.
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(width, wallHeight, WALL_THICKNESS),
      wallMat,
    );
    back.position.set(0, wallHeight * HALF, -depth * HALF);
    this.group.add(back);

    // Left wall.
    const left = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_THICKNESS, wallHeight, depth),
      wallMat,
    );
    left.position.set(-width * HALF, wallHeight * HALF, 0);
    this.group.add(left);

    // Right wall.
    const right = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_THICKNESS, wallHeight, depth),
      wallMat,
    );
    right.position.set(width * HALF, wallHeight * HALF, 0);
    this.group.add(right);

    // Plate front ramp — seamless slanted slab; back-top edge meets the
    // plate surface flush, back-bottom is hidden inside the plate.
    const plateLipCos = Math.cos(PLATE_LIP_SLANT_RAD);
    const plateLipSin = Math.sin(PLATE_LIP_SLANT_RAD);
    const plateLip = new THREE.Mesh(
      new THREE.BoxGeometry(width, PLATE_LIP_THICKNESS, PLATE_LIP_LENGTH),
      trayMat,
    );
    plateLip.position.set(
      0,
      -PLATE_LIP_THICKNESS * HALF * plateLipCos + PLATE_LIP_LENGTH * HALF * plateLipSin,
      depth * HALF - PLATE_LIP_LENGTH * HALF * plateLipCos + PLATE_LIP_THICKNESS * HALF * plateLipSin,
    );
    plateLip.rotation.x = -PLATE_LIP_SLANT_RAD;
    this.group.add(plateLip);

    // ── Coin-collection bin ─────────────────────────────────────────────
    // The physical bin (in src/game/Tray.ts) spans the full play footprint
    // plus a forward extension toward the player. We only render the visible
    // portion (in front of the plate) since the under-plate region is
    // hidden by the plate floor anyway.
    const { depth: binDepth, floorY: binFloorY, wallHeight: binWallHeight } = gameBalance.bin;
    const binBackZ = -depth * HALF;
    const frontEdgeZ = depth * HALF;
    const binFrontZ = frontEdgeZ + binDepth;
    const binFullDepth = binFrontZ - binBackZ;
    const binCenterZ = (binBackZ + binFrontZ) * HALF;

    const binFloor = new THREE.Mesh(
      new THREE.BoxGeometry(width, FLOOR_THICKNESS, binFullDepth),
      binFloorMat,
    );
    binFloor.position.set(0, binFloorY - FLOOR_THICKNESS * HALF, binCenterZ);
    this.group.add(binFloor);

    const binFront = new THREE.Mesh(
      new THREE.BoxGeometry(width, binWallHeight, WALL_THICKNESS),
      binWallMat,
    );
    binFront.position.set(0, binFloorY + binWallHeight * HALF, binFrontZ - WALL_THICKNESS * HALF);
    this.group.add(binFront);

    const binBack = new THREE.Mesh(
      new THREE.BoxGeometry(width, binWallHeight, WALL_THICKNESS),
      binWallMat,
    );
    binBack.position.set(0, binFloorY + binWallHeight * HALF, binBackZ + WALL_THICKNESS * HALF);
    this.group.add(binBack);

    const binLeft = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_THICKNESS, binWallHeight, binFullDepth),
      binWallMat,
    );
    binLeft.position.set(-width * HALF, binFloorY + binWallHeight * HALF, binCenterZ);
    this.group.add(binLeft);

    const binRight = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_THICKNESS, binWallHeight, binFullDepth),
      binWallMat,
    );
    binRight.position.set(width * HALF, binFloorY + binWallHeight * HALF, binCenterZ);
    this.group.add(binRight);

    // Embossed coin-count label decal on the bin front face. Drawn via a
    // CanvasTexture so the count can be updated cheaply at runtime; the
    // dual light/dark text shadow fakes a chiseled / embossed look against
    // the dark wood-colored wall.
    this.countCanvas = document.createElement('canvas');
    this.countCanvas.width = COUNT_CANVAS_WIDTH_PX;
    this.countCanvas.height = COUNT_CANVAS_HEIGHT_PX;
    const ctx = this.countCanvas.getContext('2d');
    if (!ctx) throw new Error('TrayMeshes: 2D canvas context unavailable');
    this.countCtx = ctx;
    this.countTexture = new THREE.CanvasTexture(this.countCanvas);
    this.countTexture.colorSpace = THREE.SRGBColorSpace;
    this.countTexture.anisotropy = 4; // @no-magic-ok mipmap filtering quality

    const labelWidth = width * COUNT_LABEL_WIDTH_RATIO;
    const labelHeight = binWallHeight * COUNT_LABEL_HEIGHT_RATIO;
    const labelMat = new THREE.MeshBasicMaterial({
      map: this.countTexture,
      transparent: true,
      depthWrite: false,
    });
    const labelMesh = new THREE.Mesh(new THREE.PlaneGeometry(labelWidth, labelHeight), labelMat);
    // Sit just in front of the bin front wall's outer face (camera is at +Z).
    // PlaneGeometry's default normal points +Z, so no rotation is needed.
    labelMesh.position.set(
      0,
      binFloorY + binWallHeight * HALF,
      binFrontZ + COUNT_LABEL_Z_OFFSET,
    );
    this.group.add(labelMesh);
    this.setCoinCount(0);

    scene.add(this.group);
  }

  /** Update the embossed coin count rendered on the front of the bin. */
  setCoinCount(count: number): void {
    if (count === this.lastCount) return;
    this.lastCount = count;
    const ctx = this.countCtx;
    const w = this.countCanvas.width;
    const h = this.countCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${COUNT_FONT_SIZE_PX}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    const cx = w * COUNT_HALF_PX;
    const cy = h * COUNT_HALF_PX;
    const text = String(count);
    // Dark inset shadow (top-left edge).
    ctx.fillStyle = COUNT_SHADOW_COLOR;
    ctx.fillText(text, cx + COUNT_DARK_SHADOW_OFFSET_PX, cy + COUNT_DARK_SHADOW_OFFSET_PX);
    // Light highlight (bottom-right edge).
    ctx.fillStyle = COUNT_HIGHLIGHT_COLOR;
    ctx.fillText(text, cx + COUNT_LIGHT_SHADOW_OFFSET_PX, cy + COUNT_LIGHT_SHADOW_OFFSET_PX);
    // Main fill on top.
    ctx.fillStyle = COUNT_FILL_COLOR;
    ctx.fillText(text, cx, cy);
    this.countTexture.needsUpdate = true;
  }
}
