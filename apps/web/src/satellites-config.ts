/**
 * Satellite configuration constants.
 *
 * This module is intentionally free of any WASM (`./wasm/sky_engine`) imports so
 * it can be imported by pure-TypeScript geometry modules (e.g. `iss-passes.ts`)
 * without transitively pulling in the WASM glue via `engine.ts`. The web
 * geometry unit-test job deliberately runs without a `build:wasm` step (see
 * `.github/workflows/ci.yml`), so any module reachable from a test must stay
 * WASM-free.
 */

// Satellite indices (must match Rust SatelliteId order)
export const SATELLITE_ISS = 0;
export const SATELLITE_HUBBLE = 1;

/**
 * Satellite info for frontend use.
 */
export interface SatelliteInfo {
  index: number;
  name: string;
  fullName: string;
  ephemerisUrl: string;
}

/**
 * All supported satellites.
 */
export const SATELLITES: SatelliteInfo[] = [
  { index: SATELLITE_ISS, name: "ISS", fullName: "International Space Station", ephemerisUrl: "/data/iss_ephemeris.bin" },
  { index: SATELLITE_HUBBLE, name: "Hubble", fullName: "Hubble Space Telescope", ephemerisUrl: "/data/hubble_ephemeris.bin" },
];
