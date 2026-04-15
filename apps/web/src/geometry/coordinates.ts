/**
 * Coordinate Conversion Functions
 *
 * Pure functions for converting between celestial coordinate systems:
 * - Equatorial (RA/Dec) ↔ Horizontal (Alt/Az)
 * - Equatorial (RA/Dec) ↔ Three.js direction vectors and positions
 * - Ecliptic ↔ Equatorial
 * - 3D position → RA/Dec
 * - RA/Dec → camera orientation quaternion
 */

import * as THREE from "three";

// ---------------------------------------------------------------------------
// Direction vectors & positions
// ---------------------------------------------------------------------------

/**
 * Convert RA/Dec (degrees) to a unit direction vector in Three.js coordinates.
 *
 * Coordinate convention:
 *   -X → RA=0°, Dec=0°  |  Y → North celestial pole  |  +Z → RA=90°, Dec=0°
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
 * Convert RA/Dec (degrees) to a 3D position on a sky sphere of the given radius.
 * Same coordinate convention as raDecToDirection.
 */
export function raDecToPosition(ra: number, dec: number, radius: number): THREE.Vector3 {
  const raRad = (ra * Math.PI) / 180;
  const decRad = (dec * Math.PI) / 180;
  return new THREE.Vector3(
    -radius * Math.cos(decRad) * Math.cos(raRad),
    radius * Math.sin(decRad),
    radius * Math.cos(decRad) * Math.sin(raRad)
  );
}

/**
 * Convert a 3D position (Three.js coordinates) to RA/Dec in degrees.
 * Accepts either THREE.Vector3 or a plain { x, y, z } object.
 */
export function positionToRaDec(pos: { x: number; y: number; z: number }): {
  ra: number;
  dec: number;
} {
  const len = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
  const nx = pos.x / len;
  const ny = pos.y / len;
  const nz = pos.z / len;

  const dec = Math.asin(ny) * (180 / Math.PI);
  let ra = Math.atan2(nz, -nx) * (180 / Math.PI);
  if (ra < 0) ra += 360;

  return { ra, dec };
}

// ---------------------------------------------------------------------------
// Camera orientation
// ---------------------------------------------------------------------------

/**
 * Create a quaternion that orients the camera to look at the given RA/Dec,
 * with "up" aligned toward the celestial north pole.
 * Prevents roll accumulation during navigation.
 */
export function raDecToQuaternion(ra: number, dec: number): THREE.Quaternion {
  const raRad = (ra * Math.PI) / 180;
  const decRad = (dec * Math.PI) / 180;

  const cosDec = Math.cos(decRad);
  const viewDir = new THREE.Vector3(
    -cosDec * Math.cos(raRad),
    Math.sin(decRad),
    cosDec * Math.sin(raRad)
  );

  const northPole = new THREE.Vector3(0, 1, 0);
  const up = northPole
    .clone()
    .sub(viewDir.clone().multiplyScalar(northPole.dot(viewDir)))
    .normalize();

  // At poles, use RA=0 direction as reference for "up"
  if (up.lengthSq() < 0.001) {
    const ra0Dir = new THREE.Vector3(-1, 0, 0);
    up.copy(
      ra0Dir.sub(viewDir.clone().multiplyScalar(ra0Dir.dot(viewDir))).normalize()
    );
  }

  const right = new THREE.Vector3().crossVectors(viewDir, up).normalize();

  // Camera looks along -Z in its local space:
  //   right = local +X, up = local +Y, -viewDir = local +Z
  const m = new THREE.Matrix4();
  m.makeBasis(right, up, viewDir.clone().negate());

  const quat = new THREE.Quaternion();
  quat.setFromRotationMatrix(m);
  return quat;
}

// ---------------------------------------------------------------------------
// Equatorial ↔ Horizontal
// ---------------------------------------------------------------------------

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

  const ha = lstRad - raRad;

  const sinAlt =
    Math.sin(decRad) * Math.sin(latRad) +
    Math.cos(decRad) * Math.cos(latRad) * Math.cos(ha);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  const cosAlt = Math.cos(altitude);
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

// ---------------------------------------------------------------------------
// Ecliptic ↔ Equatorial
// ---------------------------------------------------------------------------

/** Obliquity of the ecliptic at J2000 epoch, in radians */
const OBLIQUITY_RAD = (23.4393 * Math.PI) / 180;

/**
 * Convert a heliocentric ecliptic direction vector to equatorial RA/Dec.
 * @returns { ra, dec } in degrees
 */
export function eclipticToEquatorialRaDec(
  x: number,
  y: number,
  z: number
): { ra: number; dec: number } {
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len === 0) return { ra: 0, dec: 0 };
  const dx = x / len;
  const dy = y / len;
  const dz = z / len;

  const cosEps = Math.cos(OBLIQUITY_RAD);
  const sinEps = Math.sin(OBLIQUITY_RAD);

  // Rotation about X-axis by obliquity
  const eqX = dx;
  const eqY = dy * cosEps - dz * sinEps;
  const eqZ = dy * sinEps + dz * cosEps;

  let ra = (Math.atan2(eqY, eqX) * 180) / Math.PI;
  if (ra < 0) ra += 360;
  const dec = (Math.asin(eqZ) * 180) / Math.PI;

  return { ra, dec };
}
