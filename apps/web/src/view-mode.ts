/**
 * View mode management (Geocentric, Topocentric, Hubble, and JWST).
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
  // Space telescope mode callbacks
  onHubbleModeChange?: (enabled: boolean) => void;
  onJWSTModeChange?: (enabled: boolean) => void;
  onScintillationChange?: (enabled: boolean) => void;
  onResetVideoOcclusion?: () => void;
}

/** Display info for the tour view indicator */
export interface ViewIndicatorInfo {
  label: string;
  icon: string;  // Emoji or HTML for icon
}

export interface ViewModeManager {
  getMode: () => ViewMode;
  setMode: (mode: ViewMode) => void;
  updateTopocentricParams: () => void;
  updateTopocentricParamsForTime: (date: Date) => void;
  setupEventListeners: () => void;
  /** Lock view mode (disable buttons), set to specified mode, return previous mode */
  lockAndSetMode: (mode: ViewMode) => ViewMode;
  /** Unlock view mode (enable buttons) and restore to specified mode */
  unlockAndRestoreMode: (mode: ViewMode) => void;
  /** Check if view mode is currently locked */
  isLocked: () => boolean;
  /** Set the tour view indicator display (only shown when locked) */
  setIndicatorLabel: (info: ViewIndicatorInfo | null) => void;
}

