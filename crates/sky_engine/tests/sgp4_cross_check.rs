//! Offline SGP4 cross-check of the committed ISS ephemeris (issue #90).
//!
//! `scripts/generate_satellite_ephemeris.py` (NASA Horizons) is the *only*
//! source of truth for satellite positions in this project, and nothing else
//! checks it. A frame regression, a binary-parsing change, a time-scale mix-up
//! or a silently truncated window would ship unnoticed: the pass-prediction
//! tests run against a pinned fixture and only assert pass geometry, not
//! absolute positions.
//!
//! This test provides a second, fully independent opinion. It propagates a
//! pinned ISS two-line element set with the pure-Rust `sgp4` crate, converts
//! the result from TEME to GCRS with `erfa`, and compares it against the
//! committed Horizons-derived ephemeris read back through the production
//! `SatelliteEphemeris::from_binary` / `interpolate` path. Two unrelated
//! methods agreeing to well under a kilometre means any *large* disagreement
//! is a real signal.
//!
//! Everything runs offline: both fixtures are committed, nothing is fetched at
//! test time.
//!
//! # Fixture provenance (pinned on purpose — regenerate consciously)
//!
//! Both fixtures were captured together on 2026-07-29 so that the TLE epoch
//! falls *inside* the ephemeris window; that near-zero TLE age is what buys the
//! tight agreement this test asserts (see "Tolerance" below). They are pinned
//! permanently and live outside the path glob that
//! `.github/workflows/refresh-satellite-ephemeris.yml` touches, so the weekly
//! refresh of `apps/web/public/data/iss_ephemeris.bin` never moves them
//! underneath the test — the same "pin to a fixed epoch, regenerate
//! consciously" contract as `crates/sky_engine/tests/fixtures/iss_ephemeris_fixture.bin`
//! (issue #82) and `crates/sky_engine_core/tests/golden_positions.rs`.
//!
//! * `tests/fixtures/iss_tle_sgp4_check.tle` — the ISS (NORAD 25544) TLE served
//!   by Celestrak on 2026-07-29, fetched once with
//!   `curl "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE"`.
//!   Its epoch field (`26210.12010945`) is 2026-07-29 02:52:57 UTC. The file is
//!   kept as pure three-line TLE text so `sgp4::parse_3les` can read it
//!   verbatim; provenance notes belong here, not in the fixture.
//! * `tests/fixtures/iss_ephemeris_sgp4_check_fixture.bin` — 1441 Horizons
//!   points (2026-07-29 .. 2026-07-30, 1-minute steps, ~46 KB), generated
//!   immediately afterwards with the repo's own script:
//!
//!   ```text
//!   python3 scripts/generate_satellite_ephemeris.py iss \
//!       --start 2026-07-29 --end 2026-07-30 --step 1 \
//!       --output crates/sky_engine/tests/fixtures/iss_ephemeris_sgp4_check_fixture.bin
//!   ```
//!
//! To regenerate: fetch a current TLE with the `curl` command above, write it
//! to the `.tle` fixture, run the script above with a one-day window whose
//! start date is the TLE epoch's calendar date, update the dates/epoch quoted
//! in this comment, and re-run `cargo test -p sky_engine`. Keep the two files
//! in step — pairing a fresh TLE with a stale ephemeris window (or vice versa)
//! silently inflates the deltas as the TLE ages. Regenerating also re-dates the
//! only hardcoded time-scale constant here: check [`TAI_MINUS_UTC_SECONDS`]
//! still holds for the new window (a leap second introduced between the old and
//! new fixture dates would make it stale, costing ~7.7 km of along-track error
//! — enough to fail the 2 km bound, so it fails loudly rather than silently).
//!
//! # Tolerance
//!
//! The tooling evaluation in #88 (`docs/tooling-evaluation-cosmic-frontier-labs.md`)
//! measured SGP4-vs-Horizons geocentric ICRF agreement as a function of TLE age:
//!
//! | TLE age | mean \|Δr\| | max \|Δr\| |
//! |---------|-------------|------------|
//! | ~0.5 d  | 27 m        | 49 m       |
//! | ~7 d    | 296 m       | 332 m      |
//! | ~21 d   | 900 m       | 943 m      |
//!
//! Over this fixture's window the TLE age stays within (-0.12 d, +0.88 d), so
//! the expected disagreement is tens of metres. The asserted bound is a
//! deliberately generous `MAX_POSITION_DELTA_KM` = 2 km — roughly 40x the
//! ~0.5 d near-epoch ceiling in the table above (49 m, from #88), and ~28x the
//! 70.2 m actually measured on *this* fixture pair (reported below). Either way
//! it leaves room for interpolation slack and future TLE/ephemeris pairings
//! that are a little less tightly synchronised, while still being far tighter
//! than the failure modes it guards against.
//! Measured on this fixture pair: dropping the TEME->GCRS rotation moves the
//! position by 44.1 km (precession since J2000 dominates), feeding the
//! ephemeris' TDB tag to SGP4 as if it were UTC moves it by 530.4 km, and the
//! 23-day ephemeris staleness documented in #91 is ~240 km. All three blow
//! straight through a 2 km bound, while the ~70 m of honest method
//! disagreement measured here does not.
//! `time_scale_and_frame_conversions_are_load_bearing` pins those magnitudes
//! down so the bound cannot silently stop being meaningful.
//!
//! What 2 km does *not* catch: the sub-km pieces of the frame chain. Reversing
//! the sign of the equation-of-the-equinoxes rotation alone degrades the
//! agreement from 28.7 m / 70.2 m (mean / max) to 464.1 m / 604.6 m, which
//! still passes. That measurement is how the sign below was confirmed against
//! the reference, and it is the reason the printed mean/max are worth reading
//! in CI logs: a tenfold jump that still passes is a real signal.

