/**
 * Satellites Layer
 *
 * Renders satellites (ISS, Hubble, etc.) with LOD-based rendering:
 * - Far away: Point source (glow sprite)
 * - Close up: Detailed sprite showing satellite structure
 *
 * Satellites are only visible when:
 * 1. Ephemeris data is loaded and covers the current time
 * 2. They're above the observer's horizon
 * 3. They're illuminated by the Sun (not in Earth's shadow)
 */

import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import type { SkyEngine } from "../../wasm/sky_engine";
import { getSatellitePosition, SATELLITES, type SatelliteInfo } from "../../engine";
import { SKY_RADIUS, LABEL_OFFSET } from "../constants";
import { rustToThreeJS } from "../utils/coordinates";
import { calculateLabelOffset } from "../utils/labels";
import { smoothstep } from "../utils/math";
import { createGlowSpriteMaterial } from "../utils/materials";
import type { LabelManager } from "../label-manager";
import { LABEL_PRIORITY } from "../label-manager";

// Visual configuration
const COLOR_ILLUMINATED = new THREE.Color(1.0, 0.95, 0.8); // Bright yellowish-white
const COLOR_SHADOW = new THREE.Color(0.3, 0.3, 0.4);       // Dim blue-gray (in shadow)
const POINT_SIZE = 0.15; // Point size when rendered

// Satellite-specific colors (optional differentiation)
const SATELLITE_COLORS: { [key: string]: THREE.Color } = {
  ISS: new THREE.Color(1.0, 0.95, 0.8),    // Yellowish-white
  Hubble: new THREE.Color(0.8, 0.9, 1.0),  // Slightly blue-white
};

// Satellite physical sizes in meters (for angular size calculation)
// ISS: ~109m x 73m (solar array span x length) - use largest dimension
// Hubble: ~13.2m length x 4.2m diameter
const SATELLITE_SIZES_METERS: { [key: string]: number } = {
  ISS: 109,
  Hubble: 13.2,
};

// LOD thresholds in pixels (when to switch from point to detailed sprite)
const LOD_POINT_MAX_PX = 3;     // Below this: point sprite only
const LOD_DETAIL_MIN_PX = 6;   // Above this: detailed sprite fully visible
// Between 3-6px: crossfade

// Satellite texture URLs (detail sprites)
const SATELLITE_TEXTURES: { [key: string]: string } = {
  ISS: "/iss.jpg",
  Hubble: "/hubble.jpg",
};

export interface SatelliteState {
  info: SatelliteInfo;
  mesh: THREE.Points;
  label: CSS2DObject;
  labelDiv: HTMLDivElement;
  hasData: boolean;
  visible: boolean;
  // LOD support
  detailSprite: THREE.Sprite | null;
  detailMaterial: THREE.SpriteMaterial | null;
  glowSprite: THREE.Sprite;
  glowMaterial: THREE.SpriteMaterial;
}

export interface SatellitesLayer {
  /** All satellite states */
  satellites: SatelliteState[];
  /** Update all satellite positions and visibility */
  update(engine: SkyEngine, labelsVisible: boolean, fov: number, canvasHeight: number, labelManager?: LabelManager): void;
  /** Set whether satellites layer is enabled */
  setEnabled(enabled: boolean): void;
  /** Get position for a specific satellite (for search) */
  getSatellitePosition(index: number, engine: SkyEngine): { x: number; y: number; z: number } | null;
  /** Check if a specific satellite is visible */
  isSatelliteVisible(index: number): boolean;
}

/**
 * Load satellite detail texture if available.
 */
