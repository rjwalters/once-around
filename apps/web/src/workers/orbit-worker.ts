/**
 * Orbit Computation Web Worker
 *
 * Runs planetary orbit ephemeris calculations in a separate thread to avoid
 * blocking the main thread. Has its own WASM SkyEngine instance.
 */

import init, { SkyEngine } from "../wasm/sky_engine";

// Orbit configuration (must match constants.ts)
const ORBIT_PLANET_INDICES = [2, 3, 4, 5, 6, 7, 8];
const ORBIT_NUM_POINTS = 120;
const ORBIT_PERIODS_DAYS: Record<number, number> = {
  2: 88,    // Mercury
  3: 225,   // Venus
  4: 687,   // Mars
  5: 2000,  // Jupiter
  6: 3000,  // Saturn
  7: 3000,  // Uranus
  8: 3000,  // Neptune
};
const SKY_RADIUS = 50;

// Julian Date of the Unix epoch (1970-01-01T00:00:00Z).
const JD_UNIX_EPOCH = 2440587.5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

let engine: SkyEngine | null = null;
let isInitializing = false;

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

type WorkerMessage = ComputeMessage;

async function initEngine(): Promise<void> {
  if (engine || isInitializing) return;
  isInitializing = true;

  try {
    // Initialize WASM module
    await init();

    // Create a minimal engine with no star data
    // Just need planetary ephemeris capability
    engine = new SkyEngine(new Uint8Array(0));
    console.log("[OrbitWorker] Engine initialized");

    // Notify main thread we're ready
    self.postMessage({ type: "ready" } as ReadyMessage);
  } catch (e) {
    console.error("[OrbitWorker] Failed to initialize:", e);
    throw e;
  } finally {
    isInitializing = false;
  }
}

async function computeOrbits(centerDateMs: number): Promise<Float32Array[]> {
  if (!engine) {
    await initEngine();
  }

  if (!engine) {
    throw new Error("Engine not initialized");
  }

  const t0 = performance.now();
  const radius = SKY_RADIUS - 1;
  const orbits: Float32Array[] = [];

  // Julian Date (UTC) of the requested center instant.
  const centerJd = centerDateMs / MS_PER_DAY + JD_UNIX_EPOCH;

  for (const bodyIdx of ORBIT_PLANET_INDICES) {
    const orbitPeriod = ORBIT_PERIODS_DAYS[bodyIdx];
    const halfSpan = orbitPeriod / 2;
    const stepDays = orbitPeriod / (ORBIT_NUM_POINTS - 1);
    const startJd = centerJd - halfSpan;

    // Targeted planet-only evaluation: one call computes all ORBIT_NUM_POINTS samples for
    // this planet, skipping the Moon, other planets, moons, comets, satellites and stars.
    // Returns raw equatorial unit vectors (x, y, z) identical to the bodies position buffer.
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

    orbits.push(positions);
  }

  const elapsed = performance.now() - t0;
  console.log(
    `[OrbitWorker] Computed orbits centered on JD ${centerJd.toFixed(3)} in ${elapsed.toFixed(2)}ms`
  );
  return orbits;
}

// Handle messages from main thread
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  if (message.type === "compute") {
    try {
      const orbits = await computeOrbits(message.centerDateMs);

      // Transfer the Float32Arrays for efficiency (zero-copy).
      // Use the structured-clone options form (`{ transfer }`) so this is
      // valid whether `self` types as the worker or window global scope.
      const response: ResultMessage = { type: "result", orbits };
      const transferables: Transferable[] = orbits.map((arr) => arr.buffer as ArrayBuffer);
      self.postMessage(response, { transfer: transferables });
    } catch (e) {
      const response: ErrorMessage = {
        type: "error",
        error: e instanceof Error ? e.message : String(e),
      };
      self.postMessage(response);
    }
  }
};

// Initialize engine on worker start
initEngine().catch((e) => {
  console.error("[OrbitWorker] Init error:", e);
  self.postMessage({ type: "error", error: String(e) } as ErrorMessage);
});
