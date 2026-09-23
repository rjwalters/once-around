/** Camera-backed measurements with explicit, optional report submission. */
import init, { SkyEngine } from "./wasm/sky_engine";
import {
  equatorialToHorizontal,
  positionToRaDec,
} from "./geometry/coordinates";
import { julianDate } from "./geometry/precession";
import { computeLST } from "./geometry/time";
import { magneticDeclination } from "./geometry/magnetic-declination";
import {
  createOrientationSensor,
  getScreenOrientationAngle,
} from "./orientation-sensor";
import { createDiagnosticCamera } from "./diagnostic-camera";
import {
  CAPTURE_HISTORY_LIMIT,
  captureDiagnostic,
  captureProblem,
  exportCaptures,
  gpsProblem,
  type CaptureInput,
  type DiagnosticCapture,
  type DiagnosticGPS,
  type TargetBody,
} from "./alignment-diagnostic";

import {
  browserDescription,
  createAlignmentReport,
  createReportSender,
  reportEndpoint,
} from "./alignment-report";
import { isDescription } from "./alignment-report-schema";

declare const __GIT_COMMIT__: string;
declare const __BUILD_TIME__: string;

const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const startButton = element<HTMLButtonElement>("start");
const stopButton = element<HTMLButtonElement>("stop");
const captureButton = element<HTMLButtonElement>("capture");
const video = element<HTMLVideoElement>("camera");
const history = element<HTMLOListElement>("history");
const copyButton = element<HTMLButtonElement>("copy");
const downloadButton = element<HTMLButtonElement>("download");
const includeCoordinates = element<HTMLInputElement>("include-coordinates");
const sendButton = element<HTMLButtonElement>("send-report");
const sendFields = element<HTMLFieldSetElement>("send-fields");
const sendCoordinates = element<HTMLInputElement>("send-coordinates");
const phoneDescription = element<HTMLInputElement>("phone-description");
const browserInput = element<HTMLInputElement>("browser-description");
const endpoint = reportEndpoint(
  import.meta.env.VITE_ALIGNMENT_REPORT_ENDPOINT,
  import.meta.env.DEV,
);
const sendReport = endpoint ? createReportSender(endpoint) : null;
let sending = false;
browserInput.value = browserDescription(navigator.userAgent);
element("send-status").textContent = endpoint
  ? "Send when ready. Phone and browser descriptions are optional."
  : "Report sending is not configured for this site. Copy and Download remain available.";
let target: TargetBody = "Moon";
let engine: SkyEngine | null = null;
let memory: WebAssembly.Memory | null = null;
let engineError = "";
let active = false;
let generation = 0;
let gps: DiagnosticGPS | null = null;
let gpsError = "";
let watchId: number | null = null;
let interval: ReturnType<typeof setInterval> | undefined;
const captures: DiagnosticCapture[] = [];

const sensor = createOrientationSensor({
  onSample: () => {},
  onStateChange: () => {},
});
const camera = createDiagnosticCamera(video, (state) => {
  element("camera-status").textContent = state.message;
  // Avoid state-change recursion; the interval updates other readiness messages.
  if (state.status !== "ready") captureButton.disabled = true;
});

function expectedPosition(when: Date, fix: DiagnosticGPS) {
  if (!engine || !memory) return null;
  engine.set_observer_location(fix.latitude, fix.longitude);
  engine.set_time_utc(
    when.getUTCFullYear(),
    when.getUTCMonth() + 1,
    when.getUTCDate(),
    when.getUTCHours(),
    when.getUTCMinutes(),
    when.getUTCSeconds() + when.getUTCMilliseconds() / 1000,
  );
  engine.recompute();
  const buffer = new Float32Array(
    memory.buffer,
    engine.bodies_pos_ptr(),
    engine.bodies_pos_len(),
  );
  const index = target === "Sun" ? 0 : 3;
  const { ra, dec } = positionToRaDec({
    x: -buffer[index],
    y: buffer[index + 2],
    z: buffer[index + 1],
  });
  // The engine buffer is J2000, including the observer-dependent Moon parallax.
  return equatorialToHorizontal(
    ra,
    dec,
    computeLST(when, fix.longitude),
    fix.latitude,
    julianDate(when),
  );
}

