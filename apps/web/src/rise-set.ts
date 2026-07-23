/**
 * Rise / Set / Transit computation for the sun, moon, and planets.
 *
 * Thin WASM-free composition layer over the engine's `find_body_events`
 * (rise/set/transit crossings) and `body_altitude_at` (altitude sampling). All
 * astronomy lives in Rust; this module only:
 *
 * - derives the local-day scan window for the selected date,
 * - parses the flat event buffer into typed events,
 * - classifies polar-day/night "always up" / "never up" states, and
 * - composes per-planet visibility windows as the interval intersection of
 *   [planet above the horizon] ∩ [sun below civil twilight].
 *
 * It imports no WASM (only a structural engine interface), so it is safe for the
 * CI geometry unit-test job which never builds the WASM module. See
 * `rise-set.test.ts` for the mock-engine pattern.
 */

/** Minimal engine surface used here — the real `SkyEngine` satisfies it structurally. */
export interface RiseSetEngine {
  find_body_events(
    bodyIndex: number,
    startJD: number,
    endJD: number,
    stepDays: number,
    h0Deg: number
  ): Float64Array | number[];
  body_altitude_at(bodyIndex: number, jd: number): number;
}

/* -------------------------------------------------------------------------- */
/* Body indices (CelestialBody ordering in the Rust engine).                  */
/* -------------------------------------------------------------------------- */

export const BODY_SUN = 0;
export const BODY_MOON = 1;
export const BODY_MERCURY = 2;
export const BODY_VENUS = 3;
export const BODY_MARS = 4;
export const BODY_JUPITER = 5;
export const BODY_SATURN = 6;

/** The five naked-eye planets, in order of distance from the Sun. */
export const NAKED_EYE_PLANETS: { index: number; name: string }[] = [
  { index: BODY_MERCURY, name: "Mercury" },
  { index: BODY_VENUS, name: "Venus" },
  { index: BODY_MARS, name: "Mars" },
  { index: BODY_JUPITER, name: "Jupiter" },
  { index: BODY_SATURN, name: "Saturn" },
];

/* -------------------------------------------------------------------------- */
/* Event record layout — must match `EVENT_RECORD_LEN` in                     */
/* crates/sky_engine/src/lib.rs and `sky_engine_core::events`.                */
/* -------------------------------------------------------------------------- */

export const EVENT_RECORD_LEN = 3;
export const EVENT_RISE = 0;
export const EVENT_SET = 1;
export const EVENT_TRANSIT = 2;

/** Coarse scan step handed to the engine: 10 minutes, in days. */
export const SCAN_STEP_DAYS = 10 / 1440;

/* -------------------------------------------------------------------------- */
/* Standard horizon thresholds (degrees). NaN => engine's per-body standard.  */
/* -------------------------------------------------------------------------- */

/** Sun rise/set: 34′ refraction + 16′ semidiameter. */
export const H0_SUN = -0.8333;
/** Planet rise/set: refraction only. */
export const H0_PLANET = -0.5667;
/** Moon: parallax-dependent — let the engine compute it (Meeus ch. 15). */
export const H0_MOON = NaN;
/** Civil twilight: sun center at −6°. */
export const TWILIGHT_CIVIL = -6;
/** Nautical twilight: sun center at −12°. */
export const TWILIGHT_NAUTICAL = -12;
/** Astronomical twilight: sun center at −18°. */
export const TWILIGHT_ASTRONOMICAL = -18;

/* -------------------------------------------------------------------------- */
/* Julian Date <-> Date conversion (browser-local display, as in iss-passes). */
/* -------------------------------------------------------------------------- */

const JD_UNIX_EPOCH = 2440587.5;
const MS_PER_DAY = 86400000;

export function jdToDate(jd: number): Date {
  return new Date((jd - JD_UNIX_EPOCH) * MS_PER_DAY);
}

export function dateToJD(date: Date): number {
  return date.getTime() / MS_PER_DAY + JD_UNIX_EPOCH;
}

/* -------------------------------------------------------------------------- */
/* Azimuth -> compass direction (mirrors iss-passes.ts).                      */
/* -------------------------------------------------------------------------- */

const DIRECTIONS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

export function azimuthToDirection(az: number): string {
  az = ((az % 360) + 360) % 360;
  return DIRECTIONS[Math.round(az / 22.5) % 16];
}

/* -------------------------------------------------------------------------- */
/* Scan window: the selected civil date, local midnight -> next local midnight */
/* -------------------------------------------------------------------------- */

export interface ScanWindow {
  startJD: number;
  endJD: number;
}

/**
 * The `[startJD, endJD]` window covering the local civil day containing `date`,
 * from local midnight to the next local midnight. Using calendar-day boundaries
 * (rather than a fixed +24 h) keeps the window aligned to the observer's day
 * across DST transitions.
 */
export function scanWindowForDate(date: Date): ScanWindow {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
  return { startJD: dateToJD(start), endJD: dateToJD(end) };
}

/**
 * A civil-date key (local `YYYY-MM-DD`). The rise/set panel recomputes only when
 * this changes, so dragging the time slider within a day does no extra work.
 */
