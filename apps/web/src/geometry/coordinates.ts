/**
 * Coordinate Conversion Functions
 *
 * Pure functions for converting between celestial coordinate systems:
 * - Equatorial (RA/Dec) ↔ Horizontal (Alt/Az)
 * - Ecliptic ↔ Equatorial
 * - 3D position → RA/Dec
 * - Great-circle angular separation
 *
 * This module is intentionally free of any `three` import so that
 * dependency-light entry points (e.g. the standalone /test AR diagnostics page)
 * can import these pure conversions without pulling in the Three.js bundle. The
 * Three.js-returning helpers (raDecToDirection / raDecToPosition /
 * raDecToQuaternion) live in `coordinates-three.ts` and are re-exported below so
 * existing import sites keep working unchanged.
 */

// Re-export the Three.js-dependent helpers for backward compatibility. Because
// these are re-exports (not local definitions), importers that only use the
// pure functions above tree-shake `coordinates-three.ts` — and Three.js — out
// of their bundle entirely.
export {
  raDecToDirection,
  raDecToPosition,
  raDecToQuaternion,
} from "./coordinates-three";

// ---------------------------------------------------------------------------
// Position → RA/Dec
// ---------------------------------------------------------------------------

/**
 * Convert a 3D position (Three.js coordinates) to RA/Dec in degrees.
 * Accepts either a THREE.Vector3 or a plain { x, y, z } object.
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

/**
 * Great-circle angular separation between two points on the celestial sphere,
 * each given as horizontal coordinates (altitude, azimuth) in degrees.
 *
 * Uses the spherical law of cosines:
 *   cos(sep) = sin(alt1)·sin(alt2) + cos(alt1)·cos(alt2)·cos(az2 − az1)
 *
 * Because azimuth appears only through the cosine of its difference, the result
 * is independent of the azimuth reference direction and sign convention, as long
 * as both points use the same one. The result is a true great-circle angle, not
 * a naive Euclidean delta of the two coordinate pairs.
 *
 * @returns Separation in degrees, in the range [0, 180].
 */
export function angularSeparation(
  alt1Deg: number,
  az1Deg: number,
  alt2Deg: number,
  az2Deg: number
): number {
  const deg = Math.PI / 180;
  const alt1 = alt1Deg * deg;
  const alt2 = alt2Deg * deg;
  const dAz = (az2Deg - az1Deg) * deg;

  const cosSep =
    Math.sin(alt1) * Math.sin(alt2) +
    Math.cos(alt1) * Math.cos(alt2) * Math.cos(dAz);

  return (Math.acos(Math.max(-1, Math.min(1, cosSep))) * 180) / Math.PI;
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
