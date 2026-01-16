/**
 * Animation Utilities
 *
 * Easing functions and animation helpers for smooth camera transitions.
 */

/**
 * Cubic ease-in-out function.
 * Provides smooth acceleration and deceleration.
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Quadratic ease-in-out function.
 * Slightly less aggressive than cubic.
 */
export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
