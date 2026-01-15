use crate::coords::{ecliptic_to_equatorial, true_obliquity, CartesianCoord, OBLIQUITY_J2000};
use crate::time::SkyTime;
use std::f64::consts::PI;
use vsop87::vsop87a;

// Planet and Sun radii in km (IAU values)
pub const SUN_RADIUS_KM: f64 = 696340.0;
pub const MERCURY_RADIUS_KM: f64 = 2439.7;
pub const VENUS_RADIUS_KM: f64 = 6051.8;
pub const MARS_RADIUS_KM: f64 = 3389.5;
pub const JUPITER_RADIUS_KM: f64 = 69911.0;
pub const SATURN_RADIUS_KM: f64 = 58232.0;
pub const URANUS_RADIUS_KM: f64 = 25362.0;
pub const NEPTUNE_RADIUS_KM: f64 = 24622.0;

/// Conversion factor from AU to km
pub const AU_TO_KM: f64 = 149_597_870.7;

/// Planets supported by the engine.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Planet {
    Mercury = 0,
    Venus = 1,
    Earth = 2,
    Mars = 3,
    Jupiter = 4,
    Saturn = 5,
    Uranus = 6,
    Neptune = 7,
}

impl Planet {
    /// All planets in order from the Sun.
    pub const ALL: [Planet; 8] = [
        Planet::Mercury,
        Planet::Venus,
        Planet::Earth,
        Planet::Mars,
        Planet::Jupiter,
        Planet::Saturn,
        Planet::Uranus,
        Planet::Neptune,
    ];

    /// All planets visible to naked eye (excluding Earth).
    pub const VISIBLE: [Planet; 5] = [
        Planet::Mercury,
        Planet::Venus,
        Planet::Mars,
        Planet::Jupiter,
        Planet::Saturn,
    ];

    /// Get planet name.
    pub fn name(&self) -> &'static str {
        match self {
            Planet::Mercury => "Mercury",
            Planet::Venus => "Venus",
            Planet::Earth => "Earth",
            Planet::Mars => "Mars",
            Planet::Jupiter => "Jupiter",
            Planet::Saturn => "Saturn",
            Planet::Uranus => "Uranus",
            Planet::Neptune => "Neptune",
        }
    }
}

/// Celestial bodies visible in the sky (planets + Sun + Moon).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum CelestialBody {
    Sun = 0,
    Moon = 1,
    Mercury = 2,
    Venus = 3,
    Mars = 4,
    Jupiter = 5,
    Saturn = 6,
    Uranus = 7,
    Neptune = 8,
}

impl CelestialBody {
    /// All visible celestial bodies in display order.
    pub const ALL: [CelestialBody; 9] = [
        CelestialBody::Sun,
        CelestialBody::Moon,
        CelestialBody::Mercury,
        CelestialBody::Venus,
        CelestialBody::Mars,
        CelestialBody::Jupiter,
        CelestialBody::Saturn,
        CelestialBody::Uranus,
        CelestialBody::Neptune,
    ];

    /// Get body name.
    pub fn name(&self) -> &'static str {
        match self {
            CelestialBody::Sun => "Sun",
            CelestialBody::Moon => "Moon",
            CelestialBody::Mercury => "Mercury",
            CelestialBody::Venus => "Venus",
            CelestialBody::Mars => "Mars",
            CelestialBody::Jupiter => "Jupiter",
            CelestialBody::Saturn => "Saturn",
            CelestialBody::Uranus => "Uranus",
            CelestialBody::Neptune => "Neptune",
        }
    }
}

/// Compute heliocentric position of a planet using VSOP87A.
/// Returns (x, y, z) in AU, ecliptic coordinates.
fn heliocentric_position(planet: Planet, jde: f64) -> (f64, f64, f64) {
    let coords = match planet {
        Planet::Mercury => vsop87a::mercury(jde),
        Planet::Venus => vsop87a::venus(jde),
        Planet::Earth => vsop87a::earth(jde),
        Planet::Mars => vsop87a::mars(jde),
        Planet::Jupiter => vsop87a::jupiter(jde),
        Planet::Saturn => vsop87a::saturn(jde),
        Planet::Uranus => vsop87a::uranus(jde),
        Planet::Neptune => vsop87a::neptune(jde),
    };
    (coords.x, coords.y, coords.z)
}

