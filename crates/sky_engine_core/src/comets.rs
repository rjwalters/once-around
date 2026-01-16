//! Comet ephemeris calculations.
//!
//! Supports elliptical (e < 1), parabolic (e = 1), and hyperbolic (e > 1) orbits.
//! Uses perihelion time and perihelion distance rather than mean anomaly at epoch.

use crate::coords::{ecliptic_to_equatorial, true_obliquity, CartesianCoord};
use crate::planets::{Planet, AU_TO_KM};
use crate::time::SkyTime;
use std::f64::consts::PI;

/// Gaussian gravitational constant squared (AU^3/day^2)
/// k = 0.01720209895 rad/day for heliocentric orbits
const K_SQUARED: f64 = 0.01720209895 * 0.01720209895;

/// Orbital elements for a comet.
/// Uses perihelion time and distance, suitable for all orbit types.
#[derive(Debug, Clone, Copy)]
pub struct CometElements {
    /// Comet name/designation
    pub name: &'static str,
    /// Perihelion distance in AU
    pub perihelion_distance_au: f64,
    /// Orbital eccentricity (0-1 = elliptical, 1 = parabolic, >1 = hyperbolic)
    pub eccentricity: f64,
    /// Inclination to ecliptic in radians
    pub inclination_rad: f64,
    /// Longitude of ascending node in radians (Ω)
    pub ascending_node_rad: f64,
    /// Argument of perihelion in radians (ω)
    pub arg_perihelion_rad: f64,
    /// Julian Date of perihelion passage
    pub perihelion_jd: f64,
    /// Absolute magnitude (H)
    pub abs_magnitude: f64,
    /// Magnitude slope parameter (typically 2.5-10 for comets)
    pub magnitude_slope: f64,
}

impl CometElements {
    /// Create comet elements from degrees (convenience constructor).
    pub const fn from_degrees(
        name: &'static str,
        perihelion_distance_au: f64,
        eccentricity: f64,
        inclination_deg: f64,
        ascending_node_deg: f64,
        arg_perihelion_deg: f64,
        perihelion_jd: f64,
        abs_magnitude: f64,
        magnitude_slope: f64,
    ) -> Self {
        let deg_to_rad = PI / 180.0;
        Self {
            name,
            perihelion_distance_au,
            eccentricity,
            inclination_rad: inclination_deg * deg_to_rad,
            ascending_node_rad: ascending_node_deg * deg_to_rad,
            arg_perihelion_rad: arg_perihelion_deg * deg_to_rad,
            perihelion_jd,
            abs_magnitude,
            magnitude_slope,
        }
    }

    /// Compute semi-major axis for elliptical orbits (a = q / (1 - e)).
    /// Returns None for parabolic/hyperbolic orbits.
    pub fn semi_major_axis(&self) -> Option<f64> {
        if self.eccentricity < 1.0 {
            Some(self.perihelion_distance_au / (1.0 - self.eccentricity))
        } else {
            None
        }
    }

    /// Compute orbital period in days for elliptical orbits.
    /// Returns None for parabolic/hyperbolic orbits.
    pub fn orbital_period_days(&self) -> Option<f64> {
        self.semi_major_axis().map(|a| {
            // P = 2π * sqrt(a³/k²) in days
            2.0 * PI * (a.powi(3) / K_SQUARED).sqrt()
        })
    }
}

// =============================================================================
// Periodic Comets - Well-known comets with multiple observed apparitions
// =============================================================================

/// 1P/Halley - Most famous periodic comet
/// Orbital elements: JPL Small-Body Database, epoch 1986 perihelion
/// Next perihelion: July 28, 2061
pub const HALLEY: CometElements = CometElements::from_degrees(
    "1P/Halley",
    0.586,              // Perihelion distance (AU)
    0.96714,            // Eccentricity
    162.26,             // Inclination (degrees) - retrograde!
    58.42,              // Longitude of ascending node (degrees)
    111.33,             // Argument of perihelion (degrees)
    2446470.5,          // Perihelion JD: Feb 9, 1986
    5.5,                // Absolute magnitude
    4.0,                // Magnitude slope
);

/// 2P/Encke - Shortest period comet (3.3 years)
/// Orbital elements: JPL Small-Body Database
pub const ENCKE: CometElements = CometElements::from_degrees(
    "2P/Encke",
    0.336,              // Perihelion distance (AU)
    0.8483,             // Eccentricity
    11.78,              // Inclination (degrees)
    334.57,             // Longitude of ascending node (degrees)
    186.54,             // Argument of perihelion (degrees)
    2460229.5,          // Perihelion JD: Oct 22, 2023
    11.0,               // Absolute magnitude (faint)
    10.0,               // Magnitude slope
);

