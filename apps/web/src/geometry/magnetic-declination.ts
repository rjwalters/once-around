/**
 * Magnetic Declination (World Magnetic Model 2025)
 *
 * Computes the angle between magnetic north and true north for a given
 * location and date, used to correct compass-derived azimuths (device
 * orientation sensors reference magnetic north) to true-north azimuths.
 *
 * Implements the standard WMM spherical-harmonic evaluation (degree/order 12)
 * from the NOAA/NCEI WMM-2025 model, epoch 2025.0, valid 2025.0–2030.0.
 * Declination is accurate to ~0.5° (the model's stated global accuracy).
 *
 * Pure math with embedded coefficients so it can be unit tested independently;
 * validated against the official NOAA WMM2025 test values.
 */

const WMM_EPOCH = 2025.0;
const WMM_MAX_ORDER = 12;

// WMM-2025 Gauss coefficients: [n, m, g (nT), h (nT), dg (nT/yr), dh (nT/yr)]
const WMM_COEFFICIENTS: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [1, 0, -29351.8, 0.0, 12.0, 0.0],
  [1, 1, -1410.8, 4545.4, 9.7, -21.5],
  [2, 0, -2556.6, 0.0, -11.6, 0.0],
  [2, 1, 2951.1, -3133.6, -5.2, -27.7],
  [2, 2, 1649.3, -815.1, -8.0, -12.1],
  [3, 0, 1361.0, 0.0, -1.3, 0.0],
  [3, 1, -2404.1, -56.6, -4.2, 4.0],
  [3, 2, 1243.8, 237.5, 0.4, -0.3],
  [3, 3, 453.6, -549.5, -15.6, -4.1],
  [4, 0, 895.0, 0.0, -1.6, 0.0],
  [4, 1, 799.5, 278.6, -2.4, -1.1],
  [4, 2, 55.7, -133.9, -6.0, 4.1],
  [4, 3, -281.1, 212.0, 5.6, 1.6],
  [4, 4, 12.1, -375.6, -7.0, -4.4],
  [5, 0, -233.2, 0.0, 0.6, 0.0],
  [5, 1, 368.9, 45.4, 1.4, -0.5],
  [5, 2, 187.2, 220.2, 0.0, 2.2],
  [5, 3, -138.7, -122.9, 0.6, 0.4],
  [5, 4, -142.0, 43.0, 2.2, 1.7],
  [5, 5, 20.9, 106.1, 0.9, 1.9],
  [6, 0, 64.4, 0.0, -0.2, 0.0],
  [6, 1, 63.8, -18.4, -0.4, 0.3],
  [6, 2, 76.9, 16.8, 0.9, -1.6],
  [6, 3, -115.7, 48.8, 1.2, -0.4],
  [6, 4, -40.9, -59.8, -0.9, 0.9],
  [6, 5, 14.9, 10.9, 0.3, 0.7],
  [6, 6, -60.7, 72.7, 0.9, 0.9],
  [7, 0, 79.5, 0.0, 0.0, 0.0],
  [7, 1, -77.0, -48.9, -0.1, 0.6],
  [7, 2, -8.8, -14.4, -0.1, 0.5],
  [7, 3, 59.3, -1.0, 0.5, -0.8],
  [7, 4, 15.8, 23.4, -0.1, 0.0],
  [7, 5, 2.5, -7.4, -0.8, -1.0],
  [7, 6, -11.1, -25.1, -0.8, 0.6],
  [7, 7, 14.2, -2.3, 0.8, -0.2],
  [8, 0, 23.2, 0.0, -0.1, 0.0],
  [8, 1, 10.8, 7.1, 0.2, -0.2],
  [8, 2, -17.5, -12.6, 0.0, 0.5],
  [8, 3, 2.0, 11.4, 0.5, -0.4],
  [8, 4, -21.7, -9.7, -0.1, 0.4],
  [8, 5, 16.9, 12.7, 0.3, -0.5],
  [8, 6, 15.0, 0.7, 0.2, -0.6],
  [8, 7, -16.8, -5.2, 0.0, 0.3],
  [8, 8, 0.9, 3.9, 0.2, 0.2],
  [9, 0, 4.6, 0.0, 0.0, 0.0],
  [9, 1, 7.8, -24.8, -0.1, -0.3],
  [9, 2, 3.0, 12.2, 0.1, 0.3],
  [9, 3, -0.2, 8.3, 0.3, -0.3],
  [9, 4, -2.5, -3.3, -0.3, 0.3],
  [9, 5, -13.1, -5.2, 0.0, 0.2],
  [9, 6, 2.4, 7.2, 0.3, -0.1],
  [9, 7, 8.6, -0.6, -0.1, -0.2],
  [9, 8, -8.7, 0.8, 0.1, 0.4],
  [9, 9, -12.9, 10.0, -0.1, 0.1],
  [10, 0, -1.3, 0.0, 0.1, 0.0],
  [10, 1, -6.4, 3.3, 0.0, 0.0],
  [10, 2, 0.2, 0.0, 0.1, 0.0],
  [10, 3, 2.0, 2.4, 0.1, -0.2],
  [10, 4, -1.0, 5.3, 0.0, 0.1],
  [10, 5, -0.6, -9.1, -0.3, -0.1],
  [10, 6, -0.9, 0.4, 0.0, 0.1],
  [10, 7, 1.5, -4.2, -0.1, 0.0],
  [10, 8, 0.9, -3.8, -0.1, -0.1],
  [10, 9, -2.7, 0.9, 0.0, 0.2],
  [10, 10, -3.9, -9.1, 0.0, 0.0],
  [11, 0, 2.9, 0.0, 0.0, 0.0],
  [11, 1, -1.5, 0.0, 0.0, 0.0],
  [11, 2, -2.5, 2.9, 0.0, 0.1],
  [11, 3, 2.4, -0.6, 0.0, 0.0],
  [11, 4, -0.6, 0.2, 0.0, 0.1],
  [11, 5, -0.1, 0.5, -0.1, 0.0],
  [11, 6, -0.6, -0.3, 0.0, 0.0],
  [11, 7, -0.1, -1.2, 0.0, 0.1],
  [11, 8, 1.1, -1.7, -0.1, 0.0],
  [11, 9, -1.0, -2.9, -0.1, 0.0],
  [11, 10, -0.2, -1.8, -0.1, 0.0],
  [11, 11, 2.6, -2.3, -0.1, 0.0],
  [12, 0, -2.0, 0.0, 0.0, 0.0],
  [12, 1, -0.2, -1.3, 0.0, 0.0],
  [12, 2, 0.3, 0.7, 0.0, 0.0],
  [12, 3, 1.2, 1.0, 0.0, -0.1],
  [12, 4, -1.3, -1.4, 0.0, 0.1],
  [12, 5, 0.6, 0.0, -0.0, 0.0],
  [12, 6, 0.6, 0.6, 0.1, 0.0],
  [12, 7, 0.5, -0.1, 0.0, 0.0],
  [12, 8, -0.1, 0.8, 0.0, 0.0],
  [12, 9, -0.4, 0.1, 0.0, 0.0],
  [12, 10, -0.2, -1.0, -0.1, 0.0],
  [12, 11, -1.3, 0.1, 0.0, 0.0],
  [12, 12, -0.7, 0.2, -0.1, -0.1],
];

