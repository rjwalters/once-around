/**
 * Unit tests for celestial coordinate conversions – round-trip checks.
 */
import { describe, expect, it } from "vitest";
import {
  eclipticToEquatorialRaDec,
  equatorialToHorizontal,
  horizontalToEquatorial,
  positionToRaDec,
  raDecToDirection,
  raDecToPosition,
} from "../coordinates";

/** Angular separation between two unit direction vectors, in degrees. */
function angleBetween(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
): number {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

const SAMPLES: Array<{ ra: number; dec: number }> = [
  { ra: 0, dec: 0 },
  { ra: 45, dec: 30 },
  { ra: 90, dec: -20 },
  { ra: 180, dec: 60 },
  { ra: 270, dec: -60 },
  { ra: 359, dec: 12 },
  { ra: 123.4, dec: -45.6 },
];

describe("raDecToDirection / positionToRaDec round-trip", () => {
  it("recovers RA/Dec from the generated direction vector", () => {
    for (const { ra, dec } of SAMPLES) {
      const dir = raDecToDirection(ra, dec);
      expect(dir.length()).toBeCloseTo(1, 9);
      const back = positionToRaDec(dir);
      expect(back.dec).toBeCloseTo(dec, 9);
      // RA is degenerate at the poles; skip the RA check when |dec| ~ 90.
      if (Math.abs(dec) < 89.999) {
        const raDiff = Math.abs(((back.ra - ra + 540) % 360) - 180);
        expect(raDiff).toBeCloseTo(0, 8);
      }
    }
  });

  it("raDecToPosition scales the direction by the requested radius", () => {
    const radius = 500;
    for (const { ra, dec } of SAMPLES) {
      const pos = raDecToPosition(ra, dec, radius);
      const dir = raDecToDirection(ra, dec);
      expect(pos.length()).toBeCloseTo(radius, 6);
      expect(angleBetween(pos, dir)).toBeCloseTo(0, 8);
    }
  });
});

describe("equatorialToHorizontal / horizontalToEquatorial round-trip", () => {
  it("recovers RA/Dec after converting to alt/az and back", () => {
    const lst = 100; // degrees
    const lat = 40; // degrees
    for (const { ra, dec } of SAMPLES) {
      const { altitude, azimuth } = equatorialToHorizontal(ra, dec, lst, lat);
      const back = horizontalToEquatorial(azimuth, altitude, lst, lat);
      expect(back.dec).toBeCloseTo(dec, 6);
      const raDiff = Math.abs(((back.ra - ra + 540) % 360) - 180);
      expect(raDiff).toBeCloseTo(0, 5);
    }
  });
});

describe("eclipticToEquatorialRaDec", () => {
  it("maps the ecliptic X axis to the equatorial origin (RA=Dec=0)", () => {
    const { ra, dec } = eclipticToEquatorialRaDec(1, 0, 0);
    expect(ra).toBeCloseTo(0, 9);
    expect(dec).toBeCloseTo(0, 9);
  });

  it("tilts the ecliptic Y axis by the obliquity (~23.4393°)", () => {
    const { ra, dec } = eclipticToEquatorialRaDec(0, 1, 0);
    expect(ra).toBeCloseTo(90, 6);
    expect(dec).toBeCloseTo(23.4393, 4);
  });

  it("returns the origin for a zero-length vector", () => {
    expect(eclipticToEquatorialRaDec(0, 0, 0)).toEqual({ ra: 0, dec: 0 });
  });
});
