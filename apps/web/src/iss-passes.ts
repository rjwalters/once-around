/**
 * ISS Pass Prediction Module
 *
 * Finds upcoming visible ISS passes for the observer's location.
 * A pass is visible when:
 * 1. ISS is above the observer's horizon
 * 2. ISS is illuminated by the Sun (not in Earth's shadow)
 * 3. Sky is dark enough (Sun below civil twilight limit)
 */

import type { SkyEngine } from "./wasm/sky_engine";
import { SATELLITE_ISS } from "./engine";

/** Direction abbreviations for azimuth */
const DIRECTIONS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

function azimuthToDirection(az: number): string {
  // Normalize to 0-360
  az = ((az % 360) + 360) % 360;
  const index = Math.round(az / 22.5) % 16;
  return DIRECTIONS[index];
}

export interface ISSPass {
  /** When ISS rises above horizon */
  riseTime: Date;
  /** Azimuth at rise (degrees) */
  riseAzimuth: number;
  /** Direction at rise ("NW", "NE", etc.) */
  riseDirection: string;
  /** Time of maximum altitude */
  maxTime: Date;
  /** Maximum altitude reached (degrees) */
  maxAltitude: number;
  /** Azimuth at maximum altitude (degrees) */
  maxAzimuth: number;
  /** When ISS sets below horizon */
  setTime: Date;
  /** Azimuth at set (degrees) */
  setAzimuth: number;
  /** Direction at set */
  setDirection: string;
  /** Total duration in seconds */
  duration: number;
  /** Brightness estimate (lower = brighter) */
  brightness: number;
}

export interface ISSPassOptions {
  /** Minimum altitude for a pass to be included (default: 10°) */
  minAltitude?: number;
  /** Maximum number of passes to find (default: 10) */
  maxPasses?: number;
  /** Sun altitude limit for dark sky (default: -6° = civil twilight) */
  sunAltitudeLimit?: number;
  /** Satellite index (default: ISS = 0) */
  satelliteIndex?: number;
}

/** Julian Date offset from Unix timestamp */
const JD_UNIX_EPOCH = 2440587.5;
const MS_PER_DAY = 86400000;

function jdToDate(jd: number): Date {
  return new Date((jd - JD_UNIX_EPOCH) * MS_PER_DAY);
}

/**
 * Number of f64 values per pass record returned by `SkyEngine.find_passes`.
 * Layout: [rise_jd, rise_az, max_jd, max_alt, max_az, set_jd, set_az].
 * Must match `PASS_RECORD_LEN` in crates/sky_engine/src/lib.rs.
 */
export const PASS_RECORD_LEN = 7;

/** Coarse scan step used by the pass finder: 10 minutes, in days. */
export const SCAN_STEP_DAYS = 10 / 1440;

/**
 * Determine the [searchStartJD, endJD] window for a pass scan from an engine's
 * loaded ephemeris. Starts at the current time or the ephemeris start (whichever
 * is later). Returns null when no ephemeris is loaded or the window is empty.
 */
export function passScanWindow(
  engine: SkyEngine,
  satelliteIndex: number,
  nowMs: number = Date.now()
): { searchStartJD: number; endJD: number } | null {
  const range = engine.satellite_ephemeris_range(satelliteIndex);
  if (!range || range.length < 2) {
    return null;
  }
  const [startJD, endJD] = range;
  const nowJD = nowMs / MS_PER_DAY + JD_UNIX_EPOCH;
  const searchStartJD = Math.max(nowJD, startJD);
  if (searchStartJD >= endJD) {
    return null;
  }
  return { searchStartJD, endJD };
}

/**
 * Coverage status of a satellite ephemeris relative to a reference time.
 *
 * - `ok`: the loaded ephemeris covers `now` — positions and passes are valid.
 * - `stale`: the ephemeris ended in the past. Satellite positions and pass
 *   predictions are unavailable; the bundled data needs to be regenerated.
 * - `future`: the ephemeris starts in the future (rare — e.g. a clock set
 *   wrong or freshly generated data not yet in range).
 * - `missing`: no ephemeris is loaded for this satellite.
 */
export type EphemerisStatus =
  | { state: "ok"; startJD: number; endJD: number }
  | { state: "stale"; startJD: number; endJD: number; coverageEnd: Date }
  | { state: "future"; startJD: number; endJD: number; coverageStart: Date }
  | { state: "missing" };

/**
 * Determine whether a satellite's loaded ephemeris still covers the current
 * time. This is the single source of truth for the UI's staleness indicator:
 * when data goes stale the WASM engine silently returns no position (and the
 * pass scan finds nothing), so the UI must detect the out-of-range condition
 * explicitly rather than showing a misleading "no passes" state.
 *
 * @param engine - The SkyEngine instance
 * @param satelliteIndex - Satellite index (default: ISS = 0)
 * @param nowMs - Reference time in Unix milliseconds (default: Date.now())
 */