/// Compute the apparent direction to a planet as seen from Earth.
/// Returns a unit vector in equatorial coordinates (J2000).
pub fn compute_planet_position(planet: Planet, time: &SkyTime) -> CartesianCoord {
    compute_planet_position_full(planet, time).direction
}

/// Compute the full position data for a planet (direction, distance, angular diameter).
pub fn compute_planet_position_full(planet: Planet, time: &SkyTime) -> PlanetPosition {
    let jde = time.julian_date_tdb();

    // Get heliocentric positions (ecliptic coordinates) in AU
    let earth_pos = heliocentric_position(Planet::Earth, jde);
    let planet_pos = heliocentric_position(planet, jde);

    // Geocentric position (planet relative to Earth) in AU
    let geo_x = planet_pos.0 - earth_pos.0;
    let geo_y = planet_pos.1 - earth_pos.1;
    let geo_z = planet_pos.2 - earth_pos.2;

    // Distance in AU, then convert to km
    let distance_au = (geo_x * geo_x + geo_y * geo_y + geo_z * geo_z).sqrt();
    let distance_km = distance_au * AU_TO_KM;

    // Convert to spherical ecliptic coordinates
    let lon = geo_y.atan2(geo_x);
    let lat = (geo_z / distance_au).asin();

    // Convert to equatorial coordinates
    let direction = ecliptic_to_equatorial(lon, lat, OBLIQUITY_J2000).normalize();

    // Angular diameter: 2 * atan(radius / distance)
    let radius_km = planet_radius_km(planet);
    let angular_diameter_rad = 2.0 * (radius_km / distance_km).atan();

    PlanetPosition {
        direction,
        distance_km,
        angular_diameter_rad,
    }
}

/// Compute positions for all visible planets.
pub fn compute_all_planet_positions(time: &SkyTime) -> [(Planet, CartesianCoord); 5] {
    Planet::VISIBLE.map(|p| (p, compute_planet_position(p, time)))
}

/// Compute the apparent direction to the Sun as seen from Earth.
/// Returns a unit vector in equatorial coordinates (J2000).
pub fn compute_sun_position(time: &SkyTime) -> CartesianCoord {
    compute_sun_position_full(time).direction
}

/// Compute the full position data for the Sun (direction, distance, angular diameter).
pub fn compute_sun_position_full(time: &SkyTime) -> SunPosition {
    let jde = time.julian_date_tdb();

    // Get Earth's heliocentric position in AU
    let earth_pos = heliocentric_position(Planet::Earth, jde);

    // Sun is in the opposite direction from Earth's position
    let geo_x = -earth_pos.0;
    let geo_y = -earth_pos.1;
    let geo_z = -earth_pos.2;

    // Distance in AU, then convert to km
    let distance_au = (geo_x * geo_x + geo_y * geo_y + geo_z * geo_z).sqrt();
    let distance_km = distance_au * AU_TO_KM;

    // Convert to spherical ecliptic coordinates
    let lon = geo_y.atan2(geo_x);
    let lat = (geo_z / distance_au).asin();

    // Convert to equatorial coordinates
    let direction = ecliptic_to_equatorial(lon, lat, OBLIQUITY_J2000).normalize();

    // Angular diameter: 2 * atan(radius / distance)
    let angular_diameter_rad = 2.0 * (SUN_RADIUS_KM / distance_km).atan();

    SunPosition {
        direction,
        distance_km,
        angular_diameter_rad,
    }
}

/// Moon's mean radius in km
pub const MOON_RADIUS_KM: f64 = 1737.4;

