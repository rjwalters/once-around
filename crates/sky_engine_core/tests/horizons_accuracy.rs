//! External-authority accuracy regression test against JPL Horizons.
//!
//! # Why this exists
//!
//! `golden_positions.rs` pins the engine's output to values captured *from the
//! engine itself*. That guards against unintended drift but cannot prove the
//! numbers are *correct* -- a bug baked into the golden constants would pass
//! forever. This test closes that gap by comparing engine output to reference
//! positions fetched from NASA/JPL Horizons, the authoritative solar-system
//! ephemeris service.
//!
//! The reference data lives in `tests/data/horizons_reference.csv` (checked in,
//! so this test runs fully offline). Regenerate it with:
//!
//! ```text
//! python3 scripts/fetch_horizons_reference.py
//! ```
//!
//! # Reference-frame matching (read before touching tolerances)
//!
//! The engine mixes reference frames by construction, so each body is compared
//! to the Horizons column that its algorithm actually targets:
//!
//! | Engine family                         | Frame produced            | Compared to      |
//! |---------------------------------------|---------------------------|------------------|
//! | Sun, planets (VSOP87A)                | ~J2000 (+ of-date nutation)| astrometric ICRF |
//! | Pluto, comets (J2000 orbital elements)| ~J2000                    | astrometric ICRF |
//! | Moon (Meeus, equinox-of-date)         | apparent of date          | apparent         |
//!
//! The engine deliberately omits precession on its VSOP87/element bodies, so
//! comparing those against Horizons *apparent* (which includes ~0.36 deg of
//! accumulated precession by 2026) would be meaningless; astrometric ICRF is the
//! correct, tight reference for them. The Meeus Moon is the opposite case: its
//! mean arguments already carry precession, so it matches *apparent*.
//!
//! # Tolerances
//!
//! Tolerances are chosen honestly from the engine's real, measured accuracy, not
//! aspirationally. They are per-family and documented at each `TOL_*` constant
//! below. The truncated-Meeus Moon and two-body comet propagation are inherently
//! looser than the VSOP87 planets, and the constants reflect that. A failure
//! means the engine drifted *worse* than its documented accuracy -- investigate
//! before loosening.

use sky_engine_core::coords::{apply_topocentric_correction, cartesian_to_ra_dec};
use sky_engine_core::planets::{AU_TO_KM, compute_all_body_positions_full};
use sky_engine_core::{
    CartesianCoord, SkyTime, TimeContext, compute_all_comet_positions,
    compute_all_minor_body_positions, compute_moon_position_full,
};
use std::f64::consts::PI;

const CSV: &str = include_str!("data/horizons_reference.csv");

// ---- Per-family angular tolerances (degrees) -------------------------------
//
// See the module header for how each family is matched to a Horizons frame.
// Values are the measured worst-case residual across all fixture epochs, rounded
// up with margin. The `print_horizons_residuals` helper (ignored, at the bottom)
// prints the live residuals used to justify these.

/// Sun + planets vs astrometric ICRF. Residuals come from the engine adding
/// of-date nutation / true obliquity to otherwise-J2000 positions and omitting
/// planetary light-time (both bounded, ~arcminute). Measured worst case across
/// the fixture is 0.80' (Mercury, 2030); 3' leaves ~4x margin for un-sampled
/// epochs/phases while still catching real regressions.
const TOL_PLANET_DEG: f64 = 3.0 / 60.0;

/// Minor bodies (Pluto, dwarf planets, TNOs, major asteroids, NEOs) vs
/// astrometric ICRF. Each body uses real JPL Horizons osculating elements at the
/// common epoch JDTDB 2461227.5 (2026-07-06); Pluto keeps its fixed J2000
/// elements. Every body is validated at that 2026 epoch, where two-body
/// propagation is essentially exact -- measured worst case is Pluto at 0.88', all
/// others < 0.4'. The slow outer bodies are also validated at 2030 (worst 0.53');
/// see `fetch_horizons_reference.py` for why the main-belt and NEO bodies are
/// validated only near the element epoch. 3' leaves ~3x margin over the worst
/// measured residual while still catching real regressions.
const TOL_MINORBODY_DEG: f64 = 3.0 / 60.0;

