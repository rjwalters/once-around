/**
 * Search index builder - collects searchable items from all data sources.
 */

import type { SearchItem } from "./search";
import type { VideoPlacement } from "./videos";

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
  getBodyPositions: () => Map<string, { x: number; y: number; z: number }>;
  positionToRaDec: (pos: { x: number; y: number; z: number }) => { ra: number; dec: number };
  satellites?: SatelliteData[];
  getSatellitePosition?: (index: number) => { x: number; y: number; z: number } | null;
  // Legacy - will be converted to satellites internally
  getISSPosition?: () => { x: number; y: number; z: number } | null;
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
    getBodyPositions,
    positionToRaDec,
    satellites,
    getSatellitePosition,
    getISSPosition,
  } = options;

  const items: SearchItem[] = [];

  // Add planets (get current positions)
  const currentBodyPositions = getBodyPositions();
  for (const name of bodyNames) {
    const pos = currentBodyPositions.get(name);
    if (pos) {
      const { ra, dec } = positionToRaDec(pos);
      items.push({ name, type: "planet", ra, dec });
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
  if (satellites && getSatellitePosition) {
    for (const sat of satellites) {
      const pos = getSatellitePosition(sat.index);
      if (pos) {
        const { ra, dec } = positionToRaDec(pos);
        // Add by short name
        items.push({
          name: sat.name,
          type: "satellite",
          ra,
          dec,
          subtitle: sat.fullName,
        });
        // Also searchable by full name (if different)
        if (sat.fullName !== sat.name) {
          items.push({
            name: sat.fullName,
            type: "satellite",
            ra,
            dec,
            subtitle: sat.name,
          });
        }
      }
    }
  } else if (getISSPosition) {
    // Legacy fallback for ISS only
    const issPos = getISSPosition();
    if (issPos) {
      const { ra, dec } = positionToRaDec(issPos);
      items.push({
        name: "ISS",
        type: "satellite",
        ra,
        dec,
        subtitle: "International Space Station",
      });
      items.push({
        name: "International Space Station",
        type: "satellite",
        ra,
        dec,
        subtitle: "ISS",
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
