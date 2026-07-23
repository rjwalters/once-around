import { describe, it, expect } from "vitest";
import {
  RiseSetEngine,
  EVENT_RISE,
  EVENT_SET,
  EVENT_TRANSIT,
  BODY_SUN,
  BODY_MARS,
  H0_SUN,
  H0_PLANET,
  parseEvents,
  scanWindowForDate,
  civilDateKey,
  computeBodyRiseSet,
  aboveIntervals,
  invertIntervals,
  intersectIntervals,
  computePlanetVisibility,
  dateToJD,
  jdToDate,
  azimuthToDirection,
  type JDInterval,
} from "./rise-set";

/**
 * Mock engine driven by pre-baked responses keyed on bodyIndex+h0. `events`
 * supplies the flat buffer returned by `find_body_events`; `altitudeAtStart`
 * seeds `body_altitude_at` (start-of-window sample and mid-window classifier).
 * This mirrors the WASM-free mock pattern in iss-passes.test.ts — no WASM is
 * imported, so the CI geometry job (which never builds WASM) can run it.
 */
function mockEngine(config: {
  events?: (bodyIndex: number, h0: number) => number[];
  altitude?: (bodyIndex: number, jd: number) => number;
}): RiseSetEngine {
  return {
    find_body_events: (bodyIndex, _s, _e, _step, h0) =>
      config.events ? config.events(bodyIndex, h0) : [],
    body_altitude_at: (bodyIndex, jd) => (config.altitude ? config.altitude(bodyIndex, jd) : 0),
  };
}

describe("parseEvents", () => {
  it("parses flat [type, jd, azimuth] records, sorted by time", () => {
    // Two records out of order; parseEvents should sort ascending by jd.
    const buf = [EVENT_SET, 2451545.9, 270, EVENT_RISE, 2451545.2, 90];
    const events = parseEvents(buf);
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe(EVENT_RISE);
    expect(events[0].jd).toBeCloseTo(2451545.2, 6);
    expect(events[0].direction).toBe("E");
    expect(events[1].type).toBe(EVENT_SET);
    expect(events[1].direction).toBe("W");
  });

  it("ignores a trailing partial record", () => {
    const buf = [EVENT_RISE, 2451545.2, 90, EVENT_SET, 2451545.9]; // last record short
    expect(parseEvents(buf)).toHaveLength(1);
  });

  it("returns [] for an empty buffer", () => {
    expect(parseEvents([])).toHaveLength(0);
  });
});

describe("azimuthToDirection", () => {
  it("maps cardinal azimuths and normalizes negatives", () => {
    expect(azimuthToDirection(0)).toBe("N");
    expect(azimuthToDirection(90)).toBe("E");
    expect(azimuthToDirection(180)).toBe("S");
    expect(azimuthToDirection(270)).toBe("W");
    expect(azimuthToDirection(-90)).toBe("W");
    expect(azimuthToDirection(360)).toBe("N");
  });
});

describe("scanWindowForDate / civilDateKey", () => {
  it("spans local midnight to the next local midnight", () => {
    const date = new Date(2026, 5, 21, 15, 30); // 2026-06-21 15:30 local
    const win = scanWindowForDate(date);
    // Boundaries are the exact local-midnight instants (compare in ms to avoid
    // brittleness from JD float round-trip, which can drift by microseconds).
    const localMidnight = new Date(2026, 5, 21, 0, 0, 0, 0).getTime();
    const nextLocalMidnight = new Date(2026, 5, 22, 0, 0, 0, 0).getTime();
    expect(jdToDate(win.startJD).getTime()).toBeCloseTo(localMidnight, -1);
    expect(jdToDate(win.endJD).getTime()).toBeCloseTo(nextLocalMidnight, -1);
    // Window is ~24 h (allowing DST-shifted days).
    const hours = (win.endJD - win.startJD) * 24;
    expect(hours).toBeGreaterThanOrEqual(23);
    expect(hours).toBeLessThanOrEqual(25);
  });

  it("civilDateKey is stable within a day and changes across days", () => {
    const morning = new Date(2026, 5, 21, 1, 0);
    const evening = new Date(2026, 5, 21, 23, 0);
    const nextDay = new Date(2026, 5, 22, 1, 0);
    expect(civilDateKey(morning)).toBe(civilDateKey(evening));
    expect(civilDateKey(morning)).not.toBe(civilDateKey(nextDay));
    expect(civilDateKey(morning)).toBe("2026-06-21");
  });
});

