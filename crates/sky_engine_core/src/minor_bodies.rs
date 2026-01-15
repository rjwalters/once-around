//! Minor body ephemeris calculations (dwarf planets, asteroids, comets).
//!
//! Implements heliocentric Keplerian orbits for solar system bodies not covered
//! by VSOP87. Uses JPL orbital elements with proper 3D orbital plane orientation.

use crate::coords::{ecliptic_to_equatorial, true_obliquity, CartesianCoord};
use crate::planets::{Planet, AU_TO_KM};
use crate::time::SkyTime;
use std::f64::consts::PI;

/// Heliocentric Keplerian orbital elements for a minor body.
/// All angles are stored in radians internally.
#[derive(Debug, Clone, Copy)]
pub struct OrbitalElements {
    /// Name of the body
    pub name: &'static str,
    /// Semi-major axis in AU
    pub semi_major_axis_au: f64,
    /// Orbital eccentricity (0 = circular, <1 = elliptical)
    pub eccentricity: f64,
    /// Inclination to ecliptic in radians
    pub inclination_rad: f64,
    /// Longitude of ascending node in radians (Ω)
    pub ascending_node_rad: f64,
    /// Argument of perihelion in radians (ω)
    pub arg_perihelion_rad: f64,
    /// Mean anomaly at J2000.0 epoch in radians
    pub mean_anomaly_j2000_rad: f64,
    /// Mean motion in radians per day
    pub mean_motion_rad_per_day: f64,
    /// Body radius in km (for angular diameter calculation)
    pub radius_km: f64,
}

impl OrbitalElements {
    /// Create orbital elements from degrees (convenience constructor).
    pub const fn from_degrees(
        name: &'static str,
        semi_major_axis_au: f64,
        eccentricity: f64,
        inclination_deg: f64,
        ascending_node_deg: f64,
        arg_perihelion_deg: f64,
        mean_anomaly_j2000_deg: f64,
        orbital_period_years: f64,
        radius_km: f64,
    ) -> Self {
        let deg_to_rad = PI / 180.0;
        Self {
            name,
            semi_major_axis_au,
            eccentricity,
            inclination_rad: inclination_deg * deg_to_rad,
            ascending_node_rad: ascending_node_deg * deg_to_rad,
            arg_perihelion_rad: arg_perihelion_deg * deg_to_rad,
            mean_anomaly_j2000_rad: mean_anomaly_j2000_deg * deg_to_rad,
            // Mean motion = 2π / period (in days)
            mean_motion_rad_per_day: 2.0 * PI / (orbital_period_years * 365.25),
            radius_km,
        }
    }
}

// =============================================================================
// Dwarf Planets - Orbital elements from JPL Horizons / Small-Body Database
// =============================================================================

/// Pluto - dwarf planet, former 9th planet
/// Orbital elements: JPL Horizons, epoch J2000.0
pub const PLUTO: OrbitalElements = OrbitalElements::from_degrees(
    "Pluto",
    39.48211675,        // Semi-major axis (AU)
    0.2488273,          // Eccentricity
    17.14175,           // Inclination (degrees)
    110.30347,          // Longitude of ascending node (degrees)
    113.76329,          // Argument of perihelion (degrees)
    14.86205,           // Mean anomaly at J2000 (degrees)
    247.94,             // Orbital period (years)
    1188.3,             // Mean radius (km)
);

/// Ceres - largest object in asteroid belt, dwarf planet
/// Orbital elements: JPL Small-Body Database
pub const CERES: OrbitalElements = OrbitalElements::from_degrees(
    "Ceres",
    2.7691,             // Semi-major axis (AU)
    0.0760,             // Eccentricity
    10.594,             // Inclination (degrees)
    80.305,             // Longitude of ascending node (degrees)
    73.597,             // Argument of perihelion (degrees)
    341.0,              // Mean anomaly at J2000 (degrees) - estimated
    4.60,               // Orbital period (years)
    473.0,              // Mean radius (km)
);

