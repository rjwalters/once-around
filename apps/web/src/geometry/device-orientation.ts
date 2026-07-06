/**
 * Device Orientation Geometry
 *
 * Pure math for converting device orientation sensor readings (alpha, beta, gamma)
 * to astronomical altitude/azimuth coordinates and to a full-orientation quaternion.
 * Separated from the event-handling manager so it can be unit tested independently.
 */

import * as THREE from "three";

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
 * Build the full device-to-Earth rotation as a quaternion.
 *
 * Uses the same intrinsic ZXY rotation as {@link deviceOrientationToAltAz}:
 *   R = Rz(alpha) * Rx(beta) * Ry(gamma)
 * which maps a vector expressed in the device frame into the Earth ENU frame
 * (X = east, Y = north, Z = up). Applying the returned quaternion to the
 * back-of-phone vector (0, 0, -1) reproduces the pointing direction implied by
 * `deviceOrientationToAltAz`, and applying it to (0, 1, 0) yields the
 * top-of-phone (camera "up") direction — so the full three angles, including
 * roll (gamma), are represented. This lets the camera roll with the device
 * instead of locking the horizon to screen level.
 *
 * @param alpha - Device compass angle (degrees, 0-360)
 * @param beta  - Device pitch angle (degrees, -180 to 180)
 * @param gamma - Device roll angle (degrees, -90 to 90)
 * @returns A normalized THREE.Quaternion mapping device-frame vectors to ENU.
 */
export function deviceOrientationToQuaternion(
  alpha: number,
  beta: number,
  gamma: number
): THREE.Quaternion {
  const alphaRad = (alpha * Math.PI) / 180;
  const betaRad = (beta * Math.PI) / 180;
  const gammaRad = (gamma * Math.PI) / 180;

  // Compose the intrinsic ZXY rotation R = Rz(alpha) * Rx(beta) * Ry(gamma).
  // Each factor is a rotation about a fixed axis, so the product applied to a
  // device-frame vector v gives Rz(Rx(Ry(v))) — the ENU coordinates of v.
  const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), alphaRad);
  const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), betaRad);
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), gammaRad);

  // qz * qx * qy
  return qz.multiply(qx).multiply(qy).normalize();
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
