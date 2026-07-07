import { STAR_DATA } from "./starData";
import { CONSTELLATION_DATA } from "./constellationData";
import { DSO_DATA } from "./dsoData";
import { DEEP_FIELD_DATA } from "./deepFieldData";
import { CONSTELLATION_CENTERS, type SearchItem } from "./search";
import { buildSearchIndex } from "./search-index";
import { createSearchUI } from "./search-ui";
import { getPlanetaryMoonsBuffer, getSatellitePosition, SATELLITES } from "./engine";
import {
  BODY_NAMES,
  MINOR_BODY_NAMES,
  COMET_NAMES,
  positionToRaDec,
  type BodyPositions,
} from "./body-positions";
import type { SkyEngine } from "./wasm/sky_engine";

// Planetary moons data for search (Galilean moons + Titan)
// Buffer indices match the first 5 moons in the planetary moons buffer
export const PLANETARY_MOONS = [
  { name: "Io", parentPlanet: "Jupiter" },
  { name: "Europa", parentPlanet: "Jupiter" },
  { name: "Ganymede", parentPlanet: "Jupiter" },
  { name: "Callisto", parentPlanet: "Jupiter" },
  { name: "Titan", parentPlanet: "Saturn" },
];

// Helper to get planetary moon position from buffer
// Buffer layout: 4 floats per moon (x, y, z, angular_diameter)
// Uses same coordinate transform as moons layer
export function getPlanetaryMoonPosition(
  engine: SkyEngine,
  index: number
): { x: number; y: number; z: number } | null {
  const buffer = getPlanetaryMoonsBuffer(engine);
  const idx = index * 4;
  if (idx + 2 >= buffer.length) return null;
  // Rust coords to Three.js: negate X, swap Y/Z
  const rustX = buffer[idx];
  const rustY = buffer[idx + 1];
  const rustZ = buffer[idx + 2];
  return { x: -rustX, y: rustZ, z: rustY };
}

export interface SearchSetupDependencies {
  engine: SkyEngine;
  controls: {
    animateToRaDec: (ra: number, dec: number, durationMs: number) => void;
  };
  getBodyPositions: () => BodyPositions;
  getEarthPositionJWST: () => { x: number; y: number; z: number } | null;
  getViewMode: () => string;
  satellitesLoadedPromise: Promise<void>;
}

export interface SearchSetupResult {
  searchUI: ReturnType<typeof createSearchUI>;
  getSearchIndex: () => SearchItem[];
  navigateToUrlObject: (object: string) => boolean;
}