/// Geocentric Moon vs apparent. The engine uses a *truncated* subset of the
/// Meeus lunar series (~60 of the longitude terms). Measured worst case is only
/// 0.33'; 2.5' leaves generous margin for perigee/apogee phases not sampled.
const TOL_MOON_DEG: f64 = 2.5 / 60.0;

/// Topocentric Moon vs apparent, from one observer site. Layers the engine's
/// spherical-Earth (sea-level, geodetic-as-geocentric) parallax approximation on
/// top of the Meeus truncation error, so it is looser than the geocentric Moon.
const TOL_MOON_TOPO_DEG: f64 = 6.0 / 60.0;

/// Comets vs astrometric ICRF, evaluated near the osculating-element epoch where
/// two-body propagation from fixed elements is most valid. No planetary
/// perturbations or non-gravitational forces are modeled, so this is inherently
/// loose: NEOWISE (11 days post-perihelion) lands within 2.0', but 1P/Halley at
/// its 1986 perihelion is 0.49 deg off from its fixed osculating elements. 1 deg
/// documents that reality with ~2x margin; comets are a coarse visual aid, not a
/// precision ephemeris.
const TOL_COMET_DEG: f64 = 1.0;

// ---- Distance (range) tolerances (fractional) ------------------------------
// Measured worst cases: planets 0.013%, Moon 0.010%, minor bodies 0.026% (Pluto;
// other minor bodies < 0.017%), comets 0.19%.
const TOL_DIST_PLANET: f64 = 0.001; // 0.1%
const TOL_DIST_MOON: f64 = 0.001; // 0.1%
const TOL_DIST_MINORBODY: f64 = 0.002; // 0.2%
const TOL_DIST_COMET: f64 = 0.01; // 1%

// Topocentric observer site (must match TOPO_SITE in fetch_horizons_reference.py).
const TOPO_LON_EAST_DEG: f64 = -105.0;
const TOPO_LAT_DEG: f64 = 40.0;

/// One parsed row of the Horizons reference fixture.
struct Ref {
    kind: String,
    name: String,
    epoch_utc: String,
    ra_astro_deg: f64,
    dec_astro_deg: f64,
    ra_app_deg: f64,
    dec_app_deg: f64,
    delta_au: f64,
}

fn parse_refs() -> Vec<Ref> {
    let mut out = Vec::new();
    for line in CSV.lines().skip(1) {
        if line.trim().is_empty() {
            continue;
        }
        let f: Vec<&str> = line.split(',').collect();
        assert!(f.len() >= 11, "malformed fixture row: {line}");
        out.push(Ref {
            kind: f[0].to_string(),
            name: f[1].to_string(),
            // f[2]=command, f[3]=center, f[4]=epoch_label
            epoch_utc: f[5].to_string(),
            ra_astro_deg: f[6].parse().unwrap(),
            dec_astro_deg: f[7].parse().unwrap(),
            ra_app_deg: f[8].parse().unwrap(),
            dec_app_deg: f[9].parse().unwrap(),
            delta_au: f[10].parse().unwrap(),
        });
    }
    assert!(!out.is_empty(), "no reference rows parsed");
    out
}

/// Parse "YYYY-MM-DDTHH:MM:SS" into a SkyTime (UTC).
fn epoch_to_time(iso: &str) -> SkyTime {
    let y: i32 = iso[0..4].parse().unwrap();
    let mo: u8 = iso[5..7].parse().unwrap();
    let d: u8 = iso[8..10].parse().unwrap();
    let h: u8 = iso[11..13].parse().unwrap();
    let mi: u8 = iso[14..16].parse().unwrap();
    let s: f64 = iso[17..19].parse().unwrap();
    SkyTime::from_utc(y, mo, d, h, mi, s)
}

fn radec_to_unit(ra_deg: f64, dec_deg: f64) -> CartesianCoord {
    let ra = ra_deg * PI / 180.0;
    let dec = dec_deg * PI / 180.0;
    CartesianCoord::new(dec.cos() * ra.cos(), dec.cos() * ra.sin(), dec.sin())
}

