//! Minor body ephemeris calculations (dwarf planets, asteroids, comets).
//!
//! Implements heliocentric Keplerian orbits for solar system bodies not covered
//! by VSOP87. Uses JPL orbital elements with proper 3D orbital plane orientation.
//!
//! # Orbital elements: source and epoch
//!
//! With the exception of Pluto (fixed J2000 elements), every body below uses real
//! heliocentric ecliptic (J2000) osculating elements retrieved from JPL Horizons
//! at the common epoch **JDTDB 2461227.5 (2026-07-06 TDB)**. Horizons reports the
//! mean anomaly `MA` at that epoch; because the engine propagates from a J2000
//! anchor (`mean_anomaly_j2000_rad + mean_motion * t`), each `MA` is back-propagated
//! to J2000 analytically with the same mean motion the engine uses forward
//! (`n = 2π / (period_years · 365.25)`, chosen so `n` matches Horizons' reported
//! mean motion). Two-body mean-anomaly propagation is exact, so this reproduces the
//! Horizons mean anomaly at the 2026 epoch to f64 precision.
//!
//! Accuracy is validated against Horizons in `tests/horizons_accuracy.rs`. Near the
//! 2026 element epoch all bodies match to a few arcminutes. Away from the epoch,
//! two-body propagation drifts because planetary perturbations are not modeled; this
//! is worst for the outer TNOs and, especially, for the close-approach NEOs
//! (Apophis, Bennu), whose 2-body elements become meaningless across an Earth
//! encounter. See the per-family tolerances and caveats in that test.

use crate::coords::{ecliptic_to_equatorial, CartesianCoord};
use crate::planets::AU_TO_KM;
use crate::time::SkyTime;
use crate::time_context::TimeContext;
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
/// Osculating elements: JPL Horizons, epoch JDTDB 2461227.5 (2026-07-06)
pub const CERES: OrbitalElements = OrbitalElements::from_degrees(
    "Ceres",
    2.7656038,          // Semi-major axis (AU)
    0.0797027,          // Eccentricity
    10.58798,           // Inclination (degrees)
    80.24872,           // Longitude of ascending node (degrees)
    73.28179,           // Argument of perihelion (degrees)
    5.27378,            // Mean anomaly back-propagated to J2000 (degrees)
    4.599315,           // Orbital period (years)
    473.0,              // Mean radius (km)
);

/// Eris - most massive known dwarf planet
/// Osculating elements: JPL Horizons, epoch JDTDB 2461227.5 (2026-07-06)
pub const ERIS: OrbitalElements = OrbitalElements::from_degrees(
    "Eris",
    67.9261588,         // Semi-major axis (AU)
    0.4383756,          // Eccentricity
    43.93307,           // Inclination (degrees)
    36.00194,           // Longitude of ascending node (degrees)
    150.80688,          // Argument of perihelion (degrees)
    194.76178,          // Mean anomaly back-propagated to J2000 (degrees)
    559.839821,         // Orbital period (years)
    1163.0,             // Mean radius (km)
);

/// Makemake - Kuiper belt dwarf planet
/// Osculating elements: JPL Horizons, epoch JDTDB 2461227.5 (2026-07-06)
pub const MAKEMAKE: OrbitalElements = OrbitalElements::from_degrees(
    "Makemake",
    45.5773481,         // Semi-major axis (AU)
    0.1587202,          // Eccentricity
    29.02704,           // Inclination (degrees)
    79.29954,           // Longitude of ascending node (degrees)
    297.08116,          // Argument of perihelion (degrees)
    139.02243,          // Mean anomaly back-propagated to J2000 (degrees)
    307.703036,         // Orbital period (years)
    715.0,              // Mean radius (km)
);

/// Haumea - elongated dwarf planet with ring
/// Osculating elements: JPL Horizons, epoch JDTDB 2461227.5 (2026-07-06)
pub const HAUMEA: OrbitalElements = OrbitalElements::from_degrees(
    "Haumea",
    43.0674631,         // Semi-major axis (AU)
    0.1942906,          // Eccentricity
    28.20847,           // Inclination (degrees)
    121.78676,          // Longitude of ascending node (degrees)
    240.65590,          // Argument of perihelion (degrees)
    189.57440,          // Mean anomaly back-propagated to J2000 (degrees)
    282.639032,         // Orbital period (years)
    780.0,              // Mean radius (km) - average of ellipsoid
);