use sky_engine_core::satellites::{SatelliteEphemeris, SatelliteId};

/// Pinned ISS TLE — see the fixture provenance notes at the top of this file.
const TLE_PATH: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/fixtures/iss_tle_sgp4_check.tle"
);

/// Pinned Horizons ephemeris slice covering the TLE epoch — see above.
const EPHEMERIS_PATH: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/fixtures/iss_ephemeris_sgp4_check_fixture.bin"
);

/// Per-sample position agreement required between SGP4 and Horizons.
const MAX_POSITION_DELTA_KM: f64 = 2.0;

/// TT - TAI, fixed by definition.
const TT_MINUS_TAI_SECONDS: f64 = 32.184;

/// TAI - UTC (leap seconds) for the fixture window. 37 s has been in force
/// since 2017-01-01 and no leap second has been announced since; because the
/// fixtures are pinned to 2026-07-29 this constant only ever needs revisiting
/// if the fixtures are regenerated past a future leap second.
const TAI_MINUS_UTC_SECONDS: f64 = 37.0;

/// Julian date of J2000.0, used as the fixed part of ERFA's two-part dates.
const JD_J2000: f64 = 2451545.0;

/// Days per Julian century.
const DAYS_PER_JULIAN_CENTURY: f64 = 36525.0;

/// Arcseconds to radians.
const ARCSEC_TO_RAD: f64 = std::f64::consts::PI / (180.0 * 3600.0);

/// One ephemeris sample as stored in the committed binary.
struct Sample {
    jd_tdb: f64,
    horizons_gcrs_km: [f64; 3],
}

/// Read the sample times out of the committed binary.
///
/// Format (see `scripts/generate_satellite_ephemeris.py` and
/// `SatelliteEphemeris::from_binary`): a `u32` count followed by that many
/// `(jd, x_km, y_km, z_km)` little-endian `f64` records. Only the time tags are
/// taken from here; the positions are read back through the production
/// `SatelliteEphemeris` path so this test also covers that parser.
///
/// **This deliberately re-implements the header/record layout instead of
/// reading the times back off `SatelliteEphemeris`.** Duplicating a binary
/// layout is normally a smell, but it is the point here: this file exists to
/// give the Horizons pipeline a second, independent opinion, and a test that
/// took both its times *and* its positions from `from_binary` could no longer
/// notice that parser misreading the file — it would agree with itself. The
/// count check below plus `assert_eq!(ephemeris.len(), sample_times.len())` in
/// [`horizons_samples`] are the cross-check. If the on-disk format ever
/// changes, this parser is *supposed* to fail until it is updated in step.
fn read_sample_times(bytes: &[u8]) -> Vec<f64> {
    assert!(bytes.len() >= 4, "ephemeris fixture is truncated");
    let count = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
    assert_eq!(
        bytes.len(),
        4 + count * 32,
        "ephemeris fixture size does not match its header count"
    );

    (0..count)
        .map(|i| {
            let offset = 4 + i * 32;
            let mut jd = [0u8; 8];
            jd.copy_from_slice(&bytes[offset..offset + 8]);
            f64::from_le_bytes(jd)
        })
        .collect()
}