/// Angular separation between two unit vectors, in degrees.
fn sep_deg(a: &CartesianCoord, b: &CartesianCoord) -> f64 {
    let dot = (a.x * b.x + a.y * b.y + a.z * b.z).clamp(-1.0, 1.0);
    dot.acos() * 180.0 / PI
}

/// Engine direction + geocentric distance (km) for a fixture row, or None for
/// families this test does not exercise generically (topocentric Moon is handled
/// separately).
fn engine_dir_dist(r: &Ref) -> Option<(CartesianCoord, f64)> {
    let time = epoch_to_time(&r.epoch_utc);
    match r.kind.as_str() {
        "sun" | "moon" | "planet" => {
            let bodies = compute_all_body_positions_full(&time);
            let idx = match r.name.as_str() {
                "Sun" => 0,
                "Moon" => 1,
                "Mercury" => 2,
                "Venus" => 3,
                "Mars" => 4,
                "Jupiter" => 5,
                "Saturn" => 6,
                "Uranus" => 7,
                "Neptune" => 8,
                other => panic!("unknown body {other}"),
            };
            Some((bodies[idx].direction, bodies[idx].distance_km))
        }
        "minorbody" => {
            let minor = compute_all_minor_body_positions(&time);
            // Index into MinorBody::ALL (see minor_bodies.rs).
            let idx = match r.name.as_str() {
                "Pluto" => 0,
                "Ceres" => 1,
                "Eris" => 2,
                "Makemake" => 3,
                "Haumea" => 4,
                "Sedna" => 5,
                "Quaoar" => 6,
                "Gonggong" => 7,
                "Orcus" => 8,
                "Varuna" => 9,
                "Vesta" => 10,
                "Pallas" => 11,
                "Hygiea" => 12,
                "Apophis" => 13,
                "Bennu" => 14,
                other => panic!("unknown minor body {other}"),
            };
            Some((minor[idx].direction, minor[idx].distance_km))
        }
        "comet" => {
            let comets = compute_all_comet_positions(&time);
            let idx = match r.name.as_str() {
                "Halley" => 0,
                "NEOWISE" => 4,
                other => panic!("unknown comet {other}"),
            };
            Some((comets[idx].direction, comets[idx].distance_km))
        }
        _ => None,
    }
}

/// Reference unit vector + fractional distance tolerance for a row's family.
fn reference(r: &Ref) -> (CartesianCoord, f64, f64) {
    match r.kind.as_str() {
        // J2000 families -> astrometric ICRF.
        "sun" | "planet" => (
            radec_to_unit(r.ra_astro_deg, r.dec_astro_deg),
            TOL_PLANET_DEG,
            TOL_DIST_PLANET,
        ),
        "minorbody" => (
            radec_to_unit(r.ra_astro_deg, r.dec_astro_deg),
            TOL_MINORBODY_DEG,
            TOL_DIST_MINORBODY,
        ),
        "comet" => (
            radec_to_unit(r.ra_astro_deg, r.dec_astro_deg),
            TOL_COMET_DEG,
            TOL_DIST_COMET,
        ),
        // Equinox-of-date family -> apparent.
        "moon" => (
            radec_to_unit(r.ra_app_deg, r.dec_app_deg),
            TOL_MOON_DEG,
            TOL_DIST_MOON,
        ),
        other => panic!("no reference frame mapping for kind {other}"),
    }
}

/// Main accuracy assertion: every geocentric fixture body is within its
/// documented per-family tolerance of the matching Horizons reference.
#[test]
fn engine_matches_horizons_within_tolerance() {
    let refs = parse_refs();
    let mut checked = 0;
    for r in &refs {
        let Some((dir, dist_km)) = engine_dir_dist(r) else {
            continue; // moon_topo handled in its own test
        };
        let (ref_dir, tol_deg, tol_dist) = reference(r);
        let sep = sep_deg(&dir, &ref_dir);
        assert!(
            sep <= tol_deg,
            "{} @ {}: angular separation {:.4} deg exceeds {} tolerance {:.4} deg",
            r.name,
            r.epoch_utc,
            sep,
            r.kind,
            tol_deg
        );

        let ref_dist_km = r.delta_au * AU_TO_KM;
        let rel = ((dist_km - ref_dist_km) / ref_dist_km).abs();
        assert!(
            rel <= tol_dist,
            "{} @ {}: distance {:.1} km differs from Horizons {:.1} km by {:.3}% (> {:.3}%)",
            r.name,
            r.epoch_utc,
            dist_km,
            ref_dist_km,
            rel * 100.0,
            tol_dist * 100.0
        );
        checked += 1;
    }
    assert!(
        checked >= 60,
        "expected to check many bodies (incl. the minor-body suite), only checked {checked}"
    );
}

