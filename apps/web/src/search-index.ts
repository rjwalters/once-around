/**
 * Search index builder - collects searchable items from all data sources.
 */

import type { SearchItem } from "./search";
import type { VideoPlacement } from "./videos";
import { METEOR_SHOWER_DATA, type MeteorShower } from "./meteorShowerData";

export interface StarDataEntry {
  name: string;
  designation: string;
  ra: number;
  dec: number;
}

export interface ConstellationDataEntry {
  name: string;
  meaning: string;
}

export interface DSODataEntry {
  id: string;
  name: string;
  ra: number;
  dec: number;
}

export interface DeepFieldDataEntry {
  id: string;
  name: string;
  ra: number;
  dec: number;
  telescope: string;
}

export interface SatelliteData {
  index: number;
  name: string;
  fullName: string;
}

export interface SearchIndexOptions {
  bodyNames: readonly string[];
  minorBodyNames?: readonly string[];
  cometNames: readonly string[];
  starData: Record<string, StarDataEntry>;
  constellationData: Record<string, ConstellationDataEntry>;
  constellationCenters: Record<string, { ra: number; dec: number }>;
  dsoData: readonly DSODataEntry[];
  deepFieldData?: readonly DeepFieldDataEntry[];
  getBodyPositions: () => Map<string, { x: number; y: number; z: number }>;
  positionToRaDec: (pos: { x: number; y: number; z: number }) => { ra: number; dec: number };
  satellites?: SatelliteData[];
  getSatellitePosition?: (index: number) => { x: number; y: number; z: number } | null;
  // Legacy - will be converted to satellites internally
  getISSPosition?: () => { x: number; y: number; z: number } | null;
  // Earth position for JWST mode (where Earth is visible as a distant planet)
  getEarthPosition?: () => { x: number; y: number; z: number } | null;
  // Planetary moons (Galilean moons + Titan)
  planetaryMoons?: { name: string; parentPlanet: string }[];
  getPlanetaryMoonPosition?: (index: number) => { x: number; y: number; z: number } | null;
}

/**
 * Build search index from all available data sources.
 */
