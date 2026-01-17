import "./styles.css";
import * as THREE from "three";
import { createEngine, getBodiesPositionBuffer, getMinorBodiesBuffer, getCometsBuffer, loadAllSatelliteEphemerides, getSatellitePosition, SATELLITES } from "./engine";
import { createRenderer } from "./renderer";
import { createCelestialControls } from "./controls";
import { setupUI, applyTimeToEngine } from "./ui";
import { createVideoMarkersLayer, createVideoPopup, type VideoPlacement } from "./videos";
import { STAR_DATA } from "./starData";
import { CONSTELLATION_DATA } from "./constellationData";
import { DSO_DATA } from "./dsoData";
import { loadSettings, createSettingsSaver } from "./settings";
import { createLocationManager, type ObserverLocation } from "./location";
import { CONSTELLATION_CENTERS, type SearchItem } from "./search";
import { createTourEngine, type TourPlaybackState, type TargetBody } from "./tour";
import type { SkyEngine } from "./wasm/sky_engine";
import { createTimeControls } from "./time-controls";
import { setupSimpleModal, setupModalClose } from "./modal-utils";
import { createViewModeManager, computeGMST } from "./view-mode";
import { formatLST } from "./coordinate-utils";
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
import { setupOrbitFocus } from "./orbit-focus";
import { readUrlState, createUrlStateUpdater } from "./url-state";
import {
  BODY_NAMES,
  COMET_NAMES,
  getBodyPositions,
  positionToRaDec,
  calculateSunMoonSeparation,
  type BodyPositions,
} from "./body-positions";

// Build-time constants injected by Vite
declare const __BUILD_TIME__: string;
declare const __GIT_COMMIT__: string;

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