/// TDB -> TT, using the standard truncated periodic series (accurate to a few
/// tens of microseconds — well below the ~13 m of ISS along-track motion that a
/// millisecond represents).
fn tdb_jd_to_tt_jd(jd_tdb: f64) -> f64 {
    let days_since_j2000 = jd_tdb - JD_J2000;
    let g = (357.53 + 0.985_600_3 * days_since_j2000).to_radians();
    let tdb_minus_tt_seconds = 0.001_658 * g.sin() + 0.000_014 * (2.0 * g).sin();
    jd_tdb - tdb_minus_tt_seconds / 86400.0
}

/// TT -> UTC. TT = TAI + 32.184 s and TAI = UTC + 37 s over the fixture window,
/// so this is a fixed ~69.184 s offset. Skipping it leaves SGP4 propagating to
/// an instant ~69 s away from the ephemeris sample, which at 7.66 km/s is a
/// ~530 km along-track error.
fn tt_jd_to_utc_jd(jd_tt: f64) -> f64 {
    jd_tt - (TT_MINUS_TAI_SECONDS + TAI_MINUS_UTC_SECONDS) / 86400.0
}

/// Equation of the equinoxes (radians): the angle along the equator between the
/// true equinox of date and the uniform ("mean") equinox that TEME is
/// referenced to.
///
/// `Δψ cos ε_A` plus the two leading complementary terms of `eraEect00`. The
/// terms dropped are below 0.05 mas (~1 mm at ISS altitude); the leading term
/// itself reaches ~17 arcsec, i.e. ~560 m at 6790 km, so it is very much not
/// negligible at this test's tolerance.
fn equation_of_the_equinoxes(jd_tt: f64) -> f64 {
    let date2 = jd_tt - JD_J2000;
    let (dpsi, _deps) = erfa::prenut::nut06a(JD_J2000, date2);
    let eps_a = erfa::prenut::obliquity_06(JD_J2000, date2);

    let t = date2 / DAYS_PER_JULIAN_CENTURY;
    let omega = erfa::fundamental_argument::om03(t);
    let complementary =
        (0.002_640_96 * omega.sin() + 0.000_063_52 * (2.0 * omega).sin()) * ARCSEC_TO_RAD;

    dpsi * eps_a.cos() + complementary
}

/// Rotation of the coordinate frame about the z axis by `theta` (ERFA's `Rz`).
fn rot_z(theta: f64) -> [[f64; 3]; 3] {
    let (sin_t, cos_t) = theta.sin_cos();
    [[cos_t, sin_t, 0.0], [-sin_t, cos_t, 0.0], [0.0, 0.0, 1.0]]
}

fn transpose(m: [[f64; 3]; 3]) -> [[f64; 3]; 3] {
    let mut t = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            t[i][j] = m[j][i];
        }
    }
    t
}

/// TEME (what SGP4 outputs) -> GCRS (what the Horizons fixture stores).
///
/// Two steps, per Vallado & Crawford, "Implementation Issues Surrounding the
/// New IAU Reference Systems":
///
/// 1. TEME -> true equator and equinox of date, a rotation about the pole by
///    the equation of the equinoxes.
/// 2. True-of-date -> GCRS, the inverse of ERFA's equinox-based
///    bias-precession-nutation matrix (`eraPnm06a`, which is defined in the
///    sense `V(date) = rbpn * V(GCRS)`).
///
/// Polar motion is deliberately absent: it relates the terrestrial frames, not
/// these celestial ones.
fn teme_to_gcrs(r_teme_km: [f64; 3], jd_tt: f64) -> [f64; 3] {
    let date2 = jd_tt - JD_J2000;
    let r_tod = erfa::vectors_and_matrices::mat_mul_pvec(
        rot_z(-equation_of_the_equinoxes(jd_tt)),
        r_teme_km,
    );
    let rbpn = erfa::prenut::pn_matrix_06a(JD_J2000, date2);
    erfa::vectors_and_matrices::mat_mul_pvec(transpose(rbpn), r_tod)
}

