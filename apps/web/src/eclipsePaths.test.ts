import { describe, it, expect } from "vitest";
import {
  ECLIPSE_PATHS,
  getEclipsePath,
  haversineKm,
  nearestPointOnPath,
  computeLocalCircumstances,
} from "./eclipsePaths";
import { buildProjection, renderEclipsePathMapSvg } from "./eclipse-path-map";

const SPAIN_2026 = "2026-08-12T17:46:06Z";

// Rough bounding box for peninsular northern Spain (lat 40–44 N, lon 8 W–4 E).
function inNorthernSpain(p: { lat: number; lon: number }): boolean {
  return p.lat >= 39.5 && p.lat <= 44 && p.lon >= -8 && p.lon <= 4;
}

describe("eclipse path catalog", () => {
  it("has a path for each motivating eclipse", () => {
    for (const dt of [
      "2024-04-08T18:17:16Z",
      "2026-08-12T17:46:06Z",
      "2027-08-02T10:07:50Z",
      "2028-07-22T02:55:36Z",
    ]) {
      expect(getEclipsePath(dt), dt).not.toBeNull();
    }
  });

  it("returns null for an unknown eclipse", () => {
    expect(getEclipsePath("1999-08-11T11:03:00Z")).toBeNull();
  });

  it("center lines are ordered polylines with >= 2 points", () => {
    for (const path of ECLIPSE_PATHS) {
      expect(path.centerLine.length).toBeGreaterThanOrEqual(2);
      expect(path.pathHalfWidthKm).toBeGreaterThan(0);
    }
  });
});

describe("2026 Spain eclipse accuracy", () => {
  const path = getEclipsePath(SPAIN_2026)!;

  it("center line crosses northern Spain", () => {
    const spainPoints = path.centerLine.filter(inNorthernSpain);
    expect(spainPoints.length).toBeGreaterThan(0);
  });

  it("shadow reaches Spain in the evening (UTC) of 2026-08-12", () => {
    const spainWithTime = path.centerLine.find(
      (p) => inNorthernSpain(p) && p.timeUtc
    );
    expect(spainWithTime).toBeDefined();
    const d = new Date(spainWithTime!.timeUtc!);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(7); // August (0-indexed)
    expect(d.getUTCDate()).toBe(12);
    // Evening totality over Spain (~18:29 UTC = ~20:29 CEST).
    expect(d.getUTCHours()).toBeGreaterThanOrEqual(18);
  });
});

describe("haversineKm", () => {
  it("is zero for identical points", () => {
    expect(haversineKm({ lat: 40, lon: -3 }, { lat: 40, lon: -3 })).toBeCloseTo(
      0,
      6
    );
  });

  it("matches a known distance (London → Paris ≈ 344 km)", () => {
    const d = haversineKm(
      { lat: 51.5074, lon: -0.1278 },
      { lat: 48.8566, lon: 2.3522 }
    );
    expect(d).toBeGreaterThan(330);
    expect(d).toBeLessThan(360);
  });

  it("~111 km per degree of latitude", () => {
    const d = haversineKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });
});

describe("nearestPointOnPath", () => {
  const path = getEclipsePath(SPAIN_2026)!;

  it("returns ~0 distance for a point on the center line", () => {
    const onLine = path.centerLine[11]; // near Burgos
    const nearest = nearestPointOnPath(path.centerLine, onLine);
    expect(nearest.distanceKm).toBeLessThan(1);
  });

  it("projects onto a segment, not just a vertex", () => {
    // Midpoint between two vertices should snap to an interior segment point.
    const a = path.centerLine[11];
    const b = path.centerLine[12];
    const mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
    const nearest = nearestPointOnPath(path.centerLine, mid);
    expect(nearest.distanceKm).toBeLessThan(5);
    expect(nearest.fraction).toBeGreaterThan(0);
    expect(nearest.fraction).toBeLessThan(1);
  });

  it("interpolates center-line duration at the nearest point", () => {
    const nearest = nearestPointOnPath(path.centerLine, {
      lat: 42.4,
      lon: -4.35,
    });
    expect(nearest.centerDurationSec).toBeGreaterThan(90);
    expect(nearest.centerDurationSec).toBeLessThan(110);
  });
});

describe("computeLocalCircumstances", () => {
  const path = getEclipsePath(SPAIN_2026)!;

  it("Madrid is outside the path of totality", () => {
    const circ = computeLocalCircumstances(path, { lat: 40.4168, lon: -3.7038 });
    expect(circ.insidePath).toBe(false);
    expect(circ.localDurationSec).toBe(0);
    expect(circ.distanceKm).toBeGreaterThan(path.pathHalfWidthKm);
  });

  it("navigating to the nearest point puts the observer on the line", () => {
    const madrid = { lat: 40.4168, lon: -3.7038 };
    const before = computeLocalCircumstances(path, madrid);
    // Emulate "navigate to path": move observer to the nearest center point.
    const moved = { lat: before.nearest.lat, lon: before.nearest.lon };
    const after = computeLocalCircumstances(path, moved);
    expect(after.distanceKm).toBeLessThan(1);
    expect(after.insidePath).toBe(true);
    expect(after.localDurationSec).toBeGreaterThan(0);
    // The nearest point lands in northern Spain, not out at sea.
    expect(inNorthernSpain(moved)).toBe(true);
  });

  it("local duration shrinks toward the path edge", () => {
    // A point offset toward the edge should have shorter totality than center.
    const center = path.centerLine[11];
    const centerCirc = computeLocalCircumstances(path, center);
    // Offset ~half the half-width north of the center line.
    const offsetKm = path.pathHalfWidthKm * 0.5;
    const offsetDeg = offsetKm / 111;
    const edge = { lat: center.lat + offsetDeg, lon: center.lon };
    const edgeCirc = computeLocalCircumstances(path, edge);
    expect(edgeCirc.insidePath).toBe(true);
    expect(edgeCirc.localDurationSec).toBeGreaterThan(0);
    expect(edgeCirc.localDurationSec).toBeLessThan(centerCirc.localDurationSec);
  });
});

describe("eclipse path mini-map", () => {
  const path = getEclipsePath(SPAIN_2026)!;

  it("projects points within the requested viewport", () => {
    const size = { width: 300, height: 170 };
    const proj = buildProjection(path.centerLine, size);
    for (const p of path.centerLine) {
      const { x, y } = proj.toXY(p);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(size.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(size.height);
    }
  });

  it("renders an SVG containing the center-line polyline and markers", () => {
    const observer = { lat: 40.4168, lon: -3.7038 };
    const nearest = nearestPointOnPath(path.centerLine, observer);
    const svg = renderEclipsePathMapSvg(path, observer, nearest);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<polyline");
    expect(svg).toContain("</svg>");
  });
});
