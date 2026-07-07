import { createTourEngine, type TourPlaybackState, type TargetBody, type TourViewpoint, type StarOverride } from "./tour";
import { getSpacecraftPosition } from "./spacecraftPositions";
import { applyTimeToEngine } from "./ui";
import type { SkyEngine } from "./wasm/sky_engine";
import {
  positionToRaDec,
  calculateSunMoonSeparation,
  type BodyPositions,
} from "./body-positions";
import { createThrottleGate } from "./throttle-gate";
import type { ViewIndicatorInfo } from "./view-mode";

/**
 * Max engine-update rate during animated tour transitions. ~15Hz (67ms) keeps
 * `engine.recompute()` + `renderer.updateFromEngine()` off the 60fps hot path
 * while remaining visually indistinguishable for a sub-second time sweep. The
 * camera slerp is independent and continues at full frame rate.
 */
const TOUR_ENGINE_THROTTLE_MS = 67;

/**
 * Delay before applying `updateDSOs` after the last FOV change during a tour's
 * FOV animation. Mirrors the 150ms zoom-debounce in main.ts so star LOD is only
 * recomputed once the zoom settles instead of every transition frame.
 */
const TOUR_FOV_DEBOUNCE_MS = 150;

// Display names and icons for spacecraft in tour viewpoints
const SPACECRAFT_DISPLAY: Record<string, ViewIndicatorInfo> = {
  voyager1: { label: 'Voyager 1', icon: '\u{1F6F0}' },  // Satellite emoji
  voyager2: { label: 'Voyager 2', icon: '\u{1F6F0}' },
};

// Map from tour target names to body/comet names in the position buffer
const TARGET_TO_NAME: Record<TargetBody, string> = {
  sun: "Sun",
  moon: "Moon",
  mercury: "Mercury",
  venus: "Venus",
  mars: "Mars",
  jupiter: "Jupiter",
  saturn: "Saturn",
  uranus: "Uranus",
  neptune: "Neptune",
  // Comets (names must match COMET_NAMES)
  halley: "1P/Halley",
  encke: "2P/Encke",
  "churyumov-gerasimenko": "67P/C-G",
  wirtanen: "46P/Wirtanen",
  neowise: "C/2020 F3 NEOWISE",
  "tsuchinshan-atlas": "C/2023 A3 T-ATLAS",
  "hale-bopp": "C/1995 O1 Hale-Bopp",
  "great-comet-1811": "C/1811 F1 (1811)",
  "ikeya-seki": "C/1965 S1 Ikeya-Seki",
};

export interface TourSetupDependencies {
  engine: SkyEngine;
  renderer: {
    camera: { fov: number; updateProjectionMatrix: () => void };
    updateFromEngine: (engine: SkyEngine, fov: number) => void;
    updateEclipse: (separation: number) => void;
    updateDSOs: (fov: number, mag: number) => void;
    setStarOverrides: (overrides: StarOverride[]) => void;
    clearStarOverrides: () => void;
    setRemoteViewpoint: (x: number, y: number, z: number, distanceAU: number) => void;
    clearRemoteViewpoint: () => void;
  };
  controls: {
    animateToRaDec: (ra: number, dec: number, durationMs: number) => void;
  };
  getViewModeManager: () => {
    getMode: () => 'geocentric' | 'topocentric' | 'hubble' | 'jwst';
    lockAndSetMode: (mode: 'geocentric' | 'topocentric' | 'hubble' | 'jwst') => 'geocentric' | 'topocentric' | 'hubble' | 'jwst';
    unlockAndRestoreMode: (mode: 'geocentric' | 'topocentric' | 'hubble' | 'jwst') => void;
    setIndicatorLabel: (info: ViewIndicatorInfo | null) => void;
  } | null;
  getBodyPositions: () => BodyPositions;
  getCurrentDate: () => Date;
  getLocationManager: () => {
    getLocation: () => { latitude: number; longitude: number; name?: string };
    setLocation: (location: { latitude: number; longitude: number; name?: string }) => void;
  } | null;
  getDefaultLocation: () => { latitude: number; longitude: number };
  getMagnitude: () => number;
}

export interface TourSetupResult {
  tourEngine: ReturnType<typeof createTourEngine>;
  updateTourUI: (state: TourPlaybackState) => void;
  handleTourInterrupt: () => void;
  setTimeForTour: (date: Date, force?: boolean) => void;
}