describe("computeBodyRiseSet", () => {
  const win = scanWindowForDate(new Date(2026, 5, 21, 12));
  const midJD = (win.startJD + win.endJD) / 2;

  it("extracts rise, set, and transit events", () => {
    const engine = mockEngine({
      events: () => [
        EVENT_RISE, win.startJD + 0.25, 80,
        EVENT_TRANSIT, win.startJD + 0.5, 180,
        EVENT_SET, win.startJD + 0.75, 280,
      ],
    });
    const result = computeBodyRiseSet(engine, BODY_SUN, win, H0_SUN);
    expect(result.rise?.azimuth).toBe(80);
    expect(result.transit?.azimuth).toBe(180);
    expect(result.set?.azimuth).toBe(280);
    expect(result.alwaysUp).toBe(false);
    expect(result.neverUp).toBe(false);
  });

  it("classifies always-up when no crossings and mid-window altitude is high", () => {
    const engine = mockEngine({
      events: (_b, _h0) => [], // no crossings (polar day)
      altitude: () => 25, // sun well above the horizon all day
    });
    const result = computeBodyRiseSet(engine, BODY_SUN, win, H0_SUN);
    expect(result.alwaysUp).toBe(true);
    expect(result.neverUp).toBe(false);
    expect(result.rise).toBeNull();
    expect(result.set).toBeNull();
  });

  it("classifies never-up when no crossings and mid-window altitude is low", () => {
    const engine = mockEngine({
      events: () => [],
      altitude: () => -20, // sun below the horizon all day (polar night)
    });
    const result = computeBodyRiseSet(engine, BODY_SUN, win, H0_SUN);
    expect(result.neverUp).toBe(true);
    expect(result.alwaysUp).toBe(false);
  });

  it("uses a 0° classifier threshold for the NaN (moon) sentinel", () => {
    // Altitude between the (unknown) real h0 and 0 counts as never-up here.
    const engine = mockEngine({ events: () => [], altitude: () => -0.2 });
    const result = computeBodyRiseSet(engine, 1, win, NaN);
    expect(result.neverUp).toBe(true);
  });

  // Guard the classifier boundary directly for both branches.
  it("classifies against the provided h0 threshold", () => {
    const belowH0 = mockEngine({ events: () => [], altitude: () => -10 });
    expect(computeBodyRiseSet(belowH0, BODY_SUN, win, -6).neverUp).toBe(true);
    const aboveH0 = mockEngine({ events: () => [], altitude: () => -3 });
    expect(computeBodyRiseSet(aboveH0, BODY_SUN, win, -6).alwaysUp).toBe(true);
  });

  it("passes the mid-window JD to body_altitude_at", () => {
    let sampledJD = 0;
    const engine = mockEngine({
      events: () => [],
      altitude: (_b, jd) => {
        sampledJD = jd;
        return 10;
      },
    });
    computeBodyRiseSet(engine, BODY_SUN, win, H0_SUN);
    expect(sampledJD).toBeCloseTo(midJD, 6);
  });
});

