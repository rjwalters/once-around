//! Per-time-step shared context for one `recompute()` pass.
//!
//! Every `compute_*_position` function needs the same time-invariant intermediates
//! at a given instant: Earth's VSOP87 heliocentric vector, the IAU-1980 nutation
//! series, the true obliquity of the ecliptic, and GMST. Historically each body
//! recomputed these independently, so a single `recompute()` re-evaluated the
//! full VSOP87-Earth series ~50 times and the 63-term nutation series ~74 times.
//!
//! [`TimeContext`] computes each of these exactly once and is threaded through the
//! `*_with_ctx` variants of the position functions. The original `*_full` /
//! standalone signatures are retained as thin wrappers that construct their own
//! `TimeContext`, so external callers (wasm methods, `fill_planet_track`,
//! `find_passes`, tests) are unchanged.
//!
//! ## Bit-identical guarantee
//!
//! `TimeContext::new` derives every field with the *same* functions, in the *same*
//! order, that each sub-function would have used on its own
//! (`heliocentric_position`, `compute_nutation`, `mean_obliquity`, `compute_gmst`).
//! IEEE-754 arithmetic is deterministic for identical inputs, so threading these
//! precomputed values produces bit-identical outputs. Do NOT reorder the field
//! computations or fold them into different expressions.

use crate::coords::{compute_gmst, compute_nutation, mean_obliquity, Nutation};
use crate::planets::{heliocentric_position, Planet};
use crate::time::SkyTime;

/// Time-invariant intermediates shared across all body position calculations
/// within a single `recompute()` at one instant.
pub struct TimeContext {
    /// TDB Julian date (`time.julian_date_tdb()`).
    pub jde: f64,
    /// VSOP87A Earth heliocentric position (AU, ecliptic), computed once.
    pub earth_helio: (f64, f64, f64),
    /// IAU-1980 nutation (Δψ, Δε) in radians.
    pub nutation: Nutation,
    /// True obliquity of the ecliptic in radians: `mean_obliquity(jde) + Δε`.
    pub true_obliquity_rad: f64,
    /// Greenwich Mean Sidereal Time in radians (keyed on UTC).
    pub gmst: f64,
}

