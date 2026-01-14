/**
 * Total Solar Eclipse Data Catalog
 *
 * Contains total solar eclipses from 2020-2045 with precise times and locations.
 * Times are at greatest eclipse (when the umbral shadow is closest to Earth's center).
 *
 * Data sourced from NASA eclipse predictions.
 */

export interface TotalSolarEclipse {
  /** ISO 8601 date/time at greatest eclipse (UTC) */
  datetime: string;
  /** Duration of totality at greatest eclipse in seconds */
  durationSec: number;
  /** Latitude at greatest eclipse */
  lat: number;
  /** Longitude at greatest eclipse */
  lon: number;
  /** Path description for display */
  path: string;
  /** Saros series number */
  saros: number;
}

/**
 * Catalog of total solar eclipses 2020-2045.
 * Sorted chronologically.
 */
export const TOTAL_SOLAR_ECLIPSES: TotalSolarEclipse[] = [
  {
    datetime: "2020-12-14T16:13:28Z",
    durationSec: 130,
    lat: -40.3,
    lon: -67.9,
    path: "South Pacific, Chile, Argentina, South Atlantic",
    saros: 142,
  },
  {
    datetime: "2021-12-04T07:33:26Z",
    durationSec: 114,
    lat: -76.8,
    lon: -46.2,
    path: "Antarctica",
    saros: 152,
  },
  {
    datetime: "2023-04-20T04:16:45Z",
    durationSec: 76, // Hybrid eclipse, total phase
    lat: -9.6,
    lon: 125.8,
    path: "Indonesia, Australia, Papua New Guinea (Hybrid)",
    saros: 129,
  },
  {
    datetime: "2024-04-08T18:17:16Z",
    durationSec: 268,
    lat: 25.3,
    lon: -104.1,
    path: "Mexico, United States, Canada",
    saros: 139,
  },
  {
    datetime: "2026-08-12T17:46:06Z",
    durationSec: 132,
    lat: 65.1,
    lon: -25.2,
    path: "Arctic, Greenland, Iceland, Spain",
    saros: 126,
  },
  {
    datetime: "2027-08-02T10:07:50Z",
    durationSec: 382,
    lat: 25.5,
    lon: 33.2,
    path: "Spain, Morocco, Algeria, Tunisia, Libya, Egypt, Saudi Arabia",
    saros: 136,
  },
  {
    datetime: "2028-07-22T02:55:36Z",
    durationSec: 335,
    lat: -24.4,
    lon: 158.1,
    path: "Australia, New Zealand",
    saros: 146,
  },
  {
    datetime: "2030-11-25T06:51:37Z",
    durationSec: 232,
    lat: -43.6,
    lon: 71.6,
    path: "Southern Africa, Indian Ocean, Australia",
    saros: 151,
  },
  {
    datetime: "2031-11-14T21:07:31Z",
    durationSec: 107,
    lat: -22.2,
    lon: -122.3,
    path: "South Pacific Ocean",
    saros: 161,
  },
  {
    datetime: "2033-03-30T18:01:37Z",
    durationSec: 162,
    lat: 75.3,
    lon: 107.8,
    path: "Alaska, Arctic",
    saros: 133,
  },
  {
    datetime: "2034-03-20T10:18:45Z",
    durationSec: 254,
    lat: 31.2,
    lon: 15.6,
    path: "Central Africa, Egypt, Saudi Arabia",
    saros: 143,
  },
  {
    datetime: "2035-09-02T01:55:31Z",
    durationSec: 172,
    lat: 36.0,
    lon: 135.5,
    path: "China, Korea, Japan",
    saros: 140,
  },
  {
    datetime: "2037-07-13T04:28:26Z",
    durationSec: 237,
    lat: 1.5,
    lon: 157.5,
    path: "Australia, New Zealand, Pacific",
    saros: 147,
  },
  {
    datetime: "2038-12-26T01:00:10Z",
    durationSec: 132,
    lat: -48.0,
    lon: 120.5,
    path: "Australia, New Zealand",
    saros: 152,
  },
  {
    datetime: "2039-12-15T16:23:46Z",
    durationSec: 100,
    lat: -67.5,
    lon: -70.5,
    path: "Antarctica",
    saros: 162,
  },
  {
    datetime: "2041-04-30T11:51:42Z",
    durationSec: 119,
    lat: 1.6,
    lon: -38.6,
    path: "Atlantic Ocean, Central Africa",
    saros: 129,
  },
  {
    datetime: "2042-04-20T02:17:26Z",
    durationSec: 228,
    lat: -20.8,
    lon: 87.5,
    path: "Indonesia, Malaysia, Philippines",
    saros: 139,
  },
  {
    datetime: "2043-04-09T18:57:30Z",
    durationSec: 78,
    lat: 51.4,
    lon: -161.2,
    path: "Russia, Alaska (Hybrid)",
    saros: 149,
  },
  {
    datetime: "2044-08-23T01:16:40Z",
    durationSec: 151,
    lat: 63.2,
    lon: 134.4,
    path: "Canada, Greenland, China, Mongolia",
    saros: 126,
  },
  {
    datetime: "2045-08-12T17:42:39Z",
    durationSec: 402,
    lat: 21.8,
    lon: -88.5,
    path: "USA, Caribbean, South America",
    saros: 136,
  },
];