/// Result of Moon position calculation
pub struct MoonPosition {
    /// Direction to Moon (unit vector in equatorial J2000)
    pub direction: CartesianCoord,
    /// Distance to Moon in km
    pub distance_km: f64,
    /// Angular diameter in radians
    pub angular_diameter_rad: f64,
}

/// Result of planet position calculation (with distance and angular diameter)
pub struct PlanetPosition {
    /// Direction to planet (unit vector in equatorial J2000)
    pub direction: CartesianCoord,
    /// Distance to planet in km
    pub distance_km: f64,
    /// Angular diameter in radians
    pub angular_diameter_rad: f64,
}

/// Result of Sun position calculation
pub struct SunPosition {
    /// Direction to Sun (unit vector in equatorial J2000)
    pub direction: CartesianCoord,
    /// Distance to Sun in km
    pub distance_km: f64,
    /// Angular diameter in radians
    pub angular_diameter_rad: f64,
}

/// Get the radius of a planet in km.
pub fn planet_radius_km(planet: Planet) -> f64 {
    match planet {
        Planet::Mercury => MERCURY_RADIUS_KM,
        Planet::Venus => VENUS_RADIUS_KM,
        Planet::Earth => 6371.0, // Not used but included for completeness
        Planet::Mars => MARS_RADIUS_KM,
        Planet::Jupiter => JUPITER_RADIUS_KM,
        Planet::Saturn => SATURN_RADIUS_KM,
        Planet::Uranus => URANUS_RADIUS_KM,
        Planet::Neptune => NEPTUNE_RADIUS_KM,
    }
}

