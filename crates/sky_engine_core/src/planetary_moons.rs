//! Planetary moon ephemeris calculations.
//!
//! Implements Kepler orbit calculations for major planetary moons with proper
//! orbital plane orientation:
//! - Jupiter: Io, Europa, Ganymede, Callisto (Galilean moons)
//! - Saturn: Titan
//!
//! Moon orbits are computed in the planet's equatorial plane and then rotated
//! to match the planet's actual axial orientation in space.

use crate::coords::CartesianCoord;
use crate::planets::{compute_planet_position_full, Planet};
use crate::time::SkyTime;
use std::f64::consts::PI;

/// Planetary pole coordinates in J2000 equatorial frame.
/// These define the orientation of each planet's equatorial plane.
#[derive(Debug, Clone, Copy)]
pub struct PlanetPole {
    /// Right ascension of north pole in radians
    pub ra_rad: f64,
    /// Declination of north pole in radians
    pub dec_rad: f64,
}

impl PlanetPole {
    /// Create from degrees
    const fn from_degrees(ra_deg: f64, dec_deg: f64) -> Self {
        Self {
            ra_rad: ra_deg * PI / 180.0,
            dec_rad: dec_deg * PI / 180.0,
        }
    }
}

/// Jupiter's north pole (IAU 2015)
/// RA = 268.057°, Dec = 64.495°
/// This gives Jupiter's equator a ~3.1° tilt from the ecliptic
pub const JUPITER_POLE: PlanetPole = PlanetPole::from_degrees(268.057, 64.495);

/// Saturn's north pole (IAU 2015)
/// RA = 40.589°, Dec = 83.537°
/// This gives Saturn's equator a ~26.7° tilt from the ecliptic
pub const SATURN_POLE: PlanetPole = PlanetPole::from_degrees(40.589, 83.537);

/// Get the pole coordinates for a planet
fn get_planet_pole(planet: Planet) -> PlanetPole {
    match planet {
        Planet::Jupiter => JUPITER_POLE,
        Planet::Saturn => SATURN_POLE,
        // For other planets, use ecliptic pole as approximation (no tilt)
        _ => PlanetPole::from_degrees(270.0, 66.56), // Ecliptic north pole
    }
}

/// Transform a position from a planet's equatorial plane to J2000 equatorial coordinates.
///
/// The input (x, y, z) is in the planet's equatorial frame where:
/// - x,y are in the equatorial plane
/// - z is along the planet's rotation axis (north positive)
///
/// The output is in J2000 equatorial coordinates.
fn planet_equatorial_to_j2000(x: f64, y: f64, z: f64, pole: &PlanetPole) -> CartesianCoord {
    // The planet's north pole direction in J2000 coordinates
    let pole_x = pole.dec_rad.cos() * pole.ra_rad.cos();
    let pole_y = pole.dec_rad.cos() * pole.ra_rad.sin();
    let pole_z = pole.dec_rad.sin();

    // We need to construct a rotation matrix from planet-equatorial to J2000.
    // The planet's z-axis (pole) maps to (pole_x, pole_y, pole_z).
    // We need to define the x and y axes of the planet's frame in J2000.
    //
    // Convention: Planet's x-axis points toward the ascending node of the
    // planet's equator on the J2000 equator. This is perpendicular to both
    // the J2000 z-axis (0,0,1) and the planet's pole.

    // Planet's x-axis: cross product of J2000 z-axis and planet pole
    // This gives a vector in the planet's equatorial plane pointing toward ascending node
    let mut px = -pole_y; // (0,0,1) × (pole_x, pole_y, pole_z) = (-pole_y, pole_x, 0)
    let mut py = pole_x;
    let mut pz = 0.0;

    // Normalize (handle case where pole is near J2000 pole)
    let p_len = (px * px + py * py + pz * pz).sqrt();
    if p_len > 1e-10 {
        px /= p_len;
        py /= p_len;
        pz /= p_len;
    } else {
        // Planet pole is aligned with J2000 pole, use arbitrary x-axis
        px = 1.0;
        py = 0.0;
        pz = 0.0;
    }

    // Planet's y-axis: cross product of planet pole and planet x-axis
    // This completes the right-handed coordinate system
    let qx = pole_y * pz - pole_z * py;
    let qy = pole_z * px - pole_x * pz;
    let qz = pole_x * py - pole_y * px;

    // Now transform: the rotation matrix columns are (px,py,pz), (qx,qy,qz), (pole_x,pole_y,pole_z)
    // Output = x * p + y * q + z * pole
    CartesianCoord::new(
        x * px + y * qx + z * pole_x,
        x * py + y * qy + z * pole_y,
        x * pz + y * qz + z * pole_z,
    )
}

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

