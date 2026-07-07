/**
 * Three.js-dependent coordinate helpers.
 *
 * These functions return / operate on Three.js math types (Vector3, Quaternion,
 * Matrix4) and are therefore split out from the pure-math `coordinates.ts`. This
 * separation keeps `coordinates.ts` free of any `three` import so that
 * dependency-light entry points (e.g. the standalone /test AR diagnostics page)
 * can import the pure horizontal/equatorial conversions without pulling the
 * ~480 kB Three.js bundle into their chunk.
 *
 * `coordinates.ts` re-exports everything here, so existing
 * `import { raDecToDirection } from "./coordinates"` call sites are unaffected.
 */

import { Matrix4, Quaternion, Vector3 } from "three";

/**
 * Convert RA/Dec (degrees) to a unit direction vector in Three.js coordinates.
 *
 * Coordinate convention:
 *   -X → RA=0°, Dec=0°  |  Y → North celestial pole  |  +Z → RA=90°, Dec=0°
 */
export function raDecToDirection(raDeg: number, decDeg: number): Vector3 {
  const raRad = (raDeg * Math.PI) / 180;
  const decRad = (decDeg * Math.PI) / 180;
  const cosDec = Math.cos(decRad);
  return new Vector3(
    -cosDec * Math.cos(raRad),
    Math.sin(decRad),
    cosDec * Math.sin(raRad)
  );
}

/**
 * Convert RA/Dec (degrees) to a 3D position on a sky sphere of the given radius.
 * Same coordinate convention as raDecToDirection.
 */
export function raDecToPosition(ra: number, dec: number, radius: number): Vector3 {
  const raRad = (ra * Math.PI) / 180;
  const decRad = (dec * Math.PI) / 180;
  return new Vector3(
    -radius * Math.cos(decRad) * Math.cos(raRad),
    radius * Math.sin(decRad),
    radius * Math.cos(decRad) * Math.sin(raRad)
  );
}

/**
 * Create a quaternion that orients the camera to look at the given RA/Dec,
 * with "up" aligned toward the celestial north pole.
 * Prevents roll accumulation during navigation.
 */
export function raDecToQuaternion(ra: number, dec: number): Quaternion {
  const raRad = (ra * Math.PI) / 180;
  const decRad = (dec * Math.PI) / 180;

  const cosDec = Math.cos(decRad);
  const viewDir = new Vector3(
    -cosDec * Math.cos(raRad),
    Math.sin(decRad),
    cosDec * Math.sin(raRad)
  );

  const northPole = new Vector3(0, 1, 0);
  const up = northPole
    .clone()
    .sub(viewDir.clone().multiplyScalar(northPole.dot(viewDir)))
    .normalize();

  // At poles, use RA=0 direction as reference for "up"
  if (up.lengthSq() < 0.001) {
    const ra0Dir = new Vector3(-1, 0, 0);
    up.copy(
      ra0Dir.sub(viewDir.clone().multiplyScalar(ra0Dir.dot(viewDir))).normalize()
    );
  }

  const right = new Vector3().crossVectors(viewDir, up).normalize();

  // Camera looks along -Z in its local space:
  //   right = local +X, up = local +Y, -viewDir = local +Z
  const m = new Matrix4();
  m.makeBasis(right, up, viewDir.clone().negate());

  const quat = new Quaternion();
  quat.setFromRotationMatrix(m);
  return quat;
}
