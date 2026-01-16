/**
 * Orbits Layer
 *
 * Renders planetary orbit paths by sampling positions over time.
 */

import * as THREE from "three";
import type { SkyEngine } from "../../wasm/sky_engine";
import { getBodiesPositionBuffer } from "../../engine";
import { applyTimeToEngine } from "../../ui";
import { SKY_RADIUS, ORBIT_PLANET_INDICES, ORBIT_NUM_POINTS, ORBIT_PERIODS_DAYS, BODY_COLORS } from "../constants";
import { readPositionFromBuffer } from "../utils/coordinates";

// Orbit cache - reuse computed orbits when date hasn't changed much
const ORBIT_CACHE_VALIDITY_DAYS = 60;

export interface OrbitsLayer {
  /** The group containing all orbit lines */
  group: THREE.Group;
  /** Individual orbit lines for each planet */
  lines: THREE.Line[];
  /** Set visibility of all orbits */
  setVisible(visible: boolean): void;
  /** Focus on a single planet's orbit, or show all if null */
  focusOrbit(bodyIndex: number | null): void;
  /** Compute orbital paths (async to avoid UI blocking) */
  compute(engine: SkyEngine, centerDate: Date): Promise<void>;
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

  // Cache state
  let cacheValid = false;
  let cacheCenterDate: Date | null = null;

  function isOrbitCacheValid(requestedDate: Date): boolean {
    if (!cacheValid || !cacheCenterDate) return false;

    const msPerDay = 24 * 60 * 60 * 1000;
    const daysDiff = Math.abs(requestedDate.getTime() - cacheCenterDate.getTime()) / msPerDay;
    return daysDiff <= ORBIT_CACHE_VALIDITY_DAYS;
  }

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

  async function compute(engine: SkyEngine, centerDate: Date): Promise<void> {
    // Check if we can use cached orbits
    if (isOrbitCacheValid(centerDate)) {
      return;
    }

    const radius = SKY_RADIUS - 1;
    const msPerDay = 24 * 60 * 60 * 1000;
    const CHUNK_SIZE = 20; // Process this many points before yielding

    // For each planet, collect positions over its orbital period
    for (let planetIdx = 0; planetIdx < ORBIT_PLANET_INDICES.length; planetIdx++) {
      const bodyIdx = ORBIT_PLANET_INDICES[planetIdx];
      const orbitPeriod = ORBIT_PERIODS_DAYS[bodyIdx];
      const halfSpan = orbitPeriod / 2;
      const positions: number[] = [];

      for (let i = 0; i < ORBIT_NUM_POINTS; i++) {
        // Calculate date for this sample point (spread across orbital period)
        const t = i / (ORBIT_NUM_POINTS - 1); // 0 to 1
        const dayOffset = -halfSpan + t * orbitPeriod;
        const sampleDate = new Date(centerDate.getTime() + dayOffset * msPerDay);

        // Set engine to this time and recompute
        applyTimeToEngine(engine, sampleDate);
        engine.recompute();

        // Get the planet position at this time
        const bodyPositions = getBodiesPositionBuffer(engine);
        const pos = readPositionFromBuffer(bodyPositions, bodyIdx, radius);
        positions.push(pos.x, pos.y, pos.z);

        // Yield to event loop periodically to keep UI responsive
        if (i % CHUNK_SIZE === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      // Update this planet's orbit line geometry
      const geometry = lines[planetIdx].geometry;
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(positions), 3)
      );
      geometry.computeBoundingSphere();
    }

    // Restore the original time
    applyTimeToEngine(engine, centerDate);
    engine.recompute();

    // Update cache
    cacheCenterDate = new Date(centerDate.getTime());
    cacheValid = true;
  }

  return {
    group,
    lines,
    setVisible,
    focusOrbit,
    compute,
  };
}