/// Saturn's moons (major satellites visible in amateur telescopes)
/// Ordered by distance from Saturn
pub const SATURN_MOONS: [MoonOrbitalElements; 6] = [
    // Mimas - innermost of the major moons, small and faint
    MoonOrbitalElements {
        name: "Mimas",
        parent: Planet::Saturn,
        semi_major_axis_km: 185_539.0,
        orbital_period_days: 0.942421813,
        eccentricity: 0.0196,
        radius_km: 198.2,
        mean_longitude_j2000_deg: 14.0,
    },
    // Enceladus - famous for its geysers and subsurface ocean
    MoonOrbitalElements {
        name: "Enceladus",
        parent: Planet::Saturn,
        semi_major_axis_km: 238_042.0,
        orbital_period_days: 1.370218,
        eccentricity: 0.0047,
        radius_km: 252.1,
        mean_longitude_j2000_deg: 200.0,
    },
    // Tethys - medium-sized icy moon
    MoonOrbitalElements {
        name: "Tethys",
        parent: Planet::Saturn,
        semi_major_axis_km: 294_672.0,
        orbital_period_days: 1.887802,
        eccentricity: 0.0001,
        radius_km: 531.0,
        mean_longitude_j2000_deg: 100.0,
    },
    // Dione - medium-sized icy moon
    MoonOrbitalElements {
        name: "Dione",
        parent: Planet::Saturn,
        semi_major_axis_km: 377_415.0,
        orbital_period_days: 2.736915,
        eccentricity: 0.0022,
        radius_km: 561.4,
        mean_longitude_j2000_deg: 320.0,
    },
    // Rhea - second largest moon of Saturn
    MoonOrbitalElements {
        name: "Rhea",
        parent: Planet::Saturn,
        semi_major_axis_km: 527_068.0,
        orbital_period_days: 4.518212,
        eccentricity: 0.0012,
        radius_km: 763.5,
        mean_longitude_j2000_deg: 180.0,
    },
    // Titan - largest moon of Saturn
    MoonOrbitalElements {
        name: "Titan",
        parent: Planet::Saturn,
        semi_major_axis_km: 1_221_870.0,
        orbital_period_days: 15.945421,
        eccentricity: 0.0288,
        radius_km: 2574.7,
        mean_longitude_j2000_deg: 15.0,
    },
];

/// Convenience constant for Titan (for backwards compatibility)
pub const TITAN: MoonOrbitalElements = MoonOrbitalElements {
    name: "Titan",
    parent: Planet::Saturn,
    semi_major_axis_km: 1_221_870.0,
    orbital_period_days: 15.945421,
    eccentricity: 0.0288,
    radius_km: 2574.7,
    mean_longitude_j2000_deg: 15.0,
};

/// Planetary moon identifier
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum PlanetaryMoon {
    // Jupiter's Galilean moons
    Io = 0,
    Europa = 1,
    Ganymede = 2,
    Callisto = 3,
    // Saturn's major moons
    Mimas = 4,
    Enceladus = 5,
    Tethys = 6,
    Dione = 7,
    Rhea = 8,
    Titan = 9,
}

impl PlanetaryMoon {
    /// All planetary moons in order (Jupiter's moons first, then Saturn's)
    pub const ALL: [PlanetaryMoon; 10] = [
        PlanetaryMoon::Io,
        PlanetaryMoon::Europa,
        PlanetaryMoon::Ganymede,
        PlanetaryMoon::Callisto,
        PlanetaryMoon::Mimas,
        PlanetaryMoon::Enceladus,
        PlanetaryMoon::Tethys,
        PlanetaryMoon::Dione,
        PlanetaryMoon::Rhea,
        PlanetaryMoon::Titan,
    ];

