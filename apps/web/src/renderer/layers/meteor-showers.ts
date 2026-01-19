/**
 * Meteor Showers Layer
 *
 * Renders meteor shower radiants as markers on the celestial sphere.
 * Shows which showers are currently active and highlights peak activity.
 */

import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import {
  METEOR_SHOWER_DATA,
  METEOR_SHOWER_COLOR,
  isShowerActive,
  isNearPeak,
  getAdjustedRadiant,
  type MeteorShower,
} from "../../meteorShowerData";
import { SKY_RADIUS, LABEL_OFFSET } from "../constants";
import { raDecToPosition } from "../utils/coordinates";
import { calculateLabelOffset } from "../utils/labels";
import type { LabelManager } from "../label-manager";
import { LABEL_PRIORITY } from "../label-manager";

// Radiant marker size in pixels
const RADIANT_SIZE = 12;
const RADIANT_SIZE_PEAK = 18;

// Custom shader for radiant markers (starburst pattern)
const radiantVertexShader = `
  attribute float size;
  attribute float isPeak;
  varying float vIsPeak;

  void main() {
    vIsPeak = isPeak;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const radiantFragmentShader = `
  uniform vec3 color;
  varying float vIsPeak;

  void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);

    // Create starburst pattern for radiants
    float angle = atan(center.y, center.x);
    float rays = 0.5 + 0.5 * sin(angle * 8.0);
    float radial = 1.0 - smoothstep(0.0, 0.5, dist);
    float pattern = radial * (0.6 + 0.4 * rays * radial);

    // Brighter center
    float core = 1.0 - smoothstep(0.0, 0.15, dist);
    pattern = max(pattern, core);

    // Peak showers get extra glow
    float glow = vIsPeak > 0.5 ? 0.3 : 0.0;
    pattern += glow * (1.0 - smoothstep(0.3, 0.5, dist));

    if (pattern < 0.01) discard;

    gl_FragColor = vec4(color, pattern);
  }
`;

export interface MeteorShowerLayer {
  /** Set visibility of meteor shower radiants */
  setVisible(visible: boolean): void;
  /** Update radiants for current date */
  update(currentDate: Date, labelsVisible: boolean, labelManager?: LabelManager): void;
  /** Get active showers for the current date */
  getActiveShowers(): MeteorShower[];
}

/**
 * Create the meteor shower layer.
 */
export function createMeteorShowerLayer(
  scene: THREE.Scene,
  labelsGroup: THREE.Group
): MeteorShowerLayer {
  const showerCount = METEOR_SHOWER_DATA.length;

  // Geometry for radiant markers
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(showerCount * 3);
  const sizes = new Float32Array(showerCount);
  const isPeakAttr = new Float32Array(showerCount);

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("isPeak", new THREE.BufferAttribute(isPeakAttr, 1));

  // Parse color
  const color = new THREE.Color(METEOR_SHOWER_COLOR);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: color },
    },
    vertexShader: radiantVertexShader,
    fragmentShader: radiantFragmentShader,
    transparent: true,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.visible = false;
  scene.add(points);

  // Create labels for each shower
  const labels: Map<string, CSS2DObject> = new Map();
  for (const shower of METEOR_SHOWER_DATA) {
    const div = document.createElement("div");
    div.className = "sky-label meteor-shower-label";
    div.textContent = shower.name;
    div.dataset.showerId = shower.id;
    const label = new CSS2DObject(div);
    label.visible = false;
    labels.set(shower.id, label);
    labelsGroup.add(label);
  }

  let visible = false;
  let activeShowers: MeteorShower[] = [];

  function setVisible(isVisible: boolean): void {
    visible = isVisible;
    points.visible = isVisible;

    if (!isVisible) {
      for (const label of labels.values()) {
        label.visible = false;
      }
    }
  }

  function update(currentDate: Date, labelsVisible: boolean, labelManager?: LabelManager): void {
    const month = currentDate.getMonth() + 1;
    const day = currentDate.getDate();

    const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const sizeAttr = geometry.getAttribute("size") as THREE.BufferAttribute;
    const peakAttr = geometry.getAttribute("isPeak") as THREE.BufferAttribute;

    activeShowers = [];

    for (let i = 0; i < METEOR_SHOWER_DATA.length; i++) {
      const shower = METEOR_SHOWER_DATA[i];
      const isActive = isShowerActive(shower, month, day);
      const isPeak = isNearPeak(shower, month, day, 1);

      if (isActive) {
        activeShowers.push(shower);

        // Get adjusted radiant position (accounting for drift)
        const { ra, dec } = getAdjustedRadiant(shower, month, day);
        const pos = raDecToPosition(ra, dec, SKY_RADIUS);

        posAttr.setXYZ(i, pos.x, pos.y, pos.z);
        sizeAttr.setX(i, isPeak ? RADIANT_SIZE_PEAK : RADIANT_SIZE);
        peakAttr.setX(i, isPeak ? 1.0 : 0.0);

        // Update label
        const label = labels.get(shower.id);
        if (label) {
          const labelPos = calculateLabelOffset(pos, LABEL_OFFSET * 0.6);
          label.position.copy(labelPos);

          // Show ZHR and peak indicator in label
          const div = label.element as HTMLDivElement;
          const peakText = isPeak ? " ★" : "";
          div.textContent = `${shower.name}${peakText}`;
          div.title = `ZHR: ${shower.zhr}/hr | Peak: ${shower.peakMonth}/${shower.peakDay}`;

          // Add/remove peak class for styling
          if (isPeak) {
            div.classList.add("meteor-shower-peak");
          } else {
            div.classList.remove("meteor-shower-peak");
          }

          label.visible = visible && labelsVisible;

          // Register meteor shower label with label manager
          if (visible && labelsVisible && labelManager) {
            labelManager.registerLabel({
              id: `meteor-shower-${shower.id}`,
              worldPos: labelPos,
              priority: LABEL_PRIORITY.METEOR_SHOWER,
              label: label,
            });
          }
        }
      } else {
        // Hide inactive showers
        posAttr.setXYZ(i, 0, 0, 0);
        sizeAttr.setX(i, 0);
        peakAttr.setX(i, 0);

        const label = labels.get(shower.id);
        if (label) {
          label.visible = false;
        }
      }
    }

    posAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    peakAttr.needsUpdate = true;
  }

  function getActiveShowers(): MeteorShower[] {
    return activeShowers;
  }

  return {
    setVisible,
    update,
    getActiveShowers,
  };
}
