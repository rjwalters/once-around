import "./styles.css";
import * as THREE from "three";
import { createEngine, getBodiesPositionBuffer, getMinorBodiesBuffer, getCometsBuffer, loadAllSatelliteEphemerides } from "./engine";
import { createRenderer } from "./renderer";
import { createCelestialControls } from "./controls";
import { setupUI, applyTimeToEngine } from "./ui";
import { createVideoMarkersLayer, createVideoPopup, type VideoPlacement } from "./videos";
import { loadSettings, createSettingsSaver } from "./settings";
import { createLocationManager, type ObserverLocation } from "./location";
import type { SkyEngine } from "./wasm/sky_engine";
import { createTimeControls } from "./time-controls";
import { setupSimpleModal, setupModalClose } from "./modal-utils";
import { createViewModeManager } from "./view-mode";
import { formatLST } from "./coordinate-utils";
import { createARModeManager } from "./ar-mode";
import { createLocationUI } from "./location-ui";
import { setupTourUI } from "./tour-ui";
import { getTourById } from "./tourData";
import { createCoordinateDisplay } from "./coordinate-display";
import { setupVideoMarkerInteractions } from "./video-marker-interactions";
import { createEclipseHandler } from "./eclipse-handler";
import { setupInfoModals } from "./info-modals";
import { setupKeyboardHandler } from "./keyboard-handler";
import { setupOrbitFocus } from "./orbit-focus";
import { readUrlState, createUrlStateUpdater } from "./url-state";
import { ISSPassesUI } from "./iss-passes-ui";
import {
  getBodyPositions,
  positionToRaDec,
  calculateSunMoonSeparation,
  type BodyPositions,
} from "./body-positions";
import { setupTourSystem } from "./tour-setup";
import { setupSearch } from "./search-setup";
import { createAnimationLoop } from "./animation-loop";

