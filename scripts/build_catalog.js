const fs = require('fs');
const https = require('https');

// Load videos
const rawData = fs.readFileSync('data/videos_clean.json', 'utf8');
const videos = JSON.parse(rawData);

// Known moving objects (planets, moons, asteroids, comets, etc.)
// These are EXACT matches (case-insensitive)
const movingObjectsExact = new Set([
  'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune',
  'triton', 'pluto', 'ceres', 'vesta', 'eris', 'makemake', 'haumea', 'huamea',
  'quaoar', 'sedna', 'orcus', 'ixion', 'varuna', 'gonggong', 'achlys',
  'qb1', 'ultima thule', 'the goblin', 'vulcan'
]);

// These use partial/phrase matching
const movingObjectsPartial = [
  'moons of mars', 'moons of neptune', 'moons of pluto',
  'janus and epimetheus', 'asteroid apophis', 'asteroid bennu',
  'schwassmann-wachmann', '3i atlas', 'the centaurs', 'lost asteroid hermes',
  'planet nine', 'the ice giants'
];

// Objects that are concepts/classes rather than specific locations
const conceptObjects = new Set([
  'magnetars', 'jumbos', 'antistars', 'iron stars', 'protostars', 'pulsar planets',
  'diamond planets', 'wolf rayet stars', 'white dwarf stars', 'globular clusters',
  'shell galaxies', 'giant elliptical galaxies', 'rogue planets', 'brown dwarfs',
  'hot jupiters', 'the centre of the universe', 'the van allen belts', 'the cepheids',
  'the halloween fireballs', 'gaia\'s black holes', 'the most massive white dwarf',
  'the sun\'s sister stars', 'the oort cloud', 'nemesis, tyche and nibiru',
  'the milky way', 'orion\'s belt', ': the halloween fireballs', 'a trio of glieses'
]);

// Map of object name variations to canonical SIMBAD-friendly names
const objectNameMap = {
  'barnards loop': 'Barnard\'s Loop',
  'barnards star': 'Barnard\'s Star',
  'tychos supernova': 'SN 1572',
  'the horsehead nebula': 'Horsehead Nebula',
  'the orion nebula': 'M42',
  'the helix nebula': 'NGC 7293',
  'nova 1934 dq herculis': 'DQ Her',
  'gk persei': 'GK Per',
  'westerlund 1': 'Westerlund 1',
  'stephenson 2-18': 'Stephenson 2-18',
  'iota horologii': 'iota Hor',
  'gliese 876': 'GJ 876',
  'gliese 229': 'GJ 229',
  'gliese 581': 'GJ 581',
  'a trio of glieses': null, // Multiple objects
  'simp 0136': 'SIMP J013656.5+093347',
  'antares': 'Antares',
  'rigel': 'Rigel',
  'canopus': 'Canopus',
  'the north america nebula': 'NGC 7000',
  'trappist 1': 'TRAPPIST-1',
  'pismis 24 1': 'Pismis 24-1',
  'triangulum': 'M33',
  'nova 1670': 'CK Vul',
  'the cosmic owl': 'NGC 457',
  'ross 128': 'Ross 128',
  'teleios': null, // Not a standard name
  'piazzi\'s flying star': '61 Cyg',
  'luytens star': 'Luyten\'s Star',
  'procyon': 'Procyon',
  'wolf 359': 'Wolf 359',
  'sn1181': 'SN 1181',
  'the andromeda galaxy': 'M31',
  'the ring nebula': 'M57',
  'epsilon lyrae': 'eps Lyr',
  'v838 monocerotis': 'V838 Mon',
  'cor caroli': 'alpha CVn',
  'gamma andromeda': 'gamma And',
  'epsilon indi': 'eps Ind',
  'r136a1': 'R136a1',
  'alpha centauri': 'alpha Cen',
  'fomalhaut': 'Fomalhaut',
  'beta lyrae': 'beta Lyr',
  'the garnet star': 'mu Cep',
  'mira': 'Mira',
  'kapteyn\'s star': 'Kapteyn\'s Star',
  'the glatton meteorite': null, // Earth-based
  'pollux': 'Pollux',
  'castor': 'Castor',
  'the pistol star': 'Pistol Star',
  'the magellanic clouds': 'LMC', // Use LMC as primary
  'vega': 'Vega',
  '40 eridani': '40 Eri',
  'albireo': 'Albireo',
  'algol - the demon star': 'Algol',
  'altair': 'Altair',
  'arcturus': 'Arcturus',
  'aristarchus': null, // Moon crater
  'capella': 'Capella',
  'cygnus x 1': 'Cyg X-1',
  'deneb': 'Deneb',
  'epsilon eridani': 'eps Eri',
  'eta carina': 'eta Car',
  'orion\'s belt': null, // Asterism
  'polaris': 'Polaris',
  'przybylski\'s star': 'HD 101065',
  'sagittarius a': 'Sgr A*',
  'scholz\'s star': 'WISE 0720-0846',
  'sirius': 'Sirius',
  'stephenson 2-18': 'Stephenson 2 DFK 1',
  'tabbys star': 'KIC 8462852',
  'tabby\'s star': 'KIC 8462852',
  'scholz\'s star': 'WISE J072003.20-084651.2',
  'r136a1': 'Brey 82',
  'cor caroli': 'alpha2 CVn',
  'epsilon lyrae': 'eps1 Lyr',
  'pismis 24 1': 'Pismis 24-1',
  'the icecube observatory': null, // Facility
  'the glatton meteorite': null, // Meteorite on Earth
  'the ashdon meteorite': null, // Meteorite on Earth
  'the winchcombe meteroite': null, // Meteorite on Earth
  'aristarchus': null, // Moon crater
  'teleios': null, // Not found
  'tabby\'s star': 'KIC 8462852',
  'tau ceti': 'tau Cet',
  'the beehive cluster': 'M44',
  'the crab nebula': 'M1',
  'the fireworks galaxy': 'NGC 6946',
  'the hyades': 'Hyades',
  'the methuselah star': 'HD 140283',
  'the milky way': null, // Our galaxy
  'the pleiades': 'M45',
  'the whirlpool galaxy': 'M51',
  'the winchcombe meteroite': null, // Earth-based
  'the ashdon meteorite': null, // Earth-based
  'ton618': 'TON 618',
  'k2 18b': 'K2-18 b',
  'the icecube observatory': null, // Earth-based facility
};

