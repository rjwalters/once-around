/**
 * Stars Layer
 *
 * Renders star field with LOD (Level of Detail) based on FOV,
 * major star labels with flag lines, and support for star overrides
 * (e.g., for supernova effects during tours).
 *
 * Includes atmospheric scintillation (twinkling) for topocentric view mode.
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
  STARS_CATALOG_CAPACITY,
} from "../constants";
import { readPositionFromBuffer, readPositionInPlace, raDecToPosition } from "../utils/coordinates";
import { bvToColorInPlace, angularSizeToPixels, starIdHash } from "../utils/colors";
import { calculateLabelOffsetInPlace } from "../utils/labels";
import { createGlowSpriteMaterial } from "../utils/materials";
import {
  computeFovLodBucket,
  computeTargetStars,
  rebuildKeyEquals,
  type StarRebuildKey,
} from "./stars-lod";
import type { LabelManager } from "../label-manager";

// -----------------------------------------------------------------------------
// Scintillation Shader
// -----------------------------------------------------------------------------

/**
 * Vertex shader for stars with scintillation support.
 * Passes position, color, and star ID hash to fragment shader.
 */
const SCINTILLATION_VERTEX_SHADER = `
  attribute float starId;
  attribute float magnitude;

  varying vec3 vColor;
  varying float vStarId;
  varying float vMagnitude;
  varying vec3 vPosition;

  uniform float pointSize;

  void main() {
    vColor = color;
    vStarId = starId;
    vMagnitude = magnitude;
    vPosition = position;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = pointSize;
  }
`;

/**
 * Fragment shader for stars with scintillation support.
 * Computes altitude-based twinkling with chromatic effects.
 */
const SCINTILLATION_FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vStarId;
  varying float vMagnitude;
  varying vec3 vPosition;

  uniform float time;
  uniform vec3 zenith;
  uniform float scintillationIntensity;
  uniform bool scintillationEnabled;

  // Compute altitude of star above horizon (0 to 1 for 0° to 90°)
  float computeAltitude(vec3 starPos, vec3 zenithDir) {
    vec3 starDir = normalize(starPos);
    float sinAlt = dot(starDir, zenithDir);
    return max(0.0, sinAlt); // 0 at horizon, 1 at zenith
  }

  // Compute airmass approximation (Kasten-Young simplified)
  float computeAirmass(float altitude) {
    float sinAlt = max(0.01, altitude); // Avoid division by zero
    return 1.0 / sinAlt;
  }

  void main() {
    // Circular point shape
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);
    if (dist > 0.5) discard;

    vec3 finalColor = vColor;
    float alpha = 0.9;

    if (scintillationEnabled && scintillationIntensity > 0.0) {
      // Only apply to bright stars (mag < 3.5)
      if (vMagnitude < 3.5) {
        float altitude = computeAltitude(vPosition, zenith);
        float airmass = computeAirmass(altitude);

        // Scintillation amplitude scales with airmass and inverse magnitude
        // Bright stars (low mag) and low altitude (high airmass) twinkle more
        float brightnessFactor = max(0.0, (3.5 - vMagnitude) / 4.0);
        float amplitude = min(airmass / 8.0, 0.6) * brightnessFactor * scintillationIntensity;

        // Multi-frequency oscillation for natural randomness
        float phase = fract(vStarId * 1234.5678) * 6.28318;
        float freq1 = 8.0 + mod(vStarId, 7.0);   // 8-15 Hz
        float freq2 = 13.0 + mod(vStarId, 11.0); // 13-24 Hz
        float t = time;

        // Brightness modulation
        float brightness = 1.0 + amplitude * 0.5 * (
          sin(freq1 * t + phase) +
          0.5 * sin(freq2 * t + phase * 1.7)
        );

        // Chromatic modulation (R/G/B at slightly different frequencies)
        // This creates the famous color flashing of stars like Sirius
        float colorAmp = amplitude * 0.25;
        float r = 1.0 + colorAmp * sin(freq1 * 0.9 * t + phase);
        float g = 1.0 + colorAmp * sin(freq1 * t + phase + 0.5);
        float b = 1.0 + colorAmp * sin(freq1 * 1.1 * t + phase + 1.0);

        finalColor = vColor * brightness * vec3(r, g, b);
      }
    }

    // Soft edge falloff
    float softness = 1.0 - smoothstep(0.3, 0.5, dist);
    alpha *= softness;

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

