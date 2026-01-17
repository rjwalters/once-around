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
  "C/2020 F3 NEOWISE", "C/2023 A3 T-ATLAS", "C/1995 O1 Hale-Bopp"
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

/**
 * Build a map of body names to their current 3D positions.
 */
export function getBodyPositions(buffers: BodyPositionBuffers): BodyPositions {
  const { bodies, minorBodies, comets } = buffers;
  const positions: BodyPositions = new Map();
  // Use SKY_RADIUS - 0.5 to match video marker positioning
  const radius = SKY_RADIUS - 0.5;

  // Add major bodies (Sun, Moon, planets)
  for (let i = 0; i < BODY_NAMES.length; i++) {
    // Rust coords: X → RA=0, Y → RA=90°, Z → north pole
    const rustX = bodies[i * 3];
    const rustY = bodies[i * 3 + 1];
    const rustZ = bodies[i * 3 + 2];
    // Convert to Three.js coords: negate X for east-west fix, swap Y/Z for Y-up
    const pos = new THREE.Vector3(-rustX, rustZ, rustY).normalize().multiplyScalar(radius);
    positions.set(BODY_NAMES[i], pos);
  }

  // Add minor bodies (Pluto, dwarf planets)
  // Minor bodies buffer: 4 floats per body (x, y, z, angular_diameter)
  for (let i = 0; i < MINOR_BODY_NAMES.length; i++) {
    const rustX = minorBodies[i * 4];
    const rustY = minorBodies[i * 4 + 1];
    const rustZ = minorBodies[i * 4 + 2];
    // Convert to Three.js coords: negate X for east-west fix, swap Y/Z for Y-up
    const pos = new THREE.Vector3(-rustX, rustZ, rustY).normalize().multiplyScalar(radius);
    positions.set(MINOR_BODY_NAMES[i], pos);
  }

  // Add comets
  // Comets buffer: 4 floats per comet (x, y, z, magnitude)
  for (let i = 0; i < COMET_NAMES.length; i++) {
    const rustX = comets[i * 4];
    const rustY = comets[i * 4 + 1];
    const rustZ = comets[i * 4 + 2];
    // Convert to Three.js coords: negate X for east-west fix, swap Y/Z for Y-up
    const pos = new THREE.Vector3(-rustX, rustZ, rustY).normalize().multiplyScalar(radius);
    positions.set(COMET_NAMES[i], pos);
  }

  return positions;
}

/**
 * Convert a 3D position (Three.js coordinates) to RA/Dec in degrees.
 * Three.js uses Y-up: X→RA=0°, Y→North pole, Z→RA=90°
 * Accepts either THREE.Vector3 or a plain { x, y, z } object.
 */
export function positionToRaDec(pos: Position3D): { ra: number; dec: number } {
  // Normalize the position manually (works with plain objects or Vector3)
  const len = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
  const nx = pos.x / len;
  const ny = pos.y / len;
  const nz = pos.z / len;

  // Dec is the angle from the equatorial plane (Y component)
  const dec = Math.asin(ny) * (180 / Math.PI);

  // RA is the angle in the XZ plane (X is negated for east-west fix)
  let ra = Math.atan2(nz, -nx) * (180 / Math.PI);
  if (ra < 0) ra += 360;

  return { ra, dec };
}

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
