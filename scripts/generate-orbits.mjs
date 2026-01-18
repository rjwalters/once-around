#!/usr/bin/env node
/**
 * Generate pre-computed orbit data for planetary orbit visualization.
 *
 * This script computes orbital positions for all planets and saves them
 * to a binary file that can be loaded instantly at runtime.
 *
 * Run with: node scripts/generate-orbits.mjs
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Constants from renderer/constants.ts
const ORBIT_PLANET_INDICES = [2, 3, 4, 5, 6, 7, 8]; // Mercury through Neptune
const ORBIT_NUM_POINTS = 120;
const SKY_RADIUS = 50;

// Orbital periods in days
const ORBIT_PERIODS_DAYS = {
  2: 88,      // Mercury
  3: 225,     // Venus
  4: 687,     // Mars
  5: 1200,    // Jupiter (shortened for viz)
  6: 2400,    // Saturn (shortened for viz)
  7: 3600,    // Uranus (shortened for viz)
  8: 5400,    // Neptune (shortened for viz)
};

// Convert Rust/WASM coords (Z-up) to Three.js coords (Y-up)
function rustToThreeJS(rustX, rustY, rustZ, scale = 1) {
  return {
    x: -rustX * scale,
    y: rustZ * scale,
    z: rustY * scale,
  };
}

// Read position from buffer at given body index
function readPositionFromBuffer(buffer, index, scale = 1) {
  const offset = index * 3;
  return rustToThreeJS(buffer[offset], buffer[offset + 1], buffer[offset + 2], scale);
}

async function main() {
  console.log('Loading WASM module...');

  // Load the WASM glue code
  const wasmPath = join(PROJECT_ROOT, 'apps/web/src/wasm/sky_engine_bg.wasm');
  const jsPath = join(PROJECT_ROOT, 'apps/web/src/wasm/sky_engine.js');

  // Read the WASM file
  const wasmBuffer = await readFile(wasmPath);

  // Dynamically import the JS glue (need to handle the module)
  // For Node.js, we need to patch some browser APIs
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;

  // Import the module
  const wasmModule = await import(jsPath);
  const init = wasmModule.default;
  const { SkyEngine } = wasmModule;

  // Initialize WASM with the buffer
  console.log('Initializing WASM...');
  const wasm = await init(wasmBuffer);

  // Load tier 1 stars (minimal set needed for engine)
  const tier1Path = join(PROJECT_ROOT, 'apps/web/public/data/stars/bsc5-tier1.bin');
  const tier1Bytes = new Uint8Array(await readFile(tier1Path));
  console.log(`Loaded tier 1 stars: ${tier1Bytes.length} bytes`);

  // Create engine
  const engine = new SkyEngine(tier1Bytes);
  console.log(`Engine created with ${engine.total_stars()} stars`);

  // Use J2000 epoch as reference (2000-01-01 12:00 TT)
  const referenceDate = new Date('2000-01-01T12:00:00Z');
  const jd = dateToJD(referenceDate);

  console.log(`Using reference date: ${referenceDate.toISOString()} (JD ${jd.toFixed(2)})`);

  // Compute orbits
  const radius = SKY_RADIUS - 1;
  const msPerDay = 24 * 60 * 60 * 1000;

  // Prepare output buffer: 7 planets × 120 points × 3 floats
  const totalFloats = ORBIT_PLANET_INDICES.length * ORBIT_NUM_POINTS * 3;
  const orbitData = new Float32Array(totalFloats);
  let outputIndex = 0;

  console.log('Computing orbits...');

  for (const bodyIdx of ORBIT_PLANET_INDICES) {
    const orbitPeriod = ORBIT_PERIODS_DAYS[bodyIdx];
    const halfSpan = orbitPeriod / 2;
    const planetName = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'][bodyIdx];

    console.log(`  ${planetName}: ${ORBIT_NUM_POINTS} points over ${orbitPeriod} days`);

    for (let i = 0; i < ORBIT_NUM_POINTS; i++) {
      // Calculate date for this sample point
      const t = i / (ORBIT_NUM_POINTS - 1);
      const dayOffset = -halfSpan + t * orbitPeriod;
      const sampleDate = new Date(referenceDate.getTime() + dayOffset * msPerDay);

      // Set engine time and compute
      engine.set_time_utc(
        sampleDate.getUTCFullYear(),
        sampleDate.getUTCMonth() + 1,
        sampleDate.getUTCDate(),
        sampleDate.getUTCHours(),
        sampleDate.getUTCMinutes(),
        sampleDate.getUTCSeconds()
      );
      engine.recompute();

      // Get position buffer and extract this planet's position
      const ptr = engine.bodies_pos_ptr();
      const len = engine.bodies_pos_len();
      const bodyPositions = new Float32Array(wasm.memory.buffer, ptr, len);

      const pos = readPositionFromBuffer(bodyPositions, bodyIdx, radius);

      orbitData[outputIndex++] = pos.x;
      orbitData[outputIndex++] = pos.y;
      orbitData[outputIndex++] = pos.z;
    }
  }

  // Write output file
  const outputDir = join(PROJECT_ROOT, 'apps/web/public/data');
  await mkdir(outputDir, { recursive: true });

  const outputPath = join(outputDir, 'orbits.bin');
  await writeFile(outputPath, Buffer.from(orbitData.buffer));

  const fileSizeKB = (orbitData.byteLength / 1024).toFixed(1);
  console.log(`\nWrote ${outputPath}`);
  console.log(`  ${ORBIT_PLANET_INDICES.length} planets × ${ORBIT_NUM_POINTS} points × 3 floats`);
  console.log(`  ${totalFloats} floats = ${orbitData.byteLength} bytes (${fileSizeKB} KB)`);

  // Also write a small header file for reference
  const headerPath = join(outputDir, 'orbits.json');
  const header = {
    version: 1,
    referenceDate: referenceDate.toISOString(),
    referenceJD: jd,
    planets: ORBIT_PLANET_INDICES,
    pointsPerOrbit: ORBIT_NUM_POINTS,
    floatsPerPoint: 3,
    totalFloats: totalFloats,
    byteLength: orbitData.byteLength,
    generated: new Date().toISOString(),
  };
  await writeFile(headerPath, JSON.stringify(header, null, 2));
  console.log(`Wrote ${headerPath}`);
}

// Convert Date to Julian Date
function dateToJD(date) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate() +
            date.getUTCHours() / 24 +
            date.getUTCMinutes() / 1440 +
            date.getUTCSeconds() / 86400;

  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;

  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy +
         Math.floor(yy / 4) - Math.floor(yy / 100) +
         Math.floor(yy / 400) - 32045;
}

main().catch(console.error);
