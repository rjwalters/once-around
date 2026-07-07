/**
 * Orbits Layer
 *
 * Renders planetary orbit paths computed dynamically from the current simulation date.
 * Orbits show the apparent path of each planet on the celestial sphere over time.
 *
 * Uses a Web Worker for computation to avoid blocking the main thread on mobile.
 */

import * as THREE from "three";
import type { SkyEngine } from "../../wasm/sky_engine";
import { ORBIT_PLANET_INDICES, ORBIT_NUM_POINTS, ORBIT_PERIODS_DAYS, BODY_COLORS, SKY_RADIUS } from "../constants";

// Julian Date of the Unix epoch (1970-01-01T00:00:00Z).
const JD_UNIX_EPOCH = 2440587.5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Minimum real (wall-clock) time between worker/main-thread orbit recomputes. During fast
// playback the simulation date can jump more than a day per tick (5 ticks/s), which defeats
// the 1-day hysteresis below; this caps the recompute dispatch rate to <=2/s regardless of
// playback speed.
const MIN_DISPATCH_INTERVAL_MS = 500;

// Worker message types
interface ComputeMessage {
  type: "compute";
  centerDateMs: number;
}

interface ResultMessage {
  type: "result";
  orbits: Float32Array[];
}

interface ErrorMessage {
  type: "error";
  error: string;
}

interface ReadyMessage {
  type: "ready";
}

type WorkerResponse = ResultMessage | ErrorMessage | ReadyMessage;

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
  // Wall-clock time (performance.now()) of the last dispatched recompute, for real-time debounce.
  let lastDispatchMs = 0;

  // Web Worker for off-thread computation
  let worker: Worker | null = null;
  let workerReady = false;
  let pendingResolve: (() => void) | null = null;
  let pendingReject: ((error: Error) => void) | null = null;

  // Initialize worker
  function initWorker(): void {
    if (worker) return;

    try {
      // Use Vite's worker import syntax
      worker = new Worker(
        new URL("../../workers/orbit-worker.ts", import.meta.url),
        { type: "module" }
      );

      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const message = event.data;

        if (message.type === "ready") {
          workerReady = true;
          console.log("Orbit worker ready");
        } else if (message.type === "result") {
          // Update geometries with computed positions
          for (let i = 0; i < message.orbits.length; i++) {
            const geometry = lines[i].geometry;
            geometry.setAttribute(
              "position",
              new THREE.BufferAttribute(message.orbits[i], 3)
            );
            geometry.computeBoundingSphere();
          }
          console.log(`Orbit paths updated via worker`);
          pendingResolve?.();
          pendingResolve = null;
          pendingReject = null;
        } else if (message.type === "error") {
          console.error("Orbit worker error:", message.error);
          pendingReject?.(new Error(message.error));
          pendingResolve = null;
          pendingReject = null;
        }
      };

      worker.onerror = (error) => {
        console.error("Orbit worker failed:", error);
        worker = null;
        workerReady = false;
        pendingReject?.(new Error("Worker failed"));
        pendingResolve = null;
        pendingReject = null;
      };
    } catch (e) {
      console.warn("Failed to create orbit worker, will use main thread:", e);
      worker = null;
    }
  }

  // Try to initialize worker on creation
  initWorker();

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
   * Compute orbital paths using worker if available, otherwise main thread.
   */
  async function compute(engine: SkyEngine, centerDate: Date): Promise<void> {
    // Skip if already computed for the same date (within 1 day). Gates redundant same-day
    // recomputes when the simulation is paused or stepping slowly.
    if (lastComputeDate && Math.abs(centerDate.getTime() - lastComputeDate.getTime()) < MS_PER_DAY) {
      if (computePromise) return computePromise;
    }

    // Real-time debounce: during fast playback the date jumps >1 day per tick so the hysteresis
    // above fails every tick, saturating the worker at 5 msg/s. Skip new dispatches until at least
    // MIN_DISPATCH_INTERVAL_MS of wall-clock time has elapsed, returning the in-flight promise.
    const nowMs = performance.now();
    if (nowMs - lastDispatchMs < MIN_DISPATCH_INTERVAL_MS) {
      if (computePromise) return computePromise;
    }

    lastComputeDate = centerDate;
    lastDispatchMs = nowMs;

    // Try worker first
    if (worker && workerReady) {
      computePromise = new Promise<void>((resolve, reject) => {
        pendingResolve = resolve;
        pendingReject = reject;

        const message: ComputeMessage = {
          type: "compute",
          centerDateMs: centerDate.getTime(),
        };
        worker!.postMessage(message);
      });

      return computePromise;
    }

    // Fallback: compute on main thread (original implementation)
    computePromise = computeOnMainThread(engine, centerDate);
    return computePromise;
  }

  /**
   * Main thread fallback for orbit computation.
   * Used when Web Workers aren't available.
   */
  async function computeOnMainThread(engine: SkyEngine, centerDate: Date): Promise<void> {
    const radius = SKY_RADIUS - 1;

    // Julian Date (UTC) of the requested center instant.
    const centerJd = centerDate.getTime() / MS_PER_DAY + JD_UNIX_EPOCH;

    for (let planetIdx = 0; planetIdx < ORBIT_PLANET_INDICES.length; planetIdx++) {
      const bodyIdx = ORBIT_PLANET_INDICES[planetIdx];
      const orbitPeriod = ORBIT_PERIODS_DAYS[bodyIdx];
      const halfSpan = orbitPeriod / 2;
      const stepDays = orbitPeriod / (ORBIT_NUM_POINTS - 1);
      const startJd = centerJd - halfSpan;

      // Targeted planet-only evaluation, matching the worker path: one call computes all
      // samples for this planet without recomputing moons, comets, satellites or stars.
      // Returns raw equatorial unit vectors (x, y, z).
      const raw = engine.fill_planet_track(bodyIdx, startJd, stepDays, ORBIT_NUM_POINTS);

      const positions = new Float32Array(ORBIT_NUM_POINTS * 3);
      for (let i = 0; i < ORBIT_NUM_POINTS; i++) {
        const eqX = raw[i * 3];
        const eqY = raw[i * 3 + 1];
        const eqZ = raw[i * 3 + 2];

        // Convert equatorial (Z-up) to Three.js (Y-up): (x, y, z) -> (-x, z, y), scaled to radius.
        positions[i * 3] = -eqX * radius;
        positions[i * 3 + 1] = eqZ * radius;
        positions[i * 3 + 2] = eqY * radius;
      }

      // Update this planet's orbit line geometry
      const geometry = lines[planetIdx].geometry;
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.computeBoundingSphere();
    }

    console.log(`Computed orbit paths on main thread centered on ${centerDate.toISOString()}`);
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
