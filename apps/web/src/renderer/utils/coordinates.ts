/**
 * Coordinate Conversion Utilities
 *
 * Functions for converting between coordinate systems used in the renderer.
 */

import * as THREE from "three";

/**
 * Convert from Rust/WASM coordinate system (Z-up) to Three.js coordinate system (Y-up).
 *
 * Rust coords:  X → RA=0, Dec=0 | Y → RA=90°, Dec=0 | Z → north celestial pole
 * Three.js:    -X → RA=0, Dec=0 | Y → north pole    | -Z → RA=90°
 *
 * The conversion swaps Y↔Z to change from Z-up to Y-up, and negates X and Z
 * to fix the east-west orientation. This ensures RA increases eastward
 * (counterclockwise when viewed from above the north pole), matching the
 * real sky as seen by an observer.
 *
 * @param rustX - X coordinate from WASM buffer
 * @param rustY - Y coordinate from WASM buffer
 * @param rustZ - Z coordinate from WASM buffer
 * @param scale - Scale factor to apply (e.g., SKY_RADIUS)
 * @returns THREE.Vector3 in Three.js coordinate system
 */
export function rustToThreeJS(rustX: number, rustY: number, rustZ: number, scale: number = 1): THREE.Vector3 {
  return new THREE.Vector3(
    -rustX * scale,      // Negate X to fix east-west (RA increases eastward)
    rustZ * scale,       // Rust Z → Three.js Y (north pole up)
    rustY * scale        // Rust Y → Three.js Z (RA=90°)
  );
}

/**
 * Read a position from a WASM buffer at the given index and convert to Three.js coords.
 * @param buffer - Float32Array from WASM
 * @param index - Body/star index (will be multiplied by 3 to get buffer offset)
 * @param scale - Scale factor to apply
 */
export function readPositionFromBuffer(buffer: Float32Array, index: number, scale: number = 1): THREE.Vector3 {
  const offset = index * 3;
  return rustToThreeJS(buffer[offset], buffer[offset + 1], buffer[offset + 2], scale);
}

/**
 * Convert RA/Dec to 3D position on sky sphere.
 * Matches rustToThreeJS: negate X to fix east-west orientation.
 * @param ra - Right ascension in degrees
 * @param dec - Declination in degrees
 * @param radius - Radius of the sky sphere
 */
export function raDecToPosition(ra: number, dec: number, radius: number): THREE.Vector3 {
  const raRad = (ra * Math.PI) / 180;
  const decRad = (dec * Math.PI) / 180;
  const x = -radius * Math.cos(decRad) * Math.cos(raRad);
  const y = radius * Math.sin(decRad);
  const z = radius * Math.cos(decRad) * Math.sin(raRad);
  return new THREE.Vector3(x, y, z);
}

/**
 * Compute Greenwich Mean Sidereal Time for a given date.
 * @param date - The date to compute GMST for
 * @returns GMST in degrees (0-360)
 */
export function computeGMST(date: Date): number {
  // Julian Date
  const JD = date.getTime() / 86400000 + 2440587.5;
  // Julian centuries since J2000.0
  const T = (JD - 2451545.0) / 36525;
  // GMST in degrees (IAU 2006)
  let gmst = 280.46061837 + 360.98564736629 * (JD - 2451545.0)
           + 0.000387933 * T * T - T * T * T / 38710000;
  // Normalize to 0-360
  gmst = ((gmst % 360) + 360) % 360;
  return gmst;
}
