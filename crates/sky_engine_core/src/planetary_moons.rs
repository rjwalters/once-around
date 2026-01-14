//! Planetary moon ephemeris calculations.
//!
//! Implements simplified Kepler orbit calculations for major planetary moons:
//! - Jupiter: Io, Europa, Ganymede, Callisto (Galilean moons)
//! - Saturn: Titan

use crate::coords::{cartesian_to_ra_dec, CartesianCoord};
use crate::planets::{compute_planet_position_full, Planet};
use crate::time::SkyTime;
use std::f64::consts::PI;

/// Orbital elements for a planetary moon.
#[derive(Debug, Clone, Copy)]
pub struct MoonOrbitalElements {
    pub name: &'static str,
    pub parent: Planet,
    /// Semi-major axis in km
    pub semi_major_axis_km: f64,
    /// Orbital period in days
    pub orbital_period_days: f64,
    /// Orbital eccentricity
    pub eccentricity: f64,
    /// Moon radius in km
    pub radius_km: f64,
    /// Mean longitude at J2000 epoch (degrees)
    pub mean_longitude_j2000_deg: f64,
}

/// Galilean moons of Jupiter
pub const GALILEAN_MOONS: [MoonOrbitalElements; 4] = [
    MoonOrbitalElements {
        name: "Io",
        parent: Planet::Jupiter,
        semi_major_axis_km: 421_700.0,
        orbital_period_days: 1.769137786,
        eccentricity: 0.0041,
        radius_km: 1821.6,
        mean_longitude_j2000_deg: 200.39,
    },
    MoonOrbitalElements {
        name: "Europa",
        parent: Planet::Jupiter,
        semi_major_axis_km: 671_034.0,
        orbital_period_days: 3.551181041,
        eccentricity: 0.0094,
        radius_km: 1560.8,
        mean_longitude_j2000_deg: 36.39,
    },
    MoonOrbitalElements {
        name: "Ganymede",
        parent: Planet::Jupiter,
        semi_major_axis_km: 1_070_412.0,
        orbital_period_days: 7.15455296,
        eccentricity: 0.0013,
        radius_km: 2634.1,
        mean_longitude_j2000_deg: 180.57,
    },
    MoonOrbitalElements {
        name: "Callisto",
        parent: Planet::Jupiter,
        semi_major_axis_km: 1_882_709.0,
        orbital_period_days: 16.6890184,
        eccentricity: 0.0074,
        radius_km: 2410.3,
        mean_longitude_j2000_deg: 180.16,
    },
];

/// Saturn's largest moon
pub const TITAN: MoonOrbitalElements = MoonOrbitalElements {
    name: "Titan",
    parent: Planet::Saturn,
    semi_major_axis_km: 1_221_870.0,
    orbital_period_days: 15.945,
    eccentricity: 0.0288,
    radius_km: 2574.7,
    mean_longitude_j2000_deg: 15.0,
};

/// Planetary moon identifier
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum PlanetaryMoon {
    Io = 0,
    Europa = 1,
    Ganymede = 2,
    Callisto = 3,
    Titan = 4,
}

impl PlanetaryMoon {
    pub const ALL: [PlanetaryMoon; 5] = [
        PlanetaryMoon::Io,
        PlanetaryMoon::Europa,
        PlanetaryMoon::Ganymede,
        PlanetaryMoon::Callisto,
        PlanetaryMoon::Titan,
    ];

    pub fn name(&self) -> &'static str {
        self.elements().name
    }

    pub fn elements(&self) -> &'static MoonOrbitalElements {
        match self {
            PlanetaryMoon::Io => &GALILEAN_MOONS[0],
            PlanetaryMoon::Europa => &GALILEAN_MOONS[1],
            PlanetaryMoon::Ganymede => &GALILEAN_MOONS[2],
            PlanetaryMoon::Callisto => &GALILEAN_MOONS[3],
            PlanetaryMoon::Titan => &TITAN,
        }
    }

    pub fn parent(&self) -> Planet {
        self.elements().parent
    }
}