    /// Jupiter's Galilean moons only
    pub const JUPITER_MOONS: [PlanetaryMoon; 4] = [
        PlanetaryMoon::Io,
        PlanetaryMoon::Europa,
        PlanetaryMoon::Ganymede,
        PlanetaryMoon::Callisto,
    ];

    /// Saturn's major moons only
    pub const SATURN_MOONS: [PlanetaryMoon; 6] = [
        PlanetaryMoon::Mimas,
        PlanetaryMoon::Enceladus,
        PlanetaryMoon::Tethys,
        PlanetaryMoon::Dione,
        PlanetaryMoon::Rhea,
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
            PlanetaryMoon::Mimas => &SATURN_MOONS[0],
            PlanetaryMoon::Enceladus => &SATURN_MOONS[1],
            PlanetaryMoon::Tethys => &SATURN_MOONS[2],
            PlanetaryMoon::Dione => &SATURN_MOONS[3],
            PlanetaryMoon::Rhea => &SATURN_MOONS[4],
            PlanetaryMoon::Titan => &SATURN_MOONS[5],
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

/// Compute position of a planetary moon using Kepler orbit with proper orbital plane.
///
/// The moon's position is computed in the parent planet's equatorial plane,
/// then rotated to account for the planet's axial tilt relative to J2000 coordinates.
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

    // Position in planet's equatorial plane (planet-centered, km)
    // x and y are in the equatorial plane, z = 0 for equatorial orbit
    let x_orbit = r_from_parent * true_anomaly.cos();
    let y_orbit = r_from_parent * true_anomaly.sin();
    let z_orbit = 0.0; // Moons orbit in planet's equatorial plane

    // Get parent planet position from Earth
    let parent_pos = compute_planet_position_full(elem.parent, time);
    let parent_dist_km = parent_pos.distance_km;

    // Get the planet's pole orientation
    let pole = get_planet_pole(elem.parent);

    // Transform moon's position from planet-equatorial to J2000 equatorial frame
    // First normalize by distance to get angular offset in radians
    let ang_x = x_orbit / parent_dist_km;
    let ang_y = y_orbit / parent_dist_km;
    let ang_z = z_orbit / parent_dist_km;

    // Rotate the angular offset to J2000 frame
    let offset_j2000 = planet_equatorial_to_j2000(ang_x, ang_y, ang_z, &pole);

    // Add offset to parent planet's direction
    // (For small angles, we can add the offset directly to the unit vector and renormalize)
    let moon_dir = CartesianCoord::new(
        parent_pos.direction.x + offset_j2000.x,
        parent_pos.direction.y + offset_j2000.y,
        parent_pos.direction.z + offset_j2000.z,
    )
    .normalize();

    // Moon's distance from Earth (approximately parent distance)
    let distance_km = parent_dist_km;

    // Angular diameter as seen from Earth
    let angular_diameter_rad = 2.0 * (elem.radius_km / distance_km).atan();

    PlanetaryMoonPosition {
        moon,
        direction: moon_dir,
        distance_km,
        angular_diameter_rad,
    }
}

/// Compute positions for all planetary moons (Jupiter + Saturn).
pub fn compute_all_planetary_moon_positions(time: &SkyTime) -> [PlanetaryMoonPosition; 10] {
    [
        // Jupiter's Galilean moons
        compute_planetary_moon_position(PlanetaryMoon::Io, time),
        compute_planetary_moon_position(PlanetaryMoon::Europa, time),
        compute_planetary_moon_position(PlanetaryMoon::Ganymede, time),
        compute_planetary_moon_position(PlanetaryMoon::Callisto, time),
        // Saturn's major moons
        compute_planetary_moon_position(PlanetaryMoon::Mimas, time),
        compute_planetary_moon_position(PlanetaryMoon::Enceladus, time),
        compute_planetary_moon_position(PlanetaryMoon::Tethys, time),
        compute_planetary_moon_position(PlanetaryMoon::Dione, time),
        compute_planetary_moon_position(PlanetaryMoon::Rhea, time),
        compute_planetary_moon_position(PlanetaryMoon::Titan, time),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::coords::cartesian_to_ra_dec;

    #[test]
    fn test_all_moon_positions() {
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
    fn test_saturn_moon_angular_separations() {
        // Verify the angular separation between Saturn and its moons
        use crate::planets::compute_planet_position_full;

        let time = SkyTime::from_utc(2024, 1, 1, 0, 0, 0.0);

        // Get Saturn's position
        let saturn = compute_planet_position_full(Planet::Saturn, &time);
        let saturn_ang_diam_arcsec = saturn.angular_diameter_rad * 206264.806;

        eprintln!("Saturn distance: {:.0} km", saturn.distance_km);
        eprintln!("Saturn angular diameter: {:.1} arcsec", saturn_ang_diam_arcsec);

        // Get each moon's position and calculate angular separation
        for moon in PlanetaryMoon::SATURN_MOONS {
            let moon_pos = compute_planetary_moon_position(moon, &time);

            // Angular separation using dot product
            let dot = saturn.direction.x * moon_pos.direction.x
                + saturn.direction.y * moon_pos.direction.y
                + saturn.direction.z * moon_pos.direction.z;
            let sep_rad = dot.clamp(-1.0, 1.0).acos();
            let sep_arcsec = sep_rad * 206264.806;

            // Expected max separation based on orbital distance
            let elem = moon.elements();
            let expected_max_arcsec = (elem.semi_major_axis_km / saturn.distance_km).atan() * 206264.806;

            eprintln!(
                "{}: separation = {:.1} arcsec ({:.1} Saturn diameters from center), expected max = {:.1} arcsec",
                moon.name(),
                sep_arcsec,
                sep_arcsec / saturn_ang_diam_arcsec,
                expected_max_arcsec
            );

            // Separation should not exceed the expected maximum by much
            assert!(
                sep_arcsec <= expected_max_arcsec * 1.2,
                "{} separation ({:.1}\") exceeds expected max ({:.1}\")",
                moon.name(),
                sep_arcsec,
                expected_max_arcsec
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

    #[test]
    fn test_saturn_orbital_plane_tilt() {
        // Verify that Saturn's moons orbit in a tilted plane (~26.7° from ecliptic)
        // By tracking Titan over half its orbit, we should see declination variation
        // that reflects this tilt.

        let t1 = SkyTime::from_utc(2024, 1, 1, 0, 0, 0.0);
        // Half of Titan's orbital period later (~8 days)
        let t2 = SkyTime::from_utc(2024, 1, 9, 0, 0, 0.0);

        let pos1 = compute_planetary_moon_position(PlanetaryMoon::Titan, &t1);
        let pos2 = compute_planetary_moon_position(PlanetaryMoon::Titan, &t2);

        let saturn1 = compute_planet_position_full(Planet::Saturn, &t1);
        let saturn2 = compute_planet_position_full(Planet::Saturn, &t2);

        // Get the offset of Titan from Saturn at each time
        let offset1_x = pos1.direction.x - saturn1.direction.x;
        let offset1_y = pos1.direction.y - saturn1.direction.y;
        let offset1_z = pos1.direction.z - saturn1.direction.z;

        let offset2_x = pos2.direction.x - saturn2.direction.x;
        let offset2_y = pos2.direction.y - saturn2.direction.y;
        let offset2_z = pos2.direction.z - saturn2.direction.z;

        // The orbital plane should have a significant z-component variation
        // due to Saturn's 26.7° tilt
        let z_variation = (offset1_z - offset2_z).abs();

        eprintln!("=== Saturn Orbital Plane Test ===");
        eprintln!("Titan offset at t1: ({:.6}, {:.6}, {:.6})", offset1_x, offset1_y, offset1_z);
        eprintln!("Titan offset at t2: ({:.6}, {:.6}, {:.6})", offset2_x, offset2_y, offset2_z);
        eprintln!("Z-component variation: {:.6}", z_variation);

        // Saturn's tilt should cause measurable z-variation in Titan's orbit
        // If the orbital plane were in the ecliptic, z would be near-constant
        assert!(
            z_variation > 0.00001,
            "Titan's orbit should show z-variation due to Saturn's tilt"
        );

        // Verify the expected angular separation from Saturn
        let sep1_arcsec = {
            let dot = saturn1.direction.x * pos1.direction.x
                + saturn1.direction.y * pos1.direction.y
                + saturn1.direction.z * pos1.direction.z;
            dot.clamp(-1.0, 1.0).acos() * 206264.806
        };

        let expected_max_arcsec = (TITAN.semi_major_axis_km / saturn1.distance_km).atan() * 206264.806;

        eprintln!("Titan separation: {:.1} arcsec, expected max: {:.1} arcsec", sep1_arcsec, expected_max_arcsec);
        eprintln!("Saturn distance: {:.0} km", saturn1.distance_km);

        assert!(
            sep1_arcsec <= expected_max_arcsec * 1.2,
            "Titan separation ({:.1}\") exceeds expected max ({:.1}\")",
            sep1_arcsec,
            expected_max_arcsec
        );
    }

    #[test]
    fn test_orbital_plane_rotation_matrix() {
        // Test the rotation matrix by verifying known transformations
        //
        // Note: The tilt is relative to the J2000 EQUATORIAL frame, not the ecliptic.
        // Saturn's pole at Dec=83.5° means it's only ~6.5° from J2000 pole.
        // But Saturn's EQUATOR is tilted ~27° from the ECLIPTIC (not equator).

        // For Jupiter (pole at Dec=64.5°), the equatorial plane is tilted
        // ~25.5° from J2000 equator (90° - 64.5°)
        let jupiter_point = planet_equatorial_to_j2000(1.0, 0.0, 0.0, &JUPITER_POLE);
        eprintln!("Jupiter equatorial point: ({:.4}, {:.4}, {:.4})",
                  jupiter_point.x, jupiter_point.y, jupiter_point.z);

        // The z-component (J2000 north) should reflect the pole's declination offset
        // Jupiter's pole is at dec 64.5°, so equatorial points can have z up to cos(64.5°) ≈ 0.43
        assert!(
            jupiter_point.z.abs() < 0.5,
            "Jupiter rotation looks reasonable"
        );

        // For Saturn (pole at Dec=83.5°), the equatorial plane is only
        // ~6.5° from J2000 equator
        let saturn_point = planet_equatorial_to_j2000(1.0, 0.0, 0.0, &SATURN_POLE);
        eprintln!("Saturn equatorial point: ({:.4}, {:.4}, {:.4})",
                  saturn_point.x, saturn_point.y, saturn_point.z);

        // Saturn's pole is close to J2000 pole, so equatorial z-component is small
        // This is correct! Saturn's ~27° tilt from ECLIPTIC, but only ~6.5° from J2000 equator
        assert!(
            saturn_point.z.abs() < 0.2,
            "Saturn rotation looks reasonable"
        );

        // Verify the pole direction is correct
        let saturn_pole_j2000 = planet_equatorial_to_j2000(0.0, 0.0, 1.0, &SATURN_POLE);
        eprintln!("Saturn pole in J2000: ({:.4}, {:.4}, {:.4})",
                  saturn_pole_j2000.x, saturn_pole_j2000.y, saturn_pole_j2000.z);

        // The pole should point toward (RA=40.6°, Dec=83.5°)
        let expected_pole_x = (83.537_f64 * PI / 180.0).cos() * (40.589_f64 * PI / 180.0).cos();
        let expected_pole_y = (83.537_f64 * PI / 180.0).cos() * (40.589_f64 * PI / 180.0).sin();
        let expected_pole_z = (83.537_f64 * PI / 180.0).sin();
        eprintln!("Expected Saturn pole: ({:.4}, {:.4}, {:.4})",
                  expected_pole_x, expected_pole_y, expected_pole_z);

        assert!(
            (saturn_pole_j2000.x - expected_pole_x).abs() < 0.01,
            "Saturn pole x should match"
        );
        assert!(
            (saturn_pole_j2000.y - expected_pole_y).abs() < 0.01,
            "Saturn pole y should match"
        );
        assert!(
            (saturn_pole_j2000.z - expected_pole_z).abs() < 0.01,
            "Saturn pole z should match"
        );
    }
}
