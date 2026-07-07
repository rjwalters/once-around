/**
 * Three.js-dependent device-orientation helper.
 *
 * `deviceOrientationToQuaternion` returns a Three.js Quaternion and is split out
 * from the pure-math `device-orientation.ts` so that module stays free of any
 * `three` import. Dependency-light entry points (e.g. the standalone /test AR
 * diagnostics page) import only the pure `deviceOrientationToAltAz` /
 * `compassHeadingToAlpha` helpers and therefore never pull the Three.js bundle
 * into their chunk. `device-orientation.ts` re-exports this function so existing
 * call sites are unaffected.
 */

import { Quaternion, Vector3 } from "three";

/**
 * Build the full device-to-Earth rotation as a quaternion.
 *
 * Uses the same intrinsic ZXY rotation as `deviceOrientationToAltAz`:
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
 * @returns A normalized Quaternion mapping device-frame vectors to ENU.
 */
export function deviceOrientationToQuaternion(
  alpha: number,
  beta: number,
  gamma: number
): Quaternion {
  const alphaRad = (alpha * Math.PI) / 180;
  const betaRad = (beta * Math.PI) / 180;
  const gammaRad = (gamma * Math.PI) / 180;

  // Compose the intrinsic ZXY rotation R = Rz(alpha) * Rx(beta) * Ry(gamma).
  // Each factor is a rotation about a fixed axis, so the product applied to a
  // device-frame vector v gives Rz(Rx(Ry(v))) — the ENU coordinates of v.
  const qz = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), alphaRad);
  const qx = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), betaRad);
  const qy = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), gammaRad);

  // qz * qx * qy
  return qz.multiply(qx).multiply(qy).normalize();
}
