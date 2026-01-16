/**
 * Constellations Layer
 *
 * Renders constellation lines connecting stars and constellation labels.
 */

import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { getAllConstellationLines, CONSTELLATIONS } from "../../constellations";
import { SKY_RADIUS, CONSTELLATION_COLOR } from "../constants";

const MAX_CONSTELLATION_LINES = 2000;

export interface ConstellationsLayer {
  /** The constellation lines mesh */
  lines: THREE.LineSegments;
  /** Constellation labels (name -> label) */
  labels: Map<string, CSS2DObject>;
  /** Set visibility of constellation lines */
  setVisible(visible: boolean): void;
  /** Update constellation lines and labels from star position map */
  update(constellationStarPositionMap: Map<number, THREE.Vector3>): void;
  /** Update label visibility */
  setLabelsVisible(labelsVisible: boolean): void;
}

/**
 * Create the constellations layer.
 * @param scene - The Three.js scene to add meshes to
 * @param labelsGroup - The group to add constellation labels to
 * @returns ConstellationsLayer interface
 */
export function createConstellationsLayer(scene: THREE.Scene, labelsGroup: THREE.Group): ConstellationsLayer {
  // Constellation lines geometry
  const constellationGeometry = new THREE.BufferGeometry();
  const constellationPositionBuffer = new Float32Array(MAX_CONSTELLATION_LINES * 2 * 3);
  const constellationPositionAttr = new THREE.BufferAttribute(constellationPositionBuffer, 3);
  constellationPositionAttr.setUsage(THREE.DynamicDrawUsage);
  constellationGeometry.setAttribute("position", constellationPositionAttr);

  const constellationMaterial = new THREE.LineBasicMaterial({
    color: CONSTELLATION_COLOR,
    transparent: true,
    opacity: 0.4,
  });

  const constellationLines = new THREE.LineSegments(constellationGeometry, constellationMaterial);
  constellationLines.visible = false;
  scene.add(constellationLines);

  // Constellation labels
  const constellationLabels: Map<string, CSS2DObject> = new Map();
  for (const constellation of CONSTELLATIONS) {
    const div = document.createElement("div");
    div.className = "sky-label constellation-label";
    div.textContent = constellation.name;
    div.dataset.constellation = constellation.name;
    const label = new CSS2DObject(div);
    label.visible = false;
    constellationLabels.set(constellation.name, label);
    labelsGroup.add(label);
  }

  // Get all line pairs (HR numbers)
  const constellationPairs = getAllConstellationLines();

  // Track state
  let labelsVisible = true;

  function setVisible(visible: boolean): void {
    constellationLines.visible = visible;
  }

  function setLabelsVisible(visible: boolean): void {
    labelsVisible = visible;
    for (const label of constellationLabels.values()) {
      if (label.userData.hasValidPosition) {
        label.visible = visible;
      }
    }
  }

  function update(constellationStarPositionMap: Map<number, THREE.Vector3>): void {
    // Build line segment positions from star pairs
    let lineIndex = 0;

    for (const [hr1, hr2] of constellationPairs) {
      const pos1 = constellationStarPositionMap.get(hr1);
      const pos2 = constellationStarPositionMap.get(hr2);

      if (pos1 && pos2 && lineIndex < MAX_CONSTELLATION_LINES) {
        const idx = lineIndex * 6;
        constellationPositionBuffer[idx] = pos1.x;
        constellationPositionBuffer[idx + 1] = pos1.y;
        constellationPositionBuffer[idx + 2] = pos1.z;
        constellationPositionBuffer[idx + 3] = pos2.x;
        constellationPositionBuffer[idx + 4] = pos2.y;
        constellationPositionBuffer[idx + 5] = pos2.z;
        lineIndex++;
      }
    }

    constellationPositionAttr.needsUpdate = true;
    constellationGeometry.setDrawRange(0, lineIndex * 2);

    // Update constellation label positions (centroid of all stars in constellation)
    for (const constellation of CONSTELLATIONS) {
      const label = constellationLabels.get(constellation.name);
      if (!label) continue;

      // Collect unique star IDs from this constellation's lines
      const starIds = new Set<number>();
      for (const [hr1, hr2] of constellation.lines) {
        starIds.add(hr1);
        starIds.add(hr2);
      }

      // Calculate centroid of all stars in constellation
      let cx = 0, cy = 0, cz = 0;
      let count = 0;
      for (const id of starIds) {
        const pos = constellationStarPositionMap.get(id);
        if (pos) {
          cx += pos.x;
          cy += pos.y;
          cz += pos.z;
          count++;
        }
      }

      if (count >= 2) {
        // Normalize to put label on sky sphere
        const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
        if (len > 0) {
          label.position.set(
            (cx / len) * SKY_RADIUS,
            (cy / len) * SKY_RADIUS,
            (cz / len) * SKY_RADIUS
          );
          label.userData.hasValidPosition = true;
          label.visible = labelsVisible;
        }
      } else {
        label.visible = false;
        label.userData.hasValidPosition = false;
      }
    }
  }

  return {
    lines: constellationLines,
    labels: constellationLabels,
    setVisible,
    update,
    setLabelsVisible,
  };
}
