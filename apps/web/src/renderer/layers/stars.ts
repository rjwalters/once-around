/**
 * Stars Layer
 *
 * Renders star field with LOD (Level of Detail) based on FOV,
 * major star labels with flag lines, and support for star overrides
 * (e.g., for supernova effects during tours).
 */

import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import type { SkyEngine } from "../../wasm/sky_engine";
import { getStarsPositionBuffer, getStarsMetaBuffer, getAllStarsPositionBuffer, getAllStarsMetaBuffer } from "../../engine";
import {
  SKY_RADIUS,
  MAJOR_STARS,
  LABEL_OFFSET,
  LOD_BRIGHT_MAG_THRESHOLD,
  LOD_MAX_STARS_WIDE_FOV,
  LOD_MAX_STARS_MEDIUM_FOV,
  LOD_MAX_STARS_NARROW_FOV,
  POINT_SOURCE_ANGULAR_SIZE_ARCSEC,
} from "../constants";
import { readPositionFromBuffer } from "../utils/coordinates";
import { bvToColor, angularSizeToPixels, starIdHash } from "../utils/colors";
import { calculateLabelOffset } from "../utils/labels";

/** Star override data for special effects */
export interface StarOverrideData {
  magnitude?: number;
  bvColor?: number;
  scale?: number;
}

export interface StarsLayer {
  /** The main stars points mesh */
  points: THREE.Points;
  /** Override stars group (billboard sprites for special effects) */
  overrideStarsGroup: THREE.Group;
  /** Star labels (HR number -> label) */
  labels: Map<number, CSS2DObject>;
  /** Flag lines connecting labels to stars */
  flagLines: THREE.LineSegments;
  /** Star position map (HR number -> position), built during update */
  getStarPositionMap(): Map<number, THREE.Vector3>;
  /** Constellation star position map (all stars, for drawing constellation lines) */
  getConstellationStarPositionMap(): Map<number, THREE.Vector3>;
  /** Build the constellation star map (called once at init) */
  buildConstellationStarMap(engine: SkyEngine): void;
  /** Update star positions and LOD */
  update(engine: SkyEngine, fov: number, canvasHeight: number): void;
  /** Update star label visibility and positions */
  updateLabels(labelsVisible: boolean): void;
  /** Set star overrides for special effects */
  setOverrides(overrides: Array<{ starHR: number; magnitude?: number; bvColor?: number; scale?: number }>): void;
  /** Clear all star overrides */
  clearOverrides(): void;
  /** Get number of rendered stars (after LOD culling) */
  getRenderedCount(): number;
}

/**
 * Create the stars layer.
 * @param scene - The Three.js scene to add meshes to
 * @param labelsGroup - The group to add star labels to
 * @returns StarsLayer interface
 */
/**
 * Create a radial glow texture for bright star rendering.
 * Uses a Gaussian-like falloff for a natural glow appearance.
 */