/// 67P/Churyumov-Gerasimenko - Rosetta mission target
/// Orbital elements: JPL Small-Body Database
pub const CHURYUMOV_GERASIMENKO: CometElements = CometElements::from_degrees(
    "67P/C-G",
    1.243,              // Perihelion distance (AU)
    0.6405,             // Eccentricity
    7.04,               // Inclination (degrees)
    50.19,              // Longitude of ascending node (degrees)
    12.78,              // Argument of perihelion (degrees)
    2460585.5,          // Perihelion JD: Nov 2, 2028
    11.3,               // Absolute magnitude
    8.0,                // Magnitude slope
);

/// 46P/Wirtanen - Close approach comet, small but active
/// Orbital elements: JPL Small-Body Database
pub const WIRTANEN: CometElements = CometElements::from_degrees(
    "46P/Wirtanen",
    1.055,              // Perihelion distance (AU)
    0.6588,             // Eccentricity
    11.75,              // Inclination (degrees)
    82.16,              // Longitude of ascending node (degrees)
    356.34,             // Argument of perihelion (degrees)
    2460405.5,          // Perihelion JD: April 27, 2029
    6.8,                // Absolute magnitude
    6.0,                // Magnitude slope
);

// =============================================================================
// Notable Recent Comets - Great comets and newsworthy objects
// =============================================================================

/// C/2020 F3 (NEOWISE) - Great comet of 2020
/// Orbital elements: JPL Small-Body Database
pub const NEOWISE: CometElements = CometElements::from_degrees(
    "C/2020 F3 NEOWISE",
    0.295,              // Perihelion distance (AU)
    0.9992,             // Eccentricity (near-parabolic)
    128.94,             // Inclination (degrees) - retrograde
    61.01,              // Longitude of ascending node (degrees)
    37.28,              // Argument of perihelion (degrees)
    2459034.18,         // Perihelion JD: July 3, 2020
    6.5,                // Absolute magnitude (bright!)
    4.5,                // Magnitude slope
);

/// C/2023 A3 (Tsuchinshan-ATLAS) - Great comet of 2024
/// Orbital elements: JPL Small-Body Database
pub const TSUCHINSHAN_ATLAS: CometElements = CometElements::from_degrees(
    "C/2023 A3 T-ATLAS",
    0.391,              // Perihelion distance (AU)
    1.0001,             // Eccentricity (hyperbolic - will not return)
    139.11,             // Inclination (degrees) - retrograde
    21.55,              // Longitude of ascending node (degrees)
    308.48,             // Argument of perihelion (degrees)
    2460585.3,          // Perihelion JD: Sept 27, 2024
    4.5,                // Absolute magnitude (very bright!)
    4.0,                // Magnitude slope
);

/// C/1995 O1 (Hale-Bopp) - Great comet of 1997
/// Orbital elements: JPL Small-Body Database
pub const HALE_BOPP: CometElements = CometElements::from_degrees(
    "C/1995 O1 Hale-Bopp",
    0.914,              // Perihelion distance (AU)
    0.9951,             // Eccentricity
    89.43,              // Inclination (degrees) - nearly perpendicular
    282.47,             // Longitude of ascending node (degrees)
    130.59,             // Argument of perihelion (degrees)
    2450538.9,          // Perihelion JD: April 1, 1997
    -0.8,               // Absolute magnitude (extremely bright!)
    4.0,                // Magnitude slope
);

/// Comet identifier
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Comet {
    // Periodic comets
    Halley = 0,
    Encke = 1,
    ChuryumovGerasimenko = 2,
    Wirtanen = 3,
    // Notable comets
    Neowise = 4,
    TsuchinshanAtlas = 5,
    HaleBopp = 6,
}

impl Comet {
    pub const ALL: [Comet; 7] = [
        Comet::Halley,
        Comet::Encke,
        Comet::ChuryumovGerasimenko,
        Comet::Wirtanen,
        Comet::Neowise,
        Comet::TsuchinshanAtlas,
        Comet::HaleBopp,
    ];

