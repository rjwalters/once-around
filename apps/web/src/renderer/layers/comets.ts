/**
 * Comets Layer
 *
 * Renders comets with labels and glowing tails pointing away from the Sun.
 */

import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import type { SkyEngine } from "../../wasm/sky_engine";
import { getCometsBuffer } from "../../engine";
import { SKY_RADIUS, LABEL_OFFSET, COMET_NAMES, COMET_COLOR } from "../constants";
import { cometTailVertexShader, cometTailFragmentShader } from "../shaders";
import { rustToThreeJS } from "../utils/coordinates";
import { calculateLabelOffset } from "../utils/labels";
import type { LabelManager } from "../label-manager";
import { LABEL_PRIORITY } from "../label-manager";

// Visibility thresholds
const COMET_VISIBILITY_MAG = 12.0; // Only show comets brighter than this
const COMET_TAIL_MAG = 10.0; // Only show tails for comets brighter than this

export interface CometsLayer {
  /** Comet tail meshes */
  tailMeshes: THREE.Mesh[];
  /** Comet labels */
  labels: CSS2DObject[];
  /** Update comet positions and tails */
  update(engine: SkyEngine, sunPos: THREE.Vector3, labelsVisible: boolean, labelManager?: LabelManager): void;
}

/**
 * Create the comets layer.
 * @param scene - The Three.js scene to add the meshes to
 * @param labelsGroup - The group to add comet labels to
 * @returns CometsLayer interface
 */
export function createCometsLayer(scene: THREE.Scene, labelsGroup: THREE.Group): CometsLayer {
  // Create comet labels
  const labels: CSS2DObject[] = [];
  for (let i = 0; i < COMET_NAMES.length; i++) {
    const div = document.createElement("div");
    div.className = "sky-label comet-label";
    div.textContent = COMET_NAMES[i];
    div.dataset.comet = String(i);
    const label = new CSS2DObject(div);
    label.visible = false;
    labels.push(label);
    labelsGroup.add(label);
  }

  // Create comet tail meshes
  const tailMeshes: THREE.Mesh[] = [];
  const tailMaterials: THREE.ShaderMaterial[] = [];
  const tailGeometry = new THREE.PlaneGeometry(1, 0.3, 1, 1);

  for (let i = 0; i < COMET_NAMES.length; i++) {
    const material = new THREE.ShaderMaterial({
      vertexShader: cometTailVertexShader,
      fragmentShader: cometTailFragmentShader,
      uniforms: {
        uColor: { value: new THREE.Color(COMET_COLOR) },
        uIntensity: { value: 0.5 },
      },
      transparent: true,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    tailMaterials.push(material);

    const mesh = new THREE.Mesh(tailGeometry, material);
    mesh.visible = false;
    tailMeshes.push(mesh);
    scene.add(mesh);
  }

  function update(engine: SkyEngine, sunPos: THREE.Vector3, labelsVisible: boolean, labelManager?: LabelManager): void {
    const cometsBuffer = getCometsBuffer(engine);
    const radius = SKY_RADIUS - 0.5;

    for (let i = 0; i < COMET_NAMES.length; i++) {
      const idx = i * 4;
      // Comets buffer has 4 components per comet: x, y, z, magnitude
      const magnitude = cometsBuffer[idx + 3];

      // Only show comets brighter than threshold
      if (magnitude < COMET_VISIBILITY_MAG && labelsVisible) {
        const cometPos = rustToThreeJS(cometsBuffer[idx], cometsBuffer[idx + 1], cometsBuffer[idx + 2], radius);
        const labelPos = calculateLabelOffset(cometPos, LABEL_OFFSET);
        labels[i].position.copy(labelPos);
        labels[i].visible = true;

        // Register comet label with label manager
        if (labelManager) {
          labelManager.registerLabel({
            id: `comet-${i}`,
            worldPos: labelPos,
            priority: LABEL_PRIORITY.COMET,
            label: labels[i],
          });
        }

        // Update label text with magnitude info
        const labelDiv = labels[i].element as HTMLDivElement;
        labelDiv.textContent = `${COMET_NAMES[i]} (${magnitude.toFixed(1)})`;

        // Update comet tail if bright enough
        if (magnitude < COMET_TAIL_MAG) {
          // Calculate anti-solar direction (tail points AWAY from Sun)
          const antiSolar = new THREE.Vector3().subVectors(cometPos, sunPos).normalize();

          // Position tail mesh at comet location
          tailMeshes[i].position.copy(cometPos);

          // Scale tail based on magnitude (brighter = longer tail)
          const tailLength = Math.max(0.5, (10 - magnitude) * 0.4);
          const tailWidth = tailLength * 0.3;
          tailMeshes[i].scale.set(tailLength, tailWidth, 1);

          // Orient the tail to point away from Sun
          const perpendicular = new THREE.Vector3().crossVectors(antiSolar, cometPos.clone().normalize());
          if (perpendicular.lengthSq() < 0.001) {
            perpendicular.set(0, 1, 0);
          }
          perpendicular.normalize();
          const normal = new THREE.Vector3().crossVectors(antiSolar, perpendicular).normalize();

          const targetMatrix = new THREE.Matrix4();
          targetMatrix.makeBasis(antiSolar, perpendicular, normal);
          tailMeshes[i].setRotationFromMatrix(targetMatrix);

          // Offset the tail so it starts at the comet head
          tailMeshes[i].position.addScaledVector(antiSolar, tailLength * 0.5);

          // Set intensity based on magnitude
          const intensity = Math.max(0.1, Math.min(1.0, (10 - magnitude) * 0.15));
          tailMaterials[i].uniforms.uIntensity.value = intensity;

          tailMeshes[i].visible = true;
        } else {
          tailMeshes[i].visible = false;
        }
      } else {
        labels[i].visible = false;
        tailMeshes[i].visible = false;
      }
    }
  }

  return {
    tailMeshes,
    labels,
    update,
  };
}