export function getEphemerisStatus(
  engine: SkyEngine,
  satelliteIndex: number = SATELLITE_ISS,
  nowMs: number = Date.now()
): EphemerisStatus {
  const range = engine.satellite_ephemeris_range(satelliteIndex);
  if (!range || range.length < 2) {
    return { state: "missing" };
  }
  const [startJD, endJD] = range;
  const nowJD = nowMs / MS_PER_DAY + JD_UNIX_EPOCH;
  if (nowJD > endJD) {
    return { state: "stale", startJD, endJD, coverageEnd: jdToDate(endJD) };
  }
  if (nowJD < startJD) {
    return { state: "future", startJD, endJD, coverageStart: jdToDate(startJD) };
  }
  return { state: "ok", startJD, endJD };
}

/**
 * Convert the flat `find_passes` buffer into `ISSPass[]`.
 * Shared by the synchronous path and the Web Worker path.
 */
export function parsePassBuffer(buf: Float64Array | number[]): ISSPass[] {
  const passes: ISSPass[] = [];
  for (let i = 0; i + PASS_RECORD_LEN <= buf.length; i += PASS_RECORD_LEN) {
    const riseJD = buf[i];
    const riseAz = buf[i + 1];
    const maxJD = buf[i + 2];
    const maxAlt = buf[i + 3];
    const maxAz = buf[i + 4];
    const setJD = buf[i + 5];
    const setAz = buf[i + 6];

    const riseTime = jdToDate(riseJD);
    const setTime = jdToDate(setJD);

    passes.push({
      riseTime,
      riseAzimuth: riseAz,
      riseDirection: azimuthToDirection(riseAz),
      maxTime: jdToDate(maxJD),
      maxAltitude: maxAlt,
      maxAzimuth: maxAz,
      setTime,
      setAzimuth: setAz,
      setDirection: azimuthToDirection(setAz),
      duration: (setTime.getTime() - riseTime.getTime()) / 1000,
      brightness: estimateBrightness(maxAlt)
    });
  }
  return passes;
}

/**
 * Find upcoming visible ISS passes for the observer's current location.
 *
 * The heavy lifting runs entirely inside the WASM engine via `find_passes`, which
 * scans the ephemeris span using a targeted per-sample evaluation (satellite
 * interpolation + Sun geometry) instead of ~1000+ full `engine.recompute()` calls
 * on the main thread. It constructs its own time per sample and never mutates the
 * shared engine's time, so no save/restore dance is required here.
 *
 * This synchronous entry point is used as a fallback when a Web Worker is not
 * available; the UI normally runs the same scan off the main thread
 * (see `iss-passes-worker.ts`).
 *
 * @param engine - The SkyEngine instance with observer location set
 * @param options - Configuration options for pass finding
 * @returns Array of visible passes
 */
export function findISSPasses(
  engine: SkyEngine,
  options: ISSPassOptions = {}
): ISSPass[] {
  const {
    minAltitude = 10,
    maxPasses = 10,
    sunAltitudeLimit = -6,
    satelliteIndex = SATELLITE_ISS
  } = options;

  const window = passScanWindow(engine, satelliteIndex);
  if (!window) {
    return [];
  }

  // Single fast WASM call: coarse scan + binary-search refinement + max-altitude
  // sampling all happen inside Rust, returning a flat buffer of pass records.
  const buf = engine.find_passes(
    satelliteIndex,
    window.searchStartJD,
    window.endJD,
    SCAN_STEP_DAYS,
    minAltitude,
    sunAltitudeLimit,
    maxPasses
  );

  return parsePassBuffer(buf);
}

/**
 * Estimate ISS brightness based on altitude.
 * ISS is typically mag -1 to -4 depending on angle.
 * Higher altitude = brighter (shorter path through atmosphere, better illumination angle).
 */
function estimateBrightness(altitude: number): number {
  // At zenith (~90°): about mag -4
  // At 45°: about mag -2.5
  // At 10°: about mag -1
  const brightestMag = -4;
  const dimmestMag = -1;
  const altFraction = Math.min(1, altitude / 90);
  return dimmestMag + (brightestMag - dimmestMag) * altFraction;
}

/**
 * Format a pass for display.
 */
export function formatPass(pass: ISSPass): string {
  const date = pass.riseTime.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
  const riseTime = pass.riseTime.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  });
  const duration = Math.round(pass.duration / 60);

  return `${date} ${riseTime} - ${Math.round(pass.maxAltitude)}° max - ${duration} min`;
}

/**
 * Get a short description of the next pass.
 */
export function getNextPassSummary(pass: ISSPass): string {
  const now = new Date();
  const diffMs = pass.riseTime.getTime() - now.getTime();

  if (diffMs < 0) {
    // Pass is happening now
    return "Visible now!";
  }

  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
  } else if (diffHours > 0) {
    return `in ${diffHours}h ${diffMinutes % 60}m`;
  } else {
    return `in ${diffMinutes}m`;
  }
}