/// Eris - most massive known dwarf planet
/// Orbital elements: JPL Small-Body Database
pub const ERIS: OrbitalElements = OrbitalElements::from_degrees(
    "Eris",
    67.864,             // Semi-major axis (AU)
    0.43605,            // Eccentricity
    44.04,              // Inclination (degrees)
    35.95,              // Longitude of ascending node (degrees)
    151.64,             // Argument of perihelion (degrees)
    205.0,              // Mean anomaly at J2000 (degrees) - estimated from 2257 perihelion
    559.0,              // Orbital period (years)
    1163.0,             // Mean radius (km)
);

/// Makemake - Kuiper belt dwarf planet
/// Orbital elements: JPL Small-Body Database
pub const MAKEMAKE: OrbitalElements = OrbitalElements::from_degrees(
    "Makemake",
    45.43,              // Semi-major axis (AU)
    0.161,              // Eccentricity
    28.98,              // Inclination (degrees)
    79.62,              // Longitude of ascending node (degrees)
    294.84,             // Argument of perihelion (degrees)
    151.0,              // Mean anomaly at J2000 (degrees) - estimated
    306.2,              // Orbital period (years)
    715.0,              // Mean radius (km)
);

/// Haumea - elongated dwarf planet with ring
/// Orbital elements: JPL Small-Body Database
pub const HAUMEA: OrbitalElements = OrbitalElements::from_degrees(
    "Haumea",
    43.18,              // Semi-major axis (AU)
    0.195,              // Eccentricity
    28.21,              // Inclination (degrees)
    122.16,             // Longitude of ascending node (degrees)
    238.78,             // Argument of perihelion (degrees)
    219.0,              // Mean anomaly at J2000 (degrees) - estimated from 2133 perihelion
    284.0,              // Orbital period (years)
    780.0,              // Mean radius (km) - average of ellipsoid
);

/// Sedna - extreme trans-Neptunian object
/// Orbital elements: JPL Small-Body Database
pub const SEDNA: OrbitalElements = OrbitalElements::from_degrees(
    "Sedna",
    541.6,              // Semi-major axis (AU)
    0.859,              // Eccentricity
    11.93,              // Inclination (degrees)
    144.3,              // Longitude of ascending node (degrees)
    310.84,             // Argument of perihelion (degrees)
    358.0,              // Mean anomaly at J2000 (degrees)
    11400.0,            // Orbital period (years)
    497.5,              // Mean radius (km)
);

/// Quaoar - classical Kuiper belt object
/// Orbital elements: JPL Small-Body Database
pub const QUAOAR: OrbitalElements = OrbitalElements::from_degrees(
    "Quaoar",
    43.69,              // Semi-major axis (AU)
    0.041,              // Eccentricity
    7.99,               // Inclination (degrees)
    188.8,              // Longitude of ascending node (degrees)
    147.5,              // Argument of perihelion (degrees)
    283.0,              // Mean anomaly at J2000 (degrees) - estimated from 2075 perihelion
    288.8,              // Orbital period (years)
    545.0,              // Mean radius (km)
);

/// Gonggong - scattered disc dwarf planet (225088)
/// Orbital elements: JPL Small-Body Database
pub const GONGGONG: OrbitalElements = OrbitalElements::from_degrees(
    "Gonggong",
    67.37,              // Semi-major axis (AU)
    0.50,               // Eccentricity
    30.7,               // Inclination (degrees)
    336.8,              // Longitude of ascending node (degrees)
    207.2,              // Argument of perihelion (degrees)
    106.0,              // Mean anomaly at J2000 (degrees) - estimated from 1857 perihelion
    550.0,              // Orbital period (years)
    615.0,              // Mean radius (km)
);

/// Orcus - plutino (2:3 Neptune resonance)
/// Orbital elements: JPL Small-Body Database
pub const ORCUS: OrbitalElements = OrbitalElements::from_degrees(
    "Orcus",
    39.46,              // Semi-major axis (AU)
    0.218,              // Eccentricity
    20.55,              // Inclination (degrees)
    268.6,              // Longitude of ascending node (degrees)
    73.0,               // Argument of perihelion (degrees)
    167.0,              // Mean anomaly at J2000 (degrees)
    247.9,              // Orbital period (years)
    458.0,              // Mean radius (km)
);

