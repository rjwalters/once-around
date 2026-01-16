import "./styles.css";
import * as THREE from "three";
import { createEngine, getBodiesPositionBuffer, getMinorBodiesBuffer, getCometsBuffer } from "./engine";
import { createRenderer } from "./renderer";
import { createCelestialControls } from "./controls";
import { setupUI, applyTimeToEngine } from "./ui";
import { createVideoMarkersLayer, createVideoPopup, type VideoPlacement, type BodyPositions } from "./videos";
import { STAR_DATA } from "./starData";
import { CONSTELLATION_DATA } from "./constellationData";
import { DSO_DATA } from "./dsoData";
import { loadSettings, createSettingsSaver, type ViewMode } from "./settings";
import { createLocationManager, formatLatitude, formatLongitude, type ObserverLocation } from "./location";
import { CONSTELLATION_CENTERS, type SearchItem } from "./search";
import { getSunMoonSeparation } from "./eclipseData";
import { createTourEngine, type TourPlaybackState, type TargetBody } from "./tour";
import type { SkyEngine } from "./wasm/sky_engine";
import { createTimeControls } from "./time-controls";
import { setupSimpleModal, setupModalClose } from "./modal-utils";
import { createViewModeManager } from "./view-mode";
import { createARModeManager } from "./ar-mode";
import { createLocationUI } from "./location-ui";
import { createSearchUI } from "./search-ui";
import { setupTourUI } from "./tour-ui";
import { createCoordinateDisplay } from "./coordinate-display";
import { setupVideoMarkerInteractions } from "./video-marker-interactions";
import { createEclipseHandler } from "./eclipse-handler";
import { setupInfoModals } from "./info-modals";
import { setupKeyboardHandler } from "./keyboard-handler";
import { buildSearchIndex } from "./search-index";

// Build-time constants injected by Vite
declare const __BUILD_TIME__: string;
declare const __GIT_COMMIT__: string;

// Body names in the order they appear in the position buffer
const BODY_NAMES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"];

// Map from tour target names to body/comet names in the position buffer
const TARGET_TO_NAME: Record<TargetBody, string> = {
  sun: 'Sun',
  moon: 'Moon',
  mercury: 'Mercury',
  venus: 'Venus',
  mars: 'Mars',
  jupiter: 'Jupiter',
  saturn: 'Saturn',
  uranus: 'Uranus',
  neptune: 'Neptune',
  // Comets (names must match COMET_NAMES)
  halley: '1P/Halley',
  encke: '2P/Encke',
  'churyumov-gerasimenko': '67P/C-G',
  wirtanen: '46P/Wirtanen',
  neowise: 'C/2020 F3 NEOWISE',
  'tsuchinshan-atlas': 'C/2023 A3 T-ATLAS',
  'hale-bopp': 'C/1995 O1 Hale-Bopp',
};
// Minor body names in the order they appear in the minor bodies buffer
const MINOR_BODY_NAMES = [
  "Pluto", "Ceres", "Eris", "Makemake", "Haumea",
  "Sedna", "Quaoar", "Gonggong", "Orcus", "Varuna",
  "Vesta", "Pallas", "Hygiea", "Apophis", "Bennu"
];
// Comet names in the order they appear in the comets buffer
const COMET_NAMES = [
  "1P/Halley", "2P/Encke", "67P/C-G", "46P/Wirtanen",
  "C/2020 F3 NEOWISE", "C/2023 A3 T-ATLAS", "C/1995 O1 Hale-Bopp"
];
const SKY_RADIUS = 50;

