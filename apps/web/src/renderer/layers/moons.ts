/**
 * Planetary Moons Layer
 *
 * Renders the Galilean moons of Jupiter (Io, Europa, Ganymede, Callisto)
 * and Saturn's Titan as point sources, with labels and flag lines.
 * Only visible when zoomed in (FOV < threshold).
 */

import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import type { SkyEngine } from "../../wasm/sky_engine";
import { getPlanetaryMoonsBuffer } from "../../engine";
import {
  SKY_RADIUS,
  PLANETARY_MOON_NAMES,
  PLANETARY_MOON_COLORS,
  PLANETARY_MOON_MAGNITUDES,
  PLANETARY_MOONS_FOV_THRESHOLD,
  POINT_SOURCE_ANGULAR_SIZE_ARCSEC,
} from "../constants";
import { rustToThreeJS } from "../utils/coordinates";
import { angularSizeToPixels } from "../utils/colors";
import { calculateLabelOffset } from "../utils/labels";

const MOON_LABEL_OFFSET = 0.4;

export interface PlanetaryMoonsLayer {
  /** The moons points mesh */
  points: THREE.Points;
  /** Flag lines connecting labels to moons */
  flagLines: THREE.LineSegments;
  /** Moon labels */
  labels: CSS2DObject[];
  /** Update moon positions */
  update(engine: SkyEngine, fov: number, labelsVisible: boolean, canvasHeight: number): void;
}

/**
 * Create the planetary moons layer.
 * @param scene - The Three.js scene to add the meshes to
 * @param labelsGroup - The group to add moon labels to
 * @returns PlanetaryMoonsLayer interface
 */
export function createPlanetaryMoonsLayer(scene: THREE.Scene, labelsGroup: THREE.Group): PlanetaryMoonsLayer {
  // Create geometry with positions and colors
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(5 * 3);
  const colors = new Float32Array(5 * 3);

  // Initialize colors and calculate brightness from magnitude
  for (let i = 0; i < 5; i++) {
    const mag = PLANETARY_MOON_MAGNITUDES[i];
    const color = PLANETARY_MOON_COLORS[i];
    // Convert magnitude to brightness factor (normalize to Ganymede = 1.0)
    const brightness = Math.pow(10, (4.6 - mag) / 2.5);
    const clampedBrightness = Math.min(1.0, Math.max(0.15, brightness));

    colors[i * 3] = color.r * clampedBrightness;
    colors[i * 3 + 1] = color.g * clampedBrightness;
    colors[i * 3 + 2] = color.b * clampedBrightness;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 2.5,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
  });

  const points = new THREE.Points(geometry, material);
  points.visible = false;
  scene.add(points);

  // Flag lines connecting labels to moons
  const flagGeometry = new THREE.BufferGeometry();
  const flagPositions = new Float32Array(5 * 2 * 3);
  const flagColors = new Float32Array(5 * 2 * 3);
  flagGeometry.setAttribute("position", new THREE.BufferAttribute(flagPositions, 3));
  flagGeometry.setAttribute("color", new THREE.BufferAttribute(flagColors, 3));

  const flagMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
  });

  const flagLines = new THREE.LineSegments(flagGeometry, flagMaterial);
  flagLines.visible = false;
  scene.add(flagLines);

  // Create labels
  const labels: CSS2DObject[] = [];
  for (let i = 0; i < 5; i++) {
    const div = document.createElement("div");
    div.className = "sky-label planetary-moon-label";
    div.textContent = PLANETARY_MOON_NAMES[i];
    const label = new CSS2DObject(div);
    label.visible = false;
    labels.push(label);
    labelsGroup.add(label);
  }

  function update(engine: SkyEngine, fov: number, labelsVisible: boolean, canvasHeight: number): void {
    const visible = fov < PLANETARY_MOONS_FOV_THRESHOLD;

    // Hide if FOV is too wide
    if (!visible) {
      points.visible = false;
      flagLines.visible = false;
      for (let i = 0; i < 5; i++) {
        labels[i].visible = false;
      }
      return;
    }

    // Update point size based on FOV
    material.size = angularSizeToPixels(POINT_SOURCE_ANGULAR_SIZE_ARCSEC, fov, canvasHeight);

    const moonsBuffer = getPlanetaryMoonsBuffer(engine);
    const radius = SKY_RADIUS - 0.5;

    const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const flagPosAttr = flagGeometry.getAttribute("position") as THREE.BufferAttribute;
    const flagColorAttr = flagGeometry.getAttribute("color") as THREE.BufferAttribute;

    for (let i = 0; i < 5; i++) {
      const idx = i * 4;
      // Moons buffer has 4 components per moon: x, y, z, angDiam
      const moonPos = rustToThreeJS(moonsBuffer[idx], moonsBuffer[idx + 1], moonsBuffer[idx + 2], radius);

      // Update position in the Points geometry buffer
      posAttr.setXYZ(i, moonPos.x, moonPos.y, moonPos.z);

      // Update label position
      const labelPos = calculateLabelOffset(moonPos, MOON_LABEL_OFFSET);
      labels[i].position.copy(labelPos);
      labels[i].visible = labelsVisible;

      // Update flag line
      const color = PLANETARY_MOON_COLORS[i];
      flagPosAttr.setXYZ(i * 2, moonPos.x, moonPos.y, moonPos.z);
      flagPosAttr.setXYZ(i * 2 + 1, labelPos.x, labelPos.y, labelPos.z);
      flagColorAttr.setXYZ(i * 2, color.r, color.g, color.b);
      flagColorAttr.setXYZ(i * 2 + 1, color.r, color.g, color.b);
    }

    posAttr.needsUpdate = true;
    flagPosAttr.needsUpdate = true;
    flagColorAttr.needsUpdate = true;
    points.visible = true;
    flagLines.visible = labelsVisible;
  }

  return {
    points,
    flagLines,
    labels,
    update,
  };
}
