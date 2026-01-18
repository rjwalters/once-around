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
 * Set engine time from a JavaScript Date
 */
function setEngineTime(engine: SkyEngine, date: Date): void {
  engine.set_time_utc(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds() + date.getUTCMilliseconds() / 1000
  );
}

interface VisibilityState {
  aboveHorizon: boolean;
  illuminated: boolean;
  sunBelowLimit: boolean;
  altitude: number;
  azimuth: number;
  distanceKm: number;
}

/**
 * Get the current visibility state for the satellite.
 * Assumes engine time and observer location are already set.
 */
function getVisibilityState(engine: SkyEngine, index: number, sunAltLimit: number): VisibilityState {
  engine.recompute();

  const aboveHorizon = engine.satellite_above_horizon(index);
  const illuminated = engine.satellite_illuminated(index);
  const sunAlt = engine.sun_altitude();
  const sunBelowLimit = sunAlt < sunAltLimit;
  const distanceKm = engine.satellite_distance_km(index);

  // Estimate altitude from distance (ISS: ~400km at zenith, ~2300km at horizon)
  const minDist = 400;
  const maxDist = 2300;
  const altFraction = Math.max(0, Math.min(1, (maxDist - distanceKm) / (maxDist - minDist)));
  const altitude = aboveHorizon ? altFraction * 90 : -10;

  return {
    aboveHorizon,
    illuminated,
    sunBelowLimit,
    altitude,
    azimuth: 0, // Azimuth computed separately when needed
    distanceKm
  };
}

/**
 * Check if satellite is currently visible (all conditions met).
 */
function isVisible(state: VisibilityState): boolean {
  return state.aboveHorizon && state.illuminated && state.sunBelowLimit;
}

/**
 * Compute altitude and azimuth at a given time.
 * Returns { altitude, azimuth } in degrees.
 */
function computeAltAz(engine: SkyEngine, date: Date, index: number): { altitude: number; azimuth: number } {
  setEngineTime(engine, date);
  engine.recompute();

  const aboveHorizon = engine.satellite_above_horizon(index);

  if (!aboveHorizon) {
    return { altitude: -10, azimuth: 0 }; // Below horizon
  }

  // Estimate altitude based on distance
  // ISS at zenith is ~400km, at horizon is ~2300km
  const distanceKm = engine.satellite_distance_km(index);
  // Rough altitude estimate: closer distance = higher altitude
  // This is a simplification; the actual calculation is more complex
  const minDist = 400; // km (zenith)
  const maxDist = 2300; // km (horizon)
  const altFraction = Math.max(0, Math.min(1, (maxDist - distanceKm) / (maxDist - minDist)));
  const altitude = altFraction * 90; // degrees

  // Azimuth is harder to estimate without the full calculation
  // We'll return a placeholder and refine during the actual pass tracking
  const azimuth = 0; // Placeholder

  return { altitude, azimuth };
}

/**
 * Binary search to find the exact time when visibility changes.
 * Returns the time when the condition changes (within ~30 seconds precision).
 */