export async function buildSearchIndex(options: SearchIndexOptions): Promise<SearchItem[]> {
  const {
    bodyNames,
    minorBodyNames,
    cometNames,
    starData,
    constellationData,
    constellationCenters,
    dsoData,
    deepFieldData,
    getBodyPositions,
    positionToRaDec,
    satellites,
    getSatellitePosition,
    getISSPosition,
    getEarthPosition,
    planetaryMoons,
    getPlanetaryMoonPosition,
  } = options;

  const items: SearchItem[] = [];

  // Add planets and Earth's Moon (get current positions)
  const currentBodyPositions = getBodyPositions();
  for (const name of bodyNames) {
    const pos = currentBodyPositions.get(name);
    if (pos) {
      const { ra, dec } = positionToRaDec(pos);
      // Earth's Moon is categorized as 'moon', not 'planet'
      const type = name === "Moon" ? "moon" : "planet";
      const subtitle = name === "Moon" ? "Earth's Moon" : undefined;
      items.push({ name, type, ra, dec, subtitle });
    }
  }

  // Add minor bodies (dwarf planets and asteroids)
  if (minorBodyNames) {
    // Subtitles for minor bodies based on their classification
    const minorBodySubtitles: Record<string, string> = {
      "Pluto": "Dwarf Planet",
      "Ceres": "Dwarf Planet (Asteroid Belt)",
      "Eris": "Dwarf Planet (Trans-Neptunian)",
      "Makemake": "Dwarf Planet (Trans-Neptunian)",
      "Haumea": "Dwarf Planet (Trans-Neptunian)",
      "Sedna": "Detached Object",
      "Quaoar": "Trans-Neptunian Object",
      "Gonggong": "Trans-Neptunian Object",
      "Orcus": "Trans-Neptunian Object",
      "Varuna": "Trans-Neptunian Object",
      "Vesta": "Asteroid",
      "Pallas": "Asteroid",
      "Hygiea": "Asteroid",
      "Apophis": "Near-Earth Asteroid",
      "Bennu": "Near-Earth Asteroid",
    };

    for (const name of minorBodyNames) {
      const pos = currentBodyPositions.get(name);
      if (pos) {
        const { ra, dec } = positionToRaDec(pos);
        const subtitle = minorBodySubtitles[name] || "Minor Body";
        items.push({ name, type: "minor_body", ra, dec, subtitle });
      }
    }
  }

  // Add planetary moons (Galilean moons of Jupiter + Titan)
  if (planetaryMoons && getPlanetaryMoonPosition) {
    for (let i = 0; i < planetaryMoons.length; i++) {
      const moon = planetaryMoons[i];
      const pos = getPlanetaryMoonPosition(i);
      // Use actual position if available, otherwise default to (0,0)
      const { ra, dec } = pos ? positionToRaDec(pos) : { ra: 0, dec: 0 };
      items.push({
        name: moon.name,
        type: "moon",
        ra,
        dec,
        subtitle: `Moon of ${moon.parentPlanet}`,
      });
    }
  }

  // Add named stars
  for (const [_hr, star] of Object.entries(starData)) {
    items.push({
      name: star.name,
      type: "star",
      ra: star.ra,
      dec: star.dec,
      subtitle: star.designation,
    });
  }

  // Add constellations
  for (const [name, info] of Object.entries(constellationData)) {
    const center = constellationCenters[name];
    if (center) {
      items.push({
        name: info.name,
        type: "constellation",
        ra: center.ra,
        dec: center.dec,
        subtitle: info.meaning,
      });
    }
  }

  // Add deep sky objects
  for (const dso of dsoData) {
    items.push({
      name: dso.name,
      type: "dso",
      ra: dso.ra,
      dec: dso.dec,
      subtitle: dso.id,
    });
    // Also add by catalog ID for search
    if (dso.id !== dso.name) {
      items.push({
        name: dso.id,
        type: "dso",
        ra: dso.ra,
        dec: dso.dec,
        subtitle: dso.name,
      });
    }
  }

  // Add deep field images (Hubble, JWST)
  if (deepFieldData) {
    for (const df of deepFieldData) {
      items.push({
        name: df.name,
        type: "deep_field",
        ra: df.ra,
        dec: df.dec,
        subtitle: `${df.telescope} Deep Field`,
      });
      // Also add by ID for search (e.g., "HDF", "HUDF")
      if (df.id !== df.name) {
        items.push({
          name: df.id,
          type: "deep_field",
          ra: df.ra,
          dec: df.dec,
          subtitle: df.name,
        });
      }
    }
  }

  // Add comets (positions from engine)
  for (const name of cometNames) {
    const pos = currentBodyPositions.get(name);
    if (pos) {
      const { ra, dec } = positionToRaDec(pos);
      items.push({
        name,
        type: "comet",
        ra,
        dec,
        subtitle: "Comet",
      });
    }
  }

  // Add satellites (ISS, Hubble, etc.)
  // Always add satellites to search index - position is looked up dynamically when navigating
  if (satellites && satellites.length > 0) {
    for (const sat of satellites) {
      // Add by short name only (full name is shown as subtitle)
      items.push({
        name: sat.name,
        type: "satellite",
        ra: 0,  // Position looked up dynamically when navigating
        dec: 0,
        subtitle: sat.fullName,
      });
    }
  } else if (getISSPosition) {
    // Legacy fallback for ISS only
    items.push({
      name: "ISS",
      type: "satellite",
      ra: 0,
      dec: 0,
      subtitle: "International Space Station",
    });
  }

  // Add Earth (searchable in JWST mode where it appears as a distant planet)
  // Always add to index - position will be looked up dynamically when navigating
  if (getEarthPosition) {
    const earthPos = getEarthPosition();
    const { ra, dec } = earthPos ? positionToRaDec(earthPos) : { ra: 0, dec: 0 };
    items.push({
      name: "Earth",
      type: "planet",
      ra,
      dec,
      subtitle: "Home Planet (visible from JWST)",
    });
  }

  // Add meteor showers
  for (const shower of METEOR_SHOWER_DATA) {
    const peakDate = `${shower.peakMonth}/${shower.peakDay}`;
    items.push({
      name: shower.name,
      type: "meteor_shower",
      ra: shower.ra,
      dec: shower.dec,
      subtitle: `Peak ${peakDate}, ZHR ${shower.zhr}`,
    });
  }

  // Add videos
  try {
    const response = await fetch("/videos.json");
    const videos: VideoPlacement[] = await response.json();
    for (const video of videos) {
      items.push({
        name: video.object,
        type: "video",
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