function currentInput(): CaptureInput {
  const now = new Date();
  const usableGPS = !gpsError && !gpsProblem(gps, now.getTime());
  let expected = null;
  try {
    if (usableGPS && gps) expected = expectedPosition(now, gps);
  } catch {
    engineError =
      "Target position could not be calculated. Reload this page to retry.";
  }
  return {
    target,
    now,
    monotonicNow: performance.now(),
    cameraReady: active && camera.isReady(),
    gps: gpsError ? null : gps,
    orientation: sensor.getSample(),
    expected,
    declination:
      usableGPS && gps
        ? magneticDeclination(gps.latitude, gps.longitude, now)
        : NaN,
    screenRotation: getScreenOrientationAngle(),
  };
}

const fmt = (value: number) => value.toFixed(2);
const signed = (value: number) => `${value >= 0 ? "+" : ""}${fmt(value)}°`;
function refresh(): void {
  const input = currentInput();
  const sensorState = sensor.getState();
  element("gps-status").textContent = active
    ? gpsError ||
      gpsProblem(gps, input.now.getTime()) ||
      `GPS ±${Math.round(gps!.accuracy)} m · ${((input.now.getTime() - gps!.timestamp) / 1000).toFixed(1)} s old`
    : "Location is off.";
  element("orientation-status").textContent = !active
    ? "Motion sensor is off."
    : sensorState.sensorMessage ||
      (input.orientation
        ? `North-referenced reading · ${(input.monotonicNow - input.orientation.receivedAt).toFixed(0)} ms old · compass accuracy ${input.orientation.compassAccuracy === null ? "unknown" : `±${fmt(input.orientation.compassAccuracy)}°`}`
        : "Waiting for a north-referenced reading. Gently move the phone.");
  const targetMessage = input.expected
    ? `${target}: altitude ${fmt(input.expected.altitude)}°, azimuth ${fmt(input.expected.azimuth)}°`
    : engineError ||
      (engine
        ? `${target}: waiting for current GPS.`
        : "Loading target positions…");
  element("target-status").textContent = targetMessage;
  const problem = captureProblem(input);
  captureButton.disabled = !!problem;
  element("status").textContent = !active
    ? "Start when you are ready to use the rear camera, location and motion sensor."
    : engineError ||
      (input.expected && input.expected.altitude <= 0
        ? `${target} is below the horizon. Choose a visible target or return later.`
        : problem || "Center the target on the reticle, then capture.");
}

function stopSession(): void {
  active = false;
  generation++;
  clearInterval(interval);
  interval = undefined;
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  gps = null;
  gpsError = "";
  sensor.stop();
  camera.stop();
  startButton.disabled = false;
  stopButton.disabled = true;
  refresh();
}

function startSession(): void {
  if (active) return;
  active = true;
  const id = ++generation;
  startButton.disabled = true;
  stopButton.disabled = false;
  // Request synchronously from the click, before awaiting camera or GPS prompts.
  const permission = sensor.requestPermission();
  void permission.then((granted) => {
    if (active && id === generation) {
      if (granted) sensor.start();
      refresh();
    }
  });
  void camera.start().then(() => {
    if (id === generation) refresh();
  });
  if (!navigator.geolocation)
    gpsError = "Location is unavailable in this browser.";
  else {
    try {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          if (!active || id !== generation) return;
          gps = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          };
          gpsError = "";
          refresh();
        },
        (error) => {
          if (!active || id !== generation) return;
          gps = null;
          gpsError =
            error.code === 1
              ? "Location permission denied. Allow location access, then restart."
              : error.code === 3
                ? "Location request timed out. Waiting for a new fix."
                : "Current location is unavailable. Waiting for a new fix.";
          refresh();
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
      );
    } catch {
      gpsError = "Location could not start. Check browser location access.";
    }
  }
  interval = setInterval(refresh, 500);
  refresh();
}

