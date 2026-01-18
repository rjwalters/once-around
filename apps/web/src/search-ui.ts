/**
 * Search UI management - rendering results, keyboard navigation.
 */

import { search, TYPE_COLORS, type SearchItem, type SearchResult } from "./search";
import { showToast } from "./toast";

// Satellite name to index mapping (must match engine.ts SATELLITES order)
const SATELLITE_NAME_TO_INDEX: Record<string, number> = {
  "ISS": 0,
  "International Space Station": 0,
  "Hubble": 1,
  "Hubble Space Telescope": 1,
};

export interface SearchUIOptions {
  getSearchIndex: () => SearchItem[];
  navigateToResult: (result: SearchResult) => void;
  getPlanetPosition: (name: string) => { ra: number; dec: number } | null;
  getSatellitePosition?: (index: number) => { ra: number; dec: number } | null;
  // Legacy - will use getSatellitePosition(0) if available
  getISSPosition?: () => { ra: number; dec: number } | null;
  // Earth position for JWST mode (dynamic lookup)
  getEarthPosition?: () => { ra: number; dec: number } | null;
  // Planetary moon position (dynamic lookup - they orbit quickly)
  getPlanetaryMoonPosition?: (name: string) => { ra: number; dec: number } | null;
  // Check if in JWST view mode
  isJWSTMode?: () => boolean;
  // Get Moon's geocentric position (for JWST mode offset calculation)
  getMoonPosition?: () => { ra: number; dec: number } | null;
  // Get Sun's geocentric position (for JWST mode offset calculation)
  getSunPosition?: () => { ra: number; dec: number } | null;
}

export interface SearchUI {
  setupEventListeners: () => void;
  navigateToObject: (objectName: string) => boolean;
}

/**
 * Create search UI handlers for rendering and keyboard navigation.
 */