/**
 * Create a view mode manager for geocentric/topocentric/hubble/jwst switching.
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
    onHubbleModeChange,
    onJWSTModeChange,
    onScintillationChange,
    onResetVideoOcclusion,
  } = options;

  let currentMode: ViewMode = initialMode;
  let locked = false;

  // Get DOM elements
  const geocentricBtn = document.getElementById("view-geocentric");
  const topocentricBtn = document.getElementById("view-topocentric");
  const hubbleBtn = document.getElementById("view-hubble");
  const jwstBtn = document.getElementById("view-jwst");
  const coordAltAzGroup = document.getElementById("coord-altaz-group");
  const coordRaDecGroup = document.getElementById("coord-radec-group");
  const horizonLabel = document.getElementById("horizon-label");

  // Tour indicator elements
  const viewModeSection = document.querySelector(".view-mode-section");
  const viewModeToggle = document.querySelector(".view-mode-toggle");
  const tourIndicator = document.getElementById("tour-view-indicator");
  const indicatorIcon = tourIndicator?.querySelector(".indicator-icon");
  const indicatorLabel = tourIndicator?.querySelector(".indicator-label");

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
    hubbleBtn?.classList.toggle("active", mode === 'hubble');
    jwstBtn?.classList.toggle("active", mode === 'jwst');

    // Show Alt/Az in topocentric mode, RA/Dec in other modes
    if (coordAltAzGroup) {
      coordAltAzGroup.style.display = mode === 'topocentric' ? 'inline' : 'none';
    }
    if (coordRaDecGroup) {
      coordRaDecGroup.style.display = mode !== 'topocentric' ? 'inline' : 'none';
    }

    // Update horizon/Earth toggle label based on mode
    if (horizonLabel) {
      if (mode === 'hubble') {
        horizonLabel.textContent = 'Show Earth';
      } else if (mode === 'jwst') {
        horizonLabel.textContent = 'Show Sun/Earth';
      } else {
        horizonLabel.textContent = 'Show horizon/ground';
      }
    }

    // Auto-toggle horizon based on mode (only in topocentric)
    onHorizonChange(mode === 'topocentric');
  }

  function updateButtonsDisabled(): void {
    const buttons = [geocentricBtn, topocentricBtn, hubbleBtn, jwstBtn];
    for (const btn of buttons) {
      if (btn) {
        if (locked) {
          btn.setAttribute('disabled', 'true');
          btn.classList.add('locked');
        } else {
          btn.removeAttribute('disabled');
          btn.classList.remove('locked');
        }
      }
    }
  }

  // Icon mappings for view modes (matching the button icons)
  const VIEW_MODE_ICONS: Record<ViewMode, string> = {
    geocentric: '\u{1F310}',  // Globe emoji
    topocentric: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor"><rect x="0" y="14" width="24" height="3"/><circle cx="6" cy="6" r="1.5"/><circle cx="12" cy="9" r="1"/><circle cx="18" cy="4" r="1.2"/><circle cx="15" cy="7" r="0.8"/></svg>',
    hubble: '\u{1F6F0}',  // Satellite emoji
    jwst: '\u2B21',  // Hexagon
  };

  const VIEW_MODE_LABELS: Record<ViewMode, string> = {
    geocentric: 'Geocentric',
    topocentric: 'Topocentric',
    hubble: 'Hubble',
    jwst: 'JWST',
  };

  function getDefaultIndicatorInfo(mode: ViewMode): ViewIndicatorInfo {
    return {
      label: VIEW_MODE_LABELS[mode],
      icon: VIEW_MODE_ICONS[mode],
    };
  }

  function updateIndicatorDisplay(info: ViewIndicatorInfo): void {
    if (indicatorIcon) {
      indicatorIcon.innerHTML = info.icon;
    }
    if (indicatorLabel) {
      indicatorLabel.textContent = info.label;
    }
  }

  function showTourIndicator(): void {
    viewModeSection?.classList.add('tour-active');
    if (viewModeToggle instanceof HTMLElement) {
      viewModeToggle.style.display = 'none';
    }
    tourIndicator?.classList.remove('hidden');
    // Set default indicator based on current mode
    updateIndicatorDisplay(getDefaultIndicatorInfo(currentMode));
  }

  function hideTourIndicator(): void {
    viewModeSection?.classList.remove('tour-active');
    if (viewModeToggle instanceof HTMLElement) {
      viewModeToggle.style.display = '';
    }
    tourIndicator?.classList.add('hidden');
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

    // Handle space telescope mode changes
    const enteringHubble = mode === 'hubble';
    const leavingHubble = previousMode === 'hubble';
    const enteringJWST = mode === 'jwst';
    const leavingJWST = previousMode === 'jwst';
    const enteringSpace = enteringHubble || enteringJWST;
    const leavingSpace = (leavingHubble || leavingJWST) && !enteringSpace;

    if (enteringHubble || leavingHubble) {
      // Toggle Hubble mode rendering (Earth sphere, etc.)
      onHubbleModeChange?.(enteringHubble);
    }

    if (enteringJWST || leavingJWST) {
      // Toggle JWST mode rendering (distant Sun/Earth/Moon dots, etc.)
      onJWSTModeChange?.(enteringJWST);
    }

    if (enteringSpace || leavingSpace) {
      // No atmospheric scintillation in space
      onScintillationChange?.(!enteringSpace);

      // Reset video marker visibility when leaving space modes
      if (leavingSpace) {
        onResetVideoOcclusion?.();
      }
    }

    // Notify of mode change (for saving settings)
    onModeChange(mode);
  }

  function setupEventListeners(): void {
    geocentricBtn?.addEventListener("click", () => {
      if (!locked) setMode('geocentric');
    });
    topocentricBtn?.addEventListener("click", () => {
      if (!locked) setMode('topocentric');
    });
    hubbleBtn?.addEventListener("click", () => {
      if (!locked) setMode('hubble');
    });
    jwstBtn?.addEventListener("click", () => {
      if (!locked) setMode('jwst');
    });
  }

  function lockAndSetMode(mode: ViewMode): ViewMode {
    const previousMode = currentMode;
    locked = true;
    updateButtonsDisabled();
    showTourIndicator();
    if (mode !== currentMode) {
      setMode(mode);
    }
    return previousMode;
  }

  function unlockAndRestoreMode(mode: ViewMode): void {
    locked = false;
    updateButtonsDisabled();
    hideTourIndicator();
    if (mode !== currentMode) {
      setMode(mode);
    }
  }

  function setIndicatorLabel(info: ViewIndicatorInfo | null): void {
    if (!locked) return;  // Only update when locked (during tour)
    if (info) {
      updateIndicatorDisplay(info);
    } else {
      // Reset to default based on current mode
      updateIndicatorDisplay(getDefaultIndicatorInfo(currentMode));
    }
  }

  function isLocked(): boolean {
    return locked;
  }

  // Initialize
  updateTopocentricParams();
  if (currentMode === 'topocentric') {
    setControlsViewMode('topocentric');
  } else if (currentMode === 'hubble') {
    setControlsViewMode('hubble');
    onHubbleModeChange?.(true);
    onScintillationChange?.(false);
  } else if (currentMode === 'jwst') {
    setControlsViewMode('jwst');
    onJWSTModeChange?.(true);
    onScintillationChange?.(false);
  }
  updateUI(currentMode);

  return {
    getMode: () => currentMode,
    setMode,
    updateTopocentricParams,
    updateTopocentricParamsForTime,
    setupEventListeners,
    lockAndSetMode,
    unlockAndRestoreMode,
    isLocked,
    setIndicatorLabel,
  };
}
