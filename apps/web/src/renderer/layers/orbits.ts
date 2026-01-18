/**
 * Orbits Layer
 *
 * Renders planetary orbit paths computed dynamically from the current simulation date.
 * Orbits show the apparent path of each planet on the celestial sphere over time.
 */

import * as THREE from "three";
import type { SkyEngine } from "../../wasm/sky_engine";
import { getBodiesPositionBuffer } from "../../engine";
import { ORBIT_PLANET_INDICES, ORBIT_NUM_POINTS, ORBIT_PERIODS_DAYS, BODY_COLORS, SKY_RADIUS } from "../constants";
import { readPositionFromBuffer } from "../utils/coordinates";

export interface OrbitsLayer {
  /** The group containing all orbit lines */
  group: THREE.Group;
  /** Individual orbit lines for each planet */
  lines: THREE.Line[];
  /** Set visibility of all orbits */
  setVisible(visible: boolean): void;
  /** Focus on a single planet's orbit, or show all if null */
  focusOrbit(bodyIndex: number | null): void;
  /** Compute orbital paths centered on the given date */
  compute(engine: SkyEngine, centerDate: Date): Promise<void>;
  /** Enable/disable depth testing (for Hubble/JWST modes) */
  setDepthTest(enabled: boolean): void;
}

/**
 * Create the orbits layer.
 * @param scene - The Three.js scene to add the group to
 * @returns OrbitsLayer interface
 */
export function createOrbitsLayer(scene: THREE.Scene): OrbitsLayer {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  // Create a line for each planet's orbit path
  const lines: THREE.Line[] = [];
  for (const bodyIdx of ORBIT_PLANET_INDICES) {
    const color = BODY_COLORS[bodyIdx];
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.7,
      depthTest: false,
    });
    const line = new THREE.Line(geometry, material);
    lines.push(line);
    group.add(line);
  }

  // Track computation state
  let computePromise: Promise<void> | null = null;
  let lastComputeDate: Date | null = null;

  function setVisible(visible: boolean): void {
    group.visible = visible;
    // When turning orbits on, show all orbits (clear any focus)
    if (visible) {
      for (const line of lines) {
        line.visible = true;
      }
    }
  }

  function focusOrbit(bodyIndex: number | null): void {
    for (let i = 0; i < ORBIT_PLANET_INDICES.length; i++) {
      if (bodyIndex === null) {
        // Show all orbits
        lines[i].visible = true;
      } else {
        // Show only the matching orbit
        lines[i].visible = ORBIT_PLANET_INDICES[i] === bodyIndex;
      }
    }
  }

  /**
   * Compute orbital paths dynamically using the WASM engine.
   * Samples planet positions over each planet's orbital period centered on centerDate.
   *
   * NOTE: This mutates the engine's time state. The caller should restore the engine
   * to the current simulation time after calling this function.
   */
  async function compute(engine: SkyEngine, centerDate: Date): Promise<void> {
    // Skip if already computed for the same date (within 1 day)
    if (lastComputeDate && Math.abs(centerDate.getTime() - lastComputeDate.getTime()) < 86400000) {
      if (computePromise) return computePromise;
    }

    lastComputeDate = centerDate;

    computePromise = (async () => {
      const radius = SKY_RADIUS - 1;
      const msPerDay = 24 * 60 * 60 * 1000;

      for (let planetIdx = 0; planetIdx < ORBIT_PLANET_INDICES.length; planetIdx++) {
        const bodyIdx = ORBIT_PLANET_INDICES[planetIdx];
        const orbitPeriod = ORBIT_PERIODS_DAYS[bodyIdx];
        const halfSpan = orbitPeriod / 2;

        const positions = new Float32Array(ORBIT_NUM_POINTS * 3);

        for (let i = 0; i < ORBIT_NUM_POINTS; i++) {
          // Calculate date for this sample point
          const t = i / (ORBIT_NUM_POINTS - 1);
          const dayOffset = -halfSpan + t * orbitPeriod;
          const sampleDate = new Date(centerDate.getTime() + dayOffset * msPerDay);

          // Set engine time and compute
          engine.set_time_utc(
            sampleDate.getUTCFullYear(),
            sampleDate.getUTCMonth() + 1,
            sampleDate.getUTCDate(),
            sampleDate.getUTCHours(),
            sampleDate.getUTCMinutes(),
            sampleDate.getUTCSeconds()
          );
          engine.recompute();

          // Get position from engine buffer
          const bodyPositions = getBodiesPositionBuffer(engine);
          const pos = readPositionFromBuffer(bodyPositions, bodyIdx, radius);

          positions[i * 3] = pos.x;
          positions[i * 3 + 1] = pos.y;
          positions[i * 3 + 2] = pos.z;
        }

        // Update this planet's orbit line geometry
        const geometry = lines[planetIdx].geometry;
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.computeBoundingSphere();
      }

      console.log(`Computed orbit paths centered on ${centerDate.toISOString()}`);
    })();

    return computePromise;
  }

  /**
   * Enable or disable depth testing on orbit lines.
   * Enabled in Hubble mode so orbits are hidden behind Earth.
   */
  function setDepthTest(enabled: boolean): void {
    for (const line of lines) {
      const material = line.material as THREE.LineBasicMaterial;
      material.depthTest = enabled;
      material.needsUpdate = true;
    }
  }

  return {
    group,
    lines,
    setVisible,
    focusOrbit,
    compute,
    setDepthTest,
  };
}
