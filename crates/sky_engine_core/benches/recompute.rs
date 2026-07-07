//! Microbenchmark for the per-frame recompute math kernels.
//!
//! `recompute()` in the wasm `SkyEngine` wrapper is dominated by the VSOP87
//! planetary series (`planets.rs`) and the IAU nutation / obliquity series
//! (`coords.rs`). Those pure-math functions live in this crate, so we benchmark
//! them directly here — no wasm-bindgen or browser needed.
//!
//! Run with: `cargo bench -p sky_engine_core`
//!
//! Purpose: produce a stable before/after number when tuning `opt-level`,
//! `codegen-units`, and `wasm-opt` flags (issue #14).

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use sky_engine_core::coords::{compute_nutation, true_obliquity};
use sky_engine_core::planets::{
    compute_all_body_positions_full, compute_all_body_positions_with_ctx,
    compute_planet_position_full, Planet,
};
use sky_engine_core::{
    compute_all_comet_positions, compute_all_comet_positions_with_ctx,
    compute_all_minor_body_positions, compute_all_minor_body_positions_with_ctx,
    compute_all_planetary_moon_positions, compute_all_planetary_moon_positions_with_ctx,
    TimeContext,
};
use sky_engine_core::time::SkyTime;

fn bench_recompute(c: &mut Criterion) {
    // A representative observation time.
    let time = SkyTime::from_utc(2026, 7, 6, 12, 0, 0.0);

    // Full body set: Sun, Moon, and all 7 planets. This is the bulk of the
    // per-frame VSOP87 work. Post-#3 this shares a single TimeContext internally.
    c.bench_function("compute_all_body_positions_full", |b| {
        b.iter(|| compute_all_body_positions_full(black_box(&time)))
    });

    // "Before" — the full recompute() inner math (bodies + 18 moons + 15 minor
    // bodies + 7 comets) with each aggregate building its OWN context and each body
    // re-deriving nothing shared across aggregates. Mirrors pre-#3 recompute cost.
    c.bench_function("recompute_all_independent", |b| {
        b.iter(|| {
            let t = black_box(&time);
            black_box(compute_all_body_positions_full(t));
            black_box(compute_all_planetary_moon_positions(t));
            black_box(compute_all_minor_body_positions(t));
            black_box(compute_all_comet_positions(t));
        })
    });

    // "After" — the same inner math sharing ONE TimeContext across every body path,
    // as SkyEngine::recompute() now does. Exactly 1 Earth-VSOP + 1 nutation eval.
    c.bench_function("recompute_all_with_ctx", |b| {
        b.iter(|| {
            let ctx = TimeContext::new(black_box(&time));
            black_box(compute_all_body_positions_with_ctx(&ctx));
            black_box(compute_all_planetary_moon_positions_with_ctx(&ctx));
            black_box(compute_all_minor_body_positions_with_ctx(&ctx));
            black_box(compute_all_comet_positions_with_ctx(&ctx));
        })
    });

    // Single planet evaluation — the per-sample cost of the orbit-worker's
    // `fill_planet_track` targeted path (issue #10). One orbit refresh does
    // 7 planets * 120 samples of exactly this, instead of 840 full recomputes.
    c.bench_function("compute_planet_position_full", |b| {
        b.iter(|| compute_planet_position_full(black_box(Planet::Jupiter), black_box(&time)))
    });

    // Nutation + obliquity series (IAU 1980, 63-term). Runs every recompute.
    let jde = time.julian_date_tdb();
    c.bench_function("compute_nutation", |b| {
        b.iter(|| compute_nutation(black_box(jde)))
    });

    c.bench_function("true_obliquity", |b| {
        b.iter(|| true_obliquity(black_box(jde)))
    });
}

criterion_group!(benches, bench_recompute);
criterion_main!(benches);
