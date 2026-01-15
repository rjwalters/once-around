use std::f64::consts::PI;

/// A 3D Cartesian coordinate representing a unit vector direction.
#[derive(Debug, Clone, Copy, Default)]
pub struct CartesianCoord {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl CartesianCoord {
    pub fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }

    /// Create from spherical coordinates (RA in hours, Dec in degrees).
    pub fn from_ra_dec_hours_deg(ra_hours: f64, dec_deg: f64) -> Self {
        let ra_rad = ra_hours * PI / 12.0;
        let dec_rad = dec_deg * PI / 180.0;
        ra_dec_to_cartesian(ra_rad, dec_rad)
    }

    /// Create from spherical coordinates (both in radians).
    pub fn from_ra_dec_rad(ra_rad: f64, dec_rad: f64) -> Self {
        ra_dec_to_cartesian(ra_rad, dec_rad)
    }

    /// Normalize to unit vector.
    pub fn normalize(&self) -> Self {
        let len = (self.x * self.x + self.y * self.y + self.z * self.z).sqrt();
        if len > 0.0 {
            Self {
                x: self.x / len,
                y: self.y / len,
                z: self.z / len,
            }
        } else {
            *self
        }
    }

    /// Convert to f32 tuple for buffer output.
    pub fn to_f32(&self) -> (f32, f32, f32) {
        (self.x as f32, self.y as f32, self.z as f32)
    }
}

/// Convert Right Ascension and Declination (in radians) to Cartesian unit vector.
///
/// Coordinate system:
/// - X axis points toward RA=0, Dec=0 (vernal equinox)
/// - Y axis points toward RA=6h, Dec=0
/// - Z axis points toward Dec=+90 (north celestial pole)
///
/// This matches the standard J2000 equatorial coordinate system.
pub fn ra_dec_to_cartesian(ra_rad: f64, dec_rad: f64) -> CartesianCoord {
    let cos_dec = dec_rad.cos();
    CartesianCoord {
        x: cos_dec * ra_rad.cos(),
        y: cos_dec * ra_rad.sin(),
        z: dec_rad.sin(),
    }
}

/// Convert Cartesian coordinates back to RA/Dec (in radians).
pub fn cartesian_to_ra_dec(coord: &CartesianCoord) -> (f64, f64) {
    let r = (coord.x * coord.x + coord.y * coord.y + coord.z * coord.z).sqrt();
    if r == 0.0 {
        return (0.0, 0.0);
    }

    let dec = (coord.z / r).asin();
    let mut ra = coord.y.atan2(coord.x);
    if ra < 0.0 {
        ra += 2.0 * PI;
    }

    (ra, dec)
}

/// Convert ecliptic coordinates to equatorial coordinates.
/// Obliquity is the axial tilt of Earth (about 23.4 degrees for J2000).
pub fn ecliptic_to_equatorial(
    lon_rad: f64,
    lat_rad: f64,
    obliquity_rad: f64,
) -> CartesianCoord {
    let cos_lat = lat_rad.cos();
    let sin_lat = lat_rad.sin();
    let cos_lon = lon_rad.cos();
    let sin_lon = lon_rad.sin();
    let cos_eps = obliquity_rad.cos();
    let sin_eps = obliquity_rad.sin();

    // Convert ecliptic to equatorial
    let x = cos_lat * cos_lon;
    let y = cos_lat * sin_lon * cos_eps - sin_lat * sin_eps;
    let z = cos_lat * sin_lon * sin_eps + sin_lat * cos_eps;

    CartesianCoord::new(x, y, z)
}

/// Mean obliquity of the ecliptic at J2000.0 in radians.
pub const OBLIQUITY_J2000: f64 = 0.4090928042223415; // 23.439291111 degrees

/// Compute mean obliquity of the ecliptic for a given Julian Date.
/// Uses the IAU 2006 precession model (Meeus, Astronomical Algorithms, eq. 22.3).
/// Returns obliquity in radians.
pub fn mean_obliquity(jde: f64) -> f64 {
    // Julian centuries from J2000.0
    let t = (jde - 2451545.0) / 36525.0;
    let t2 = t * t;
    let t3 = t2 * t;
    let t4 = t3 * t;
    let t5 = t4 * t;

    // Mean obliquity in arcseconds (IAU 2006)
    // ε₀ = 84381.406" - 46.836769"T - 0.0001831"T² + 0.00200340"T³
    //      - 0.000000576"T⁴ - 0.0000000434"T⁵
    let eps0_arcsec = 84381.406 - 46.836769 * t - 0.0001831 * t2 + 0.00200340 * t3
        - 0.000000576 * t4 - 0.0000000434 * t5;

    // Convert arcseconds to radians
    eps0_arcsec * PI / (180.0 * 3600.0)
}

