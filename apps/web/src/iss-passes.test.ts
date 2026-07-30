import { describe, it, expect } from "vitest";
import type { SkyEngine } from "./wasm/sky_engine";
import {
  APPROXIMATE_FORECAST_DAYS,
  forecastHorizonDays,
  getEphemerisStatus,
  isApproximatePass,
  passScanWindow,
  type ISSPass
} from "./iss-passes";

const JD_UNIX_EPOCH = 2440587.5;
const MS_PER_DAY = 86400000;

/** Convert a Unix-ms instant to a Julian Date (same convention as iss-passes.ts). */
function msToJD(ms: number): number {
  return ms / MS_PER_DAY + JD_UNIX_EPOCH;
}

/**
 * Minimal SkyEngine stand-in exposing only `satellite_ephemeris_range`, which
 * is all `getEphemerisStatus` / `passScanWindow` read. `range` of `null`
 * simulates "no ephemeris loaded".
 */
function mockEngine(range: number[] | null): SkyEngine {
  return {
    satellite_ephemeris_range: (_index: number) => range ?? undefined,
  } as unknown as SkyEngine;
}

describe("getEphemerisStatus", () => {
  const now = Date.UTC(2026, 5, 1); // 2026-06-01
  const startJD = msToJD(Date.UTC(2026, 4, 15)); // 2026-05-15
  const endJD = msToJD(Date.UTC(2026, 5, 14)); // 2026-06-14

  it("reports 'ok' when now is within coverage", () => {
    const status = getEphemerisStatus(mockEngine([startJD, endJD]), 0, now);
    expect(status.state).toBe("ok");
  });

  it("reports 'stale' when the ephemeris ended in the past", () => {
    // Coverage that ended a week before `now`.
    const pastEnd = msToJD(Date.UTC(2026, 4, 25)); // 2026-05-25
    const status = getEphemerisStatus(mockEngine([startJD, pastEnd]), 0, now);
    expect(status.state).toBe("stale");
    if (status.state === "stale") {
      // coverageEnd should round-trip back to the end instant.
      expect(status.coverageEnd.getTime()).toBeCloseTo(Date.UTC(2026, 4, 25), -3);
    }
  });

  it("reports 'future' when the ephemeris starts after now", () => {
    const futureStart = msToJD(Date.UTC(2026, 6, 1)); // 2026-07-01
    const futureEnd = msToJD(Date.UTC(2026, 6, 30));
    const status = getEphemerisStatus(mockEngine([futureStart, futureEnd]), 0, now);
    expect(status.state).toBe("future");
  });

  it("reports 'missing' when no ephemeris is loaded", () => {
    expect(getEphemerisStatus(mockEngine(null), 0, now).state).toBe("missing");
    expect(getEphemerisStatus(mockEngine([startJD]), 0, now).state).toBe("missing");
  });

  it("treats the exact end instant as still covered", () => {
    const status = getEphemerisStatus(mockEngine([startJD, endJD]), 0, Date.UTC(2026, 5, 14));
    expect(status.state).toBe("ok");
  });
});

describe("passScanWindow", () => {
  const now = Date.UTC(2026, 5, 1);
  const startJD = msToJD(Date.UTC(2026, 4, 15));
  const endJD = msToJD(Date.UTC(2026, 5, 14));

  it("returns a window starting at now when coverage is current", () => {
    const win = passScanWindow(mockEngine([startJD, endJD]), 0, now);
    expect(win).not.toBeNull();
    expect(win!.searchStartJD).toBeCloseTo(msToJD(now), 6);
    expect(win!.endJD).toBeCloseTo(endJD, 6);
  });

  it("returns null when coverage has expired (stale data)", () => {
    const pastEnd = msToJD(Date.UTC(2026, 4, 25));
    expect(passScanWindow(mockEngine([startJD, pastEnd]), 0, now)).toBeNull();
  });

  it("returns null when no ephemeris is loaded", () => {
    expect(passScanWindow(mockEngine(null), 0, now)).toBeNull();
  });
});

describe("approximate long-range passes", () => {
  const now = Date.UTC(2026, 5, 1); // 2026-06-01

  /** Minimal pass stub — only `riseTime` drives the horizon classification. */
  function passAt(riseMs: number): ISSPass {
    return {
      riseTime: new Date(riseMs),
      riseAzimuth: 300,
      riseDirection: "WNW",
      maxTime: new Date(riseMs + 180000),
      maxAltitude: 62,
      maxAzimuth: 210,
      setTime: new Date(riseMs + 360000),
      setAzimuth: 120,
      setDirection: "ESE",
      duration: 360,
      brightness: -3
    };
  }

  const DAY_MS = 86400000;

  it("measures the forecast horizon in days from now", () => {
    expect(forecastHorizonDays(new Date(now + 3 * DAY_MS), now)).toBeCloseTo(3, 9);
    // A pass already under way sits behind `now`.
    expect(forecastHorizonDays(new Date(now - DAY_MS), now)).toBeCloseTo(-1, 9);
  });

  it("does not flag a near-term pass", () => {
    expect(isApproximatePass(passAt(now + 2 * DAY_MS), now)).toBe(false);
    expect(isApproximatePass(passAt(now + 60000), now)).toBe(false);
  });

  it("flags a pass past the forecast horizon", () => {
    const far = now + (APPROXIMATE_FORECAST_DAYS + 3) * DAY_MS;
    expect(isApproximatePass(passAt(far), now)).toBe(true);
  });

  it("treats the threshold itself as still precise", () => {
    const atThreshold = now + APPROXIMATE_FORECAST_DAYS * DAY_MS;
    expect(isApproximatePass(passAt(atThreshold), now)).toBe(false);
    expect(isApproximatePass(passAt(atThreshold + 60000), now)).toBe(true);
  });

  it("is independent of ephemeris coverage state", () => {
    // A far-out pass inside a perfectly valid ('ok') coverage window is still
    // flagged: coverage says whether we have data, this says how far out it is.
    const startJD = msToJD(Date.UTC(2026, 4, 15));
    const endJD = msToJD(Date.UTC(2026, 5, 14));
    expect(getEphemerisStatus(mockEngine([startJD, endJD]), 0, now).state).toBe("ok");
    expect(isApproximatePass(passAt(now + 10 * DAY_MS), now)).toBe(true);
  });
});
