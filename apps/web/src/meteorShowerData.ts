/**
 * Meteor shower data for rendering radiants and displaying activity.
 *
 * Data sources:
 * - International Meteor Organization (IMO)
 * - American Meteor Society (AMS)
 */

export interface MeteorShower {
  id: string;                    // Short identifier
  name: string;                  // Full name
  ra: number;                    // Radiant right ascension in degrees
  dec: number;                   // Radiant declination in degrees
  driftRa?: number;              // Daily radiant drift in RA (degrees/day)
  driftDec?: number;             // Daily radiant drift in Dec (degrees/day)
  startMonth: number;            // Activity start month (1-12)
  startDay: number;              // Activity start day
  endMonth: number;              // Activity end month (1-12)
  endDay: number;                // Activity end day
  peakMonth: number;             // Peak month (1-12)
  peakDay: number;               // Peak day
  zhr: number;                   // Zenithal Hourly Rate at peak
  velocity: number;              // Entry velocity in km/s
  parentBody: string;            // Parent comet or asteroid
  description: string;
}

/**
 * Color for meteor shower radiants
 */
export const METEOR_SHOWER_COLOR = "#ffaa44"; // Orange-yellow (like meteors)

/**
 * Major annual meteor showers.
 * Radiant positions are for the peak date; some showers have significant drift.
 */
export const METEOR_SHOWER_DATA: MeteorShower[] = [
  {
    id: "QUA",
    name: "Quadrantids",
    ra: 230.1,
    dec: 48.5,
    startMonth: 1,
    startDay: 1,
    endMonth: 1,
    endDay: 5,
    peakMonth: 1,
    peakDay: 4,
    zhr: 120,
    velocity: 41,
    parentBody: "2003 EH1 (asteroid)",
    description: "One of the strongest annual showers with a very sharp peak lasting only a few hours. The radiant lies in the former constellation Quadrans Muralis, now part of Boötes. Best viewed from the Northern Hemisphere in early January.",
  },
  {
    id: "LYR",
    name: "Lyrids",
    ra: 271.4,
    dec: 33.6,
    startMonth: 4,
    startDay: 16,
    endMonth: 4,
    endDay: 25,
    peakMonth: 4,
    peakDay: 22,
    zhr: 18,
    velocity: 49,
    parentBody: "C/1861 G1 (Thatcher)",
    description: "One of the oldest known meteor showers, observed for over 2,700 years. The Lyrids produce bright meteors, sometimes with persistent trains. Occasional outbursts can produce rates of 100+ per hour.",
  },
  {
    id: "ETA",
    name: "Eta Aquariids",
    ra: 338.0,
    dec: -1.0,
    driftRa: 0.9,
    driftDec: 0.4,
    startMonth: 4,
    startDay: 19,
    endMonth: 5,
    endDay: 28,
    peakMonth: 5,
    peakDay: 6,
    zhr: 50,
    velocity: 66,
    parentBody: "1P/Halley",
    description: "Debris from Halley's Comet produces this Southern Hemisphere-favored shower. The fast meteors often leave persistent trains. Best seen in the hours before dawn when the radiant is highest.",
  },
  {
    id: "SDA",
    name: "Southern Delta Aquariids",
    ra: 340.0,
    dec: -16.0,
    driftRa: 0.8,
    driftDec: 0.2,
    startMonth: 7,
    startDay: 12,
    endMonth: 8,
    endDay: 23,
    peakMonth: 7,
    peakDay: 30,
    zhr: 25,
    velocity: 41,
    parentBody: "96P/Machholz (likely)",
    description: "A steady summer shower best seen from southern latitudes. The meteors are faint but numerous. Activity overlaps with the early Perseids, making late July excellent for meteor watching.",
  },
  {
    id: "CAP",
    name: "Alpha Capricornids",
    ra: 307.0,
    dec: -10.0,
    startMonth: 7,
    startDay: 3,
    endMonth: 8,
    endDay: 15,
    peakMonth: 7,
    peakDay: 30,
    zhr: 5,
    velocity: 23,
    parentBody: "169P/NEAT",
    description: "A minor shower known for producing bright fireballs. The slow entry velocity makes these meteors appear to drift across the sky. Active at the same time as the Southern Delta Aquariids.",
  },
  {
    id: "PER",
    name: "Perseids",
    ra: 48.0,
    dec: 58.0,
    driftRa: 1.4,
    driftDec: 0.1,
    startMonth: 7,
    startDay: 17,
    endMonth: 8,
    endDay: 24,
    peakMonth: 8,
    peakDay: 12,
    zhr: 100,
    velocity: 59,
    parentBody: "109P/Swift-Tuttle",
    description: "The most popular meteor shower of the year, peaking in warm August nights. The Perseids produce many bright meteors and occasional fireballs. The shower has been observed for nearly 2,000 years.",
  },
  {
    id: "DRA",
    name: "Draconids",
    ra: 262.0,
    dec: 54.0,
    startMonth: 10,
    startDay: 6,
    endMonth: 10,
    endDay: 10,
    peakMonth: 10,
    peakDay: 8,
    zhr: 10,
    velocity: 20,
    parentBody: "21P/Giacobini-Zinner",
    description: "Usually a minor shower, but capable of spectacular outbursts when Earth passes through dense debris trails. The 1933 and 1946 storms produced thousands of meteors per hour. Best viewed in the evening rather than after midnight.",
  },
  {
    id: "ORI",
    name: "Orionids",
    ra: 95.0,
    dec: 16.0,
    driftRa: 0.7,
    driftDec: 0.1,
    startMonth: 10,
    startDay: 2,
    endMonth: 11,
    endDay: 7,
    peakMonth: 10,
    peakDay: 21,
    zhr: 20,
    velocity: 66,
    parentBody: "1P/Halley",
    description: "The second shower produced by Halley's Comet each year. Fast meteors often leave glowing trains that persist for several seconds. The radiant rises late evening, with best viewing after midnight.",
  },
  {
    id: "TAU",
    name: "Taurids",
    ra: 52.0,
    dec: 14.0,
    driftRa: 0.8,
    driftDec: 0.2,
    startMonth: 10,
    startDay: 1,
    endMonth: 11,
    endDay: 25,
    peakMonth: 11,
    peakDay: 5,
    zhr: 5,
    velocity: 27,
    parentBody: "2P/Encke",
    description: "A long-duration shower split into Northern and Southern branches. Though rates are low, the Taurids are famous for producing spectacular fireballs. The slow-moving meteors are easy to photograph.",
  },
  {
    id: "LEO",
    name: "Leonids",
    ra: 152.0,
    dec: 22.0,
    driftRa: 0.7,
    driftDec: -0.4,
    startMonth: 11,
    startDay: 6,
    endMonth: 11,
    endDay: 30,
    peakMonth: 11,
    peakDay: 17,
    zhr: 15,
    velocity: 71,
    parentBody: "55P/Tempel-Tuttle",
    description: "Normally a modest shower, the Leonids can produce meteor storms when Earth encounters dense debris from recent comet passages. The 1833 and 1966 storms are legendary, with rates exceeding 100,000 per hour. The next potential storm window is around 2099.",
  },
  {
    id: "GEM",
    name: "Geminids",
    ra: 112.0,
    dec: 33.0,
    driftRa: 1.0,
    driftDec: -0.1,
    startMonth: 12,
    startDay: 4,
    endMonth: 12,
    endDay: 17,
    peakMonth: 12,
    peakDay: 14,
    zhr: 150,
    velocity: 35,
    parentBody: "3200 Phaethon (asteroid)",
    description: "The strongest annual meteor shower, producing up to 150 multicolored meteors per hour. Unusually, the parent body is an asteroid rather than a comet. The medium-speed meteors are bright and produce few trains. December's cold nights are worth braving for this display.",
  },
  {
    id: "URS",
    name: "Ursids",
    ra: 217.0,
    dec: 76.0,
    startMonth: 12,
    startDay: 17,
    endMonth: 12,
    endDay: 26,
    peakMonth: 12,
    peakDay: 22,
    zhr: 10,
    velocity: 33,
    parentBody: "8P/Tuttle",
    description: "A modest shower that peaks near the winter solstice. The radiant near Polaris means the shower is visible all night from northern latitudes. Occasional outbursts have produced rates of 50+ per hour.",
  },
];

