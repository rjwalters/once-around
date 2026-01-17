/**
 * Coordinate formatting utilities for celestial coordinates.
 */

/**
 * Format Right Ascension in hours/minutes (e.g., "12h 34m")
 */
export function formatRA(raDeg: number): string {
  const raHours = raDeg / 15; // 360° = 24h
  const h = Math.floor(raHours);
  const m = Math.floor((raHours - h) * 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

/**
 * Format Declination in degrees/arcminutes (e.g., "+45° 30'")
 */
export function formatDec(decDeg: number): string {
  const sign = decDeg >= 0 ? "+" : "-";
  const absDec = Math.abs(decDeg);
  const d = Math.floor(absDec);
  const m = Math.floor((absDec - d) * 60);
  return `${sign}${d}° ${m.toString().padStart(2, "0")}'`;
}

/**
 * Format altitude (e.g., "+45°")
 */
export function formatAltitude(altDeg: number): string {
  const sign = altDeg >= 0 ? "+" : "";
  return `${sign}${Math.round(altDeg)}°`;
}

/**
 * Get compass direction from azimuth.
 */
export function getCompassDirection(azDeg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(((azDeg % 360) + 360) % 360 / 45) % 8;
  return dirs[index];
}

/**
 * Format azimuth with compass direction (e.g., "135° (SE)")
 */
export function formatAzimuth(azDeg: number): string {
  const az = Math.round(((azDeg % 360) + 360) % 360);
  const dir = getCompassDirection(azDeg);
  return `${az}° (${dir})`;
}

/**
 * Format RA for DSO display (hours:minutes)
 */
export function formatRAForDSO(raDeg: number): string {
  const raHours = raDeg / 15;
  const h = Math.floor(raHours);
  const m = Math.floor((raHours - h) * 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

/**
 * Format Dec for DSO display (degrees)
 */
export function formatDecForDSO(decDeg: number): string {
  const sign = decDeg >= 0 ? "+" : "";
  return `${sign}${Math.round(decDeg)}°`;
}

/**
 * Format Field of View for display
 */
export function formatFOV(fov: number): string {
  if (fov < 1) {
    return `${fov.toFixed(2)}°`;
  } else if (fov < 10) {
    return `${fov.toFixed(1)}°`;
  } else {
    return `${Math.round(fov)}°`;
  }
}

/**
 * Format Local Sidereal Time in hours/minutes (e.g., "14h 23m")
 * LST is provided in degrees (0-360).
 */
export function formatLST(lstDeg: number): string {
  // Normalize to 0-360
  const normalized = ((lstDeg % 360) + 360) % 360;
  const lstHours = normalized / 15; // 360° = 24h
  const h = Math.floor(lstHours);
  const m = Math.floor((lstHours - h) * 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}
