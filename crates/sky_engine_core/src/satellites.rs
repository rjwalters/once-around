//! Satellite ephemeris and visibility calculations.
//!
//! Supports multiple satellites (ISS, Hubble, etc.) using pre-computed
//! ephemeris data with interpolation for accurate positioning.
//! Includes Earth shadow calculations for visibility determination.

use crate::coords::{CartesianCoord, compute_gmst};
use crate::planets::{AU_TO_KM, Planet, SUN_RADIUS_KM, heliocentric_position};
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
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
                data[offset + 4],
                data[offset + 5],
                data[offset + 6],
                data[offset + 7],
            ]);
            let x_km = f64::from_le_bytes([
                data[offset + 8],
                data[offset + 9],
                data[offset + 10],
                data[offset + 11],
                data[offset + 12],
                data[offset + 13],
                data[offset + 14],
                data[offset + 15],
            ]);
            let y_km = f64::from_le_bytes([
                data[offset + 16],
                data[offset + 17],
                data[offset + 18],
                data[offset + 19],
                data[offset + 20],
                data[offset + 21],
                data[offset + 22],
                data[offset + 23],
            ]);
            let z_km = f64::from_le_bytes([
                data[offset + 24],
                data[offset + 25],
                data[offset + 26],
                data[offset + 27],
                data[offset + 28],
                data[offset + 29],
                data[offset + 30],
                data[offset + 31],
            ]);

            points.push(SatelliteEphemerisPoint {
                jd,
                x_km,
                y_km,
                z_km,
            });
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
            Some((
                self.points.first().unwrap().jd,
                self.points.last().unwrap().jd,
            ))
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
        let idx = match self
            .points
            .binary_search_by(|p| p.jd.partial_cmp(&jd).unwrap())
        {
            Ok(i) => {
                return Some((
                    self.points[i].x_km,
                    self.points[i].y_km,
                    self.points[i].z_km,
                ));
            }
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
    /// How deeply the satellite sits in Earth's shadow: `0.0` = fully sunlit,
    /// ramping across the penumbra to `1.0` = fully inside the umbra.
    ///
    /// Presentation-only (drives the renderer's marker fade); `illuminated`
    /// remains the authoritative umbra-boundary boolean used for pass timing.
    /// See [`earth_shadow_depth`].
    pub shadow_depth: f64,
    /// Signed distance (km) to Earth's umbra boundary: `> 0.0` inside the umbra,
    /// `<= 0.0` outside it, so `illuminated == (umbra_signed_distance_km <= 0.0)`
    /// by construction.
    ///
    /// Unlike [`Self::shadow_depth`] this is unclamped, so it keeps a usable
    /// gradient right through the umbra interior. Pass prediction root-finds on
    /// it to locate shadow-limited rise/set edges. See
    /// [`umbra_signed_distance_km`].
    pub umbra_signed_distance_km: f64,
    /// Whether satellite is above the horizon (only valid if topocentric)
    pub above_horizon: bool,
}

/// Radii of Earth's umbra and penumbra cones at a given distance behind Earth's centre.
///
/// Earth's shadow is not a cylinder: because the Sun is an extended source, the
/// total-shadow (umbra) cone converges to an apex while the partial-shadow
/// (penumbra) cone diverges. With `R_e` = Earth radius, `R_s` = Sun radius and
/// `d` = Earth-Sun distance, the cone vertex distances are
///
/// ```text
/// l_umbra    = R_e * d / (R_s - R_e)     (~1.38e6 km, apex behind Earth)
/// l_penumbra = R_e * d / (R_s + R_e)     (~1.36e6 km, apex in front of Earth)
/// ```
///
/// and the radii at distance `s` along the anti-Sun axis are
///
/// ```text
/// umbra_r    = R_e * (1 - s / l_umbra)   (clamped at 0 past the apex)
/// penumbra_r = R_e * (1 + s / l_penumbra)
/// ```
///
/// At ISS altitude (`s` ~ 6797 km) this gives `umbra_r` ~ 6347 km and
/// `penumbra_r` ~ 6410 km, both narrower than the 6506 km cylinder this model
/// replaces.
///
/// # Arguments
/// * `s_km` - Distance along the shadow axis behind Earth's centre (km, positive = anti-Sun side)
/// * `sun_dist_km` - Earth-Sun distance (km)
///
/// # Returns
/// `(umbra_radius_km, penumbra_radius_km)`
fn earth_shadow_radii(s_km: f64, sun_dist_km: f64) -> (f64, f64) {
    let l_umbra = EARTH_RADIUS_KM * sun_dist_km / (SUN_RADIUS_KM - EARTH_RADIUS_KM);
    let l_penumbra = EARTH_RADIUS_KM * sun_dist_km / (SUN_RADIUS_KM + EARTH_RADIUS_KM);

    // Past the umbra apex the cone has closed; clamp instead of going negative.
    let umbra_r = (EARTH_RADIUS_KM * (1.0 - s_km / l_umbra)).max(0.0);
    let penumbra_r = EARTH_RADIUS_KM * (1.0 + s_km / l_penumbra);

    (umbra_r, penumbra_r)
}