impl TimeContext {
    /// Compute all shared intermediates for `time` exactly once.
    ///
    /// The field expressions mirror the independent computations previously done
    /// inside each `compute_*_position` function, guaranteeing bit-identical
    /// downstream results (see module docs).
    pub fn new(time: &SkyTime) -> Self {
        let jde = time.julian_date_tdb();
        let earth_helio = heliocentric_position(Planet::Earth, jde);
        let nutation = compute_nutation(jde);
        // Matches `true_obliquity(jde)` = `mean_obliquity(jde) + compute_nutation(jde).delta_epsilon`.
        let true_obliquity_rad = mean_obliquity(jde) + nutation.delta_epsilon;
        let gmst = compute_gmst(time.julian_date_utc());
        Self {
            jde,
            earth_helio,
            nutation,
            true_obliquity_rad,
            gmst,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::coords::NUTATION_EVAL_COUNT;
    use crate::planets::{
        compute_all_body_positions_full, compute_all_body_positions_with_ctx,
        compute_moon_position_full, compute_planet_position_full, compute_sun_position_full,
        EARTH_VSOP_EVAL_COUNT,
    };
    use crate::{
        compute_all_comet_positions, compute_all_comet_positions_with_ctx,
        compute_all_minor_body_positions, compute_all_minor_body_positions_with_ctx,
        compute_all_planetary_moon_positions, compute_all_planetary_moon_positions_with_ctx,
        Comet, MinorBody, PlanetaryMoon,
    };

    /// A spread of test epochs: J2000.0, ~2020, today (2026-07-06), and a far-future date.
    const TEST_JDS: [f64; 4] = [2451545.0, 2458849.5, 2461041.5, 2470000.0];

    fn reset_counters() {
        EARTH_VSOP_EVAL_COUNT.with(|c| c.set(0));
        NUTATION_EVAL_COUNT.with(|c| c.set(0));
    }

    /// The shared-context path must be BIT-IDENTICAL to the independent per-body
    /// path (each thin wrapper constructing its own context). This proves that
    /// deduping the Earth-VSOP / nutation evaluations does not perturb any output.
    #[test]
    fn shared_ctx_bit_identical_to_independent_path() {
        for &jd in &TEST_JDS {
            let time = SkyTime::from_jd(jd);
            let ctx = TimeContext::new(&time);

            // --- Celestial bodies (Sun, Moon, 7 planets) ---
            let shared = compute_all_body_positions_with_ctx(&ctx);
            let independent = compute_all_body_positions_full(&time);
            for i in 0..9 {
                assert_eq!(shared[i].direction.x, independent[i].direction.x, "body {i} x @ {jd}");
                assert_eq!(shared[i].direction.y, independent[i].direction.y, "body {i} y @ {jd}");
                assert_eq!(shared[i].direction.z, independent[i].direction.z, "body {i} z @ {jd}");
                assert_eq!(shared[i].distance_km, independent[i].distance_km, "body {i} dist @ {jd}");
                assert_eq!(
                    shared[i].angular_diameter_rad, independent[i].angular_diameter_rad,
                    "body {i} ang @ {jd}"
                );
            }

            // --- Planetary moons ---
            let shared_moons = compute_all_planetary_moon_positions_with_ctx(&ctx);
            let independent_moons = compute_all_planetary_moon_positions(&time);
            for i in 0..PlanetaryMoon::ALL.len() {
                assert_eq!(shared_moons[i].direction.x, independent_moons[i].direction.x, "moon {i} x @ {jd}");
                assert_eq!(shared_moons[i].direction.y, independent_moons[i].direction.y, "moon {i} y @ {jd}");
                assert_eq!(shared_moons[i].direction.z, independent_moons[i].direction.z, "moon {i} z @ {jd}");
                assert_eq!(shared_moons[i].distance_km, independent_moons[i].distance_km, "moon {i} dist @ {jd}");
                assert_eq!(
                    shared_moons[i].angular_diameter_rad, independent_moons[i].angular_diameter_rad,
                    "moon {i} ang @ {jd}"
                );
            }

            // --- Minor bodies ---
            let shared_minor = compute_all_minor_body_positions_with_ctx(&ctx);
            let independent_minor = compute_all_minor_body_positions(&time);
            for i in 0..MinorBody::ALL.len() {
                assert_eq!(shared_minor[i].direction.x, independent_minor[i].direction.x, "minor {i} x @ {jd}");
                assert_eq!(shared_minor[i].direction.y, independent_minor[i].direction.y, "minor {i} y @ {jd}");
                assert_eq!(shared_minor[i].direction.z, independent_minor[i].direction.z, "minor {i} z @ {jd}");
                assert_eq!(shared_minor[i].distance_km, independent_minor[i].distance_km, "minor {i} dist @ {jd}");
                assert_eq!(shared_minor[i].helio_distance_km, independent_minor[i].helio_distance_km, "minor {i} helio @ {jd}");
            }

            // --- Comets ---
            let shared_comets = compute_all_comet_positions_with_ctx(&ctx);
            let independent_comets = compute_all_comet_positions(&time);
            for i in 0..Comet::ALL.len() {
                assert_eq!(shared_comets[i].direction.x, independent_comets[i].direction.x, "comet {i} x @ {jd}");
                assert_eq!(shared_comets[i].direction.y, independent_comets[i].direction.y, "comet {i} y @ {jd}");
                assert_eq!(shared_comets[i].direction.z, independent_comets[i].direction.z, "comet {i} z @ {jd}");
                assert_eq!(shared_comets[i].distance_km, independent_comets[i].distance_km, "comet {i} dist @ {jd}");
                assert_eq!(shared_comets[i].magnitude, independent_comets[i].magnitude, "comet {i} mag @ {jd}");
            }
        }
    }

    /// A single `recompute()`'s body/moon/minor/comet paths must evaluate the Earth
    /// VSOP87 series exactly once and the nutation series exactly once, all sourced
    /// from the shared `TimeContext`. (Stars are time-invariant; satellites keep
    /// their own UTC-keyed Earth-VSOP eval and add none here because none is loaded.)
    #[test]
    fn single_earth_vsop_single_nutation_per_recompute() {
        let time = SkyTime::from_utc(2026, 7, 6, 12, 0, 0.0);
        reset_counters();

        // Mirror SkyEngine::recompute(): ONE context threaded through every path.
        let ctx = TimeContext::new(&time);
        let _bodies = compute_all_body_positions_with_ctx(&ctx);
        let _moons = compute_all_planetary_moon_positions_with_ctx(&ctx);
        let _minor = compute_all_minor_body_positions_with_ctx(&ctx);
        let _comets = compute_all_comet_positions_with_ctx(&ctx);

        EARTH_VSOP_EVAL_COUNT.with(|c| {
            assert_eq!(c.get(), 1, "expected exactly 1 Earth-VSOP eval per recompute, got {}", c.get())
        });
        NUTATION_EVAL_COUNT.with(|c| {
            assert_eq!(c.get(), 1, "expected exactly 1 nutation eval per recompute, got {}", c.get())
        });
    }

    /// Sanity check that the counters are real: the OLD independent path (each thin
    /// wrapper building its own context) evaluates Earth-VSOP + nutation once per
    /// body — 9 each for the 9 celestial bodies. This is the waste the shared
    /// context removes (the full recompute previously did ~50 / ~74).
    #[test]
    fn independent_path_evaluates_once_per_body() {
        use crate::planets::Planet;
        let time = SkyTime::from_utc(2026, 7, 6, 12, 0, 0.0);
        reset_counters();

        let _ = compute_sun_position_full(&time);
        let _ = compute_moon_position_full(&time);
        for p in [
            Planet::Mercury,
            Planet::Venus,
            Planet::Mars,
            Planet::Jupiter,
            Planet::Saturn,
            Planet::Uranus,
            Planet::Neptune,
        ] {
            let _ = compute_planet_position_full(p, &time);
        }

        EARTH_VSOP_EVAL_COUNT.with(|c| assert_eq!(c.get(), 9, "9 bodies -> 9 Earth-VSOP evals"));
        NUTATION_EVAL_COUNT.with(|c| assert_eq!(c.get(), 9, "9 bodies -> 9 nutation evals"));
    }
}