/// Nutation values (Δψ and Δε)
pub struct Nutation {
    /// Nutation in longitude (Δψ) in radians
    pub delta_psi: f64,
    /// Nutation in obliquity (Δε) in radians
    pub delta_epsilon: f64,
}

/// Compute nutation in longitude and obliquity for a given Julian Date.
/// Uses the IAU 1980 nutation theory with the main terms from Meeus Table 22.A.
/// This provides accuracy of about 0.5 arcseconds for most applications.
pub fn compute_nutation(jde: f64) -> Nutation {
    // Julian centuries from J2000.0
    let t = (jde - 2451545.0) / 36525.0;
    let t2 = t * t;
    let t3 = t2 * t;

    // Fundamental arguments (in degrees)
    // Mean elongation of Moon from Sun
    let d = 297.85036 + 445267.111480 * t - 0.0019142 * t2 + t3 / 189474.0;

    // Mean anomaly of Sun (Earth)
    let m = 357.52772 + 35999.050340 * t - 0.0001603 * t2 - t3 / 300000.0;

    // Mean anomaly of Moon
    let m_prime = 134.96298 + 477198.867398 * t + 0.0086972 * t2 + t3 / 56250.0;

    // Moon's argument of latitude
    let f = 93.27191 + 483202.017538 * t - 0.0036825 * t2 + t3 / 327270.0;

    // Longitude of ascending node of Moon's mean orbit
    let omega = 125.04452 - 1934.136261 * t + 0.0020708 * t2 + t3 / 450000.0;

    // Convert to radians
    let d = d * PI / 180.0;
    let m = m * PI / 180.0;
    let m_prime = m_prime * PI / 180.0;
    let f = f * PI / 180.0;
    let omega = omega * PI / 180.0;

    // Main nutation terms from Meeus Table 22.A
    // Each row: [D, M, M', F, Ω, sin_coeff0, sin_coeff1, cos_coeff0, cos_coeff1]
    // Coefficients are in units of 0.0001 arcseconds
    let terms: [(f64, f64, f64, f64, f64, f64, f64, f64, f64); 63] = [
        (0.0, 0.0, 0.0, 0.0, 1.0, -171996.0, -174.2, 92025.0, 8.9),
        (-2.0, 0.0, 0.0, 2.0, 2.0, -13187.0, -1.6, 5736.0, -3.1),
        (0.0, 0.0, 0.0, 2.0, 2.0, -2274.0, -0.2, 977.0, -0.5),
        (0.0, 0.0, 0.0, 0.0, 2.0, 2062.0, 0.2, -895.0, 0.5),
        (0.0, 1.0, 0.0, 0.0, 0.0, 1426.0, -3.4, 54.0, -0.1),
        (0.0, 0.0, 1.0, 0.0, 0.0, 712.0, 0.1, -7.0, 0.0),
        (-2.0, 1.0, 0.0, 2.0, 2.0, -517.0, 1.2, 224.0, -0.6),
        (0.0, 0.0, 0.0, 2.0, 1.0, -386.0, -0.4, 200.0, 0.0),
        (0.0, 0.0, 1.0, 2.0, 2.0, -301.0, 0.0, 129.0, -0.1),
        (-2.0, -1.0, 0.0, 2.0, 2.0, 217.0, -0.5, -95.0, 0.3),
        (-2.0, 0.0, 1.0, 0.0, 0.0, -158.0, 0.0, 0.0, 0.0),
        (-2.0, 0.0, 0.0, 2.0, 1.0, 129.0, 0.1, -70.0, 0.0),
        (0.0, 0.0, -1.0, 2.0, 2.0, 123.0, 0.0, -53.0, 0.0),
        (2.0, 0.0, 0.0, 0.0, 0.0, 63.0, 0.0, 0.0, 0.0),
        (0.0, 0.0, 1.0, 0.0, 1.0, 63.0, 0.1, -33.0, 0.0),
        (2.0, 0.0, -1.0, 2.0, 2.0, -59.0, 0.0, 26.0, 0.0),
        (0.0, 0.0, -1.0, 0.0, 1.0, -58.0, -0.1, 32.0, 0.0),
        (0.0, 0.0, 1.0, 2.0, 1.0, -51.0, 0.0, 27.0, 0.0),
        (-2.0, 0.0, 2.0, 0.0, 0.0, 48.0, 0.0, 0.0, 0.0),
        (0.0, 0.0, -2.0, 2.0, 1.0, 46.0, 0.0, -24.0, 0.0),
        (2.0, 0.0, 0.0, 2.0, 2.0, -38.0, 0.0, 16.0, 0.0),
        (0.0, 0.0, 2.0, 2.0, 2.0, -31.0, 0.0, 13.0, 0.0),
        (0.0, 0.0, 2.0, 0.0, 0.0, 29.0, 0.0, 0.0, 0.0),
        (-2.0, 0.0, 1.0, 2.0, 2.0, 29.0, 0.0, -12.0, 0.0),
        (0.0, 0.0, 0.0, 2.0, 0.0, 26.0, 0.0, 0.0, 0.0),
        (-2.0, 0.0, 0.0, 2.0, 0.0, -22.0, 0.0, 0.0, 0.0),
        (0.0, 0.0, -1.0, 2.0, 1.0, 21.0, 0.0, -10.0, 0.0),
        (0.0, 2.0, 0.0, 0.0, 0.0, 17.0, -0.1, 0.0, 0.0),
        (2.0, 0.0, -1.0, 0.0, 1.0, 16.0, 0.0, -8.0, 0.0),
        (-2.0, 2.0, 0.0, 2.0, 2.0, -16.0, 0.1, 7.0, 0.0),
        (0.0, 1.0, 0.0, 0.0, 1.0, -15.0, 0.0, 9.0, 0.0),
        (-2.0, 0.0, 1.0, 0.0, 1.0, -13.0, 0.0, 7.0, 0.0),
        (0.0, -1.0, 0.0, 0.0, 1.0, -12.0, 0.0, 6.0, 0.0),
        (0.0, 0.0, 2.0, -2.0, 0.0, 11.0, 0.0, 0.0, 0.0),
        (2.0, 0.0, -1.0, 2.0, 1.0, -10.0, 0.0, 5.0, 0.0),
        (2.0, 0.0, 1.0, 2.0, 2.0, -8.0, 0.0, 3.0, 0.0),
        (0.0, 1.0, 0.0, 2.0, 2.0, 7.0, 0.0, -3.0, 0.0),
        (-2.0, 1.0, 1.0, 0.0, 0.0, -7.0, 0.0, 0.0, 0.0),
        (0.0, -1.0, 0.0, 2.0, 2.0, -7.0, 0.0, 3.0, 0.0),
        (2.0, 0.0, 0.0, 2.0, 1.0, -7.0, 0.0, 3.0, 0.0),
        (2.0, 0.0, 1.0, 0.0, 0.0, 6.0, 0.0, 0.0, 0.0),
        (-2.0, 0.0, 2.0, 2.0, 2.0, 6.0, 0.0, -3.0, 0.0),
        (-2.0, 0.0, 1.0, 2.0, 1.0, 6.0, 0.0, -3.0, 0.0),
        (2.0, 0.0, -2.0, 0.0, 1.0, -6.0, 0.0, 3.0, 0.0),
        (2.0, 0.0, 0.0, 0.0, 1.0, -6.0, 0.0, 3.0, 0.0),
        (0.0, -1.0, 1.0, 0.0, 0.0, 5.0, 0.0, 0.0, 0.0),
        (-2.0, -1.0, 0.0, 2.0, 1.0, -5.0, 0.0, 3.0, 0.0),
        (-2.0, 0.0, 0.0, 0.0, 1.0, -5.0, 0.0, 3.0, 0.0),
        (0.0, 0.0, 2.0, 2.0, 1.0, -5.0, 0.0, 3.0, 0.0),
        (-2.0, 0.0, 2.0, 0.0, 1.0, 4.0, 0.0, 0.0, 0.0),
        (-2.0, 1.0, 0.0, 2.0, 1.0, 4.0, 0.0, 0.0, 0.0),
        (0.0, 0.0, 1.0, -2.0, 0.0, 4.0, 0.0, 0.0, 0.0),
        (-1.0, 0.0, 1.0, 0.0, 0.0, -4.0, 0.0, 0.0, 0.0),
        (-2.0, 1.0, 0.0, 0.0, 0.0, -4.0, 0.0, 0.0, 0.0),
        (1.0, 0.0, 0.0, 0.0, 0.0, -4.0, 0.0, 0.0, 0.0),
        (0.0, 0.0, 1.0, 2.0, 0.0, 3.0, 0.0, 0.0, 0.0),
        (0.0, 0.0, -2.0, 2.0, 2.0, -3.0, 0.0, 0.0, 0.0),
        (-1.0, -1.0, 1.0, 0.0, 0.0, -3.0, 0.0, 0.0, 0.0),
        (0.0, 1.0, 1.0, 0.0, 0.0, -3.0, 0.0, 0.0, 0.0),
        (0.0, -1.0, 1.0, 2.0, 2.0, -3.0, 0.0, 0.0, 0.0),
        (2.0, -1.0, -1.0, 2.0, 2.0, -3.0, 0.0, 0.0, 0.0),
        (0.0, 0.0, 3.0, 2.0, 2.0, -3.0, 0.0, 0.0, 0.0),
        (2.0, -1.0, 0.0, 2.0, 2.0, -3.0, 0.0, 0.0, 0.0),
    ];

    let mut delta_psi = 0.0;
    let mut delta_epsilon = 0.0;

    for (d_mult, m_mult, mp_mult, f_mult, om_mult, sin0, sin1, cos0, cos1) in terms {
        let arg = d_mult * d + m_mult * m + mp_mult * m_prime + f_mult * f + om_mult * omega;
        delta_psi += (sin0 + sin1 * t) * arg.sin();
        delta_epsilon += (cos0 + cos1 * t) * arg.cos();
    }

    // Convert from 0.0001 arcseconds to radians
    let arcsec_to_rad = PI / (180.0 * 3600.0);
    delta_psi *= 0.0001 * arcsec_to_rad;
    delta_epsilon *= 0.0001 * arcsec_to_rad;

    Nutation {
        delta_psi,
        delta_epsilon,
    }
}