fn magnitude(v: [f64; 3]) -> f64 {
    (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt()
}

fn difference(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

/// Load the committed ephemeris fixture through the production reader and pair
/// every sample time with the position the engine reports for it.
fn horizons_samples() -> Vec<Sample> {
    let bytes = std::fs::read(EPHEMERIS_PATH).expect("read committed SGP4-check ISS ephemeris");
    let sample_times = read_sample_times(&bytes);
    let ephemeris =
        SatelliteEphemeris::from_binary(SatelliteId::ISS, &bytes).expect("parse ISS ephemeris");
    assert_eq!(ephemeris.len(), sample_times.len());

    sample_times
        .into_iter()
        .map(|jd_tdb| {
            let (x, y, z) = ephemeris
                .interpolate(jd_tdb)
                .expect("fixture sample time is inside the fixture's own range");
            Sample {
                jd_tdb,
                horizons_gcrs_km: [x, y, z],
            }
        })
        .collect()
}

/// Parse the pinned TLE and return the propagator plus its epoch as a UTC
/// Julian date. `Elements::epoch()` is Julian years since J2000 in UTC.
fn iss_propagator() -> (sgp4::Constants, f64) {
    let tle = std::fs::read_to_string(TLE_PATH).expect("read pinned ISS TLE fixture");
    let mut elements = sgp4::parse_3les(&tle).expect("parse pinned ISS TLE fixture");
    assert_eq!(
        elements.len(),
        1,
        "TLE fixture must hold exactly one object"
    );
    let elements = elements.remove(0);
    assert_eq!(
        elements.norad_id, 25544,
        "TLE fixture must be the ISS (NORAD 25544)"
    );

    let jd_epoch_utc = JD_J2000 + elements.epoch() * 365.25;
    let constants = sgp4::Constants::from_elements(&elements).expect("initialise SGP4 propagator");
    (constants, jd_epoch_utc)
}

/// Propagate the pinned TLE to a fixture sample time and express the result in
/// the fixture's frame (geocentric GCRS, km).
fn sgp4_gcrs_km(constants: &sgp4::Constants, jd_epoch_utc: f64, jd_tdb: f64) -> [f64; 3] {
    let jd_tt = tdb_jd_to_tt_jd(jd_tdb);
    let jd_utc = tt_jd_to_utc_jd(jd_tt);
    let minutes_since_epoch = (jd_utc - jd_epoch_utc) * 1440.0;
    let prediction = constants
        .propagate(sgp4::MinutesSinceEpoch(minutes_since_epoch))
        .expect("SGP4 propagation");
    teme_to_gcrs(prediction.position, jd_tt)
}

/// The cross-check itself: SGP4 from a pinned TLE must agree with the committed
/// Horizons ephemeris to better than [`MAX_POSITION_DELTA_KM`] at every sample.
#[test]
fn sgp4_matches_horizons_near_tle_epoch() {
    let (constants, jd_epoch_utc) = iss_propagator();
    let samples = horizons_samples();
    assert!(
        samples.len() > 1000,
        "fixture should cover a full day at 1-minute steps, got {} samples",
        samples.len()
    );

    // The tolerance is only justified near the TLE epoch, so assert the
    // fixture window really is the one the TLE was captured with.
    let (first, last) = (samples[0].jd_tdb, samples[samples.len() - 1].jd_tdb);
    assert!(
        jd_epoch_utc > first && jd_epoch_utc < last,
        "TLE epoch (JD {jd_epoch_utc}) must fall inside the ephemeris window (JD {first}..{last}); \
         the fixtures have drifted apart and must be regenerated together"
    );
    let max_tle_age_days = (last - jd_epoch_utc).max(jd_epoch_utc - first);
    assert!(
        max_tle_age_days < 1.5,
        "TLE age reaches {max_tle_age_days:.2} d across the window; the near-epoch tolerance \
         no longer applies (see the tolerance table in this file's doc comment)"
    );

    let mut max_delta_km: f64 = 0.0;
    let mut sum_delta_km = 0.0;
    // Seeded with a real sample time rather than NaN: `max_delta_km` starts at
    // 0.0 and every delta is >= 0.0, so a run in which no sample ever strictly
    // exceeds the running maximum (all deltas exactly zero) would otherwise
    // print `NaN` for the worst JD instead of a valid sample.
    let mut worst_jd = samples[0].jd_tdb;

    for sample in &samples {
        let sgp4_km = sgp4_gcrs_km(&constants, jd_epoch_utc, sample.jd_tdb);
        let delta_km = magnitude(difference(sgp4_km, sample.horizons_gcrs_km));

        assert!(
            delta_km < MAX_POSITION_DELTA_KM,
            "SGP4 and the committed Horizons ephemeris disagree by {delta_km:.3} km at \
             JD(TDB) {jd:.6} (limit {MAX_POSITION_DELTA_KM} km). Suspect a frame, time-scale or \
             ephemeris-parsing regression — see this file's doc comment.",
            jd = sample.jd_tdb
        );

        sum_delta_km += delta_km;
        if delta_km > max_delta_km {
            max_delta_km = delta_km;
            worst_jd = sample.jd_tdb;
        }
    }

    println!(
        "SGP4 vs Horizons over {} samples (TLE age -{:.2} d .. +{:.2} d): mean {:.1} m, max {:.1} m at JD(TDB) {:.6}",
        samples.len(),
        jd_epoch_utc - samples[0].jd_tdb,
        samples[samples.len() - 1].jd_tdb - jd_epoch_utc,
        1000.0 * sum_delta_km / samples.len() as f64,
        1000.0 * max_delta_km,
        worst_jd
    );
}

/// Prove the cross-check can actually fail: the two conversions it depends on
/// are each worth tens to hundreds of kilometres, far outside
/// [`MAX_POSITION_DELTA_KM`]. Without this, a future refactor that quietly
/// dropped either step could leave `sgp4_matches_horizons_near_tle_epoch`
/// passing for the wrong reason.
///
/// The bounds below are floors an order of magnitude under the values measured
/// on this fixture pair (44.1 km and 530.4 km respectively), so they assert
/// "still catastrophically wrong" rather than pinning an exact number.
#[test]
fn time_scale_and_frame_conversions_are_load_bearing() {
    let (constants, jd_epoch_utc) = iss_propagator();
    let samples = horizons_samples();

    let mut max_raw_teme_km: f64 = 0.0;
    let mut max_tdb_as_utc_km: f64 = 0.0;

    for sample in &samples {
        let jd_tt = tdb_jd_to_tt_jd(sample.jd_tdb);
        let jd_utc = tt_jd_to_utc_jd(jd_tt);

        // (1) Correct time, but the TEME->GCRS rotation skipped.
        let raw_teme = constants
            .propagate(sgp4::MinutesSinceEpoch((jd_utc - jd_epoch_utc) * 1440.0))
            .expect("SGP4 propagation")
            .position;
        max_raw_teme_km =
            max_raw_teme_km.max(magnitude(difference(raw_teme, sample.horizons_gcrs_km)));

        // (2) Correct frame, but the ephemeris' TDB tag fed to SGP4 as if it
        // were UTC (~69 s of along-track error).
        let tdb_as_utc = teme_to_gcrs(
            constants
                .propagate(sgp4::MinutesSinceEpoch(
                    (sample.jd_tdb - jd_epoch_utc) * 1440.0,
                ))
                .expect("SGP4 propagation")
                .position,
            jd_tt,
        );
        max_tdb_as_utc_km =
            max_tdb_as_utc_km.max(magnitude(difference(tdb_as_utc, sample.horizons_gcrs_km)));
    }

    println!(
        "sensitivity: skipping TEME->GCRS costs up to {max_raw_teme_km:.1} km; \
         feeding TDB as UTC costs up to {max_tdb_as_utc_km:.1} km"
    );

    assert!(
        max_raw_teme_km > 5.0 * MAX_POSITION_DELTA_KM,
        "skipping the TEME->GCRS rotation only moved the position by {max_raw_teme_km:.1} km; \
         the cross-check is no longer sensitive to frame errors"
    );
    assert!(
        max_tdb_as_utc_km > 25.0 * MAX_POSITION_DELTA_KM,
        "treating TDB as UTC only moved the position by {max_tdb_as_utc_km:.1} km; \
         the cross-check is no longer sensitive to time-scale errors"
    );
}