/// Compute the apparent direction and distance to the Moon as seen from Earth.
/// Uses an improved lunar ephemeris based on Meeus's Astronomical Algorithms Chapter 47.
/// This version includes the E factor correction and more perturbation terms for better accuracy.
pub fn compute_moon_position_full(time: &SkyTime) -> MoonPosition {
    let jde = time.julian_date_tdb();

    // Julian centuries from J2000.0
    let t = (jde - 2451545.0) / 36525.0;
    let t2 = t * t;
    let t3 = t2 * t;
    let t4 = t3 * t;

    // Mean longitude of Moon (degrees)
    let l_prime = normalize_degrees(
        218.3164477 + 481267.88123421 * t - 0.0015786 * t2 + t3 / 538841.0 - t4 / 65194000.0,
    );

    // Mean elongation of Moon (degrees)
    let d = normalize_degrees(
        297.8501921 + 445267.1114034 * t - 0.0018819 * t2 + t3 / 545868.0 - t4 / 113065000.0,
    );

    // Sun's mean anomaly (degrees)
    let m = normalize_degrees(
        357.5291092 + 35999.0502909 * t - 0.0001536 * t2 + t3 / 24490000.0,
    );

    // Moon's mean anomaly (degrees)
    let m_prime = normalize_degrees(
        134.9633964 + 477198.8675055 * t + 0.0087414 * t2 + t3 / 69699.0 - t4 / 14712000.0,
    );

    // Moon's argument of latitude (degrees)
    let f = normalize_degrees(
        93.2720950 + 483202.0175233 * t - 0.0036539 * t2 - t3 / 3526000.0 + t4 / 863310000.0,
    );

    // Additional arguments for improved accuracy
    let a1 = normalize_degrees(119.75 + 131.849 * t);
    let a2 = normalize_degrees(53.09 + 479264.290 * t);
    let a3 = normalize_degrees(313.45 + 481266.484 * t);

    // E factor - corrects for Earth's orbital eccentricity
    let e = 1.0 - 0.002516 * t - 0.0000074 * t2;
    let e2 = e * e;

    // Convert to radians
    let d_r = d * PI / 180.0;
    let m_r = m * PI / 180.0;
    let m_prime_r = m_prime * PI / 180.0;
    let f_r = f * PI / 180.0;
    let l_prime_r = l_prime * PI / 180.0;
    let a1_r = a1 * PI / 180.0;
    let a2_r = a2 * PI / 180.0;
    let a3_r = a3 * PI / 180.0;

    // Longitude perturbations (Meeus Table 47.A - expanded with E corrections)
    // Format: coefficient, D, M, M', F (M terms multiplied by E or E²)
    let sum_l =
        6288774.0 * (m_prime_r).sin()
        + 1274027.0 * (2.0 * d_r - m_prime_r).sin()
        + 658314.0 * (2.0 * d_r).sin()
        + 213618.0 * (2.0 * m_prime_r).sin()
        - 185116.0 * e * (m_r).sin()
        - 114332.0 * (2.0 * f_r).sin()
        + 58793.0 * (2.0 * d_r - 2.0 * m_prime_r).sin()
        + 57066.0 * e * (2.0 * d_r - m_r - m_prime_r).sin()
        + 53322.0 * (2.0 * d_r + m_prime_r).sin()
        + 45758.0 * e * (2.0 * d_r - m_r).sin()
        - 40923.0 * e * (m_r - m_prime_r).sin()
        - 34720.0 * (d_r).sin()
        - 30383.0 * e * (m_r + m_prime_r).sin()
        + 15327.0 * (2.0 * d_r - 2.0 * f_r).sin()
        - 12528.0 * (m_prime_r + 2.0 * f_r).sin()
        + 10980.0 * (m_prime_r - 2.0 * f_r).sin()
        + 10675.0 * (4.0 * d_r - m_prime_r).sin()
        + 10034.0 * (3.0 * m_prime_r).sin()
        + 8548.0 * (4.0 * d_r - 2.0 * m_prime_r).sin()
        - 7888.0 * e * (2.0 * d_r + m_r - m_prime_r).sin()
        - 6766.0 * e * (2.0 * d_r + m_r).sin()
        - 5163.0 * (d_r - m_prime_r).sin()
        + 4987.0 * e * (d_r + m_r).sin()
        + 4036.0 * e * (2.0 * d_r - m_r + m_prime_r).sin()
        + 3994.0 * (2.0 * d_r + 2.0 * m_prime_r).sin()
        + 3861.0 * (4.0 * d_r).sin()
        + 3665.0 * (2.0 * d_r - 3.0 * m_prime_r).sin()
        - 2689.0 * e * (m_r - 2.0 * m_prime_r).sin()
        - 2602.0 * (2.0 * d_r - m_prime_r + 2.0 * f_r).sin()
        + 2390.0 * e * (2.0 * d_r - m_r - 2.0 * m_prime_r).sin()
        - 2348.0 * (d_r + m_prime_r).sin()
        + 2236.0 * e2 * (2.0 * d_r - 2.0 * m_r).sin()
        - 2120.0 * e * (m_r + 2.0 * m_prime_r).sin()
        - 2069.0 * e2 * (2.0 * m_r).sin()
        + 2048.0 * e2 * (2.0 * d_r - 2.0 * m_r - m_prime_r).sin()
        - 1773.0 * (2.0 * d_r + m_prime_r - 2.0 * f_r).sin()
        - 1595.0 * (2.0 * d_r + 2.0 * f_r).sin()
        + 1215.0 * e * (4.0 * d_r - m_r - m_prime_r).sin()
        - 1110.0 * (2.0 * m_prime_r + 2.0 * f_r).sin()
        - 892.0 * (3.0 * d_r - m_prime_r).sin()
        - 810.0 * e * (2.0 * d_r + m_r + m_prime_r).sin()
        + 759.0 * e * (4.0 * d_r - m_r - 2.0 * m_prime_r).sin()
        - 713.0 * e2 * (2.0 * m_r - m_prime_r).sin()
        - 700.0 * e2 * (2.0 * d_r + 2.0 * m_r - m_prime_r).sin()
        + 691.0 * e * (2.0 * d_r + m_r - 2.0 * m_prime_r).sin()
        + 596.0 * e * (2.0 * d_r - m_r - 2.0 * f_r).sin()
        + 549.0 * (4.0 * d_r + m_prime_r).sin()
        + 537.0 * (4.0 * m_prime_r).sin()
        + 520.0 * e * (4.0 * d_r - m_r).sin()
        - 487.0 * (d_r - 2.0 * m_prime_r).sin()
        - 399.0 * e * (2.0 * d_r + m_r - 2.0 * f_r).sin()
        - 381.0 * (2.0 * m_prime_r - 2.0 * f_r).sin()
        + 351.0 * e * (d_r + m_r + m_prime_r).sin()
        - 340.0 * (3.0 * d_r - 2.0 * m_prime_r).sin()
        + 330.0 * (4.0 * d_r - 3.0 * m_prime_r).sin()
        + 327.0 * e * (2.0 * d_r - m_r + 2.0 * m_prime_r).sin()
        - 323.0 * e2 * (2.0 * m_r + m_prime_r).sin()
        + 299.0 * e * (d_r + m_r - m_prime_r).sin()
        + 294.0 * (2.0 * d_r + 3.0 * m_prime_r).sin();

    // Additional additive terms for longitude
    let sum_l = sum_l
        + 3958.0 * a1_r.sin()
        + 1962.0 * (l_prime_r - f_r).sin()
        + 318.0 * a2_r.sin();

    // Latitude perturbations (Meeus Table 47.B - expanded with E corrections)
    let sum_b =
        5128122.0 * (f_r).sin()
        + 280602.0 * (m_prime_r + f_r).sin()
        + 277693.0 * (m_prime_r - f_r).sin()
        + 173237.0 * (2.0 * d_r - f_r).sin()
        + 55413.0 * (2.0 * d_r - m_prime_r + f_r).sin()
        + 46271.0 * (2.0 * d_r - m_prime_r - f_r).sin()
        + 32573.0 * (2.0 * d_r + f_r).sin()
        + 17198.0 * (2.0 * m_prime_r + f_r).sin()
        + 9266.0 * (2.0 * d_r + m_prime_r - f_r).sin()
        + 8822.0 * (2.0 * m_prime_r - f_r).sin()
        + 8216.0 * e * (2.0 * d_r - m_r - f_r).sin()
        + 4324.0 * (2.0 * d_r - 2.0 * m_prime_r - f_r).sin()
        + 4200.0 * (2.0 * d_r + m_prime_r + f_r).sin()
        - 3359.0 * e * (2.0 * d_r + m_r - f_r).sin()
        + 2463.0 * e * (2.0 * d_r - m_r - m_prime_r + f_r).sin()
        + 2211.0 * e * (2.0 * d_r - m_r + f_r).sin()
        + 2065.0 * e * (2.0 * d_r - m_r - m_prime_r - f_r).sin()
        - 1870.0 * e * (m_r - m_prime_r - f_r).sin()
        + 1828.0 * (4.0 * d_r - m_prime_r - f_r).sin()
        - 1794.0 * e * (m_r + f_r).sin()
        - 1749.0 * (3.0 * f_r).sin()
        - 1565.0 * e * (m_r - m_prime_r + f_r).sin()
        - 1491.0 * (d_r + f_r).sin()
        - 1475.0 * e * (m_r + m_prime_r + f_r).sin()
        - 1410.0 * e * (m_r + m_prime_r - f_r).sin()
        - 1344.0 * e * (m_r - f_r).sin()
        - 1335.0 * (d_r - f_r).sin()
        + 1107.0 * (3.0 * m_prime_r + f_r).sin()
        + 1021.0 * (4.0 * d_r - f_r).sin()
        + 833.0 * (4.0 * d_r - m_prime_r + f_r).sin()
        + 777.0 * (m_prime_r - 3.0 * f_r).sin()
        + 671.0 * (4.0 * d_r - 2.0 * m_prime_r + f_r).sin()
        + 607.0 * (2.0 * d_r - 3.0 * f_r).sin()
        + 596.0 * (2.0 * d_r + 2.0 * m_prime_r - f_r).sin()
        + 491.0 * e * (2.0 * d_r - m_r + m_prime_r - f_r).sin()
        - 451.0 * (2.0 * d_r - 2.0 * m_prime_r + f_r).sin()
        + 439.0 * (3.0 * m_prime_r - f_r).sin()
        + 422.0 * (2.0 * d_r + 2.0 * m_prime_r + f_r).sin()
        + 421.0 * (2.0 * d_r - 3.0 * m_prime_r - f_r).sin()
        - 366.0 * e * (2.0 * d_r + m_r - m_prime_r + f_r).sin()
        - 351.0 * e * (2.0 * d_r + m_r + f_r).sin()
        + 331.0 * (4.0 * d_r + f_r).sin()
        + 315.0 * e * (2.0 * d_r - m_r + m_prime_r + f_r).sin()
        + 302.0 * e2 * (2.0 * d_r - 2.0 * m_r - f_r).sin()
        - 283.0 * (m_prime_r + 3.0 * f_r).sin()
        - 229.0 * e * (2.0 * d_r + m_r + m_prime_r - f_r).sin()
        + 223.0 * e * (d_r + m_r - f_r).sin()
        + 223.0 * e * (d_r + m_r + f_r).sin()
        - 220.0 * e * (m_r - 2.0 * m_prime_r - f_r).sin()
        - 220.0 * e * (2.0 * d_r + m_r - m_prime_r - f_r).sin()
        - 185.0 * (d_r + m_prime_r + f_r).sin()
        + 181.0 * e * (2.0 * d_r - m_r - 2.0 * m_prime_r + f_r).sin();

    // Additional additive terms for latitude
    let sum_b = sum_b
        - 2235.0 * l_prime_r.sin()
        + 382.0 * a3_r.sin()
        + 175.0 * (a1_r - f_r).sin()
        + 175.0 * (a1_r + f_r).sin()
        + 127.0 * (l_prime_r - m_prime_r).sin()
        - 115.0 * (l_prime_r + m_prime_r).sin();

    // Distance perturbations (Meeus Table 47.A - cos terms, expanded with E corrections)
    let sum_r =
        -20905355.0 * (m_prime_r).cos()
        - 3699111.0 * (2.0 * d_r - m_prime_r).cos()
        - 2955968.0 * (2.0 * d_r).cos()
        - 569925.0 * (2.0 * m_prime_r).cos()
        + 48888.0 * e * (m_r).cos()
        - 3149.0 * (2.0 * f_r).cos()
        + 246158.0 * (2.0 * d_r - 2.0 * m_prime_r).cos()
        - 152138.0 * e * (2.0 * d_r - m_r - m_prime_r).cos()
        - 170733.0 * (2.0 * d_r + m_prime_r).cos()
        - 204586.0 * e * (2.0 * d_r - m_r).cos()
        - 129620.0 * e * (m_r - m_prime_r).cos()
        + 108743.0 * (d_r).cos()
        + 104755.0 * e * (m_r + m_prime_r).cos()
        + 10321.0 * (2.0 * d_r - 2.0 * f_r).cos()
        + 79661.0 * (m_prime_r - 2.0 * f_r).cos()
        - 34782.0 * (4.0 * d_r - m_prime_r).cos()
        - 23210.0 * (3.0 * m_prime_r).cos()
        - 21636.0 * (4.0 * d_r - 2.0 * m_prime_r).cos()
        + 24208.0 * e * (2.0 * d_r + m_r - m_prime_r).cos()
        + 30824.0 * e * (2.0 * d_r + m_r).cos()
        - 8379.0 * (d_r - m_prime_r).cos()
        - 16675.0 * e * (d_r + m_r).cos()
        - 12831.0 * e * (2.0 * d_r - m_r + m_prime_r).cos()
        - 10445.0 * (2.0 * d_r + 2.0 * m_prime_r).cos()
        - 11650.0 * (4.0 * d_r).cos()
        + 14403.0 * (2.0 * d_r - 3.0 * m_prime_r).cos()
        - 7003.0 * e * (m_r - 2.0 * m_prime_r).cos()
        + 10056.0 * e * (2.0 * d_r - m_r - 2.0 * m_prime_r).cos()
        + 6322.0 * (d_r + m_prime_r).cos()
        - 9884.0 * e2 * (2.0 * d_r - 2.0 * m_r).cos()
        + 5751.0 * e * (m_r + 2.0 * m_prime_r).cos()
        - 4950.0 * e2 * (2.0 * d_r - 2.0 * m_r - m_prime_r).cos()
        + 4130.0 * (2.0 * d_r + m_prime_r - 2.0 * f_r).cos()
        - 3958.0 * e * (4.0 * d_r - m_r - m_prime_r).cos()
        + 3258.0 * (3.0 * d_r - m_prime_r).cos()
        + 2616.0 * e * (2.0 * d_r + m_r + m_prime_r).cos()
        - 1897.0 * e * (4.0 * d_r - m_r - 2.0 * m_prime_r).cos()
        - 2117.0 * e2 * (2.0 * m_r - m_prime_r).cos()
        + 2354.0 * e2 * (2.0 * d_r + 2.0 * m_r - m_prime_r).cos()
        - 1423.0 * (4.0 * d_r + m_prime_r).cos()
        - 1117.0 * (4.0 * m_prime_r).cos()
        - 1571.0 * e * (4.0 * d_r - m_r).cos()
        - 1739.0 * (d_r - 2.0 * m_prime_r).cos()
        - 4421.0 * (2.0 * m_prime_r - 2.0 * f_r).cos()
        + 1165.0 * e2 * (2.0 * m_r + m_prime_r).cos()
        + 8752.0 * (2.0 * d_r - m_prime_r - 2.0 * f_r).cos();

    let distance_km = 385000.56 + sum_r / 1000.0;

    // Ecliptic longitude and latitude
    let lon = l_prime_r + sum_l / 1000000.0 * PI / 180.0;
    let lat = sum_b / 1000000.0 * PI / 180.0;

    // Angular diameter: 2 * atan(radius / distance)
    let angular_diameter_rad = 2.0 * (MOON_RADIUS_KM / distance_km).atan();

    // Convert to equatorial coordinates using true obliquity (includes nutation)
    // This gives apparent position rather than mean position
    let obliquity = true_obliquity(jde);
    let direction = ecliptic_to_equatorial(lon, lat, obliquity).normalize();

    MoonPosition {
        direction,
        distance_km,
        angular_diameter_rad,
    }
}

