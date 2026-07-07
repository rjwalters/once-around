/**
 * Stars LOD & rebuild-key helpers
 *
 * Pure functions extracted from the stars layer so the LOD math and the
 * "should we rebuild the geometry?" decision can be unit-tested without a
 * WebGL/WASM environment.
 *
 * Star positions are J2000-fixed and therefore time-invariant, so the star
 * geometry only needs to be rebuilt when one of the inputs captured by
 * {@link StarRebuildKey} changes. Time-only advances (the common case during
 * playback) leave the key unchanged and can skip the expensive rebuild.
 */

/**
 * Map a field of view (degrees) to a discrete LOD bucket.
 *
 * Bucket boundaries match the breakpoints of {@link computeTargetStars}:
 * - 0: wide FOV (> 70°)
 * - 1: medium FOV (40°–70°)
 * - 2: narrow FOV (< 40°)
 *
 * The bucket is used only to decide whether a rebuild is required; crossing a
 * boundary forces a rebuild, while smooth zoom within a bucket can reuse the
 * existing geometry.
 */
export function computeFovLodBucket(fov: number): number {
  if (fov > 70) return 0;
  if (fov > 40) return 1;
  return 2;
}

/**
 * Compute the target rendered-star count for a given FOV.
 *
 * Wide FOV renders fewer stars (cheaper, less clutter); narrow FOV renders more.
 * The medium range interpolates linearly between the narrow and medium caps.
 * This is the exact formula previously inlined in the stars layer update loop.
 *
 * @param fov - Field of view in degrees
 * @param wide - Cap at wide FOV (> 70°)
 * @param medium - Cap at the 70° end of the medium range
 * @param narrow - Cap at narrow FOV (< 40°) and the 40° end of the medium range
 */
export function computeTargetStars(
  fov: number,
  wide: number,
  medium: number,
  narrow: number
): number {
  if (fov > 70) {
    return wide;
  }
  if (fov > 40) {
    const t = (fov - 40) / 30;
    return Math.floor(narrow + t * (medium - narrow));
  }
  return narrow;
}

/**
 * Inputs that determine the star geometry. If two consecutive updates produce
 * equal keys, the visible-star set and its LOD sampling are identical, so the
 * geometry rebuild can be skipped.
 */
export interface StarRebuildKey {
  /** Engine magnitude limit (changes the visible catalog subset). */
  magLimit: number;
  /** Engine `visible_stars()` count (changes with mag limit / catalog). */
  visibleCount: number;
  /** Engine `total_stars()` count (changes when the catalog grows). */
  totalStars: number;
  /** Discrete FOV LOD bucket from {@link computeFovLodBucket}. */
  fovBucket: number;
  /** Monotonic counter bumped whenever star overrides change. */
  overrideVersion: number;
}

/**
 * True when two rebuild keys are equivalent (geometry can be reused).
 */
export function rebuildKeyEquals(a: StarRebuildKey, b: StarRebuildKey): boolean {
  return (
    a.magLimit === b.magLimit &&
    a.visibleCount === b.visibleCount &&
    a.totalStars === b.totalStars &&
    a.fovBucket === b.fovBucket &&
    a.overrideVersion === b.overrideVersion
  );
}
