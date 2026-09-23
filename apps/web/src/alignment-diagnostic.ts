/** Measurement and export policy, independent of WASM, rendering and browser APIs. */
import { angularSeparation } from "./geometry/coordinates";
import { deviceOrientationToAltAz } from "./geometry/device-orientation";
import {
  isOrientationSampleFresh,
  type OrientationSample,
} from "./orientation-sensor";

export const GPS_MAX_AGE_MS = 30_000;
export const GPS_MAX_ACCURACY_METERS = 100;
export const CAPTURE_HISTORY_LIMIT = 10;
export type TargetBody = "Moon" | "Sun";
export interface HorizontalPosition {
  altitude: number;
  azimuth: number;
}
export interface DiagnosticGPS {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export function gpsProblem(
  gps: DiagnosticGPS | null,
  now: number,
): string | null {
  if (!gps) return "Waiting for a current GPS fix. Allow location access.";
  if (
    !Number.isFinite(gps.latitude) ||
    Math.abs(gps.latitude) > 90 ||
    !Number.isFinite(gps.longitude) ||
    Math.abs(gps.longitude) > 180 ||
    !Number.isFinite(gps.accuracy) ||
    gps.accuracy < 0
  )
    return "GPS returned an unusable fix.";
  const age = now - gps.timestamp;
  if (!Number.isFinite(age) || age < 0 || age >= GPS_MAX_AGE_MS)
    return "GPS fix is stale. Waiting for a new location.";
  if (gps.accuracy > GPS_MAX_ACCURACY_METERS)
    return "GPS accuracy is too low. Move to an open area and wait for a better fix.";
  return null;
}

/** Signed measured − expected angle, in [-180, 180). */
export function signedAngleDifference(
  measured: number,
  expected: number,
): number {
  return ((((measured - expected + 180) % 360) + 360) % 360) - 180;
}

export function pointingErrors(
  measured: HorizontalPosition,
  expected: HorizontalPosition,
) {
  return {
    azimuth: signedAngleDifference(measured.azimuth, expected.azimuth),
    altitude: signedAngleDifference(measured.altitude, expected.altitude),
    greatCircle: angularSeparation(
      measured.altitude,
      measured.azimuth,
      expected.altitude,
      expected.azimuth,
    ),
  };
}

export interface CaptureInput {
  target: TargetBody;
  now: Date;
  monotonicNow: number;
  cameraReady: boolean;
  gps: DiagnosticGPS | null;
  orientation: OrientationSample | null;
  expected: HorizontalPosition | null;
  declination: number;
  screenRotation: number;
}

export function captureProblem(input: CaptureInput): string | null {
  if (!input.cameraReady)
    return "Start the rear camera and wait for the preview before capturing.";
  const locationProblem = gpsProblem(input.gps, input.now.getTime());
  if (locationProblem) return locationProblem;
  const sample = input.orientation;
  if (!isOrientationSampleFresh(sample, input.monotonicNow))
    return "Need a recent north-referenced reading. Gently move the phone, then align and capture.";
  if (
    ![sample.alpha, sample.beta, sample.gamma].every(Number.isFinite) ||
    sample.alpha < 0 ||
    sample.alpha >= 360 ||
    Math.abs(sample.beta) > 180 ||
    Math.abs(sample.gamma) > 90 ||
    !["absolute", "webkit-compass"].includes(sample.headingReference)
  )
    return "A usable north-referenced reading is required.";
  if (
    !input.expected ||
    ![
      input.expected.altitude,
      input.expected.azimuth,
      input.declination,
      input.screenRotation,
    ].every(Number.isFinite)
  )
    return "Waiting for the expected target position.";
  if (input.expected.altitude <= 0)
    return `${input.target} is below the horizon. Choose a visible target or return later.`;
  return null;
}

export interface DiagnosticCapture {
  target: TargetBody;
  utc: string;
  expected: HorizontalPosition;
  measured: HorizontalPosition;
  rawMeasured: HorizontalPosition;
  errors: ReturnType<typeof pointingErrors>;
  gps: DiagnosticGPS & { ageMs: number };
  orientation: OrientationSample & { ageMs: number };
  screenRotation: number;
  magneticDeclination: number;
}

export function captureDiagnostic(input: CaptureInput): DiagnosticCapture {
  const problem = captureProblem(input);
  if (problem) throw new Error(problem);
  const gps = input.gps!;
  const orientation = input.orientation!;
  // The back-camera optical axis is natural-device -Z in any screen rotation.
  // Screen compensation rotates display axes; applying it here would rotate twice.
  const raw = deviceOrientationToAltAz(
    orientation.alpha,
    orientation.beta,
    orientation.gamma,
  );
  const measured = {
    altitude: raw.altitude,
    azimuth: (((raw.azimuth + input.declination) % 360) + 360) % 360,
  };
  const expected = { ...input.expected! };
  return {
    target: input.target,
    utc: input.now.toISOString(),
    expected,
    measured,
    rawMeasured: raw,
    errors: pointingErrors(measured, expected),
    gps: { ...gps, ageMs: input.now.getTime() - gps.timestamp },
    orientation: {
      ...orientation,
      ageMs: input.monotonicNow - orientation.receivedAt,
    },
    screenRotation: input.screenRotation,
    magneticDeclination: input.declination,
  };
}

export function exportCaptures(
  captures: DiagnosticCapture[],
  includeCoordinates: boolean,
): string {
  return JSON.stringify(
    {
      schema: "once-around-alignment-v1",
      angleUnit: "degrees",
      errorConvention: "measured minus expected; signed shortest differences",
      uncertainty:
        "Compass accuracy may be unknown. A small error does not establish calibration. No correction is applied.",
      coordinatesIncluded: includeCoordinates,
      captures: captures.map((capture) => {
        const { latitude, longitude, ...gps } = capture.gps;
        return {
          ...capture,
          gps: includeCoordinates ? { ...gps, latitude, longitude } : gps,
        };
      }),
    },
    null,
    2,
  );
}
