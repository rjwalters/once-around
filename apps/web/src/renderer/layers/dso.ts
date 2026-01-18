/**
 * Deep Sky Objects (DSO) Layer
 *
 * Renders galaxies, nebulae, and star clusters as elliptical sprites.
 */

import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { DSO_DATA, getVisibleDSOs } from "../../dsoData";
import { SKY_RADIUS, LABEL_OFFSET } from "../constants";
import { dsoVertexShader, dsoFragmentShader } from "../shaders";
import { raDecToPosition } from "../utils/coordinates";
import { getDSOColor, dsoSizeToPixels } from "../utils/colors";
import { calculateLabelOffset } from "../utils/labels";

export interface DSOLayer {
  /** The DSO points mesh */
  points: THREE.Points;
  /** Flag lines connecting labels to DSOs */
  flagLines: THREE.LineSegments;
  /** Map of DSO ID to label */
  labels: Map<string, CSS2DObject>;
  /** Set DSO visibility on/off */
  setVisible(visible: boolean): void;
  /** Update DSO sizes and labels based on FOV and magnitude limit */
  update(fov: number, magLimit: number, labelsVisible: boolean, canvasHeight: number): void;
}

/**
 * Create the DSO layer.
 * @param scene - The Three.js scene to add the mesh to
 * @param labelsGroup - The group to add DSO labels to
 * @returns DSOLayer interface
 */
export function createDSOLayer(scene: THREE.Scene, labelsGroup: THREE.Group): DSOLayer {
  const dsoCount = DSO_DATA.length;

  // Create DSO geometry with custom attributes for elliptical rendering
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(dsoCount * 3);
  const colors = new Float32Array(dsoCount * 3);
  const sizes = new Float32Array(dsoCount);
  const ellipseParams = new Float32Array(dsoCount * 2); // [axisRatio, positionAngle]

  // Initialize DSO positions and attributes
  for (let i = 0; i < dsoCount; i++) {
    const dso = DSO_DATA[i];
    const pos = raDecToPosition(dso.ra, dso.dec, SKY_RADIUS);
    positions[i * 3] = pos.x;
    positions[i * 3 + 1] = pos.y;
    positions[i * 3 + 2] = pos.z;

    const color = getDSOColor(dso.type);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;

    // Axis ratio (minor/major), clamped to avoid degenerate cases
    const axisRatio = Math.max(0.1, dso.sizeArcmin[1] / dso.sizeArcmin[0]);
    // Position angle in radians (add 90° because shader stretches along x-axis,
    // but PA=0 should have major axis pointing North/up)
    const paRad = ((dso.positionAngle + 90) * Math.PI) / 180;
    ellipseParams[i * 2] = axisRatio;
    ellipseParams[i * 2 + 1] = paRad;

    // Initial size (will be updated based on FOV)
    sizes[i] = 10;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("ellipseParams", new THREE.BufferAttribute(ellipseParams, 2));

  const material = new THREE.ShaderMaterial({
    vertexShader: dsoVertexShader,
    fragmentShader: dsoFragmentShader,
    transparent: true,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.visible = false; // Hidden by default
  points.renderOrder = 5; // Render before deep field images
  scene.add(points);

  // Flag lines connecting labels to DSOs
  const flagGeometry = new THREE.BufferGeometry();
  const flagPositions = new Float32Array(dsoCount * 2 * 3);
  const flagColors = new Float32Array(dsoCount * 2 * 3);
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

  // Track visibility state
  let visible = false;

  // Create DSO labels
  const labels: Map<string, CSS2DObject> = new Map();
  for (const dso of DSO_DATA) {
    const div = document.createElement("div");
    div.className = "sky-label dso-label";
    div.textContent = dso.id; // Show catalog ID (M31, NGC7000, etc.)
    div.dataset.dsoId = dso.id; // Store ID for click handler
    const label = new CSS2DObject(div);
    label.visible = false;
    labels.set(dso.id, label);
    labelsGroup.add(label);
  }

  function setVisible(isVisible: boolean): void {
    visible = isVisible;
    points.visible = isVisible;

    // Hide all DSO labels and flag lines when DSOs are hidden
    if (!isVisible) {
      flagLines.visible = false;
      for (const label of labels.values()) {
        label.visible = false;
      }
    }
  }

  function update(fov: number, magLimit: number, labelsVisible: boolean, canvasHeight: number): void {
    if (!visible) return;

    const sizeAttr = geometry.getAttribute("size") as THREE.BufferAttribute;
    const flagPosAttr = flagGeometry.getAttribute("position") as THREE.BufferAttribute;
    const flagColorAttr = flagGeometry.getAttribute("color") as THREE.BufferAttribute;
    const visibleDSOs = getVisibleDSOs(magLimit);
    const visibleIds = new Set(visibleDSOs.map(d => d.id));

    // Update sizes, labels, and flag lines
    for (let i = 0; i < DSO_DATA.length; i++) {
      const dso = DSO_DATA[i];
      const isVisible = visibleIds.has(dso.id);

      if (isVisible) {
        // Calculate size in pixels based on major axis and FOV
        // Minimum size of 4px to ensure visibility
        const sizePixels = Math.max(4, dsoSizeToPixels(dso.sizeArcmin[0], fov, canvasHeight));
        sizeAttr.setX(i, sizePixels);

        const pos = raDecToPosition(dso.ra, dso.dec, SKY_RADIUS);
        const labelPos = calculateLabelOffset(pos, LABEL_OFFSET * 0.8);

        // Update label position and visibility
        const label = labels.get(dso.id);
        if (label) {
          label.position.copy(labelPos);
          label.visible = labelsVisible;
        }

        // Update flag line
        const color = getDSOColor(dso.type);
        flagPosAttr.setXYZ(i * 2, pos.x, pos.y, pos.z);
        flagPosAttr.setXYZ(i * 2 + 1, labelPos.x, labelPos.y, labelPos.z);
        flagColorAttr.setXYZ(i * 2, color.r, color.g, color.b);
        flagColorAttr.setXYZ(i * 2 + 1, color.r, color.g, color.b);
      } else {
        // Hide DSOs that shouldn't be visible at current mag limit
        sizeAttr.setX(i, 0);
        const label = labels.get(dso.id);
        if (label) label.visible = false;

        // Hide flag line by setting both vertices to same point (zero-length line)
        flagPosAttr.setXYZ(i * 2, 0, 0, 0);
        flagPosAttr.setXYZ(i * 2 + 1, 0, 0, 0);
      }
    }

    sizeAttr.needsUpdate = true;
    flagPosAttr.needsUpdate = true;
    flagColorAttr.needsUpdate = true;
    flagLines.visible = labelsVisible;
  }

  return {
    points,
    flagLines,
    labels,
    setVisible,
    update,
  };
}
