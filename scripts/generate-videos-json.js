#!/usr/bin/env node
/**
 * Generate videos.json for the web app from the catalog and placements.
 *
 * Usage: node scripts/generate-videos-json.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_DIR = path.join(__dirname, '..', 'apps', 'web', 'public');

// Load source files
const catalog = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'once_around_catalog.json'), 'utf-8'));
const placements = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'final_placements.json'), 'utf-8'));

// Build a map of placements by videoId for quick lookup
const placementsByVideoId = new Map();
for (const p of placements) {
  placementsByVideoId.set(p.videoId, p);
}

// Generate videos.json entries
const videos = [];

for (const entry of catalog) {
  const { videoId, title, objectName, url, isMoving, ra_decimal, dec_decimal, category } = entry;

  // Skip concept videos (no position)
  if (category === 'concept') {
    continue;
  }

  // Try to get position from placements first (has ephemeris data for moving objects)
  let ra = null;
  let dec = null;

  const placement = placementsByVideoId.get(videoId);
  if (placement && placement.placeable && placement.ra !== null && placement.dec !== null) {
    ra = placement.ra;
    dec = placement.dec;
  } else if (ra_decimal && dec_decimal) {
    // Fall back to catalog coordinates
    ra = parseFloat(ra_decimal);
    dec = parseFloat(dec_decimal);
  }

  // Skip if no valid position
  if (ra === null || dec === null || isNaN(ra) || isNaN(dec)) {
    console.log(`Skipping ${objectName}: no valid position`);
    continue;
  }

  videos.push({
    id: videoId,
    title,
    object: objectName,
    ra,
    dec,
    moving: isMoving,
    url,
  });
}

// Write output
const outputPath = path.join(OUTPUT_DIR, 'videos.json');
fs.writeFileSync(outputPath, JSON.stringify(videos, null, 2));

console.log(`Generated ${outputPath} with ${videos.length} videos`);