// Helper to get body positions from engine
function getBodyPositionsFromEngine(engine: SkyEngine): BodyPositions {
  return getBodyPositions({
    bodies: getBodiesPositionBuffer(engine),
    minorBodies: getMinorBodiesBuffer(engine),
    comets: getCometsBuffer(engine),
  });
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
  const updateUrlState = createUrlStateUpdater();
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
    const bodyPos = getBodyPositionsFromEngine(engine);
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
      const bodyPos = getBodyPositionsFromEngine(engine);
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
    getBodyPositions: () => getBodyPositionsFromEngine(engine),
    positionToRaDec,
    calculateSunMoonSeparation,
    updateEclipseRendering: (sep) => renderer.updateEclipse(sep),
    updateVideoMarkers: (bodyPos) => videoMarkersRef?.updateMovingPositions(bodyPos),
    animateToRaDec: (ra, dec, dur) => controls.animateToRaDec(ra, dec, dur),
  });

  // Update display after restoring settings (pass saved FOV for consistent LOD)
  renderer.updateFromEngine(engine, settings.fov);
  renderer.setMilkyWayVisibility(settings.magnitude);

  // Load satellite ephemerides in background (non-blocking)
  loadAllSatelliteEphemerides(engine).then(() => {
    console.log("Satellite ephemerides loaded - satellite tracking enabled");
    // Trigger an update to show satellites if they're currently visible
    renderer.updateFromEngine(engine);
  });

  // Track current date for orbit computation (updated in onTimeChange)
  let currentDate = settings.datetime ? new Date(settings.datetime) : new Date();

  // Reference to video markers layer (set later after creation)
  let videoMarkersRef: { updateMovingPositions: (bodyPositions: BodyPositions) => void } | null = null;

  // Orbit focus handler (set later, used by checkbox handler)
  let orbitFocus: { resetFocus: () => void } | null = null;

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
      const bodyPos = getBodyPositionsFromEngine(engine);
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
  const bodyPositions = getBodyPositionsFromEngine(engine);

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
      orbitFocus?.resetFocus();
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

  // ISS (International Space Station) checkbox
  const issCheckbox = document.getElementById("iss") as HTMLInputElement | null;
  if (issCheckbox) {
    // Restore from settings
    issCheckbox.checked = settings.issVisible ?? true;
    renderer.setISSVisible(settings.issVisible ?? true);

    issCheckbox.addEventListener("change", () => {
      renderer.setISSVisible(issCheckbox.checked);
      settingsSaver.save({ issVisible: issCheckbox.checked });
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
      const isOrbital = viewModeManager?.getMode() === 'orbital';
      if (isOrbital) {
        // In orbital mode, toggle Earth visibility
        renderer.setOrbitalMode(horizonCheckbox.checked);
      } else {
        // In other modes, toggle ground plane
        renderer.setGroundPlaneVisible(horizonCheckbox.checked);
      }
      settingsSaver.save({ horizonVisible: horizonCheckbox.checked });
    });
  }

  // ---------------------------------------------------------------------------
  // View Mode Toggle (Geocentric vs Topocentric)
  // ---------------------------------------------------------------------------
  // Atmospheric seeing control
  const seeingControl = document.getElementById("seeing-control") as HTMLDivElement | null;
  const seeingSelect = document.getElementById("seeing-select") as HTMLSelectElement | null;

  // Initialize seeing intensity from settings or default
  const initialSeeingIntensity = settings.seeingIntensity ?? 0.7;
  renderer.setScintillationIntensity(initialSeeingIntensity);
  if (seeingSelect) {
    seeingSelect.value = String(initialSeeingIntensity);
  }

  const viewModeManager = createViewModeManager({
    initialMode: settings.viewMode ?? 'geocentric',
    getObserverLocation: () => ({
      latitude: settings.observerLatitude,
      longitude: settings.observerLongitude,
    }),
    getCurrentDate: () => currentDate,
    onModeChange: (mode) => {
      // Enable/disable scintillation based on view mode
      // Scintillation only makes sense in topocentric (surface observer) mode
      renderer.setScintillationEnabled(mode === 'topocentric');
      // Enable/disable horizon culling (hide bodies below horizon)
      renderer.setHorizonCulling(mode === 'topocentric');
      // Show/hide atmospheric seeing control
      if (seeingControl) {
        seeingControl.style.display = mode === 'topocentric' ? 'block' : 'none';
      }
      // Show/hide LST display
      const lstContainer = document.getElementById("location-lst-container");
      if (lstContainer) {
        lstContainer.style.display = mode === 'topocentric' ? 'block' : 'none';
      }
      settingsSaver.save({ viewMode: mode });
    },
    onHorizonChange: (visible) => {
      if (horizonCheckbox && horizonCheckbox.checked !== visible) {
        horizonCheckbox.checked = visible;
        renderer.setGroundPlaneVisible(visible);
        settingsSaver.save({ horizonVisible: visible });
      }
    },
    onLSTChange: (lstDeg) => {
      const lstDisplay = document.getElementById("location-lst");
      if (lstDisplay) {
        lstDisplay.textContent = formatLST(lstDeg);
      }
    },
    setControlsViewMode: (mode) => controls.setViewMode(mode),
    setTopocentricParams: (latRad, lstRad) => controls.setTopocentricParams(latRad, lstRad),
    animateToAltAz: (alt, az, duration) => controls.animateToAltAz(alt, az, duration),
    // Orbital mode callbacks
    onOrbitalModeChange: (enabled) => {
      renderer.setOrbitalMode(enabled);
    },
    onScintillationChange: (enabled) => {
      renderer.setScintillationEnabled(enabled);
    },
  });
  viewModeManager.setupEventListeners();

  // Show seeing control, LST display, and enable horizon culling if starting in topocentric mode
  if (settings.viewMode === 'topocentric') {
    if (seeingControl) {
      seeingControl.style.display = 'block';
    }
    const lstContainer = document.getElementById("location-lst-container");
    if (lstContainer) {
      lstContainer.style.display = 'block';
    }
    renderer.setHorizonCulling(true);
  }

  // Handle seeing control changes
  if (seeingSelect) {
    seeingSelect.addEventListener("change", () => {
      const intensity = parseFloat(seeingSelect.value);
      renderer.setScintillationIntensity(intensity);
      settingsSaver.save({ seeingIntensity: intensity });
    });
  }

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

  // Initialize search index
  buildSearchIndex({
    bodyNames: BODY_NAMES,
    cometNames: COMET_NAMES,
    starData: STAR_DATA,
    constellationData: CONSTELLATION_DATA,
    constellationCenters: CONSTELLATION_CENTERS,
    dsoData: DSO_DATA,
    getBodyPositions: () => getBodyPositionsFromEngine(engine),
    positionToRaDec,
    satellites: SATELLITES.map(s => ({ index: s.index, name: s.name, fullName: s.fullName })),
    getSatellitePosition: (index: number) => {
      if (!engine.has_satellite_ephemeris(index) || !engine.satellite_in_range(index)) return null;
      const pos = getSatellitePosition(engine, index);
      if (pos.x === 0 && pos.y === 0 && pos.z === 0) return null;
      return { x: pos.x, y: pos.y, z: pos.z };
    },
  }).then(index => {
    searchIndex = index;
    console.log(`Search index built: ${index.length} items`);

    // Handle object URL parameter (deep linking)
    if (urlState.object) {
      // Wait a tick for searchUI to be ready
      setTimeout(() => {
        const found = searchUI.navigateToObject(urlState.object!);
        if (found) {
          console.log(`Navigated to object from URL: ${urlState.object}`);
        } else {
          console.warn(`Object not found in search index: ${urlState.object}`);
        }
      }, 0);
    }
  });

  // Create search UI
  const searchUI = createSearchUI({
    getSearchIndex: () => searchIndex,
    navigateToResult: (result) => {
      controls.animateToRaDec(result.ra, result.dec, 1000);
    },
    getPlanetPosition: (name) => {
      const pos = getBodyPositionsFromEngine(engine).get(name);
      return pos ? positionToRaDec(pos) : null;
    },
    getSatellitePosition: (index: number) => {
      if (!engine.has_satellite_ephemeris(index) || !engine.satellite_in_range(index)) return null;
      const pos = getSatellitePosition(engine, index);
      if (pos.x === 0 && pos.y === 0 && pos.z === 0) return null;
      return positionToRaDec({ x: pos.x, y: pos.y, z: pos.z });
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
  orbitFocus = setupOrbitFocus({
    isOrbitsVisible: () => orbitsCheckbox?.checked ?? false,
    setOrbitsVisible: (visible) => {
      if (orbitsCheckbox) orbitsCheckbox.checked = visible;
      renderer.setOrbitsVisible(visible);
    },
    focusOrbit: (bodyIndex) => renderer.focusOrbit(bodyIndex),
    computeOrbits: () => void renderer.computeOrbits(engine, currentDate),
    saveOrbitsVisible: (visible) => settingsSaver.save({ orbitsVisible: visible }),
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
        orbitFocus?.resetFocus();
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
        const isOrbital = viewModeManager?.getMode() === 'orbital';
        if (isOrbital) {
          renderer.setOrbitalMode(horizonCheckbox.checked);
        } else {
          renderer.setGroundPlaneVisible(horizonCheckbox.checked);
        }
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
    focusSearch: () => document.getElementById("search")?.focus(),
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
    // Update scintillation for topocentric mode
    if (viewModeManager.getMode() === 'topocentric') {
      const gmst = computeGMST(currentDate);
      const lst = gmst + settings.observerLongitude; // LST in degrees
      renderer.updateScintillation(settings.observerLatitude, lst);
    }
    // Update Earth position/rotation for orbital mode
    if (viewModeManager.getMode() === 'orbital') {
      // Get Hubble's position (index 1) to compute nadir direction
      const hubblePos = renderer.getSatellitePosition(1, engine);
      if (hubblePos) {
        // Nadir is opposite to satellite position (toward Earth center)
        const nadir = new THREE.Vector3(-hubblePos.x, -hubblePos.y, -hubblePos.z).normalize();
        renderer.updateEarthPosition(nadir);
      }
      renderer.updateEarthRotation(currentDate, settings.observerLongitude);

      // Update Sun direction for day/night terminator
      const bodyPos = getBodyPositionsFromEngine(engine);
      const sunPos = bodyPos.get("Sun");
      if (sunPos) {
        renderer.updateEarthSunDirection(sunPos);
      }

      // Hide labels occluded by Earth
      renderer.updateLabelOcclusion();

      // Hide video markers occluded by Earth
      videoMarkers.updateOcclusion(renderer.isOccludedByEarth);
    }
    renderer.render();
  }

  // Enable scintillation if starting in topocentric mode
  if (settings.viewMode === 'topocentric') {
    renderer.setScintillationEnabled(true);
  }

  // Enable orbital mode if starting in that mode
  if (settings.viewMode === 'orbital') {
    renderer.setOrbitalMode(true);
  }

  animate();

  // Force a full update after first render frame to ensure everything is initialized
  // This fixes issues where planetary moons or other elements don't render until interaction
  requestAnimationFrame(() => {
    renderer.updateFromEngine(engine, settings.fov);
    updateRenderedStars();

    // Initial eclipse detection
    const initialBodyPos = getBodyPositionsFromEngine(engine);
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
