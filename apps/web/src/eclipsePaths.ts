/**
 * Total Solar Eclipse Center Paths (umbral central lines)
 *
 * Location-aware companion to `eclipseData.ts`. Each entry describes the
 * umbral central line (the ground track where the eclipse is central / of
 * maximum duration) as a densifiable polyline of geographic points, plus the
 * approximate half-width of the path of totality.
 *
 * These coordinates are approximate central-line points digitized from NASA
 * GSFC / Fred Espenak total-solar-eclipse path predictions. They are intended
 * for visualization and navigation UX ("navigate to the path", "you are X km
 * from the center line", rough local circumstances) — not survey-grade
 * contact timing.
 *
 * Deferred scope (issue #50): regenerate these paths directly from the engine
 * ephemerides via Besselian elements / shadow-axis intersection with the WGS84
 * ellipsoid, and render the track in a dedicated globe/map view. See the PR for
 * details.
 */

/** A single point on an eclipse center line. */
export interface EclipsePathPoint {
  /** Geodetic latitude, degrees (+N). */
  lat: number;
  /** Geodetic longitude, degrees (+E). */
  lon: number;
  /** UTC time the shadow center reaches this point (ISO 8601), if known. */
  timeUtc?: string;
  /** Duration of totality on the center line here, seconds, if known. */
  centerDurationSec?: number;
}

/** An eclipse's umbral central path. */
export interface EclipsePath {
  /** Matches {@link TotalSolarEclipse.datetime} for lookup by greatest-eclipse time. */
  eclipseDatetime: string;
  /** Short human label for the path. */
  label: string;
  /** Umbral central line as an ordered polyline (sunrise → sunset). */
  centerLine: EclipsePathPoint[];
  /** Approximate half-width of the path of totality, kilometres. */
  pathHalfWidthKm: number;
}

/** Mean Earth radius used for great-circle distances (km). */
export const EARTH_RADIUS_KM = 6371.0088;

/**
 * Catalog of center paths for the near-term motivating eclipses (Spain 2026,
 * Egypt 2027, Australia 2028) plus the recent Mexico/US/Canada 2024 event for
 * regression testing against a well-documented track.
 *
 * Center-line points are ordered from sunrise end to sunset end.
 */
