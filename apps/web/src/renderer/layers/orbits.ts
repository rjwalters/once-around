/**
 * Orbits Layer
 *
 * Renders planetary orbit paths using pre-computed static data.
 * Orbit data is generated at build time and loaded instantly.
 */

import * as THREE from "three";
import type { SkyEngine } from "../../wasm/sky_engine";
import { ORBIT_PLANET_INDICES, ORBIT_NUM_POINTS, BODY_COLORS } from "../constants";

export interface OrbitsLayer {
  /** The group containing all orbit lines */
  group: THREE.Group;
  /** Individual orbit lines for each planet */
  lines: THREE.Line[];
  /** Set visibility of all orbits */
  setVisible(visible: boolean): void;
  /** Focus on a single planet's orbit, or show all if null */
  focusOrbit(bodyIndex: number | null): void;
  /** Load pre-computed orbital paths */
  load(): Promise<void>;
  /** Legacy compute method (now just calls load) */
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

  // Track if orbits have been loaded
  let loaded = false;
  let loadPromise: Promise<void> | null = null;

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
   * Load pre-computed orbit data from static file.
   * The data is computed at build time and contains positions for all planets.
   */
  async function load(): Promise<void> {
    if (loaded) return;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      try {
        const response = await fetch('/data/orbits.bin');
        if (!response.ok) {
          console.warn('Failed to load orbit data, orbits will not be available');
          return;
        }

        const buffer = await response.arrayBuffer();
        const orbitData = new Float32Array(buffer);

        // Data format: 7 planets × 120 points × 3 floats, sequential
        const floatsPerOrbit = ORBIT_NUM_POINTS * 3;

        for (let planetIdx = 0; planetIdx < ORBIT_PLANET_INDICES.length; planetIdx++) {
          const offset = planetIdx * floatsPerOrbit;
          const positions = orbitData.slice(offset, offset + floatsPerOrbit);

          // Update this planet's orbit line geometry
          const geometry = lines[planetIdx].geometry;
          geometry.setAttribute(
            "position",
            new THREE.BufferAttribute(positions, 3)
          );
          geometry.computeBoundingSphere();
        }

        loaded = true;
        console.log('Loaded pre-computed orbit data');
      } catch (e) {
        console.warn('Error loading orbit data:', e);
      }
    })();

    return loadPromise;
  }

  /**
   * Legacy compute method - now just loads pre-computed data.
   * The engine and date parameters are ignored since we use static data.
   */
  async function compute(_engine: SkyEngine, _centerDate: Date): Promise<void> {
    return load();
  }

  return {
    group,
    lines,
    setVisible,
    focusOrbit,
    load,
    compute,
  };
}