    pub fn name(&self) -> &'static str {
        self.elements().name
    }

    pub fn elements(&self) -> &'static CometElements {
        match self {
            Comet::Halley => &HALLEY,
            Comet::Encke => &ENCKE,
            Comet::ChuryumovGerasimenko => &CHURYUMOV_GERASIMENKO,
            Comet::Wirtanen => &WIRTANEN,
            Comet::Neowise => &NEOWISE,
            Comet::TsuchinshanAtlas => &TSUCHINSHAN_ATLAS,
            Comet::HaleBopp => &HALE_BOPP,
        }
    }
}

/// Result of comet position calculation
pub struct CometPosition {
    pub comet: Comet,
    /// Direction from Earth (unit vector in equatorial J2000)
    pub direction: CartesianCoord,
    /// Distance from Earth in km
    pub distance_km: f64,
    /// Distance from Sun in km
    pub helio_distance_km: f64,
    /// Estimated visual magnitude
    pub magnitude: f64,
}

// =============================================================================
// Orbital Mechanics - Solvers for different orbit types
// =============================================================================

/// Solve Kepler's equation for elliptical orbits (e < 1).
/// M = E - e*sin(E)
/// Returns eccentric anomaly E.
fn solve_kepler_elliptical(mean_anomaly: f64, eccentricity: f64) -> f64 {
    let m = mean_anomaly % (2.0 * PI);
    let mut e_anomaly = m;

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

/// Solve Barker's equation for parabolic orbits (e = 1).
/// Uses the substitution s = tan(ν/2) where ν is true anomaly.
/// Returns true anomaly directly.
fn solve_barker(days_since_perihelion: f64, perihelion_distance_au: f64) -> f64 {
    // For parabolic orbit: W = (3/2) * k * t / q^(3/2)
    // where k = Gaussian constant, t = time since perihelion, q = perihelion distance
    let k = 0.01720209895; // Gaussian constant (rad/day)
    let w = 1.5 * k * days_since_perihelion / perihelion_distance_au.powf(1.5);

    // Solve Barker's equation: W = s + s³/3 where s = tan(ν/2)
    // Use Newton's method or cubic formula
    // For initial guess, use s ≈ W for small W, s ≈ W^(1/3) for large W
    let mut s = if w.abs() < 1.0 {
        w
    } else {
        w.signum() * w.abs().cbrt() * 1.5
    };

    // Newton-Raphson iteration
    for _ in 0..15 {
        let f = s + s.powi(3) / 3.0 - w;
        let df = 1.0 + s.powi(2);
        let delta = f / df;
        s -= delta;
        if delta.abs() < 1e-12 {
            break;
        }
    }

    // True anomaly: ν = 2 * arctan(s)
    2.0 * s.atan()
}

/// Solve hyperbolic Kepler equation (e > 1).
/// M = e*sinh(H) - H
/// Returns hyperbolic anomaly H.
fn solve_kepler_hyperbolic(mean_anomaly: f64, eccentricity: f64) -> f64 {
    // Initial guess
    let mut h = if mean_anomaly.abs() < 1.0 {
        mean_anomaly
    } else {
        mean_anomaly.signum() * (2.0 * mean_anomaly.abs() / eccentricity).ln()
    };

    // Newton-Raphson iteration
    for _ in 0..20 {
        let sinh_h = h.sinh();
        let cosh_h = h.cosh();
        let f = eccentricity * sinh_h - h - mean_anomaly;
        let df = eccentricity * cosh_h - 1.0;
        let delta = f / df;
        h -= delta;
        if delta.abs() < 1e-12 {
            break;
        }
    }

    h
}

/// Compute heliocentric position of a comet in ecliptic coordinates.
/// Returns (x, y, z) in AU, J2000 ecliptic frame.
fn compute_heliocentric_ecliptic_comet(elem: &CometElements, jde: f64) -> (f64, f64, f64) {
    let e = elem.eccentricity;
    let q = elem.perihelion_distance_au;

    // Days since perihelion
    let dt = jde - elem.perihelion_jd;

    // Compute true anomaly and heliocentric distance based on orbit type
    let (true_anomaly, r) = if (e - 1.0).abs() < 0.0001 {
        // Parabolic orbit (e ≈ 1)
        let nu = solve_barker(dt, q);
        let r = q * (1.0 + (nu / 2.0).tan().powi(2)); // r = q * sec²(ν/2)
        (nu, r)
    } else if e < 1.0 {
        // Elliptical orbit
        let a = q / (1.0 - e);
        let n = (K_SQUARED / a.powi(3)).sqrt(); // Mean motion (rad/day)
        let m = n * dt; // Mean anomaly

        let e_anomaly = solve_kepler_elliptical(m, e);
        let cos_e = e_anomaly.cos();

        // True anomaly from eccentric anomaly
        let nu = 2.0 * ((1.0 + e).sqrt() * (e_anomaly / 2.0).tan())
            .atan2((1.0 - e).sqrt());

        // Heliocentric distance
        let r = a * (1.0 - e * cos_e);
        (nu, r)
    } else {
        // Hyperbolic orbit (e > 1)
        let a = q / (e - 1.0); // Semi-major axis is negative for hyperbolic
        let n = (K_SQUARED / a.powi(3)).sqrt(); // Mean motion
        let m = n * dt; // Mean anomaly

        let h = solve_kepler_hyperbolic(m, e);

        // True anomaly from hyperbolic anomaly
        let nu = 2.0 * ((e + 1.0).sqrt() * (h / 2.0).tanh())
            .atan2((e - 1.0).sqrt());

        // Heliocentric distance
        let r = a * (1.0 - e * h.cosh());
        (nu, r.abs()) // r can be negative from the formula, take abs
    };

    // Position in orbital plane
    let x_orbit = r * true_anomaly.cos();
    let y_orbit = r * true_anomaly.sin();

    // Orbital elements
    let i = elem.inclination_rad;
    let omega = elem.ascending_node_rad;
    let w = elem.arg_perihelion_rad;

    // Rotation from orbital plane to ecliptic coordinates
    let cos_omega = omega.cos();
    let sin_omega = omega.sin();
    let cos_i = i.cos();
    let sin_i = i.sin();
    let cos_w = w.cos();
    let sin_w = w.sin();

    // Rotation matrix elements
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

/// Compute comet magnitude using standard formula:
/// m = H + 5*log10(Δ) + K*log10(r)
/// where Δ = geocentric distance, r = heliocentric distance
fn compute_comet_magnitude(elem: &CometElements, geo_distance_au: f64, helio_distance_au: f64) -> f64 {
    elem.abs_magnitude
        + 5.0 * geo_distance_au.log10()
        + elem.magnitude_slope * helio_distance_au.log10()
}

/// Compute position of a comet as seen from Earth.
pub fn compute_comet_position(comet: Comet, time: &SkyTime) -> CometPosition {
    let elem = comet.elements();
    let jde = time.julian_date_tdb();

    // Get heliocentric position of the comet (ecliptic coordinates, AU)
    let (comet_x, comet_y, comet_z) = compute_heliocentric_ecliptic_comet(elem, jde);

    // Get heliocentric position of Earth (ecliptic coordinates, AU)
    let earth_pos = crate::planets::heliocentric_position(Planet::Earth, jde);

    // Geocentric position of the comet (AU)
    let geo_x = comet_x - earth_pos.0;
    let geo_y = comet_y - earth_pos.1;
    let geo_z = comet_z - earth_pos.2;

    // Distances in AU
    let distance_au = (geo_x * geo_x + geo_y * geo_y + geo_z * geo_z).sqrt();
    let helio_distance_au = (comet_x * comet_x + comet_y * comet_y + comet_z * comet_z).sqrt();

    // Convert to km
    let distance_km = distance_au * AU_TO_KM;
    let helio_distance_km = helio_distance_au * AU_TO_KM;

    // Convert to spherical ecliptic coordinates
    let lon = geo_y.atan2(geo_x);
    let lat = (geo_z / distance_au).asin();

    // Convert to equatorial coordinates using true obliquity
    let obliquity = true_obliquity(jde);
    let direction = ecliptic_to_equatorial(lon, lat, obliquity).normalize();

    // Compute magnitude
    let magnitude = compute_comet_magnitude(elem, distance_au, helio_distance_au);

    CometPosition {
        comet,
        direction,
        distance_km,
        helio_distance_km,
        magnitude,
    }
}

/// Compute positions for all comets.
pub fn compute_all_comet_positions(time: &SkyTime) -> Vec<CometPosition> {
    Comet::ALL
        .iter()
        .map(|&comet| compute_comet_position(comet, time))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_halley_period() {
        // Halley's period should be about 75-76 years
        let period_days = HALLEY.orbital_period_days().unwrap();
        let period_years = period_days / 365.25;
        assert!(
            period_years > 74.0 && period_years < 78.0,
            "Halley period should be ~76 years, got {} years",
            period_years
        );
        eprintln!("Halley period: {:.2} years", period_years);
    }

    #[test]
    fn test_halley_1986_perihelion() {
        // At perihelion (Feb 9, 1986), Halley should be at ~0.586 AU from Sun
        let time = SkyTime::from_jd(2449400.5); // Feb 9, 1986
        let pos = compute_comet_position(Comet::Halley, &time);

        let helio_au = pos.helio_distance_km / AU_TO_KM;
        assert!(
            (helio_au - 0.586).abs() < 0.05,
            "Halley at perihelion should be ~0.586 AU from Sun, got {} AU",
            helio_au
        );
        eprintln!("Halley at 1986 perihelion: {:.3} AU from Sun", helio_au);
    }

    #[test]
    fn test_barker_equation() {
        // At perihelion (t=0), true anomaly should be 0
        let nu = solve_barker(0.0, 1.0);
        assert!(nu.abs() < 1e-10, "At perihelion, true anomaly should be 0");

        // Test symmetry: nu(-t) = -nu(t)
        let nu_pos = solve_barker(100.0, 1.0);
        let nu_neg = solve_barker(-100.0, 1.0);
        assert!(
            (nu_pos + nu_neg).abs() < 1e-10,
            "Barker solution should be antisymmetric"
        );
    }

    #[test]
    fn test_hyperbolic_solver() {
        // Test hyperbolic solver with e > 1
        let h = solve_kepler_hyperbolic(1.0, 1.5);
        // Verify solution: M = e*sinh(H) - H
        let m_check = 1.5 * h.sinh() - h;
        assert!(
            (m_check - 1.0).abs() < 1e-10,
            "Hyperbolic Kepler equation should be satisfied"
        );
    }

    #[test]
    fn test_neowise_2020() {
        // NEOWISE at perihelion (July 3, 2020) should be bright and close to Sun
        let time = SkyTime::from_jd(2459034.18); // July 3, 2020
        let pos = compute_comet_position(Comet::Neowise, &time);

        let helio_au = pos.helio_distance_km / AU_TO_KM;
        assert!(
            (helio_au - 0.295).abs() < 0.05,
            "NEOWISE at perihelion should be ~0.295 AU from Sun, got {} AU",
            helio_au
        );
        eprintln!(
            "NEOWISE at 2020 perihelion: {:.3} AU from Sun, magnitude {:.1}",
            helio_au, pos.magnitude
        );
    }

    #[test]
    fn test_tsuchinshan_atlas_2024() {
        // Tsuchinshan-ATLAS perihelion: Sept 27, 2024
        let time = SkyTime::from_jd(2460585.3);
        let pos = compute_comet_position(Comet::TsuchinshanAtlas, &time);

        let helio_au = pos.helio_distance_km / AU_TO_KM;
        assert!(
            (helio_au - 0.391).abs() < 0.1,
            "Tsuchinshan-ATLAS at perihelion should be ~0.391 AU from Sun, got {} AU",
            helio_au
        );
        eprintln!(
            "Tsuchinshan-ATLAS at 2024 perihelion: {:.3} AU from Sun, magnitude {:.1}",
            helio_au, pos.magnitude
        );
    }

    #[test]
    fn test_all_comets_reasonable() {
        let time = SkyTime::from_utc(2024, 10, 1, 0, 0, 0.0);

        for comet in Comet::ALL.iter() {
            let pos = compute_comet_position(*comet, &time);

            // Direction should be a unit vector
            let len = (pos.direction.x.powi(2) + pos.direction.y.powi(2) + pos.direction.z.powi(2)).sqrt();
            assert!(
                (len - 1.0).abs() < 0.001,
                "{} direction should be unit vector, got len={}",
                comet.name(), len
            );

            // Distance should be positive
            let distance_au = pos.distance_km / AU_TO_KM;
            assert!(
                distance_au > 0.01,
                "{} distance should be positive, got {} AU",
                comet.name(), distance_au
            );

            eprintln!(
                "{}: Earth dist={:.2} AU, Sun dist={:.2} AU, mag={:.1}",
                comet.name(),
                distance_au,
                pos.helio_distance_km / AU_TO_KM,
                pos.magnitude
            );
        }
    }

    #[test]
    fn test_encke_short_period() {
        // Encke has a ~3.3 year period
        let period_days = ENCKE.orbital_period_days().unwrap();
        let period_years = period_days / 365.25;
        assert!(
            period_years > 3.0 && period_years < 4.0,
            "Encke period should be ~3.3 years, got {} years",
            period_years
        );
        eprintln!("Encke period: {:.2} years", period_years);
    }
}