/** Star override data for special effects */
export interface StarOverrideData {
  magnitude?: number;
  bvColor?: number;
  scale?: number;
  /** For synthetic stars: Right Ascension in degrees */
  ra?: number;
  /** For synthetic stars: Declination in degrees */
  dec?: number;
}

export interface StarsLayer {
  /** The main stars points mesh */
  points: THREE.Points;
  /** Override stars group (billboard sprites for special effects) */
  overrideStarsGroup: THREE.Group;
  /** Star labels (HR number -> label) */
  labels: Map<number, CSS2DObject>;
  /** Constellation star position map (all stars, for drawing constellation lines) */
  getConstellationStarPositionMap(): Map<number, THREE.Vector3>;
  /** Build the constellation star map (called once at init) */
  buildConstellationStarMap(engine: SkyEngine): void;
  /** Update star positions and LOD */
  update(engine: SkyEngine, fov: number, canvasHeight: number, labelManager?: LabelManager): void;
  /** Update star label visibility and positions */
  updateLabels(labelsVisible: boolean): void;
  /** Set star overrides for special effects (supports synthetic stars with ra/dec) */
  setOverrides(overrides: Array<{ starHR: number; magnitude?: number; bvColor?: number; scale?: number; ra?: number; dec?: number }>): void;
  /** Clear all star overrides */
  clearOverrides(): void;
  /** Get number of rendered stars (after LOD culling) */
  getRenderedCount(): number;
  /** Enable/disable scintillation (topocentric mode) */
  setScintillationEnabled(enabled: boolean): void;
  /** Set scintillation intensity (0-1, representing atmospheric turbulence) */
  setScintillationIntensity(intensity: number): void;
  /** Update scintillation for current frame (call each frame when enabled) */
  updateScintillation(latitude: number, lst: number): void;
}

/**
 * Create the stars layer.
 * @param scene - The Three.js scene to add meshes to
 * @param labelsGroup - The group to add star labels to
 * @returns StarsLayer interface
 */
