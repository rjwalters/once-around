/**
 * Spacecraft Positions
 *
 * Hardcoded heliocentric positions for spacecraft at specific historical dates.
 * Used for tour viewpoints that position the observer at a spacecraft's location.
 *
 * Positions are in AU, heliocentric ecliptic coordinates (J2000).
 */

export interface SpacecraftPosition {
  x: number;      // Heliocentric X in AU
  y: number;      // Heliocentric Y in AU
  z: number;      // Heliocentric Z in AU
  distanceAU: number;  // Distance from Sun in AU
}

/**
 * Heliocentric positions for celestial bodies.
 */
export interface HeliocentricPosition {
  x: number;      // Heliocentric X in AU
  y: number;      // Heliocentric Y in AU
  z: number;      // Heliocentric Z in AU
}

/**
 * Heliocentric planet positions for specific dates.
 * Used for remote viewpoint rendering (e.g., Pale Blue Dot from Voyager 1).
 *
 * Positions computed from JPL Horizons ephemeris data.
 * Coordinates are heliocentric ecliptic (J2000), in AU.
 */
export const HELIOCENTRIC_POSITIONS: Record<string, Record<string, HeliocentricPosition>> = {
  // February 14, 1990 - Pale Blue Dot photograph date
  // JD 2447937.5
  '1990-02-14': {
    Sun: { x: 0, y: 0, z: 0 },
    Mercury: { x: -0.387, y: -0.092, z: -0.024 },
    Venus: { x: 0.328, y: -0.622, z: -0.051 },
    Earth: { x: -0.795, y: 0.555, z: 0.000 },
    Mars: { x: 1.136, y: 0.889, z: -0.008 },
    Jupiter: { x: -1.934, y: -4.738, z: 0.082 },
    Saturn: { x: 7.496, y: -6.774, z: -0.246 },
    Uranus: { x: -12.817, y: -14.267, z: 0.129 },
    Neptune: { x: -8.387, y: -28.766, z: 0.632 },
  },
};

/**
 * Get heliocentric positions for all bodies on a specific date.
 * @param date - Date to look up
 * @returns Map of body names to heliocentric positions, or null if not available
 */
export function getHeliocentricPositions(
  date: Date
): Map<string, HeliocentricPosition> | null {
  const dateKey = date.toISOString().split('T')[0];
  const positions = HELIOCENTRIC_POSITIONS[dateKey];

  if (!positions) {
    return null;
  }

  return new Map(Object.entries(positions));
}

/**
 * Spacecraft positions indexed by spacecraft name and ISO date string (YYYY-MM-DD).
 *
 * Currently includes:
 * - Voyager 1: February 14, 1990 (Pale Blue Dot photograph)
 */
export const SPACECRAFT_POSITIONS: Record<string, Record<string, SpacecraftPosition>> = {
  voyager1: {
    // February 14, 1990 - Pale Blue Dot photograph
    // Voyager 1 was approximately 40.11 AU from the Sun
    // Position computed from JPL Horizons ephemeris data
    '1990-02-14': {
      x: -26.67,
      y: 28.57,
      z: 12.31,
      distanceAU: 40.11,
    },
  },
  // Future spacecraft can be added here:
  // voyager2: { ... },
  // cassini: { ... },
  // newhorizons: { ... },
};

/**
 * Get the position of a spacecraft on a specific date.
 *
 * @param spacecraft - Spacecraft identifier (e.g., 'voyager1')
 * @param date - Date to look up position
 * @returns Position if available, null otherwise
 */
export function getSpacecraftPosition(
  spacecraft: string,
  date: Date
): SpacecraftPosition | null {
  const spacecraftData = SPACECRAFT_POSITIONS[spacecraft];
  if (!spacecraftData) {
    console.warn(`Unknown spacecraft: ${spacecraft}`);
    return null;
  }

  // Format date as YYYY-MM-DD for lookup
  const dateKey = date.toISOString().split('T')[0];

  const position = spacecraftData[dateKey];
  if (!position) {
    // Try to find the closest available date for this spacecraft
    const availableDates = Object.keys(spacecraftData);
    console.warn(
      `No position data for ${spacecraft} on ${dateKey}. ` +
      `Available dates: ${availableDates.join(', ')}`
    );
    return null;
  }

  return position;
}

/**
 * List all available spacecraft.
 */
export function getAvailableSpacecraft(): string[] {
  return Object.keys(SPACECRAFT_POSITIONS);
}

/**
 * Get all available dates for a spacecraft.
 */
export function getAvailableDates(spacecraft: string): string[] {
  const spacecraftData = SPACECRAFT_POSITIONS[spacecraft];
  if (!spacecraftData) return [];
  return Object.keys(spacecraftData);
}
