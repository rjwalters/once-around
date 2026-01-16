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

export interface SearchIndexOptions {
  bodyNames: readonly string[];
  cometNames: readonly string[];
  starData: Record<string, StarDataEntry>;
  constellationData: Record<string, ConstellationDataEntry>;
  constellationCenters: Record<string, { ra: number; dec: number }>;
  dsoData: readonly DSODataEntry[];
  getBodyPositions: () => Map<string, { x: number; y: number; z: number }>;
  positionToRaDec: (pos: { x: number; y: number; z: number }) => { ra: number; dec: number };
}

/**
 * Build search index from all available data sources.
 */
export async function buildSearchIndex(options: SearchIndexOptions): Promise<SearchItem[]> {
  const {
    bodyNames,
    cometNames,
    starData,
    constellationData,
    constellationCenters,
    dsoData,
    getBodyPositions,
    positionToRaDec,
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
