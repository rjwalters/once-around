/**
 * Unit tests for the WMM-2025 magnetic declination model.
 *
 * The primary suite validates `magneticDeclination` against NOAA/NCEI's
 * official WMM2025 test vectors (committed under fixtures/), asserting the
 * computed declination matches the published value to within 0.01°.
 *
 * The official published test-value file contains 12 vectors (3 locations x
 * 2 heights x 2 dates). We assert every one of them; the 0.01° tolerance is
 * far tighter than the model's ~0.5° stated global accuracy and confirms the
 * spherical-harmonic implementation reproduces the reference to published
 * precision.
 */
import { describe, expect, it } from "vitest";
import { decimalYear, magneticDeclination } from "../magnetic-declination";
import fixture from "../fixtures/wmm2025-test-vectors.json";

/**
 * Build a Date whose `decimalYear` equals the given decimal year, using the
 * exact same year-fraction convention as the module under test so the model
 * epoch offset is reproduced without rounding drift.
 */
function dateFromDecimalYear(dy: number): Date {
  const year = Math.floor(dy);
  const frac = dy - year;
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return new Date(start + frac * (end - start));
}

describe("magneticDeclination – NOAA WMM2025 official test vectors", () => {
  it("has loaded the committed fixture", () => {
    expect(fixture.vectors.length).toBe(12);
  });

  for (const v of fixture.vectors) {
    const label = `date=${v.date} alt=${v.altKm}km lat=${v.lat} lon=${v.lon} -> D=${v.decl}°`;
    it(`matches NOAA declination within 0.01° (${label})`, () => {
      const date = dateFromDecimalYear(v.date);
      // Sanity-check the round-trip of the date construction itself.
      expect(decimalYear(date)).toBeCloseTo(v.date, 6);

      const computed = magneticDeclination(v.lat, v.lon, date, v.altKm);
      expect(Math.abs(computed - v.decl)).toBeLessThan(0.01);
    });
  }

  it("keeps the maximum error across all vectors under 0.01°", () => {
    let maxErr = 0;
    for (const v of fixture.vectors) {
      const date = dateFromDecimalYear(v.date);
      const computed = magneticDeclination(v.lat, v.lon, date, v.altKm);
      maxErr = Math.max(maxErr, Math.abs(computed - v.decl));
    }
    expect(maxErr).toBeLessThan(0.01);
  });
});

describe("decimalYear – edge cases", () => {
  it("returns exactly the integer year at the New Year UTC boundary", () => {
    expect(decimalYear(new Date(Date.UTC(2025, 0, 1)))).toBe(2025.0);
    expect(decimalYear(new Date(Date.UTC(2030, 0, 1)))).toBe(2030.0);
  });

  it("uses a 366-day denominator in a leap year", () => {
    // 2024 is a leap year. Jul 1 is day 182 (0-indexed) from Jan 1:
    // 31+29+31+30+31+30 = 182 days elapsed.
    const dy = decimalYear(new Date(Date.UTC(2024, 6, 1)));
    expect(dy).toBeCloseTo(2024 + 182 / 366, 12);
    // Guard against a hard-coded 365-day denominator.
    expect(dy).not.toBeCloseTo(2024 + 182 / 365, 6);
  });

  it("uses a 365-day denominator in a non-leap year", () => {
    // 2025 is not a leap year. Jul 1 is day 181 from Jan 1:
    // 31+28+31+30+31+30 = 181 days elapsed.
    const dy = decimalYear(new Date(Date.UTC(2025, 6, 1)));
    expect(dy).toBeCloseTo(2025 + 181 / 365, 12);
    expect(dy).not.toBeCloseTo(2025 + 181 / 366, 6);
  });
});