/**
 * Check if a meteor shower is active on a given date.
 * @param shower - The meteor shower to check
 * @param month - Month (1-12)
 * @param day - Day of month
 * @returns true if the shower is active
 */
export function isShowerActive(shower: MeteorShower, month: number, day: number): boolean {
  const dateValue = month * 100 + day;
  const startValue = shower.startMonth * 100 + shower.startDay;
  const endValue = shower.endMonth * 100 + shower.endDay;

  // Handle year wrap (e.g., Dec 28 - Jan 5)
  if (startValue > endValue) {
    return dateValue >= startValue || dateValue <= endValue;
  }

  return dateValue >= startValue && dateValue <= endValue;
}

/**
 * Check if today is within N days of a shower's peak.
 * @param shower - The meteor shower to check
 * @param month - Month (1-12)
 * @param day - Day of month
 * @param withinDays - Number of days from peak to consider "near peak"
 * @returns true if within the peak window
 */
export function isNearPeak(shower: MeteorShower, month: number, day: number, withinDays: number = 1): boolean {
  // Simple day-of-year calculation (ignoring leap years for simplicity)
  const daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  const toDOY = (m: number, d: number) => {
    let doy = d;
    for (let i = 1; i < m; i++) doy += daysInMonth[i];
    return doy;
  };

  const currentDOY = toDOY(month, day);
  const peakDOY = toDOY(shower.peakMonth, shower.peakDay);

  // Handle year wrap
  let diff = Math.abs(currentDOY - peakDOY);
  if (diff > 182) diff = 365 - diff;

  return diff <= withinDays;
}

/**
 * Get the radiant position adjusted for drift from peak date.
 * @param shower - The meteor shower
 * @param month - Current month (1-12)
 * @param day - Current day
 * @returns Adjusted RA/Dec in degrees
 */
export function getAdjustedRadiant(shower: MeteorShower, month: number, day: number): { ra: number; dec: number } {
  if (!shower.driftRa && !shower.driftDec) {
    return { ra: shower.ra, dec: shower.dec };
  }

  // Calculate days from peak
  const daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const toDOY = (m: number, d: number) => {
    let doy = d;
    for (let i = 1; i < m; i++) doy += daysInMonth[i];
    return doy;
  };

  const currentDOY = toDOY(month, day);
  const peakDOY = toDOY(shower.peakMonth, shower.peakDay);
  let daysFromPeak = currentDOY - peakDOY;

  // Handle year wrap
  if (daysFromPeak > 182) daysFromPeak -= 365;
  if (daysFromPeak < -182) daysFromPeak += 365;

  return {
    ra: shower.ra + (shower.driftRa || 0) * daysFromPeak,
    dec: shower.dec + (shower.driftDec || 0) * daysFromPeak,
  };
}

/**
 * Get all currently active showers for a given date.
 */
export function getActiveShowers(month: number, day: number): MeteorShower[] {
  return METEOR_SHOWER_DATA.filter(shower => isShowerActive(shower, month, day));
}