export function createStarsLayer(scene: THREE.Scene, labelsGroup: THREE.Group): StarsLayer {
  // Main stars geometry with custom shader for scintillation
  const starsGeometry = new THREE.BufferGeometry();

  // -----------------------------------------------------------------------------
  // Persistent geometry buffers
  //
  // Star positions are J2000-fixed (time-invariant), so instead of allocating
  // fresh Float32Arrays + BufferAttributes on every update() (which forces
  // Three.js to dispose and re-upload VBOs), we pre-allocate capacity-sized
  // typed arrays once, write into them in place, flag `needsUpdate`, and use
  // setDrawRange() to control how many stars render. This mirrors the pattern
  // used by the constellations and label-manager layers.
  // -----------------------------------------------------------------------------
  let starsCapacity = STARS_CATALOG_CAPACITY;
  let positionBuffer = new Float32Array(starsCapacity * 3);
  let colorBuffer = new Float32Array(starsCapacity * 3);
  let starIdBuffer = new Float32Array(starsCapacity);
  let magnitudeBuffer = new Float32Array(starsCapacity);

  let positionAttr = new THREE.BufferAttribute(positionBuffer, 3);
  let colorAttr = new THREE.BufferAttribute(colorBuffer, 3);
  let starIdAttr = new THREE.BufferAttribute(starIdBuffer, 1);
  let magnitudeAttr = new THREE.BufferAttribute(magnitudeBuffer, 1);
  for (const attr of [positionAttr, colorAttr, starIdAttr, magnitudeAttr]) {
    attr.setUsage(THREE.DynamicDrawUsage);
  }
  starsGeometry.setAttribute("position", positionAttr);
  starsGeometry.setAttribute("color", colorAttr);
  starsGeometry.setAttribute("starId", starIdAttr);
  starsGeometry.setAttribute("magnitude", magnitudeAttr);
  starsGeometry.setDrawRange(0, 0);

  // All stars lie on the sky sphere (radius SKY_RADIUS centered at the origin),
  // and unused/zero-filled buffer slots sit at the origin (inside it). Fix the
  // bounding sphere once so frustum culling is correct and Three.js never
  // recomputes it from the full-capacity buffer on every frame.
  starsGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), SKY_RADIUS * 1.5);

  /**
   * Grow the persistent buffers if the required rendered-star count exceeds the
   * current capacity (rare: only when the catalog grows past the initial size).
   * Allocates new BufferAttributes only on growth, never in the steady state.
   */
  function ensureStarCapacity(needed: number): void {
    if (needed <= starsCapacity) return;
    starsCapacity = needed + 512; // grow with headroom to avoid frequent reallocation
    positionBuffer = new Float32Array(starsCapacity * 3);
    colorBuffer = new Float32Array(starsCapacity * 3);
    starIdBuffer = new Float32Array(starsCapacity);
    magnitudeBuffer = new Float32Array(starsCapacity);

    positionAttr = new THREE.BufferAttribute(positionBuffer, 3);
    colorAttr = new THREE.BufferAttribute(colorBuffer, 3);
    starIdAttr = new THREE.BufferAttribute(starIdBuffer, 1);
    magnitudeAttr = new THREE.BufferAttribute(magnitudeBuffer, 1);
    for (const attr of [positionAttr, colorAttr, starIdAttr, magnitudeAttr]) {
      attr.setUsage(THREE.DynamicDrawUsage);
    }
    starsGeometry.setAttribute("position", positionAttr);
    starsGeometry.setAttribute("color", colorAttr);
    starsGeometry.setAttribute("starId", starIdAttr);
    starsGeometry.setAttribute("magnitude", magnitudeAttr);
  }

  // Uniforms for scintillation shader
  const scintillationUniforms = {
    pointSize: { value: 1.5 },
    time: { value: 0.0 },
    zenith: { value: new THREE.Vector3(0, 1, 0) },
    scintillationIntensity: { value: 0.7 },
    scintillationEnabled: { value: false },
  };

  // Custom shader material with scintillation support
  const starsMaterial = new THREE.ShaderMaterial({
    uniforms: scintillationUniforms,
    vertexShader: SCINTILLATION_VERTEX_SHADER,
    fragmentShader: SCINTILLATION_FRAGMENT_SHADER,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
  });

  const starsPoints = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(starsPoints);

  // Override stars use billboard sprites for better appearance at large sizes
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

  // Default star flagline color (gray-blue)
  const starFlagLineColor = new THREE.Color(0.6, 0.6, 0.7);

  // State
  let constellationStarPositionMap: Map<number, THREE.Vector3> = new Map();
  let renderedStarCount = 0;
  let starOverrideMap: Map<number, StarOverrideData> = new Map();
  let lastEngine: SkyEngine | null = null;
  let lastFov: number = 60;
  let lastCanvasHeight: number = 800;
  let currentLabelManager: LabelManager | undefined = undefined;

  // Major-star position pool. updateLabels() only ever reads positions for the
  // fixed MAJOR_STARS list (~60 entries), so we keep one reusable Vector3 per
  // major star and populate `starPositionMap` (the currently-visible subset)
  // by reference during a rebuild. This avoids allocating one Vector3 per star
  // for the full ~9,100-star catalog on every update.
  const majorStarIds = new Set<number>(MAJOR_STARS.map(([hr]) => hr));
  const majorStarPositionPool = new Map<number, THREE.Vector3>();
  for (const [hr] of MAJOR_STARS) {
    majorStarPositionPool.set(hr, new THREE.Vector3());
  }
  // HR number -> position for major stars currently present in the render set.
  const starPositionMap: Map<number, THREE.Vector3> = new Map();

  // Scratch objects reused across the per-star loop (no per-star allocation).
  const scratchPos = new THREE.Vector3();
  const scratchColor = new THREE.Color();

  // Rebuild skip state. Because star positions are time-invariant, the geometry
  // only needs rebuilding when one of these inputs changes. Time-only advances
  // (playback, tour transitions with fixed FOV bucket) reuse the last geometry.
  let lastRebuildKey: StarRebuildKey | null = null;
  let overrideVersion = 0;

  // Cached override sprite inputs from the last rebuild. Reused on skipped
  // frames so override glow sprites can still track FOV changes within a bucket
  // (their world size depends on FOV) without a full star-geometry rebuild.
  let cachedOverridePositions: number[] = [];
  let cachedOverrideColors: number[] = [];
  let cachedOverrideScales: number[] = [];

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
        const material = createGlowSpriteMaterial();
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

  /**
   * Write one rendered star into the persistent buffers at slot `count`.
   * Uses `scratchColor` for the B-V -> RGB conversion (no per-star allocation).
   * Returns the next write cursor.
   */
  function writeStar(count: number, x: number, y: number, z: number, bv: number, id: number, vmag: number): number {
    const p = count * 3;
    positionBuffer[p] = x;
    positionBuffer[p + 1] = y;
    positionBuffer[p + 2] = z;
    bvToColorInPlace(bv, scratchColor);
    colorBuffer[p] = scratchColor.r;
    colorBuffer[p + 1] = scratchColor.g;
    colorBuffer[p + 2] = scratchColor.b;
    starIdBuffer[count] = id;
    magnitudeBuffer[count] = vmag;
    return count + 1;
  }

  function update(engine: SkyEngine, fov: number, canvasHeight: number, labelManager?: LabelManager): void {
    lastEngine = engine;
    lastFov = fov;
    lastCanvasHeight = canvasHeight;
    currentLabelManager = labelManager;

    // Point size depends on FOV/canvas and must update every frame, even when
    // the star geometry itself is reused.
    scintillationUniforms.pointSize.value = angularSizeToPixels(POINT_SOURCE_ANGULAR_SIZE_ARCSEC, fov, canvasHeight);

    // Star positions are J2000-fixed, so the visible set + LOD sampling only
    // change when one of these inputs changes. On a time-only advance the key
    // is unchanged and we can skip the entire rebuild.
    const rebuildKey: StarRebuildKey = {
      magLimit: engine.mag_limit(),
      visibleCount: engine.visible_stars(),
      totalStars: engine.total_stars(),
      fovBucket: computeFovLodBucket(fov),
      overrideVersion,
    };

    if (lastRebuildKey && rebuildKeyEquals(lastRebuildKey, rebuildKey)) {
      // Geometry reused. Override glow sprites still need their world size
      // refreshed if the FOV changed within the same LOD bucket.
      if (cachedOverridePositions.length > 0) {
        updateOverrideStars(cachedOverridePositions, cachedOverrideColors, cachedOverrideScales, fov, canvasHeight);
      }
      return;
    }
    lastRebuildKey = rebuildKey;

    const positions = getStarsPositionBuffer(engine);
    const meta = getStarsMetaBuffer(engine);
    const totalStars = rebuildKey.visibleCount;

    // Reset the currently-visible major-star subset; repopulated by reference.
    starPositionMap.clear();

    if (totalStars === 0 && starOverrideMap.size === 0) {
      starsGeometry.setDrawRange(0, 0);
      positionAttr.needsUpdate = true;
      renderedStarCount = 0;
      cachedOverridePositions = [];
      cachedOverrideColors = [];
      cachedOverrideScales = [];
      updateOverrideStars(cachedOverridePositions, cachedOverrideColors, cachedOverrideScales, fov, canvasHeight);
      return;
    }

    // Calculate target star count based on FOV
    const targetStars = computeTargetStars(
      fov,
      LOD_MAX_STARS_WIDE_FOV,
      LOD_MAX_STARS_MEDIUM_FOV,
      LOD_MAX_STARS_NARROW_FOV
    );

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

    // Ensure the persistent buffers can hold the worst case: every visible star
    // rendered plus one extra slot for each override (non-visible / synthetic).
    ensureStarCapacity(totalStars + starOverrideMap.size);

    // Track which override stars we've found
    const foundOverrideStars = new Set<number>();

    // Override glow sprite inputs (small; only populated when overrides exist).
    const overridePositions: number[] = [];
    const overrideColors: number[] = [];
    const overrideScales: number[] = [];

    // Second pass: write directly into the persistent buffers with LOD sampling.
    let count = 0;
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

      readPositionInPlace(positions, i, SKY_RADIUS, scratchPos);

      // Only major stars need a persistent position for label placement.
      if (majorStarIds.has(id)) {
        const v = majorStarPositionPool.get(id)!;
        v.copy(scratchPos);
        starPositionMap.set(id, v);
      }

      if (includeInRender) {
        count = writeStar(count, scratchPos.x, scratchPos.y, scratchPos.z, bv, id, vmag);

        if (hasOverride) {
          overridePositions.push(scratchPos.x, scratchPos.y, scratchPos.z);
          overrideColors.push(scratchColor.r, scratchColor.g, scratchColor.b);
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

        readPositionInPlace(allPositions, i, SKY_RADIUS, scratchPos);
        if (majorStarIds.has(id)) {
          const v = majorStarPositionPool.get(id)!;
          v.copy(scratchPos);
          starPositionMap.set(id, v);
        }

        count = writeStar(count, scratchPos.x, scratchPos.y, scratchPos.z, bv, id, vmag);

        overridePositions.push(scratchPos.x, scratchPos.y, scratchPos.z);
        overrideColors.push(scratchColor.r, scratchColor.g, scratchColor.b);
        overrideScales.push(override.scale ?? 1);

        // Stop early if we found all override stars
        if (foundOverrideStars.size >= starOverrideMap.size) break;
      }
    }

    // Handle synthetic stars (negative HR numbers with ra/dec positions)
    for (const [id, override] of starOverrideMap) {
      // Synthetic stars have negative IDs and ra/dec coordinates
      if (id < 0 && override.ra !== undefined && override.dec !== undefined) {
        const vmag = override.magnitude ?? 0;
        const bv = override.bvColor ?? 0;

        const pos = raDecToPosition(override.ra, override.dec, SKY_RADIUS);
        if (majorStarIds.has(id)) {
          const v = majorStarPositionPool.get(id)!;
          v.copy(pos);
          starPositionMap.set(id, v);
        }

        // Add to main star buffers so it renders with other stars
        count = writeStar(count, pos.x, pos.y, pos.z, bv, id, vmag);

        // Also add to override arrays for the glow sprite rendering
        overridePositions.push(pos.x, pos.y, pos.z);
        overrideColors.push(scratchColor.r, scratchColor.g, scratchColor.b);
        overrideScales.push(override.scale ?? 1);
      }
    }

    // Cache override sprite inputs so skipped frames can still refresh sprite
    // sizes, then update the sprites for this frame.
    cachedOverridePositions = overridePositions;
    cachedOverrideColors = overrideColors;
    cachedOverrideScales = overrideScales;
    updateOverrideStars(overridePositions, overrideColors, overrideScales, fov, canvasHeight);

    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    starIdAttr.needsUpdate = true;
    magnitudeAttr.needsUpdate = true;
    starsGeometry.setDrawRange(0, count);

    renderedStarCount = count;
  }

  function updateLabels(labelsVisible: boolean): void {
    for (let starIdx = 0; starIdx < MAJOR_STARS.length; starIdx++) {
      const [hr] = MAJOR_STARS[starIdx];
      const label = starLabels.get(hr);
      if (!label) continue;

      const pos = starPositionMap.get(hr);
      if (pos) {
        calculateLabelOffsetInPlace(pos, LABEL_OFFSET, label.position);
        label.visible = labelsVisible;

        // Register star label with label manager
        // MAJOR_STARS is sorted by brightness, so use index to calculate priority
        // First stars (Sirius, Canopus, etc.) get priority 500, later ones decrease
        if (labelsVisible && currentLabelManager) {
          const priority = Math.max(300, 500 - starIdx * 5);
          currentLabelManager.registerLabel({
            id: `star-${hr}`,
            objectPos: pos,
            labelPos: label.position,
            priority: priority,
            label: label,
            color: starFlagLineColor,
          });
        }
      } else {
        label.visible = false;
      }
    }
  }

  function setOverrides(overrides: Array<{ starHR: number; magnitude?: number; bvColor?: number; scale?: number; ra?: number; dec?: number }>): void {
    starOverrideMap.clear();
    for (const override of overrides) {
      starOverrideMap.set(override.starHR, {
        magnitude: override.magnitude,
        bvColor: override.bvColor,
        scale: override.scale,
        ra: override.ra,
        dec: override.dec,
      });
    }
    // Bump the override version so the next update() forces a rebuild (tour
    // effects must always take effect, bypassing the time-only skip).
    overrideVersion++;
    if (lastEngine) {
      update(lastEngine, lastFov, lastCanvasHeight);
    }
  }

  function clearOverrides(): void {
    starOverrideMap.clear();
    overrideVersion++;
    if (lastEngine) {
      update(lastEngine, lastFov, lastCanvasHeight);
    }
  }

  // Scintillation state
  let scintillationEnabled = false;
  let scintillationStartTime = 0;

  function setScintillationEnabled(enabled: boolean): void {
    scintillationEnabled = enabled;
    scintillationUniforms.scintillationEnabled.value = enabled;
    if (enabled) {
      scintillationStartTime = performance.now();
    }
  }

  function setScintillationIntensity(intensity: number): void {
    scintillationUniforms.scintillationIntensity.value = Math.max(0, Math.min(1, intensity));
  }

  /**
   * Update scintillation for current frame.
   * Call this every frame when scintillation is enabled.
   * @param latitude - Observer latitude in degrees
   * @param lst - Local Sidereal Time in degrees
   */
  function updateScintillation(latitude: number, lst: number): void {
    if (!scintillationEnabled) return;

    // Update time (in seconds since scintillation started)
    const elapsed = (performance.now() - scintillationStartTime) / 1000;
    scintillationUniforms.time.value = elapsed;

    // Compute zenith direction in Three.js coordinates, writing directly into
    // the uniform to avoid a per-frame Vector3 allocation.
    // Zenith is at RA=LST, Dec=latitude. Equivalent to raDecToPosition(lst, latitude, 1).
    const raRad = (lst * Math.PI) / 180;
    const decRad = (latitude * Math.PI) / 180;
    const cosDec = Math.cos(decRad);
    scintillationUniforms.zenith.value
      .set(-cosDec * Math.cos(raRad), Math.sin(decRad), cosDec * Math.sin(raRad))
      .normalize();
  }

  return {
    points: starsPoints,
    overrideStarsGroup,
    labels: starLabels,
    getConstellationStarPositionMap: () => constellationStarPositionMap,
    buildConstellationStarMap,
    update,
    updateLabels,
    setOverrides,
    clearOverrides,
    getRenderedCount: () => renderedStarCount,
    setScintillationEnabled,
    setScintillationIntensity,
    updateScintillation,
  };
}
