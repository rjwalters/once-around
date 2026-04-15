/**
 * Renderer Coordinate Utilities
 *
 * WASM/Rust buffer marshaling functions specific to the renderer.
 * Pure coordinate conversions live in geometry/coordinates.ts.
 */

import * as THREE from "three";

// Re-export raDecToPosition so renderer layer imports keep working
export { raDecToPosition } from "../../geometry/coordinates";

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
 */
export function rustToThreeJS(rustX: number, rustY: number, rustZ: number, scale: number = 1): THREE.Vector3 {
  return new THREE.Vector3(
    -rustX * scale,
    rustZ * scale,
    rustY * scale
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
