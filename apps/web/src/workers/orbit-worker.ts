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

let engine: SkyEngine | null = null;
let wasmMemory: WebAssembly.Memory | null = null;
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
type WorkerResponse = ResultMessage | ErrorMessage | ReadyMessage;

async function initEngine(): Promise<void> {
  if (engine || isInitializing) return;
  isInitializing = true;

  try {
    // Initialize WASM module - returns the exports including memory
    const wasm = await init();
    wasmMemory = wasm.memory;

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

function getBodiesPositionBuffer(): Float32Array {
  if (!engine || !wasmMemory) {
    throw new Error("Engine not initialized");
  }
  const ptr = engine.bodies_pos_ptr();
  const len = engine.bodies_pos_len();
  return new Float32Array(wasmMemory.buffer, ptr, len);
}

function readPositionFromBuffer(
  buffer: Float32Array,
  bodyIndex: number,
  radius: number
): { x: number; y: number; z: number } {
  const baseIdx = bodyIndex * 3;
  const eqX = buffer[baseIdx];
  const eqY = buffer[baseIdx + 1];
  const eqZ = buffer[baseIdx + 2];

  // Convert equatorial (Z-up) to Three.js (Y-up): (x, y, z) -> (-x, z, y)
  return {
    x: -eqX * radius,
    y: eqZ * radius,
    z: eqY * radius,
  };
}

async function computeOrbits(centerDateMs: number): Promise<Float32Array[]> {
  if (!engine) {
    await initEngine();
  }

  if (!engine) {
    throw new Error("Engine not initialized");
  }

  const centerDate = new Date(centerDateMs);
  const radius = SKY_RADIUS - 1;
  const msPerDay = 24 * 60 * 60 * 1000;
  const orbits: Float32Array[] = [];

  for (const bodyIdx of ORBIT_PLANET_INDICES) {
    const orbitPeriod = ORBIT_PERIODS_DAYS[bodyIdx];
    const halfSpan = orbitPeriod / 2;
    const positions = new Float32Array(ORBIT_NUM_POINTS * 3);

    for (let i = 0; i < ORBIT_NUM_POINTS; i++) {
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

      // Get body position from WASM buffer
      const bodyPositions = getBodiesPositionBuffer();
      const pos = readPositionFromBuffer(bodyPositions, bodyIdx, radius);

      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
    }

    orbits.push(positions);
  }

  console.log(`[OrbitWorker] Computed orbits centered on ${centerDate.toISOString()}`);
  return orbits;
}

// Handle messages from main thread
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  if (message.type === "compute") {
    try {
      const orbits = await computeOrbits(message.centerDateMs);

      // Transfer the Float32Arrays for efficiency (zero-copy)
      const response: ResultMessage = { type: "result", orbits };
      const transferables = orbits.map((arr) => arr.buffer);
      self.postMessage(response, transferables);
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
