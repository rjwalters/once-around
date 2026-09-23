/** North-referenced sensor sampling shared by AR and the standalone diagnostic.
 * No renderer, Three.js, or WASM dependencies belong in this module.
 *
 * Orientation events report significant changes, not a sensor heartbeat. An
 * old sample can mean a stationary phone, a paused tab, or a sensor problem;
 * its freshness cannot be established from silence alone. We conservatively
 * expire samples for measurement and ask for slight motion to obtain a new
 * reading. "Stale" is not a diagnosis of broken hardware or poor calibration.
 */
export const ORIENTATION_MAX_AGE_MS = 3000;

export type OrientationStatus = "idle" | "pending" | "usable" | "unavailable" | "stale";
export type HeadingReference = "absolute" | "webkit-compass";

export interface OrientationReading {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute?: boolean;
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

export interface OrientationSample {
  alpha: number;
  beta: number;
  gamma: number;
  receivedAt: number;
  headingReference: HeadingReference;
  /** Degrees reported by the platform; null means the browser does not report it. */
  compassAccuracy: number | null;
}

export interface OrientationSensorState {
  supported: boolean;
  permissionRequired: boolean;
  permissionGranted: boolean;
  enabled: boolean;
  sensorStatus: OrientationStatus;
  sensorMessage: string | null;
  headingReference: HeadingReference | null;
  compassAccuracy: number | null;
}

export interface OrientationSensor {
  getState(): OrientationSensorState;
  getSample(): OrientationSample | null;
  isSupported(): boolean;
  requiresPermission(): boolean;
  requestPermission(): Promise<boolean>;
  start(): void;
  stop(): void;
}

/** Reject relative alpha and unusable compass data instead of guessing north. */
export function normalizeOrientationSample(
  reading: OrientationReading,
  receivedAt: number
): OrientationSample | null {
  const { beta, gamma } = reading;
  if (
    !Number.isFinite(receivedAt) ||
    typeof beta !== "number" || !Number.isFinite(beta) || Math.abs(beta) > 180 ||
    typeof gamma !== "number" || !Number.isFinite(gamma) || Math.abs(gamma) > 90
  ) return null;

  const heading = reading.webkitCompassHeading;
  if (heading !== undefined) {
    const accuracy = reading.webkitCompassAccuracy;
    if (
      !Number.isFinite(heading) || heading < 0 || heading >= 360 ||
      (accuracy !== undefined && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 180))
    ) return null;
    return {
      alpha: (360 - heading) % 360,
      beta, gamma, receivedAt,
      headingReference: "webkit-compass",
      compassAccuracy: accuracy ?? null,
    };
  }

  const { alpha } = reading;
  if (
    reading.absolute !== true || typeof alpha !== "number" ||
    !Number.isFinite(alpha) || alpha < 0 || alpha >= 360
  ) return null;
  return { alpha, beta, gamma, receivedAt, headingReference: "absolute", compassAccuracy: null };
}

/** Uses monotonic receipt time, independent of simulation dates and wall-clock changes. */
export function isOrientationSampleFresh(
  sample: OrientationSample | null,
  now: number,
  maxAgeMs = ORIENTATION_MAX_AGE_MS
): sample is OrientationSample {
  if (!sample) return false;
  const age = now - sample.receivedAt;
  return Number.isFinite(age) && age >= 0 && age < maxAgeMs;
}

/** Screen axes rotate separately from the natural-device sensor axes. */
export function getScreenOrientationAngle(): number {
  if (typeof window === "undefined") return 0;
  const modern = window.screen?.orientation?.angle;
  const legacy = (window as Window & { orientation?: number }).orientation;
  const angle = Number.isFinite(modern) ? modern : legacy;
  return typeof angle === "number" && Number.isFinite(angle) ? ((angle % 360) + 360) % 360 : 0;
}

