/**
 * Search UI management - rendering results, keyboard navigation.
 */

import { search, TYPE_COLORS, type SearchItem, type SearchResult } from "./search";

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
}

export interface SearchUI {
  setupEventListeners: () => void;
  navigateToObject: (objectName: string) => boolean;
}

/**
 * Create search UI handlers for rendering and keyboard navigation.
 */
export function createSearchUI(options: SearchUIOptions): SearchUI {
  const { getSearchIndex, navigateToResult, getPlanetPosition, getSatellitePosition, getISSPosition } = options;

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

  function getUpdatedPosition(result: SearchResult): { ra: number; dec: number } {
    let { ra, dec } = result;

    // For planets, get current position (they move with time)
    if (result.type === 'planet') {
      const pos = getPlanetPosition(result.name);
      if (pos) {
        ra = pos.ra;
        dec = pos.dec;
      }
    }

    // For satellites (ISS, Hubble, etc.), get current position (they move fast)
    if (result.type === 'satellite') {
      const satIndex = SATELLITE_NAME_TO_INDEX[result.name];
      if (satIndex !== undefined && getSatellitePosition) {
        const pos = getSatellitePosition(satIndex);
        if (pos) {
          ra = pos.ra;
          dec = pos.dec;
        }
      } else if (getISSPosition && (result.name === 'ISS' || result.name === 'International Space Station')) {
        // Legacy fallback
        const pos = getISSPosition();
        if (pos) {
          ra = pos.ra;
          dec = pos.dec;
        }
      }
    }

    return { ra, dec };
  }

  function handleNavigateToResult(result: SearchResult): void {
    const { ra, dec } = getUpdatedPosition(result);
    console.log('Search navigation:', result.name, 'RA:', ra.toFixed(2), 'Dec:', dec.toFixed(2));
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
      const { ra, dec } = getUpdatedPosition(result);

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
      if (currentResults.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
          renderResults();
          break;
        case "ArrowUp":
          e.preventDefault();
          selectedIndex = Math.max(selectedIndex - 1, 0);
          renderResults();
          break;
        case "Enter":
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < currentResults.length) {
            handleNavigateToResult(currentResults[selectedIndex]);
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
