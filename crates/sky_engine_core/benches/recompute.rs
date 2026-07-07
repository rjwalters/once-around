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
use sky_engine_core::planets::{compute_all_body_positions_full, compute_planet_position_full, Planet};
use sky_engine_core::time::SkyTime;

fn bench_recompute(c: &mut Criterion) {
    // A representative observation time.
    let time = SkyTime::from_utc(2026, 7, 6, 12, 0, 0.0);

    // Full body set: Sun, Moon, and all 7 planets. This is the bulk of the
    // per-frame VSOP87 work.
    c.bench_function("compute_all_body_positions_full", |b| {
        b.iter(|| compute_all_body_positions_full(black_box(&time)))
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
