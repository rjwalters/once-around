//! Satellite ephemeris and visibility calculations.
//!
//! Supports multiple satellites (ISS, Hubble, etc.) using pre-computed
//! ephemeris data with interpolation for accurate positioning.
//! Includes Earth shadow calculations for visibility determination.

use crate::coords::{compute_gmst, CartesianCoord};
use crate::planets::{heliocentric_position, Planet, AU_TO_KM};
use crate::time::SkyTime;
use std::f64::consts::PI;

/// Earth's mean equatorial radius in km
const EARTH_RADIUS_KM: f64 = 6378.137;

/// Identifier for supported satellites.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SatelliteId {
    /// International Space Station (NORAD ID: 25544)
    ISS,
    /// Hubble Space Telescope (NORAD ID: 20580)
    Hubble,
}

impl SatelliteId {
    /// All supported satellites.
    pub const ALL: &'static [SatelliteId] = &[SatelliteId::ISS, SatelliteId::Hubble];

    /// Get the human-readable name for this satellite.
    pub fn name(&self) -> &'static str {
        match self {
            SatelliteId::ISS => "ISS",
            SatelliteId::Hubble => "Hubble",
        }
    }

    /// Get the full name for this satellite.
    pub fn full_name(&self) -> &'static str {
        match self {
            SatelliteId::ISS => "International Space Station",
            SatelliteId::Hubble => "Hubble Space Telescope",
        }
    }

    /// Get the JPL Horizons ID for this satellite.
    pub fn horizons_id(&self) -> i32 {
        match self {
            SatelliteId::ISS => -125544,
            SatelliteId::Hubble => -48,
        }
    }

    /// Get the index in the satellite array (for buffer access).
    pub fn index(&self) -> usize {
        match self {
            SatelliteId::ISS => 0,
            SatelliteId::Hubble => 1,
        }
    }

    /// Get a satellite by its index.
    pub fn from_index(index: usize) -> Option<SatelliteId> {
        Self::ALL.get(index).copied()
    }
}

/// A single ephemeris point for a satellite.
/// Contains position in ECI (Earth-Centered Inertial) J2000 coordinates.
#[derive(Debug, Clone, Copy)]
pub struct SatelliteEphemerisPoint {
    /// Julian Date (TDB)
    pub jd: f64,
    /// X position in km (ECI J2000)
    pub x_km: f64,
    /// Y position in km (ECI J2000)
    pub y_km: f64,
    /// Z position in km (ECI J2000)
    pub z_km: f64,
}

/// Satellite ephemeris container with interpolation support.
#[derive(Debug, Clone)]
pub struct SatelliteEphemeris {
    /// Which satellite this ephemeris is for
    id: SatelliteId,
    /// Sorted ephemeris points (by Julian Date)
    points: Vec<SatelliteEphemerisPoint>,
}

impl SatelliteEphemeris {
    /// Create a new ephemeris from a list of points.
    /// Points will be sorted by Julian Date.
    pub fn new(id: SatelliteId, mut points: Vec<SatelliteEphemerisPoint>) -> Self {
        points.sort_by(|a, b| a.jd.partial_cmp(&b.jd).unwrap());
        Self { id, points }
    }

    /// Create from binary data.
    /// Format: [count: u32] followed by [jd: f64, x: f64, y: f64, z: f64] for each point.
    pub fn from_binary(id: SatelliteId, data: &[u8]) -> Result<Self, &'static str> {
        if data.len() < 4 {
            return Err("Satellite ephemeris data too short");
        }

        let count = u32::from_le_bytes([data[0], data[1], data[2], data[3]]) as usize;
        let expected_len = 4 + count * 32; // 4 bytes header + 32 bytes per point (4 f64s)

        if data.len() < expected_len {
            return Err("Satellite ephemeris data truncated");
        }

        let mut points = Vec::with_capacity(count);
        let mut offset = 4;

        for _ in 0..count {
            let jd = f64::from_le_bytes([
                data[offset], data[offset + 1], data[offset + 2], data[offset + 3],
                data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7],
            ]);
            let x_km = f64::from_le_bytes([
                data[offset + 8], data[offset + 9], data[offset + 10], data[offset + 11],
                data[offset + 12], data[offset + 13], data[offset + 14], data[offset + 15],
            ]);
            let y_km = f64::from_le_bytes([
                data[offset + 16], data[offset + 17], data[offset + 18], data[offset + 19],
                data[offset + 20], data[offset + 21], data[offset + 22], data[offset + 23],
            ]);
            let z_km = f64::from_le_bytes([
                data[offset + 24], data[offset + 25], data[offset + 26], data[offset + 27],
                data[offset + 28], data[offset + 29], data[offset + 30], data[offset + 31],
            ]);