export function createOrientationSensor(callbacks: {
  onSample: (sample: OrientationSample) => void;
  onStateChange: (state: OrientationSensorState) => void;
}): OrientationSensor {
  // Unsupported browsers must not throw while the application initializes.
  const browser = typeof window === "undefined" ? undefined : window;
  const api = browser?.DeviceOrientationEvent as (typeof DeviceOrientationEvent & {
    requestPermission?: (absolute?: boolean) => Promise<string>;
  }) | undefined;
  let state: OrientationSensorState = {
    supported: typeof api === "function",
    permissionRequired: typeof api?.requestPermission === "function",
    permissionGranted: false,
    enabled: false,
    sensorStatus: typeof api === "function" ? "idle" : "unavailable",
    sensorMessage: typeof api === "function" ? null : "Device orientation is unavailable in this browser.",
    headingReference: null,
    compassAccuracy: null,
  };
  let latest: OrientationSample | null = null;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function updateState(updates: Partial<OrientationSensorState>): void {
    if (Object.entries(updates).every(([key, value]) => state[key as keyof OrientationSensorState] === value)) return;
    state = { ...state, ...updates };
    callbacks.onStateChange({ ...state });
  }

  function expire(): void {
    clearTimeout(timeout);
    timeout = undefined;
    if (!state.enabled) return;
    updateState({
      sensorStatus: latest ? "stale" : "unavailable",
      sensorMessage: latest
        ? "Need a recent compass reading. Move the phone slightly to refresh."
        : "No compass direction received. Move the phone slightly or check motion permissions.",
      headingReference: null,
      compassAccuracy: null,
    });
  }

  function handleOrientation(event: Event): void {
    if (!state.enabled) return;
    const sample = normalizeOrientationSample(event as DeviceOrientationEvent, performance.now());
    if (!sample) return;
    // A delayed event can arrive before a throttled background timeout. Mark
    // the gap explicitly so consumers reset smoothing before the fresh pose.
    if (latest && !isOrientationSampleFresh(latest, sample.receivedAt)) expire();
    latest = sample;
    clearTimeout(timeout);
    timeout = setTimeout(expire, ORIENTATION_MAX_AGE_MS);
    updateState({
      sensorStatus: "usable", sensorMessage: null,
      headingReference: sample.headingReference,
      compassAccuracy: sample.compassAccuracy,
    });
    callbacks.onSample(sample);
  }

  async function requestPermission(): Promise<boolean> {
    if (!state.supported) return false;
    let granted = !state.permissionRequired;
    try {
      // Absolute orientation also needs magnetometer permission in browsers
      // implementing the current W3C API. Older Safari ignores the argument.
      if (api?.requestPermission) granted = await api.requestPermission(true) === "granted";
    } catch {
      granted = false;
    }
    updateState({
      permissionGranted: granted,
      ...(!granted ? {
        sensorStatus: "unavailable" as const,
        sensorMessage: "Motion permission was denied. Allow motion access to use AR.",
      } : {}),
    });
    return granted;
  }

  function start(): void {
    if (!browser || !state.supported || state.enabled) return;
    if (state.permissionRequired && !state.permissionGranted) return;
    latest = null;
    updateState({
      enabled: true, permissionGranted: true, sensorStatus: "pending",
      sensorMessage: "Waiting for a compass direction. Move the phone slightly.",
      headingReference: null, compassAccuracy: null,
    });
    // Some browsers advertise an absolute event but only deliver usable data
    // through the ordinary event. Validate the reading, not the event name.
    browser.addEventListener("deviceorientationabsolute", handleOrientation, true);
    browser.addEventListener("deviceorientation", handleOrientation, true);
    timeout = setTimeout(expire, ORIENTATION_MAX_AGE_MS);
  }

  function stop(): void {
    clearTimeout(timeout);
    timeout = undefined;
    browser?.removeEventListener("deviceorientationabsolute", handleOrientation, true);
    browser?.removeEventListener("deviceorientation", handleOrientation, true);
    latest = null;
    updateState({
      enabled: false, sensorStatus: state.supported ? "idle" : "unavailable",
      sensorMessage: state.supported ? null : state.sensorMessage,
      headingReference: null, compassAccuracy: null,
    });
  }

  return {
    getState: () => {
      if (state.enabled && state.sensorStatus === "usable" && !isOrientationSampleFresh(latest, performance.now())) expire();
      return { ...state };
    },
    getSample: () => isOrientationSampleFresh(latest, performance.now()) ? { ...latest } : null,
    isSupported: () => state.supported,
    requiresPermission: () => state.permissionRequired,
    requestPermission, start, stop,
  };
}