/// Compute true obliquity of the ecliptic for a given Julian Date.
/// True obliquity = mean obliquity + nutation in obliquity.
/// Returns obliquity in radians.
pub fn true_obliquity(jde: f64) -> f64 {
    let eps0 = mean_obliquity(jde);
    let nutation = compute_nutation(jde);
    eps0 + nutation.delta_epsilon
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vernal_equinox() {
        // RA=0, Dec=0 should give (1, 0, 0)
        let coord = ra_dec_to_cartesian(0.0, 0.0);
        assert!((coord.x - 1.0).abs() < 1e-10);
        assert!(coord.y.abs() < 1e-10);
        assert!(coord.z.abs() < 1e-10);
    }

    #[test]
    fn test_north_pole() {
        // Dec=+90 should give (0, 0, 1)
        let coord = ra_dec_to_cartesian(0.0, PI / 2.0);
        assert!(coord.x.abs() < 1e-10);
        assert!(coord.y.abs() < 1e-10);
        assert!((coord.z - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_ra_6h() {
        // RA=6h (PI/2 radians), Dec=0 should give (0, 1, 0)
        let coord = ra_dec_to_cartesian(PI / 2.0, 0.0);
        assert!(coord.x.abs() < 1e-10);
        assert!((coord.y - 1.0).abs() < 1e-10);
        assert!(coord.z.abs() < 1e-10);
    }

    #[test]
    fn test_roundtrip() {
        let ra = 1.234;
        let dec = 0.567;
        let coord = ra_dec_to_cartesian(ra, dec);
        let (ra2, dec2) = cartesian_to_ra_dec(&coord);
        assert!((ra - ra2).abs() < 1e-10);
        assert!((dec - dec2).abs() < 1e-10);
    }

    #[test]
    fn test_mean_obliquity_j2000() {
        // At J2000.0, mean obliquity should be close to 23.4392911 degrees
        let jde_j2000 = 2451545.0;
        let eps = mean_obliquity(jde_j2000);
        let eps_deg = eps * 180.0 / PI;
        // IAU 2006 value at J2000.0 is 84381.406 arcseconds = 23.4392794 degrees
        assert!(
            (eps_deg - 23.4392794).abs() < 0.0001,
            "Mean obliquity at J2000.0 should be ~23.44 degrees, got {}",
            eps_deg
        );
    }

    #[test]
    fn test_nutation_meeus_example() {
        // Test nutation against Meeus example (Chapter 22, Example 22.a)
        // April 10, 1987, 0h TDB -> JDE = 2446895.5
        let jde = 2446895.5;
        let nutation = compute_nutation(jde);

        // Expected values from Meeus: Δψ = -3.788" and Δε = +9.443"
        let delta_psi_arcsec = nutation.delta_psi * 180.0 * 3600.0 / PI;
        let delta_eps_arcsec = nutation.delta_epsilon * 180.0 * 3600.0 / PI;

        // Allow tolerance of about 0.5" for simplified calculation
        assert!(
            (delta_psi_arcsec - (-3.788)).abs() < 0.5,
            "Δψ should be ~-3.788\", got {}\"",
            delta_psi_arcsec
        );
        assert!(
            (delta_eps_arcsec - 9.443).abs() < 0.5,
            "Δε should be ~+9.443\", got {}\"",
            delta_eps_arcsec
        );
    }

    #[test]
    fn test_true_obliquity_range() {
        // True obliquity should be within about 10 arcseconds of mean obliquity
        // (nutation in obliquity is typically < 10")
        let jde = 2451545.0; // J2000.0
        let mean = mean_obliquity(jde);
        let true_obl = true_obliquity(jde);
        let diff_arcsec = (true_obl - mean).abs() * 180.0 * 3600.0 / PI;
        assert!(
            diff_arcsec < 20.0,
            "Nutation in obliquity should be < 20\", got {}\"",
            diff_arcsec
        );
    }
}