/// Position of a satellite relative to Earth's shadow axis.
///
/// Shared by [`is_in_earth_shadow`] and [`earth_shadow_depth`] so the two always
/// agree on the geometry (they differ only in how they interpret it).
struct ShadowAxisGeometry {
    /// Distance along the shadow axis behind Earth's centre (km, always positive)
    axial_dist: f64,
    /// Distance from the satellite to the Earth-Sun line (km)
    perp_dist: f64,
    /// Earth-Sun distance (km)
    sun_dist: f64,
}

/// Project a satellite onto Earth's anti-Sun shadow axis.
///
/// Returns `None` when the satellite is on the Sun-facing side (`proj >= 0.0`),
/// where no shadow geometry applies.
///
/// # Arguments
/// * `sat_eci` - Satellite position in ECI coordinates (km)
/// * `sun_eci` - Sun position in ECI coordinates (km, from Earth center)
fn shadow_axis_geometry(
    sat_eci: (f64, f64, f64),
    sun_eci: (f64, f64, f64),
) -> Option<ShadowAxisGeometry> {
    // Satellite position vector
    let (ix, iy, iz) = sat_eci;

    // Sun direction (unit vector from Earth toward Sun)
    let sun_dist = (sun_eci.0 * sun_eci.0 + sun_eci.1 * sun_eci.1 + sun_eci.2 * sun_eci.2).sqrt();
    let (sx, sy, sz) = (
        sun_eci.0 / sun_dist,
        sun_eci.1 / sun_dist,
        sun_eci.2 / sun_dist,
    );

    // Project satellite onto Sun direction: dot(sat, sun_dir)
    let proj = ix * sx + iy * sy + iz * sz;

    // Satellite must be on the anti-Sun side (behind Earth from Sun's perspective)
    if proj >= 0.0 {
        return None; // Satellite is on the Sun-facing side
    }

    // Distance along the shadow axis, measured behind Earth's centre
    let axial_dist = -proj;

    // Distance from satellite to the Earth-Sun line
    // Cross product magnitude gives the perpendicular distance
    let cross_x = iy * sz - iz * sy;
    let cross_y = iz * sx - ix * sz;
    let cross_z = ix * sy - iy * sx;
    let perp_dist = (cross_x * cross_x + cross_y * cross_y + cross_z * cross_z).sqrt();

    Some(ShadowAxisGeometry {
        axial_dist,
        perp_dist,
        sun_dist,
    })
}

/// Value [`umbra_signed_distance_km`] reports on the Sun-facing side of Earth,
/// where [`shadow_axis_geometry`] yields no shadow geometry at all.
///
/// Only the **sign** of this sentinel is meaningful: it must be strictly
/// negative so the Sun-facing side reads as "definitely not eclipsed",
/// consistent with [`is_in_earth_shadow`] returning `false` and
/// [`earth_shadow_depth`] returning `0.0` there. The magnitude is arbitrary
/// (one Earth radius, chosen to be the same order as the real distances the
/// function returns) — a bracket that happens to span the Sun-facing
/// transition therefore cannot produce a spurious sign flip.
pub const SUNLIT_SIDE_UMBRA_DISTANCE_KM: f64 = -EARTH_RADIUS_KM;