export const ECLIPSE_PATHS: EclipsePath[] = [
  {
    // 2024-04-08 — Mexico, United States, Canada. Greatest eclipse in Mexico.
    eclipseDatetime: "2024-04-08T18:17:16Z",
    label: "Mexico → USA → Canada",
    pathHalfWidthKm: 100,
    centerLine: [
      { lat: 17.5, lon: -108.5, centerDurationSec: 210 },
      { lat: 20.9, lon: -105.0, centerDurationSec: 240 },
      { lat: 25.3, lon: -104.1, timeUtc: "2024-04-08T18:17:16Z", centerDurationSec: 268 },
      { lat: 29.0, lon: -100.6, centerDurationSec: 260 },
      { lat: 32.5, lon: -96.8, centerDurationSec: 250 }, // Dallas, TX
      { lat: 37.7, lon: -89.2, centerDurationSec: 245 }, // Carbondale, IL
      { lat: 41.5, lon: -81.7, centerDurationSec: 235 }, // Cleveland, OH
      { lat: 44.0, lon: -76.5, centerDurationSec: 220 }, // Kingston, ON
      { lat: 46.8, lon: -68.5, centerDurationSec: 205 }, // Maine
      { lat: 48.6, lon: -60.0, centerDurationSec: 190 }, // Newfoundland
    ],
  },
  {
    // 2026-08-12 — Arctic, Greenland, Iceland, Spain. Sunset totality over Spain.
    eclipseDatetime: "2026-08-12T17:46:06Z",
    label: "Arctic → Iceland → Spain",
    pathHalfWidthKm: 145,
    centerLine: [
      { lat: 80.5, lon: 92.0 }, // sunrise, Arctic Ocean N of Siberia
      { lat: 82.0, lon: 40.0 },
      { lat: 81.0, lon: -6.0 },
      { lat: 77.5, lon: -22.0 }, // NE Greenland
      { lat: 71.0, lon: -30.0 },
      { lat: 65.2, lon: -25.2, timeUtc: "2026-08-12T17:46:06Z", centerDurationSec: 132 }, // greatest, near Iceland
      { lat: 58.0, lon: -21.0, centerDurationSec: 125 },
      { lat: 51.0, lon: -16.0, centerDurationSec: 118 }, // N Atlantic
      { lat: 46.0, lon: -11.0, centerDurationSec: 110 },
      { lat: 43.4, lon: -6.5, timeUtc: "2026-08-12T18:29:00Z", centerDurationSec: 104 }, // N Spain coast (Asturias)
      { lat: 42.6, lon: -5.0, centerDurationSec: 102 }, // near León
      { lat: 42.2, lon: -3.7, centerDurationSec: 100 }, // near Burgos
      { lat: 41.6, lon: -1.9, centerDurationSec: 97 }, // near Zaragoza
      { lat: 40.8, lon: -0.3, centerDurationSec: 93 },
      { lat: 40.0, lon: 0.9, timeUtc: "2026-08-12T18:33:00Z", centerDurationSec: 88 }, // Castellón/Valencia coast
      { lat: 39.6, lon: 2.6, centerDurationSec: 82 }, // near Mallorca
      { lat: 38.9, lon: 4.2, centerDurationSec: 74 }, // sunset, W Mediterranean
    ],
  },
  {
    // 2027-08-02 — Spain, N Africa, Egypt (Luxor greatest), Saudi Arabia, Yemen.
    eclipseDatetime: "2027-08-02T10:07:50Z",
    label: "Spain → N Africa → Egypt → Arabia",
    pathHalfWidthKm: 130,
    centerLine: [
      { lat: 37.6, lon: -20.0 }, // sunrise, Atlantic W of Iberia
      { lat: 36.7, lon: -8.0, centerDurationSec: 280 }, // S Portugal
      { lat: 36.2, lon: -5.6, centerDurationSec: 300 }, // Cádiz / Strait of Gibraltar, Spain
      { lat: 35.4, lon: -3.5, centerDurationSec: 320 }, // N Morocco
      { lat: 34.2, lon: 0.5, centerDurationSec: 345 }, // Algeria
      { lat: 33.0, lon: 6.0, centerDurationSec: 360 }, // Tunisia / E Algeria
      { lat: 31.4, lon: 12.5, centerDurationSec: 372 }, // Libya
      { lat: 29.2, lon: 20.0, centerDurationSec: 380 },
      { lat: 26.8, lon: 27.5, centerDurationSec: 382 },
      { lat: 25.5, lon: 33.2, timeUtc: "2027-08-02T10:07:50Z", centerDurationSec: 382 }, // Luxor, Egypt (greatest)
      { lat: 23.8, lon: 37.5, centerDurationSec: 375 }, // Red Sea / Saudi Arabia
      { lat: 21.0, lon: 42.5, centerDurationSec: 355 }, // Saudi Arabia
      { lat: 17.5, lon: 47.5, centerDurationSec: 320 }, // Yemen
      { lat: 13.5, lon: 52.0, centerDurationSec: 270 }, // sunset, Gulf of Aden
    ],
  },
  {
    // 2028-07-22 — Indian Ocean, Australia (Sydney), Tasman Sea, New Zealand.
    eclipseDatetime: "2028-07-22T02:55:36Z",
    label: "Australia (Sydney) → New Zealand",
    pathHalfWidthKm: 95,
    centerLine: [
      { lat: -10.0, lon: 108.0 }, // sunrise, Indian Ocean
      { lat: -13.5, lon: 116.0, centerDurationSec: 300 },
      { lat: -15.6, lon: 121.5, centerDurationSec: 320 }, // Kimberley coast, WA
      { lat: -19.0, lon: 128.0, centerDurationSec: 332 }, // interior NT
      { lat: -23.0, lon: 135.0, timeUtc: "2028-07-22T02:55:36Z", centerDurationSec: 335 }, // central Australia (greatest)
      { lat: -27.0, lon: 142.0, centerDurationSec: 330 }, // SW Queensland
      { lat: -31.0, lon: 148.0, centerDurationSec: 315 }, // NSW interior
      { lat: -33.87, lon: 151.21, timeUtc: "2028-07-22T04:38:00Z", centerDurationSec: 240 }, // Sydney, NSW
      { lat: -37.5, lon: 158.0, centerDurationSec: 220 }, // Tasman Sea
      { lat: -42.0, lon: 166.0, centerDurationSec: 200 },
      { lat: -45.9, lon: 170.5, centerDurationSec: 175 }, // Dunedin, New Zealand (sunset)
    ],
  },
];

