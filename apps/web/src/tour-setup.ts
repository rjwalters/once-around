import { createTourEngine, type TourPlaybackState, type TargetBody, type TourViewpoint } from "./tour";
import { getSpacecraftPosition } from "./spacecraftPositions";
import { applyTimeToEngine } from "./ui";
import type { SkyEngine } from "./wasm/sky_engine";
import {
  positionToRaDec,
  calculateSunMoonSeparation,
  type BodyPositions,
} from "./body-positions";
import type { ViewIndicatorInfo } from "./view-mode";

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
};

export interface TourSetupDependencies {
  engine: SkyEngine;
  renderer: {
    camera: { fov: number; updateProjectionMatrix: () => void };
    updateFromEngine: (engine: SkyEngine, fov: number) => void;
    updateEclipse: (separation: number) => void;
    updateDSOs: (fov: number, mag: number) => void;
    setStarOverrides: (overrides: Map<number, { color?: string; scale?: number }>) => void;
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
  setTimeForTour: (date: Date) => void;
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

  // Helper to update time and trigger all necessary updates
  function setTimeForTour(date: Date): void {
    applyTimeToEngine(engine, date);
    engine.recompute();
    renderer.updateFromEngine(engine, renderer.camera.fov);

    // Update datetime input display
    const datetimeInput = document.getElementById("datetime") as HTMLInputElement | null;
    if (datetimeInput) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      datetimeInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    // Update eclipse rendering
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

  // Create tour engine
  const tourEngine = createTourEngine({
    animateToRaDec: (ra, dec, durationMs) => {
      controls.animateToRaDec(ra, dec, durationMs);
    },
    setFov: (fov) => {
      renderer.camera.fov = fov;
      renderer.camera.updateProjectionMatrix();
      // Update star LOD for new FOV
      const mag = getMagnitude();
      renderer.updateDSOs(fov, mag);
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
