/**
 * Math Utilities
 *
 * Common mathematical functions used across the renderer.
 */

/**
 * Attempt at Hermite interpolation between two values based on where x falls in [edge0, edge1].
 * Returns 0 if x <= edge0, 1 if x >= edge1, and smooth interpolation in between.
 *
 * This is the standard GLSL smoothstep function, useful for:
 * - LOD transitions (blending between sprite and mesh)
 * - Opacity fades
 * - Any smooth transition between states
 *
 * @param edge0 - Lower edge of transition range
 * @param edge1 - Upper edge of transition range
 * @param x - Input value
 * @returns Smoothly interpolated value between 0 and 1
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Linear interpolation between two values.
 *
 * @param a - Start value
 * @param b - End value
 * @param t - Interpolation factor (0 = a, 1 = b)
 * @returns Interpolated value
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Clamp a value between min and max.
 *
 * @param value - Value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
