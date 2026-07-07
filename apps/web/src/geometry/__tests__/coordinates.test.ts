/**
 * Unit tests for celestial coordinate conversions – round-trip checks.
 */
import { describe, expect, it } from "vitest";
import {
  angularSeparation,
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

describe("angularSeparation", () => {
  it("returns 0° for identical alt/az inputs", () => {
    expect(angularSeparation(30, 120, 30, 120)).toBeCloseTo(0, 9);
    expect(angularSeparation(-45, 200, -45, 200)).toBeCloseTo(0, 9);
  });

  it("returns 90° for orthogonal directions", () => {
    // Zenith (alt 90) vs any horizon point (alt 0) are 90° apart.
    expect(angularSeparation(90, 0, 0, 0)).toBeCloseTo(90, 9);
    expect(angularSeparation(90, 0, 0, 137)).toBeCloseTo(90, 9);
    // Two horizon points 90° apart in azimuth.
    expect(angularSeparation(0, 0, 0, 90)).toBeCloseTo(90, 9);
  });

  it("returns 180° for antipodal directions", () => {
    // Zenith vs nadir.
    expect(angularSeparation(90, 0, -90, 0)).toBeCloseTo(180, 9);
    // Opposite points on the horizon.
    expect(angularSeparation(0, 0, 0, 180)).toBeCloseTo(180, 9);
  });

  it("matches a known reference pair (60° azimuth gap on the horizon)", () => {
    // Two points on the horizon separated by 60° in azimuth are 60° apart.
    expect(angularSeparation(0, 10, 0, 70)).toBeCloseTo(60, 9);
    // A 3-4-5-style check: alt 30, az 0 vs alt 30, az 60.
    // cos(sep) = sin²30 + cos²30·cos60 = 0.25 + 0.75·0.5 = 0.625
    const expected = (Math.acos(0.625) * 180) / Math.PI;
    expect(angularSeparation(30, 0, 30, 60)).toBeCloseTo(expected, 9);
  });

  it("is symmetric and azimuth-reference independent", () => {
    const a = angularSeparation(20, 45, -10, 200);
    const b = angularSeparation(-10, 200, 20, 45);
    expect(a).toBeCloseTo(b, 9);
    // Shifting both azimuths by the same offset does not change the result.
    const shifted = angularSeparation(20, 45 + 33, -10, 200 + 33);
    expect(shifted).toBeCloseTo(a, 9);
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