            points.push(SatelliteEphemerisPoint { jd, x_km, y_km, z_km });
            offset += 32;
        }

        Ok(Self::new(id, points))
    }

    /// Get the satellite ID for this ephemeris.
    pub fn id(&self) -> SatelliteId {
        self.id
    }

    /// Check if a given Julian Date is within the ephemeris coverage.
    pub fn covers(&self, jd: f64) -> bool {
        if self.points.is_empty() {
            return false;
        }
        jd >= self.points.first().unwrap().jd && jd <= self.points.last().unwrap().jd
    }

    /// Get the time range covered by this ephemeris.
    pub fn time_range(&self) -> Option<(f64, f64)> {
        if self.points.is_empty() {
            None
        } else {
            Some((self.points.first().unwrap().jd, self.points.last().unwrap().jd))
        }
    }

    /// Interpolate position at a given Julian Date.
    /// Uses cubic Hermite interpolation for smooth motion.
    /// Returns None if the date is outside the ephemeris range.
    pub fn interpolate(&self, jd: f64) -> Option<(f64, f64, f64)> {
        if self.points.len() < 2 {
            return None;
        }

        // Find the bracketing points
        let idx = match self.points.binary_search_by(|p| {
            p.jd.partial_cmp(&jd).unwrap()
        }) {
            Ok(i) => return Some((self.points[i].x_km, self.points[i].y_km, self.points[i].z_km)),
            Err(i) => i,
        };

        // Check bounds
        if idx == 0 || idx >= self.points.len() {
            return None;
        }

        // For cubic interpolation, we need 4 points (2 before, 2 after)
        // Fall back to linear if we don't have enough points
        if idx < 2 || idx >= self.points.len() - 1 {
            // Linear interpolation
            let p0 = &self.points[idx - 1];
            let p1 = &self.points[idx];
            let t = (jd - p0.jd) / (p1.jd - p0.jd);

            return Some((
                p0.x_km + t * (p1.x_km - p0.x_km),
                p0.y_km + t * (p1.y_km - p0.y_km),
                p0.z_km + t * (p1.z_km - p0.z_km),
            ));
        }

        // Cubic Hermite interpolation using 4 points
        let p0 = &self.points[idx - 2];
        let p1 = &self.points[idx - 1];
        let p2 = &self.points[idx];
        let p3 = &self.points[idx + 1];

        // Normalized time between p1 and p2
        let t = (jd - p1.jd) / (p2.jd - p1.jd);
        let t2 = t * t;
        let t3 = t2 * t;

        // Catmull-Rom spline (a type of cubic Hermite)
        let interp = |v0: f64, v1: f64, v2: f64, v3: f64| -> f64 {
            0.5 * ((2.0 * v1)
                + (-v0 + v2) * t
                + (2.0 * v0 - 5.0 * v1 + 4.0 * v2 - v3) * t2
                + (-v0 + 3.0 * v1 - 3.0 * v2 + v3) * t3)
        };

        Some((
            interp(p0.x_km, p1.x_km, p2.x_km, p3.x_km),
            interp(p0.y_km, p1.y_km, p2.y_km, p3.y_km),
            interp(p0.z_km, p1.z_km, p2.z_km, p3.z_km),
        ))
    }

    /// Get the number of ephemeris points.
    pub fn len(&self) -> usize {
        self.points.len()
    }

    /// Check if the ephemeris is empty.
    pub fn is_empty(&self) -> bool {
        self.points.is_empty()
    }
}

/// Result of satellite position calculation.
#[derive(Debug, Clone)]
pub struct SatellitePosition {
    /// Which satellite this position is for
    pub id: SatelliteId,
    /// Direction from observer (unit vector in equatorial J2000)
    pub direction: CartesianCoord,
    /// Distance from observer in km
    pub distance_km: f64,
    /// Altitude above horizon in degrees (only valid if topocentric)
    pub altitude_deg: f64,
    /// Azimuth in degrees (only valid if topocentric)
    pub azimuth_deg: f64,
    /// Whether satellite is illuminated by the Sun (not in Earth's shadow)
    pub illuminated: bool,
    /// Whether satellite is above the horizon (only valid if topocentric)
    pub above_horizon: bool,
}