export function setupSearch(deps: SearchSetupDependencies): SearchSetupResult {
  const {
    engine,
    controls,
    getBodyPositions,
    getEarthPositionJWST,
    getViewMode,
    satellitesLoadedPromise,
  } = deps;

  let searchIndex: SearchItem[] = [];

  // Helper to build the base search index. Satellites are intentionally excluded
  // here: they are a static list whose ephemerides load asynchronously, so they
  // are appended separately once satellitesLoadedPromise resolves (see below).
  // Appending avoids a second full buildSearchIndex(), which would re-fetch
  // videos.json — issue #6 keeps the session to a single /videos.json request.
  const buildIndex = () =>
    buildSearchIndex({
      bodyNames: BODY_NAMES,
      minorBodyNames: MINOR_BODY_NAMES,
      cometNames: COMET_NAMES,
      starData: STAR_DATA,
      constellationData: CONSTELLATION_DATA,
      constellationCenters: CONSTELLATION_CENTERS,
      dsoData: DSO_DATA,
      deepFieldData: DEEP_FIELD_DATA,
      getBodyPositions,
      positionToRaDec,
      // Earth is searchable in JWST mode (where it appears as a distant planet)
      getEarthPosition: getEarthPositionJWST,
      // Planetary moons (Galilean moons of Jupiter + Titan)
      planetaryMoons: PLANETARY_MOONS,
      getPlanetaryMoonPosition: (index: number) => getPlanetaryMoonPosition(engine, index),
    });

  // Build the satellite-only search entries. Satellite names/labels are static
  // (positions are looked up dynamically when navigating), so this is a cheap
  // synchronous transform with no network access.
  const buildSatelliteItems = (): SearchItem[] =>
    SATELLITES.map((s): SearchItem => ({
      name: s.name,
      type: "satellite",
      ra: 0, // Position looked up dynamically when navigating
      dec: 0,
      subtitle: s.fullName,
    }));

  // Create search UI
  const searchUI = createSearchUI({
    getSearchIndex: () => searchIndex,
    navigateToResult: (result) => {
      controls.animateToRaDec(result.ra, result.dec, 1000);
    },
    getPlanetPosition: (name) => {
      const pos = getBodyPositions().get(name);
      return pos ? positionToRaDec(pos) : null;
    },
    getSatellitePosition: (index: number) => {
      if (!engine.has_satellite_ephemeris(index) || !engine.satellite_in_range(index)) return null;
      const pos = getSatellitePosition(engine, index);
      if (pos.x === 0 && pos.y === 0 && pos.z === 0) return null;
      // Convert from Rust/ECI coords (Z-up) to Three.js coords (Y-up) for positionToRaDec
      // Same transform as rustToThreeJS: x=-rustX, y=rustZ, z=rustY
      return positionToRaDec({ x: -pos.x, y: pos.z, z: pos.y });
    },
    // Earth position for JWST mode (dynamic lookup)
    getEarthPosition: () => {
      const pos = getEarthPositionJWST();
      return pos ? positionToRaDec(pos) : null;
    },
    // Planetary moon position (dynamic lookup - they orbit quickly)
    getPlanetaryMoonPosition: (name: string) => {
      const moonIndex = PLANETARY_MOONS.findIndex((m) => m.name === name);
      if (moonIndex < 0) return null;
      const pos = getPlanetaryMoonPosition(engine, moonIndex);
      return pos ? positionToRaDec(pos) : null;
    },
    // JWST mode detection
    isJWSTMode: () => getViewMode() === "jwst",
    // Moon's geocentric position (for JWST mode offset calculation)
    getMoonPosition: () => {
      const pos = getBodyPositions().get("Moon");
      return pos ? positionToRaDec(pos) : null;
    },
    // Sun's geocentric position (for JWST mode offset calculation)
    getSunPosition: () => {
      const pos = getBodyPositions().get("Sun");
      return pos ? positionToRaDec(pos) : null;
    },
  });

  // Initialize search index
  let indexReady = false;
  let pendingUrlObject: string | null = null;

  buildIndex().then((index) => {
    searchIndex = index;
    indexReady = true;
    console.log(`Search index built: ${index.length} items`);

    // Handle pending URL object navigation. If the object is not found yet it may
    // be a satellite that has not been appended; leave it queued for the retry in
    // the satellitesLoadedPromise handler below rather than clearing it here.
    if (pendingUrlObject) {
      const found = searchUI.navigateToObject(pendingUrlObject);
      if (found) {
        console.log(`Navigated to object from URL: ${pendingUrlObject}`);
        pendingUrlObject = null;
      }
    }

    // Append satellites once their ephemerides finish loading. Appending (instead
    // of a full buildIndex() rebuild) keeps the session to a single videos.json
    // request — issue #6.
    satellitesLoadedPromise.then(() => {
      searchIndex = [...searchIndex, ...buildSatelliteItems()];
      console.log(`Search index appended satellites: ${searchIndex.length} items`);

      // Retry a queued URL deep-link (e.g. ?object=ISS) now that satellites exist.
      if (pendingUrlObject) {
        const found = searchUI.navigateToObject(pendingUrlObject);
        if (found) {
          console.log(`Navigated to object from URL: ${pendingUrlObject}`);
        } else {
          console.warn(`Object not found in search index: ${pendingUrlObject}`);
        }
        pendingUrlObject = null;
      }
    });
  });

  // Navigate to URL object (queues if index not ready)
  function navigateToUrlObject(object: string): boolean {
    if (indexReady) {
      return searchUI.navigateToObject(object);
    } else {
      pendingUrlObject = object;
      return true; // Assume it will work
    }
  }

  return {
    searchUI,
    getSearchIndex: () => searchIndex,
    navigateToUrlObject,
  };
}
