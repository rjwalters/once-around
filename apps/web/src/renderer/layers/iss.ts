/**
 * ISS (International Space Station) Layer
 *
 * Renders the ISS as a moving satellite with visibility-based appearance.
 * The ISS is only visible when:
 * 1. Ephemeris data is loaded and covers the current time
 * 2. It's above the observer's horizon
 * 3. It's illuminated by the Sun (not in Earth's shadow)
 */

import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import type { SkyEngine } from "../../wasm/sky_engine";
import { getISSBuffer } from "../../engine";
import { SKY_RADIUS, LABEL_OFFSET } from "../constants";
import { rustToThreeJS } from "../utils/coordinates";
import { calculateLabelOffset } from "../utils/labels";

// ISS visual configuration
const ISS_COLOR_ILLUMINATED = new THREE.Color(1.0, 0.95, 0.8); // Bright yellowish-white
const ISS_COLOR_SHADOW = new THREE.Color(0.3, 0.3, 0.4);       // Dim blue-gray (in shadow)
const ISS_SIZE = 0.15; // Point size when rendered

export interface ISSLayer {
  /** ISS point mesh */
  mesh: THREE.Points;
  /** ISS label */
  label: CSS2DObject;
  /** Whether ISS data is available */
  hasData: boolean;
  /** Update ISS position and visibility */
  update(engine: SkyEngine, labelsVisible: boolean): void;
  /** Set whether ISS layer is enabled */
  setEnabled(enabled: boolean): void;
  /** Check if ISS is currently visible */
  isVisible(): boolean;
}

/**
 * Create the ISS layer.
 * @param scene - The Three.js scene to add the mesh to
 * @param labelsGroup - The group to add the label to
 * @returns ISSLayer interface
 */
export function createISSLayer(scene: THREE.Scene, labelsGroup: THREE.Group): ISSLayer {
  let enabled = true;
  let hasData = false;
  let currentlyVisible = false;

  // Create ISS point geometry
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(3);
  const colors = new Float32Array(3);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  // Create material for ISS point
  const material = new THREE.PointsMaterial({
    size: ISS_SIZE,
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

  // Create ISS label
  const div = document.createElement("div");
  div.className = "sky-label iss-label";
  div.textContent = "ISS";
  const label = new CSS2DObject(div);
  label.visible = false;
  labelsGroup.add(label);

  function update(engine: SkyEngine, labelsVisible: boolean): void {
    // Check if we have ephemeris data
    hasData = engine.has_iss_ephemeris();

    if (!enabled || !hasData) {
      mesh.visible = false;
      label.visible = false;
      currentlyVisible = false;
      return;
    }

    // Check if current time is within ephemeris range
    if (!engine.iss_in_range()) {
      mesh.visible = false;
      label.visible = false;
      currentlyVisible = false;
      // Update label to show "out of range"
      div.textContent = "ISS (no data)";
      return;
    }

    // Get ISS buffer: [x, y, z, illuminated, above_horizon]
    const issBuffer = getISSBuffer(engine);
    const x = issBuffer[0];
    const y = issBuffer[1];
    const z = issBuffer[2];
    const illuminated = issBuffer[3] > 0.5;
    const aboveHorizon = issBuffer[4] > 0.5;

    // ISS is only visible when illuminated AND above horizon
    // (In real life, you can only see it when it's in sunlight and you're in darkness)
    const visible = illuminated && aboveHorizon;

    if (!visible && !aboveHorizon) {
      // ISS is below horizon - don't show it
      mesh.visible = false;
      label.visible = false;
      currentlyVisible = false;
      return;
    }

    // Calculate position on sky sphere
    const radius = SKY_RADIUS - 0.3; // Slightly in front of stars
    const issPos = rustToThreeJS(x, y, z, radius);

    // Update point position
    const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
    posAttr.setXYZ(0, issPos.x, issPos.y, issPos.z);
    posAttr.needsUpdate = true;

    // Update color based on illumination
    const color = illuminated ? ISS_COLOR_ILLUMINATED : ISS_COLOR_SHADOW;
    const colorAttr = geometry.getAttribute("color") as THREE.BufferAttribute;
    colorAttr.setXYZ(0, color.r, color.g, color.b);
    colorAttr.needsUpdate = true;

    // Update opacity - dimmer when in shadow
    material.opacity = illuminated ? 1.0 : 0.4;

    mesh.visible = true;
    currentlyVisible = visible;

    // Update label
    if (labelsVisible) {
      const labelPos = calculateLabelOffset(issPos, LABEL_OFFSET);
      label.position.copy(labelPos);
      label.visible = true;

      // Update label text with status
      if (illuminated) {
        div.textContent = "ISS";
        div.classList.remove("iss-in-shadow");
      } else {
        div.textContent = "ISS (shadow)";
        div.classList.add("iss-in-shadow");
      }
    } else {
      label.visible = false;
    }
  }

  function setEnabled(value: boolean): void {
    enabled = value;
    if (!enabled) {
      mesh.visible = false;
      label.visible = false;
      currentlyVisible = false;
    }
  }

  function isVisible(): boolean {
    return currentlyVisible;
  }

  return {
    mesh,
    label,
    hasData,
    update,
    setEnabled,
    isVisible,
  };
}