/// Result of planetary moon position calculation
pub struct PlanetaryMoonPosition {
    pub moon: PlanetaryMoon,
    /// Direction from Earth (unit vector in equatorial J2000)
    pub direction: CartesianCoord,
    /// Distance from Earth in km
    pub distance_km: f64,
    /// Angular diameter as seen from Earth (radians)
    pub angular_diameter_rad: f64,
}

/// Compute position of a planetary moon using simplified Kepler orbit.
pub fn compute_planetary_moon_position(
    moon: PlanetaryMoon,
    time: &SkyTime,
) -> PlanetaryMoonPosition {
    let elem = moon.elements();
    let jde = time.julian_date_tdb();

    // Days since J2000 epoch
    let t = jde - 2451545.0;

    // Mean motion (degrees per day)
    let n = 360.0 / elem.orbital_period_days;

    // Mean anomaly at current time
    let m_deg = (elem.mean_longitude_j2000_deg + n * t) % 360.0;
    let m_rad = m_deg * PI / 180.0;

    // Solve Kepler's equation: E - e*sin(E) = M
    // Using Newton-Raphson iteration
    let e = elem.eccentricity;
    let mut eccentric_anomaly = m_rad;
    for _ in 0..5 {
        let delta = (eccentric_anomaly - e * eccentric_anomaly.sin() - m_rad)
            / (1.0 - e * eccentric_anomaly.cos());
        eccentric_anomaly -= delta;
    }

    // True anomaly
    let cos_e = eccentric_anomaly.cos();
    let true_anomaly = 2.0
        * ((1.0 + e).sqrt() * (eccentric_anomaly / 2.0).tan())
            .atan2((1.0 - e).sqrt());

    // Distance from parent planet (in km)
    let r_from_parent = elem.semi_major_axis_km * (1.0 - e * cos_e);

    // Position in orbital plane (planet-centered, km)
    let x_orbit = r_from_parent * true_anomaly.cos();
    let y_orbit = r_from_parent * true_anomaly.sin();

    // Get parent planet position from Earth
    let parent_pos = compute_planet_position_full(elem.parent, time);
    let parent_dist_km = parent_pos.distance_km;

    // Convert moon's orbital position to angular offset from parent
    // The Galilean moons orbit roughly in Jupiter's equatorial plane,
    // which is tilted ~3° to the ecliptic. For simplicity, we assume
    // the orbit is roughly in the ecliptic plane when viewed from Earth.
    //
    // Angular offset = arctan(orbital_distance / parent_distance)
    let angular_offset_x = (x_orbit / parent_dist_km).atan();
    let angular_offset_y = (y_orbit / parent_dist_km).atan();

    // Get parent's RA/Dec and offset the moon's position
    let (parent_ra, parent_dec) = cartesian_to_ra_dec(&parent_pos.direction);

    // Apply angular offset (simplified - doesn't account for orbital inclination)
    let moon_ra = parent_ra + angular_offset_x;
    let moon_dec = (parent_dec + angular_offset_y).clamp(-PI / 2.0 + 0.01, PI / 2.0 - 0.01);

    let direction = CartesianCoord::from_ra_dec_rad(moon_ra, moon_dec);

    // Moon's distance from Earth (approximately parent distance)
    let distance_km = parent_dist_km;

    // Angular diameter as seen from Earth
    let angular_diameter_rad = 2.0 * (elem.radius_km / distance_km).atan();

    PlanetaryMoonPosition {
        moon,
        direction,
        distance_km,
        angular_diameter_rad,
    }
}

