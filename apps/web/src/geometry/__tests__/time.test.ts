/**
 * Unit tests for sidereal-time computations.
 */
import { describe, expect, it } from "vitest";
import { computeGMST, computeLST } from "../time";

describe("computeGMST", () => {
  it("returns the formula constant at the J2000.0 epoch", () => {
    // 2000-01-01T12:00:00Z is JD 2451545.0 exactly, so T = 0 and the day count
    // term vanishes, leaving the constant 280.46061837.
    const gmst = computeGMST(new Date("2000-01-01T12:00:00Z"));
    expect(gmst).toBeCloseTo(280.46061837, 6);
  });

  it("wraps into [0, 360) for dates far from J2000", () => {
    for (const iso of [
      "1975-03-14T04:23:11Z",
      "2026-07-06T18:45:00Z",
      "2099-12-31T23:59:59Z",
    ]) {
      const gmst = computeGMST(new Date(iso));
      expect(gmst).toBeGreaterThanOrEqual(0);
      expect(gmst).toBeLessThan(360);
    }
  });

  it("advances by ~360.9856° per solar day", () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-01-02T00:00:00Z");
    let delta = computeGMST(t1) - computeGMST(t0);
    delta = ((delta % 360) + 360) % 360;
    // One solar day advances sidereal time by 360.98564736629° (mod 360).
    expect(delta).toBeCloseTo(0.98564736629, 4);
  });
});

describe("computeLST", () => {
  it("equals GMST plus longitude, wrapped into [0, 360)", () => {
    const date = new Date("2026-07-06T18:45:00Z");
    const gmst = computeGMST(date);
    for (const lon of [-180, -73.9, 0, 45, 139.7, 180]) {
      const lst = computeLST(date, lon);
      const expected = ((gmst + lon) % 360 + 360) % 360;
      expect(lst).toBeCloseTo(expected, 9);
      expect(lst).toBeGreaterThanOrEqual(0);
      expect(lst).toBeLessThan(360);
    }
  });
});