// Build-time constants injected by Vite
declare const __BUILD_TIME__: string;
declare const __GIT_COMMIT__: string;

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
  let locationManagerRef: {
    getLocation: () => { latitude: number; longitude: number; name?: string };
    setLocation: (location: { latitude: number; longitude: number; name?: string }) => void;
  } | null = null;

  // View mode manager holder - set later when viewModeManager is created
  let viewModeManagerRef: {
    getMode: () => 'geocentric' | 'topocentric' | 'hubble' | 'jwst';
    lockAndSetMode: (mode: 'geocentric' | 'topocentric' | 'hubble' | 'jwst') => 'geocentric' | 'topocentric' | 'hubble' | 'jwst';
    unlockAndRestoreMode: (mode: 'geocentric' | 'topocentric' | 'hubble' | 'jwst') => void;
  } | null = null;

  // Track current date (set later after initialization)
  let currentDate = new Date();

  const { tourEngine, handleTourInterrupt } = setupTourSystem({
    engine,
    renderer,
    controls,
    getViewModeManager: () => viewModeManagerRef,
    getBodyPositions: () => getBodyPositionsFromEngine(engine),
    getCurrentDate: () => currentDate,
    getLocationManager: () => locationManagerRef,
    getDefaultLocation: () => ({
      latitude: settings.observerLatitude,
      longitude: settings.observerLongitude,
    }),
    getMagnitude: () => {
      const magInput = document.getElementById("magnitude") as HTMLInputElement | null;
      return magInput ? parseFloat(magInput.value) : 6.5;
    },
  });

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
  // This initialDate will be used for currentDate to ensure consistency
  let initialDate = new Date(); // Default to now
  const initialDateStr = urlState.t ?? settings.datetime;
  if (initialDateStr) {
    try {
      const savedDate = new Date(initialDateStr);
      if (!isNaN(savedDate.getTime())) {
        initialDate = savedDate;
      }
    } catch {
      // Ignore invalid date, use default
    }
  }

  // Set the datetime input to show the initial date in local time
  if (datetimeInput) {
    const year = initialDate.getFullYear();
    const month = String(initialDate.getMonth() + 1).padStart(2, "0");
    const day = String(initialDate.getDate()).padStart(2, "0");
    const hours = String(initialDate.getHours()).padStart(2, "0");
    const minutes = String(initialDate.getMinutes()).padStart(2, "0");
    datetimeInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  // Apply the initial date to the engine
  applyTimeToEngine(engine, initialDate);
  engine.recompute();

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
    updateRenderer: () => renderer.updateFromEngine(engine, renderer.camera.fov),
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

  // ISS Passes UI (initialized after ephemerides load)
  let issPassesUI: ISSPassesUI | null = null;

  // Load satellite ephemerides in background (non-blocking)
  // Store promise so search index can rebuild after satellites are available
  const satellitesLoadedPromise = loadAllSatelliteEphemerides(engine).then(() => {
    console.log("Satellite ephemerides loaded - satellite tracking enabled");
    // Trigger an update to show satellites if they're currently visible
    renderer.updateFromEngine(engine, renderer.camera.fov);

    // Initialize ISS pass predictions UI
    issPassesUI = new ISSPassesUI({
      containerId: 'iss-passes-section',
      onPassClick: (pass) => {
        // Jump to the pass rise time
        const datetimeInput = document.getElementById("datetime") as HTMLInputElement;
        if (datetimeInput) {
          // Format date for datetime-local input
          const d = pass.riseTime;
          const pad = (n: number) => n.toString().padStart(2, '0');
          const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          datetimeInput.value = dateStr;
          datetimeInput.dispatchEvent(new Event('change'));
        }
      },
      minAltitude: 10,
      maxPasses: 10
    });
    issPassesUI.setEngine(engine);
    // Show if already in topocentric mode (viewModeManager may have been set up by now)
    const currentMode = settings.viewMode ?? 'geocentric';
    const urlViewMode = urlState.view === 'topo' ? 'topocentric' : urlState.view === 'geo' ? 'geocentric' : urlState.view;
    issPassesUI.setVisible((urlViewMode || currentMode) === 'topocentric');
  });

  // Update currentDate to use initialDate from restoration
  currentDate = initialDate;

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
      renderer.updateFromEngine(engine, renderer.camera.fov);
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
      // Update meteor showers (radiant positions drift slightly, activity changes with date)
      renderer.updateMeteorShowers(date);

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
      renderer.updateFromEngine(engine, renderer.camera.fov);
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

  // Deep fields (Hubble/JWST imagery) checkbox
  const deepFieldsCheckbox = document.getElementById("deep-fields") as HTMLInputElement | null;
  if (deepFieldsCheckbox) {
    // Restore from settings
    deepFieldsCheckbox.checked = settings.deepFieldsVisible ?? false;
    renderer.setDeepFieldsVisible(settings.deepFieldsVisible ?? false);

    // Initialize deep field positions if restored as visible
    if (settings.deepFieldsVisible) {
      const currentFov = controls.getCameraState().fov;
      renderer.updateDeepFields(currentFov);
    }

    deepFieldsCheckbox.addEventListener("change", () => {
      renderer.setDeepFieldsVisible(deepFieldsCheckbox.checked);
      // Update deep fields immediately when toggled on
      if (deepFieldsCheckbox.checked) {
        const currentFov = controls.getCameraState().fov;
        renderer.updateDeepFields(currentFov);
      }
      settingsSaver.save({ deepFieldsVisible: deepFieldsCheckbox.checked });
    });
  }

  // Meteor showers checkbox
  const meteorShowersCheckbox = document.getElementById("meteor-showers") as HTMLInputElement | null;
  if (meteorShowersCheckbox) {
    // Restore from settings
    meteorShowersCheckbox.checked = settings.meteorShowersVisible ?? false;
    renderer.setMeteorShowersVisible(settings.meteorShowersVisible ?? false);

    // Initialize meteor shower positions if restored as visible
    if (settings.meteorShowersVisible) {
      renderer.updateMeteorShowers(currentDate);
    }

    meteorShowersCheckbox.addEventListener("change", () => {
      renderer.setMeteorShowersVisible(meteorShowersCheckbox.checked);
      // Update meteor showers immediately when toggled on
      if (meteorShowersCheckbox.checked) {
        renderer.updateMeteorShowers(currentDate);
      }
      settingsSaver.save({ meteorShowersVisible: meteorShowersCheckbox.checked });
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
      const isHubble = viewModeManager?.getMode() === 'hubble';
      if (isHubble) {
        // In Hubble mode, toggle Earth visibility
        renderer.setHubbleMode(horizonCheckbox.checked);
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
      // Show/hide ISS pass predictions (only relevant in topocentric mode)
      if (issPassesUI) {
        issPassesUI.setVisible(mode === 'topocentric');
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
    // Space telescope mode callbacks
    onHubbleModeChange: (enabled) => {
      renderer.setHubbleMode(enabled);
    },
    onJWSTModeChange: (enabled) => {
      renderer.setJWSTMode(enabled);
    },
    onScintillationChange: (enabled) => {
      renderer.setScintillationEnabled(enabled);
    },
    onResetVideoOcclusion: () => {
      videoMarkers.resetOcclusion();
    },
  });

  // Set the reference for tour system to use
  viewModeManagerRef = viewModeManager;

  viewModeManager.setupEventListeners();

  // Apply view mode from URL if specified (overrides saved settings)
  if (urlState.view) {
    const viewModeMap: Record<string, 'geocentric' | 'topocentric' | 'hubble' | 'jwst'> = {
      'geo': 'geocentric',
      'topo': 'topocentric',
      'hubble': 'hubble',
      'jwst': 'jwst',
    };
    const targetMode = viewModeMap[urlState.view];
    if (targetMode) {
      viewModeManager.setMode(targetMode);
    }
  }

  // Show seeing control, LST display, ISS passes, and enable horizon culling if starting in topocentric mode
  // URL view param takes precedence over saved settings
  const effectiveViewMode = urlState.view
    ? (urlState.view === 'topo' ? 'topocentric' : urlState.view === 'geo' ? 'geocentric' : urlState.view === 'hubble' ? 'hubble' : 'jwst')
    : settings.viewMode;
  if (effectiveViewMode === 'topocentric') {
    if (seeingControl) {
      seeingControl.style.display = 'block';
    }
    const lstContainer = document.getElementById("location-lst-container");
    if (lstContainer) {
      lstContainer.style.display = 'block';
    }
    renderer.setHorizonCulling(true);
    // Show ISS passes panel (will be populated once ephemeris loads)
    if (issPassesUI) {
      issPassesUI.setVisible(true);
    }
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
        // Refresh ISS pass predictions for new location
        if (issPassesUI) {
          issPassesUI.refresh();
        }
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
  const { searchUI, navigateToUrlObject } = setupSearch({
    engine,
    controls,
    getBodyPositions: () => getBodyPositionsFromEngine(engine),
    getEarthPositionJWST: () => renderer.getEarthPositionJWST(),
    getViewMode: () => viewModeManager.getMode(),
    satellitesLoadedPromise,
  });
  searchUI.setupEventListeners();

  // Handle object URL parameter (deep linking)
  if (urlState.object) {
    navigateToUrlObject(urlState.object);
  }

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
    toggleDeepFields: () => {
      if (deepFieldsCheckbox) {
        deepFieldsCheckbox.checked = !deepFieldsCheckbox.checked;
        renderer.setDeepFieldsVisible(deepFieldsCheckbox.checked);
        if (deepFieldsCheckbox.checked) {
          const currentFov = controls.getCameraState().fov;
          renderer.updateDeepFields(currentFov);
        }
        settingsSaver.save({ deepFieldsVisible: deepFieldsCheckbox.checked });
      }
    },
    toggleMeteorShowers: () => {
      if (meteorShowersCheckbox) {
        meteorShowersCheckbox.checked = !meteorShowersCheckbox.checked;
        renderer.setMeteorShowersVisible(meteorShowersCheckbox.checked);
        if (meteorShowersCheckbox.checked) {
          renderer.updateMeteorShowers(currentDate);
        }
        settingsSaver.save({ meteorShowersVisible: meteorShowersCheckbox.checked });
      }
    },
    toggleNightVision: () => {
      setNightVision(!document.body.classList.contains("night-vision"));
    },
    toggleHorizon: () => {
      if (horizonCheckbox) {
        horizonCheckbox.checked = !horizonCheckbox.checked;
        const isHubble = viewModeManager?.getMode() === 'hubble';
        if (isHubble) {
          renderer.setHubbleMode(horizonCheckbox.checked);
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
    disableARMode: () => arModeManager.disable(),
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
  const animate = createAnimationLoop({
    controls,
    tourEngine,
    renderer,
    videoMarkers,
    getViewMode: () => viewModeManager.getMode(),
    getCurrentDate: () => currentDate,
    getObserverLocation: () => ({
      latitude: settings.observerLatitude,
      longitude: settings.observerLongitude,
    }),
    getBodyPositions: () => getBodyPositionsFromEngine(engine),
    engine,
  });

  // Enable scintillation if starting in topocentric mode
  if (settings.viewMode === 'topocentric') {
    renderer.setScintillationEnabled(true);
  }

  // Enable Hubble mode if starting in that mode
  if (settings.viewMode === 'hubble') {
    renderer.setHubbleMode(true);
  }

  // Enable JWST mode if starting in that mode
  if (settings.viewMode === 'jwst') {
    renderer.setJWSTMode(true);
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

    // Hide loading overlay
    const loadingOverlay = document.getElementById("loading");
    if (loadingOverlay) {
      loadingOverlay.classList.add("hidden");
      // Remove from DOM after fade out
      setTimeout(() => loadingOverlay.remove(), 500);
    }

    // Auto-start tour from URL parameter (e.g., ?tour=sn-1054)
    if (urlState.tour) {
      const tour = getTourById(urlState.tour);
      if (tour) {
        console.log(`Starting tour from URL: ${urlState.tour}`);
        arModeManager.disable();
        tourEngine.play(tour);
      } else {
        console.warn(`Tour not found: ${urlState.tour}`);
      }
    }
  });

  console.log("Once Around ready!");
}

main().catch((err) => {
  console.error("Failed to initialize:", err);
  // Hide loading overlay on error
  const loadingOverlay = document.getElementById("loading");
  if (loadingOverlay) {
    loadingOverlay.remove();
  }
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

// Register service worker for offline support (PWA)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("Service worker registered:", registration.scope);

        // Check for updates
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                // New content available, could prompt user to refresh
                console.log("New version available - refresh to update");
              }
            });
          }
        });
      })
      .catch((error) => {
        console.log("Service worker registration failed:", error);
      });
  });
}