/// Varuna - large classical Kuiper belt object
/// Orbital elements: JPL Small-Body Database
pub const VARUNA: OrbitalElements = OrbitalElements::from_degrees(
    "Varuna",
    43.13,              // Semi-major axis (AU)
    0.057,              // Eccentricity
    17.16,              // Inclination (degrees)
    97.26,              // Longitude of ascending node (degrees)
    268.8,              // Argument of perihelion (degrees)
    88.0,               // Mean anomaly at J2000 (degrees) - estimated from 1928 perihelion
    282.0,              // Orbital period (years)
    334.0,              // Mean radius (km)
);

// =============================================================================
// Major Asteroids - Orbital elements from JPL Small-Body Database
// =============================================================================

/// Vesta (4) - second-largest asteroid, visited by Dawn spacecraft
/// Orbital elements: JPL Small-Body Database
pub const VESTA: OrbitalElements = OrbitalElements::from_degrees(
    "Vesta",
    2.3615,             // Semi-major axis (AU)
    0.0887,             // Eccentricity
    7.14,               // Inclination (degrees)
    103.8,              // Longitude of ascending node (degrees)
    150.7,              // Argument of perihelion (degrees)
    20.0,               // Mean anomaly at J2000 (degrees) - estimated
    3.63,               // Orbital period (years)
    262.7,              // Mean radius (km)
);

/// Pallas (2) - third-largest asteroid, highly inclined orbit
/// Orbital elements: JPL Small-Body Database
pub const PALLAS: OrbitalElements = OrbitalElements::from_degrees(
    "Pallas",
    2.772,              // Semi-major axis (AU)
    0.2302,             // Eccentricity
    34.93,              // Inclination (degrees) - unusually high!
    172.92,             // Longitude of ascending node (degrees)
    310.87,             // Argument of perihelion (degrees)
    40.6,               // Mean anomaly at J2000 (degrees)
    4.62,               // Orbital period (years)
    256.0,              // Mean radius (km)
);

/// Hygiea (10) - fourth-largest asteroid, nearly spherical
/// Orbital elements: JPL Small-Body Database
pub const HYGIEA: OrbitalElements = OrbitalElements::from_degrees(
    "Hygiea",
    3.1416,             // Semi-major axis (AU)
    0.1114,             // Eccentricity
    3.83,               // Inclination (degrees)
    283.17,             // Longitude of ascending node (degrees)
    312.48,             // Argument of perihelion (degrees)
    75.0,               // Mean anomaly at J2000 (degrees) - estimated
    5.57,               // Orbital period (years)
    217.0,              // Mean radius (km)
);

// =============================================================================
// Near-Earth Objects (NEOs) - Asteroids with orbits crossing Earth's
// =============================================================================

/// Apophis (99942) - potentially hazardous asteroid, close approach 2029
/// Orbital elements: JPL Small-Body Database
pub const APOPHIS: OrbitalElements = OrbitalElements::from_degrees(
    "Apophis",
    0.9224,             // Semi-major axis (AU) - crosses Earth's orbit!
    0.1914,             // Eccentricity
    3.34,               // Inclination (degrees)
    204.5,              // Longitude of ascending node (degrees)
    126.4,              // Argument of perihelion (degrees)
    180.0,              // Mean anomaly at J2000 (degrees) - estimated
    0.89,               // Orbital period (years) - less than 1 year!
    0.17,               // Mean radius (km) - ~340m diameter
);

/// Bennu (101955) - OSIRIS-REx sample return target
/// Orbital elements: JPL Small-Body Database
pub const BENNU: OrbitalElements = OrbitalElements::from_degrees(
    "Bennu",
    1.126,              // Semi-major axis (AU)
    0.2037,             // Eccentricity
    6.03,               // Inclination (degrees)
    2.06,               // Longitude of ascending node (degrees)
    66.22,              // Argument of perihelion (degrees)
    101.7,              // Mean anomaly at J2000 (degrees)
    1.20,               // Orbital period (years)
    0.245,              // Mean radius (km) - ~490m diameter
);

/// Minor body identifier
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum MinorBody {
    // Dwarf planets
    Pluto = 0,
    Ceres = 1,
    Eris = 2,
    Makemake = 3,
    Haumea = 4,
    // TNOs
    Sedna = 5,
    Quaoar = 6,
    Gonggong = 7,
    Orcus = 8,
    Varuna = 9,
    // Major asteroids
    Vesta = 10,
    Pallas = 11,
    Hygiea = 12,
    // Near-Earth Objects
    Apophis = 13,
    Bennu = 14,
}

