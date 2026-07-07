/**
 * AR Calibration Diagnostics (/test.html)
 *
 * Standalone diagnostic page for validating the AR geometry pipeline on a real
 * phone under the real sky. The user points the back of the phone (camera) at
 * the Sun or Moon, lines the body up with the on-screen crosshairs, and taps
 * "On crosshairs". At that instant we snapshot:
 *   - raw device orientation (alpha/beta/gamma)
 *   - sensor-derived alt/az (deviceOrientationToAltAz)
 *   - declination-corrected (true-north) azimuth
 *   - ephemeris-expected alt/az (SkyEngine → RA/Dec → equatorialToHorizontal)
 *   - great-circle angular error between the two
 *   - GPS coordinates, UTC time, screen orientation, magnetic declination
 *
 * This page deliberately imports ONLY pure geometry helpers + the wasm engine —
 * no Three.js, no renderer, no star-map UI — so it ships as a tiny standalone
 * Vite entry. It mirrors the sensor/permission/declination logic of
 * deviceOrientation.ts and main.ts without importing the THREE-dependent
 * DeviceOrientationManager.
 */

import init, { SkyEngine } from "./wasm/sky_engine";
import {
  angularSeparation,
  equatorialToHorizontal,
  positionToRaDec,
} from "./geometry/coordinates";
import {
  compassHeadingToAlpha,
  deviceOrientationToAltAz,
} from "./geometry/device-orientation";
import { computeLST } from "./geometry/time";
import { magneticDeclination } from "./geometry/magnetic-declination";

// iOS Safari exposes a true compass heading on orientation events.
interface DeviceOrientationEventiOS extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}
// iOS 13+ gates the sensor behind a permission prompt.
interface DeviceOrientationEventWithPermission {
  requestPermission?: () => Promise<"granted" | "denied">;
}

type TargetBody = "Sun" | "Moon";

// Body position buffer layout (major bodies, stride 3): Sun = [0,1,2],
// Moon = [3,4,5]. Matches getBodiesPositionBuffer / body-positions.ts.
const BODY_BUFFER_INDEX: Record<TargetBody, number> = {
  Sun: 0,
  Moon: 3,
};

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const statusEl = document.getElementById("status") as HTMLDivElement;
const enableBtn = document.getElementById("enable") as HTMLButtonElement;
const captureBtn = document.getElementById("capture") as HTMLButtonElement;
const sunBtn = document.getElementById("target-sun") as HTMLButtonElement;
const moonBtn = document.getElementById("target-moon") as HTMLButtonElement;
const snapshotEl = document.getElementById("snapshot") as HTMLDivElement;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let engine: SkyEngine | null = null;
let wasmMemory: WebAssembly.Memory | null = null;

let target: TargetBody = "Sun";

// Latest raw sensor sample. `null` until the first orientation event fires.
let latestSample: { alpha: number; beta: number; gamma: number } | null = null;
let orientationEventName: "deviceorientation" | "deviceorientationabsolute" =
  "deviceorientation";

// Latest known GPS fix (null until geolocation resolves).
let gps: { lat: number; lon: number; accuracy: number } | null = null;

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------
function setStatus(message: string, kind: "" | "ok" | "error" = ""): void {
  statusEl.textContent = message;
  statusEl.className = kind;
}

