/**
 * Coordinate display management - RA/Dec, Alt/Az, FOV, and reference circle.
 */

import { formatRA, formatDec, formatAltitude, formatAzimuth, formatFOV } from "./coordinate-utils";

// Reference circle size in arcseconds
const REFERENCE_ARCSEC = 50;

// Throttle interval for coordinate updates
const COORD_UPDATE_INTERVAL = 100; // ms - update at most 10 times per second

export interface CoordinateDisplayOptions {
  getViewMode: () => 'geocentric' | 'topocentric';
  getCameraState: () => { fov: number };
  getRaDec: () => { ra: number; dec: number };
  getAltAz: () => { altitude: number; azimuth: number } | null;
  onCameraChange: (callback: () => void) => void;
}

export interface CoordinateDisplay {
  update: () => void;
  updateImmediate: () => void;
}

/**
 * Create coordinate display manager.
 */
export function createCoordinateDisplay(options: CoordinateDisplayOptions): CoordinateDisplay {
  const { getViewMode, getCameraState, getRaDec, getAltAz, onCameraChange } = options;

  // Get DOM elements
  const coordRaEl = document.getElementById("coord-ra");
  const coordDecEl = document.getElementById("coord-dec");
  const coordFovEl = document.getElementById("coord-fov");
  const coordAltEl = document.getElementById("coord-alt");
  const coordAzEl = document.getElementById("coord-az");
  const referenceCircle = document.getElementById("reference-circle");

  // Throttle state
  let lastUpdateTime = 0;
  let updatePending = false;

  function updateReferenceCircle(fov: number): void {
    if (!referenceCircle) return;

    // Only show when zoomed in enough for it to be useful
    if (fov > 5) {
      referenceCircle.style.display = "none";
      return;
    }

    // Calculate circle size in pixels
    // FOV is the vertical field of view in degrees
    // Reference is in arcseconds, FOV in degrees (1 deg = 3600 arcsec)
    const fovArcsec = fov * 3600;
    const canvasHeight = window.innerHeight;
    const circlePx = (REFERENCE_ARCSEC / fovArcsec) * canvasHeight;

    // Show the circle and set its size
    referenceCircle.style.display = "block";
    referenceCircle.style.width = `${circlePx}px`;
    referenceCircle.style.height = `${circlePx}px`;
  }

  function updateImmediate(): void {
    lastUpdateTime = performance.now();
    const { fov } = getCameraState();

    // Update coordinates based on current view mode
    if (getViewMode() === 'topocentric') {
      // Show Alt/Az in topocentric mode
      const altAz = getAltAz();
      if (altAz) {
        if (coordAltEl) coordAltEl.textContent = formatAltitude(altAz.altitude);
        if (coordAzEl) coordAzEl.textContent = formatAzimuth(altAz.azimuth);
      }
    } else {
      // Show RA/Dec in geocentric mode
      const { ra, dec } = getRaDec();
      if (coordRaEl) coordRaEl.textContent = formatRA(ra);
      if (coordDecEl) coordDecEl.textContent = formatDec(dec);
    }

    // Update FOV display
    if (coordFovEl) {
      coordFovEl.textContent = formatFOV(fov);
    }
    updateReferenceCircle(fov);
  }

  function update(): void {
    const now = performance.now();
    if (now - lastUpdateTime < COORD_UPDATE_INTERVAL) {
      // Schedule update if not already pending
      if (!updatePending) {
        updatePending = true;
        requestAnimationFrame(() => {
          updatePending = false;
          updateImmediate();
        });
      }
      return;
    }
    updateImmediate();
  }

  // Update coordinates initially
  updateImmediate();

  // Update coordinates on camera change (throttled)
  onCameraChange(update);

  return {
    update,
    updateImmediate,
  };
}