impl MinorBody {
    pub const ALL: [MinorBody; 15] = [
        // Dwarf planets
        MinorBody::Pluto,
        MinorBody::Ceres,
        MinorBody::Eris,
        MinorBody::Makemake,
        MinorBody::Haumea,
        // TNOs
        MinorBody::Sedna,
        MinorBody::Quaoar,
        MinorBody::Gonggong,
        MinorBody::Orcus,
        MinorBody::Varuna,
        // Major asteroids
        MinorBody::Vesta,
        MinorBody::Pallas,
        MinorBody::Hygiea,
        // NEOs
        MinorBody::Apophis,
        MinorBody::Bennu,
    ];

    pub fn name(&self) -> &'static str {
        self.elements().name
    }

    pub fn elements(&self) -> &'static OrbitalElements {
        match self {
            MinorBody::Pluto => &PLUTO,
            MinorBody::Ceres => &CERES,
            MinorBody::Eris => &ERIS,
            MinorBody::Makemake => &MAKEMAKE,
            MinorBody::Haumea => &HAUMEA,
            MinorBody::Sedna => &SEDNA,
            MinorBody::Quaoar => &QUAOAR,
            MinorBody::Gonggong => &GONGGONG,
            MinorBody::Orcus => &ORCUS,
            MinorBody::Varuna => &VARUNA,
            MinorBody::Vesta => &VESTA,
            MinorBody::Pallas => &PALLAS,
            MinorBody::Hygiea => &HYGIEA,
            MinorBody::Apophis => &APOPHIS,
            MinorBody::Bennu => &BENNU,
        }
    }
}

/// Result of minor body position calculation
pub struct MinorBodyPosition {
    pub body: MinorBody,
    /// Direction from Earth (unit vector in equatorial J2000)
    pub direction: CartesianCoord,
    /// Distance from Earth in km
    pub distance_km: f64,
    /// Distance from Sun in km
    pub helio_distance_km: f64,
    /// Angular diameter as seen from Earth (radians)
    pub angular_diameter_rad: f64,
}

/// Solve Kepler's equation: M = E - e*sin(E)
/// Returns eccentric anomaly E for given mean anomaly M and eccentricity e.
fn solve_kepler(mean_anomaly: f64, eccentricity: f64) -> f64 {
    let m = mean_anomaly % (2.0 * PI);
    let mut e_anomaly = m; // Initial guess

    // Newton-Raphson iteration
    for _ in 0..15 {
        let delta = (e_anomaly - eccentricity * e_anomaly.sin() - m)
            / (1.0 - eccentricity * e_anomaly.cos());
        e_anomaly -= delta;
        if delta.abs() < 1e-12 {
            break;
        }
    }

    e_anomaly
}

/// Compute heliocentric position of a minor body in ecliptic coordinates.
/// Returns (x, y, z) in AU, J2000 ecliptic frame.
fn compute_heliocentric_ecliptic(elem: &OrbitalElements, jde: f64) -> (f64, f64, f64) {
    // Days since J2000.0
    let t = jde - 2451545.0;

    // Mean anomaly at current time
    let mean_anomaly = elem.mean_anomaly_j2000_rad + elem.mean_motion_rad_per_day * t;

    // Solve Kepler's equation for eccentric anomaly
    let e_anomaly = solve_kepler(mean_anomaly, elem.eccentricity);

    // True anomaly
    let cos_e = e_anomaly.cos();
    let e = elem.eccentricity;
    let true_anomaly = 2.0 * ((1.0 + e).sqrt() * (e_anomaly / 2.0).tan())
        .atan2((1.0 - e).sqrt());

    // Distance from Sun (in AU)
    let r = elem.semi_major_axis_au * (1.0 - e * cos_e);

    // Position in orbital plane
    let x_orbit = r * true_anomaly.cos();
    let y_orbit = r * true_anomaly.sin();

    // Orbital elements
    let i = elem.inclination_rad;
    let omega = elem.ascending_node_rad;  // Longitude of ascending node
    let w = elem.arg_perihelion_rad;      // Argument of perihelion

    // Rotation from orbital plane to ecliptic coordinates
    // Using standard orbital mechanics transformation
    let cos_omega = omega.cos();
    let sin_omega = omega.sin();
    let cos_i = i.cos();
    let sin_i = i.sin();
    let cos_w = w.cos();
    let sin_w = w.sin();

    // Rotation matrix elements (orbital plane -> ecliptic)
    let p1 = cos_omega * cos_w - sin_omega * sin_w * cos_i;
    let p2 = -cos_omega * sin_w - sin_omega * cos_w * cos_i;
    let q1 = sin_omega * cos_w + cos_omega * sin_w * cos_i;
    let q2 = -sin_omega * sin_w + cos_omega * cos_w * cos_i;
    let r1 = sin_w * sin_i;
    let r2 = cos_w * sin_i;

    // Ecliptic coordinates (AU)
    let x_ecl = p1 * x_orbit + p2 * y_orbit;
    let y_ecl = q1 * x_orbit + q2 * y_orbit;
    let z_ecl = r1 * x_orbit + r2 * y_orbit;

    (x_ecl, y_ecl, z_ecl)
}