/// Compute positions for all planetary moons.
pub fn compute_all_planetary_moon_positions(time: &SkyTime) -> [PlanetaryMoonPosition; 5] {
    [
        compute_planetary_moon_position(PlanetaryMoon::Io, time),
        compute_planetary_moon_position(PlanetaryMoon::Europa, time),
        compute_planetary_moon_position(PlanetaryMoon::Ganymede, time),
        compute_planetary_moon_position(PlanetaryMoon::Callisto, time),
        compute_planetary_moon_position(PlanetaryMoon::Titan, time),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_galilean_moon_positions() {
        let time = SkyTime::from_utc(2024, 1, 1, 0, 0, 0.0);

        for moon in PlanetaryMoon::ALL {
            let pos = compute_planetary_moon_position(moon, &time);

            // Direction should be a unit vector
            let len = (pos.direction.x.powi(2)
                + pos.direction.y.powi(2)
                + pos.direction.z.powi(2))
            .sqrt();
            assert!(
                (len - 1.0).abs() < 0.001,
                "{} direction should be unit vector, got len={}",
                moon.name(),
                len
            );

            // Angular diameter should be tiny but positive
            assert!(
                pos.angular_diameter_rad > 0.0 && pos.angular_diameter_rad < 0.001,
                "{} angular diameter should be small positive: {}",
                moon.name(),
                pos.angular_diameter_rad
            );
        }
    }

    #[test]
    fn test_io_orbit_period() {
        // Io has a ~1.77 day period
        // After half a period, it should be on opposite side of Jupiter
        let t1 = SkyTime::from_utc(2024, 1, 1, 0, 0, 0.0);
        let t2 = SkyTime::from_utc(2024, 1, 1, 21, 15, 0.0); // ~0.885 days later

        let pos1 = compute_planetary_moon_position(PlanetaryMoon::Io, &t1);
        let pos2 = compute_planetary_moon_position(PlanetaryMoon::Io, &t2);

        // Positions should be different
        let diff = (pos1.direction.x - pos2.direction.x).abs()
            + (pos1.direction.y - pos2.direction.y).abs()
            + (pos1.direction.z - pos2.direction.z).abs();
        assert!(
            diff > 0.0001,
            "Io should have moved after half a period"
        );
    }

    #[test]
    fn test_jupiter_moon_angular_separation() {
        // Verify the angular separation between Jupiter and its moons is correct
        use crate::planets::compute_planet_position_full;

        let time = SkyTime::from_utc(2024, 1, 1, 0, 0, 0.0);

        // Get Jupiter's position
        let jupiter = compute_planet_position_full(Planet::Jupiter, &time);
        let (jup_ra, jup_dec) = cartesian_to_ra_dec(&jupiter.direction);
        let jupiter_ang_diam_arcsec = jupiter.angular_diameter_rad * 206264.806;

        println!("Jupiter distance: {:.0} km", jupiter.distance_km);
        println!("Jupiter angular diameter: {:.1} arcsec", jupiter_ang_diam_arcsec);

        // Get each moon's position and calculate angular separation
        for moon in [PlanetaryMoon::Io, PlanetaryMoon::Europa, PlanetaryMoon::Ganymede, PlanetaryMoon::Callisto] {
            let moon_pos = compute_planetary_moon_position(moon, &time);
            let (moon_ra, moon_dec) = cartesian_to_ra_dec(&moon_pos.direction);

            // Angular separation using dot product
            let dot = jupiter.direction.x * moon_pos.direction.x
                + jupiter.direction.y * moon_pos.direction.y
                + jupiter.direction.z * moon_pos.direction.z;
            let sep_rad = dot.clamp(-1.0, 1.0).acos();
            let sep_arcsec = sep_rad * 206264.806;

            // Expected max separation based on orbital distance
            let elem = moon.elements();
            let expected_max_arcsec = (elem.semi_major_axis_km / jupiter.distance_km).atan() * 206264.806;

            println!(
                "{}: separation = {:.1} arcsec ({:.1} Jupiter diameters from center), expected max = {:.1} arcsec",
                moon.name(),
                sep_arcsec,
                sep_arcsec / jupiter_ang_diam_arcsec,
                expected_max_arcsec
            );

            // Separation should not exceed the expected maximum by much
            // (allowing some margin for orbital eccentricity and phase)
            assert!(
                sep_arcsec <= expected_max_arcsec * 1.2,
                "{} separation ({:.1}\") exceeds expected max ({:.1}\")",
                moon.name(),
                sep_arcsec,
                expected_max_arcsec
            );
        }
    }
}
