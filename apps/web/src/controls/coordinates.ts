/**
 * Coordinate Conversion Functions
 *
 * Functions for converting between different celestial coordinate systems:
 * - Equatorial (RA/Dec)
 * - Horizontal (Alt/Az)
 * - Three.js direction vectors
 */

import * as THREE from "three";

/**
 * Convert RA/Dec (degrees) to direction vector in Three.js coordinates.
 */
export function raDecToDirection(raDeg: number, decDeg: number): THREE.Vector3 {
  const raRad = (raDeg * Math.PI) / 180;
  const decRad = (decDeg * Math.PI) / 180;
  const cosDec = Math.cos(decRad);
  return new THREE.Vector3(
    -cosDec * Math.cos(raRad),
    Math.sin(decRad),
    cosDec * Math.sin(raRad)
  );
}

/**
 * Create a quaternion that orients the view to look at the given RA/Dec,
 * with "up" aligned toward the celestial north pole.
 * This prevents roll accumulation during navigation.
 */
export function raDecToQuaternion(ra: number, dec: number): THREE.Quaternion {
  const raRad = (ra * Math.PI) / 180;
  const decRad = (dec * Math.PI) / 180;

  // Convert RA/Dec to a direction vector
  // -X axis points to RA=0, Dec=0 (negated for east-west fix)
  // Y axis points to Dec=+90 (north celestial pole)
  // +Z axis points to RA=90°, Dec=0
  const cosDec = Math.cos(decRad);
  const viewDir = new THREE.Vector3(
    -cosDec * Math.cos(raRad),
    Math.sin(decRad),
    cosDec * Math.sin(raRad)
  );

  // Celestial north pole direction
  const northPole = new THREE.Vector3(0, 1, 0);

  // Compute "up" direction: project north pole onto plane perpendicular to view
  // This keeps celestial north pointing up (or as close to up as possible)
  const up = northPole
    .clone()
    .sub(viewDir.clone().multiplyScalar(northPole.dot(viewDir)))
    .normalize();

  // Handle the case when looking directly at the poles
  if (up.lengthSq() < 0.001) {
    // At poles, use RA=0 direction as reference for "up"
    const ra0Dir = new THREE.Vector3(-1, 0, 0);
    up.copy(ra0Dir.sub(viewDir.clone().multiplyScalar(ra0Dir.dot(viewDir))).normalize());
  }

  // Compute right vector
  const right = new THREE.Vector3().crossVectors(viewDir, up).normalize();

  // Build rotation matrix from basis vectors
  // Camera looks along -Z in its local space, so we need:
  // - right = local +X
  // - up = local +Y
  // - viewDir = local -Z (so -viewDir = local +Z)
  const m = new THREE.Matrix4();
  m.makeBasis(right, up, viewDir.clone().negate());

  const quat = new THREE.Quaternion();
  quat.setFromRotationMatrix(m);

  return quat;
}

/**
 * Convert equatorial (RA/Dec) to horizontal (Alt/Az) coordinates.
 * All inputs and outputs in degrees.
 */
export function equatorialToHorizontal(
  raDeg: number,
  decDeg: number,
  lstDeg: number,
  latDeg: number
): { altitude: number; azimuth: number } {
  const raRad = (raDeg * Math.PI) / 180;
  const decRad = (decDeg * Math.PI) / 180;
  const lstRad = (lstDeg * Math.PI) / 180;
  const latRad = (latDeg * Math.PI) / 180;

  const ha = lstRad - raRad; // Hour angle

  const sinAlt =
    Math.sin(decRad) * Math.sin(latRad) +
    Math.cos(decRad) * Math.cos(latRad) * Math.cos(ha);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  const cosAlt = Math.cos(altitude);
  // Avoid division by zero at zenith
  if (Math.abs(cosAlt) < 1e-10) {
    return { altitude: (altitude * 180) / Math.PI, azimuth: 0 };
  }

  const cosAz =
    (Math.sin(decRad) - Math.sin(altitude) * Math.sin(latRad)) /
    (cosAlt * Math.cos(latRad));
  const sinAz = (-Math.cos(decRad) * Math.sin(ha)) / cosAlt;
  let azimuth = Math.atan2(sinAz, cosAz);
  if (azimuth < 0) azimuth += 2 * Math.PI;

  return {
    altitude: (altitude * 180) / Math.PI,
    azimuth: (azimuth * 180) / Math.PI,
  };
}

/**
 * Convert horizontal (Alt/Az) to equatorial (RA/Dec) coordinates.
 * All inputs and outputs in degrees.
 */
export function horizontalToEquatorial(
  azDeg: number,
  altDeg: number,
  lstDeg: number,
  latDeg: number
): { ra: number; dec: number } {
  const azRad = (azDeg * Math.PI) / 180;
  const altRad = (altDeg * Math.PI) / 180;
  const latRad = (latDeg * Math.PI) / 180;

  const sinDec =
    Math.sin(altRad) * Math.sin(latRad) +
    Math.cos(altRad) * Math.cos(latRad) * Math.cos(azRad);
  const dec = Math.asin(Math.max(-1, Math.min(1, sinDec)));

  const cosDec = Math.cos(dec);
  // Avoid division by zero near poles
  if (Math.abs(cosDec) < 1e-10 || Math.abs(Math.cos(latRad)) < 1e-10) {
    return { ra: lstDeg, dec: (dec * 180) / Math.PI };
  }

  const cosHA =
    (Math.sin(altRad) - Math.sin(dec) * Math.sin(latRad)) /
    (cosDec * Math.cos(latRad));
  const sinHA = (-Math.cos(altRad) * Math.sin(azRad)) / cosDec;
  const ha = Math.atan2(sinHA, Math.max(-1, Math.min(1, cosHA)));

  let ra = lstDeg - (ha * 180) / Math.PI;
  if (ra < 0) ra += 360;
  if (ra >= 360) ra -= 360;

  return { ra, dec: (dec * 180) / Math.PI };
}
