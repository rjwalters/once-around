const fs = require('fs');
const catalog = require('../data/catalog.json');

// Additional object coordinates for "other" videos
const additionalObjects = {
  'alpha centauri': { ra: '14 39 36.5', dec: '-60 50 02', name: 'Alpha Centauri' },
  'betelgeuse': { ra: '05 55 10.3', dec: '+07 24 25', name: 'Betelgeuse' },
  'barnard': { ra: '17 57 48.5', dec: '+04 41 36', name: "Barnard's Star" },
  'milky way': { ra: '17 45 40', dec: '-29 00 28', name: 'Galactic Center' },
  't coronae borealis': { ra: '15 59 30.2', dec: '+25 55 13', name: 'T Coronae Borealis' },
  'blaze star': { ra: '15 59 30.2', dec: '+25 55 13', name: 'T Coronae Borealis' },
  'new horizons': { moving: true, name: 'New Horizons (Kuiper Belt)' },
  'oumuamua': { moving: true, name: 'Oumuamua' },
};

// Convert sexagesimal to decimal
function raToDecimal(ra) {
  if (!ra) return null;
  const parts = ra.trim().split(/\s+/);
  if (parts.length >= 3) {
    const h = parseFloat(parts[0]);
    const m = parseFloat(parts[1]);
    const s = parseFloat(parts[2]);
    return (h + m/60 + s/3600) * 15;
  }
  return null;
}

function decToDecimal(dec) {
  if (!dec) return null;
  const parts = dec.trim().split(/\s+/);
  if (parts.length >= 3) {
    const sign = dec.trim().startsWith('-') ? -1 : 1;
    const d = Math.abs(parseFloat(parts[0]));
    const m = parseFloat(parts[1]);
    const s = parseFloat(parts[2]);
    return sign * (d + m/60 + s/3600);
  }
  return null;
}

const placements = [];

// Process all videos
catalog.forEach(video => {
  const entry = {
    title: video.title,
    url: video.url,
    videoId: video.videoId,
    objectName: null,
    category: null,
    ra: null,
    dec: null,
    ra_decimal: null,
    dec_decimal: null,
    placeable: false,
    isMoving: false,
    notes: null
  };

  if (video.objectName) {
    // "Once Around" video
    entry.objectName = video.objectName;
    entry.category = video.category;
    entry.isMoving = video.isMoving;

    if (video.ra && video.dec) {
      entry.ra = video.ra;
      entry.dec = video.dec;
      entry.ra_decimal = raToDecimal(video.ra);
      entry.dec_decimal = decToDecimal(video.dec);
      entry.placeable = true;
    } else if (video.isMoving) {
      entry.notes = 'Moving object - needs ephemeris';
      entry.placeable = false; // For now
    } else if (video.category === 'concept') {
      entry.notes = 'Concept - no single sky position';
      entry.placeable = false;
    } else {
      entry.notes = video.notes || 'Missing coordinates';
    }
  } else {
    // "Other" video - try to extract object from title
    const titleLower = video.title.toLowerCase();
    entry.category = 'other';

    for (const [key, obj] of Object.entries(additionalObjects)) {
      if (titleLower.includes(key)) {
        entry.objectName = obj.name;
        if (obj.ra && obj.dec) {
          entry.ra = obj.ra;
          entry.dec = obj.dec;
          entry.ra_decimal = raToDecimal(obj.ra);
          entry.dec_decimal = decToDecimal(obj.dec);
          entry.placeable = true;
        } else if (obj.moving) {
          entry.isMoving = true;
          entry.notes = 'Moving object - needs ephemeris';
        }
        break;
      }
    }

    if (!entry.objectName) {
      entry.notes = 'General astronomy content';
    }
  }

  placements.push(entry);
});

// Statistics
const stats = {
  total: placements.length,
  placeable: placements.filter(p => p.placeable).length,
  moving: placements.filter(p => p.isMoving).length,
  concepts: placements.filter(p => p.category === 'concept').length,
  noPosition: placements.filter(p => !p.placeable && !p.isMoving && p.category !== 'concept').length
};

console.error('=== Placement Statistics ===');
console.error('Total videos: ' + stats.total);
console.error('Placeable (with coordinates): ' + stats.placeable);
console.error('Moving objects: ' + stats.moving);
console.error('Concept videos: ' + stats.concepts);
console.error('No sky position: ' + stats.noPosition);

// Output JSON
console.log(JSON.stringify(placements, null, 2));

// Also create a simplified CSV for the visualization
const csvLines = ['video_id,title,object_name,ra,dec,is_moving,category'];
placements.filter(p => p.placeable || p.isMoving).forEach(p => {
  csvLines.push([
    p.videoId,
    `"${p.title.replace(/"/g, '""')}"`,
    `"${(p.objectName || '').replace(/"/g, '""')}"`,
    p.ra_decimal || '',
    p.dec_decimal || '',
    p.isMoving,
    p.category
  ].join(','));
});

fs.writeFileSync('data/video_placements.csv', csvLines.join('\n'));
console.error('\nSaved video_placements.csv with ' + (csvLines.length - 1) + ' entries');
