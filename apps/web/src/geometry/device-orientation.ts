/**
 * Device Orientation Geometry
 *
 * Pure math for converting device orientation sensor readings (alpha, beta, gamma)
 * to astronomical altitude/azimuth coordinates. This module is intentionally free
 * of any `three` import so dependency-light entry points (e.g. the standalone
 * /test AR diagnostics page) can import `deviceOrientationToAltAz` /
 * `compassHeadingToAlpha` without pulling in the Three.js bundle. The
 * Three.js-returning `deviceOrientationToQuaternion` lives in
 * `device-orientation-three.ts` and is re-exported below for existing call sites.
 * Separated from the event-handling manager so it can be unit tested independently.
 */

// Re-exported for backward compatibility. As a re-export (not a local
// definition), importers that only use the pure helpers above tree-shake
// `device-orientation-three.ts` — and Three.js — out of their bundle.
export { deviceOrientationToQuaternion } from "./device-orientation-three";

/**
 * Extract altitude and azimuth from device orientation angles.
 *
 * Device orientation angles (W3C DeviceOrientation spec):
 * - alpha: 0-360° rotation around Z (0 = device top pointing north for
 *   absolute/compass-referenced readings, increases counterclockwise from above)
 * - beta: -180 to 180° rotation around X (pitch; 0 = flat, 90 = screen facing user)
 * - gamma: -90 to 90° rotation around Y (roll; tilt left/right)
 *
 * Uses "camera mode": the viewing direction is where the BACK of the phone points.
 * The angles describe the intrinsic ZXY rotation R = Rz(α)·Rx(β)·Ry(γ) from the
 * device frame to the Earth frame (X east, Y north, Z up). The back-of-phone
 * direction (0,0,-1) in device space maps to world space as:
 *   east  = -cos(α)·sin(γ) - sin(α)·sin(β)·cos(γ)
 *   north = -sin(α)·sin(γ) + cos(α)·sin(β)·cos(γ)
 *   up    = -cos(β)·cos(γ)
 *
 * Because the sensor angles are reported in the device's natural frame regardless
 * of UI rotation, the pointing direction needs no screen-orientation correction:
 * holding the phone in landscape simply shows up as roll (gamma), which this full
 * three-angle form handles.
 *
 * @param alpha - Device compass angle (degrees, 0-360)
 * @param beta  - Device pitch angle (degrees, -180 to 180)
 * @param gamma - Device roll angle (degrees, -90 to 90)
 * @returns { altitude, azimuth } in degrees; azimuth 0 = north, increasing
 *   clockwise (east = 90), altitude 0 = horizon, 90 = zenith
 */
export function deviceOrientationToAltAz(
  alpha: number,
  beta: number,
  gamma: number
): { altitude: number; azimuth: number } {
  const alphaRad = (alpha * Math.PI) / 180;
  const betaRad = (beta * Math.PI) / 180;
  const gammaRad = (gamma * Math.PI) / 180;

  const cosAlpha = Math.cos(alphaRad);
  const sinAlpha = Math.sin(alphaRad);
  const cosBeta = Math.cos(betaRad);
  const sinBeta = Math.sin(betaRad);
  const cosGamma = Math.cos(gammaRad);
  const sinGamma = Math.sin(gammaRad);

  const east = -cosAlpha * sinGamma - sinAlpha * sinBeta * cosGamma;
  const north = -sinAlpha * sinGamma + cosAlpha * sinBeta * cosGamma;
  const up = -cosBeta * cosGamma;

  const altitude = (Math.asin(Math.max(-1, Math.min(1, up))) * 180) / Math.PI;

  // atan2(east, north) gives the clockwise-from-north astronomical azimuth.
  // Degenerate (pointing straight up/down) yields 0; smoothing absorbs it.
  let azimuth = (Math.atan2(east, north) * 180) / Math.PI;
  azimuth = ((azimuth % 360) + 360) % 360;

  return { altitude, azimuth };
}

/**
 * Convert an iOS `webkitCompassHeading` (degrees clockwise from north of the
 * device-top direction) into the equivalent W3C alpha angle, so compass-true
 * readings can be fed through the same rotation math as absolute alpha values.
 * Returns null if the heading is missing or invalid (Safari reports negative
 * values while the compass is uncalibrated).
 */
export function compassHeadingToAlpha(heading: number | undefined): number | null {
  if (typeof heading !== "number" || Number.isNaN(heading) || heading < 0) {
    return null;
  }
  return (360 - heading) % 360;
}