export function setupTourSystem(deps: TourSetupDependencies): TourSetupResult {
  const {
    engine,
    renderer,
    controls,
    getViewModeManager,
    getBodyPositions,
    getCurrentDate,
    getLocationManager,
    getDefaultLocation,
    getMagnitude,
  } = deps;

  // Throttle expensive engine work during animated transitions to ~15Hz. The
  // camera slerp runs independently at full frame rate (see tour.ts update()).
  const engineUpdateGate = createThrottleGate(TOUR_ENGINE_THROTTLE_MS);

  // Cache the datetime input element (previously queried on every frame).
  // Looked up lazily and retried until found so it survives being called before
  // the DOM node exists.
  let datetimeInput: HTMLInputElement | null = null;
  function getDatetimeInput(): HTMLInputElement | null {
    if (!datetimeInput) {
      datetimeInput = document.getElementById("datetime") as HTMLInputElement | null;
    }
    return datetimeInput;
  }
  function writeDatetimeInput(date: Date): void {
    const input = getDatetimeInput();
    if (!input) return;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    input.value = `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  // Helper to update time and trigger all necessary updates.
  //
  // During an animated transition this is called every rAF; the throttle gate
  // caps the full recompute + scene rebuild to ~15Hz. `force = true` bypasses
  // the throttle and MUST be used for discrete/terminal sets (instant time mode
  // and the exact final keyframe time at t >= 1) so engine time never lingers
  // on a stale throttle step. The datetime input is only written on forced
  // updates — updating it mid-transition is not user-visible.
  function setTimeForTour(date: Date, force = false): void {
    if (!engineUpdateGate.shouldRun(performance.now(), force)) {
      return;
    }

    applyTimeToEngine(engine, date);
    engine.recompute();
    renderer.updateFromEngine(engine, renderer.camera.fov);

    if (force) {
      // Reflect the settled time in the datetime input at transition end.
      writeDatetimeInput(date);
    }

    // Update eclipse rendering (throttled to the same cadence).
    const bodyPos = getBodyPositions();
    const sunMoonSep = calculateSunMoonSeparation(bodyPos);
    if (sunMoonSep !== null) {
      renderer.updateEclipse(sunMoonSep);
    }
  }

  // Update tour UI based on state
  function updateTourUI(state: TourPlaybackState): void {
    const playbackEl = document.getElementById("tour-playback");
    const progressEl = document.getElementById("tour-progress");
    const nameEl = document.getElementById("tour-playback-name");
    const playPauseBtn = document.getElementById("tour-play-pause");

    if (playbackEl) {
      playbackEl.classList.toggle("hidden", state.status === "idle");
    }
    if (progressEl) {
      progressEl.style.width = `${state.overallProgress * 100}%`;
    }
    if (nameEl && state.currentTour) {
      nameEl.textContent = state.currentTour.name;
    }
    if (playPauseBtn) {
      playPauseBtn.textContent = state.status === "playing" ? "⏸" : "▶";
    }
  }

  // Debounced star LOD update for FOV animation. updateDSOs is expensive, so
  // during a continuous FOV sweep defer it until the zoom settles (trailing
  // edge, ~150ms) rather than running it every transition frame. Mirrors the
  // debouncedFovUpdate pattern in main.ts.
  let fovUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
  let pendingDso: { fov: number; mag: number } | null = null;
  function debouncedUpdateDSOs(fov: number, mag: number): void {
    pendingDso = { fov, mag };
    if (fovUpdateTimeout === null) {
      fovUpdateTimeout = setTimeout(() => {
        if (pendingDso !== null) {
          renderer.updateDSOs(pendingDso.fov, pendingDso.mag);
        }
        fovUpdateTimeout = null;
        pendingDso = null;
      }, TOUR_FOV_DEBOUNCE_MS);
    }
  }

  // Create tour engine
  const tourEngine = createTourEngine({
    animateToRaDec: (ra, dec, durationMs) => {
      controls.animateToRaDec(ra, dec, durationMs);
    },
    setFov: (fov) => {
      // Camera FOV / projection updates are cheap and stay un-debounced so the
      // zoom itself is smooth; only the star-LOD recompute is deferred.
      renderer.camera.fov = fov;
      renderer.camera.updateProjectionMatrix();
      const mag = getMagnitude();
      debouncedUpdateDSOs(fov, mag);
    },
    getFov: () => renderer.camera.fov,
    setTime: setTimeForTour,
    resolveBodyPosition: (target: TargetBody, datetime: Date) => {
      // Temporarily set engine time to compute body position at keyframe datetime
      const savedTime = new Date(getCurrentDate());

      // Set engine to keyframe time
      engine.set_time_utc(
        datetime.getUTCFullYear(),
        datetime.getUTCMonth() + 1,
        datetime.getUTCDate(),
        datetime.getUTCHours(),
        datetime.getUTCMinutes(),
        datetime.getUTCSeconds()
      );
      engine.recompute();

      // Get body position by name (works for both planets and comets)
      const bodyName = TARGET_TO_NAME[target];
      const bodyPos = getBodyPositions();
      const pos = bodyPos.get(bodyName);

      // Restore original time
      engine.set_time_utc(
        savedTime.getUTCFullYear(),
        savedTime.getUTCMonth() + 1,
        savedTime.getUTCDate(),
        savedTime.getUTCHours(),
        savedTime.getUTCMinutes(),
        savedTime.getUTCSeconds()
      );
      engine.recompute();

      if (!pos) {
        console.error(`Could not find position for body: ${target}`);
        return { ra: 0, dec: 0 };
      }

      return positionToRaDec(pos);
    },
    setLocation: (latitude: number, longitude: number, name?: string) => {
      const locationManager = getLocationManager();
      if (locationManager) {
        locationManager.setLocation({ latitude, longitude, name });
      }
    },
    getLocation: () => {
      const locationManager = getLocationManager();
      if (locationManager) {
        return locationManager.getLocation();
      }
      return getDefaultLocation();
    },
    onStateChange: (state: TourPlaybackState) => {
      updateTourUI(state);
    },
    onTourComplete: () => {
      console.log("Tour complete");
    },
    onCaptionChange: (caption: string | null) => {
      const captionEl = document.getElementById("tour-caption");
      if (captionEl) {
        captionEl.textContent = caption ?? "";
        captionEl.classList.toggle("hidden", !caption);
      }
    },
    setStarOverrides: (overrides) => {
      renderer.setStarOverrides(overrides);
    },
    clearStarOverrides: () => {
      renderer.clearStarOverrides();
    },
    setViewpoint: (viewpoint: TourViewpoint, date: Date) => {
      const mgr = getViewModeManager();
      if (viewpoint.type === 'spacecraft' && viewpoint.spacecraft) {
        // Look up spacecraft position
        const pos = getSpacecraftPosition(viewpoint.spacecraft, date);
        if (pos) {
          renderer.setRemoteViewpoint(pos.x, pos.y, pos.z, pos.distanceAU);
        } else {
          console.warn(`No position data for spacecraft ${viewpoint.spacecraft} on ${date.toISOString()}`);
        }
        // Update indicator to show spacecraft name
        const displayInfo = SPACECRAFT_DISPLAY[viewpoint.spacecraft];
        if (displayInfo && mgr) {
          mgr.setIndicatorLabel(displayInfo);
        }
      } else if (viewpoint.type === 'coordinates' && viewpoint.position) {
        // Use explicit coordinates
        const distance = viewpoint.distanceAU ?? Math.sqrt(
          viewpoint.position.x ** 2 +
          viewpoint.position.y ** 2 +
          viewpoint.position.z ** 2
        );
        renderer.setRemoteViewpoint(
          viewpoint.position.x,
          viewpoint.position.y,
          viewpoint.position.z,
          distance
        );
        // For arbitrary coordinates, show generic "Remote" label
        mgr?.setIndicatorLabel({ label: 'Remote', icon: '\u{1F30C}' });  // Milky Way emoji
      } else if (viewpoint.type === 'geocentric') {
        // Geocentric means Earth-centered, clear any remote viewpoint
        renderer.clearRemoteViewpoint();
        // Reset indicator to show the actual view mode
        mgr?.setIndicatorLabel(null);
      }
    },
    resetViewpoint: () => {
      renderer.clearRemoteViewpoint();
      // Reset indicator to show the actual view mode
      getViewModeManager()?.setIndicatorLabel(null);
    },
    getViewMode: () => getViewModeManager()?.getMode() ?? 'geocentric',
    setViewModeLocked: (mode) => {
      const mgr = getViewModeManager();
      return mgr ? mgr.lockAndSetMode(mode) : 'geocentric';
    },
    unlockViewMode: (mode) => {
      const mgr = getViewModeManager();
      if (mgr) mgr.unlockAndRestoreMode(mode);
    },
  });

  // Handle user interruption of tour
  function handleTourInterrupt(): void {
    if (tourEngine.isActive()) {
      tourEngine.pause();
    }
  }

  return {
    tourEngine,
    updateTourUI,
    handleTourInterrupt,
    setTimeForTour,
  };
}
