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
}
