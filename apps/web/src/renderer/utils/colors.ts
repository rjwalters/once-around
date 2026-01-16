/**
 * Color Utilities
 *
 * Functions for converting stellar B-V color indices to RGB colors,
 * and other color-related utilities.
 */

import * as THREE from "three";
import { DSO_COLORS, type DSOType } from "../../dsoData";
import { POINT_SOURCE_MIN_SIZE_PX } from "../constants";

/**
 * Convert B-V color index to RGB color.
 * B-V ranges from about -0.4 (hot blue stars) to +2.0 (cool red stars).
 * @param bv - B-V color index
 * @returns THREE.Color with appropriate stellar color
 */
export function bvToColor(bv: number): THREE.Color {
  bv = Math.max(-0.4, Math.min(2.0, bv));

  let r: number, g: number, b: number;

  if (bv < -0.1) {
    // Hot blue-white stars (O/B type): Rigel, Spica
    const t = (bv + 0.4) / 0.3;
    r = 0.5 + 0.35 * t;
    g = 0.6 + 0.3 * t;
    b = 1.0;
  } else if (bv < 0.3) {
    // White/blue-white stars (A type): Sirius, Vega
    const t = (bv + 0.1) / 0.4;
    r = 0.85 + 0.15 * t;
    g = 0.9 + 0.1 * t;
    b = 1.0;
  } else if (bv < 0.6) {
    // Yellow-white stars (F type): Procyon, Canopus
    const t = (bv - 0.3) / 0.3;
    r = 1.0;
    g = 1.0 - 0.05 * t;
    b = 0.95 - 0.15 * t;
  } else if (bv < 0.8) {
    // Yellow stars (G type): Sun, Capella
    const t = (bv - 0.6) / 0.2;
    r = 1.0;
    g = 0.95 - 0.1 * t;
    b = 0.8 - 0.2 * t;
  } else if (bv < 1.2) {
    // Orange stars (K type): Arcturus, Aldebaran
    const t = (bv - 0.8) / 0.4;
    r = 1.0;
    g = 0.85 - 0.25 * t;
    b = 0.6 - 0.35 * t;
  } else {
    // Red stars (M type): Betelgeuse, Antares
    const t = Math.min(1.0, (bv - 1.2) / 0.8);
    r = 1.0;
    g = 0.6 - 0.25 * t;
    b = 0.25 - 0.15 * t;
  }

  return new THREE.Color(r, g, b);
}

/**
 * Optimized version that writes directly to a Color object.
 * Avoids allocation overhead when processing many stars.
 * @param bv - B-V color index
 * @param color - THREE.Color object to write to
 */
export function bvToColorInPlace(bv: number, color: THREE.Color): void {
  bv = Math.max(-0.4, Math.min(2.0, bv));

  let r: number, g: number, b: number;

  if (bv < -0.1) {
    const t = (bv + 0.4) / 0.3;
    r = 0.5 + 0.35 * t;
    g = 0.6 + 0.3 * t;
    b = 1.0;
  } else if (bv < 0.3) {
    const t = (bv + 0.1) / 0.4;
    r = 0.85 + 0.15 * t;
    g = 0.9 + 0.1 * t;
    b = 1.0;
  } else if (bv < 0.6) {
    const t = (bv - 0.3) / 0.3;
    r = 1.0;
    g = 1.0 - 0.05 * t;
    b = 0.95 - 0.15 * t;
  } else if (bv < 0.8) {
    const t = (bv - 0.6) / 0.2;
    r = 1.0;
    g = 0.95 - 0.1 * t;
    b = 0.8 - 0.2 * t;
  } else if (bv < 1.2) {
    const t = (bv - 0.8) / 0.4;
    r = 1.0;
    g = 0.85 - 0.25 * t;
    b = 0.6 - 0.35 * t;
  } else {
    const t = Math.min(1.0, (bv - 1.2) / 0.8);
    r = 1.0;
    g = 0.6 - 0.25 * t;
    b = 0.25 - 0.15 * t;
  }

  color.setRGB(r, g, b);
}

/**
 * Convert DSO type to color.
 * @param type - DSO type (galaxy, nebula, cluster, etc.)
 * @returns THREE.Color for the DSO type
 */
export function getDSOColor(type: DSOType): THREE.Color {
  const hex = DSO_COLORS[type];
  return new THREE.Color(hex);
}

/**
 * Convert angular size in arcseconds to pixels based on FOV and canvas height.
 * @param arcsec - Angular size in arcseconds
 * @param fovDegrees - Field of view in degrees
 * @param canvasHeight - Canvas height in pixels
 * @returns Size in pixels
 */
export function angularSizeToPixels(arcsec: number, fovDegrees: number, canvasHeight: number): number {
  const fovArcsec = fovDegrees * 3600;
  return Math.max(POINT_SOURCE_MIN_SIZE_PX, (arcsec / fovArcsec) * canvasHeight);
}

/**
 * Calculate DSO angular size in pixels based on arcminutes and FOV.
 * @param sizeArcmin - DSO size in arcminutes
 * @param fovDegrees - Field of view in degrees
 * @param canvasHeight - Canvas height in pixels
 * @returns Size in pixels
 */
export function dsoSizeToPixels(sizeArcmin: number, fovDegrees: number, canvasHeight: number): number {
  const sizeArcsec = sizeArcmin * 60;
  const fovArcsec = fovDegrees * 3600;
  return (sizeArcsec / fovArcsec) * canvasHeight;
}

/**
 * Deterministic hash for star ID - produces a value 0-1.
 * Used for LOD sampling to ensure consistent star visibility.
 * @param id - Star HR number
 * @returns Hash value between 0 and 1
 */
export function starIdHash(id: number): number {
  // Simple hash using prime multiplication and bit operations
  let h = id * 2654435761;
  h = ((h >>> 16) ^ h) * 2246822519;
  h = ((h >>> 16) ^ h);
  return (h >>> 0) / 4294967295; // Convert to 0-1 range
}
