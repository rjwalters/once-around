/**
 * Label Utilities
 *
 * Functions for positioning labels on the celestial sphere.
 */

import * as THREE from "three";

// Pre-allocated vectors for calculateLabelOffsetInPlace to avoid GC pressure
const _radial = new THREE.Vector3();
const _east = new THREE.Vector3();
const _down = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

/**
 * Calculate label offset position on sphere surface.
 * Returns position offset "downward" (toward south celestial pole) from the object.
 * @param objectPos - Position of the object on the sky sphere
 * @param offset - Distance to offset the label
 * @returns New position for the label
 */
export function calculateLabelOffset(objectPos: THREE.Vector3, offset: number): THREE.Vector3 {
  const radial = objectPos.clone().normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);

  // Calculate "east" direction (perpendicular to radial and up)
  const east = new THREE.Vector3().crossVectors(worldUp, radial);

  // Handle case where object is at celestial poles
  if (east.lengthSq() < 0.001) {
    east.set(1, 0, 0);
  }
  east.normalize();

  // Calculate "down" direction on sphere surface (toward south)
  const down = new THREE.Vector3().crossVectors(radial, east).normalize();

  // Offset position, then re-project to sphere
  const labelPos = objectPos.clone().add(down.multiplyScalar(offset));
  const radius = objectPos.length();
  return labelPos.normalize().multiplyScalar(radius);
}

/**
 * Optimized version that writes directly to a result vector.
 * Avoids allocation overhead when processing many labels.
 * @param objectPos - Position of the object on the sky sphere
 * @param offset - Distance to offset the label
 * @param result - Vector to write the result to
 */
export function calculateLabelOffsetInPlace(objectPos: THREE.Vector3, offset: number, result: THREE.Vector3): void {
  _radial.copy(objectPos).normalize();

  // Calculate "east" direction (perpendicular to radial and up)
  _east.crossVectors(_worldUp, _radial);

  // Handle case where object is at celestial poles
  if (_east.lengthSq() < 0.001) {
    _east.set(1, 0, 0);
  }
  _east.normalize();

  // Calculate "down" direction on sphere surface (toward south)
  _down.crossVectors(_radial, _east).normalize();

  // Offset position, then re-project to sphere
  result.copy(objectPos).addScaledVector(_down, offset);
  const radius = objectPos.length();
  result.normalize().multiplyScalar(radius);
}