/// Compute position of a minor body as seen from Earth.
pub fn compute_minor_body_position(body: MinorBody, time: &SkyTime) -> MinorBodyPosition {
    let elem = body.elements();
    let jde = time.julian_date_tdb();

    // Get heliocentric position of the minor body (ecliptic coordinates, AU)
    let (body_x, body_y, body_z) = compute_heliocentric_ecliptic(elem, jde);

    // Get heliocentric position of Earth (ecliptic coordinates, AU)
    let earth_pos = crate::planets::heliocentric_position(Planet::Earth, jde);

    // Geocentric position of the minor body (AU)
    let geo_x = body_x - earth_pos.0;
    let geo_y = body_y - earth_pos.1;
    let geo_z = body_z - earth_pos.2;

    // Distance from Earth (AU -> km)
    let distance_au = (geo_x * geo_x + geo_y * geo_y + geo_z * geo_z).sqrt();
    let distance_km = distance_au * AU_TO_KM;

    // Heliocentric distance (AU -> km)
    let helio_distance_au = (body_x * body_x + body_y * body_y + body_z * body_z).sqrt();
    let helio_distance_km = helio_distance_au * AU_TO_KM;

    // Convert to spherical ecliptic coordinates
    let lon = geo_y.atan2(geo_x);
    let lat = (geo_z / distance_au).asin();

    // Convert to equatorial coordinates using true obliquity
    let obliquity = true_obliquity(jde);
    let direction = ecliptic_to_equatorial(lon, lat, obliquity).normalize();

    // Angular diameter
    let angular_diameter_rad = 2.0 * (elem.radius_km / distance_km).atan();

    MinorBodyPosition {
        body,
        direction,
        distance_km,
        helio_distance_km,
        angular_diameter_rad,
    }
}

