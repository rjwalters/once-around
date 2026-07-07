import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { geoToLocalDirection, eclipseTrackLocalPositions } from "./earth";
import { ECLIPSE_PATHS, getEclipsePath } from "../../eclipsePaths";

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

/**
 * eclipseTrackLocalPositions turns a catalog eclipse center line into a
 * surface-hugging polyline in the Earth mesh's local frame. The tracks are
 * parented to the Earth mesh (issue #67), so these local-frame invariants are
 * what make the drawn track land over the right part of the globe and stay on
 * the sphere for correct far-side occlusion.
 */
describe("eclipseTrackLocalPositions", () => {
  const RADIUS = 20;
  const SPAIN_2026 = "2026-08-12T17:46:06Z";
  const AUSTRALIA_2028 = "2028-07-22T02:55:36Z";

  function toVectors(positions: Float32Array): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < positions.length; i += 3) {
      out.push(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
    }
    return out;
  }

  it("returns an empty array for an empty center line", () => {
    expect(eclipseTrackLocalPositions([], RADIUS)).toHaveLength(0);
  });

  it("keeps every emitted point on the sphere of the requested radius", () => {
    for (const path of ECLIPSE_PATHS) {
      const pts = toVectors(eclipseTrackLocalPositions(path.centerLine, RADIUS));
      expect(pts.length).toBeGreaterThanOrEqual(path.centerLine.length);
      for (const p of pts) {
        expect(Math.abs(p.length() - RADIUS)).toBeLessThan(1e-3);
      }
    }
  });

  it("densifies so consecutive points stay within the max angular step", () => {
    const maxStepDeg = 2;
    const pts = toVectors(
      eclipseTrackLocalPositions(getEclipsePath(SPAIN_2026)!.centerLine, RADIUS, maxStepDeg)
    );
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i].clone().normalize();
      const b = pts[i + 1].clone().normalize();
      const gapDeg = (Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * 180) / Math.PI;
      // Small epsilon over the target to absorb rounding at segment joins.
      expect(gapDeg).toBeLessThanOrEqual(maxStepDeg + 1e-6);
    }
  });

  it("emits each original center-line vertex exactly", () => {
    const path = getEclipsePath(SPAIN_2026)!;
    const pts = toVectors(eclipseTrackLocalPositions(path.centerLine, RADIUS));
    for (const vertex of path.centerLine) {
      const expected = geoToLocalDirection(vertex.lat, vertex.lon).multiplyScalar(RADIUS);
      const hit = pts.some((p) => p.distanceTo(expected) < 1e-3);
      expect(hit, `vertex ${vertex.lat},${vertex.lon}`).toBe(true);
    }
  });

  it("places the 2026 Spain landfall over northern Spain in the local frame", () => {
    // 43.4N, 6.5W (Asturias coast) — the acceptance landmark. It must sit in the
    // northern hemisphere (y > 0) and west of the prime meridian (z > 0),
    // consistent with the mini-map's northern-Spain landfall.
    const landfall = geoToLocalDirection(43.4, -6.5).multiplyScalar(RADIUS);
    expect(landfall.y).toBeGreaterThan(0);
    expect(landfall.z).toBeGreaterThan(0);

    const pts = toVectors(eclipseTrackLocalPositions(getEclipsePath(SPAIN_2026)!.centerLine, RADIUS));
    expect(pts.some((p) => p.distanceTo(landfall) < 1e-3)).toBe(true);
  });

  it("puts the 2026 track in the north and the 2028 Australia track in the south", () => {
    const spain = toVectors(eclipseTrackLocalPositions(getEclipsePath(SPAIN_2026)!.centerLine, RADIUS));
    const australia = toVectors(
      eclipseTrackLocalPositions(getEclipsePath(AUSTRALIA_2028)!.centerLine, RADIUS)
    );
    // The Spain/Arctic track lives entirely in the northern hemisphere; the
    // Australia/New Zealand track lives entirely in the southern hemisphere.
    expect(spain.every((p) => p.y > 0)).toBe(true);
    expect(australia.every((p) => p.y < 0)).toBe(true);
  });
});
