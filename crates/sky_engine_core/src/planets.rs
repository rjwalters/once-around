use crate::coords::{ecliptic_to_equatorial, CartesianCoord, OBLIQUITY_J2000};
use crate::time::SkyTime;
use std::f64::consts::PI;
use vsop87::vsop87a;

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
}

impl CelestialBody {
    /// All visible celestial bodies in display order.
    pub const ALL: [CelestialBody; 7] = [
        CelestialBody::Sun,
        CelestialBody::Moon,
        CelestialBody::Mercury,
        CelestialBody::Venus,
        CelestialBody::Mars,
        CelestialBody::Jupiter,
        CelestialBody::Saturn,
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
    let jde = time.julian_date_tdb();

    // Get heliocentric positions (ecliptic coordinates)
    let earth_pos = heliocentric_position(Planet::Earth, jde);
    let planet_pos = heliocentric_position(planet, jde);

    // Geocentric position (planet relative to Earth)
    let geo_x = planet_pos.0 - earth_pos.0;
    let geo_y = planet_pos.1 - earth_pos.1;
    let geo_z = planet_pos.2 - earth_pos.2;

    // Convert to spherical ecliptic coordinates
    let r = (geo_x * geo_x + geo_y * geo_y + geo_z * geo_z).sqrt();
    let lon = geo_y.atan2(geo_x);
    let lat = (geo_z / r).asin();

    // Convert to equatorial coordinates
    ecliptic_to_equatorial(lon, lat, OBLIQUITY_J2000).normalize()
}

/// Compute positions for all visible planets.
pub fn compute_all_planet_positions(time: &SkyTime) -> [(Planet, CartesianCoord); 5] {
    Planet::VISIBLE.map(|p| (p, compute_planet_position(p, time)))
}

/// Compute the apparent direction to the Sun as seen from Earth.
/// Returns a unit vector in equatorial coordinates (J2000).
pub fn compute_sun_position(time: &SkyTime) -> CartesianCoord {
    let jde = time.julian_date_tdb();

    // Get Earth's heliocentric position
    let earth_pos = heliocentric_position(Planet::Earth, jde);

    // Sun is in the opposite direction from Earth's position
    let geo_x = -earth_pos.0;
    let geo_y = -earth_pos.1;
    let geo_z = -earth_pos.2;

    // Convert to spherical ecliptic coordinates
    let r = (geo_x * geo_x + geo_y * geo_y + geo_z * geo_z).sqrt();
    let lon = geo_y.atan2(geo_x);
    let lat = (geo_z / r).asin();

    // Convert to equatorial coordinates
    ecliptic_to_equatorial(lon, lat, OBLIQUITY_J2000).normalize()
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

/// Compute the apparent direction and distance to the Moon as seen from Earth.
/// Uses a simplified lunar ephemeris based on Meeus's Astronomical Algorithms.
pub fn compute_moon_position_full(time: &SkyTime) -> MoonPosition {
    let jde = time.julian_date_tdb();

    // Julian centuries from J2000.0
    let t = (jde - 2451545.0) / 36525.0;

    // Mean longitude of Moon (degrees)
    let l_prime = normalize_degrees(
        218.3164477 + 481267.88123421 * t - 0.0015786 * t * t + t * t * t / 538841.0,
    );

    // Mean elongation of Moon (degrees)
    let d = normalize_degrees(
        297.8501921 + 445267.1114034 * t - 0.0018819 * t * t + t * t * t / 545868.0,
    );

    // Sun's mean anomaly (degrees)
    let m = normalize_degrees(357.5291092 + 35999.0502909 * t - 0.0001536 * t * t);

    // Moon's mean anomaly (degrees)
    let m_prime = normalize_degrees(
        134.9633964 + 477198.8675055 * t + 0.0087414 * t * t + t * t * t / 69699.0,
    );

    // Moon's argument of latitude (degrees)
    let f = normalize_degrees(
        93.2720950 + 483202.0175233 * t - 0.0036539 * t * t - t * t * t / 3526000.0,
    );

    // Convert to radians
    let d_r = d * PI / 180.0;
    let m_r = m * PI / 180.0;
    let m_prime_r = m_prime * PI / 180.0;
    let f_r = f * PI / 180.0;
    let l_prime_r = l_prime * PI / 180.0;

    // Longitude perturbations (simplified - main terms only)
    let sum_l = 6288774.0 * m_prime_r.sin()
        + 1274027.0 * (2.0 * d_r - m_prime_r).sin()
        + 658314.0 * (2.0 * d_r).sin()
        + 213618.0 * (2.0 * m_prime_r).sin()
        - 185116.0 * m_r.sin()
        - 114332.0 * (2.0 * f_r).sin()
        + 58793.0 * (2.0 * d_r - 2.0 * m_prime_r).sin()
        + 57066.0 * (2.0 * d_r - m_r - m_prime_r).sin()
        + 53322.0 * (2.0 * d_r + m_prime_r).sin()
        + 45758.0 * (2.0 * d_r - m_r).sin();

    // Latitude perturbations (simplified - main terms only)
    let sum_b = 5128122.0 * f_r.sin()
        + 280602.0 * (m_prime_r + f_r).sin()
        + 277693.0 * (m_prime_r - f_r).sin()
        + 173237.0 * (2.0 * d_r - f_r).sin()
        + 55413.0 * (2.0 * d_r - m_prime_r + f_r).sin()
        + 46271.0 * (2.0 * d_r - m_prime_r - f_r).sin()
        + 32573.0 * (2.0 * d_r + f_r).sin()
        + 17198.0 * (2.0 * m_prime_r + f_r).sin();

    // Distance perturbations (in km, simplified)
    // Mean distance is 385000.56 km
    let sum_r = -20905355.0 * m_prime_r.cos()
        - 3699111.0 * (2.0 * d_r - m_prime_r).cos()
        - 2955968.0 * (2.0 * d_r).cos()
        - 569925.0 * (2.0 * m_prime_r).cos()
        + 48888.0 * m_r.cos()
        - 3149.0 * (2.0 * f_r).cos()
        + 246158.0 * (2.0 * d_r - 2.0 * m_prime_r).cos()
        - 152138.0 * (2.0 * d_r - m_r - m_prime_r).cos()
        - 170733.0 * (2.0 * d_r + m_prime_r).cos()
        - 204586.0 * (2.0 * d_r - m_r).cos();

    let distance_km = 385000.56 + sum_r / 1000.0;

    // Ecliptic longitude and latitude
    let lon = l_prime_r + sum_l / 1000000.0 * PI / 180.0;
    let lat = sum_b / 1000000.0 * PI / 180.0;

    // Angular diameter: 2 * atan(radius / distance)
    let angular_diameter_rad = 2.0 * (MOON_RADIUS_KM / distance_km).atan();

    // Convert to equatorial coordinates
    let direction = ecliptic_to_equatorial(lon, lat, OBLIQUITY_J2000).normalize();

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
pub fn compute_all_body_positions(time: &SkyTime) -> [(CelestialBody, CartesianCoord); 7] {
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