/// Compute the apparent direction to the Moon (simplified, direction only).
pub fn compute_moon_position(time: &SkyTime) -> CartesianCoord {
    compute_moon_position_full(time).direction
}

/// Normalize angle to [0, 360) degrees.
fn normalize_degrees(deg: f64) -> f64 {
    let mut d = deg % 360.0;
    if d < 0.0 {
        d += 360.0;
    }
    d
}

/// Compute positions for all visible celestial bodies (Sun, Moon, planets).
pub fn compute_all_body_positions(time: &SkyTime) -> [(CelestialBody, CartesianCoord); 9] {
    [
        (CelestialBody::Sun, compute_sun_position(time)),
        (CelestialBody::Moon, compute_moon_position(time)),
        (
            CelestialBody::Mercury,
            compute_planet_position(Planet::Mercury, time),
        ),
        (
            CelestialBody::Venus,
            compute_planet_position(Planet::Venus, time),
        ),
        (
            CelestialBody::Mars,
            compute_planet_position(Planet::Mars, time),
        ),
        (
            CelestialBody::Jupiter,
            compute_planet_position(Planet::Jupiter, time),
        ),
        (
            CelestialBody::Saturn,
            compute_planet_position(Planet::Saturn, time),
        ),
        (
            CelestialBody::Uranus,
            compute_planet_position(Planet::Uranus, time),
        ),
        (
            CelestialBody::Neptune,
            compute_planet_position(Planet::Neptune, time),
        ),
    ]
}