/// Topocentric Moon: apply the engine's lunar-parallax correction for one
/// observer site and compare to Horizons' topocentric apparent Moon. This
/// exercises the `apply_topocentric_correction` path that eclipse alignment
/// depends on.
#[test]
fn topocentric_moon_matches_horizons() {
    let refs = parse_refs();
    let r = refs
        .iter()
        .find(|r| r.kind == "moon_topo")
        .expect("fixture must contain a moon_topo row");

    let time = epoch_to_time(&r.epoch_utc);
    let ctx = TimeContext::new(&time);

    // Engine geocentric apparent Moon -> RA/Dec.
    let moon = compute_moon_position_full(&time);
    let (geo_ra, geo_dec) = cartesian_to_ra_dec(&moon.direction);

    // Apply topocentric (parallax) correction for the observer site.
    let (topo_ra, topo_dec) = apply_topocentric_correction(
        geo_ra,
        geo_dec,
        moon.distance_km,
        TOPO_LAT_DEG * PI / 180.0,
        TOPO_LON_EAST_DEG * PI / 180.0,
        ctx.gmst,
    );
    let engine_dir = CartesianCoord::new(
        topo_dec.cos() * topo_ra.cos(),
        topo_dec.cos() * topo_ra.sin(),
        topo_dec.sin(),
    );

    let ref_dir = radec_to_unit(r.ra_app_deg, r.dec_app_deg);
    let sep = sep_deg(&engine_dir, &ref_dir);
    eprintln!(
        "topocentric Moon residual: {:.3} arcmin (tol {:.1})",
        sep * 60.0,
        TOL_MOON_TOPO_DEG * 60.0
    );
    assert!(
        sep <= TOL_MOON_TOPO_DEG,
        "topocentric Moon @ {}: separation {:.4} deg exceeds tolerance {:.4} deg",
        r.epoch_utc,
        sep,
        TOL_MOON_TOPO_DEG
    );

    // Sanity: parallax actually moved the Moon (geocentric vs topocentric differ
    // by up to ~1 deg), so this is a real topocentric check, not a no-op.
    let geo_dir = moon.direction;
    let shift = sep_deg(&geo_dir, &engine_dir);
    assert!(
        shift > 5.0 / 60.0,
        "expected a meaningful parallax shift, got only {:.4} deg",
        shift
    );
}

/// Diagnostic helper (not an assertion): prints the live engine-vs-Horizons
/// residual for every fixture row so the `TOL_*` constants can be justified and
/// re-tuned after an algorithm change. Run with:
///
/// ```text
/// cargo test -p sky_engine_core --test horizons_accuracy \
///     print_horizons_residuals -- --ignored --nocapture
/// ```
#[test]
#[ignore]
fn print_horizons_residuals() {
    let refs = parse_refs();
    println!(
        "\n{:<10} {:<20} {:>14} {:>14} {:>10}  {:>10}",
        "name", "epoch", "vs_astro_arcmin", "vs_app_arcmin", "dist_pct", "kind"
    );
    for r in &refs {
        if let Some((dir, dist_km)) = engine_dir_dist(r) {
            let astro = radec_to_unit(r.ra_astro_deg, r.dec_astro_deg);
            let app = radec_to_unit(r.ra_app_deg, r.dec_app_deg);
            let ref_dist_km = r.delta_au * AU_TO_KM;
            let dist_pct = (dist_km - ref_dist_km) / ref_dist_km * 100.0;
            println!(
                "{:<10} {:<20} {:>14.3} {:>14.3} {:>10.4}  {:>10}",
                r.name,
                r.epoch_utc,
                sep_deg(&dir, &astro) * 60.0,
                sep_deg(&dir, &app) * 60.0,
                dist_pct,
                r.kind
            );
        }
    }
}
