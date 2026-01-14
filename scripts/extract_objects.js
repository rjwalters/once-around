const catalog = require('../data/catalog.json');

// Known celestial objects that might appear in titles
const knownObjects = {
  // Stars
  'alpha centauri': { ra: '14 39 36.5', dec: '-60 50 02', name: 'Alpha Centauri' },
  'betelgeuse': { ra: '05 55 10.3', dec: '+07 24 25', name: 'Betelgeuse' },
  'barnard': { ra: '17 57 48.5', dec: '+04 41 36', name: "Barnard's Star" },
  // Planets
  'mars': { moving: true, name: 'Mars' },
  'venus': { moving: true, name: 'Venus' },
  'jupiter': { moving: true, name: 'Jupiter' },
  'saturn': { moving: true, name: 'Saturn' },
  'pluto': { moving: true, name: 'Pluto' },
  'mercury': { moving: true, name: 'Mercury' },
  // Regions/objects
  'outer solar system': { moving: true, name: 'Outer Solar System' },
  'milky way': { ra: '17 45 40', dec: '-29 00 28', name: 'Galactic Center' },
  'moon': { moving: true, name: 'Moon' },
  'sun': { moving: true, name: 'Sun' },
  'orion': { ra: '05 35 16', dec: '-05 23 15', name: 'Orion Nebula' },
  'andromeda': { ra: '00 42 44', dec: '+41 16 09', name: 'Andromeda Galaxy' },
  // Deep sky
  'jodrell bank': { facility: true, name: 'Jodrell Bank' },
  'hubble': { facility: true, name: 'Hubble Space Telescope' },
  'james webb': { facility: true, name: 'James Webb Space Telescope' },
};

// Process "other" videos
const otherVideos = catalog.filter(v => !v.objectName);

console.log('=== Extracting objects from "Other" videos ===\n');

const results = [];

otherVideos.forEach(video => {
  const titleLower = video.title.toLowerCase();
  let matchedObject = null;
  let matchedKey = null;

  for (const [key, obj] of Object.entries(knownObjects)) {
    if (titleLower.includes(key)) {
      matchedObject = obj;
      matchedKey = key;
      break;
    }
  }

  results.push({
    title: video.title,
    url: video.url,
    videoId: video.videoId,
    extractedObject: matchedObject ? matchedObject.name : null,
    ra: matchedObject?.ra || null,
    dec: matchedObject?.dec || null,
    isMoving: matchedObject?.moving || false,
    isFacility: matchedObject?.facility || false,
    canPlace: matchedObject && !matchedObject.facility && (matchedObject.ra || matchedObject.moving)
  });
});

// Summary
const placeable = results.filter(r => r.canPlace);
const facilities = results.filter(r => r.isFacility);
const noMatch = results.filter(r => !r.extractedObject);

console.log('Placeable on sky: ' + placeable.length);
console.log('Facilities (no sky position): ' + facilities.length);
console.log('No object match: ' + noMatch.length);

console.log('\n=== Placeable videos ===');
placeable.forEach(v => console.log('  ' + v.extractedObject + ': ' + v.title));

console.log('\n=== No match (sample) ===');
noMatch.slice(0, 30).forEach(v => console.log('  - ' + v.title));

// Output full results
console.log('\n' + JSON.stringify(results, null, 2));
