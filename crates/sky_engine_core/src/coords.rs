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

/// Aberration correction in ecliptic coordinates.
pub struct AberrationCorrection {
    /// Correction to ecliptic longitude in radians
    pub delta_longitude: f64,
    /// Correction to ecliptic latitude in radians
    pub delta_latitude: f64,
}

/// Constant of aberration (κ) in radians.
/// κ = 20.49552 arcseconds = v/c where v is Earth's mean orbital velocity
const ABERRATION_CONSTANT: f64 = 20.49552 * PI / (180.0 * 3600.0);

/// Compute annual aberration correction for a celestial body.
///
/// Annual aberration is the apparent shift in position due to Earth's orbital motion
/// combined with the finite speed of light. For the Sun, this amounts to about 20.5
/// arcseconds in longitude.
///
/// Based on Meeus, Astronomical Algorithms, Chapter 23.
///
/// # Arguments
/// * `sun_lon` - Sun's apparent ecliptic longitude in radians
/// * `obj_lon` - Object's ecliptic longitude in radians
/// * `obj_lat` - Object's ecliptic latitude in radians
/// * `jde` - Julian Date (Ephemeris)
///
/// # Returns
/// Aberration corrections to apply to the object's position
pub fn compute_aberration(sun_lon: f64, obj_lon: f64, obj_lat: f64, jde: f64) -> AberrationCorrection {
    // Julian centuries from J2000.0
    let t = (jde - 2451545.0) / 36525.0;

    // Earth's orbital eccentricity (Meeus, eq. 25.4)
    let e = 0.016708634 - 0.000042037 * t - 0.0000001267 * t * t;

    // Longitude of perihelion of Earth's orbit (Meeus, eq. 25.4)
    let pi_rad = (102.93735 + 1.71946 * t + 0.00046 * t * t) * PI / 180.0;

    let cos_sun_lon = sun_lon.cos();
    let sin_sun_lon = sun_lon.sin();
    let cos_obj_lon = obj_lon.cos();
    let sin_obj_lon = obj_lon.sin();
    let cos_lat = obj_lat.cos();
    let sin_lat = obj_lat.sin();
    let cos_pi = pi_rad.cos();
    let sin_pi = pi_rad.sin();

    // Aberration in longitude (Meeus, eq. 23.2)
    // Δλ = -κ * (cos(λ☉ - λ) + e * cos(π - λ)) / cos(β)
    let delta_lon = if cos_lat.abs() > 1e-10 {
        -ABERRATION_CONSTANT
            * ((cos_sun_lon * cos_obj_lon + sin_sun_lon * sin_obj_lon)
                + e * (cos_pi * cos_obj_lon + sin_pi * sin_obj_lon))
            / cos_lat
    } else {
        0.0
    };

    // Aberration in latitude (Meeus, eq. 23.2)
    // Δβ = -κ * sin(β) * (sin(λ☉ - λ) + e * sin(π - λ))
    let delta_lat = -ABERRATION_CONSTANT
        * sin_lat
        * ((sin_sun_lon * cos_obj_lon - cos_sun_lon * sin_obj_lon)
            + e * (sin_pi * cos_obj_lon - cos_pi * sin_obj_lon));

    AberrationCorrection {
        delta_longitude: delta_lon,
        delta_latitude: delta_lat,
    }
}

/// Earth's equatorial radius in kilometers.
const EARTH_RADIUS_KM: f64 = 6378.137;

/// Compute Greenwich Mean Sidereal Time (GMST) for a given Julian Date (UT1).
///
/// Returns GMST in radians, normalized to [0, 2π).
///
/// Based on the IAU 2006 precession model. The formula gives GMST in degrees,
/// which is then converted to radians.
///
/// # Arguments
/// * `jd_ut1` - Julian Date in UT1 time scale
///
/// Reference: Meeus, Astronomical Algorithms, Chapter 12
pub fn compute_gmst(jd_ut1: f64) -> f64 {
    // Julian centuries from J2000.0
    let t = (jd_ut1 - 2451545.0) / 36525.0;
    let t2 = t * t;
    let t3 = t2 * t;

    // GMST at 0h UT in degrees (Meeus eq. 12.4)
    // θ₀ = 280.46061837 + 360.98564736629 * (JD - 2451545.0)
    //      + 0.000387933 * T² - T³/38710000
    let gmst_deg = 280.46061837
        + 360.98564736629 * (jd_ut1 - 2451545.0)
        + 0.000387933 * t2
        - t3 / 38710000.0;

    // Normalize to [0, 360)
    let gmst_deg = gmst_deg.rem_euclid(360.0);

    // Convert to radians
    gmst_deg * PI / 180.0
}

