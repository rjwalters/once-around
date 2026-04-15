/**
 * Sidereal Time Computations
 *
 * Pure functions for computing Greenwich Mean Sidereal Time (GMST)
 * and Local Sidereal Time (LST) from calendar dates and observer longitude.
 */

/**
 * Compute Greenwich Mean Sidereal Time for a given date.
 * Uses the IAU 2006 precession model.
 * @param date - The date to compute GMST for
 * @returns GMST in degrees (0-360)
 */
export function computeGMST(date: Date): number {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525;
  let gmst =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    T * T * (0.000387933 - T / 38710000);
  gmst = ((gmst % 360) + 360) % 360;
  return gmst;
}

/**
 * Compute Local Sidereal Time for a given date and observer longitude.
 * @param date - The date to compute LST for
 * @param longitudeDeg - Observer longitude in degrees (east positive)
 * @returns LST in degrees (0-360)
 */
export function computeLST(date: Date, longitudeDeg: number): number {
  const gmst = computeGMST(date);
  return ((gmst + longitudeDeg) % 360 + 360) % 360;
}