// Build a map of body names to their current 3D positions
function getBodyPositions(engine: SkyEngine): BodyPositions {
  const bodyPositions = getBodiesPositionBuffer(engine);
  const minorBodies = getMinorBodiesBuffer(engine);
  const comets = getCometsBuffer(engine);
  const positions: BodyPositions = new Map();
  // Use SKY_RADIUS - 0.5 to match video marker positioning
  const radius = SKY_RADIUS - 0.5;

  // Add major bodies (Sun, Moon, planets)
  for (let i = 0; i < BODY_NAMES.length; i++) {
    // Rust coords: X → RA=0, Y → RA=90°, Z → north pole
    const rustX = bodyPositions[i * 3];
    const rustY = bodyPositions[i * 3 + 1];
    const rustZ = bodyPositions[i * 3 + 2];
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
 */
function positionToRaDec(pos: THREE.Vector3): { ra: number; dec: number } {
  // Normalize the position
  const normalized = pos.clone().normalize();

  // Dec is the angle from the equatorial plane (Y component)
  const dec = Math.asin(normalized.y) * (180 / Math.PI);

  // RA is the angle in the XZ plane (X is negated for east-west fix)
  let ra = Math.atan2(normalized.z, -normalized.x) * (180 / Math.PI);
  if (ra < 0) ra += 360;

  return { ra, dec };
}

/**
 * Calculate the angular separation between Sun and Moon for eclipse detection.
 * @param bodyPositions Map of body positions from the engine
 * @returns Angular separation in degrees, or null if positions unavailable
 */
function calculateSunMoonSeparation(bodyPositions: BodyPositions): number | null {
  const sunPos = bodyPositions.get("Sun");
  const moonPos = bodyPositions.get("Moon");

  if (!sunPos || !moonPos) return null;

  const sunRaDec = positionToRaDec(sunPos);
  const moonRaDec = positionToRaDec(moonPos);

  return getSunMoonSeparation(sunRaDec.ra, sunRaDec.dec, moonRaDec.ra, moonRaDec.dec);
}

/**
 * URL parameter state for shareable links.
 */
interface UrlState {
  ra?: number;
  dec?: number;
  fov?: number;
  t?: string; // ISO 8601 datetime
  mag?: number;
  lat?: number; // Observer latitude
  lon?: number; // Observer longitude
}

/**
 * Read state from URL parameters.
 */
function readUrlState(): UrlState {
  const params = new URLSearchParams(window.location.search);
  const state: UrlState = {};

  const ra = params.get('ra');
  if (ra !== null) {
    const val = parseFloat(ra);
    if (!isNaN(val) && val >= 0 && val < 360) state.ra = val;
  }

  const dec = params.get('dec');
  if (dec !== null) {
    const val = parseFloat(dec);
    if (!isNaN(val) && val >= -90 && val <= 90) state.dec = val;
  }

  const fov = params.get('fov');
  if (fov !== null) {
    const val = parseFloat(fov);
    if (!isNaN(val) && val >= 0.5 && val <= 100) state.fov = val;
  }

  const t = params.get('t');
  if (t !== null) {
    const date = new Date(t);
    if (!isNaN(date.getTime())) state.t = t;
  }

  const mag = params.get('mag');
  if (mag !== null) {
    const val = parseFloat(mag);
    if (!isNaN(val) && val >= -1 && val <= 12) state.mag = val;
  }

  return state;
}

/**
 * Update URL parameters without creating history entries.
 * Debounced to avoid "too many calls to History API" errors.
 */
let urlUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingUrlState: UrlState | null = null;

function updateUrlState(state: UrlState): void {
  // Store the latest state
  pendingUrlState = { ...pendingUrlState, ...state };

  // Debounce: only update URL after 500ms of inactivity
  if (urlUpdateTimeout) {
    clearTimeout(urlUpdateTimeout);
  }

  urlUpdateTimeout = setTimeout(() => {
    if (!pendingUrlState) return;

    const params = new URLSearchParams(window.location.search);

    // Update or remove each parameter
    if (pendingUrlState.ra !== undefined) {
      params.set('ra', pendingUrlState.ra.toFixed(2));
    }
    if (pendingUrlState.dec !== undefined) {
      params.set('dec', pendingUrlState.dec.toFixed(2));
    }
    if (pendingUrlState.fov !== undefined) {
      params.set('fov', pendingUrlState.fov.toFixed(1));
    }
    if (pendingUrlState.t !== undefined) {
      params.set('t', pendingUrlState.t);
    }
    if (pendingUrlState.mag !== undefined) {
      params.set('mag', pendingUrlState.mag.toFixed(1));
    }
    if (pendingUrlState.lat !== undefined) {
      params.set('lat', pendingUrlState.lat.toFixed(4));
    }
    if (pendingUrlState.lon !== undefined) {
      params.set('lon', pendingUrlState.lon.toFixed(4));
    }

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, '', newUrl);

    pendingUrlState = null;
  }, 500);
}

async function main(): Promise<void> {
  console.log("Initializing Once Around...");

  // Get container
  const container = document.getElementById("app");
  if (!container) {
    throw new Error("Container #app not found");
  }

  // Initialize WASM engine
  console.log("Loading sky engine...");
  const engine = await createEngine();
  console.log(
    `Engine loaded: ${engine.total_stars()} stars, ${engine.visible_stars()} visible`
  );

  // Load saved settings
  const settings = loadSettings();
  const settingsSaver = createSettingsSaver();

  // Set initial observer location for topocentric Moon corrections
  engine.set_observer_location(settings.observerLatitude, settings.observerLongitude);

  // Create Three.js renderer
  const renderer = createRenderer(container);

  // Helper to update rendered star count display
  const starCountEl = document.getElementById("star-count");
  function updateRenderedStars(): void {
    if (starCountEl) {
      starCountEl.textContent = renderer.getRenderedStarCount().toLocaleString();
    }
  }

  // Create camera controls
  const controls = createCelestialControls(
    renderer.camera,
    renderer.renderer.domElement
  );

  // Read URL state (takes precedence over localStorage)
  const urlState = readUrlState();
  const hasUrlState = urlState.ra !== undefined || urlState.dec !== undefined;

  // Restore camera state from settings or URL
  if (hasUrlState && urlState.ra !== undefined && urlState.dec !== undefined) {
    // URL has position - set FOV first, then look at RA/Dec
    const fov = urlState.fov ?? settings.fov;
    controls.setCameraState({
      quaternion: settings.cameraQuaternion, // Start with saved quaternion (will be overwritten)
      fov,
    });
    controls.lookAtRaDec(urlState.ra, urlState.dec);
  } else {
    // Use saved settings
    controls.setCameraState({
      quaternion: settings.cameraQuaternion,
      fov: urlState.fov ?? settings.fov,
    });
  }

  // Initial render from engine (pass FOV for consistent LOD)
  const initialFov = urlState.fov ?? settings.fov;
  renderer.updateFromEngine(engine, initialFov);

  // Track current RA/Dec for URL updates
  let currentRaDec = { ra: 0, dec: 0 };

  // ============================================================================
  // Tour System
  // ============================================================================

  // Location manager holder - set later when locationManager is created
  // This allows tour callbacks to reference the location manager
  let locationManagerRef: {
    getLocation: () => { latitude: number; longitude: number; name?: string };
    setLocation: (location: { latitude: number; longitude: number; name?: string }) => void;
  } | null = null;

  // Helper to update time and trigger all necessary updates
  function setTimeForTour(date: Date): void {
    applyTimeToEngine(engine, date);
    engine.recompute();
    renderer.updateFromEngine(engine);

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
    const bodyPos = getBodyPositions(engine);
    const sunMoonSep = calculateSunMoonSeparation(bodyPos);
    if (sunMoonSep !== null) {
      renderer.updateEclipse(sunMoonSep);
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
      const magInput = document.getElementById("magnitude") as HTMLInputElement | null;
      const mag = magInput ? parseFloat(magInput.value) : 6.5;
      renderer.updateDSOs(fov, mag);
    },
    getFov: () => renderer.camera.fov,
    setTime: setTimeForTour,
    resolveBodyPosition: (target: TargetBody, datetime: Date) => {
      // Temporarily set engine time to compute body position at keyframe datetime
      const savedTime = new Date(currentDate);

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
      const bodyPos = getBodyPositions(engine);
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
      if (locationManagerRef) {
        locationManagerRef.setLocation({ latitude, longitude, name });
      }
    },
    getLocation: () => {
      if (locationManagerRef) {
        return locationManagerRef.getLocation();
      }
      return { latitude: settings.observerLatitude, longitude: settings.observerLongitude };
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
  });

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

  // Handle user interruption of tour
  function handleTourInterrupt(): void {
    if (tourEngine.isActive()) {
      tourEngine.pause();
    }
  }

  // Add listeners for user interactions that should pause tour
  renderer.renderer.domElement.addEventListener("mousedown", handleTourInterrupt);
  renderer.renderer.domElement.addEventListener("wheel", handleTourInterrupt);
  renderer.renderer.domElement.addEventListener("touchstart", handleTourInterrupt);

  // Save camera changes (debounced) and update URL
  controls.onCameraChange = () => {
    const state = controls.getCameraState();
    settingsSaver.save({
      cameraQuaternion: state.quaternion,
      fov: state.fov,
    });

    // Compute current RA/Dec from camera direction
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(state.quaternion);
    currentRaDec = positionToRaDec(direction);

    // Update URL with current view state
    updateUrlState({
      ra: currentRaDec.ra,
      dec: currentRaDec.dec,
      fov: state.fov,
    });
  };

  // Debounced star LOD update for zooming (updateFromEngine is expensive)
  let fovUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
  let pendingFov: number | null = null;

  function debouncedFovUpdate(fov: number): void {
    pendingFov = fov;
    if (fovUpdateTimeout === null) {
      fovUpdateTimeout = setTimeout(() => {
        if (pendingFov !== null) {
          renderer.updateFromEngine(engine, pendingFov);
          // Update DSO sizes based on new FOV
          const magInput = document.getElementById("magnitude") as HTMLInputElement | null;
          const mag = magInput ? parseFloat(magInput.value) : 6.5;
          renderer.updateDSOs(pendingFov, mag);
        }
        fovUpdateTimeout = null;
        pendingFov = null;
      }, 150); // Wait 150ms after last zoom before updating stars
    }
  }

  // Update star LOD when FOV changes (zooming) - debounced for performance
  controls.onFovChange = (fov: number) => {
    debouncedFovUpdate(fov);
  };

  // Get UI elements for settings restoration
  const datetimeInput = document.getElementById("datetime") as HTMLInputElement | null;
  const magnitudeInput = document.getElementById("magnitude") as HTMLInputElement | null;

  // Restore datetime from URL or settings (URL takes precedence)
  const initialDateStr = urlState.t ?? settings.datetime;
  if (datetimeInput && initialDateStr) {
    try {
      const savedDate = new Date(initialDateStr);
      if (!isNaN(savedDate.getTime())) {
        // Convert to local datetime string for input
        const year = savedDate.getFullYear();
        const month = String(savedDate.getMonth() + 1).padStart(2, "0");
        const day = String(savedDate.getDate()).padStart(2, "0");
        const hours = String(savedDate.getHours()).padStart(2, "0");
        const minutes = String(savedDate.getMinutes()).padStart(2, "0");
        datetimeInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
        applyTimeToEngine(engine, savedDate);
        engine.recompute();
      }
    } catch {
      // Ignore invalid date, use default
    }
  }

  // Restore magnitude from URL or settings (URL takes precedence)
  const initialMag = urlState.mag ?? settings.magnitude;
  if (magnitudeInput) {
    magnitudeInput.value = String(initialMag);
    engine.set_mag_limit(initialMag);
    engine.recompute();
  }

  // ---------------------------------------------------------------------------
  // Time step controls
  // ---------------------------------------------------------------------------
  const timeControls = datetimeInput ? createTimeControls({ datetimeInput }) : null;
  timeControls?.setupEventListeners();

  // ---------------------------------------------------------------------------
  // Next Total Eclipse handler (used by dynamically generated button)
  // ---------------------------------------------------------------------------
  const handleNextEclipseClick = createEclipseHandler({
    getDatetimeInputValue: () => datetimeInput?.value,
    setDatetimeInputValue: (value) => { if (datetimeInput) datetimeInput.value = value; },
    stopTimePlayback: () => timeControls?.stopPlayback(),
    applyTimeToEngine: (date) => applyTimeToEngine(engine, date),
    recomputeEngine: () => engine.recompute(),
    updateRenderer: () => renderer.updateFromEngine(engine),
    getBodyPositions: () => getBodyPositions(engine),
    positionToRaDec,
    calculateSunMoonSeparation,
    updateEclipseRendering: (sep) => renderer.updateEclipse(sep),
    updateVideoMarkers: (bodyPos) => videoMarkersRef?.updateMovingPositions(bodyPos),
    animateToRaDec: (ra, dec, dur) => controls.animateToRaDec(ra, dec, dur),
  });

  // Update display after restoring settings (pass saved FOV for consistent LOD)
  renderer.updateFromEngine(engine, settings.fov);
  renderer.setMilkyWayVisibility(settings.magnitude);

  // Track current date for orbit computation (updated in onTimeChange)
  let currentDate = settings.datetime ? new Date(settings.datetime) : new Date();

  // Reference to video markers layer (set later after creation)
  let videoMarkersRef: { updateMovingPositions: (bodyPositions: BodyPositions) => void } | null = null;

  // Setup UI
  setupUI(engine, {
    onTimeChange: (date: Date) => {
      currentDate = date;
      applyTimeToEngine(engine, date);
      engine.recompute();
      renderer.updateFromEngine(engine);
      updateRenderedStars();
      // Update topocentric parameters (LST changes with time)
      viewModeManager.updateTopocentricParamsForTime(date);
      // Recompute orbits if they are visible
      if (orbitsCheckbox?.checked) {
        void renderer.computeOrbits(engine, currentDate);
      }
      // Update moving video markers (planets)
      const bodyPos = getBodyPositions(engine);
      if (videoMarkersRef) {
        videoMarkersRef.updateMovingPositions(bodyPos);
      }
      const eclipseBanner = document.getElementById("eclipse-banner");
      if (eclipseBanner) {
        eclipseBanner.classList.add("hidden");
      }

      // Update eclipse rendering (corona visibility based on actual separation)
      const sunMoonSep = calculateSunMoonSeparation(bodyPos);
      if (sunMoonSep !== null) {
        renderer.updateEclipse(sunMoonSep);
      }
      settingsSaver.save({ datetime: date.toISOString() });
      // Update URL with new time
      updateUrlState({ t: date.toISOString() });
    },
    onMagnitudeChange: (mag: number) => {
      engine.set_mag_limit(mag);
      engine.recompute();
      renderer.updateFromEngine(engine);
      renderer.setMilkyWayVisibility(mag);
      updateRenderedStars();
      // Update DSO visibility based on new magnitude limit
      const currentFov = controls.getCameraState().fov;
      renderer.updateDSOs(currentFov, mag);
      settingsSaver.save({ magnitude: mag });
      // Update URL with new magnitude
      updateUrlState({ mag });
    },
  });

  // Constellation checkbox
  const constellationCheckbox = document.getElementById("constellations") as HTMLInputElement | null;
  if (constellationCheckbox) {
    // Restore from settings
    constellationCheckbox.checked = settings.constellationsVisible;
    renderer.setConstellationsVisible(settings.constellationsVisible);

    constellationCheckbox.addEventListener("change", () => {
      renderer.setConstellationsVisible(constellationCheckbox.checked);
      settingsSaver.save({ constellationsVisible: constellationCheckbox.checked });
    });
  }

  // Labels checkbox
  const labelsCheckbox = document.getElementById("labels") as HTMLInputElement | null;
  if (labelsCheckbox) {
    // Restore from settings
    labelsCheckbox.checked = settings.labelsVisible;
    renderer.setLabelsVisible(settings.labelsVisible);

    labelsCheckbox.addEventListener("change", () => {
      renderer.setLabelsVisible(labelsCheckbox.checked);
      settingsSaver.save({ labelsVisible: labelsCheckbox.checked });
    });
  }

  // ---------------------------------------------------------------------------
  // Video markers layer
  // ---------------------------------------------------------------------------
  const videoPopup = createVideoPopup();

  // Get current body positions for matching moving object videos to planets
  const bodyPositions = getBodyPositions(engine);

  const videoMarkers = await createVideoMarkersLayer(
    renderer.scene,
    (video: VideoPlacement) => {
      videoPopup.show(video);
    },
    bodyPositions
  );

  // Set reference for time change updates
  videoMarkersRef = videoMarkers;

  // Videos checkbox
  const videosCheckbox = document.getElementById("videos") as HTMLInputElement | null;
  if (videosCheckbox) {
    // Restore from settings
    videosCheckbox.checked = settings.videosVisible;
    videoMarkers.setVisible(settings.videosVisible);
    videoMarkers.setLabelsVisible(settings.videosVisible);

    videosCheckbox.addEventListener("change", () => {
      videoMarkers.setVisible(videosCheckbox.checked);
      videoMarkers.setLabelsVisible(videosCheckbox.checked);
      settingsSaver.save({ videosVisible: videosCheckbox.checked });
    });
  }

  // Orbits checkbox
  const orbitsCheckbox = document.getElementById("orbits") as HTMLInputElement | null;
  if (orbitsCheckbox) {
    // Restore from settings
    orbitsCheckbox.checked = settings.orbitsVisible;
    renderer.setOrbitsVisible(settings.orbitsVisible);

    // Compute initial orbits if visible
    if (settings.orbitsVisible) {
      void renderer.computeOrbits(engine, currentDate);
    }

    orbitsCheckbox.addEventListener("change", () => {
      renderer.setOrbitsVisible(orbitsCheckbox.checked);
      // Compute orbits when turning on (they may not have been computed yet)
      if (orbitsCheckbox.checked) {
        void renderer.computeOrbits(engine, currentDate);
      }
      // Clear any focused orbit when toggling
      focusedOrbitBody = null;
      settingsSaver.save({ orbitsVisible: orbitsCheckbox.checked });
    });
  }

  // DSOs (deep sky objects) checkbox
  const dsosCheckbox = document.getElementById("dsos") as HTMLInputElement | null;
  if (dsosCheckbox) {
    // Restore from settings
    dsosCheckbox.checked = settings.dsosVisible ?? false;
    renderer.setDSOsVisible(settings.dsosVisible ?? false);

    // Initialize DSO positions if restored as visible
    if (settings.dsosVisible) {
      const currentFov = controls.getCameraState().fov;
      const currentMag = magnitudeInput ? parseFloat(magnitudeInput.value) : 6.5;
      renderer.updateDSOs(currentFov, currentMag);
    }

    dsosCheckbox.addEventListener("change", () => {
      renderer.setDSOsVisible(dsosCheckbox.checked);
      // Update DSOs immediately when toggled on
      if (dsosCheckbox.checked) {
        const currentFov = controls.getCameraState().fov;
        const currentMag = magnitudeInput ? parseFloat(magnitudeInput.value) : 6.5;
        renderer.updateDSOs(currentFov, currentMag);
      }
      settingsSaver.save({ dsosVisible: dsosCheckbox.checked });
    });
  }

  // Night vision mode checkbox
  const nightVisionCheckbox = document.getElementById("night-vision") as HTMLInputElement | null;

  function setNightVision(enabled: boolean): void {
    document.body.classList.toggle("night-vision", enabled);
    if (nightVisionCheckbox) {
      nightVisionCheckbox.checked = enabled;
    }
    settingsSaver.save({ nightVisionEnabled: enabled });
  }

  if (nightVisionCheckbox) {
    // Restore from settings
    const initialNightVision = settings.nightVisionEnabled ?? false;
    nightVisionCheckbox.checked = initialNightVision;
    document.body.classList.toggle("night-vision", initialNightVision);

    nightVisionCheckbox.addEventListener("change", () => {
      setNightVision(nightVisionCheckbox.checked);
    });
  }

  // Horizon/ground plane checkbox
  const horizonCheckbox = document.getElementById("horizon") as HTMLInputElement | null;
  if (horizonCheckbox) {
    // Restore from settings
    const initialHorizon = settings.horizonVisible ?? false;
    horizonCheckbox.checked = initialHorizon;
    renderer.setGroundPlaneVisible(initialHorizon);

    // Initialize ground plane orientation with location from settings
    renderer.updateGroundPlaneOrientation(settings.observerLatitude, settings.observerLongitude);

    horizonCheckbox.addEventListener("change", () => {
      renderer.setGroundPlaneVisible(horizonCheckbox.checked);
      settingsSaver.save({ horizonVisible: horizonCheckbox.checked });
    });
  }

  // ---------------------------------------------------------------------------
  // View Mode Toggle (Geocentric vs Topocentric)
  // ---------------------------------------------------------------------------
  const viewModeManager = createViewModeManager({
    initialMode: settings.viewMode ?? 'geocentric',
    getObserverLocation: () => ({
      latitude: settings.observerLatitude,
      longitude: settings.observerLongitude,
    }),
    getCurrentDate: () => currentDate,
    onModeChange: (mode) => {
      settingsSaver.save({ viewMode: mode });
    },
    onHorizonChange: (visible) => {
      if (horizonCheckbox && horizonCheckbox.checked !== visible) {
        horizonCheckbox.checked = visible;
        renderer.setGroundPlaneVisible(visible);
        settingsSaver.save({ horizonVisible: visible });
      }
    },
    setControlsViewMode: (mode) => controls.setViewMode(mode),
    setTopocentricParams: (latRad, lstRad) => controls.setTopocentricParams(latRad, lstRad),
    animateToAltAz: (alt, az, duration) => controls.animateToAltAz(alt, az, duration),
  });
  viewModeManager.setupEventListeners();

  // ---------------------------------------------------------------------------
  // AR Mode (Device Orientation)
  // ---------------------------------------------------------------------------
  const arModeManager = createARModeManager({
    onQuaternionChange: (quaternion) => controls.setQuaternion(quaternion),
    setControlsEnabled: (enabled) => controls.setEnabled(enabled),
    onModeChange: (enabled) => settingsSaver.save({ arModeEnabled: enabled }),
  });
  arModeManager.setupEventListeners();

  // ---------------------------------------------------------------------------
  // Observer Location
  // ---------------------------------------------------------------------------
  // Create location manager with initial location from settings
  const locationManager = createLocationManager(
    {
      latitude: settings.observerLatitude,
      longitude: settings.observerLongitude,
      name: settings.observerName,
    },
    {
      onLocationChange: (location: ObserverLocation) => {
        // Update UI
        locationUI.updateDisplay(location);
        // Update engine's observer location (for topocentric Moon correction)
        engine.set_observer_location(location.latitude, location.longitude);
        // Update ground plane orientation for topocentric view
        renderer.updateGroundPlaneOrientation(location.latitude, location.longitude);
        // Update in-memory settings for topocentric calculations
        settings.observerLatitude = location.latitude;
        settings.observerLongitude = location.longitude;
        // Update topocentric camera if in that mode
        if (viewModeManager.getMode() === 'topocentric') {
          viewModeManager.updateTopocentricParams();
        }
        // Save to settings
        settingsSaver.save({
          observerLatitude: location.latitude,
          observerLongitude: location.longitude,
          observerName: location.name ?? "Custom",
        });
        // Update URL params
        updateUrlState({
          lat: location.latitude,
          lon: location.longitude,
        });
      },
    }
  );

  // Wire up location manager for tour system
  locationManagerRef = locationManager;

  // Create location UI handlers
  const locationUI = createLocationUI({
    searchCities: (query) => locationManager.searchCities(query),
    setLocationFromCity: (city) => locationManager.setLocationFromCity(city),
    setLocation: (loc) => locationManager.setLocation(loc),
    requestGeolocation: () => locationManager.requestGeolocation(),
    getLocation: () => locationManager.getLocation(),
  });
  locationUI.setupEventListeners();
  locationUI.checkUrlParams();

  // ---------------------------------------------------------------------------
  // Search functionality
  // ---------------------------------------------------------------------------
  let searchIndex: SearchItem[] = [];

  // Build search index from all available data
  async function buildSearchIndex(): Promise<SearchItem[]> {
    const items: SearchItem[] = [];

    // Add planets (get current positions)
    const currentBodyPositions = getBodyPositions(engine);
    for (const name of BODY_NAMES) {
      const pos = currentBodyPositions.get(name);
      if (pos) {
        const { ra, dec } = positionToRaDec(pos);
        items.push({ name, type: 'planet', ra, dec });
      }
    }

    // Add named stars
    for (const [_hr, star] of Object.entries(STAR_DATA)) {
      items.push({
        name: star.name,
        type: 'star',
        ra: star.ra,
        dec: star.dec,
        subtitle: star.designation,
      });
    }

    // Add constellations
    for (const [name, info] of Object.entries(CONSTELLATION_DATA)) {
      const center = CONSTELLATION_CENTERS[name];
      if (center) {
        items.push({
          name: info.name,
          type: 'constellation',
          ra: center.ra,
          dec: center.dec,
          subtitle: info.meaning,
        });
      }
    }

    // Add deep sky objects
    for (const dso of DSO_DATA) {
      items.push({
        name: dso.name,
        type: 'dso',
        ra: dso.ra,
        dec: dso.dec,
        subtitle: dso.id,
      });
      // Also add by catalog ID for search
      if (dso.id !== dso.name) {
        items.push({
          name: dso.id,
          type: 'dso',
          ra: dso.ra,
          dec: dso.dec,
          subtitle: dso.name,
        });
      }
    }

    // Add comets (positions from engine)
    for (const name of COMET_NAMES) {
      const pos = currentBodyPositions.get(name);
      if (pos) {
        const { ra, dec } = positionToRaDec(pos);
        items.push({
          name,
          type: 'comet',
          ra,
          dec,
          subtitle: 'Comet',
        });
      }
    }

    // Add videos
    try {
      const response = await fetch("/videos.json");
      const videos: VideoPlacement[] = await response.json();
      for (const video of videos) {
        items.push({
          name: video.object,
          type: 'video',
          ra: video.ra,
          dec: video.dec,
          subtitle: video.title,
        });
      }
    } catch (e) {
      console.warn("Failed to load videos for search index:", e);
    }

    return items;
  }

  // Initialize search index
  buildSearchIndex().then(index => {
    searchIndex = index;
    console.log(`Search index built: ${index.length} items`);
  });

  // Create search UI
  const searchUI = createSearchUI({
    getSearchIndex: () => searchIndex,
    navigateToResult: (result) => {
      controls.animateToRaDec(result.ra, result.dec, 1000);
    },
    getPlanetPosition: (name) => {
      const pos = getBodyPositions(engine).get(name);
      return pos ? positionToRaDec(pos) : null;
    },
  });
  searchUI.setupEventListeners();

  // About modal
  setupSimpleModal(
    document.getElementById("about-btn"),
    document.getElementById("about-modal"),
    document.getElementById("about-close")
  );

  // Help modal (keyboard shortcuts)
  const helpModal = document.getElementById("help-modal");
  setupModalClose(helpModal, document.getElementById("help-modal-close"), { closeOnEscape: true });

  // Populate build info
  const buildInfo = document.getElementById("build-info");
  if (buildInfo) {
    const buildDate = new Date(__BUILD_TIME__).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Los_Angeles",
    });
    buildInfo.textContent = `Build: ${buildDate} (${__GIT_COMMIT__})`;
  }

  // ---------------------------------------------------------------------------
  // Info modals (star, constellation, DSO, comet)
  // ---------------------------------------------------------------------------
  setupInfoModals();

  // Handle clicks on planet labels to focus orbit
  // Track which planet is focused (null = show all, body index = focused)
  let focusedOrbitBody: number | null = null;

  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains("planet-label") && target.dataset.body) {
      const bodyIndex = parseInt(target.dataset.body, 10);
      if (!isNaN(bodyIndex)) {
        // Only handle planets with orbits (indices 2-8: Mercury through Neptune)
        // Sun (0) and Moon (1) don't have orbit lines
        if (bodyIndex >= 2 && bodyIndex <= 8) {
          // If orbits are visible, toggle focus
          if (orbitsCheckbox?.checked) {
            if (focusedOrbitBody === bodyIndex) {
              // Clicking the same planet again: show all orbits
              focusedOrbitBody = null;
              renderer.focusOrbit(null);
            } else {
              // Focus on this planet's orbit
              focusedOrbitBody = bodyIndex;
              renderer.focusOrbit(bodyIndex);
            }
          } else {
            // Orbits not visible: turn them on and focus on this planet
            if (orbitsCheckbox) {
              orbitsCheckbox.checked = true;
              renderer.setOrbitsVisible(true);
              void renderer.computeOrbits(engine, currentDate);
              focusedOrbitBody = bodyIndex;
              renderer.focusOrbit(bodyIndex);
              settingsSaver.save({ orbitsVisible: true });
            }
          }
        }
      }
    }
  });

  // Click and hover handling for video markers
  setupVideoMarkerInteractions({
    domElement: renderer.renderer.domElement,
    camera: renderer.camera,
    videoMarkers,
    onVideoClick: (video) => videoPopup.show(video),
    lookAtRaDec: (ra, dec) => controls.lookAtRaDec(ra, dec),
  });

  // Handle window resize
  window.addEventListener("resize", () => {
    renderer.resize(window.innerWidth, window.innerHeight);
  });

  // Keyboard shortcuts
  setupKeyboardHandler({
    toggleLabels: () => {
      if (labelsCheckbox) {
        labelsCheckbox.checked = !labelsCheckbox.checked;
        renderer.setLabelsVisible(labelsCheckbox.checked);
        settingsSaver.save({ labelsVisible: labelsCheckbox.checked });
      }
    },
    toggleConstellations: () => {
      if (constellationCheckbox) {
        constellationCheckbox.checked = !constellationCheckbox.checked;
        renderer.setConstellationsVisible(constellationCheckbox.checked);
        settingsSaver.save({ constellationsVisible: constellationCheckbox.checked });
      }
    },
    toggleVideos: () => {
      if (videosCheckbox) {
        videosCheckbox.checked = !videosCheckbox.checked;
        videoMarkers.setVisible(videosCheckbox.checked);
        videoMarkers.setLabelsVisible(videosCheckbox.checked);
        settingsSaver.save({ videosVisible: videosCheckbox.checked });
      }
    },
    toggleOrbits: () => {
      if (orbitsCheckbox) {
        orbitsCheckbox.checked = !orbitsCheckbox.checked;
        renderer.setOrbitsVisible(orbitsCheckbox.checked);
        if (orbitsCheckbox.checked) {
          void renderer.computeOrbits(engine, currentDate);
        }
        focusedOrbitBody = null;
        settingsSaver.save({ orbitsVisible: orbitsCheckbox.checked });
      }
    },
    toggleDSOs: () => {
      if (dsosCheckbox) {
        dsosCheckbox.checked = !dsosCheckbox.checked;
        renderer.setDSOsVisible(dsosCheckbox.checked);
        if (dsosCheckbox.checked) {
          const currentFov = controls.getCameraState().fov;
          const currentMag = magnitudeInput ? parseFloat(magnitudeInput.value) : 6.5;
          renderer.updateDSOs(currentFov, currentMag);
        }
        settingsSaver.save({ dsosVisible: dsosCheckbox.checked });
      }
    },
    toggleNightVision: () => {
      setNightVision(!document.body.classList.contains("night-vision"));
    },
    toggleHorizon: () => {
      if (horizonCheckbox) {
        horizonCheckbox.checked = !horizonCheckbox.checked;
        renderer.setGroundPlaneVisible(horizonCheckbox.checked);
        settingsSaver.save({ horizonVisible: horizonCheckbox.checked });
      }
    },
    handleNextEclipse: handleNextEclipseClick,
    jumpToNow: () => timeControls?.jumpToNow(),
    animateToGalacticCenter: () => controls.animateToRaDec(266.4, -29, 1500),
    stepTimeBackward: () => {
      timeControls?.stopPlayback();
      timeControls?.stepTime(-1);
    },
    stepTimeForward: () => {
      timeControls?.stopPlayback();
      timeControls?.stepTime(1);
    },
    togglePlayback: () => timeControls?.togglePlayback(),
    focusSearch: () => searchInput?.focus(),
    showHelp: () => {
      const helpModal = document.getElementById("help-modal");
      if (helpModal) {
        helpModal.classList.remove("hidden");
      }
    },
  });

  // Flush settings before page unload
  window.addEventListener("beforeunload", () => {
    settingsSaver.flush();
  });

  // ============================================================================
  // Tour UI Event Handlers
  // ============================================================================
  setupTourUI({
    tourEngine,
    onNextEclipse: handleNextEclipseClick,
    stopTimePlayback: () => timeControls?.stopPlayback(),
  });

  // Coordinate display
  createCoordinateDisplay({
    getViewMode: () => viewModeManager.getMode(),
    getCameraState: () => controls.getCameraState(),
    getRaDec: () => controls.getRaDec(),
    getAltAz: () => controls.getAltAz(),
    onCameraChange: (callback) => {
      const original = controls.onCameraChange;
      controls.onCameraChange = () => {
        original?.();
        callback();
      };
    },
  });

  // Animation loop
  function animate(): void {
    requestAnimationFrame(animate);
    controls.update();
    tourEngine.update();
    // Update ground plane position for current sidereal time
    renderer.updateGroundPlaneForTime(currentDate);
    renderer.render();
  }

  animate();

  // Force a full update after first render frame to ensure everything is initialized
  // This fixes issues where planetary moons or other elements don't render until interaction
  requestAnimationFrame(() => {
    renderer.updateFromEngine(engine, settings.fov);
    updateRenderedStars();

    // Initial eclipse detection
    const initialBodyPos = getBodyPositions(engine);
    const initialSunMoonSep = calculateSunMoonSeparation(initialBodyPos);
    if (initialSunMoonSep !== null) {
      renderer.updateEclipse(initialSunMoonSep);
    }
  });

  console.log("Once Around ready!");
}

main().catch((err) => {
  console.error("Failed to initialize:", err);
  const container = document.getElementById("app");
  if (container) {
    container.innerHTML = `
      <div style="color: #ff4444; padding: 20px; font-family: monospace;">
        <h2>Failed to initialize</h2>
        <pre>${err.message}</pre>
        <p>Make sure to build the WASM module first:</p>
        <code>cd crates/sky_engine && wasm-pack build --target web --out-dir ../../apps/web/src/wasm</code>
      </div>
    `;
  }
});