/// Compute Local Sidereal Time (LST) from GMST and observer longitude.
///
/// # Arguments
/// * `gmst` - Greenwich Mean Sidereal Time in radians
/// * `longitude_rad` - Observer's longitude in radians (positive = East)
///
/// # Returns
/// LST in radians, normalized to [0, 2π)
pub fn compute_lst(gmst: f64, longitude_rad: f64) -> f64 {
    (gmst + longitude_rad).rem_euclid(2.0 * PI)
}

/// Topocentric correction values for parallax.
pub struct TopocentricCorrection {
    /// Correction to Right Ascension in radians
    pub delta_ra: f64,
    /// Correction to Declination in radians
    pub delta_dec: f64,
}

/// Compute topocentric parallax correction for the Moon.
///
/// This corrects the geocentric (Earth-center) position to the topocentric
/// (observer on Earth's surface) position. The Moon's horizontal parallax
/// is about 57 arcminutes (~1°), making this correction essential for
/// eclipse accuracy.
///
/// Based on Meeus, Astronomical Algorithms, Chapter 40.
///
/// # Arguments
/// * `ra_rad` - Geocentric Right Ascension in radians
/// * `dec_rad` - Geocentric Declination in radians
/// * `distance_km` - Distance to the Moon in kilometers
/// * `observer_lat_rad` - Observer's geodetic latitude in radians
/// * `observer_lon_rad` - Observer's longitude in radians (positive = East)
/// * `gmst` - Greenwich Mean Sidereal Time in radians
///
/// # Returns
/// Corrections to apply to RA and Dec to get topocentric position
pub fn compute_topocentric_correction(
    ra_rad: f64,
    dec_rad: f64,
    distance_km: f64,
    observer_lat_rad: f64,
    observer_lon_rad: f64,
    gmst: f64,
) -> TopocentricCorrection {
    // Compute the equatorial horizontal parallax
    // π = arcsin(Earth_radius / distance)
    let parallax = (EARTH_RADIUS_KM / distance_km).asin();

    // Local Sidereal Time
    let lst = compute_lst(gmst, observer_lon_rad);

    // Hour angle: H = LST - RA
    let hour_angle = lst - ra_rad;

    // For a spherical Earth approximation (good enough for ~1" accuracy):
    // ρ sin φ' ≈ sin φ  (geocentric latitude correction is small)
    // ρ cos φ' ≈ cos φ
    let sin_lat = observer_lat_rad.sin();
    let cos_lat = observer_lat_rad.cos();

    let sin_dec = dec_rad.sin();
    let cos_dec = dec_rad.cos();
    let sin_h = hour_angle.sin();
    let cos_h = hour_angle.cos();

    // Correction to RA (Meeus eq. 40.2)
    // Δα = -π × cos(φ) × sin(H) / cos(δ)
    let delta_ra = if cos_dec.abs() > 1e-10 {
        -parallax * cos_lat * sin_h / cos_dec
    } else {
        0.0
    };

    // Correction to Dec (Meeus eq. 40.2)
    // Δδ = -π × (sin(φ) × cos(δ) - cos(φ) × cos(H) × sin(δ))
    let delta_dec = -parallax * (sin_lat * cos_dec - cos_lat * cos_h * sin_dec);

    TopocentricCorrection { delta_ra, delta_dec }
}