/// Check if a satellite is in Earth's shadow.
///
/// Uses cylindrical shadow approximation:
/// 1. Get Sun direction from Earth
/// 2. Project satellite position onto Sun-Earth line
/// 3. If projection is "behind" Earth and satellite is within Earth's shadow cylinder, it's eclipsed
///
/// # Arguments
/// * `sat_eci` - Satellite position in ECI coordinates (km)
/// * `sun_eci` - Sun position in ECI coordinates (km, from Earth center)
fn is_in_earth_shadow(sat_eci: (f64, f64, f64), sun_eci: (f64, f64, f64)) -> bool {
    // Satellite position vector
    let (ix, iy, iz) = sat_eci;

    // Sun direction (unit vector from Earth toward Sun)
    let sun_dist = (sun_eci.0 * sun_eci.0 + sun_eci.1 * sun_eci.1 + sun_eci.2 * sun_eci.2).sqrt();
    let (sx, sy, sz) = (sun_eci.0 / sun_dist, sun_eci.1 / sun_dist, sun_eci.2 / sun_dist);

    // Project satellite onto Sun direction: dot(sat, sun_dir)
    let proj = ix * sx + iy * sy + iz * sz;

    // Satellite must be on the anti-Sun side (behind Earth from Sun's perspective)
    if proj >= 0.0 {
        return false; // Satellite is on the Sun-facing side
    }

    // Distance from satellite to the Earth-Sun line
    // Cross product magnitude gives the perpendicular distance
    let cross_x = iy * sz - iz * sy;
    let cross_y = iz * sx - ix * sz;
    let cross_z = ix * sy - iy * sx;
    let perp_dist = (cross_x * cross_x + cross_y * cross_y + cross_z * cross_z).sqrt();

    // Satellite is in shadow if it's within Earth's shadow cylinder
    // Using a slightly larger radius to account for penumbra
    perp_dist < EARTH_RADIUS_KM * 1.02
}

/// Convert ECI (Earth-Centered Inertial) coordinates to topocentric coordinates.
///
/// # Arguments
/// * `eci` - Position in ECI J2000 (km)
/// * `observer_lat_rad` - Observer latitude in radians
/// * `observer_lon_rad` - Observer longitude in radians
/// * `gmst` - Greenwich Mean Sidereal Time in radians
/// * `observer_height_km` - Observer height above ellipsoid (km), usually ~0
///
/// # Returns
/// (direction unit vector, distance km, altitude deg, azimuth deg)
fn eci_to_topocentric(
    eci: (f64, f64, f64),
    observer_lat_rad: f64,
    observer_lon_rad: f64,
    gmst: f64,
    observer_height_km: f64,
) -> (CartesianCoord, f64, f64, f64) {
    let (x, y, z) = eci;

    // Observer position in ECEF (Earth-Centered Earth-Fixed)
    let cos_lat = observer_lat_rad.cos();
    let sin_lat = observer_lat_rad.sin();

    // Local Sidereal Time
    let lst = gmst + observer_lon_rad;
    let cos_lst = lst.cos();
    let sin_lst = lst.sin();

    // Observer position in ECI (approximate, ignoring Earth's oblateness for now)
    let obs_r = EARTH_RADIUS_KM + observer_height_km;
    let obs_x = obs_r * cos_lat * cos_lst;
    let obs_y = obs_r * cos_lat * sin_lst;
    let obs_z = obs_r * sin_lat;

    // Vector from observer to satellite
    let dx = x - obs_x;
    let dy = y - obs_y;
    let dz = z - obs_z;
    let distance = (dx * dx + dy * dy + dz * dz).sqrt();

    // Convert to local ENU (East-North-Up) coordinates
    // Rotation matrices for observer's local frame
    let east_x = -sin_lst;
    let east_y = cos_lst;
    let east_z = 0.0;

    let north_x = -sin_lat * cos_lst;
    let north_y = -sin_lat * sin_lst;
    let north_z = cos_lat;

    let up_x = cos_lat * cos_lst;
    let up_y = cos_lat * sin_lst;
    let up_z = sin_lat;

    // Project onto local frame
    let e = dx * east_x + dy * east_y + dz * east_z;
    let n = dx * north_x + dy * north_y + dz * north_z;
    let u = dx * up_x + dy * up_y + dz * up_z;

    // Altitude and azimuth
    let altitude_rad = (u / distance).asin();
    let azimuth_rad = e.atan2(n);

    // Normalize azimuth to 0-360
    let azimuth_deg = (azimuth_rad * 180.0 / PI + 360.0) % 360.0;
    let altitude_deg = altitude_rad * 180.0 / PI;

    // Direction unit vector in ECI (for rendering)
    let direction = CartesianCoord {
        x: dx / distance,
        y: dy / distance,
        z: dz / distance,
    };

    (direction, distance, altitude_deg, azimuth_deg)
}