function loadDetailTexture(name: string): THREE.Texture | null {
  const url = SATELLITE_TEXTURES[name];
  if (!url) return null;

  const loader = new THREE.TextureLoader();
  const texture = loader.load(url, undefined, undefined, () => {
    // Texture failed to load - this is expected if file doesn't exist
    console.log(`Satellite detail texture not found: ${url}`);
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Create a single satellite's mesh and label.
 */
function createSatelliteMesh(
  info: SatelliteInfo,
  scene: THREE.Scene,
  labelsGroup: THREE.Group
): SatelliteState {
  // Create point geometry (legacy, still used for basic rendering)
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(3);
  const colors = new Float32Array(3);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  // Create material
  const material = new THREE.PointsMaterial({
    size: POINT_SIZE,
    vertexColors: true,
    transparent: true,
    opacity: 1.0,
    sizeAttenuation: false,
    depthTest: false,
  });

  const mesh = new THREE.Points(geometry, material);
  mesh.visible = false;
  mesh.renderOrder = 100; // Render on top
  scene.add(mesh);

  // Create glow sprite (point source representation)
  const color = SATELLITE_COLORS[info.name] ?? COLOR_ILLUMINATED;
  const glowMaterial = createGlowSpriteMaterial(color);
  const glowSprite = new THREE.Sprite(glowMaterial);
  glowSprite.visible = false;
  glowSprite.renderOrder = 101;
  scene.add(glowSprite);

  // Create detail sprite (for zoomed in view)
  let detailSprite: THREE.Sprite | null = null;
  let detailMaterial: THREE.SpriteMaterial | null = null;

  const detailTexture = loadDetailTexture(info.name);
  if (detailTexture) {
    detailMaterial = new THREE.SpriteMaterial({
      map: detailTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    detailSprite = new THREE.Sprite(detailMaterial);
    detailSprite.visible = false;
    detailSprite.renderOrder = 102;
    scene.add(detailSprite);
  }

  // Create label
  const div = document.createElement("div");
  div.className = `sky-label satellite-label satellite-${info.name.toLowerCase()}`;
  div.textContent = info.name;
  const label = new CSS2DObject(div);
  label.visible = false;
  labelsGroup.add(label);

  return {
    info,
    mesh,
    label,
    labelDiv: div,
    hasData: false,
    visible: false,
    detailSprite,
    detailMaterial,
    glowSprite,
    glowMaterial,
  };
}

/**
 * Create the satellites layer.
 * @param scene - The Three.js scene to add meshes to
 * @param labelsGroup - The group to add labels to
 * @returns SatellitesLayer interface
 */
export function createSatellitesLayer(scene: THREE.Scene, labelsGroup: THREE.Group): SatellitesLayer {
  let enabled = true;

  // Create state for each satellite
  const satelliteStates: SatelliteState[] = SATELLITES.map(info =>
    createSatelliteMesh(info, scene, labelsGroup)
  );

  function update(engine: SkyEngine, labelsVisible: boolean, fov: number, canvasHeight: number, labelManager?: LabelManager): void {
    for (const sat of satelliteStates) {
      updateSatellite(sat, engine, labelsVisible, enabled, fov, canvasHeight, labelManager);
    }
  }

  function setEnabled(value: boolean): void {
    enabled = value;
    if (!enabled) {
      for (const sat of satelliteStates) {
        sat.mesh.visible = false;
        sat.label.visible = false;
        sat.visible = false;
        sat.glowSprite.visible = false;
        if (sat.detailSprite) sat.detailSprite.visible = false;
      }
    }
  }

  function getSatellitePositionFn(index: number, engine: SkyEngine): { x: number; y: number; z: number } | null {
    if (!engine.has_satellite_ephemeris(index) || !engine.satellite_in_range(index)) {
      return null;
    }
    const pos = getSatellitePosition(engine, index);
    // Only return if position is valid (non-zero)
    if (pos.x === 0 && pos.y === 0 && pos.z === 0) {
      return null;
    }
    return { x: pos.x, y: pos.y, z: pos.z };
  }

  function isSatelliteVisible(index: number): boolean {
    const sat = satelliteStates[index];
    return sat?.visible ?? false;
  }

  return {
    satellites: satelliteStates,
    update,
    setEnabled,
    getSatellitePosition: getSatellitePositionFn,
    isSatelliteVisible,
  };
}

/**
 * Calculate angular size in pixels for a satellite.
 * @param distanceKm - Distance to satellite in kilometers
 * @param sizeMeter - Physical size of satellite in meters
 * @param fov - Field of view in degrees
 * @param canvasHeight - Canvas height in pixels
 * @returns Angular size in pixels
 */
function calculatePixelSize(distanceKm: number, sizeMeters: number, fov: number, canvasHeight: number): number {
  if (distanceKm <= 0) return 0;

  // Convert distance to meters
  const distanceMeters = distanceKm * 1000;

  // Angular size in radians: arctan(size / distance) ≈ size / distance for small angles
  const angularSizeRad = sizeMeters / distanceMeters;

  // Convert to degrees then to pixels
  const angularSizeDeg = angularSizeRad * (180 / Math.PI);
  const pixelSize = (angularSizeDeg / fov) * canvasHeight;

  return pixelSize;
}

/**
 * Update a single satellite's state.
 */
function updateSatellite(
  sat: SatelliteState,
  engine: SkyEngine,
  labelsVisible: boolean,
  enabled: boolean,
  fov: number,
  canvasHeight: number,
  labelManager?: LabelManager
): void {
  const { info, mesh, label, labelDiv, glowSprite, glowMaterial, detailSprite, detailMaterial } = sat;
  const geometry = mesh.geometry as THREE.BufferGeometry;

  // Check if we have ephemeris data
  sat.hasData = engine.has_satellite_ephemeris(info.index);

  if (!enabled || !sat.hasData) {
    mesh.visible = false;
    label.visible = false;
    sat.visible = false;
    glowSprite.visible = false;
    if (detailSprite) detailSprite.visible = false;
    return;
  }

  // Check if current time is within ephemeris range
  if (!engine.satellite_in_range(info.index)) {
    mesh.visible = false;
    label.visible = false;
    sat.visible = false;
    glowSprite.visible = false;
    if (detailSprite) detailSprite.visible = false;
    labelDiv.textContent = `${info.name} (no data)`;
    return;
  }

  // Get satellite position
  const pos = getSatellitePosition(engine, info.index);

  // Satellite is only visible when illuminated AND above horizon
  const visible = pos.illuminated && pos.aboveHorizon;

  if (!visible && !pos.aboveHorizon) {
    // Below horizon - don't show
    mesh.visible = false;
    label.visible = false;
    sat.visible = false;
    glowSprite.visible = false;
    if (detailSprite) detailSprite.visible = false;
    return;
  }

  // Calculate position on sky sphere
  const radius = SKY_RADIUS - 0.3; // Slightly in front of stars
  const satPos = rustToThreeJS(pos.x, pos.y, pos.z, radius);

  // Calculate angular size in pixels for LOD selection
  const sizeMeters = SATELLITE_SIZES_METERS[info.name] ?? 50; // Default 50m
  const pixelSize = calculatePixelSize(pos.distanceKm, sizeMeters, fov, canvasHeight);

  // Calculate LOD blend factor (0 = point only, 1 = detail only)
  const detailBlend = smoothstep(LOD_POINT_MAX_PX, LOD_DETAIL_MIN_PX, pixelSize);

  // Update color based on illumination
  const baseColor = SATELLITE_COLORS[info.name] ?? COLOR_ILLUMINATED;
  const color = pos.illuminated ? baseColor : COLOR_SHADOW;
  const opacity = pos.illuminated ? 1.0 : 0.4;

  // Hide legacy point mesh - we use sprites now
  mesh.visible = false;

  // Position both sprites
  glowSprite.position.copy(satPos);
  if (detailSprite) detailSprite.position.copy(satPos);

  // === Point source sprite (glow) ===
  // Show when we're in point-source mode or transitioning
  if (detailBlend < 1.0) {
    glowSprite.visible = true;
    glowMaterial.color.copy(color);
    glowMaterial.opacity = opacity * (1.0 - detailBlend);

    // Fixed star-like size for glow
    const fovArcsec = fov * 3600;
    const pointSizeArcsec = Math.max(2, fov * 3600 / canvasHeight * 1.5);
    const spriteWorldSize = (pointSizeArcsec / fovArcsec) * SKY_RADIUS * 4;
    glowSprite.scale.set(spriteWorldSize, spriteWorldSize, 1);
  } else {
    glowSprite.visible = false;
  }

  // === Detail sprite (satellite image) ===
  // Show when zoomed in enough AND we have a texture
  if (detailSprite && detailMaterial && detailBlend > 0) {
    detailSprite.visible = true;
    detailMaterial.opacity = opacity * detailBlend;

    // Scale based on angular size
    // Satellite should appear at its actual angular size when fully detailed
    const fovArcsec = fov * 3600;
    const angSizeArcsec = (sizeMeters / (pos.distanceKm * 1000)) * (180 / Math.PI) * 3600;

    // But clamp to minimum visible size and multiply for visibility
    const minArcsec = fov * 3600 / canvasHeight * 6; // Minimum 6 pixels
    const displayArcsec = Math.max(angSizeArcsec, minArcsec);
    const spriteWorldSize = (displayArcsec / fovArcsec) * SKY_RADIUS * 2;
    detailSprite.scale.set(spriteWorldSize, spriteWorldSize, 1);
  } else if (detailSprite) {
    detailSprite.visible = false;
  }

  sat.visible = visible;

  // Update label
  if (labelsVisible) {
    const labelPos = calculateLabelOffset(satPos, LABEL_OFFSET);
    label.position.copy(labelPos);
    label.visible = true;

    // Register satellite label with label manager
    if (labelManager) {
      labelManager.registerLabel({
        id: `satellite-${info.index}`,
        worldPos: labelPos,
        priority: LABEL_PRIORITY.SATELLITE,
        label: label,
      });
    }

    // Update label text with status and distance
    const distText = pos.distanceKm > 0 ? ` (${Math.round(pos.distanceKm)} km)` : '';
    if (pos.illuminated) {
      labelDiv.textContent = info.name + distText;
      labelDiv.classList.remove("satellite-in-shadow");
    } else {
      labelDiv.textContent = `${info.name} (shadow)${distText}`;
      labelDiv.classList.add("satellite-in-shadow");
    }
  } else {
    label.visible = false;
  }
}

// Re-export legacy ISS layer interface for backwards compatibility
export { createSatellitesLayer as createISSLayer };
