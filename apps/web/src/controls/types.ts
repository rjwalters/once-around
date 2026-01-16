/**
 * Camera Controls Types
 *
 * Interfaces and types for celestial camera controls.
 */

import * as THREE from "three";

/**
 * Camera state for persistence.
 */
export interface CameraState {
  quaternion: { x: number; y: number; z: number; w: number };
  fov: number;
}

/**
 * View mode type.
 * - geocentric: Observer at Earth's center, RA/Dec navigation, stars fixed
 * - topocentric: Observer on Earth's surface, Alt/Az navigation, horizon fixed
 */
export type ViewMode = "geocentric" | "topocentric";

/**
 * Celestial camera controls - simple drag-to-rotate model.
 *
 * Dragging the mouse rotates the view proportionally to the drag distance.
 * Uses quaternion-based rotation to avoid pole singularities in geocentric mode.
 * In topocentric mode, navigation is in Alt/Az coordinates with horizon always level.
 */
export interface CelestialControls {
  update(): void;
  dispose(): void;
  lookAtRaDec(ra: number, dec: number): void;
  animateToRaDec(ra: number, dec: number, durationMs?: number): void;
  getCameraState(): CameraState;
  setCameraState(state: CameraState): void;
  getRaDec(): { ra: number; dec: number };
  setQuaternion(quaternion: THREE.Quaternion): void;
  setEnabled(enabled: boolean): void;
  // Topocentric mode methods
  setViewMode(mode: ViewMode): void;
  getViewMode(): ViewMode;
  setTopocentricParams(latitudeRad: number, lstRad: number): void;
  getAltAz(): { altitude: number; azimuth: number } | null;
  animateToAltAz(altitude: number, azimuth: number, durationMs?: number): void;
  onFovChange?: (fov: number) => void;
  onCameraChange?: () => void;
}