/// Apply topocentric correction to get corrected RA/Dec.
///
/// # Arguments
/// * `ra_rad` - Geocentric Right Ascension in radians
/// * `dec_rad` - Geocentric Declination in radians
/// * `distance_km` - Distance to the Moon in kilometers
/// * `observer_lat_rad` - Observer's geodetic latitude in radians
/// * `observer_lon_rad` - Observer's longitude in radians (positive = East)
/// * `gmst` - Greenwich Mean Sidereal Time in radians
///
/// # Returns
/// (topocentric_ra, topocentric_dec) in radians
pub fn apply_topocentric_correction(
    ra_rad: f64,
    dec_rad: f64,
    distance_km: f64,
    observer_lat_rad: f64,
    observer_lon_rad: f64,
    gmst: f64,
) -> (f64, f64) {
    let correction = compute_topocentric_correction(
        ra_rad,
        dec_rad,
        distance_km,
        observer_lat_rad,
        observer_lon_rad,
        gmst,
    );

    let topo_ra = (ra_rad + correction.delta_ra).rem_euclid(2.0 * PI);
    let topo_dec = dec_rad + correction.delta_dec;

    (topo_ra, topo_dec)
}

/// Compute simplified aberration correction for the Sun.
///
/// For the Sun, the aberration correction is particularly simple because
/// Earth's velocity is nearly perpendicular to the Sun-Earth line.
/// The correction is approximately -20.5 arcseconds in longitude.
///
/// This uses a slightly more accurate formula that accounts for eccentricity.
/// Based on Meeus, Astronomical Algorithms, Chapter 25.
///
/// # Arguments
/// * `jde` - Julian Date (Ephemeris)
///
/// # Returns
/// Aberration correction to Sun's longitude in radians (always negative)
pub fn compute_sun_aberration(jde: f64) -> f64 {
    // Julian centuries from J2000.0
    let t = (jde - 2451545.0) / 36525.0;

    // Earth's orbital eccentricity
    let e = 0.016708634 - 0.000042037 * t - 0.0000001267 * t * t;

    // The Sun's aberration is approximately -κ(1 + e*cos(v))
    // where v is Earth's true anomaly. For simplicity, we use the mean value
    // which is very close since e is small (~0.017).
    // The variation due to eccentricity is only about ±0.34 arcseconds.
    -ABERRATION_CONSTANT * (1.0 + e)
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

    #[test]
    fn test_sun_aberration_constant() {
        // Sun aberration should be approximately -20.5 arcseconds
        let jde = 2451545.0; // J2000.0
        let aberration = compute_sun_aberration(jde);
        let aberration_arcsec = aberration * 180.0 * 3600.0 / PI;

        // Should be between -20 and -21 arcseconds
        assert!(
            aberration_arcsec > -21.0 && aberration_arcsec < -20.0,
            "Sun aberration should be ~-20.5\", got {}\"",
            aberration_arcsec
        );
    }

    #[test]
    fn test_aberration_magnitude() {
        // Test that aberration correction is in the expected range for a typical body
        let jde = 2451545.0; // J2000.0
        let sun_lon = 0.0; // Sun at vernal equinox
        let obj_lon = PI / 2.0; // Object 90° from Sun
        let obj_lat = 0.0; // On the ecliptic

        let correction = compute_aberration(sun_lon, obj_lon, obj_lat, jde);
        let delta_lon_arcsec = correction.delta_longitude * 180.0 * 3600.0 / PI;

        // For an object 90° from the Sun, aberration should be approximately -20.5"
        assert!(
            delta_lon_arcsec.abs() < 25.0,
            "Aberration should be reasonable, got {}\"",
            delta_lon_arcsec
        );
    }

    #[test]
    fn test_aberration_varies_with_position() {
        // Aberration depends on angular distance from Sun
        let jde = 2451545.0;
        let sun_lon = 0.0;

        // Object in same direction as Sun (0°) vs opposite (180°)
        let corr_same = compute_aberration(sun_lon, 0.0, 0.0, jde);
        let corr_opp = compute_aberration(sun_lon, PI, 0.0, jde);

        // These should have different magnitudes
        assert!(
            (corr_same.delta_longitude - corr_opp.delta_longitude).abs() > 0.0001,
            "Aberration should vary with angular position"
        );
    }
}