export function createSearchUI(options: SearchUIOptions): SearchUI {
  const { getSearchIndex, navigateToResult, getPlanetPosition, getSatellitePosition, getISSPosition, getEarthPosition, getPlanetaryMoonPosition, isJWSTMode, getMoonPosition, getSunPosition } = options;

  // Get DOM elements
  const searchInput = document.getElementById("search") as HTMLInputElement | null;
  const searchResults = document.getElementById("search-results");

  // State
  let selectedIndex = -1;
  let currentResults: SearchResult[] = [];

  function renderResults(): void {
    if (!searchResults) return;

    if (currentResults.length === 0) {
      searchResults.innerHTML = '<div class="search-empty">No results found</div>';
      searchResults.classList.add("visible");
      return;
    }

    searchResults.innerHTML = currentResults.map((result, i) => `
      <div class="search-result${i === selectedIndex ? ' selected' : ''}" data-index="${i}">
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

  function hideResults(): void {
    if (searchResults) {
      searchResults.classList.remove("visible");
      searchResults.innerHTML = '';
    }
    selectedIndex = -1;
    currentResults = [];
  }

  function getUpdatedPosition(result: SearchResult): { ra: number; dec: number } | null {
    let { ra, dec } = result;

    // Special handling for Earth (only searchable in JWST mode)
    if (result.name === 'Earth' && getEarthPosition) {
      const pos = getEarthPosition();
      if (pos) {
        ra = pos.ra;
        dec = pos.dec;
      }
      return { ra, dec };
    }

    // Special handling for near-Earth objects in JWST mode
    // From L2 (1.5 million km), these objects appear at or very near Earth's position
    if (isJWSTMode?.() && getEarthPosition) {
      const earthPos = getEarthPosition();

      // Moon: orbits at ~384,000 km, appears within ~15° of Earth from L2
      if (result.name === 'Moon' && earthPos && getMoonPosition && getSunPosition) {
        const moonGeo = getMoonPosition();
        const sunGeo = getSunPosition();

        if (moonGeo && sunGeo) {
          // Calculate Moon's offset from Sun in geocentric view (tells us lunar phase/position)
          const moonSunOffsetRA = moonGeo.ra - sunGeo.ra;
          const moonSunOffsetDec = moonGeo.dec - sunGeo.dec;

          // From L2, the Moon can be up to ~14.4° from Earth
          // Scale the geocentric offset: max geocentric separation is ~180°, max L2 separation is ~15°
          const L2_MAX_OFFSET_DEG = 14.4;
          const scale = L2_MAX_OFFSET_DEG / 180;

          ra = earthPos.ra + moonSunOffsetRA * scale;
          dec = earthPos.dec + moonSunOffsetDec * scale;

          // Normalize RA to 0-360
          if (ra < 0) ra += 360;
          if (ra >= 360) ra -= 360;

          return { ra, dec };
        }
      }

      // Earth-orbiting satellites (ISS, Hubble, etc.): orbit at ~400-600 km altitude
      // From L2 (1.5 million km), they appear essentially AT Earth's position
      // Angular offset: arctan(600 / 1,500,000) ≈ 0.00002° - negligible
      if (result.type === 'satellite' && earthPos) {
        return { ra: earthPos.ra, dec: earthPos.dec };
      }
    }

    // For planets and minor bodies, get current position (they move with time)
    if (result.type === 'planet' || result.type === 'minor_body') {
      const pos = getPlanetPosition(result.name);
      if (pos) {
        ra = pos.ra;
        dec = pos.dec;
      }
    }

    // For planetary moons, get current position (they orbit their parent planet quickly)
    if (result.type === 'moon' && result.name !== 'Moon' && getPlanetaryMoonPosition) {
      const pos = getPlanetaryMoonPosition(result.name);
      if (pos) {
        ra = pos.ra;
        dec = pos.dec;
      }
    }

    // For satellites (ISS, Hubble, etc.), get current position (they move fast)
    // Return null if position unavailable (ephemeris not loaded or date out of range)
    if (result.type === 'satellite') {
      const satIndex = SATELLITE_NAME_TO_INDEX[result.name];
      if (satIndex !== undefined && getSatellitePosition) {
        const pos = getSatellitePosition(satIndex);
        if (pos) {
          ra = pos.ra;
          dec = pos.dec;
        } else {
          return null; // Satellite position unavailable
        }
      } else if (getISSPosition && (result.name === 'ISS' || result.name === 'International Space Station')) {
        // Legacy fallback
        const pos = getISSPosition();
        if (pos) {
          ra = pos.ra;
          dec = pos.dec;
        } else {
          return null; // Satellite position unavailable
        }
      }
    }

    return { ra, dec };
  }

  function handleNavigateToResult(result: SearchResult): void {
    const position = getUpdatedPosition(result);

    if (position === null) {
      // Satellite position unavailable - show toast and don't navigate
      showToast(`${result.name} position unavailable - ephemeris data doesn't cover current date`);
      hideResults();
      if (searchInput) {
        searchInput.value = '';
        searchInput.blur();
      }
      return;
    }

    const { ra, dec } = position;
    console.log('[Search] Navigate to:', result.name, 'RA:', ra.toFixed(2), 'Dec:', dec.toFixed(2));
    navigateToResult({ ...result, ra, dec });
    hideResults();
    if (searchInput) {
      searchInput.value = '';
      searchInput.blur();
    }
  }

  /**
   * Navigate to an object by name (for deep linking via URL).
   * Returns true if object was found and navigation initiated.
   * Also populates the search box with the object name for visual feedback.
   */
  function navigateToObjectByName(objectName: string): boolean {
    const index = getSearchIndex();
    const results = search(objectName, index, 1);

    if (results.length > 0) {
      const result = results[0];
      const position = getUpdatedPosition(result);

      if (position === null) {
        // Satellite position unavailable
        showToast(`${result.name} position unavailable - ephemeris data doesn't cover current date`);
        return false;
      }

      const { ra, dec } = position;

      // Show the object name in the search box for visual feedback
      if (searchInput) {
        searchInput.value = result.name;
      }

      navigateToResult({ ...result, ra, dec });
      return true;
    }

    return false;
  }

  function setupEventListeners(): void {
    if (!searchInput || !searchResults) return;

    searchInput.addEventListener("input", () => {
      const query = searchInput.value.trim();
      if (query.length === 0) {
        hideResults();
        return;
      }

      currentResults = search(query, getSearchIndex(), 8);
      selectedIndex = currentResults.length > 0 ? 0 : -1;
      renderResults();
    });

    searchInput.addEventListener("keydown", (e) => {
      switch (e.key) {
        case "ArrowDown":
          if (currentResults.length === 0) return;
          e.preventDefault();
          selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
          renderResults();
          break;
        case "ArrowUp":
          if (currentResults.length === 0) return;
          e.preventDefault();
          selectedIndex = Math.max(selectedIndex - 1, 0);
          renderResults();
          break;
        case "Enter":
          e.preventDefault();
          // If we have current results and a selection, navigate to it
          if (selectedIndex >= 0 && selectedIndex < currentResults.length) {
            handleNavigateToResult(currentResults[selectedIndex]);
          } else {
            // Otherwise, search for current input and navigate to first result
            const query = searchInput.value.trim();
            if (query.length > 0) {
              const results = search(query, getSearchIndex(), 1);
              if (results.length > 0) {
                handleNavigateToResult(results[0]);
              }
            }
          }
          break;
        case "Escape":
          hideResults();
          searchInput.blur();
          break;
      }
    });

    searchInput.addEventListener("blur", () => {
      setTimeout(hideResults, 150);
    });

    searchResults.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest(".search-result");
      if (target) {
        const index = parseInt(target.getAttribute("data-index") || "-1", 10);
        if (index >= 0 && index < currentResults.length) {
          handleNavigateToResult(currentResults[index]);
        }
      }
    });
  }

  return {
    setupEventListeners,
    navigateToObject: navigateToObjectByName,
  };
}