/**
 * Find the next total solar eclipse after the given date.
 * @param date Reference date
 * @returns The next eclipse or null if none found in catalog
 */
export function getNextTotalSolarEclipse(date: Date): TotalSolarEclipse | null {
  const timestamp = date.getTime();
  for (const eclipse of TOTAL_SOLAR_ECLIPSES) {
    const eclipseTime = new Date(eclipse.datetime).getTime();
    if (eclipseTime > timestamp) {
      return eclipse;
    }
  }
  return null;
}

/**
 * Find the previous total solar eclipse before the given date.
 * @param date Reference date
 * @returns The previous eclipse or null if none found in catalog
 */
export function getPreviousTotalSolarEclipse(date: Date): TotalSolarEclipse | null {
  const timestamp = date.getTime();
  for (let i = TOTAL_SOLAR_ECLIPSES.length - 1; i >= 0; i--) {
    const eclipse = TOTAL_SOLAR_ECLIPSES[i];
    const eclipseTime = new Date(eclipse.datetime).getTime();
    if (eclipseTime < timestamp) {
      return eclipse;
    }
  }
  return null;
}

/**
 * Check if an eclipse is currently happening (within a few minutes of greatest eclipse).
 * The Sun and Moon need to be very close (< 0.5°) for totality.
 * @param sunRA Sun right ascension in degrees
 * @param sunDec Sun declination in degrees
 * @param moonRA Moon right ascension in degrees
 * @param moonDec Moon declination in degrees
 * @returns Angular separation in degrees
 */
export function getSunMoonSeparation(
  sunRA: number,
  sunDec: number,
  moonRA: number,
  moonDec: number
): number {
  // Convert to radians
  const ra1 = (sunRA * Math.PI) / 180;
  const dec1 = (sunDec * Math.PI) / 180;
  const ra2 = (moonRA * Math.PI) / 180;
  const dec2 = (moonDec * Math.PI) / 180;

  // Spherical law of cosines for angular distance
  const cosD =
    Math.sin(dec1) * Math.sin(dec2) +
    Math.cos(dec1) * Math.cos(dec2) * Math.cos(ra1 - ra2);
  const d = Math.acos(Math.max(-1, Math.min(1, cosD)));

  return (d * 180) / Math.PI;
}

/**
 * Angular radius of the Sun in degrees (mean value).
 * Varies from ~0.262° (aphelion) to ~0.271° (perihelion).
 */
export const SUN_ANGULAR_RADIUS_DEG = 0.267;

/**
 * Angular radius of the Moon in degrees (mean value).
 * Varies from ~0.245° (apogee) to ~0.283° (perigee).
 */
export const MOON_ANGULAR_RADIUS_DEG = 0.259;

/**
 * Threshold for eclipse visibility - if Sun-Moon separation is less than this,
 * the corona should start to become visible.
 * Using 1.5x Sun radius to start fading in the corona effect.
 */
export const ECLIPSE_VISIBILITY_THRESHOLD_DEG = SUN_ANGULAR_RADIUS_DEG * 1.5;

/**
 * Threshold for totality - if Sun-Moon separation is less than this,
 * we're in totality and the full corona is visible.
 */
export const TOTALITY_THRESHOLD_DEG = SUN_ANGULAR_RADIUS_DEG * 0.1;
