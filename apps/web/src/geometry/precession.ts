/**
 * Fixed J2000 map axes ↔ mean equator/equinox of date (IAU 1976).
 * Lieske 1979, equations 6–7; see ERFA prec76/pmat76 and docs/coordinate-frames.md.
 * Same rotation as sky_engine_core::frames. No nutation or refraction; use GMST.
 */
export const J2000 = 2451545;
const DEG = Math.PI / 180;

interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/** Allocation-free rotation in standard equatorial XYZ axes; input may be out. */
export function precessInto(
  out: Vector3,
  x: number,
  y: number,
  z: number,
  jd: number,
  inverse = false,
): void {
  const t = (jd - J2000) / 36525;
  const scale = (t * DEG) / 3600;
  const zeta = (2306.2181 + (0.30188 + 0.017998 * t) * t) * scale;
  const zee = (2306.2181 + (1.09468 + 0.018203 * t) * t) * scale;
  const theta = (2004.3109 + (-0.42665 - 0.041833 * t) * t) * scale;
  const a = inverse ? -zee : zeta;
  const b = inverse ? theta : -theta;
  const c = inverse ? -zeta : zee;
  const x1 = Math.cos(a) * x - Math.sin(a) * y;
  const y1 = Math.sin(a) * x + Math.cos(a) * y;
  const x2 = Math.cos(b) * x1 + Math.sin(b) * z;
  out.x = Math.cos(c) * x2 - Math.sin(c) * y1;
  out.y = Math.sin(c) * x2 + Math.cos(c) * y1;
  out.z = -Math.sin(b) * x1 + Math.cos(b) * z;
}

// Synchronous scratch storage: per-frame coordinate reads need no temporary vectors.
const raDecVector = { x: 0, y: 0, z: 0 };

export function precessRaDec(
  ra: number,
  dec: number,
  jd: number,
  inverse = false,
  out = { ra: 0, dec: 0 },
): { ra: number; dec: number } {
  const cosDec = Math.cos(dec * DEG);
  const v = raDecVector;
  precessInto(
    v,
    cosDec * Math.cos(ra * DEG),
    cosDec * Math.sin(ra * DEG),
    Math.sin(dec * DEG),
    jd,
    inverse,
  );
  out.ra = (((Math.atan2(v.y, v.x) / DEG) % 360) + 360) % 360;
  out.dec = Math.atan2(v.z, Math.hypot(v.x, v.y)) / DEG;
  return out;
}

/**
 * A physical horizontal direction in the canonical J2000 Three.js map axes.
 * Writes into the supplied vector, including at geographic poles, with no allocation.
 * UTC JD is adequate here: its difference from TT affects precession by <0.001".
 */
export function horizontalDirectionInto(
  out: Vector3,
  altitude: number,
  azimuth: number,
  lst: number,
  latitude: number,
  jd: number,
): void {
  const sl = Math.sin(lst * DEG),
    cl = Math.cos(lst * DEG);
  const sp = Math.sin(latitude * DEG),
    cp = Math.cos(latitude * DEG);
  const up = Math.sin(altitude * DEG);
  const north = Math.cos(altitude * DEG) * Math.cos(azimuth * DEG);
  const east = Math.cos(altitude * DEG) * Math.sin(azimuth * DEG);
  precessInto(
    out,
    up * cp * cl - north * sp * cl - east * sl,
    up * cp * sl - north * sp * sl + east * cl,
    up * sp + north * cp,
    jd,
    true,
  );
  const eqY = out.y;
  out.x = -out.x;
  out.y = out.z;
  out.z = eqY;
}

export function julianDate(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}
