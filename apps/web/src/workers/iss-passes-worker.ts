/**
 * ISS Pass Prediction Web Worker
 *
 * Runs the satellite pass scan (`SkyEngine.find_passes`) on a separate thread so
 * the main thread never blocks, no matter how long the scan takes (a full ~29-day
 * ephemeris scan can take ~100ms of CPU). Has its own WASM SkyEngine instance and
 * loads the ISS ephemeris independently — the same pattern as `orbit-worker.ts`.
 *
 * The heavy per-sample work lives entirely in Rust; this worker only sets the
 * observer location, derives the scan window, and returns the flat pass buffer,
 * which the main thread converts to `ISSPass[]` via `parsePassBuffer`.
 */

import init, { SkyEngine } from "../wasm/sky_engine";

// ISS satellite index and ephemeris URL (must match SATELLITES in engine.ts).
const SATELLITE_ISS = 0;
const ISS_EPHEMERIS_URL = "/data/iss_ephemeris.bin";

// Julian Date of the Unix epoch (1970-01-01T00:00:00Z).
const JD_UNIX_EPOCH = 2440587.5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Coarse scan step: 10 minutes, in days (must match SCAN_STEP_DAYS in iss-passes.ts).
const SCAN_STEP_DAYS = 10 / 1440;

interface ComputeMessage {
  type: "compute";
  requestId: number;
  observerLat: number;
  observerLon: number;
  minAltitude: number;
  maxPasses: number;
  sunAltitudeLimit: number;
  nowMs: number;
}

interface ReadyMessage {
  type: "ready";
}

interface ResultMessage {
  type: "result";
  requestId: number;
  buffer: Float64Array;
}

interface ErrorMessage {
  type: "error";
  requestId: number;
  error: string;
}

let engine: SkyEngine | null = null;
let initPromise: Promise<void> | null = null;

async function initEngine(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await init();
    // Minimal engine (no star catalog needed for pass finding).
    const eng = new SkyEngine(new Uint8Array(0));

    // Load the ISS ephemeris independently of the main-thread engine.
    const response = await fetch(ISS_EPHEMERIS_URL);
    if (!response.ok) {
      throw new Error(`Failed to load ISS ephemeris: ${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    eng.load_satellite_ephemeris(SATELLITE_ISS, bytes);

    engine = eng;
    self.postMessage({ type: "ready" } as ReadyMessage);
  })();

  return initPromise;
}

function computePasses(msg: ComputeMessage): Float64Array {
  if (!engine) {
    throw new Error("Engine not initialized");
  }

  engine.set_observer_location(msg.observerLat, msg.observerLon);

  const range = engine.satellite_ephemeris_range(SATELLITE_ISS);
  if (!range || range.length < 2) {
    return new Float64Array(0);
  }
  const [startJD, endJD] = range;
  const nowJD = msg.nowMs / MS_PER_DAY + JD_UNIX_EPOCH;
  const searchStartJD = Math.max(nowJD, startJD);
  if (searchStartJD >= endJD) {
    return new Float64Array(0);
  }

  return engine.find_passes(
    SATELLITE_ISS,
    searchStartJD,
    endJD,
    SCAN_STEP_DAYS,
    msg.minAltitude,
    msg.sunAltitudeLimit,
    msg.maxPasses
  );
}

self.onmessage = async (event: MessageEvent<ComputeMessage>) => {
  const message = event.data;
  if (message.type !== "compute") return;

  try {
    await initEngine();
    const buffer = computePasses(message);
    const response: ResultMessage = {
      type: "result",
      requestId: message.requestId,
      buffer
    };
    // Zero-copy transfer of the result buffer.
    self.postMessage(response, { transfer: [buffer.buffer as ArrayBuffer] });
  } catch (e) {
    const response: ErrorMessage = {
      type: "error",
      requestId: message.requestId,
      error: e instanceof Error ? e.message : String(e)
    };
    self.postMessage(response);
  }
};

// Kick off engine/ephemeris initialization eagerly on worker start.
initEngine().catch((e) => {
  console.error("[ISSPassesWorker] Init error:", e);
});