function fmt(n: number, digits = 2): string {
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

// ---------------------------------------------------------------------------
// Ephemeris: cheapest path to Sun/Moon alt-az (no star catalog required)
// ---------------------------------------------------------------------------

/**
 * Compute the expected horizontal coordinates of `body` at `when` for an
 * observer at `lat`/`lon`, using the wasm engine's embedded ephemeris.
 */
function ephemerisAltAz(
  body: TargetBody,
  when: Date,
  lat: number,
  lon: number
): { altitude: number; azimuth: number; ra: number; dec: number } {
  if (!engine || !wasmMemory) {
    throw new Error("Engine not initialized");
  }

  engine.set_observer_location(lat, lon);
  engine.set_time_utc(
    when.getUTCFullYear(),
    when.getUTCMonth() + 1, // JS months are 0-indexed
    when.getUTCDate(),
    when.getUTCHours(),
    when.getUTCMinutes(),
    when.getUTCSeconds() + when.getUTCMilliseconds() / 1000
  );
  engine.recompute();

  // Fresh view each read: wasm memory may have grown during recompute().
  const ptr = engine.bodies_pos_ptr();
  const len = engine.bodies_pos_len();
  const buf = new Float32Array(wasmMemory.buffer, ptr, len);

  const o = BODY_BUFFER_INDEX[body];
  const rustX = buf[o];
  const rustY = buf[o + 1];
  const rustZ = buf[o + 2];

  // Rust equatorial frame → Three.js frame (same transform as body-positions.ts:
  // negate X, swap Y/Z), then back out RA/Dec.
  const { ra, dec } = positionToRaDec({ x: -rustX, y: rustZ, z: rustY });

  const lst = computeLST(when, lon);
  const { altitude, azimuth } = equatorialToHorizontal(ra, dec, lst, lat);
  return { altitude, azimuth, ra, dec };
}

// ---------------------------------------------------------------------------
// Device orientation listener (mirrors deviceOrientation.ts, sans THREE)
// ---------------------------------------------------------------------------
function handleOrientation(event: DeviceOrientationEvent): void {
  if (event.alpha === null || event.beta === null || event.gamma === null) {
    return;
  }
  // Prefer iOS's true compass heading when present; otherwise the (absolute)
  // alpha. Matches createDeviceOrientationManager.handleOrientation.
  const compassAlpha = compassHeadingToAlpha(
    (event as DeviceOrientationEventiOS).webkitCompassHeading
  );
  const alpha = compassAlpha ?? event.alpha;
  latestSample = { alpha, beta: event.beta, gamma: event.gamma };

  if (captureBtn.disabled) {
    captureBtn.disabled = false;
    setStatus("Sensors live. Aim at the target and tap when centered.", "ok");
  }
}

function startOrientationListener(): void {
  // Android Chrome's plain deviceorientation alpha is relative to an arbitrary
  // startup heading; the absolute variant is north-referenced. iOS lacks the
  // absolute event but compensates via webkitCompassHeading.
  orientationEventName =
    "ondeviceorientationabsolute" in window
      ? "deviceorientationabsolute"
      : "deviceorientation";
  window.addEventListener(
    orientationEventName,
    handleOrientation as EventListener,
    true
  );
}

async function requestSensorPermission(): Promise<boolean> {
  const DOE = DeviceOrientationEvent as unknown as DeviceOrientationEventWithPermission;
  if (typeof DOE.requestPermission !== "function") {
    // Non-iOS: no explicit permission gate.
    return true;
  }
  try {
    const result = await DOE.requestPermission();
    return result === "granted";
  } catch (err) {
    console.error("Device orientation permission request failed:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Geolocation
// ---------------------------------------------------------------------------
function startGeolocation(): void {
  if (!("geolocation" in navigator)) {
    return;
  }
  navigator.geolocation.watchPosition(
    (pos) => {
      gps = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
    },
    (err) => {
      console.warn("Geolocation error:", err.message);
    },
    { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 }
  );
}

// ---------------------------------------------------------------------------
// Snapshot rendering
// ---------------------------------------------------------------------------
function row(label: string, value: string, valueClass = ""): string {
  const cls = valueClass ? ` ${valueClass}` : "";
  return `<div class="row"><span class="label">${label}</span><span class="value${cls}">${value}</span></div>`;
}

function normalizeAz(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function captureSnapshot(): void {
  if (!latestSample) {
    setStatus("No sensor reading yet — hold the phone still for a moment.", "error");
    return;
  }
  if (!gps) {
    setStatus(
      "Waiting for GPS fix — grant location access and try again in a moment.",
      "error"
    );
    return;
  }

  const now = new Date();
  const { alpha, beta, gamma } = latestSample;
  const { lat, lon, accuracy } = gps;

  // Sensor-derived pointing direction (raw, magnetic-north referenced).
  const sensor = deviceOrientationToAltAz(alpha, beta, gamma);

  // Magnetic declination correction → true-north azimuth. Mirrors main.ts:
  // trueAz = magneticAz + declination (east positive).
  const declination = magneticDeclination(lat, lon, now);
  const correctedAz = normalizeAz(sensor.azimuth + declination);

  // Expected (true-north) position from the ephemeris.
  const expected = ephemerisAltAz(target, now, lat, lon);

  // Great-circle angular error against the declination-corrected pointing.
  const error = angularSeparation(
    sensor.altitude,
    correctedAz,
    expected.altitude,
    expected.azimuth
  );

  const errClass = error < 5 ? "good" : error < 15 ? "warn" : "bad";
  const screenOrientation =
    window.screen?.orientation?.type ?? "unknown";

  snapshotEl.innerHTML =
    row("Target", target) +
    row(
      "Angular error",
      `${fmt(error)}°`,
      `error-big ${errClass}`
    ) +
    row("— Sensor (raw) —", "") +
    row("alpha / beta / gamma", `${fmt(alpha)} / ${fmt(beta)} / ${fmt(gamma)}`) +
    row("Sensor alt / az", `${fmt(sensor.altitude)}° / ${fmt(sensor.azimuth)}°`) +
    row("Az (true north)", `${fmt(correctedAz)}°`) +
    row("— Ephemeris —", "") +
    row("Expected alt / az", `${fmt(expected.altitude)}° / ${fmt(expected.azimuth)}°`) +
    row("RA / Dec", `${fmt(expected.ra)}° / ${fmt(expected.dec)}°`) +
    row("— Observer —", "") +
    row("GPS lat / lon", `${fmt(lat, 5)}, ${fmt(lon, 5)}`) +
    row("GPS accuracy", `${fmt(accuracy, 0)} m`) +
    row("Magnetic declination", `${fmt(declination)}°`) +
    row("Screen orientation", screenOrientation) +
    row("UTC time", now.toISOString());

  snapshotEl.classList.add("visible");
  setStatus(
    `Captured. Angular error ${fmt(error)}° for ${target}.`,
    error < 5 ? "ok" : ""
  );
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
function selectTarget(next: TargetBody): void {
  target = next;
  sunBtn.setAttribute("aria-pressed", String(next === "Sun"));
  moonBtn.setAttribute("aria-pressed", String(next === "Moon"));
}

async function enableSensors(): Promise<void> {
  enableBtn.disabled = true;
  setStatus("Requesting sensor permission…");
  const granted = await requestSensorPermission();
  if (!granted) {
    enableBtn.disabled = false;
    setStatus(
      "Motion & orientation access was denied. Enable it in Settings, then tap again.",
      "error"
    );
    return;
  }
  startOrientationListener();
  startGeolocation();
  enableBtn.hidden = true;
  setStatus("Waiting for the first sensor reading…", "ok");
}

async function main(): Promise<void> {
  sunBtn.addEventListener("click", () => selectTarget("Sun"));
  moonBtn.addEventListener("click", () => selectTarget("Moon"));
  captureBtn.addEventListener("click", captureSnapshot);
  enableBtn.addEventListener("click", () => void enableSensors());

  // Initialize the wasm ephemeris engine. Empty catalog bytes: no star tiers
  // are needed for Sun/Moon, which use the engine's embedded ephemeris.
  try {
    setStatus("Loading ephemeris engine…");
    const wasm = await init();
    wasmMemory = wasm.memory;
    engine = new SkyEngine(new Uint8Array(0));
  } catch (err) {
    console.error("Failed to initialize wasm engine:", err);
    setStatus("Failed to load the ephemeris engine. Reload to retry.", "error");
    return;
  }

  if (!("DeviceOrientationEvent" in window)) {
    setStatus(
      "This device does not expose orientation sensors — open /test on a phone.",
      "error"
    );
    return;
  }

  // iOS requires the permission request to originate from a user gesture, so
  // surface an explicit button. Non-iOS can begin listening immediately.
  const needsGesture =
    typeof (DeviceOrientationEvent as unknown as DeviceOrientationEventWithPermission)
      .requestPermission === "function";
  if (needsGesture) {
    enableBtn.hidden = false;
    setStatus("Tap “Enable AR sensors” to grant motion & orientation access.");
  } else {
    startOrientationListener();
    startGeolocation();
    setStatus("Waiting for the first sensor reading…", "ok");
  }
}

void main();