describe("interval algebra", () => {
  const win: JDInterval & { startJD: number; endJD: number } = { startJD: 0, endJD: 10 };

  it("invertIntervals complements within the window", () => {
    const up = [
      { startJD: 2, endJD: 4 },
      { startJD: 6, endJD: 8 },
    ];
    expect(invertIntervals(up, win)).toEqual([
      { startJD: 0, endJD: 2 },
      { startJD: 4, endJD: 6 },
      { startJD: 8, endJD: 10 },
    ]);
  });

  it("invertIntervals of the full window is empty; of empty is the whole window", () => {
    expect(invertIntervals([{ startJD: 0, endJD: 10 }], win)).toEqual([]);
    expect(invertIntervals([], win)).toEqual([{ startJD: 0, endJD: 10 }]);
  });

  it("intersectIntervals overlaps two lists", () => {
    const a = [
      { startJD: 0, endJD: 5 },
      { startJD: 7, endJD: 10 },
    ];
    const b = [
      { startJD: 3, endJD: 8 },
      { startJD: 9, endJD: 12 },
    ];
    expect(intersectIntervals(a, b)).toEqual([
      { startJD: 3, endJD: 5 },
      { startJD: 7, endJD: 8 },
      { startJD: 9, endJD: 10 },
    ]);
  });

  it("intersectIntervals returns [] when disjoint", () => {
    const a = [{ startJD: 0, endJD: 2 }];
    const b = [{ startJD: 5, endJD: 8 }];
    expect(intersectIntervals(a, b)).toEqual([]);
  });
});

describe("aboveIntervals", () => {
  const win = { startJD: 100, endJD: 101 };

  it("seeds the initial state from the start-of-window altitude (already up)", () => {
    // Body starts above the horizon, then sets — interval begins at window start.
    const engine = mockEngine({
      events: () => [EVENT_SET, 100.4, 270],
      altitude: () => 30, // above threshold at window start
    });
    expect(aboveIntervals(engine, BODY_MARS, win, H0_PLANET)).toEqual([
      { startJD: 100, endJD: 100.4 },
    ]);
  });

  it("builds a rise→set interval when starting below the horizon", () => {
    const engine = mockEngine({
      events: () => [EVENT_RISE, 100.3, 90, EVENT_SET, 100.7, 270],
      altitude: () => -10, // below threshold at window start
    });
    expect(aboveIntervals(engine, BODY_MARS, win, H0_PLANET)).toEqual([
      { startJD: 100.3, endJD: 100.7 },
    ]);
  });

  it("closes an open interval at the window end when still up", () => {
    const engine = mockEngine({
      events: () => [EVENT_RISE, 100.6, 90],
      altitude: () => -10,
    });
    expect(aboveIntervals(engine, BODY_MARS, win, H0_PLANET)).toEqual([
      { startJD: 100.6, endJD: 101 },
    ]);
  });
});

describe("computePlanetVisibility", () => {
  const win = { startJD: 0, endJD: 1 };

  it("intersects [planet up] with [sun below civil twilight]", () => {
    // Planet up 0.1..0.9; sun above -6 during 0.2..0.8 (daylight) -> dark = 0..0.2 and 0.8..1.
    const engine = mockEngine({
      events: (bodyIndex) => {
        if (bodyIndex === BODY_SUN) {
          // sun rises through -6 at 0.2, sets through -6 at 0.8
          return [EVENT_RISE, 0.2, 90, EVENT_SET, 0.8, 270];
        }
        // planet rises at 0.1, sets at 0.9
        return [EVENT_RISE, 0.1, 90, EVENT_SET, 0.9, 270];
      },
      altitude: (bodyIndex) => (bodyIndex === BODY_SUN ? -10 : -10), // both below at window start
    });
    const windows = computePlanetVisibility(engine, BODY_MARS, win);
    expect(windows).toEqual([
      { startJD: 0.1, endJD: 0.2 },
      { startJD: 0.8, endJD: 0.9 },
    ]);
  });

  it("returns [] when the planet is only up during daylight", () => {
    const engine = mockEngine({
      events: (bodyIndex) => {
        if (bodyIndex === BODY_SUN) {
          return [EVENT_RISE, 0.2, 90, EVENT_SET, 0.8, 270];
        }
        // planet up only 0.3..0.7 (fully inside daylight)
        return [EVENT_RISE, 0.3, 90, EVENT_SET, 0.7, 270];
      },
      altitude: () => -10,
    });
    expect(computePlanetVisibility(engine, BODY_MARS, win)).toEqual([]);
  });
});

describe("JD <-> Date round-trip", () => {
  it("round-trips a date through JD", () => {
    const d = new Date(Date.UTC(2026, 5, 21, 12, 34, 56));
    const jd = dateToJD(d);
    expect(jdToDate(jd).getTime()).toBeCloseTo(d.getTime(), -1);
  });
});
