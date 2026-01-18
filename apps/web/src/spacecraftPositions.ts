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