/// Compute a satellite's position as seen from an observer.
///
/// # Arguments
/// * `ephemeris` - Satellite ephemeris data
/// * `time` - Observation time
/// * `observer_lat_rad` - Observer latitude in radians
/// * `observer_lon_rad` - Observer longitude in radians
/// * `observer_height_km` - Observer height above sea level in km
pub fn compute_satellite_position(
    ephemeris: &SatelliteEphemeris,
    time: &SkyTime,
    observer_lat_rad: f64,
    observer_lon_rad: f64,
    observer_height_km: f64,
) -> Option<SatellitePosition> {
    let jd = time.julian_date_tdb();

    // Interpolate satellite ECI position
    let sat_eci = ephemeris.interpolate(jd)?;

    // Get GMST for coordinate conversion
    let jd_ut1 = time.julian_date_utc();
    let gmst = compute_gmst(jd_ut1);

    // Convert to topocentric coordinates
    let (direction, distance_km, altitude_deg, azimuth_deg) = eci_to_topocentric(
        sat_eci,
        observer_lat_rad,
        observer_lon_rad,
        gmst,
        observer_height_km,
    );

    // Get Sun position for shadow calculation
    // Sun is in the opposite direction of Earth's heliocentric position
    let earth_helio = heliocentric_position(Planet::Earth, jd);
    let sun_eci = (
        -earth_helio.0 * AU_TO_KM,
        -earth_helio.1 * AU_TO_KM,
        -earth_helio.2 * AU_TO_KM,
    );

    let illuminated = !is_in_earth_shadow(sat_eci, sun_eci);
    let above_horizon = altitude_deg > 0.0;

    Some(SatellitePosition {
        id: ephemeris.id(),
        direction,
        distance_km,
        altitude_deg,
        azimuth_deg,
        illuminated,
        above_horizon,
    })
}

// ============================================================================
// Legacy ISS aliases for backwards compatibility
// ============================================================================

/// Legacy alias for SatelliteEphemerisPoint (for ISS).
pub type IssEphemerisPoint = SatelliteEphemerisPoint;

/// Legacy alias for SatellitePosition (for ISS).
pub type IssPosition = SatellitePosition;

/// Legacy ISS ephemeris container.
/// Wraps SatelliteEphemeris with ISS-specific constructors.
#[derive(Debug, Clone)]
pub struct IssEphemeris(SatelliteEphemeris);

impl IssEphemeris {
    /// Create a new ISS ephemeris from a list of points.
    pub fn new(points: Vec<SatelliteEphemerisPoint>) -> Self {
        Self(SatelliteEphemeris::new(SatelliteId::ISS, points))
    }

    /// Create from binary data (legacy format).
    pub fn from_binary(data: &[u8]) -> Result<Self, &'static str> {
        Ok(Self(SatelliteEphemeris::from_binary(SatelliteId::ISS, data)?))
    }

    /// Check if a given Julian Date is within the ephemeris coverage.
    pub fn covers(&self, jd: f64) -> bool {
        self.0.covers(jd)
    }

    /// Get the time range covered by this ephemeris.
    pub fn time_range(&self) -> Option<(f64, f64)> {
        self.0.time_range()
    }

    /// Interpolate position at a given Julian Date.
    pub fn interpolate(&self, jd: f64) -> Option<(f64, f64, f64)> {
        self.0.interpolate(jd)
    }

    /// Get the number of ephemeris points.
    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// Check if the ephemeris is empty.
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Get the inner SatelliteEphemeris.
    pub fn inner(&self) -> &SatelliteEphemeris {
        &self.0
    }
}