/// Sedna - extreme trans-Neptunian object
/// Osculating elements: JPL Horizons, epoch JDTDB 2461227.5 (2026-07-06)
pub const SEDNA: OrbitalElements = OrbitalElements::from_degrees(
    "Sedna",
    542.6834267,        // Semi-major axis (AU)
    0.8596223,          // Eccentricity
    11.92523,           // Inclination (degrees)
    144.50807,          // Longitude of ascending node (degrees)
    311.11034,          // Argument of perihelion (degrees)
    357.83832,          // Mean anomaly back-propagated to J2000 (degrees)
    12642.356715,       // Orbital period (years)
    497.5,              // Mean radius (km)
);

/// Quaoar - classical Kuiper belt object
/// Osculating elements: JPL Horizons, epoch JDTDB 2461227.5 (2026-07-06)
pub const QUAOAR: OrbitalElements = OrbitalElements::from_degrees(
    "Quaoar",
    43.1599534,         // Semi-major axis (AU)
    0.0351532,          // Eccentricity
    7.99161,            // Inclination (degrees)
    188.91387,          // Longitude of ascending node (degrees)
    163.02910,          // Argument of perihelion (degrees)
    259.46163,          // Mean anomaly back-propagated to J2000 (degrees)
    283.550001,         // Orbital period (years)
    545.0,              // Mean radius (km)
);

/// Gonggong - scattered disc dwarf planet (225088)
/// Osculating elements: JPL Horizons, epoch JDTDB 2461227.5 (2026-07-06)
pub const GONGGONG: OrbitalElements = OrbitalElements::from_degrees(
    "Gonggong",
    66.8666228,         // Semi-major axis (AU)
    0.5043570,          // Eccentricity
    30.90152,           // Inclination (degrees)
    336.83819,          // Longitude of ascending node (degrees)
    206.62667,          // Argument of perihelion (degrees)
    94.24058,           // Mean anomaly back-propagated to J2000 (degrees)
    546.792168,         // Orbital period (years)
    615.0,              // Mean radius (km)
);

/// Orcus - plutino (2:3 Neptune resonance)
/// Osculating elements: JPL Horizons, epoch JDTDB 2461227.5 (2026-07-06)
pub const ORCUS: OrbitalElements = OrbitalElements::from_degrees(
    "Orcus",
    39.3807142,         // Semi-major axis (AU)
    0.2204170,          // Eccentricity
    20.55710,           // Inclination (degrees)
    268.40986,          // Longitude of ascending node (degrees)
    73.54298,           // Argument of perihelion (degrees)
    150.61964,          // Mean anomaly back-propagated to J2000 (degrees)
    247.134618,         // Orbital period (years)
    458.0,              // Mean radius (km)
);

/// Varuna - large classical Kuiper belt object
/// Osculating elements: JPL Horizons, epoch JDTDB 2461227.5 (2026-07-06)
pub const VARUNA: OrbitalElements = OrbitalElements::from_degrees(
    "Varuna",
    43.2000868,         // Semi-major axis (AU)
    0.0515255,          // Eccentricity
    17.14123,           // Inclination (degrees)
    97.21741,           // Longitude of ascending node (degrees)
    273.31125,          // Argument of perihelion (degrees)
    82.20969,           // Mean anomaly back-propagated to J2000 (degrees)
    283.945592,         // Orbital period (years)
    334.0,              // Mean radius (km)
);

// =============================================================================
// Major Asteroids - Orbital elements from JPL Small-Body Database
// =============================================================================

/// Vesta (4) - second-largest asteroid, visited by Dawn spacecraft
/// Osculating elements: JPL Horizons, epoch JDTDB 2461227.5 (2026-07-06)
pub const VESTA: OrbitalElements = OrbitalElements::from_degrees(
    "Vesta",
    2.3613409,          // Semi-major axis (AU)
    0.0902130,          // Eccentricity
    7.14390,            // Inclination (degrees)
    103.70085,          // Longitude of ascending node (degrees)
    151.46181,          // Argument of perihelion (degrees)
    338.54344,          // Mean anomaly back-propagated to J2000 (degrees)
    3.628660,           // Orbital period (years)
    262.7,              // Mean radius (km)
);

/// Pallas (2) - third-largest asteroid, highly inclined orbit
/// Osculating elements: JPL Horizons, epoch JDTDB 2461227.5 (2026-07-06)
pub const PALLAS: OrbitalElements = OrbitalElements::from_degrees(
    "Pallas",
    2.7695096,          // Semi-major axis (AU)
    0.2306995,          // Eccentricity
    34.93312,           // Inclination (degrees) - unusually high!
    172.88666,          // Longitude of ascending node (degrees)
    310.97467,          // Argument of perihelion (degrees)
    349.46007,          // Mean anomaly back-propagated to J2000 (degrees)
    4.609062,           // Orbital period (years)
    256.0,              // Mean radius (km)
);

