import { describe, it, expect } from "vitest";
import {
  computeFovLodBucket,
  computeTargetStars,
  rebuildKeyEquals,
  type StarRebuildKey,
} from "../stars-lod";
import {
  LOD_MAX_STARS_WIDE_FOV,
  LOD_MAX_STARS_MEDIUM_FOV,
  LOD_MAX_STARS_NARROW_FOV,
} from "../../constants";

describe("computeFovLodBucket", () => {
  it("returns 0 for wide FOV (> 70)", () => {
    expect(computeFovLodBucket(120)).toBe(0);
    expect(computeFovLodBucket(70.1)).toBe(0);
  });

  it("returns 1 for medium FOV (40 < fov <= 70)", () => {
    expect(computeFovLodBucket(70)).toBe(1);
    expect(computeFovLodBucket(55)).toBe(1);
    expect(computeFovLodBucket(40.1)).toBe(1);
  });

  it("returns 2 for narrow FOV (<= 40)", () => {
    expect(computeFovLodBucket(40)).toBe(2);
    expect(computeFovLodBucket(10)).toBe(2);
    expect(computeFovLodBucket(1)).toBe(2);
  });

  it("changes bucket exactly at the 70 and 40 boundaries", () => {
    expect(computeFovLodBucket(70.0001)).not.toBe(computeFovLodBucket(70));
    expect(computeFovLodBucket(40.0001)).not.toBe(computeFovLodBucket(40));
  });
});

describe("computeTargetStars", () => {
  const wide = LOD_MAX_STARS_WIDE_FOV;
  const medium = LOD_MAX_STARS_MEDIUM_FOV;
  const narrow = LOD_MAX_STARS_NARROW_FOV;

  it("returns the wide cap for FOV > 70", () => {
    expect(computeTargetStars(90, wide, medium, narrow)).toBe(wide);
  });

  it("returns the narrow cap for FOV <= 40", () => {
    expect(computeTargetStars(40, wide, medium, narrow)).toBe(narrow);
    expect(computeTargetStars(20, wide, medium, narrow)).toBe(narrow);
  });

  it("interpolates linearly across the medium range", () => {
    // At fov=70, t=1 -> medium cap
    expect(computeTargetStars(70, wide, medium, narrow)).toBe(
      Math.floor(narrow + 1 * (medium - narrow))
    );
    // At fov=55, t=0.5 -> midpoint
    expect(computeTargetStars(55, wide, medium, narrow)).toBe(
      Math.floor(narrow + 0.5 * (medium - narrow))
    );
    // Just above 40, t~0 -> near narrow cap
    expect(computeTargetStars(40.0001, wide, medium, narrow)).toBe(
      Math.floor(narrow + ((40.0001 - 40) / 30) * (medium - narrow))
    );
  });

  it("is monotonically non-increasing as FOV widens (more stars when zoomed in)", () => {
    const narrowCount = computeTargetStars(30, wide, medium, narrow);
    const mediumCount = computeTargetStars(55, wide, medium, narrow);
    const wideCount = computeTargetStars(90, wide, medium, narrow);
    expect(narrowCount).toBeGreaterThanOrEqual(mediumCount);
    expect(mediumCount).toBeGreaterThanOrEqual(wideCount);
  });
});

describe("rebuildKeyEquals", () => {
  const base: StarRebuildKey = {
    magLimit: 6.5,
    visibleCount: 9096,
    totalStars: 9110,
    fovBucket: 1,
    overrideVersion: 0,
  };

  it("is true for identical keys (time-only change -> skip rebuild)", () => {
    expect(rebuildKeyEquals(base, { ...base })).toBe(true);
  });

  it("detects a magnitude-limit change", () => {
    expect(rebuildKeyEquals(base, { ...base, magLimit: 5.0 })).toBe(false);
  });

  it("detects a visible-star count change", () => {
    expect(rebuildKeyEquals(base, { ...base, visibleCount: 5000 })).toBe(false);
  });

  it("detects catalog growth via total stars", () => {
    expect(rebuildKeyEquals(base, { ...base, totalStars: 9200 })).toBe(false);
  });

  it("detects an FOV bucket change (crossing an LOD boundary)", () => {
    expect(rebuildKeyEquals(base, { ...base, fovBucket: 2 })).toBe(false);
  });

  it("detects an override change (tour effects must force a rebuild)", () => {
    expect(rebuildKeyEquals(base, { ...base, overrideVersion: 1 })).toBe(false);
  });
});
