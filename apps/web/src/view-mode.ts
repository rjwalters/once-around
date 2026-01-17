/**
 * View mode management (Geocentric, Topocentric, and Orbital).
 */

import type { ViewMode } from "./settings";

/**
 * Compute Greenwich Mean Sidereal Time (GMST) from a Date.
 * Returns GMST in degrees (0-360).
 */
export function computeGMST(date: Date): number {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525;
  let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) +
             T * T * (0.000387933 - T / 38710000);
  gmst = ((gmst % 360) + 360) % 360;
  return gmst;
}

export interface ViewModeManagerOptions {
  initialMode: ViewMode;
  getObserverLocation: () => { latitude: number; longitude: number };
  getCurrentDate: () => Date;
  onModeChange: (mode: ViewMode) => void;
  onHorizonChange: (visible: boolean) => void;
  onLSTChange: (lstDeg: number) => void;
  setControlsViewMode: (mode: ViewMode) => void;
  setTopocentricParams: (latRad: number, lstRad: number) => void;
  animateToAltAz: (alt: number, az: number, duration: number) => void;
  // Orbital mode callbacks
  onOrbitalModeChange?: (enabled: boolean) => void;
  onScintillationChange?: (enabled: boolean) => void;
  onResetVideoOcclusion?: () => void;
}

export interface ViewModeManager {
  getMode: () => ViewMode;
  setMode: (mode: ViewMode) => void;
  updateTopocentricParams: () => void;
  updateTopocentricParamsForTime: (date: Date) => void;
  setupEventListeners: () => void;
}

/**
 * Create a view mode manager for geocentric/topocentric/orbital switching.
 */
export function createViewModeManager(options: ViewModeManagerOptions): ViewModeManager {
  const {
    initialMode,
    getObserverLocation,
    getCurrentDate,
    onModeChange,
    onHorizonChange,
    onLSTChange,
    setControlsViewMode,
    setTopocentricParams,
    animateToAltAz,
    onOrbitalModeChange,
    onScintillationChange,
    onResetVideoOcclusion,
  } = options;

  let currentMode: ViewMode = initialMode;

  // Get DOM elements
  const geocentricBtn = document.getElementById("view-geocentric");
  const topocentricBtn = document.getElementById("view-topocentric");
  const orbitalBtn = document.getElementById("view-orbital");
  const coordAltAzGroup = document.getElementById("coord-altaz-group");
  const coordRaDecGroup = document.getElementById("coord-radec-group");
  const horizonLabel = document.getElementById("horizon-label");

  function updateTopocentricParamsForTime(date: Date): void {
    const location = getObserverLocation();
    const gmst = computeGMST(date);
    let lst = gmst + location.longitude; // LST in degrees
    lst = ((lst % 360) + 360) % 360; // Normalize to 0-360
    const latRad = (location.latitude * Math.PI) / 180;
    const lstRad = (lst * Math.PI) / 180;
    setTopocentricParams(latRad, lstRad);
    onLSTChange(lst);
  }

  function updateTopocentricParams(): void {
    updateTopocentricParamsForTime(getCurrentDate());
  }

  function updateUI(mode: ViewMode): void {
    geocentricBtn?.classList.toggle("active", mode === 'geocentric');
    topocentricBtn?.classList.toggle("active", mode === 'topocentric');
    orbitalBtn?.classList.toggle("active", mode === 'orbital');

    // Show Alt/Az in topocentric mode, RA/Dec in geocentric and orbital modes
    if (coordAltAzGroup) {
      coordAltAzGroup.style.display = mode === 'topocentric' ? 'inline' : 'none';
    }
    if (coordRaDecGroup) {
      coordRaDecGroup.style.display = mode !== 'topocentric' ? 'inline' : 'none';
    }

    // Update horizon/Earth toggle label based on mode
    if (horizonLabel) {
      horizonLabel.textContent = mode === 'orbital' ? 'Show Earth' : 'Show horizon/ground';
    }

    // Auto-toggle horizon based on mode (only in topocentric)
    onHorizonChange(mode === 'topocentric');
  }

  function setMode(mode: ViewMode): void {
    if (mode === currentMode) return;

    const previousMode = currentMode;
    currentMode = mode;

    // Update topocentric params before switching mode
    updateTopocentricParams();

    // Switch the controls to the new mode
    setControlsViewMode(mode);

    // Update UI
    updateUI(mode);

    // When switching to topocentric, animate to a nice default view
    // Looking south (azimuth 180°) at 30° above the horizon
    if (mode === 'topocentric') {
      animateToAltAz(30, 180, 800);
    }

    // Handle orbital mode changes
    const enteringOrbital = mode === 'orbital';
    const leavingOrbital = previousMode === 'orbital';

    if (enteringOrbital || leavingOrbital) {
      // Toggle orbital mode rendering (Earth, etc.)
      onOrbitalModeChange?.(enteringOrbital);

      // No atmospheric scintillation in space
      onScintillationChange?.(!enteringOrbital);

      // Reset video marker visibility when leaving orbital mode
      if (leavingOrbital) {
        onResetVideoOcclusion?.();
      }
    }

    // Notify of mode change (for saving settings)
    onModeChange(mode);
  }

  function setupEventListeners(): void {
    geocentricBtn?.addEventListener("click", () => setMode('geocentric'));
    topocentricBtn?.addEventListener("click", () => setMode('topocentric'));
    orbitalBtn?.addEventListener("click", () => setMode('orbital'));
  }

  // Initialize
  updateTopocentricParams();
  if (currentMode === 'topocentric') {
    setControlsViewMode('topocentric');
  } else if (currentMode === 'orbital') {
    setControlsViewMode('orbital');
    onOrbitalModeChange?.(true);
    onScintillationChange?.(false);
  }
  updateUI(currentMode);

  return {
    getMode: () => currentMode,
    setMode,
    updateTopocentricParams,
    updateTopocentricParamsForTime,
    setupEventListeners,
  };
}
