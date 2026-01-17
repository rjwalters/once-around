/**
 * Satellites Layer
 *
 * Renders satellites (ISS, Hubble, etc.) as moving points with visibility-based appearance.
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

// Visual configuration
const COLOR_ILLUMINATED = new THREE.Color(1.0, 0.95, 0.8); // Bright yellowish-white
const COLOR_SHADOW = new THREE.Color(0.3, 0.3, 0.4);       // Dim blue-gray (in shadow)
const POINT_SIZE = 0.15; // Point size when rendered

// Satellite-specific colors (optional differentiation)
const SATELLITE_COLORS: { [key: string]: THREE.Color } = {
  ISS: new THREE.Color(1.0, 0.95, 0.8),    // Yellowish-white
  Hubble: new THREE.Color(0.8, 0.9, 1.0),  // Slightly blue-white
};

export interface SatelliteState {
  info: SatelliteInfo;
  mesh: THREE.Points;
  label: CSS2DObject;
  labelDiv: HTMLDivElement;
  hasData: boolean;
  visible: boolean;
}

export interface SatellitesLayer {
  /** All satellite states */
  satellites: SatelliteState[];
  /** Update all satellite positions and visibility */
  update(engine: SkyEngine, labelsVisible: boolean): void;
  /** Set whether satellites layer is enabled */
  setEnabled(enabled: boolean): void;
  /** Get position for a specific satellite (for search) */
  getSatellitePosition(index: number, engine: SkyEngine): { x: number; y: number; z: number } | null;
  /** Check if a specific satellite is visible */
  isSatelliteVisible(index: number): boolean;
}

/**
 * Create a single satellite's mesh and label.
 */
function createSatelliteMesh(
  info: SatelliteInfo,
  scene: THREE.Scene,
  labelsGroup: THREE.Group
): SatelliteState {
  // Create point geometry
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

  function update(engine: SkyEngine, labelsVisible: boolean): void {
    for (const sat of satelliteStates) {
      updateSatellite(sat, engine, labelsVisible, enabled);
    }
  }

  function setEnabled(value: boolean): void {
    enabled = value;
    if (!enabled) {
      for (const sat of satelliteStates) {
        sat.mesh.visible = false;
        sat.label.visible = false;
        sat.visible = false;
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
 * Update a single satellite's state.
 */
function updateSatellite(
  sat: SatelliteState,
  engine: SkyEngine,
  labelsVisible: boolean,
  enabled: boolean
): void {
  const { info, mesh, label, labelDiv } = sat;
  const geometry = mesh.geometry as THREE.BufferGeometry;
  const material = mesh.material as THREE.PointsMaterial;

  // Check if we have ephemeris data
  sat.hasData = engine.has_satellite_ephemeris(info.index);

  if (!enabled || !sat.hasData) {
    mesh.visible = false;
    label.visible = false;
    sat.visible = false;
    return;
  }

  // Check if current time is within ephemeris range
  if (!engine.satellite_in_range(info.index)) {
    mesh.visible = false;
    label.visible = false;
    sat.visible = false;
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
    return;
  }

  // Calculate position on sky sphere
  const radius = SKY_RADIUS - 0.3; // Slightly in front of stars
  const satPos = rustToThreeJS(pos.x, pos.y, pos.z, radius);

  // Update point position
  const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
  posAttr.setXYZ(0, satPos.x, satPos.y, satPos.z);
  posAttr.needsUpdate = true;

  // Update color based on illumination
  const baseColor = SATELLITE_COLORS[info.name] ?? COLOR_ILLUMINATED;
  const color = pos.illuminated ? baseColor : COLOR_SHADOW;
  const colorAttr = geometry.getAttribute("color") as THREE.BufferAttribute;
  colorAttr.setXYZ(0, color.r, color.g, color.b);
  colorAttr.needsUpdate = true;

  // Update opacity - dimmer when in shadow
  material.opacity = pos.illuminated ? 1.0 : 0.4;

  mesh.visible = true;
  sat.visible = visible;

  // Update label
  if (labelsVisible) {
    const labelPos = calculateLabelOffset(satPos, LABEL_OFFSET);
    label.position.copy(labelPos);
    label.visible = true;

    // Update label text with status
    if (pos.illuminated) {
      labelDiv.textContent = info.name;
      labelDiv.classList.remove("satellite-in-shadow");
    } else {
      labelDiv.textContent = `${info.name} (shadow)`;
      labelDiv.classList.add("satellite-in-shadow");
    }
  } else {
    label.visible = false;
  }
}

// Re-export legacy ISS layer interface for backwards compatibility
export { createSatellitesLayer as createISSLayer };
