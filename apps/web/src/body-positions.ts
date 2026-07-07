/**
 * Body position utilities - converts engine data to Three.js positions.
 */

import * as THREE from "three";
import { getSunMoonSeparation } from "./eclipseData";

/** A 3D position with x, y, z coordinates */
export interface Position3D {
  x: number;
  y: number;
  z: number;
}

// Body names in the order they appear in the position buffer
export const BODY_NAMES = [
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"
] as const;

// Minor body names in the order they appear in the minor bodies buffer
export const MINOR_BODY_NAMES = [
  "Pluto", "Ceres", "Eris", "Makemake", "Haumea",
  "Sedna", "Quaoar", "Gonggong", "Orcus", "Varuna",
  "Vesta", "Pallas", "Hygiea", "Apophis", "Bennu"
] as const;

// Comet names in the order they appear in the comets buffer
export const COMET_NAMES = [
  "1P/Halley", "2P/Encke", "67P/C-G", "46P/Wirtanen",
  "C/2020 F3 NEOWISE", "C/2023 A3 T-ATLAS", "C/1995 O1 Hale-Bopp",
  "C/1811 F1 (1811)", "C/1965 S1 Ikeya-Seki"
] as const;

// Sky sphere radius for positioning
export const SKY_RADIUS = 50;

/** Map of body names to their 3D positions (as THREE.Vector3) */
export type BodyPositions = Map<string, THREE.Vector3>;

export interface BodyPositionBuffers {
  bodies: Float32Array;
  minorBodies: Float32Array;
  comets: Float32Array;
}

// Radius the sky-sphere body positions sit on. SKY_RADIUS - 0.5 matches video
// marker positioning.
const BODY_POSITION_RADIUS = SKY_RADIUS - 0.5;

// Global body index ranges, in the order the flat index space is laid out:
//   [0, BODY_NAMES.length)                          -> major bodies (stride 3)
//   [BODY_NAMES.length, +MINOR_BODY_NAMES.length)   -> minor bodies (stride 4)
//   [..., +COMET_NAMES.length)                      -> comets       (stride 4)
const MINOR_BODY_INDEX_START = BODY_NAMES.length;
const COMET_INDEX_START = BODY_NAMES.length + MINOR_BODY_NAMES.length;

/**
 * Read a single body's 3D position directly from the raw buffers into `out`,
 * without allocating a Map or per-body Vector3 objects. `index` is the flat
 * global index across major bodies, then minor bodies, then comets (matching
 * the ordering used by {@link getBodyPositions}).
 *
 * This is the allocation-free single-body read used by the hot Hubble/JWST
 * render paths that only need one body (e.g. the Sun) per frame.
 */
export function getBodyPositionInto(
  buffers: BodyPositionBuffers,
  index: number,
  out: THREE.Vector3
): void {
  let rustX: number;
  let rustY: number;
  let rustZ: number;

  if (index < MINOR_BODY_INDEX_START) {
    // Major bodies: 3 floats per body (x, y, z)
    const o = index * 3;
    rustX = buffers.bodies[o];
    rustY = buffers.bodies[o + 1];
    rustZ = buffers.bodies[o + 2];
  } else if (index < COMET_INDEX_START) {
    // Minor bodies: 4 floats per body (x, y, z, angular_diameter)
    const o = (index - MINOR_BODY_INDEX_START) * 4;
    rustX = buffers.minorBodies[o];
    rustY = buffers.minorBodies[o + 1];
    rustZ = buffers.minorBodies[o + 2];
  } else {
    // Comets: 4 floats per comet (x, y, z, magnitude)
    const o = (index - COMET_INDEX_START) * 4;
    rustX = buffers.comets[o];
    rustY = buffers.comets[o + 1];
    rustZ = buffers.comets[o + 2];
  }

  // Convert to Three.js coords: negate X for east-west fix, swap Y/Z for Y-up
  out.set(-rustX, rustZ, rustY).normalize().multiplyScalar(BODY_POSITION_RADIUS);
}

/**
 * Build a map of body names to their current 3D positions.
 */
export function getBodyPositions(buffers: BodyPositionBuffers): BodyPositions {
  const positions: BodyPositions = new Map();

  // Add major bodies (Sun, Moon, planets)
  for (let i = 0; i < BODY_NAMES.length; i++) {
    const pos = new THREE.Vector3();
    getBodyPositionInto(buffers, i, pos);
    positions.set(BODY_NAMES[i], pos);
  }

  // Add minor bodies (Pluto, dwarf planets)
  for (let i = 0; i < MINOR_BODY_NAMES.length; i++) {
    const pos = new THREE.Vector3();
    getBodyPositionInto(buffers, MINOR_BODY_INDEX_START + i, pos);
    positions.set(MINOR_BODY_NAMES[i], pos);
  }

  // Add comets
  for (let i = 0; i < COMET_NAMES.length; i++) {
    const pos = new THREE.Vector3();
    getBodyPositionInto(buffers, COMET_INDEX_START + i, pos);
    positions.set(COMET_NAMES[i], pos);
  }

  return positions;
}

import { positionToRaDec } from "./geometry/coordinates";
// Re-export so existing imports from this module keep working
export { positionToRaDec };

/**
 * Calculate the angular separation between Sun and Moon for eclipse detection.
 * @param bodyPositions Map of body positions from the engine
 * @returns Angular separation in degrees, or null if positions unavailable
 */
export function calculateSunMoonSeparation(bodyPositions: BodyPositions): number | null {
  const sunPos = bodyPositions.get("Sun");
  const moonPos = bodyPositions.get("Moon");

  if (!sunPos || !moonPos) return null;

  const sunRaDec = positionToRaDec(sunPos);
  const moonRaDec = positionToRaDec(moonPos);

  return getSunMoonSeparation(sunRaDec.ra, sunRaDec.dec, moonRaDec.ra, moonRaDec.dec);
}