/// Signed distance (km) from a satellite to the boundary of Earth's umbra cone.
///
/// This is the *unclamped, continuous, signed* form of the comparison
/// [`is_in_earth_shadow`] makes — `umbra_r - perp_dist`, using the cone radii
/// from [`earth_shadow_radii`]:
///
/// ```text
///  > 0.0   inside the umbra (eclipsed); grows with depth, no upper bound
/// == 0.0   exactly on the umbra boundary -> NOT eclipsed, because the boolean
///          comparison `perp_dist < umbra_r` is strict
///  < 0.0   outside the umbra (illuminated), including the whole penumbra
/// ```
///
/// [`is_in_earth_shadow`] is *defined* as `umbra_signed_distance_km(..) > 0.0`,
/// so the boolean and this scalar can never drift apart: the sign change happens
/// at exactly the instant the boolean flips, with no epsilon anywhere.
///
/// # Why not `earth_shadow_depth(..) - 1.0`?
///
/// [`earth_shadow_depth`] is **clamped** to `0.0..=1.0`, so it pins at exactly
/// `1.0` across the entire umbra interior rather than continuing to rise.
/// `depth(t) - 1.0` is therefore negative outside the umbra and identically
/// *zero* from the boundary inward — one-sided zero contact, not a sign change.
/// It can never satisfy the `f(a) * f(b) < 0` bracket precondition that
/// bisection / regula falsi / Brent require, and its zero slope on one side
/// breaks the fast-converging methods outright. This function is the
/// well-conditioned root-finding target instead: smooth (both `perp_dist` and
/// `umbra_r` vary smoothly along a LEO orbit) and genuinely sign-changing.
/// `sky_engine`'s pass-prediction refinement roots-finds on it to locate
/// shadow-limited rise/set edges instead of bisecting the boolean step function.
///
/// # Arguments
/// * `sat_eci` - Satellite position in ECI coordinates (km)
/// * `sun_eci` - Sun position in ECI coordinates (km, from Earth center)
pub fn umbra_signed_distance_km(sat_eci: (f64, f64, f64), sun_eci: (f64, f64, f64)) -> f64 {
    let Some(geom) = shadow_axis_geometry(sat_eci, sun_eci) else {
        return SUNLIT_SIDE_UMBRA_DISTANCE_KM; // Satellite is on the Sun-facing side
    };

    // Satellite is eclipsed only inside the umbra cone. The penumbra radius is
    // computed alongside it to document the model (and is asserted in tests),
    // but a partially-shaded satellite still counts as illuminated.
    //
    // Past the umbra apex `earth_shadow_radii` clamps `umbra_r` to 0, so this
    // degrades to `-perp_dist` (<= 0, i.e. never eclipsed) — matching the
    // boolean's `perp_dist < 0` there.
    let (umbra_r, _penumbra_r) = earth_shadow_radii(geom.axial_dist, geom.sun_dist);

    umbra_r - geom.perp_dist
}

/// Check if a satellite is in Earth's shadow.
///
/// Uses a conical umbra model:
/// 1. Get Sun direction from Earth
/// 2. Project satellite position onto the anti-Sun (shadow) axis
/// 3. If the projection is "behind" Earth and the satellite is closer to the
///    axis than the umbra cone radius at that distance, it's eclipsed
///
/// "Illuminated" here means **outside the umbra**: a satellite inside the
/// penumbra is only partially shaded and stays visible to the naked eye (it
/// merely dims), so treating the penumbra as darkness would truncate visible
/// passes. See [`earth_shadow_radii`] for the cone geometry, and
/// [`earth_shadow_depth`] for the continuous version used for rendering.
///
/// This replaces an earlier cylindrical approximation (radius `1.02 * R_earth`
/// = 6506 km) that was ~159 km wider than the umbra at ISS altitude, which
/// began eclipses ~60 s early and ended them ~60 s late.
///
/// Expressed in terms of [`umbra_signed_distance_km`] so the boolean used for
/// pass timing and the scalar used to root-find the same crossing are one
/// definition rather than two copies of `perp_dist` vs `umbra_r`. The strict
/// `>` mirrors the original strict `perp_dist < umbra_r`: a satellite exactly on
/// the umbra radius is *not* eclipsed.
///
/// # Arguments
/// * `sat_eci` - Satellite position in ECI coordinates (km)
/// * `sun_eci` - Sun position in ECI coordinates (km, from Earth center)
fn is_in_earth_shadow(sat_eci: (f64, f64, f64), sun_eci: (f64, f64, f64)) -> bool {
    umbra_signed_distance_km(sat_eci, sun_eci) > 0.0
}