/// Compute positions for all minor bodies.
pub fn compute_all_minor_body_positions(time: &SkyTime) -> Vec<MinorBodyPosition> {
    MinorBody::ALL
        .iter()
        .map(|&body| compute_minor_body_position(body, time))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pluto_position_reasonable() {
        let time = SkyTime::from_utc(2024, 1, 1, 0, 0, 0.0);
        let pos = compute_minor_body_position(MinorBody::Pluto, &time);

        // Direction should be a unit vector
        let len = (pos.direction.x.powi(2) + pos.direction.y.powi(2) + pos.direction.z.powi(2)).sqrt();
        assert!(
            (len - 1.0).abs() < 0.001,
            "Pluto direction should be unit vector, got len={}",
            len
        );

        // Pluto should be roughly 30-50 AU from Earth
        let distance_au = pos.distance_km / AU_TO_KM;
        assert!(
            distance_au > 25.0 && distance_au < 55.0,
            "Pluto distance should be 25-55 AU, got {} AU",
            distance_au
        );

        // Heliocentric distance should be roughly 30-50 AU
        let helio_au = pos.helio_distance_km / AU_TO_KM;
        assert!(
            helio_au > 29.0 && helio_au < 50.0,
            "Pluto heliocentric distance should be 29-50 AU, got {} AU",
            helio_au
        );

        eprintln!("Pluto distance from Earth: {:.2} AU", distance_au);
        eprintln!("Pluto distance from Sun: {:.2} AU", helio_au);
    }

    #[test]
    fn test_pluto_moves_over_time() {
        // Pluto has a ~248 year period, so it moves slowly
        let t1 = SkyTime::from_utc(2024, 1, 1, 0, 0, 0.0);
        let t2 = SkyTime::from_utc(2025, 1, 1, 0, 0, 0.0); // 1 year later

        let pos1 = compute_minor_body_position(MinorBody::Pluto, &t1);
        let pos2 = compute_minor_body_position(MinorBody::Pluto, &t2);

        // Should have moved (Pluto moves ~1.5° per year)
        let dot = pos1.direction.x * pos2.direction.x
            + pos1.direction.y * pos2.direction.y
            + pos1.direction.z * pos2.direction.z;
        let sep_deg = dot.clamp(-1.0, 1.0).acos() * 180.0 / PI;

        eprintln!("Pluto moved {:.2}° in one year", sep_deg);
        assert!(
            sep_deg > 0.5 && sep_deg < 5.0,
            "Pluto should move 0.5-5° per year, got {}°",
            sep_deg
        );
    }

    #[test]
    fn test_kepler_solver() {
        // Test with known values
        // For circular orbit (e=0), E should equal M
        let e_circular = solve_kepler(1.0, 0.0);
        assert!((e_circular - 1.0).abs() < 1e-10, "Circular orbit: E should equal M");

        // For eccentric orbit, E should be between M and M + e*sin(M) roughly
        let e_eccentric = solve_kepler(1.0, 0.25);
        assert!(e_eccentric > 1.0 && e_eccentric < 1.3, "Eccentric orbit: E should be reasonable");
    }

    #[test]
    fn test_all_minor_bodies_reasonable() {
        let time = SkyTime::from_utc(2024, 1, 1, 0, 0, 0.0);

        for body in MinorBody::ALL.iter() {
            let pos = compute_minor_body_position(*body, &time);

            // Direction should be a unit vector
            let len = (pos.direction.x.powi(2) + pos.direction.y.powi(2) + pos.direction.z.powi(2)).sqrt();
            assert!(
                (len - 1.0).abs() < 0.001,
                "{} direction should be unit vector, got len={}",
                body.name(), len
            );

            // Distance should be positive and reasonable (NEOs can be < 1 AU, TNOs up to ~1000 AU)
            let distance_au = pos.distance_km / AU_TO_KM;
            assert!(
                distance_au > 0.01 && distance_au < 1000.0,
                "{} distance should be 0.01-1000 AU from Earth, got {} AU",
                body.name(), distance_au
            );

            // Heliocentric distance should be consistent with semi-major axis
            let helio_au = pos.helio_distance_km / AU_TO_KM;
            let elem = body.elements();
            let min_r = elem.semi_major_axis_au * (1.0 - elem.eccentricity) * 0.9;
            let max_r = elem.semi_major_axis_au * (1.0 + elem.eccentricity) * 1.1;
            assert!(
                helio_au > min_r && helio_au < max_r,
                "{} heliocentric distance {} AU outside expected range {}-{} AU",
                body.name(), helio_au, min_r, max_r
            );

            eprintln!("{}: Earth dist={:.2} AU, Sun dist={:.2} AU", body.name(), distance_au, helio_au);
        }
    }

    #[test]
    fn test_ceres_inner_solar_system() {
        let time = SkyTime::from_utc(2024, 1, 1, 0, 0, 0.0);
        let pos = compute_minor_body_position(MinorBody::Ceres, &time);

        // Ceres should be 1.5-4 AU from Earth (asteroid belt)
        let distance_au = pos.distance_km / AU_TO_KM;
        assert!(
            distance_au > 1.0 && distance_au < 5.0,
            "Ceres should be 1-5 AU from Earth, got {} AU",
            distance_au
        );

        // Heliocentric distance ~2.5-3 AU
        let helio_au = pos.helio_distance_km / AU_TO_KM;
        assert!(
            helio_au > 2.5 && helio_au < 3.0,
            "Ceres heliocentric distance should be 2.5-3 AU, got {} AU",
            helio_au
        );
    }
}