// WGS84 ellipsoid (km) and geomagnetic reference radius
const WGS84_A = 6378.137;
const WGS84_B = 6356.7523142;
const GEOMAG_RE = 6371.2;

/** Convert a Date to a decimal year (e.g. 2026-07-01 → ~2026.5). */
export function decimalYear(date: Date): number {
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return year + (date.getTime() - start) / (end - start);
}

/**
 * Magnetic declination in degrees (east positive) at a geodetic location.
 *
 * True azimuth = magnetic (compass) azimuth + declination.
 *
 * @param latDeg     Geodetic latitude, degrees
 * @param lonDeg     Longitude, degrees (east positive)
 * @param date       Date of observation (clamped to the model's 2025–2030 validity)
 * @param altitudeKm Height above the WGS84 ellipsoid in km (default sea level)
 */
export function magneticDeclination(
  latDeg: number,
  lonDeg: number,
  date: Date,
  altitudeKm = 0
): number {
  // Time-adjust coefficients via secular variation, clamped to model validity
  const dt = Math.min(5, Math.max(0, decimalYear(date) - WMM_EPOCH));
  const g: number[][] = [];
  const h: number[][] = [];
  for (let n = 0; n <= WMM_MAX_ORDER; n++) {
    g.push(new Array(n + 1).fill(0));
    h.push(new Array(n + 1).fill(0));
  }
  for (const [n, m, gnm, hnm, dgnm, dhnm] of WMM_COEFFICIENTS) {
    g[n][m] = gnm + dt * dgnm;
    h[n][m] = hnm + dt * dhnm;
  }

  // Geodetic → geocentric spherical coordinates (WGS84)
  const latRad = (latDeg * Math.PI) / 180;
  const lonRad = (lonDeg * Math.PI) / 180;
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const a2 = WGS84_A * WGS84_A;
  const b2 = WGS84_B * WGS84_B;
  // Radius of curvature in the prime vertical and surface point coordinates
  const rho = Math.sqrt(a2 * cosLat * cosLat + b2 * sinLat * sinLat);
  const rKm = Math.sqrt(
    altitudeKm * altitudeKm +
      2 * altitudeKm * rho +
      (a2 * a2 * cosLat * cosLat + b2 * b2 * sinLat * sinLat) / (rho * rho)
  );
  // Geocentric latitude
  const geocLat = Math.atan2(
    (b2 / (rho * rho)) * rho * sinLat + altitudeKm * sinLat,
    (a2 / (rho * rho)) * rho * cosLat + altitudeKm * cosLat
  );

  // Colatitude for the harmonic expansion
  const ct = Math.sin(geocLat); // cos(theta), theta = geocentric colatitude
  const stRaw = Math.cos(geocLat);
  const st = Math.max(stRaw, 1e-10); // guard the east-component pole singularity

  // Schmidt semi-normalized associated Legendre functions P[n][m](cos theta)
  // and their theta-derivatives, by standard recursion
  const P: number[][] = [];
  const dP: number[][] = [];
  for (let n = 0; n <= WMM_MAX_ORDER; n++) {
    P.push(new Array(n + 1).fill(0));
    dP.push(new Array(n + 1).fill(0));
  }
  P[0][0] = 1;
  dP[0][0] = 0;
  for (let n = 1; n <= WMM_MAX_ORDER; n++) {
    for (let m = 0; m <= n; m++) {
      if (n === m) {
        if (n === 1) {
          P[1][1] = stRaw;
          dP[1][1] = ct;
        } else {
          const kFactor = Math.sqrt((2 * n - 1) / (2 * n));
          P[n][n] = kFactor * stRaw * P[n - 1][n - 1];
          dP[n][n] = kFactor * (stRaw * dP[n - 1][n - 1] + ct * P[n - 1][n - 1]);
        }
      } else {
        const norm = Math.sqrt(n * n - m * m);
        const prev2P = n - 2 >= m ? P[n - 2][m] : 0;
        const prev2dP = n - 2 >= m ? dP[n - 2][m] : 0;
        P[n][m] =
          ((2 * n - 1) * ct * P[n - 1][m] - Math.sqrt((n - 1) * (n - 1) - m * m) * prev2P) / norm;
        dP[n][m] =
          ((2 * n - 1) * (ct * dP[n - 1][m] - stRaw * P[n - 1][m]) -
            Math.sqrt((n - 1) * (n - 1) - m * m) * prev2dP) /
          norm;
      }
    }
  }

  // Sum the harmonic series for the geocentric field components
  const cosMLon: number[] = [1];
  const sinMLon: number[] = [0];
  for (let m = 1; m <= WMM_MAX_ORDER; m++) {
    cosMLon.push(Math.cos(m * lonRad));
    sinMLon.push(Math.sin(m * lonRad));
  }

  let br = 0; // radial (outward)
  let bt = 0; // theta (southward)
  let bp = 0; // phi (eastward)
  const ar = GEOMAG_RE / rKm;
  let arn = ar * ar; // (re/r)^(n+2) starting at n=1
  for (let n = 1; n <= WMM_MAX_ORDER; n++) {
    arn *= ar;
    for (let m = 0; m <= n; m++) {
      const gc = g[n][m] * cosMLon[m] + h[n][m] * sinMLon[m];
      const gs = g[n][m] * sinMLon[m] - h[n][m] * cosMLon[m];
      br += arn * (n + 1) * gc * P[n][m];
      bt -= arn * gc * dP[n][m];
      bp += (arn * m * gs * P[n][m]) / st;
    }
  }

  // Geocentric spherical → local geodetic components.
  // North/east/down in the geocentric frame:
  const northGeoc = -bt;
  const eastGeoc = bp;
  const downGeoc = -br;
  // Rotate about the east axis by the angle between the geocentric radial and
  // the geodetic vertical (the ellipsoid normal tilts poleward by psi)
  const psi = latRad - geocLat;
  const north = northGeoc * Math.cos(psi) + downGeoc * Math.sin(psi);
  const east = eastGeoc;

  return (Math.atan2(east, north) * 180) / Math.PI;
}
