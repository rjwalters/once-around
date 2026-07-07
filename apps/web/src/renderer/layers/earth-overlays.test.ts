import { describe, it, expect } from "vitest";
import { geoToLocalDirection } from "./earth";

/**
 * geoToLocalDirection maps a geographic lat/lon to a unit direction in the Earth
 * mesh's local frame. The mapping is fixed by the Three.js SphereGeometry UV
 * convention the day/night texture is applied with:
 *   - longitude 0 (prime meridian) -> +X
 *   - longitude +90 (east)          -> -Z
 *   - longitude -90 (west)          -> +Z
 *   - latitude +90 (north pole)     -> +Y
 * The South Atlantic Anomaly overlay relies on this to sit over the real South
 * Atlantic, so these invariants are worth pinning down.
 */
describe("geoToLocalDirection", () => {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

  it("returns unit vectors", () => {
    for (const [lat, lon] of [
      [0, 0],
      [45, 30],
      [-25, -45],
      [90, 123],
      [-90, -50],
    ] as const) {
      const v = geoToLocalDirection(lat, lon);
      expect(near(v.length(), 1)).toBe(true);
    }
  });

  it("maps the prime meridian on the equator to +X", () => {
    const v = geoToLocalDirection(0, 0);
    expect(near(v.x, 1)).toBe(true);
    expect(near(v.y, 0)).toBe(true);
    expect(near(v.z, 0)).toBe(true);
  });

  it("maps longitude increasing eastward toward -Z", () => {
    const east = geoToLocalDirection(0, 90);
    expect(near(east.x, 0)).toBe(true);
    expect(near(east.z, -1)).toBe(true);

    const west = geoToLocalDirection(0, -90);
    expect(near(west.x, 0)).toBe(true);
    expect(near(west.z, 1)).toBe(true);
  });

  it("maps the north pole to +Y and south pole to -Y", () => {
    expect(near(geoToLocalDirection(90, 0).y, 1)).toBe(true);
    expect(near(geoToLocalDirection(-90, 0).y, -1)).toBe(true);
  });

  it("places the South Atlantic Anomaly center in the southern, western hemisphere", () => {
    // SAA overlay center: 25S, 45W. It must sit below the equator (y < 0) and on
    // the western side of the prime meridian (+Z half-space).
    const saa = geoToLocalDirection(-25, -45);
    expect(saa.y).toBeLessThan(0);
    expect(saa.z).toBeGreaterThan(0);
    expect(saa.x).toBeGreaterThan(0); // still on the near/prime-meridian-facing side
  });
});