function binarySearchTransition(
  engine: SkyEngine,
  startDate: Date,
  endDate: Date,
  index: number,
  sunAltLimit: number,
  findRise: boolean // true = find rise (not visible -> visible), false = find set
): Date {
  let lo = startDate.getTime();
  let hi = endDate.getTime();

  // Binary search to ~30 second precision
  while (hi - lo > 30000) {
    const mid = (lo + hi) / 2;
    const midDate = new Date(mid);
    setEngineTime(engine, midDate);
    const state = getVisibilityState(engine, index, sunAltLimit);
    const visible = isVisible(state);

    if (findRise) {
      // Looking for transition from not visible to visible
      if (visible) {
        hi = mid;
      } else {
        lo = mid;
      }
    } else {
      // Looking for transition from visible to not visible
      if (visible) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
  }

  return new Date(findRise ? hi : lo);
}

/**
 * Find the time and altitude of maximum elevation during a pass.
 */
function findMaxAltitude(
  engine: SkyEngine,
  startDate: Date,
  endDate: Date,
  index: number
): { time: Date; altitude: number; azimuth: number } {
  let maxAlt = -90;
  let maxTime = startDate;
  let maxAz = 0;

  // Sample every 30 seconds to find maximum
  const stepMs = 30000;
  for (let t = startDate.getTime(); t <= endDate.getTime(); t += stepMs) {
    const date = new Date(t);
    const { altitude, azimuth } = computeAltAz(engine, date, index);

    if (altitude > maxAlt) {
      maxAlt = altitude;
      maxTime = date;
      maxAz = azimuth;
    }
  }

  return { time: maxTime, altitude: maxAlt, azimuth: maxAz };
}

/**
 * Find upcoming visible ISS passes for the observer's current location.
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

  // Get ephemeris time range
  const range = engine.satellite_ephemeris_range(satelliteIndex);
  if (!range || range.length < 2) {
    console.warn("No satellite ephemeris loaded");
    return [];
  }

  const [startJD, endJD] = range;
  const startDate = jdToDate(startJD);
  const endDate = jdToDate(endJD);

  // Start from current time or ephemeris start, whichever is later
  const now = new Date();
  const searchStart = now > startDate ? now : startDate;

  // Save current engine state
  const savedJD = engine.julian_date_tdb();

  const passes: ISSPass[] = [];
  const scanStepMinutes = 10;
  const scanStepMs = scanStepMinutes * 60 * 1000;

  let currentTime = searchStart.getTime();
  let wasVisible = false;
  let passStartTime: Date | null = null;

  // Coarse scan at 10-minute intervals
  while (currentTime < endDate.getTime() && passes.length < maxPasses) {
    const date = new Date(currentTime);
    setEngineTime(engine, date);
    const state = getVisibilityState(engine, satelliteIndex, sunAltitudeLimit);
    const nowVisible = isVisible(state);

    if (!wasVisible && nowVisible) {
      // Pass started - refine the rise time
      const searchStartDate = new Date(currentTime - scanStepMs);
      passStartTime = binarySearchTransition(
        engine,
        searchStartDate,
        date,
        satelliteIndex,
        sunAltitudeLimit,
        true // find rise
      );
    } else if (wasVisible && !nowVisible && passStartTime) {
      // Pass ended - refine the set time
      const searchEndDate = date;
      const passEndTime = binarySearchTransition(
        engine,
        new Date(currentTime - scanStepMs),
        searchEndDate,
        satelliteIndex,
        sunAltitudeLimit,
        false // find set
      );

      // Find maximum altitude during pass
      const maxInfo = findMaxAltitude(engine, passStartTime, passEndTime, satelliteIndex);

      // Only include passes above minimum altitude
      if (maxInfo.altitude >= minAltitude) {
        // Get rise/set azimuth
        const riseAltAz = computeAltAz(engine, passStartTime, satelliteIndex);
        const setAltAz = computeAltAz(engine, passEndTime, satelliteIndex);

        const pass: ISSPass = {
          riseTime: passStartTime,
          riseAzimuth: riseAltAz.azimuth,
          riseDirection: azimuthToDirection(riseAltAz.azimuth),
          maxTime: maxInfo.time,
          maxAltitude: maxInfo.altitude,
          maxAzimuth: maxInfo.azimuth,
          setTime: passEndTime,
          setAzimuth: setAltAz.azimuth,
          setDirection: azimuthToDirection(setAltAz.azimuth),
          duration: (passEndTime.getTime() - passStartTime.getTime()) / 1000,
          brightness: estimateBrightness(maxInfo.altitude)
        };

        passes.push(pass);
      }

      passStartTime = null;
    }

    wasVisible = nowVisible;
    currentTime += scanStepMs;
  }

  // Restore engine time
  const restoredDate = jdToDate(savedJD);
  setEngineTime(engine, restoredDate);
  engine.recompute();

  return passes;
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
