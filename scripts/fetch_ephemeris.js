const https = require('https');
const fs = require('fs');

// Map object names to JPL Horizons identifiers
const horizonsIds = {
  // Planets
  'Mercury': '199',
  'Venus': '299',
  'Jupiter': '599',
  'Saturn': '699',

  // Moons - use parent planet position as approximation
  'Janus and Epimetheus': '699',  // Saturn moons
  'the Moons of Neptune': '899',  // Neptune
  'the Moons of Mars': '499',     // Mars
  'the Moons of Pluto': '999',    // Pluto
  'Triton': '899',                // Neptune's moon

  // Dwarf planets & TNOs
  'Eris': '136199',
  'Makemake': '136472',
  'Huamea': '136108',
  'Quaoar': '50000',
  'Orcus': '90482',
  'Varuna': '20000',
  'Ixion': '28978',
  'Gonggong': '225088',
  'QB1': '15760',                 // 1992 QB1
  'The Goblin': '541132',         // 2015 TG387
  'Ultima Thule': '486958',       // Arrokoth

  // Asteroids
  'Ceres': '1',
  'Vesta': '4',
  'Asteroid Apophis': '99942',
  'Asteroid Bennu': '101955',
  'the Lost Asteroid Hermes': '69230',

  // Comets
  'Schwassmann-Wachmann-1': '29P',
  '3I ATLAS: Interstellar Comet': null,  // May not be trackable

  // Spacecraft/special
  'New Horizons (Kuiper Belt)': '-98',
  'Oumuamua': null,  // Interstellar, may not be available

  // Hypothetical - no real position
  'Vulcan': null,
  'Planet Nine': null,
  'Achlys': null,  // Fictional?
  'the Centaurs': null,  // Class of objects
  'the Ice Giants': '799',  // Use Uranus as representative
};

// Query JPL Horizons API
function queryHorizons(objectId, objectName) {
  return new Promise((resolve) => {
    if (!objectId) {
      resolve({ name: objectName, error: 'No Horizons ID available' });
      return;
    }

    const now = new Date();
    const startDate = now.toISOString().split('T')[0];
    const endDate = new Date(now.getTime() + 86400000).toISOString().split('T')[0];

    const params = new URLSearchParams({
      format: 'json',
      COMMAND: `'${objectId}'`,
      OBJ_DATA: 'NO',
      MAKE_EPHEM: 'YES',
      EPHEM_TYPE: 'OBSERVER',
      CENTER: "'500@399'",  // Geocentric
      START_TIME: `'${startDate}'`,
      STOP_TIME: `'${endDate}'`,
      STEP_SIZE: "'1 d'",
      QUANTITIES: "'1,20'",  // RA/Dec and observer range
    });

    const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${params}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            resolve({ name: objectName, error: json.error });
            return;
          }

          const result = json.result || '';

          // Parse RA/Dec from ephemeris output
          // Format: date, RA (HMS), Dec (DMS), ...
          const lines = result.split('\n');
          let inData = false;
          let ra = null, dec = null;

          for (const line of lines) {
            if (line.includes('$$SOE')) {
              inData = true;
              continue;
            }
            if (line.includes('$$EOE')) {
              break;
            }
            if (inData && line.trim()) {
              // Parse the ephemeris line
              // Example: 2024-Jan-13 00:00  05 23 45.67 +22 34 12.3 ...
              const match = line.match(/(\d{2}\s+\d{2}\s+[\d.]+)\s+([+-]?\d{2}\s+\d{2}\s+[\d.]+)/);
              if (match) {
                ra = match[1];
                dec = match[2];
                break;
              }
            }
          }

          if (ra && dec) {
            // Convert to decimal
            const raParts = ra.split(/\s+/).map(parseFloat);
            const decParts = dec.split(/\s+/).map(parseFloat);

            const raDecimal = (raParts[0] + raParts[1]/60 + raParts[2]/3600) * 15;
            const decSign = dec.trim().startsWith('-') ? -1 : 1;
            const decDecimal = decSign * (Math.abs(decParts[0]) + decParts[1]/60 + decParts[2]/3600);

            resolve({
              name: objectName,
              horizonsId: objectId,
              ra: ra,
              dec: dec,
              ra_decimal: raDecimal,
              dec_decimal: decDecimal,
              date: startDate
            });
          } else {
            resolve({ name: objectName, error: 'Could not parse position', raw: result.slice(0, 500) });
          }
        } catch (err) {
          resolve({ name: objectName, error: err.message });
        }
      });
    }).on('error', (err) => {
      resolve({ name: objectName, error: err.message });
    });
  });
}

async function fetchAllEphemeris() {
  const results = {};

  for (const [name, id] of Object.entries(horizonsIds)) {
    console.error(`Fetching: ${name}...`);
    const result = await queryHorizons(id, name);
    results[name] = result;

    if (result.ra_decimal) {
      console.error(`  ✓ RA=${result.ra_decimal.toFixed(4)}° Dec=${result.dec_decimal.toFixed(4)}°`);
    } else {
      console.error(`  ✗ ${result.error || 'Failed'}`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  return results;
}

// Run
fetchAllEphemeris()
  .then(results => {
    console.log(JSON.stringify(results, null, 2));

    // Save to file
    fs.writeFileSync('data/ephemeris.json', JSON.stringify(results, null, 2));
    console.error('\nSaved to data/ephemeris.json');
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
