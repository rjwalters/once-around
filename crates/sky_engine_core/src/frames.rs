//! Fixed J2000 map coordinates ↔ mean equator/equinox of date.
//!
//! IAU 1976 precession (Lieske 1979, equations 6–7; also ERFA `prec76`/
//! `pmat76`). This is a mean-frame rotation, not nutation, aberration or
//! atmospheric refraction. Pair the of-date result with GMST, not GAST.

use crate::coords::CartesianCoord;
use std::f64::consts::PI;

pub const J2000: f64 = 2_451_545.0;

fn angles(jd: f64) -> (f64, f64, f64) {
    let t = (jd - J2000) / 36_525.0;
    let scale = t * PI / (180.0 * 3600.0);
    (
        (2306.2181 + (0.30188 + 0.017998 * t) * t) * scale,
        (2306.2181 + (1.09468 + 0.018203 * t) * t) * scale,
        (2004.3109 + (-0.42665 - 0.041833 * t) * t) * scale,
    )
}

fn rotate_z(v: CartesianCoord, angle: f64) -> CartesianCoord {
    let (s, c) = angle.sin_cos();
    CartesianCoord::new(c * v.x - s * v.y, s * v.x + c * v.y, v.z)
}

fn rotate_y(v: CartesianCoord, angle: f64) -> CartesianCoord {
    let (s, c) = angle.sin_cos();
    CartesianCoord::new(c * v.x + s * v.z, v.y, -s * v.x + c * v.z)
}

/// Rotate a J2000 equatorial vector into the mean equator/equinox of `jd` (TT/TDB).
/// Works for both unit directions and kilometre vectors; preserves length.
pub fn j2000_to_mean_of_date(v: CartesianCoord, jd: f64) -> CartesianCoord {
    let (zeta, z, theta) = angles(jd);
    rotate_z(rotate_y(rotate_z(v, zeta), -theta), z)
}

/// Inverse of [`j2000_to_mean_of_date`].
pub fn mean_of_date_to_j2000(v: CartesianCoord, jd: f64) -> CartesianCoord {
    let (zeta, z, theta) = angles(jd);
    rotate_z(rotate_y(rotate_z(v, -z), theta), -zeta)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[allow(clippy::excessive_precision)] // Preserve the published independent reference literals.
    fn agrees_with_erfa_pmat76_reference() {
        // ERFA's independently published t_pmat76 test matrix at MJD 50123.9999:
        // https://github.com/liberfa/erfa/blob/master/src/t_erfa_c.c
        let expected = [
            [
                0.9999995504328350733,
                0.0008696632209480960785,
                0.0003779153474959888345,
            ],
            [
                -0.0008696632209485112192,
                0.9999996218428560614,
                -0.0000001643284776111886407,
            ],
            [
                -0.0003779153474950335077,
                -0.0000001643306746147366896,
                0.9999999285899790119,
            ],
        ];
        for (column, v) in [
            CartesianCoord::new(1.0, 0.0, 0.0),
            CartesianCoord::new(0.0, 1.0, 0.0),
            CartesianCoord::new(0.0, 0.0, 1.0),
        ]
        .into_iter()
        .enumerate()
        {
            let out = j2000_to_mean_of_date(v, 2_400_000.5 + 50_123.999_9);
            for (row, actual) in [out.x, out.y, out.z].into_iter().enumerate() {
                assert!((actual - expected[row][column]).abs() < 1e-12);
            }
        }
    }

    #[test]
    fn inverse_preserves_vectors_including_poles() {
        for jd in [J2000, 2_461_227.5, 2_500_000.0] {
            for v in [
                CartesianCoord::new(0.0, 0.0, 1.0),
                CartesianCoord::new(4.0, -7.0, 2.0),
            ] {
                let back = mean_of_date_to_j2000(j2000_to_mean_of_date(v, jd), jd);
                assert!((back.x - v.x).abs() < 1e-14);
                assert!((back.y - v.y).abs() < 1e-14);
                assert!((back.z - v.z).abs() < 1e-14);
            }
        }
    }
}
