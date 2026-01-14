const fs = require('fs');
const placements = require('../data/video_placements.json');
const ephemeris = require('../data/ephemeris.json');

const finalPlacements = [];
let placedCount = 0;
let skippedCount = 0;

placements.forEach(video => {
  const entry = {
    videoId: video.videoId,
    title: video.title,
    url: video.url,
    objectName: video.objectName,
    category: video.category,
    ra: null,
    dec: null,
    isMoving: video.isMoving,
    placeable: false,
    notes: null
  };

  if (video.placeable && video.ra_decimal && video.dec_decimal) {
    // Fixed object with coordinates
    entry.ra = video.ra_decimal;
    entry.dec = video.dec_decimal;
    entry.placeable = true;
    placedCount++;
  } else if (video.isMoving && video.objectName) {
    // Moving object - look up ephemeris
    const eph = ephemeris[video.objectName];
    if (eph && eph.ra_decimal && eph.dec_decimal) {
      entry.ra = eph.ra_decimal;
      entry.dec = eph.dec_decimal;
      entry.placeable = true;
      entry.ephemerisDate = eph.date;
      placedCount++;
    } else {
      entry.notes = eph?.error || 'No ephemeris available';
      skippedCount++;
    }
  } else {
    // Cannot place
    entry.notes = video.notes || 'No position data';
    skippedCount++;
  }

  finalPlacements.push(entry);
});

// Statistics
const placeableVideos = finalPlacements.filter(v => v.placeable);
console.error('=== Final Placement Statistics ===');
console.error('Total videos: ' + finalPlacements.length);
console.error('Placeable: ' + placedCount);
console.error('Skipped: ' + skippedCount);

// Output JSON for visualization
const vizData = placeableVideos.map(v => ({
  id: v.videoId,
  title: v.title,
  object: v.objectName,
  ra: v.ra,
  dec: v.dec,
  moving: v.isMoving,
  url: v.url
}));

console.log(JSON.stringify(vizData, null, 2));

// Also save full data and CSV
fs.writeFileSync('data/final_placements.json', JSON.stringify(finalPlacements, null, 2));

const csvLines = ['video_id,title,object_name,ra,dec,is_moving,url'];
placeableVideos.forEach(v => {
  csvLines.push([
    v.videoId,
    `"${v.title.replace(/"/g, '""')}"`,
    `"${(v.objectName || '').replace(/"/g, '""')}"`,
    v.ra.toFixed(6),
    v.dec.toFixed(6),
    v.isMoving,
    v.url
  ].join(','));
});
fs.writeFileSync('data/final_placements.csv', csvLines.join('\n'));

console.error('\nSaved:');
console.error('  data/final_placements.json (all ' + finalPlacements.length + ' videos)');
console.error('  data/final_placements.csv (' + placeableVideos.length + ' placeable videos)');