function renderHistory(): void {
  history.replaceChildren();
  for (const capture of captures) {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = `${capture.target} · ${capture.utc} · error ${fmt(capture.errors.greatCircle)}°`;
    const details = document.createElement("pre");
    details.textContent = [
      `Expected altitude ${fmt(capture.expected.altitude)}° · azimuth ${fmt(capture.expected.azimuth)}°`,
      `Measured altitude ${fmt(capture.measured.altitude)}° · azimuth ${fmt(capture.measured.azimuth)}°`,
      `Δ altitude ${signed(capture.errors.altitude)} · Δ azimuth ${signed(capture.errors.azimuth)}`,
      `GPS ±${Math.round(capture.gps.accuracy)} m · age ${capture.gps.ageMs} ms`,
      `Motion age ${capture.orientation.ageMs.toFixed(0)} ms · ${capture.orientation.headingReference}`,
      `Compass accuracy ${capture.orientation.compassAccuracy === null ? "unknown" : `±${fmt(capture.orientation.compassAccuracy)}°`} · screen ${capture.screenRotation}°`,
      `Raw α ${fmt(capture.orientation.alpha)}° · β ${fmt(capture.orientation.beta)}° · γ ${fmt(capture.orientation.gamma)}°`,
      `Uncorrected magnetic azimuth ${fmt(capture.rawMeasured.azimuth)}°`,
      `Magnetic declination ${signed(capture.magneticDeclination)}`,
    ].join("\n");
    item.append(title, details);
    history.append(item);
  }
  element("history-count").textContent =
    `${captures.length} of ${CAPTURE_HISTORY_LIMIT} recent captures`;
  copyButton.disabled = downloadButton.disabled = captures.length === 0;
  refreshSend();
}

function refreshSend(): void {
  sendButton.disabled =
    !sendReport ||
    sending ||
    captures.length === 0 ||
    !isDescription(phoneDescription.value.trim() || "Unknown") ||
    !isDescription(browserInput.value.trim() || "Unknown");
  sendFields.disabled = sending;
  sendButton.textContent = sending ? "Sending…" : "Send report";
}
phoneDescription.addEventListener("input", refreshSend);
browserInput.addEventListener("input", refreshSend);
sendButton.addEventListener("click", async () => {
  if (!sendReport || sending) return;
  try {
    const report = createAlignmentReport(
      captures,
      sendCoordinates.checked,
      { phone: phoneDescription.value, browser: browserInput.value },
      { commit: __GIT_COMMIT__, time: __BUILD_TIME__ },
    );
    sending = true;
    refreshSend();
    element("send-status").textContent =
      "Sending measurements… Keep this page open.";
    const receipt = await sendReport(report);
    element("send-status").textContent =
      `Report received. Receipt: ${receipt.receiptId}. Your local captures are still available.`;
  } catch (error) {
    element("send-status").textContent =
      `${error instanceof Error ? error.message : "Could not send. Try again later."} Your local captures are still available.`;
  } finally {
    sending = false;
    refreshSend();
  }
});

startButton.addEventListener("click", startSession);
stopButton.addEventListener("click", stopSession);
captureButton.addEventListener("click", () => {
  // Recheck at the tap; a previously enabled button cannot authorize stale data.
  try {
    captures.unshift(captureDiagnostic(currentInput()));
    captures.splice(CAPTURE_HISTORY_LIMIT);
    renderHistory();
    element("export-status").textContent = "Capture saved for this visit.";
  } catch (error) {
    element("status").textContent =
      error instanceof Error ? error.message : "Capture is unavailable.";
  }
  refresh();
});
for (const body of ["Moon", "Sun"] as const) {
  element(`target-${body.toLowerCase()}`).addEventListener("click", () => {
    target = body;
    for (const other of ["Moon", "Sun"])
      element(`target-${other.toLowerCase()}`).setAttribute(
        "aria-pressed",
        String(body === other),
      );
    element("sun-instruction").hidden = body !== "Sun";
    refresh();
  });
}
copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(
      exportCaptures(captures, includeCoordinates.checked),
    );
    element("export-status").textContent =
      `Copied ${captures.length} captures ${includeCoordinates.checked ? "with" : "without"} coordinates.`;
  } catch {
    element("export-status").textContent =
      "Copy is unavailable. Use Download JSON instead.";
  }
});
downloadButton.addEventListener("click", () => {
  const url = URL.createObjectURL(
    new Blob([exportCaptures(captures, includeCoordinates.checked)], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "once-around-alignment.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  element("export-status").textContent =
    `Downloaded captures ${includeCoordinates.checked ? "with" : "without"} coordinates.`;
});
window.addEventListener("pagehide", stopSession);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopSession();
});
window.addEventListener("orientationchange", refresh);
window.screen.orientation?.addEventListener("change", refresh);

async function initialize(): Promise<void> {
  try {
    memory = (await init()).memory;
    engine = new SkyEngine(new Uint8Array(0));
  } catch {
    engineError = "Target positions failed to load. Reload this page to retry.";
  }
  refresh();
}
renderHistory();
refresh();
void initialize();