/// Legacy function to compute ISS position.
pub fn compute_iss_position(
    ephemeris: &IssEphemeris,
    time: &SkyTime,
    observer_lat_rad: f64,
    observer_lon_rad: f64,
    observer_height_km: f64,
) -> Option<IssPosition> {
    compute_satellite_position(
        ephemeris.inner(),
        time,
        observer_lat_rad,
        observer_lon_rad,
        observer_height_km,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ephemeris_binary_format() {
        // Create a simple 2-point ephemeris
        let mut data = Vec::new();

        // Header: count = 2
        data.extend_from_slice(&2u32.to_le_bytes());

        // Point 1: JD 2460000.0, position (6800, 0, 0) km
        data.extend_from_slice(&2460000.0f64.to_le_bytes());
        data.extend_from_slice(&6800.0f64.to_le_bytes());
        data.extend_from_slice(&0.0f64.to_le_bytes());
        data.extend_from_slice(&0.0f64.to_le_bytes());

        // Point 2: JD 2460001.0, position (0, 6800, 0) km
        data.extend_from_slice(&2460001.0f64.to_le_bytes());
        data.extend_from_slice(&0.0f64.to_le_bytes());
        data.extend_from_slice(&6800.0f64.to_le_bytes());
        data.extend_from_slice(&0.0f64.to_le_bytes());

        let eph = SatelliteEphemeris::from_binary(SatelliteId::ISS, &data).unwrap();
        assert_eq!(eph.len(), 2);
        assert_eq!(eph.id(), SatelliteId::ISS);

        // Test interpolation at midpoint
        let pos = eph.interpolate(2460000.5).unwrap();
        // Linear interpolation: (3400, 3400, 0)
        assert!((pos.0 - 3400.0).abs() < 1.0);
        assert!((pos.1 - 3400.0).abs() < 1.0);
        assert!(pos.2.abs() < 1.0);
    }

    #[test]
    fn test_shadow_calculation() {
        // Satellite on the Sun side - should be illuminated
        let sat_sunside = (6800.0, 0.0, 0.0);
        let sun = (149_000_000.0, 0.0, 0.0); // Sun along +X
        assert!(!is_in_earth_shadow(sat_sunside, sun));

        // Satellite on the anti-Sun side, directly behind Earth - should be in shadow
        let sat_shadow = (-6800.0, 0.0, 0.0);
        assert!(is_in_earth_shadow(sat_shadow, sun));

        // Satellite on the anti-Sun side but far from Earth-Sun line - should be illuminated
        let sat_offset = (-6800.0, 10000.0, 0.0);
        assert!(!is_in_earth_shadow(sat_offset, sun));
    }

    #[test]
    fn test_ephemeris_coverage() {
        let points = vec![
            SatelliteEphemerisPoint { jd: 2460000.0, x_km: 6800.0, y_km: 0.0, z_km: 0.0 },
            SatelliteEphemerisPoint { jd: 2460001.0, x_km: 0.0, y_km: 6800.0, z_km: 0.0 },
        ];
        let eph = SatelliteEphemeris::new(SatelliteId::Hubble, points);

        assert!(eph.covers(2460000.0));
        assert!(eph.covers(2460000.5));
        assert!(eph.covers(2460001.0));
        assert!(!eph.covers(2459999.0));
        assert!(!eph.covers(2460002.0));
        assert_eq!(eph.id(), SatelliteId::Hubble);
    }

    #[test]
    fn test_satellite_id() {
        assert_eq!(SatelliteId::ISS.name(), "ISS");
        assert_eq!(SatelliteId::Hubble.name(), "Hubble");
        assert_eq!(SatelliteId::ISS.full_name(), "International Space Station");
        assert_eq!(SatelliteId::Hubble.full_name(), "Hubble Space Telescope");
        assert_eq!(SatelliteId::ISS.index(), 0);
        assert_eq!(SatelliteId::Hubble.index(), 1);
        assert_eq!(SatelliteId::from_index(0), Some(SatelliteId::ISS));
        assert_eq!(SatelliteId::from_index(1), Some(SatelliteId::Hubble));
        assert_eq!(SatelliteId::from_index(2), None);
    }

    #[test]
    fn test_legacy_iss_ephemeris() {
        // Create a simple 2-point ephemeris using legacy API
        let mut data = Vec::new();
        data.extend_from_slice(&2u32.to_le_bytes());
        data.extend_from_slice(&2460000.0f64.to_le_bytes());
        data.extend_from_slice(&6800.0f64.to_le_bytes());
        data.extend_from_slice(&0.0f64.to_le_bytes());
        data.extend_from_slice(&0.0f64.to_le_bytes());
        data.extend_from_slice(&2460001.0f64.to_le_bytes());
        data.extend_from_slice(&0.0f64.to_le_bytes());
        data.extend_from_slice(&6800.0f64.to_le_bytes());
        data.extend_from_slice(&0.0f64.to_le_bytes());

        let eph = IssEphemeris::from_binary(&data).unwrap();
        assert_eq!(eph.len(), 2);
        assert!(eph.covers(2460000.5));

        // Test interpolation
        let pos = eph.interpolate(2460000.5).unwrap();
        assert!((pos.0 - 3400.0).abs() < 1.0);
    }
}