function createGlowTexture(size = 128): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Create radial gradient with soft falloff
  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);

  // Bright core with soft gaussian-like falloff
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.05, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.1, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(0.2, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.2)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.08)');
  gradient.addColorStop(0.8, 'rgba(255,255,255,0.02)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function createStarsLayer(scene: THREE.Scene, labelsGroup: THREE.Group): StarsLayer {
  // Main stars geometry and material
  const starsGeometry = new THREE.BufferGeometry();
  const starsMaterial = new THREE.PointsMaterial({
    size: 1.5,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
  });
  const starsPoints = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(starsPoints);

  // Override stars use billboard sprites for better appearance at large sizes
  const glowTexture = createGlowTexture();
  const overrideStarsGroup = new THREE.Group();
  overrideStarsGroup.renderOrder = 100;
  scene.add(overrideStarsGroup);

  // Pool of sprites for override stars (reused to avoid allocation)
  const spritePool: THREE.Sprite[] = [];
  let activeSpriteCount = 0;

  // Star labels
  const starLabels: Map<number, CSS2DObject> = new Map();
  for (const [hr, name] of MAJOR_STARS) {
    const div = document.createElement("div");
    div.className = "sky-label star-label";
    div.textContent = name;
    div.dataset.hr = String(hr);
    const label = new CSS2DObject(div);
    label.visible = false;
    starLabels.set(hr, label);
    labelsGroup.add(label);
  }

  // Star flag lines
  const MAX_STAR_FLAGS = 30;
  const starFlagLinesGeometry = new THREE.BufferGeometry();
  const starFlagPositionBuffer = new Float32Array(MAX_STAR_FLAGS * 2 * 3);
  const starFlagPositionAttr = new THREE.BufferAttribute(starFlagPositionBuffer, 3);
  starFlagPositionAttr.setUsage(THREE.DynamicDrawUsage);
  starFlagLinesGeometry.setAttribute("position", starFlagPositionAttr);

  const starFlagLinesMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(0.6, 0.6, 0.7),
    transparent: true,
    opacity: 0.5,
  });
  const starFlagLines = new THREE.LineSegments(starFlagLinesGeometry, starFlagLinesMaterial);
  labelsGroup.add(starFlagLines);

  // State
  let starPositionMap: Map<number, THREE.Vector3> = new Map();
  let constellationStarPositionMap: Map<number, THREE.Vector3> = new Map();
  let renderedStarCount = 0;
  let starOverrideMap: Map<number, StarOverrideData> = new Map();
  let lastEngine: SkyEngine | null = null;
  let lastFov: number = 60;
  let lastCanvasHeight: number = 800;

  function buildConstellationStarMap(engine: SkyEngine): void {
    const positions = getAllStarsPositionBuffer(engine);
    const meta = getAllStarsMetaBuffer(engine);
    const totalStars = engine.total_stars();

    constellationStarPositionMap = new Map();

    for (let i = 0; i < totalStars; i++) {
      const id = Math.round(meta[i * 4 + 2]);
      constellationStarPositionMap.set(id, readPositionFromBuffer(positions, i, SKY_RADIUS));
    }
  }

  function updateOverrideStars(
    positions: number[],
    colors: number[],
    scales: number[],
    fov: number,
    canvasHeight: number
  ): void {
    const starCount = positions.length / 3;

    // Hide unused sprites
    for (let i = starCount; i < activeSpriteCount; i++) {
      spritePool[i].visible = false;
    }

    if (starCount === 0) {
      activeSpriteCount = 0;
      return;
    }

    // Base size for scaling (in world units, adjusted for SKY_RADIUS)
    const baseSize = angularSizeToPixels(POINT_SOURCE_ANGULAR_SIZE_ARCSEC, fov, canvasHeight);
    // Scale factor to convert pixel size to world units at SKY_RADIUS distance
    // The glow extends beyond the core, so multiply by a factor for the full effect
    const worldScaleFactor = (SKY_RADIUS / canvasHeight) * 4;

    for (let i = 0; i < starCount; i++) {
      // Get or create sprite
      let sprite: THREE.Sprite;
      if (i < spritePool.length) {
        sprite = spritePool[i];
      } else {
        const material = new THREE.SpriteMaterial({
          map: glowTexture,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false,
        });
        sprite = new THREE.Sprite(material);
        spritePool.push(sprite);
        overrideStarsGroup.add(sprite);
      }

      // Position
      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];
      sprite.position.set(px, py, pz);

      // Color - apply to sprite material
      const r = colors[i * 3];
      const g = colors[i * 3 + 1];
      const b = colors[i * 3 + 2];
      const material = sprite.material as THREE.SpriteMaterial;
      material.color.setRGB(r, g, b);

      // Scale based on override scale (minimum of 3 for visibility)
      const scale = Math.max(scales[i], 3);
      const worldSize = baseSize * scale * worldScaleFactor;
      sprite.scale.set(worldSize, worldSize, 1);

      sprite.visible = true;
    }

    activeSpriteCount = starCount;
  }

  function update(engine: SkyEngine, fov: number, canvasHeight: number): void {
    lastEngine = engine;
    lastFov = fov;
    lastCanvasHeight = canvasHeight;

    // Update point size based on FOV
    starsMaterial.size = angularSizeToPixels(POINT_SOURCE_ANGULAR_SIZE_ARCSEC, fov, canvasHeight);

    const positions = getStarsPositionBuffer(engine);
    const meta = getStarsMetaBuffer(engine);
    const totalStars = engine.visible_stars();

    starPositionMap = new Map();

    if (totalStars === 0 && starOverrideMap.size === 0) {
      starsGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
      starsGeometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(0), 3));
      renderedStarCount = 0;
      return;
    }

    // Calculate target star count based on FOV
    let targetStars: number;
    if (fov > 70) {
      targetStars = LOD_MAX_STARS_WIDE_FOV;
    } else if (fov > 40) {
      const t = (fov - 40) / 30;
      targetStars = Math.floor(LOD_MAX_STARS_NARROW_FOV + t * (LOD_MAX_STARS_MEDIUM_FOV - LOD_MAX_STARS_NARROW_FOV));
    } else {
      targetStars = LOD_MAX_STARS_NARROW_FOV;
    }

    // First pass: count bright and faint stars
    let brightCount = 0;
    let faintCount = 0;
    for (let i = 0; i < totalStars; i++) {
      const vmag = meta[i * 4];
      if (vmag < LOD_BRIGHT_MAG_THRESHOLD) {
        brightCount++;
      } else {
        faintCount++;
      }
    }

    // Calculate sampling probability for faint stars
    const faintTarget = Math.max(0, targetStars - brightCount);
    const faintProbability = faintCount > 0 ? Math.min(1.0, faintTarget / faintCount) : 1.0;

    // Track which override stars we've found
    const foundOverrideStars = new Set<number>();

    // Second pass: build arrays with LOD sampling
    const scaledPositions: number[] = [];
    const colors: number[] = [];

    const overridePositions: number[] = [];
    const overrideColors: number[] = [];
    const overrideScales: number[] = [];

    for (let i = 0; i < totalStars; i++) {
      let vmag = meta[i * 4];
      let bv = meta[i * 4 + 1];
      const id = Math.round(meta[i * 4 + 2]);

      const override = starOverrideMap.get(id);
      const hasOverride = override !== undefined;

      if (hasOverride) {
        foundOverrideStars.add(id);
        if (override.magnitude !== undefined) vmag = override.magnitude;
        if (override.bvColor !== undefined) bv = override.bvColor;
      }

      const isBright = vmag < LOD_BRIGHT_MAG_THRESHOLD;
      const includeInRender = hasOverride || isBright || (starIdHash(id) < faintProbability);

      const pos = readPositionFromBuffer(positions, i, SKY_RADIUS);
      starPositionMap.set(id, pos);

      if (includeInRender) {
        scaledPositions.push(pos.x, pos.y, pos.z);
        const color = bvToColor(bv);
        colors.push(color.r, color.g, color.b);

        if (hasOverride) {
          overridePositions.push(pos.x, pos.y, pos.z);
          overrideColors.push(color.r, color.g, color.b);
          overrideScales.push(override.scale ?? 1);
        }
      }
    }

    // Look up any override stars that weren't in the visible list
    // This ensures stars with overrides always render, even if they're
    // not currently in the engine's visible_stars() list
    if (foundOverrideStars.size < starOverrideMap.size) {
      const allPositions = getAllStarsPositionBuffer(engine);
      const allMeta = getAllStarsMetaBuffer(engine);
      const allStarsCount = engine.total_stars();

      for (let i = 0; i < allStarsCount; i++) {
        const id = Math.round(allMeta[i * 4 + 2]);

        // Skip if we already found this star
        if (foundOverrideStars.has(id)) continue;

        const override = starOverrideMap.get(id);
        if (!override) continue;

        // Found an override star that wasn't in visible list
        foundOverrideStars.add(id);

        let vmag = allMeta[i * 4];
        let bv = allMeta[i * 4 + 1];

        if (override.magnitude !== undefined) vmag = override.magnitude;
        if (override.bvColor !== undefined) bv = override.bvColor;

        const pos = readPositionFromBuffer(allPositions, i, SKY_RADIUS);
        starPositionMap.set(id, pos);

        scaledPositions.push(pos.x, pos.y, pos.z);
        const color = bvToColor(bv);
        colors.push(color.r, color.g, color.b);

        overridePositions.push(pos.x, pos.y, pos.z);
        overrideColors.push(color.r, color.g, color.b);
        overrideScales.push(override.scale ?? 1);

        // Stop early if we found all override stars
        if (foundOverrideStars.size >= starOverrideMap.size) break;
      }
    }

    updateOverrideStars(overridePositions, overrideColors, overrideScales, fov, canvasHeight);

    starsGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(scaledPositions), 3));
    starsGeometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));

    renderedStarCount = scaledPositions.length / 3;
  }

  function updateLabels(labelsVisible: boolean): void {
    let flagIndex = 0;

    for (const [hr] of MAJOR_STARS) {
      const label = starLabels.get(hr);
      if (!label) continue;

      const pos = starPositionMap.get(hr);
      if (pos && flagIndex < MAX_STAR_FLAGS) {
        const labelPos = calculateLabelOffset(pos, LABEL_OFFSET);
        label.position.copy(labelPos);
        label.visible = labelsVisible;

        // Add flag line from star to label
        const idx = flagIndex * 6;
        starFlagPositionBuffer[idx] = pos.x;
        starFlagPositionBuffer[idx + 1] = pos.y;
        starFlagPositionBuffer[idx + 2] = pos.z;
        starFlagPositionBuffer[idx + 3] = labelPos.x;
        starFlagPositionBuffer[idx + 4] = labelPos.y;
        starFlagPositionBuffer[idx + 5] = labelPos.z;
        flagIndex++;
      } else {
        label.visible = false;
      }
    }

    starFlagPositionAttr.needsUpdate = true;
    starFlagLinesGeometry.setDrawRange(0, flagIndex * 2);
    starFlagLines.visible = labelsVisible;
  }

  function setOverrides(overrides: Array<{ starHR: number; magnitude?: number; bvColor?: number; scale?: number }>): void {
    starOverrideMap.clear();
    for (const override of overrides) {
      starOverrideMap.set(override.starHR, {
        magnitude: override.magnitude,
        bvColor: override.bvColor,
        scale: override.scale,
      });
    }
    if (lastEngine) {
      update(lastEngine, lastFov, lastCanvasHeight);
    }
  }

  function clearOverrides(): void {
    starOverrideMap.clear();
    if (lastEngine) {
      update(lastEngine, lastFov, lastCanvasHeight);
    }
  }

  return {
    points: starsPoints,
    overrideStarsGroup,
    labels: starLabels,
    flagLines: starFlagLines,
    getStarPositionMap: () => starPositionMap,
    getConstellationStarPositionMap: () => constellationStarPositionMap,
    buildConstellationStarMap,
    update,
    updateLabels,
    setOverrides,
    clearOverrides,
    getRenderedCount: () => renderedStarCount,
  };
}