/// Full position data for a celestial body including angular diameter.
pub struct CelestialBodyPosition {
    pub body: CelestialBody,
    pub direction: CartesianCoord,
    pub distance_km: f64,
    pub angular_diameter_rad: f64,
}

/// Compute full position data (with angular diameters) for all visible celestial bodies.
pub fn compute_all_body_positions_full(time: &SkyTime) -> [CelestialBodyPosition; 9] {
    let sun = compute_sun_position_full(time);
    let moon = compute_moon_position_full(time);
    let mercury = compute_planet_position_full(Planet::Mercury, time);
    let venus = compute_planet_position_full(Planet::Venus, time);
    let mars = compute_planet_position_full(Planet::Mars, time);
    let jupiter = compute_planet_position_full(Planet::Jupiter, time);
    let saturn = compute_planet_position_full(Planet::Saturn, time);
    let uranus = compute_planet_position_full(Planet::Uranus, time);
    let neptune = compute_planet_position_full(Planet::Neptune, time);

    [
        CelestialBodyPosition {
            body: CelestialBody::Sun,
            direction: sun.direction,
            distance_km: sun.distance_km,
            angular_diameter_rad: sun.angular_diameter_rad,
        },
        CelestialBodyPosition {
            body: CelestialBody::Moon,
            direction: moon.direction,
            distance_km: moon.distance_km,
            angular_diameter_rad: moon.angular_diameter_rad,
        },
        CelestialBodyPosition {
            body: CelestialBody::Mercury,
            direction: mercury.direction,
            distance_km: mercury.distance_km,
            angular_diameter_rad: mercury.angular_diameter_rad,
        },
        CelestialBodyPosition {
            body: CelestialBody::Venus,
            direction: venus.direction,
            distance_km: venus.distance_km,
            angular_diameter_rad: venus.angular_diameter_rad,
        },
        CelestialBodyPosition {
            body: CelestialBody::Mars,
            direction: mars.direction,
            distance_km: mars.distance_km,
            angular_diameter_rad: mars.angular_diameter_rad,
        },
        CelestialBodyPosition {
            body: CelestialBody::Jupiter,
            direction: jupiter.direction,
            distance_km: jupiter.distance_km,
            angular_diameter_rad: jupiter.angular_diameter_rad,
        },
        CelestialBodyPosition {
            body: CelestialBody::Saturn,
            direction: saturn.direction,
            distance_km: saturn.distance_km,
            angular_diameter_rad: saturn.angular_diameter_rad,
        },
        CelestialBodyPosition {
            body: CelestialBody::Uranus,
            direction: uranus.direction,
            distance_km: uranus.distance_km,
            angular_diameter_rad: uranus.angular_diameter_rad,
        },
        CelestialBodyPosition {
            body: CelestialBody::Neptune,
            direction: neptune.direction,
            distance_km: neptune.distance_km,
            angular_diameter_rad: neptune.angular_diameter_rad,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    #[test]
    fn test_planet_position_reasonable() {
        // Test that planet positions are unit vectors
        let time = SkyTime::from_utc(2024, 1, 1, 0, 0, 0.0);

        for planet in Planet::VISIBLE {
            let pos = compute_planet_position(planet, &time);
            let len = (pos.x * pos.x + pos.y * pos.y + pos.z * pos.z).sqrt();
            assert!(
                (len - 1.0).abs() < 0.001,
                "{} position should be unit vector",
                planet.name()
            );
        }
    }

    #[test]
    fn test_venus_position_j2000() {
        // Test Venus position at J2000.0
        // This is a rough check - Venus should be somewhere reasonable
        let time = SkyTime::from_utc(2000, 1, 1, 12, 0, 0.0);
        let pos = compute_planet_position(Planet::Venus, &time);

        // Venus should have a declination within +-30 degrees of ecliptic
        let dec = pos.z.asin();
        assert!(
            dec.abs() < 30.0 * PI / 180.0,
            "Venus declination should be reasonable"
        );
    }
}