/// How deeply a satellite sits inside Earth's shadow, as a continuous `0.0..=1.0` value.
///
/// The Sun is an extended source, so a satellite crossing Earth's shadow *dims*
/// through the penumbra rather than switching off at a single instant. This is
/// the continuous counterpart to [`is_in_earth_shadow`]:
///
/// ```text
/// 0.0  fully sunlit (outside the penumbra, or on the Sun-facing side)
/// ...  linear ramp across the penumbra annulus
/// 1.0  fully inside the umbra (total shadow)
/// ```
///
/// The ramp is `(penumbra_r - perp_dist) / (penumbra_r - umbra_r)`, clamped to
/// `0.0..=1.0`, using the cone radii from [`earth_shadow_radii`].
///
/// **Boundary semantics**: the depth reaches exactly `1.0` at the *umbra* edge
/// (numerator == denominator there), which is where [`is_in_earth_shadow`]
/// flips. So `earth_shadow_depth(..) >= 1.0` is equivalent to
/// `is_in_earth_shadow(..)` up to the strict-vs-inclusive comparison at the
/// boundary itself — a satellite exactly on the umbra radius reports depth
/// `1.0` but is *not* eclipsed (`perp_dist < umbra_r` is strict).
///
/// This value is presentation-only: it drives the renderer's marker fade. The
/// pass-timing path ([`is_in_earth_shadow`] via `sky_engine`'s `visibility_at`)
/// keeps its umbra-boundary boolean semantics untouched.
///
/// # Arguments
/// * `sat_eci` - Satellite position in ECI coordinates (km)
/// * `sun_eci` - Sun position in ECI coordinates (km, from Earth center)
fn earth_shadow_depth(sat_eci: (f64, f64, f64), sun_eci: (f64, f64, f64)) -> f64 {
    let Some(geom) = shadow_axis_geometry(sat_eci, sun_eci) else {
        return 0.0; // Sun-facing side: fully lit
    };

    let (umbra_r, penumbra_r) = earth_shadow_radii(geom.axial_dist, geom.sun_dist);

    // `penumbra_r > umbra_r` strictly for every reachable `axial_dist >= 0`, but
    // guard the degenerate case rather than emitting a NaN/infinity.
    if penumbra_r <= umbra_r {
        return if geom.perp_dist <= umbra_r { 1.0 } else { 0.0 };
    }

    ((penumbra_r - geom.perp_dist) / (penumbra_r - umbra_r)).clamp(0.0, 1.0)
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
    let shadow_depth = earth_shadow_depth(sat_eci, sun_eci);
    // `is_in_earth_shadow` is *defined* as `umbra_signed_distance_km(..) > 0.0`
    // (see that function), so `illuminated == (umbra_signed_distance_km <= 0.0)`
    // holds by construction — the boolean cannot disagree with the scalar the
    // pass refinement roots-finds on.
    let umbra_signed_distance_km = umbra_signed_distance_km(sat_eci, sun_eci);
    let above_horizon = altitude_deg > 0.0;

    Some(SatellitePosition {
        id: ephemeris.id(),
        direction,
        distance_km,
        altitude_deg,
        azimuth_deg,
        illuminated,
        shadow_depth,
        umbra_signed_distance_km,
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
        Ok(Self(SatelliteEphemeris::from_binary(
            SatelliteId::ISS,
            data,
        )?))
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

    /// Sun along +X at a representative Earth-Sun distance.
    const TEST_SUN: (f64, f64, f64) = (149_000_000.0, 0.0, 0.0);

    /// Typical ISS geocentric radius (~419 km altitude).
    const ISS_RADIUS_KM: f64 = 6797.0;

    #[test]
    fn test_shadow_calculation() {
        // Satellite on the Sun side - should be illuminated
        let sat_sunside = (6800.0, 0.0, 0.0);
        assert!(!is_in_earth_shadow(sat_sunside, TEST_SUN));

        // Satellite on the anti-Sun side, directly behind Earth - should be in shadow
        let sat_shadow = (-6800.0, 0.0, 0.0);
        assert!(is_in_earth_shadow(sat_shadow, TEST_SUN));

        // Satellite on the anti-Sun side but far from Earth-Sun line - should be illuminated
        let sat_offset = (-6800.0, 10000.0, 0.0);
        assert!(!is_in_earth_shadow(sat_offset, TEST_SUN));
    }

    #[test]
    fn test_shadow_cone_radii() {
        // At ISS altitude the umbra has shrunk below Earth's radius and the
        // penumbra has grown above it. Cross-checked against the conical model
        // measured in the #88 tooling evaluation (umbra ~6347 km, penumbra
        // ~6410 km at s ~ 6797 km).
        let (umbra_r, penumbra_r) = earth_shadow_radii(ISS_RADIUS_KM, TEST_SUN.0);

        assert!(
            (umbra_r - 6346.7).abs() < 1.0,
            "umbra radius at ISS altitude was {umbra_r}"
        );
        assert!(
            (penumbra_r - 6410.2).abs() < 1.0,
            "penumbra radius at ISS altitude was {penumbra_r}"
        );

        // The umbra shrinks and the penumbra grows relative to Earth's radius,
        // and both are narrower than the 1.02 * R_earth cylinder they replace.
        assert!(umbra_r < EARTH_RADIUS_KM);
        assert!(penumbra_r > EARTH_RADIUS_KM);
        assert!(penumbra_r < EARTH_RADIUS_KM * 1.02);

        // At Earth's centre both cones have exactly Earth's radius.
        let (umbra_at_zero, penumbra_at_zero) = earth_shadow_radii(0.0, TEST_SUN.0);
        assert!((umbra_at_zero - EARTH_RADIUS_KM).abs() < 1e-9);
        assert!((penumbra_at_zero - EARTH_RADIUS_KM).abs() < 1e-9);
    }

    #[test]
    fn test_shadow_deep_umbra() {
        // Well inside the umbra cone: eclipsed.
        let (umbra_r, _) = earth_shadow_radii(ISS_RADIUS_KM, TEST_SUN.0);

        assert!(is_in_earth_shadow((-ISS_RADIUS_KM, 0.0, 0.0), TEST_SUN));
        assert!(is_in_earth_shadow((-ISS_RADIUS_KM, 3000.0, 0.0), TEST_SUN));
        assert!(is_in_earth_shadow(
            (-ISS_RADIUS_KM, 0.0, umbra_r * 0.99),
            TEST_SUN
        ));

        // Just outside the umbra boundary: illuminated.
        assert!(!is_in_earth_shadow(
            (-ISS_RADIUS_KM, umbra_r * 1.01, 0.0),
            TEST_SUN
        ));
    }

    #[test]
    fn test_shadow_penumbra_grazing_is_illuminated() {
        // A satellite between the umbra and penumbra radii is only partially
        // shaded. We deliberately threshold on the umbra, so it must be
        // reported illuminated.
        let (umbra_r, penumbra_r) = earth_shadow_radii(ISS_RADIUS_KM, TEST_SUN.0);
        let mid_penumbra = 0.5 * (umbra_r + penumbra_r);

        assert!(mid_penumbra > umbra_r && mid_penumbra < penumbra_r);
        assert!(!is_in_earth_shadow(
            (-ISS_RADIUS_KM, mid_penumbra, 0.0),
            TEST_SUN
        ));

        // Just outside the penumbra entirely: also illuminated (sanity).
        assert!(!is_in_earth_shadow(
            (-ISS_RADIUS_KM, penumbra_r * 1.01, 0.0),
            TEST_SUN
        ));

        // Regression guard for the old cylinder: the band between the umbra
        // radius and the former 1.02 * R_earth cylinder radius used to be
        // reported as eclipsed and must now be illuminated.
        let old_cylinder_r = EARTH_RADIUS_KM * 1.02;
        assert!(old_cylinder_r > umbra_r);
        let in_old_cylinder_only = 0.5 * (umbra_r + old_cylinder_r);
        assert!(!is_in_earth_shadow(
            (-ISS_RADIUS_KM, in_old_cylinder_only, 0.0),
            TEST_SUN
        ));
    }

    #[test]
    fn test_shadow_cone_apex_clamps() {
        // The umbra apex sits ~1.38e6 km behind Earth. At and beyond the apex
        // the umbra radius must clamp to zero rather than going negative.
        let l_umbra = EARTH_RADIUS_KM * TEST_SUN.0 / (SUN_RADIUS_KM - EARTH_RADIUS_KM);
        assert!(l_umbra > 1.3e6 && l_umbra < 1.5e6, "l_umbra was {l_umbra}");

        let (at_apex, _) = earth_shadow_radii(l_umbra, TEST_SUN.0);
        assert_eq!(at_apex, 0.0);

        let (past_apex, penumbra_past_apex) = earth_shadow_radii(2.0 * l_umbra, TEST_SUN.0);
        assert_eq!(past_apex, 0.0);
        assert!(past_apex.is_finite());
        assert!(penumbra_past_apex > 0.0);

        // Nothing at or beyond the apex can be eclipsed, even exactly on the axis.
        assert!(!is_in_earth_shadow((-2.0 * l_umbra, 0.0, 0.0), TEST_SUN));
        assert!(!is_in_earth_shadow((-l_umbra, 0.0, 0.0), TEST_SUN));

        // Sanity: the Moon's distance is still well inside the umbra cone,
        // which is why total lunar eclipses exist.
        assert!(is_in_earth_shadow((-384_400.0, 0.0, 0.0), TEST_SUN));
    }

    #[test]
    fn test_shadow_depth_ramp() {
        let (umbra_r, penumbra_r) = earth_shadow_radii(ISS_RADIUS_KM, TEST_SUN.0);

        // Sun-facing side: fully lit regardless of how close to the axis.
        assert_eq!(earth_shadow_depth((ISS_RADIUS_KM, 0.0, 0.0), TEST_SUN), 0.0);

        // Outside the penumbra entirely: fully lit.
        assert_eq!(
            earth_shadow_depth((-ISS_RADIUS_KM, penumbra_r * 1.01, 0.0), TEST_SUN),
            0.0
        );
        // Exactly on the penumbra edge: still 0.0 (numerator is zero there).
        let at_penumbra = earth_shadow_depth((-ISS_RADIUS_KM, penumbra_r, 0.0), TEST_SUN);
        assert!(
            at_penumbra.abs() < 1e-9,
            "depth at the penumbra edge was {at_penumbra}"
        );

        // Exactly on the umbra edge: the ramp reaches 1.0 (numerator == denominator).
        let at_umbra = earth_shadow_depth((-ISS_RADIUS_KM, umbra_r, 0.0), TEST_SUN);
        assert!(
            (at_umbra - 1.0).abs() < 1e-9,
            "depth at the umbra edge was {at_umbra}"
        );

        // Midway across the penumbra annulus: ~0.5 (the ramp is linear in perp_dist).
        let mid_penumbra = 0.5 * (umbra_r + penumbra_r);
        let at_mid = earth_shadow_depth((-ISS_RADIUS_KM, mid_penumbra, 0.0), TEST_SUN);
        assert!(
            (at_mid - 0.5).abs() < 1e-9,
            "depth midway across the penumbra was {at_mid}"
        );

        // Deep inside the umbra (and dead on the axis): clamped to 1.0.
        assert_eq!(
            earth_shadow_depth((-ISS_RADIUS_KM, umbra_r * 0.5, 0.0), TEST_SUN),
            1.0
        );
        assert_eq!(
            earth_shadow_depth((-ISS_RADIUS_KM, 0.0, 0.0), TEST_SUN),
            1.0
        );

        // The ramp is monotonically non-increasing as the satellite moves away
        // from the shadow axis, and never leaves 0.0..=1.0.
        let mut prev = f64::INFINITY;
        for i in 0..=200 {
            let perp = penumbra_r * 1.2 * (i as f64) / 200.0;
            let depth = earth_shadow_depth((-ISS_RADIUS_KM, perp, 0.0), TEST_SUN);
            assert!(
                (0.0..=1.0).contains(&depth),
                "depth {depth} out of range at perp {perp}"
            );
            assert!(depth <= prev, "depth increased at perp {perp}");
            prev = depth;
        }
    }

    #[test]
    fn test_shadow_depth_reduces_to_boolean_at_umbra_edge() {
        // The continuous depth must agree with the boolean the pass-timing path
        // uses: `depth >= 1.0` iff eclipsed. The two disagree only exactly at
        // `perp_dist == umbra_r`, where the boolean's comparison is strict.
        let (_, penumbra_r) = earth_shadow_radii(ISS_RADIUS_KM, TEST_SUN.0);

        for i in 0..=500 {
            let perp = penumbra_r * 1.5 * (i as f64) / 500.0;
            let sat = (-ISS_RADIUS_KM, perp, 0.0);
            let depth = earth_shadow_depth(sat, TEST_SUN);
            let eclipsed = is_in_earth_shadow(sat, TEST_SUN);

            // Eclipsed => saturated depth.
            if eclipsed {
                assert_eq!(depth, 1.0, "eclipsed but depth was {depth} at perp {perp}");
            }
            // Un-saturated depth => not eclipsed (contrapositive of the above).
            if depth < 1.0 {
                assert!(!eclipsed, "depth {depth} < 1.0 but eclipsed at perp {perp}");
            }
        }

        // Same check while sweeping the axial distance, staying at a fixed
        // off-axis distance inside the ISS-altitude umbra.
        for i in 0..=500 {
            let axial = ISS_RADIUS_KM + 1000.0 * (i as f64);
            let sat = (-axial, 1000.0, 0.0);
            let depth = earth_shadow_depth(sat, TEST_SUN);
            assert!(depth.is_finite(), "non-finite depth at axial {axial}");
            assert!(
                (0.0..=1.0).contains(&depth),
                "depth {depth} out of range at axial {axial}"
            );
            if is_in_earth_shadow(sat, TEST_SUN) {
                assert_eq!(
                    depth, 1.0,
                    "eclipsed but depth was {depth} at axial {axial}"
                );
            }
        }
    }

    #[test]
    fn test_shadow_depth_past_apex_is_well_defined() {
        // Past the umbra apex the umbra radius clamps to 0, so nothing can be
        // fully eclipsed — but the penumbra keeps growing, so the ramp must
        // stay finite and inside 0.0..=1.0 rather than dividing by zero.
        let l_umbra = EARTH_RADIUS_KM * TEST_SUN.0 / (SUN_RADIUS_KM - EARTH_RADIUS_KM);

        // Exactly on the axis past the apex is the one degenerate case where the
        // ramp saturates (umbra_r has clamped to 0, so perp_dist == umbra_r == 0)
        // while the boolean — which compares strictly, `perp_dist < umbra_r` —
        // reports "not eclipsed". Physically this is the antumbra: annular, not
        // total. It is unreachable for Earth satellites (the apex sits ~1.38e6 km
        // out, ~200x beyond LEO) and harmless because the depth is
        // presentation-only, but assert it so the behaviour stays deliberate.
        let on_axis_past_apex = earth_shadow_depth((-2.0 * l_umbra, 0.0, 0.0), TEST_SUN);
        assert!(on_axis_past_apex.is_finite());
        assert_eq!(on_axis_past_apex, 1.0);
        assert!(!is_in_earth_shadow((-2.0 * l_umbra, 0.0, 0.0), TEST_SUN));

        // Far off-axis past the apex: outside the penumbra, fully lit.
        let (_, penumbra_past_apex) = earth_shadow_radii(2.0 * l_umbra, TEST_SUN.0);
        assert_eq!(
            earth_shadow_depth((-2.0 * l_umbra, penumbra_past_apex * 1.1, 0.0), TEST_SUN),
            0.0
        );
    }

    /// The signed umbra distance is the continuous, *unclamped* form of the
    /// eclipse boolean: it changes sign exactly where `is_in_earth_shadow` flips,
    /// and unlike `earth_shadow_depth` it keeps growing inside the umbra instead
    /// of pinning at 1.0 — which is what makes it a valid root-finding target.
    #[test]
    fn test_umbra_signed_distance_brackets_the_umbra_crossing() {
        let (umbra_r, penumbra_r) = earth_shadow_radii(ISS_RADIUS_KM, TEST_SUN.0);

        // Sign convention across the boundary.
        assert!(umbra_signed_distance_km((-ISS_RADIUS_KM, umbra_r * 0.5, 0.0), TEST_SUN) > 0.0);
        assert!(umbra_signed_distance_km((-ISS_RADIUS_KM, umbra_r * 1.5, 0.0), TEST_SUN) < 0.0);

        // Exactly on the boundary: zero, and *not* eclipsed — the boolean's
        // `perp_dist < umbra_r` is strict, so the root belongs to the lit side.
        let at_boundary = umbra_signed_distance_km((-ISS_RADIUS_KM, umbra_r, 0.0), TEST_SUN);
        assert!(
            at_boundary.abs() < 1e-6,
            "expected ~0 on the umbra boundary, got {at_boundary}"
        );
        assert!(!is_in_earth_shadow(
            (-ISS_RADIUS_KM, umbra_r, 0.0),
            TEST_SUN
        ));

        // A genuine sign change brackets the crossing, which is the precondition
        // bisection / regula falsi / Brent all require. `depth - 1.0` cannot do
        // this: it is zero throughout the umbra interior, not positive.
        let inside = umbra_signed_distance_km((-ISS_RADIUS_KM, 0.0, 0.0), TEST_SUN);
        let outside = umbra_signed_distance_km((-ISS_RADIUS_KM, penumbra_r, 0.0), TEST_SUN);
        assert!(
            inside * outside < 0.0,
            "must straddle: {inside} / {outside}"
        );
        assert_eq!(
            earth_shadow_depth((-ISS_RADIUS_KM, 0.0, 0.0), TEST_SUN) - 1.0,
            0.0
        );
        assert_eq!(
            earth_shadow_depth((-ISS_RADIUS_KM, umbra_r * 0.5, 0.0), TEST_SUN) - 1.0,
            0.0,
            "clamped depth is flat across the umbra interior, hence unusable as a root function"
        );

        // Deeper inside the umbra means a strictly larger signed distance — the
        // gradient the clamped depth throws away.
        assert!(inside > umbra_signed_distance_km((-ISS_RADIUS_KM, umbra_r * 0.5, 0.0), TEST_SUN));

        // The boolean is *defined* as this sign test; sweep the boundary to pin
        // the agreement, including the exact-boundary case.
        for i in -50..=50 {
            let perp = umbra_r + (i as f64) * 0.5;
            let sat = (-ISS_RADIUS_KM, perp, 0.0);
            assert_eq!(
                umbra_signed_distance_km(sat, TEST_SUN) > 0.0,
                is_in_earth_shadow(sat, TEST_SUN),
                "sign disagrees with the eclipse boolean at perp_dist {perp}"
            );
        }
    }

    /// Degenerate geometries must stay finite and strictly negative, so a bracket
    /// spanning one of them can never produce a spurious sign flip.
    #[test]
    fn test_umbra_signed_distance_degenerate_geometry() {
        // Sun-facing side: no shadow geometry at all, so the documented sentinel.
        let sunlit = umbra_signed_distance_km((ISS_RADIUS_KM, 0.0, 0.0), TEST_SUN);
        assert_eq!(sunlit, SUNLIT_SIDE_UMBRA_DISTANCE_KM);
        assert!(sunlit < 0.0, "the sentinel must read as 'not eclipsed'");
        assert!(!is_in_earth_shadow((ISS_RADIUS_KM, 0.0, 0.0), TEST_SUN));

        // Past the umbra apex `umbra_r` clamps to 0, so the signed distance
        // degrades to `-perp_dist`: never positive, hence never eclipsed.
        let l_umbra = EARTH_RADIUS_KM * TEST_SUN.0 / (SUN_RADIUS_KM - EARTH_RADIUS_KM);
        let on_axis = umbra_signed_distance_km((-2.0 * l_umbra, 0.0, 0.0), TEST_SUN);
        assert!(on_axis.is_finite());
        assert_eq!(on_axis, 0.0);
        assert!(!is_in_earth_shadow((-2.0 * l_umbra, 0.0, 0.0), TEST_SUN));

        let off_axis = umbra_signed_distance_km((-2.0 * l_umbra, 1000.0, 0.0), TEST_SUN);
        assert_eq!(off_axis, -1000.0);
        assert!(!is_in_earth_shadow((-2.0 * l_umbra, 1000.0, 0.0), TEST_SUN));
    }

    /// The pre-#89 cylindrical shadow model, kept here only as a reference
    /// implementation so the eclipse-timing change can be measured.
    fn is_in_earth_shadow_cylinder(sat_eci: (f64, f64, f64), sun_eci: (f64, f64, f64)) -> bool {
        let (ix, iy, iz) = sat_eci;
        let sun_dist =
            (sun_eci.0 * sun_eci.0 + sun_eci.1 * sun_eci.1 + sun_eci.2 * sun_eci.2).sqrt();
        let (sx, sy, sz) = (
            sun_eci.0 / sun_dist,
            sun_eci.1 / sun_dist,
            sun_eci.2 / sun_dist,
        );
        let proj = ix * sx + iy * sy + iz * sz;
        if proj >= 0.0 {
            return false;
        }
        let cross_x = iy * sz - iz * sy;
        let cross_y = iz * sx - ix * sz;
        let cross_z = ix * sy - iy * sx;
        let perp_dist = (cross_x * cross_x + cross_y * cross_y + cross_z * cross_z).sqrt();
        perp_dist < EARTH_RADIUS_KM * 1.02
    }

    /// Bisect for the orbital angle (measured from the anti-Sun point) at which
    /// a circular orbit of radius `r_km` leaves the given shadow model.
    fn shadow_exit_angle_rad<F>(r_km: f64, in_shadow: F) -> f64
    where
        F: Fn((f64, f64, f64), (f64, f64, f64)) -> bool,
    {
        let pos_at = |theta: f64| (-r_km * theta.cos(), r_km * theta.sin(), 0.0);

        let mut lo = 0.0f64; // directly behind Earth: eclipsed
        let mut hi = PI / 2.0; // terminator: sunlit
        assert!(in_shadow(pos_at(lo), TEST_SUN));
        assert!(!in_shadow(pos_at(hi), TEST_SUN));

        for _ in 0..80 {
            let mid = 0.5 * (lo + hi);
            if in_shadow(pos_at(mid), TEST_SUN) {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        0.5 * (lo + hi)
    }

    #[test]
    fn test_conical_shadow_shortens_eclipse_by_about_a_minute_per_edge() {
        // Standard gravitational parameter of Earth (km^3/s^2).
        const MU_EARTH: f64 = 398600.4418;

        let theta_cylinder = shadow_exit_angle_rad(ISS_RADIUS_KM, is_in_earth_shadow_cylinder);
        let theta_umbra = shadow_exit_angle_rad(ISS_RADIUS_KM, is_in_earth_shadow);

        // The umbra is narrower than the old cylinder, so the satellite exits
        // the shadow at a smaller orbital angle.
        assert!(
            theta_umbra < theta_cylinder,
            "umbra exit angle {theta_umbra} should be smaller than cylinder {theta_cylinder}"
        );

        // Convert the angular difference into a timing difference for a
        // circular orbit at ISS altitude.
        let period_s = 2.0 * PI * (ISS_RADIUS_KM.powi(3) / MU_EARTH).sqrt();
        let omega = 2.0 * PI / period_s;
        let edge_shift_s = (theta_cylinder - theta_umbra) / omega;

        // The central (beta = 0) crossing modelled here yields ~56.6 s per
        // edge. That is the *lower bound*, not the worst case: a central
        // crossing traverses the shadow boundary at the steepest angle, so it
        // shifts the least. The shift grows monotonically with the orbital
        // beta angle (the angle between the orbit plane and the Sun
        // direction) — ~57.5 s at 10 deg, ~60.7 s at 20 deg, ~77 s at 40 deg,
        // ~113 s at 55 deg — because off-axis passes cross the boundary
        // obliquely.
        //
        // This is what validates the model against #88, which measured
        // ~60.5 s per edge averaged over 31 real ISS eclipse cycles: that
        // average sits at beta ~= 20 deg, squarely in the typical ISS beta
        // range. Bounded loosely enough to survive constant refinements
        // (varying the Sun distance over the full 147.1-152.1e6 km range
        // moves this by less than 0.2 s).
        assert!(
            (54.0..59.0).contains(&edge_shift_s),
            "per-edge eclipse timing shift was {edge_shift_s} s, expected ~56.6 s \
             (central-crossing beta=0 lower bound; real off-axis passes shift more)"
        );

        // Each visible pass gains the shift at both ends: ~113 s here, and
        // more for off-axis passes.
        let pass_extension_s = 2.0 * edge_shift_s;
        assert!(
            (108.0..118.0).contains(&pass_extension_s),
            "pass extension was {pass_extension_s} s, expected ~113 s"
        );
    }

    #[test]
    fn test_ephemeris_coverage() {
        let points = vec![
            SatelliteEphemerisPoint {
                jd: 2460000.0,
                x_km: 6800.0,
                y_km: 0.0,
                z_km: 0.0,
            },
            SatelliteEphemerisPoint {
                jd: 2460001.0,
                x_km: 0.0,
                y_km: 6800.0,
                z_km: 0.0,
            },
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