// Parse "Once Around X" pattern
function parseObjectName(title) {
  // Match "Once Around X" or "Once around X"
  const match = title.match(/^Once [Aa]round\s+(.+)$/i);
  if (match) {
    return match[1].trim();
  }
  return null;
}

// Determine object type
function categorizeObject(name) {
  const nameLower = name.toLowerCase();

  // Check exact match for moving objects
  if (movingObjectsExact.has(nameLower)) {
    return { type: 'moving', needsEphemeris: true };
  }

  // Check partial match for moving objects
  for (const phrase of movingObjectsPartial) {
    if (nameLower.includes(phrase)) {
      return { type: 'moving', needsEphemeris: true };
    }
  }

  // Check if it's a concept rather than a specific object
  for (const concept of conceptObjects) {
    if (nameLower === concept || nameLower === 'the ' + concept) {
      return { type: 'concept', needsEphemeris: false };
    }
  }

  // Default to fixed object (star, nebula, galaxy, etc.)
  return { type: 'fixed', needsEphemeris: false };
}

// Get SIMBAD name if available
function getSimbadName(objectName) {
  const nameLower = objectName.toLowerCase();
  if (objectNameMap.hasOwnProperty(nameLower)) {
    return objectNameMap[nameLower];
  }
  // Return original name for SIMBAD query
  return objectName;
}

// Query SIMBAD for coordinates
function querySimbad(objectName) {
  return new Promise((resolve, reject) => {
    const simbadName = getSimbadName(objectName);
    if (!simbadName) {
      resolve({ ra: null, dec: null, error: 'No SIMBAD equivalent' });
      return;
    }

    const encodedName = encodeURIComponent(simbadName);
    const url = `https://simbad.u-strasbg.fr/simbad/sim-id?output.format=ASCII&Ident=${encodedName}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Parse SIMBAD ASCII response
        // Format: Coordinates(ICRS,ep=J2000,eq=2000): 16 29 24.45970  -26 25 55.2094
        const coordMatch = data.match(/Coordinates\(ICRS,ep=J2000,eq=2000\):\s*([\d\s.]+)\s+([+-]?[\d\s.]+)/);

        if (coordMatch) {
          const ra = coordMatch[1].trim();
          const dec = coordMatch[2].trim();
          resolve({
            ra: ra,
            dec: dec,
            simbadName: simbadName
          });
        } else {
          // Check for "not found" message
          if (data.includes('Identifier not found')) {
            resolve({ ra: null, dec: null, error: 'Not found in SIMBAD' });
          } else {
            resolve({ ra: null, dec: null, error: 'Could not parse coordinates' });
          }
        }
      });
    }).on('error', (err) => {
      resolve({ ra: null, dec: null, error: err.message });
    });
  });
}

// Main processing
async function buildCatalog() {
  const catalog = [];

  for (const video of videos) {
    const objectName = parseObjectName(video.title);

    const entry = {
      title: video.title,
      url: video.url,
      videoId: video.videoId,
      objectName: objectName,
      category: null,
      ra: null,
      dec: null,
      isMoving: false,
      notes: null
    };

    if (objectName) {
      const category = categorizeObject(objectName);
      entry.category = category.type;
      entry.isMoving = category.needsEphemeris;

      if (category.type === 'fixed') {
        // Query SIMBAD for coordinates
        const coords = await querySimbad(objectName);
        entry.ra = coords.ra;
        entry.dec = coords.dec;
        entry.simbadName = coords.simbadName;
        if (coords.error) {
          entry.notes = coords.error;
        }
        // Rate limit
        await new Promise(r => setTimeout(r, 200));
      } else if (category.type === 'moving') {
        entry.notes = 'Use JPL Horizons for ephemeris';
      } else if (category.type === 'concept') {
        entry.notes = 'Class of objects, no single position';
      }
    } else {
      entry.category = 'other';
      entry.notes = 'Not an "Once Around" video';
    }

    catalog.push(entry);
    console.error(`Processed: ${video.title}`);
  }

  return catalog;
}

// Run
buildCatalog()
  .then(catalog => {
    console.log(JSON.stringify(catalog, null, 2));
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