export function civilDateKey(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/* -------------------------------------------------------------------------- */
/* Event parsing.                                                             */
/* -------------------------------------------------------------------------- */

export interface BodyEvent {
  /** EVENT_RISE | EVENT_SET | EVENT_TRANSIT */
  type: number;
  /** Julian Date (UTC) of the event. */
  jd: number;
  /** Local time of the event. */
  time: Date;
  /** Azimuth in degrees (clockwise from North). */
  azimuth: number;
  /** Compass direction for the azimuth. */
  direction: string;
}

/** Parse the flat `find_body_events` buffer into typed, time-sorted events. */
export function parseEvents(buf: Float64Array | number[]): BodyEvent[] {
  const events: BodyEvent[] = [];
  for (let i = 0; i + EVENT_RECORD_LEN <= buf.length; i += EVENT_RECORD_LEN) {
    const type = buf[i];
    const jd = buf[i + 1];
    const azimuth = buf[i + 2];
    events.push({ type, jd, time: jdToDate(jd), azimuth, direction: azimuthToDirection(azimuth) });
  }
  events.sort((a, b) => a.jd - b.jd);
  return events;
}

/* -------------------------------------------------------------------------- */
/* Per-body rise / set / transit result.                                     */
/* -------------------------------------------------------------------------- */

export interface RiseSetResult {
  rise: BodyEvent | null;
  set: BodyEvent | null;
  transit: BodyEvent | null;
  /** No crossings and the body is above the threshold all day (circumpolar). */
  alwaysUp: boolean;
  /** No crossings and the body is below the threshold all day. */
  neverUp: boolean;
}

/** Threshold to classify always-up/never-up when the engine reports no crossings. */
function classifyThreshold(h0Deg: number): number {
  return Number.isNaN(h0Deg) ? 0 : h0Deg;
}

/**
 * Compute a body's rise, set, and transit for the window using the given horizon
 * threshold (`NaN` => the engine's per-body standard, e.g. the Moon's
 * parallax-dependent h0). When there are no rise/set crossings, classify the
 * polar always-up / never-up state via a mid-window altitude sample.
 */
export function computeBodyRiseSet(
  engine: RiseSetEngine,
  bodyIndex: number,
  win: ScanWindow,
  h0Deg: number
): RiseSetResult {
  const buf = engine.find_body_events(bodyIndex, win.startJD, win.endJD, SCAN_STEP_DAYS, h0Deg);
  const events = parseEvents(buf);
  const rise = events.find((e) => e.type === EVENT_RISE) ?? null;
  const set = events.find((e) => e.type === EVENT_SET) ?? null;
  const transit = events.find((e) => e.type === EVENT_TRANSIT) ?? null;

  let alwaysUp = false;
  let neverUp = false;
  if (!rise && !set) {
    const midJD = (win.startJD + win.endJD) / 2;
    const alt = engine.body_altitude_at(bodyIndex, midJD);
    if (alt > classifyThreshold(h0Deg)) {
      alwaysUp = true;
    } else {
      neverUp = true;
    }
  }

  return { rise, set, transit, alwaysUp, neverUp };
}

/* -------------------------------------------------------------------------- */
/* Interval algebra for planet visibility windows.                           */
/* -------------------------------------------------------------------------- */

export interface JDInterval {
  startJD: number;
  endJD: number;
}

/**
 * Intervals within `win` during which the body is above `h0Deg`. Built from the
 * engine's rise/set crossings plus the body's altitude at the window start to
 * seed the initial up/down state (so a body already up at midnight yields an
 * interval that begins at the window start).
 */
export function aboveIntervals(
  engine: RiseSetEngine,
  bodyIndex: number,
  win: ScanWindow,
  h0Deg: number
): JDInterval[] {
  const buf = engine.find_body_events(bodyIndex, win.startJD, win.endJD, SCAN_STEP_DAYS, h0Deg);
  const crossings = parseEvents(buf).filter(
    (e) => e.type === EVENT_RISE || e.type === EVENT_SET
  );

  const threshold = classifyThreshold(h0Deg);
  let up = engine.body_altitude_at(bodyIndex, win.startJD) > threshold;
  let intervalStart = up ? win.startJD : NaN;

  const intervals: JDInterval[] = [];
  for (const e of crossings) {
    if (e.type === EVENT_RISE && !up) {
      up = true;
      intervalStart = e.jd;
    } else if (e.type === EVENT_SET && up) {
      up = false;
      intervals.push({ startJD: intervalStart, endJD: e.jd });
    }
  }
  if (up) {
    intervals.push({ startJD: intervalStart, endJD: win.endJD });
  }
  return intervals;
}

/** Complement of `intervals` within `win` (assumes `intervals` sorted, disjoint). */
export function invertIntervals(intervals: JDInterval[], win: ScanWindow): JDInterval[] {
  const out: JDInterval[] = [];
  let cursor = win.startJD;
  for (const iv of intervals) {
    if (iv.startJD > cursor) {
      out.push({ startJD: cursor, endJD: iv.startJD });
    }
    cursor = Math.max(cursor, iv.endJD);
  }
  if (cursor < win.endJD) {
    out.push({ startJD: cursor, endJD: win.endJD });
  }
  return out;
}

/** Intersection of two sorted, disjoint interval lists. */
export function intersectIntervals(a: JDInterval[], b: JDInterval[]): JDInterval[] {
  const out: JDInterval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].startJD, b[j].startJD);
    const end = Math.min(a[i].endJD, b[j].endJD);
    if (end > start) {
      out.push({ startJD: start, endJD: end });
    }
    if (a[i].endJD < b[j].endJD) {
      i++;
    } else {
      j++;
    }
  }
  return out;
}

/**
 * Tonight's visibility windows for a planet: the intersection of [planet above
 * the −0.5667° horizon] with [sun below civil twilight (−6°)]. Returns the
 * (possibly empty) list of dark-sky windows within the scan window.
 */
export function computePlanetVisibility(
  engine: RiseSetEngine,
  planetIndex: number,
  win: ScanWindow
): JDInterval[] {
  const planetUp = aboveIntervals(engine, planetIndex, win, H0_PLANET);
  const sunAboveCivil = aboveIntervals(engine, BODY_SUN, win, TWILIGHT_CIVIL);
  const darkness = invertIntervals(sunAboveCivil, win);
  return intersectIntervals(planetUp, darkness);
}
