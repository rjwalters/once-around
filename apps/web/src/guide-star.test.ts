import { describe, it, expect } from "vitest";
import {
  findNearestGuideStar,
  buildGuideStarCandidates,
  ACQUISITION_RADIUS_DEG,
  type GuideStarCandidate,
} from "./guide-star";

const CANDIDATES: GuideStarCandidate[] = [
  { name: "Sirius", ra: 101.29, dec: -16.72, magnitude: -1.46 },
  { name: "Vega", ra: 279.23, dec: 38.78, magnitude: 0.03 },
  { name: "Polaris", ra: 37.95, dec: 89.26, magnitude: 1.98 },
  // Two stars close together to exercise the tie-break / nearest logic.
  { name: "DimNear", ra: 100.0, dec: 0.0, magnitude: 3.0 },
  { name: "BrightFar", ra: 105.0, dec: 0.0, magnitude: -2.0 },
];

describe("findNearestGuideStar", () => {
  it("returns the star nearest the pointing within range", () => {
    // Point right at DimNear; BrightFar is 5° away and brighter but farther.
    const match = findNearestGuideStar(100.0, 0.0, ACQUISITION_RADIUS_DEG, CANDIDATES);
    expect(match?.star.name).toBe("DimNear");
    expect(match?.separationDeg).toBeCloseTo(0, 5);
  });

  it("returns null when no candidate is within the acquisition radius", () => {
    // Pointing far from every candidate with a tiny radius.
    const match = findNearestGuideStar(200.0, -80.0, 1, CANDIDATES);
    expect(match).toBeNull();
  });

  it("respects the maxRadius bound", () => {
    // BrightFar (105,0) is 5° from (100,0); a 3° radius must exclude it and
    // only DimNear (0°) remains.
    const match = findNearestGuideStar(100.0, 0.0, 3, CANDIDATES);
    expect(match?.star.name).toBe("DimNear");
  });

  it("breaks exact-distance ties toward the brighter star", () => {
    const tied: GuideStarCandidate[] = [
      { name: "Faint", ra: 10, dec: 10, magnitude: 4.0 },
      { name: "Bright", ra: 10, dec: 10, magnitude: 1.0 },
    ];
    const match = findNearestGuideStar(10, 10, 5, tied);
    expect(match?.star.name).toBe("Bright");
  });

  it("acquires a nearby bright star from a rough pointing", () => {
    // A few degrees off Vega should still acquire Vega.
    const match = findNearestGuideStar(281, 40, ACQUISITION_RADIUS_DEG, CANDIDATES);
    expect(match?.star.name).toBe("Vega");
    expect(match?.separationDeg).toBeLessThan(ACQUISITION_RADIUS_DEG);
  });
});

describe("buildGuideStarCandidates", () => {
  it("produces candidates from the bright-star catalog with valid fields", () => {
    const candidates = buildGuideStarCandidates();
    expect(candidates.length).toBeGreaterThan(10);
    for (const c of candidates) {
      expect(typeof c.name).toBe("string");
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.ra).toBeGreaterThanOrEqual(0);
      expect(c.ra).toBeLessThanOrEqual(360);
      expect(c.dec).toBeGreaterThanOrEqual(-90);
      expect(c.dec).toBeLessThanOrEqual(90);
      expect(Number.isFinite(c.magnitude)).toBe(true);
    }
  });

  it("includes Sirius, the canonical brightest star", () => {
    const candidates = buildGuideStarCandidates();
    expect(candidates.some((c) => c.name === "Sirius")).toBe(true);
  });
});
