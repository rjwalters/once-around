import * as THREE from "three";
import { createEngine, getBodiesPositionBuffer } from "./engine";
import { createRenderer } from "./renderer";
import { createCelestialControls } from "./controls";
import { setupUI, applyTimeToEngine } from "./ui";
import { createVideoMarkersLayer, createVideoPopup, type VideoPlacement, type BodyPositions } from "./videos";
import { STAR_DATA, type StarInfo } from "./starData";
import { CONSTELLATION_DATA, type ConstellationInfo } from "./constellationData";
import { loadSettings, createSettingsSaver } from "./settings";
import { search, TYPE_COLORS, CONSTELLATION_CENTERS, type SearchItem, type SearchResult } from "./search";
import type { SkyEngine } from "./wasm/sky_engine";

// Body names in the order they appear in the position buffer
const BODY_NAMES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"];
const SKY_RADIUS = 50;

// Build a map of body names to their current 3D positions
function getBodyPositions(engine: SkyEngine): BodyPositions {
  const bodyPositions = getBodiesPositionBuffer(engine);
  const positions: BodyPositions = new Map();
  // Use SKY_RADIUS - 0.5 to match video marker positioning
  const radius = SKY_RADIUS - 0.5;

  for (let i = 0; i < BODY_NAMES.length; i++) {
    const x = bodyPositions[i * 3];
    const y = bodyPositions[i * 3 + 1];
    const z = bodyPositions[i * 3 + 2];
    // Normalize and scale to sky sphere radius
    const pos = new THREE.Vector3(x, y, z).normalize().multiplyScalar(radius);
    positions.set(BODY_NAMES[i], pos);
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

  // RA is the angle in the XZ plane from the X axis
  let ra = Math.atan2(normalized.z, normalized.x) * (180 / Math.PI);
  if (ra < 0) ra += 360;

  return { ra, dec };
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

  // Create Three.js renderer
  const renderer = createRenderer(container);

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

  // Update rendered star count display
  const renderedStarsEl = document.getElementById("rendered-stars");
  function updateRenderedStars(): void {
    if (renderedStarsEl) {
      renderedStarsEl.textContent = renderer.getRenderedStarCount().toLocaleString();
    }
  }
  updateRenderedStars();

  // Debounced star LOD update for zooming (updateFromEngine is expensive)
  let fovUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
  let pendingFov: number | null = null;

  function debouncedFovUpdate(fov: number): void {
    pendingFov = fov;
    if (fovUpdateTimeout === null) {
      fovUpdateTimeout = setTimeout(() => {
        if (pendingFov !== null) {
          renderer.updateFromEngine(engine, pendingFov);
          updateRenderedStars();
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
  const timeStepUnits = [
    { label: "1h", ms: 60 * 60 * 1000, description: "1 hour - watch Jupiter's moons move" },
    { label: "1d", ms: 24 * 60 * 60 * 1000, description: "1 day - watch planets move against stars" },
    { label: "1w", ms: 7 * 24 * 60 * 60 * 1000, description: "1 week - watch outer planets and retrograde" },
  ];
  let currentStepIndex = 0;

  const timeBackBtn = document.getElementById("time-back");
  const timeForwardBtn = document.getElementById("time-forward");
  const timePlayBtn = document.getElementById("time-play");
  const timeStepUnitBtn = document.getElementById("time-step-unit");

  // Play/pause state
  let isPlaying = false;
  let playInterval: ReturnType<typeof setInterval> | null = null;
  const PLAY_INTERVAL_MS = 200; // Step every 200ms when playing

  function stepTime(direction: 1 | -1): void {
    if (!datetimeInput) return;
    const currentStep = timeStepUnits[currentStepIndex];
    const currentTime = datetimeInput.value ? new Date(datetimeInput.value) : new Date();
    const newTime = new Date(currentTime.getTime() + direction * currentStep.ms);

    // Update the datetime input
    const year = newTime.getFullYear();
    const month = String(newTime.getMonth() + 1).padStart(2, "0");
    const day = String(newTime.getDate()).padStart(2, "0");
    const hours = String(newTime.getHours()).padStart(2, "0");
    const minutes = String(newTime.getMinutes()).padStart(2, "0");
    datetimeInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;

    // Trigger the change event to update the engine
    datetimeInput.dispatchEvent(new Event("change"));
  }

  function startPlayback(): void {
    if (isPlaying) return;
    isPlaying = true;
    if (timePlayBtn) {
      timePlayBtn.textContent = "⏸";
      timePlayBtn.classList.add("playing");
    }
    playInterval = setInterval(() => stepTime(1), PLAY_INTERVAL_MS);
  }

  function stopPlayback(): void {
    if (!isPlaying) return;
    isPlaying = false;
    if (timePlayBtn) {
      timePlayBtn.textContent = "▶";
      timePlayBtn.classList.remove("playing");
    }
    if (playInterval) {
      clearInterval(playInterval);
      playInterval = null;
    }
  }

  function togglePlayback(): void {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }

  function cycleStepUnit(): void {
    currentStepIndex = (currentStepIndex + 1) % timeStepUnits.length;
    if (timeStepUnitBtn) {
      timeStepUnitBtn.textContent = timeStepUnits[currentStepIndex].label;
      timeStepUnitBtn.title = timeStepUnits[currentStepIndex].description;
    }
  }

  if (timeBackBtn) {
    timeBackBtn.addEventListener("click", () => {
      stopPlayback(); // Stop playback when manually stepping
      stepTime(-1);
    });
  }
  if (timeForwardBtn) {
    timeForwardBtn.addEventListener("click", () => {
      stopPlayback(); // Stop playback when manually stepping
      stepTime(1);
    });
  }
  if (timePlayBtn) {
    timePlayBtn.addEventListener("click", togglePlayback);
  }
  if (timeStepUnitBtn) {
    timeStepUnitBtn.addEventListener("click", cycleStepUnit);
    timeStepUnitBtn.title = timeStepUnits[currentStepIndex].description;
  }

  // Stop playback when user manually changes the datetime input
  if (datetimeInput) {
    datetimeInput.addEventListener("focus", stopPlayback);
  }

  // Update display after restoring settings (pass saved FOV for consistent LOD)
  renderer.updateFromEngine(engine, settings.fov);
  renderer.setMilkyWayVisibility(settings.magnitude);

  // Track current date for orbit computation (updated in onTimeChange)
  let currentDate = settings.datetime ? new Date(settings.datetime) : new Date();

  // Setup UI
  setupUI(engine, {
    onTimeChange: (date: Date) => {
      currentDate = date;
      applyTimeToEngine(engine, date);
      engine.recompute();
      renderer.updateFromEngine(engine);
      updateRenderedStars();
      // Recompute orbits if they are visible
      if (orbitsCheckbox?.checked) {
        void renderer.computeOrbits(engine, currentDate);
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

  // ---------------------------------------------------------------------------
  // Search functionality
  // ---------------------------------------------------------------------------
  const searchInput = document.getElementById("search") as HTMLInputElement | null;
  const searchResults = document.getElementById("search-results");
  let searchIndex: SearchItem[] = [];
  let selectedResultIndex = -1;

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

  // Render search results dropdown
  function renderSearchResults(results: SearchResult[]): void {
    if (!searchResults) return;

    if (results.length === 0) {
      searchResults.innerHTML = '<div class="search-empty">No results found</div>';
      searchResults.classList.add("visible");
      return;
    }

    searchResults.innerHTML = results.map((result, i) => `
      <div class="search-result${i === selectedResultIndex ? ' selected' : ''}" data-index="${i}">
        <div class="search-result-dot" style="background: ${TYPE_COLORS[result.type]}"></div>
        <div class="search-result-info">
          <div class="search-result-name">${result.name}</div>
          ${result.subtitle ? `<div class="search-result-subtitle">${result.subtitle}</div>` : ''}
        </div>
        <div class="search-result-type">${result.type}</div>
      </div>
    `).join('');

    searchResults.classList.add("visible");
  }

  // Hide search results
  function hideSearchResults(): void {
    if (searchResults) {
      searchResults.classList.remove("visible");
      searchResults.innerHTML = '';
    }
    selectedResultIndex = -1;
  }

  // Navigate to a search result
  function navigateToResult(result: SearchResult): void {
    controls.animateToRaDec(result.ra, result.dec, 1000);
    hideSearchResults();
    if (searchInput) {
      searchInput.value = '';
      searchInput.blur();
    }
  }

  // Initialize search
  buildSearchIndex().then(index => {
    searchIndex = index;
    console.log(`Search index built: ${index.length} items`);
  });

  // Search input event handlers
  if (searchInput && searchResults) {
    let currentResults: SearchResult[] = [];

    searchInput.addEventListener("input", () => {
      const query = searchInput.value.trim();
      if (query.length === 0) {
        hideSearchResults();
        currentResults = [];
        return;
      }

      currentResults = search(query, searchIndex, 8);
      selectedResultIndex = currentResults.length > 0 ? 0 : -1;
      renderSearchResults(currentResults);
    });

    searchInput.addEventListener("keydown", (e) => {
      if (currentResults.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          selectedResultIndex = Math.min(selectedResultIndex + 1, currentResults.length - 1);
          renderSearchResults(currentResults);
          break;
        case "ArrowUp":
          e.preventDefault();
          selectedResultIndex = Math.max(selectedResultIndex - 1, 0);
          renderSearchResults(currentResults);
          break;
        case "Enter":
          e.preventDefault();
          if (selectedResultIndex >= 0 && selectedResultIndex < currentResults.length) {
            navigateToResult(currentResults[selectedResultIndex]);
          }
          break;
        case "Escape":
          hideSearchResults();
          searchInput.blur();
          break;
      }
    });

    searchInput.addEventListener("blur", () => {
      // Delay hiding to allow click events on results
      setTimeout(hideSearchResults, 150);
    });

    // Click on search result
    searchResults.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest(".search-result");
      if (target) {
        const index = parseInt(target.getAttribute("data-index") || "-1", 10);
        if (index >= 0 && index < currentResults.length) {
          navigateToResult(currentResults[index]);
        }
      }
    });
  }

  // About modal
  const aboutBtn = document.getElementById("about-btn");
  const aboutModal = document.getElementById("about-modal");
  const aboutClose = document.getElementById("about-close");

  if (aboutBtn && aboutModal && aboutClose) {
    aboutBtn.addEventListener("click", () => {
      aboutModal.classList.remove("hidden");
    });

    aboutClose.addEventListener("click", () => {
      aboutModal.classList.add("hidden");
    });

    aboutModal.addEventListener("click", (e) => {
      if (e.target === aboutModal) {
        aboutModal.classList.add("hidden");
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Star info popup
  // ---------------------------------------------------------------------------
  const starModal = document.getElementById("star-modal");
  const starModalClose = document.getElementById("star-modal-close");
  const starModalName = document.getElementById("star-modal-name");
  const starModalDesignation = document.getElementById("star-modal-designation");
  const starModalConstellation = document.getElementById("star-modal-constellation");
  const starModalMagnitude = document.getElementById("star-modal-magnitude");
  const starModalDistance = document.getElementById("star-modal-distance");
  const starModalType = document.getElementById("star-modal-type");
  const starModalDescription = document.getElementById("star-modal-description");

  function showStarInfo(hr: number): void {
    const info = STAR_DATA[hr];
    if (!info || !starModal) return;

    if (starModalName) starModalName.textContent = info.name;
    if (starModalDesignation) starModalDesignation.textContent = info.designation;
    if (starModalConstellation) starModalConstellation.textContent = info.constellation;
    if (starModalMagnitude) starModalMagnitude.textContent = info.magnitude.toFixed(2);
    if (starModalDistance) starModalDistance.textContent = info.distance;
    if (starModalType) starModalType.textContent = info.type;
    if (starModalDescription) starModalDescription.textContent = info.description;

    starModal.classList.remove("hidden");
  }

  // Close star modal
  if (starModal && starModalClose) {
    starModalClose.addEventListener("click", () => {
      starModal.classList.add("hidden");
    });

    starModal.addEventListener("click", (e) => {
      if (e.target === starModal) {
        starModal.classList.add("hidden");
      }
    });
  }

  // Handle clicks on star labels (using event delegation)
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains("star-label") && target.dataset.hr) {
      const hr = parseInt(target.dataset.hr, 10);
      if (!isNaN(hr)) {
        showStarInfo(hr);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Constellation info popup
  // ---------------------------------------------------------------------------
  const constellationModal = document.getElementById("constellation-modal");
  const constellationModalClose = document.getElementById("constellation-modal-close");
  const constellationModalName = document.getElementById("constellation-modal-name");
  const constellationModalAbbr = document.getElementById("constellation-modal-abbr");
  const constellationModalMeaning = document.getElementById("constellation-modal-meaning");
  const constellationModalStar = document.getElementById("constellation-modal-star");
  const constellationModalArea = document.getElementById("constellation-modal-area");
  const constellationModalViewing = document.getElementById("constellation-modal-viewing");
  const constellationModalQuadrant = document.getElementById("constellation-modal-quadrant");
  const constellationModalObjectsContainer = document.getElementById("constellation-modal-objects-container");
  const constellationModalObjects = document.getElementById("constellation-modal-objects");
  const constellationModalDescription = document.getElementById("constellation-modal-description");

  function showConstellationInfo(name: string): void {
    const info = CONSTELLATION_DATA[name];
    if (!info || !constellationModal) return;

    if (constellationModalName) constellationModalName.textContent = info.name;
    if (constellationModalAbbr) constellationModalAbbr.textContent = info.abbreviation;
    if (constellationModalMeaning) constellationModalMeaning.textContent = info.meaning;
    if (constellationModalStar) constellationModalStar.textContent = info.brightestStar;
    if (constellationModalArea) constellationModalArea.textContent = `${info.areaSqDeg} sq°`;
    if (constellationModalViewing) constellationModalViewing.textContent = info.bestViewing;
    if (constellationModalQuadrant) constellationModalQuadrant.textContent = info.quadrant;

    // Show/hide notable objects section based on whether there are any
    if (constellationModalObjectsContainer && constellationModalObjects) {
      if (info.notableObjects.length > 0) {
        constellationModalObjects.textContent = info.notableObjects.join(", ");
        constellationModalObjectsContainer.style.display = "block";
      } else {
        constellationModalObjectsContainer.style.display = "none";
      }
    }

    if (constellationModalDescription) constellationModalDescription.textContent = info.description;

    constellationModal.classList.remove("hidden");
  }

  // Close constellation modal
  if (constellationModal && constellationModalClose) {
    constellationModalClose.addEventListener("click", () => {
      constellationModal.classList.add("hidden");
    });

    constellationModal.addEventListener("click", (e) => {
      if (e.target === constellationModal) {
        constellationModal.classList.add("hidden");
      }
    });
  }

  // Handle clicks on constellation labels (using event delegation)
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains("constellation-label") && target.dataset.constellation) {
      showConstellationInfo(target.dataset.constellation);
    }
  });

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

  // Click handling for video markers
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  renderer.renderer.domElement.addEventListener("click", (event) => {
    // Only process if videos layer is visible
    if (!videoMarkers.group.visible) return;

    // Calculate mouse position in normalized device coordinates
    const rect = renderer.renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update raycaster
    raycaster.setFromCamera(mouse, renderer.camera);

    // Check for video marker intersection
    const video = videoMarkers.getVideoAtPosition(raycaster);
    if (video) {
      // Center camera on the video's celestial coordinates
      controls.lookAtRaDec(video.ra, video.dec);
      videoPopup.show(video);
    }
  });

  // Hover detection for video markers - change cursor to pointer
  let isHoveringVideo = false;
  renderer.renderer.domElement.addEventListener("mousemove", (event) => {
    // Only process if videos layer is visible
    if (!videoMarkers.group.visible) {
      if (isHoveringVideo) {
        renderer.renderer.domElement.style.cursor = "grab";
        isHoveringVideo = false;
      }
      return;
    }

    // Calculate mouse position in normalized device coordinates
    const rect = renderer.renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update raycaster
    raycaster.setFromCamera(mouse, renderer.camera);

    // Check for video marker intersection
    const video = videoMarkers.getVideoAtPosition(raycaster);
    if (video) {
      if (!isHoveringVideo) {
        renderer.renderer.domElement.style.cursor = "pointer";
        isHoveringVideo = true;
      }
    } else {
      if (isHoveringVideo) {
        renderer.renderer.domElement.style.cursor = "grab";
        isHoveringVideo = false;
      }
    }
  });

  // Handle window resize
  window.addEventListener("resize", () => {
    renderer.resize(window.innerWidth, window.innerHeight);
  });

  // Keyboard shortcuts
  window.addEventListener("keydown", (event) => {
    // Don't trigger shortcuts when typing in input fields
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (event.key.toLowerCase()) {
      case "l":
        // Toggle labels
        if (labelsCheckbox) {
          labelsCheckbox.checked = !labelsCheckbox.checked;
          renderer.setLabelsVisible(labelsCheckbox.checked);
          settingsSaver.save({ labelsVisible: labelsCheckbox.checked });
        }
        break;
      case "c":
        // Toggle constellations
        if (constellationCheckbox) {
          constellationCheckbox.checked = !constellationCheckbox.checked;
          renderer.setConstellationsVisible(constellationCheckbox.checked);
          settingsSaver.save({ constellationsVisible: constellationCheckbox.checked });
        }
        break;
      case "v":
        // Toggle videos
        if (videosCheckbox) {
          videosCheckbox.checked = !videosCheckbox.checked;
          videoMarkers.setVisible(videosCheckbox.checked);
          videoMarkers.setLabelsVisible(videosCheckbox.checked);
          settingsSaver.save({ videosVisible: videosCheckbox.checked });
        }
        break;
      case "o":
        // Toggle orbits
        if (orbitsCheckbox) {
          orbitsCheckbox.checked = !orbitsCheckbox.checked;
          renderer.setOrbitsVisible(orbitsCheckbox.checked);
          // Compute orbits when turning on
          if (orbitsCheckbox.checked) {
            void renderer.computeOrbits(engine, currentDate);
          }
          // Clear any focused orbit when toggling
          focusedOrbitBody = null;
          settingsSaver.save({ orbitsVisible: orbitsCheckbox.checked });
        }
        break;
      case " ":
        // Spacebar: animate to galactic center (RA ~266.4°, Dec ~-29°)
        event.preventDefault();
        controls.animateToRaDec(266.4, -29, 1500);
        break;
      case "arrowleft":
        // Step time backward
        event.preventDefault();
        stopPlayback();
        stepTime(-1);
        break;
      case "arrowright":
        // Step time forward
        event.preventDefault();
        stopPlayback();
        stepTime(1);
        break;
      case "p":
        // Toggle play/pause
        togglePlayback();
        break;
      case "/":
        // Focus search
        event.preventDefault();
        if (searchInput) {
          searchInput.focus();
        }
        break;
    }
  });

  // Flush settings before page unload
  window.addEventListener("beforeunload", () => {
    settingsSaver.flush();
  });

  // Coordinate display elements
  const coordRaEl = document.getElementById("coord-ra");
  const coordDecEl = document.getElementById("coord-dec");
  const coordFovEl = document.getElementById("coord-fov");
  const referenceCircle = document.getElementById("reference-circle");

  // Reference circle size in arcseconds
  const REFERENCE_ARCSEC = 50;

  /**
   * Format RA in hours/minutes (e.g., "12h 34m")
   */
  function formatRA(raDeg: number): string {
    const raHours = raDeg / 15; // 360° = 24h
    const h = Math.floor(raHours);
    const m = Math.floor((raHours - h) * 60);
    return `${h}h ${m.toString().padStart(2, "0")}m`;
  }

  /**
   * Format Dec in degrees/arcminutes (e.g., "+45° 30'")
   */
  function formatDec(decDeg: number): string {
    const sign = decDeg >= 0 ? "+" : "-";
    const absDec = Math.abs(decDeg);
    const d = Math.floor(absDec);
    const m = Math.floor((absDec - d) * 60);
    return `${sign}${d}° ${m.toString().padStart(2, "0")}'`;
  }

  /**
   * Update the reference circle size based on current FOV.
   * The circle represents REFERENCE_ARCSEC arcseconds.
   * Only shown when FOV < 5° (where it becomes useful for comparison).
   */
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

  function updateCoordinates(): void {
    const { ra, dec } = controls.getRaDec();
    const { fov } = controls.getCameraState();
    if (coordRaEl) coordRaEl.textContent = formatRA(ra);
    if (coordDecEl) coordDecEl.textContent = formatDec(dec);
    if (coordFovEl) {
      // Show decimal for small FOVs
      if (fov < 1) {
        coordFovEl.textContent = `${fov.toFixed(2)}°`;
      } else if (fov < 10) {
        coordFovEl.textContent = `${fov.toFixed(1)}°`;
      } else {
        coordFovEl.textContent = `${Math.round(fov)}°`;
      }
    }
    updateReferenceCircle(fov);
  }

  // Update coordinates initially
  updateCoordinates();

  // Update coordinates on camera change
  const originalOnCameraChange = controls.onCameraChange;
  controls.onCameraChange = () => {
    originalOnCameraChange?.();
    updateCoordinates();
  };

  // Animation loop
  function animate(): void {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render();
  }

  animate();

  // Force a full update after first render frame to ensure everything is initialized
  // This fixes issues where planetary moons or other elements don't render until interaction
  requestAnimationFrame(() => {
    renderer.updateFromEngine(engine, settings.fov);
    updateRenderedStars();
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