/// Hygiea (10) - fourth-largest asteroid, nearly spherical
/// Osculating elements: JPL Horizons, epoch JDTDB 2461227.5 (2026-07-06)
pub const HYGIEA: OrbitalElements = OrbitalElements::from_degrees(
    "Hygiea",
    3.1510652,          // Semi-major axis (AU)
    0.1065427,          // Eccentricity
    3.82870,            // Inclination (degrees)
    283.11644,          // Longitude of ascending node (degrees)
    312.43586,          // Argument of perihelion (degrees)
    350.66100,          // Mean anomaly back-propagated to J2000 (degrees)
    5.593637,           // Orbital period (years)
    217.0,              // Mean radius (km)
);

// =============================================================================
// Near-Earth Objects (NEOs) - Asteroids with orbits crossing Earth's
// =============================================================================

/// Apophis (99942) - potentially hazardous asteroid, close approach 2029
/// Osculating elements: JPL Horizons, epoch JDTDB 2461227.5 (2026-07-06)
///
/// LIMITATION: Apophis passes within ~0.0002 AU of Earth on 2029-04-13. That
/// encounter bends its orbit; fixed two-body elements are only valid on the
/// *near side* of the flyby. These 2026 elements track Horizons to arcminutes
/// through 2028 but are meaningless after the 2029 approach. The accuracy test
/// therefore validates Apophis only near the 2026 epoch, not at later epochs.
pub const APOPHIS: OrbitalElements = OrbitalElements::from_degrees(
    "Apophis",
    0.9223491,          // Semi-major axis (AU) - crosses Earth's orbit!
    0.1911621,          // Eccentricity
    3.34104,            // Inclination (degrees)
    203.89291,          // Longitude of ascending node (degrees)
    126.68087,          // Argument of perihelion (degrees)
    232.07492,          // Mean anomaly back-propagated to J2000 (degrees)
    0.885832,           // Orbital period (years) - less than 1 year!
    0.17,               // Mean radius (km) - ~340m diameter
);

/// Bennu (101955) - OSIRIS-REx sample return target
/// Osculating elements: JPL Horizons, epoch JDTDB 2461227.5 (2026-07-06)
///
/// LIMITATION: Bennu is a near-Earth asteroid with recurring Earth close
/// approaches (notably 2135) and modeled Yarkovsky drift. Fixed two-body
/// elements match Horizons to arcminutes near the 2026 epoch but drift over
/// years; the accuracy test validates Bennu only near the 2026 epoch.
pub const BENNU: OrbitalElements = OrbitalElements::from_degrees(
    "Bennu",
    1.1259345,          // Semi-major axis (AU)
    0.2036775,          // Eccentricity
    6.03299,            // Inclination (degrees)
    1.96654,            // Longitude of ascending node (degrees)
    66.40679,           // Argument of perihelion (degrees)
    27.02727,           // Mean anomaly back-propagated to J2000 (degrees)
    1.194752,           // Orbital period (years)
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
///
/// Thin wrapper that constructs its own [`TimeContext`]; retained for standalone
/// callers. Inside `recompute()` use [`compute_minor_body_position_with_ctx`].
pub fn compute_minor_body_position(body: MinorBody, time: &SkyTime) -> MinorBodyPosition {
    let ctx = TimeContext::new(time);
    compute_minor_body_position_with_ctx(body, &ctx)
}

/// Compute a minor body's position using a shared [`TimeContext`].
///
/// Bit-identical to [`compute_minor_body_position`]: shares Earth's heliocentric
/// vector and the true obliquity, which would otherwise be recomputed identically.
pub fn compute_minor_body_position_with_ctx(
    body: MinorBody,
    ctx: &TimeContext,
) -> MinorBodyPosition {
    let elem = body.elements();
    let jde = ctx.jde;

    // Get heliocentric position of the minor body (ecliptic coordinates, AU)
    let (body_x, body_y, body_z) = compute_heliocentric_ecliptic(elem, jde);

    // Get heliocentric position of Earth (ecliptic coordinates, AU)
    let earth_pos = ctx.earth_helio;

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
    let obliquity = ctx.true_obliquity_rad;
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
///
/// Returns a fixed-size array (matching `MinorBody::ALL`) rather than a heap-allocated
/// `Vec`, avoiding a per-call allocation in the 5 Hz orbit-worker recompute path.
pub fn compute_all_minor_body_positions(time: &SkyTime) -> [MinorBodyPosition; 15] {
    let ctx = TimeContext::new(time);
    compute_all_minor_body_positions_with_ctx(&ctx)
}

/// Compute positions for all minor bodies using a shared [`TimeContext`].
pub fn compute_all_minor_body_positions_with_ctx(
    ctx: &TimeContext,
) -> [MinorBodyPosition; 15] {
    std::array::from_fn(|i| compute_minor_body_position_with_ctx(MinorBody::ALL[i], ctx))
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
