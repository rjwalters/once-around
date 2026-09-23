//! End-to-end engine render buffers against NASA/JPL Horizons apparent AIRLESS
//! horizontal positions, not astrometric ICRF positions. Offline fixture generated
//! by scripts/fetch_observed_reference.py: 9 bodies × 2 epochs × 3 geodetic sites.
//! Mean-of-date projection deliberately omits nutation/refraction. Retain the
//! established 3' planet and 6' topocentric-Moon bounds; these include truncated
//! lunar series, spherical observer, and omitted planetary light-time/aberration.

use sky_engine::SkyEngine;
use sky_engine_core::SkyTime;
use sky_engine_core::coords::{CartesianCoord, cartesian_to_ra_dec, compute_gmst};
use sky_engine_core::frames::j2000_to_mean_of_date;
use std::f64::consts::PI;

const FIXTURE: &str = include_str!("fixtures/observed_horizons.csv");
const DEG: f64 = PI / 180.0;
const NAMES: [&str; 9] = [
    "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune",
];

fn horizontal(v: CartesianCoord, lat: f64, lst: f64) -> CartesianCoord {
    let (ra, dec) = cartesian_to_ra_dec(&v);
    let h = lst - ra;
    CartesianCoord::new(
        -dec.cos() * h.sin(),
        dec.sin() * lat.cos() - dec.cos() * h.cos() * lat.sin(),
        dec.sin() * lat.sin() + dec.cos() * h.cos() * lat.cos(),
    )
}

fn separation(a: CartesianCoord, b: CartesianCoord) -> f64 {
    let a = a.normalize();
    let b = b.normalize();
    (a.x * b.x + a.y * b.y + a.z * b.z).clamp(-1.0, 1.0).acos() / DEG
}

#[test]
fn render_buffers_match_observed_horizons_at_three_sites() {
    let mut engine = SkyEngine::new(&[]).expect("engine");
    let mut count = 0;
    let mut caught_old_frame = 0;
    let mut maximum: f64 = 0.0;
    for row in FIXTURE.lines().skip(1) {
        let f: Vec<_> = row.split(',').collect();
        let lat = f[1].parse::<f64>().unwrap();
        let lon = f[2].parse::<f64>().unwrap();
        let epoch = f[5];
        let year = epoch[0..4].parse().unwrap();
        let month = epoch[5..7].parse().unwrap();
        let day = epoch[8..10].parse().unwrap();
        let hour = epoch[11..13].parse().unwrap();
        let minute = epoch[14..16].parse().unwrap();
        let time = SkyTime::from_utc(year, month, day, hour, minute, 0.0);
        engine.set_observer_location(lat, lon);
        engine.set_time_utc(year, month, day, hour, minute, 0.0);
        engine.recompute();
        let idx = NAMES.iter().position(|n| *n == f[3]).unwrap() * 3;
        // Exercise the exact f32 buffer consumed by Three.js and /test.
        let buffer =
            unsafe { std::slice::from_raw_parts(engine.bodies_pos_ptr(), engine.bodies_pos_len()) };
        let j2000 = CartesianCoord::new(
            buffer[idx] as f64,
            buffer[idx + 1] as f64,
            buffer[idx + 2] as f64,
        );
        let lst = compute_gmst(time.julian_date_utc()) + lon * DEG;
        let az = f[6].parse::<f64>().unwrap() * DEG;
        let alt = f[7].parse::<f64>().unwrap() * DEG;
        let expected = CartesianCoord::new(alt.cos() * az.sin(), alt.cos() * az.cos(), alt.sin());
        let observed = horizontal(
            j2000_to_mean_of_date(j2000, time.julian_date_tdb()),
            lat * DEG,
            lst,
        );
        let error = separation(observed, expected);
        let tolerance = if f[3] == "Moon" {
            6.0 / 60.0
        } else {
            3.0 / 60.0
        };
        assert!(
            error < tolerance,
            "{} {} {}: {:.3}' exceeds {:.1}'",
            f[0],
            f[3],
            epoch,
            error * 60.0,
            tolerance * 60.0
        );
        maximum = maximum.max(error);
        if f[3] != "Moon" && separation(horizontal(j2000, lat * DEG, lst), expected) > 0.25 {
            caught_old_frame += 1;
        }
        count += 1;
    }
    assert_eq!(count, 54);
    assert!(
        caught_old_frame >= 40,
        "must catch the old ~0.36 degree precession omission"
    );
    eprintln!(
        "54 apparent AIRLESS observations: maximum residual {:.3} arcmin; {caught_old_frame} fail without precession",
        maximum * 60.0
    );
}