/** Look up the center path for an eclipse by its greatest-eclipse datetime. */
export function getEclipsePath(eclipseDatetime: string): EclipsePath | null {
  return (
    ECLIPSE_PATHS.find((p) => p.eclipseDatetime === eclipseDatetime) ?? null
  );
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two lat/lon points, in kilometres (haversine).
 */
export function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Nearest-point-on-path result. */
export interface NearestPoint {
  /** Latitude of the nearest point on the center line, degrees. */
  lat: number;
  /** Longitude of the nearest point on the center line, degrees. */
  lon: number;
  /** Great-circle distance from the query point to this point, km. */
  distanceKm: number;
  /** Index of the center-line segment (vertex i → i+1) containing the point. */
  segmentIndex: number;
  /** Fractional position along that segment, 0..1. */
  fraction: number;
  /** Interpolated shadow-center time at the nearest point, if known. */
  timeUtc?: string;
  /** Interpolated center-line totality duration at the nearest point (s). */
  centerDurationSec?: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpTimeUtc(
  a: string | undefined,
  b: string | undefined,
  t: number
): string | undefined {
  if (a && b) {
    const ta = Date.parse(a);
    const tb = Date.parse(b);
    if (!Number.isNaN(ta) && !Number.isNaN(tb)) {
      return new Date(lerp(ta, tb, t)).toISOString();
    }
  }
  return t < 0.5 ? a ?? b : b ?? a;
}

/**
 * Find the point on the center-line polyline closest to `query`.
 *
 * Each segment is projected into a local equirectangular (east/north km) frame
 * centered on the query point, which is accurate for the short segment lengths
 * used here. The perpendicular foot is clamped to the segment, then mapped back
 * to lat/lon by interpolation and measured with a haversine distance.
 */
export function nearestPointOnPath(
  centerLine: EclipsePathPoint[],
  query: { lat: number; lon: number }
): NearestPoint {
  if (centerLine.length === 0) {
    throw new Error("nearestPointOnPath: empty center line");
  }
  if (centerLine.length === 1) {
    const only = centerLine[0];
    return {
      lat: only.lat,
      lon: only.lon,
      distanceKm: haversineKm(query, only),
      segmentIndex: 0,
      fraction: 0,
      timeUtc: only.timeUtc,
      centerDurationSec: only.centerDurationSec,
    };
  }

  const cosLat = Math.cos(toRad(query.lat));
  const kmPerDegLat = (Math.PI / 180) * EARTH_RADIUS_KM;
  const project = (p: { lat: number; lon: number }) => ({
    x: (p.lon - query.lon) * kmPerDegLat * cosLat, // east, km
    y: (p.lat - query.lat) * kmPerDegLat, // north, km
  });

  let best: NearestPoint | null = null;

  for (let i = 0; i < centerLine.length - 1; i++) {
    const a = centerLine[i];
    const b = centerLine[i + 1];
    const pa = project(a);
    const pb = project(b);
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const segLenSq = dx * dx + dy * dy;
    // Query is at the projection origin (0,0); foot parameter t along A→B.
    let t = segLenSq > 0 ? -(pa.x * dx + pa.y * dy) / segLenSq : 0;
    t = Math.max(0, Math.min(1, t));

    const lat = lerp(a.lat, b.lat, t);
    const lon = lerp(a.lon, b.lon, t);
    const distanceKm = haversineKm(query, { lat, lon });

    if (!best || distanceKm < best.distanceKm) {
      best = {
        lat,
        lon,
        distanceKm,
        segmentIndex: i,
        fraction: t,
        timeUtc: lerpTimeUtc(a.timeUtc, b.timeUtc, t),
        centerDurationSec:
          a.centerDurationSec !== undefined && b.centerDurationSec !== undefined
            ? lerp(a.centerDurationSec, b.centerDurationSec, t)
            : a.centerDurationSec ?? b.centerDurationSec,
      };
    }
  }

  // best is always assigned because centerLine.length >= 2 here.
  return best as NearestPoint;
}

/** Local eclipse circumstances at an observer relative to a center path. */
export interface LocalCircumstances {
  /** Nearest point on the center line. */
  nearest: NearestPoint;
  /** Perpendicular-ish distance from the observer to the center line, km. */
  distanceKm: number;
  /** Whether the observer lies within the path of totality. */
  insidePath: boolean;
  /**
   * Estimated local duration of totality at the observer, seconds. Zero when
   * the observer is outside the path. Scaled from the center-line duration by
   * the chord factor sqrt(1 - (d/halfWidth)^2).
   */
  localDurationSec: number;
  /** Interpolated shadow-center mid-eclipse time at the observer, if known. */
  localMidTimeUtc: string | null;
}

/**
 * Compute approximate local eclipse circumstances for `observer` given an
 * eclipse center `path`.
 */
export function computeLocalCircumstances(
  path: EclipsePath,
  observer: { lat: number; lon: number }
): LocalCircumstances {
  const nearest = nearestPointOnPath(path.centerLine, observer);
  const distanceKm = nearest.distanceKm;
  const insidePath = distanceKm <= path.pathHalfWidthKm;

  let localDurationSec = 0;
  if (insidePath && nearest.centerDurationSec !== undefined) {
    const ratio = distanceKm / path.pathHalfWidthKm;
    const chordFactor = Math.sqrt(Math.max(0, 1 - ratio * ratio));
    localDurationSec = nearest.centerDurationSec * chordFactor;
  }

  return {
    nearest,
    distanceKm,
    insidePath,
    localDurationSec,
    localMidTimeUtc: nearest.timeUtc ?? null,
  };
}
