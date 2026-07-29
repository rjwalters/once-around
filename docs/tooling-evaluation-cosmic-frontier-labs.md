# Tooling Evaluation: Cosmic Frontier Labs Open Source

Evaluation of the [CosmicFrontierLabs](https://github.com/CosmicFrontierLabs) open-source
repositories for possible use in once-around — as dependencies, as reference implementations,
or as sources of independent validation data.

Evaluated 2026-07-29 against once-around `main` @ `e524f76`. Upstream state as of the same
date is recorded per repo; all version, license, and dependency facts below were read from
the repos themselves (cloned locally), not from their READMEs.

## TL;DR

| Repo | Language | License | WASM (`wasm32-unknown-unknown`) | Recommendation |
|---|---|---|---|---|
| [rust-ephem](https://github.com/CosmicFrontierLabs/rust-ephem) | Rust + PyO3 | Apache-2.0 | **No** — verified build failure | **Test-validation only** (offline, host-side) |
| [coast-sim](https://github.com/CosmicFrontierLabs/coast-sim) | Python | Apache-2.0 | N/A (Python) | **Not useful** |
| [coast-sim-orbit-visualizer](https://github.com/CosmicFrontierLabs/coast-sim-orbit-visualizer) | TypeScript | Apache-2.0 | N/A (browser) | **Borrow techniques** (narrow) |
| [focalplane](https://github.com/CosmicFrontierLabs/focalplane) | Rust | MIT *(metadata only, no LICENSE file)* | **No** — no wasm target, unbuildable externally | **Borrow one technique** |
| cfl-foundations, solid-diff, sig-int, tiny-tracker, jetson-gpio-rust, cfl-manimations | mixed | mostly **unlicensed** | — | **Not useful** (see [Secondary repos](#secondary-repos)) |

The single actionable outcome is **not** adopting any Cosmic Frontier Labs crate. It is that
building an independent TLE/SGP4 cross-check — which rust-ephem made easy to prototype —
exposed a **real, measured accuracy problem in our own shipped ISS ephemeris** and a
**~60 s error in our Earth-shadow model**. See [Measurements](#measurements) and
[Follow-up work](#follow-up-work).

---

## What once-around actually does today

The comparisons below are grounded in these files:

- **Satellite ephemeris pipeline** — `scripts/generate_satellite_ephemeris.py` pulls ISS/HST
  geocentric state vectors from NASA Horizons (`CENTER=500@399`, `REF_PLANE=FRAME` →
  ICRF/J2000 equatorial, `VEC_CORR=NONE`, `OUT_UNITS=KM-S`) and writes
  `u32 count` + `(jd, x_km, y_km, z_km)` f64 little-endian records. The `jd` column is
  Horizons' **JDTDB**, and the engine reads it as TDB
  (`crates/sky_engine_core/src/satellites.rs:70`, `:384`) — consistent, no time-scale bug.
- **Refresh cadence** — `.github/workflows/refresh-satellite-ephemeris.yml` regenerates
  weekly; Horizons only carries the ISS *predicted* trajectory ~30 days out, and the script
  clamps the window to Horizons' cutoff.
- **Pass prediction** — `SkyEngine::find_passes` (`crates/sky_engine/src/lib.rs:811`) does a
  coarse visibility scan plus 30-second binary-search refinement of rise/set, gated on
  above-horizon ∧ illuminated ∧ Sun below limit.
- **Illumination** — `is_in_earth_shadow` (`crates/sky_engine_core/src/satellites.rs:263`)
  uses a **cylindrical** shadow: anti-Sun hemisphere plus perpendicular distance to the
  Earth–Sun line `< 1.02 × 6378.137 km`.
- **Pinned test fixture** — `crates/sky_engine/tests/fixtures/iss_ephemeris_fixture.bin`
  (fixed 2026-01-17 3-day window) backs the pass-prediction tests so they don't drift with
  the weekly refresh.
- **Stars** — `crates/sky_engine_core/src/catalog.rs` (`Star { ra, dec, vmag, bv_color, id }`,
  Bright Star Catalog, 9096 entries in `data/stars/bsc5.bin`) rendered as point sprites with
  FOV-based LOD in `apps/web/src/renderer/layers/stars.ts`; colour from a hand-tuned
  piecewise B−V→RGB ramp in `apps/web/src/renderer/utils/colors.ts:70`.
- **Build target** — `crates/sky_engine` compiles to `wasm32-unknown-unknown` via
  wasm-bindgen (`pnpm build:wasm`). Any Rust dependency has to survive that triple.

---

## Measurements

All numbers below were produced during this evaluation. Reproduction steps are in
[Appendix: reproduction](#appendix-reproduction). Nothing here is quoted from an upstream
accuracy claim.

Inputs: ISS TLE fetched from Celestrak on 2026-07-29 (epoch `26210.12010945` =
2026-07-29 02:53:37 UTC), `rust-ephem 0.12.0` installed from PyPI (CPython 3.12, macOS
arm64 wheel), NASA Horizons queried with once-around's exact vector parameters.

### 1. rust-ephem's SGP4/GCRS propagation vs a fresh Horizons pull

Geocentric ICRF positions, 3-hour windows at 60 s steps, time tags aligned to
< 0.05 ms (Horizons JDTDB → UTC via astropy before handing UTC to rust-ephem):

| TLE age | mean \|Δr\| | max \|Δr\| | along-track (mean) | perpendicular (mean) | geocentric sep (mean) | equiv. along-track time |
|---|---|---|---|---|---|---|
| ~0.5 d | **0.027 km** | 0.049 km | +0.018 km | 0.010 km | 0.7″ | 0.003 s |
| ~7 d | **0.296 km** | 0.332 km | +0.292 km | 0.048 km | 9.0″ | 0.038 s |
| ~21 d | **0.900 km** | 0.943 km | +0.888 km | 0.131 km | 27.3″ | 0.116 s |

Two independent methods — SGP4 from a Celestrak TLE, and JPL's own predicted ISS
trajectory — agree to **27 m near epoch and under 1 km three weeks out**, with the
disagreement almost entirely along-track. The upstream "meters-level LEO accuracy" claim is
consistent with what we measured near epoch. Caveat: both are *predictions* made from
roughly contemporaneous state, so this measures **method agreement**, not truth; neither
models an unannounced reboost.

### 2. Our shipped `iss_ephemeris.bin` vs both fresh sources — the interesting result

`apps/web/public/data/iss_ephemeris.bin` on `main` holds 40 321 points at 60 s covering
2026-07-26 23:58 → 2026-08-23 23:58 UTC (JDTDB 2026-07-27 00:00 → 2026-08-24 00:00). It was
generated by the weekly refresh on **2026-07-27** (commit `c0f8ac3`, authored 07:03 UTC;
`START_TIME` is the run date — `scripts/generate_satellite_ephemeris.py:226` feeds `:108`)
— i.e. the file
was **two days old**, not a week old, when it was measured. Comparing the *same instants* in
that file against data generated on 2026-07-29:

| Instant (UTC) | horizon from generation | vs fresh Horizons pull | vs rust-ephem SGP4 (fresh TLE) |
|---|---|---|---|
| 2026-07-29 02:53 | ≈ +2 d | — | 1.74 km |
| 2026-08-01 12:00 / 02:53 | ≈ +5.5 d | 3.80 km | 2.52 km |
| 2026-08-05 12:00 / 02:53 | ≈ +9.5 d | 26.1 km | 23.2 km |
| 2026-08-12 12:00 / 02:53 | ≈ +16.5 d | 107 km | 101 km |
| 2026-08-19 12:00 / 02:53 | ≈ +23.5 d | **242 km** | **233 km** |

The two fresh sources agree with each other to < 1 km (§1) and both disagree with our
shipped file by the same growing amount, so the shipped file is the outlier — and because it
was only two days old, **the growth is drag-model divergence inside JPL's own 28-day
prediction, not staleness accumulated between weekly refreshes.** The error is a function of
how far past the generation epoch a sample sits, and past a shallow minimum a few days out it
grows smoothly and monotonically: independent differencing during review (fresh Horizons vs.
the same committed file) measured 1.9 km at +2 d, a 0.6 km minimum at +4 d, then 10.1 km at
+7 d, 71.6 km at +14 d, 186.7 km at +21 d and 241.1 km at +23.5 d — a smooth, roughly
quadratic curve with **no kink at the file's two-day age or at the seven-day refresh
interval**, which a staleness explanation would require.

242 km along-track is ≈ 31 seconds of ISS motion — i.e. a pass predicted from the far end of
the shipped window can be off by roughly half a minute, degrading toward the window edge.
This is a property of committing a 28-day *prediction* at all, largely independent of how
often we refresh it: the same review differencing puts the gain from moving to a daily
refresh at only ~187 km → ~150 km at +21 d. The remedy space is therefore **window length and
how far-out predictions are presented**, not refresh cadence. The effect is invisible to our
current tests because the pass-prediction fixture is a pinned 3-day window.

### 3. Earth-shadow model: our cylinder vs rust-ephem's umbra/penumbra cones

Both models re-implemented in Python (ours verbatim from `is_in_earth_shadow`, theirs
verbatim from rust-ephem `src/constraints/eclipse.rs`) and evaluated over the same real ISS
trajectory (48 h, 5 s steps, 34 561 samples, 31 eclipse cycles):

| Model | eclipsed fraction |
|---|---|
| once-around cylinder (1.02 R⊕) | 40.16 % |
| rust-ephem umbra only | 37.99 % |
| rust-ephem umbra + penumbra | 38.32 % |

| Comparison | eclipse entry Δ | eclipse exit Δ | per-sample agreement |
|---|---|---|---|
| ours − umbra-only | **−60.5 s** (min −65, max −60) | **+60.5 s** (min +55, max +65) | 97.83 % |
| ours − (umbra+penumbra) | **−51.5 s** | **+51.3 s** | 98.16 % |

Geometry at ISS altitude (s ≈ 6797 km behind Earth centre): our cylinder radius is
**6505.7 km**, the true umbra radius is **6347.2 km** and the penumbra outer radius is
**6409.5 km** — our shadow is ~96 km wider than even the penumbra. Consequence: we declare
the ISS "not illuminated" about **a minute too early at eclipse entry and keep it dark about
a minute too long at exit**, which directly shortens the reported visible pass at both ends.
This is our bug, found by having a second implementation to diff against; the fix is ~20
lines of cone geometry (see [Follow-up work](#follow-up-work)).

### 4. WASM compatibility, verified by building

- **rust-ephem does not build for `wasm32-unknown-unknown`.** `cargo build --target
  wasm32-unknown-unknown` fails first in `getrandom 0.2.16`
  (`the wasm*-unknown-unknown targets are not supported by default`). Forcing
  `getrandom/js` moves the failure to two native build scripts:
  `ring v0.17.14` (C/asm) and `openssl-sys v0.9.116`. The chain is
  `rust_ephem → anise 0.7 → hifitime 4.2 → openssl/ureq → rustls → ring`, so
  `--no-default-features` (which only drops the `ut1` feature) does **not** help — `ring`
  still fails. Independently, `pyo3` with `extension-module` is a non-optional dependency
  used in 34 of 55 source files, so even a dependency-free variant would not link as a
  wasm-bindgen module.
- **`sgp4` and `erfa` do build for `wasm32-unknown-unknown`.** A scratch crate depending on
  `sgp4 2.4.0` (MIT) and `erfa 0.2.1` (MPL-2.0) — the two pure-Rust crates rust-ephem itself
  uses for propagation and TEME→GCRS — compiles cleanly for that triple with default
  features. If in-browser TLE propagation is ever wanted, that's the route; rust-ephem is not.
- **focalplane** has no wasm target, no `wasm_bindgen` usage, and is gated on unpublished
  git dependencies (below), so the question is moot.

### 5. Horizons ISS prediction ceiling (re-confirmed)

Queried today, Horizons refuses ISS vectors past **2026-08-28 02:54 TDB** —
exactly 30 days out, matching the clamp logic in `generate_satellite_ephemeris.py`. A
TLE-based cross-check has no such ceiling (accuracy degrades smoothly instead of the data
simply ending), which is the one structural advantage SGP4 has over our Horizons pipeline.

---

## Per-repo evaluation

### rust-ephem — *test-validation only*

**Recommendation: use it (or rather, the `sgp4` crate it wraps) as an offline, host-side
cross-check of our Horizons ephemeris pipeline. Do not add it as a dependency.**

| Property | Finding |
|---|---|
| License | Apache-2.0 (`Cargo.toml`, `pyproject.toml`, `LICENSE` present) |
| Version / maturity | 0.12.0, 30 GitHub releases, PyPI classifier still `Development Status :: 3 - Alpha` |
| Maintenance | Very active — last push 2026-07-29 (today); 30 releases; release-please automation; Dependabot |
| Team | Effectively one maintainer (113 of ~144 commits), with domain credibility (author is a Swift-mission scientist); bus factor 1 |
| Tests / CI | ~1135 Python test functions across 49 files, 64 Rust `#[test]`s, 5 CI workflows (wheels, lint, test, release) |
| Distribution | **PyPI only** (`rust_ephem`, wheels for CPython 3.10–3.13 on macOS/manylinux). **Not published to crates.io** — `index.crates.io` has no entry for `rust_ephem` or `rust-ephem` |
| WASM | **Fails** — see [§4](#4-wasm-compatibility-verified-by-building) |

**Why not a dependency.** Three independent blockers, any one of which is disqualifying:

1. It is a **Python extension module**, not a reusable Rust crate. `pyo3` with
   `extension-module` is unconditional and pervasive (34/55 files); there is no pure-Rust
   core to depend on. It isn't on crates.io, so we'd be git-pinning a crate that isn't
   designed to be linked by other Rust code.
2. Its dependency tree (`anise` → `hifitime` → `openssl`/`ring`, plus `ureq`, `dirs`,
   `rayon`, `numpy`) is native-only and cannot target `wasm32-unknown-unknown`.
3. Its accuracy story depends on **runtime network fetches** — it downloads IERS EOP data
   (we observed `EOP2 text loaded from cache: ~/.cache/rust_ephem/latest_eop2.short`) and
   optionally DE440 SPICE kernels. That model is fine for a server; it is wrong for a static
   web app and awkward for hermetic CI.

**Why still valuable.** As shown in [§1](#1-rust-ephems-sgp4gcrs-propagation-vs-a-fresh-horizons-pull)
and [§2](#2-our-shipped-iss_ephemerisbin-vs-both-fresh-sources--the-interesting-result), a
TLE-based second opinion is an *excellent* independent check on the Horizons pipeline: it
agrees to sub-km when both are fresh, so any large disagreement is a genuine signal
(prediction drift, a parsing/frame regression, a time-scale bug). It is also the only
practical way to sanity-check the region near Horizons' 30-day cliff.

For that job we do not need rust-ephem itself — the propagator underneath it (`sgp4`, MIT,
wasm-clean) plus `erfa` for TEME→GCRS is a two-crate, host-side test dependency that stays
inside our existing Rust toolchain. rust-ephem earned its keep here as the *prototyping
tool* that made the comparison cheap to build in an afternoon, and as a
cross-implementation reference for the constraint geometry in
[§3](#3-earth-shadow-model-our-cylinder-vs-rust-ephems-umbrapenumbra-cones).

**Techniques worth borrowing** (re-implement, don't vendor — Apache-2.0 permits either, but
these are small):

- `src/constraints/eclipse.rs` — conical umbra/penumbra shadow geometry. Measured ~60 s
  better than our cylinder at eclipse boundaries. **This is the highest-value single item in
  the whole survey.**
- `src/constraints/core.rs` — the composable constraint model (`&`, `|`, `~`, `^` over
  constraint evaluators, each returning a boolean mask plus a continuous "severity"). Our
  visibility test is a hard-coded three-term conjunction inside `find_passes`. Their
  *severity* idea (a smooth 0–1 depth instead of a boolean) is the interesting part: it
  would let the UI fade the ISS through the penumbra rather than snapping it off, and it
  makes root-finding on the boundary better-conditioned than bisecting a step function.

### focalplane — *borrow one technique*

**Recommendation: not usable as code; borrow the B−V → effective-temperature formula if we
ever want physically-derived star colour. Everything else is out of scope.**

| Property | Finding |
|---|---|
| License | `license = "MIT"` in `Cargo.toml` `[workspace.package]`, but **no LICENSE file anywhere and `authors = []`** — an incomplete grant. GitHub reports no license for the repo. |
| Version / maturity | 0.1.0, ~3 months old (first commit 2026-05-04), 51 commits, single author, no releases, not on crates.io |
| Maintenance | Active (last push 2026-07-29) but clearly an internal working repo (ships a `CLAUDE.md` agent-instruction file) |
| Size | ~33.7k Rust LOC across 79 files; 334 inline `#[test]`s; CI runs `cargo check`/`cargo test`; toolchain pinned to stable 1.88.0 |
| Buildability by outsiders | **Effectively no** — 5 git-pinned dependencies on two unpublished repos: `shared`, `meter-math`, `shared-wasm` from `CosmicFrontierLabs/cfl-foundations`, and three crates from `OrbitalCommons/starfield-datasources` |
| WASM | No wasm target, zero `wasm_bindgen`, CPU-only `ndarray`/`rayon` |

`cfl-foundations` is load-bearing (imported by 38 files) and supplies the unit system, pixel
geometry, **and the Airy-disk PSF primitive itself**; even the otherwise-standalone
`star_projector.rs` imports from it. So vendoring a file or two is not realistic.

Catalog handling — the part the issue flagged as possibly relevant — turns out not to live
here at all. Ingest, HEALPix sharding and cone search are delegated to the upstream
`starfield`/`starfield-gaia` crates (Arrow/Parquet shards downloaded and cached at runtime
via `reqwest`, queried with `cdshealpix`). focalplane's own spatial cull is a linear scan
with an axis-aligned bounding-box reject in focal-plane millimetres. For our ~9k-star Bright
Star Catalog — a single buffer uploaded once — none of that architecture applies. If we ever
layer in Gaia, look at `cdshealpix` directly rather than at this repo.

The PSF/sensor half (per-pixel Simpson integration of the Airy intensity, Poisson shot
noise, read noise, well depth, ADC quantisation, zodiacal background, jitter PSD) exists to
predict what a real CMOS detector records. A point-sprite night-sky viewer wants the
opposite of that. Not relevant.

**The one genuinely transferable item** is `simulator/src/photometry/stellar.rs` —
Ballesteros (2012) eq. 14 for B−V → T_eff, with a clamp at B−V = −0.4 because the formula
has a pole near −0.674 and returns negative temperatures below it. We already clamp at −0.4
in `bvToColorInPlace` (`apps/web/src/renderer/utils/colors.ts:71`), but our colour ramp
below that is hand-tuned piecewise RGB rather than blackbody-derived. Swapping in
T_eff → Planck → sRGB would make star colours physically motivated; whether that *looks*
better in a stylised viewer is an aesthetic question, not an accuracy one. Low priority, no
follow-up issue filed — noted here so a future contributor doesn't have to rediscover it.

Their two-stage render split (compute a base star image once per pointing; per-frame work is
a scalar multiply plus noise) is the same idea as our render-on-demand buffer rebuild, so
it's a validation of our existing approach rather than something to import.

### coast-sim — *not useful*

**Recommendation: no adoption, no technique to borrow. It is a mission-operations layer whose
astronomy is entirely delegated to rust-ephem, and its pass-window algorithm is a weaker
version of ours.**

| Property | Finding |
|---|---|
| License | Apache-2.0 (`LICENSE` present; boilerplate notice left as `Copyright [yyyy] [name of copyright owner]`) |
| Version / maturity | 0.7.0, classifier `Development Status :: 5 - Production/Stable`, release-please, Sphinx docs on RTD |
| Maintenance | Very active — last push 2026-07-29; PR numbers up to #228 |
| Size | ~27.4k LOC in `conops/`, ~37.5k LOC of tests across 69 files (tests larger than source), CI on Python 3.10–3.14, mypy + ruff + pre-commit |
| Dependencies | `rust-ephem>=0.11.0`, `astropy>=6`, `numpy>=2`, `pydantic>=2.12`, `pyproj`, `shapely`, `plotly`, `matplotlib`, `anywidget`, `tqdm`. **No** skyfield/poliastro/sgp4/pyephem |
| WASM | N/A — Python |

It is a well-run project, and irrelevant to us. Everything the issue hoped to find here —
TLE propagation, GCRS/ITRS frames, Sun/Moon/Earth-limb constraint geometry, ground-station
topocentric ephemeris — is **not implemented in coast-sim**; it is imported from rust-ephem.
`conops/config/constraint.py` is a composition-and-caching layer that builds
`rust_ephem.SunConstraint(...) & ~rust_ephem.EclipseConstraint()` and memoizes results. The
rest of the repo (spacecraft bus, power, thermal, ACS, slews, recorder, fault management,
scheduling, day-in-the-life simulation) models a spacecraft we do not have.

The one part that maps onto our domain is ground-station pass computation
(`conops/simulation/passes.py`), and there we are **ahead of it**:

- coast-sim computes elevation vectorised over the whole pre-sampled ephemeris grid, then
  extracts windows with `find_boundaries()` (`conops/common/common.py:59`), a `np.diff`
  run-length detector over the boolean mask. **There is no bisection, root-finding or
  sub-step interpolation anywhere** — pass start/end times snap to ephemeris sample indices,
  so accuracy is bounded by the step size.
- Our `find_passes` (`crates/sky_engine/src/lib.rs:811`) does the coarse scan *and* refines
  each rise/set with a 30-second binary search, plus a separate max-altitude sample pass.
- Their elevation test uses the station-to-satellite direction against the *geocentric* "up"
  vector — a spherical approximation. Our `eci_to_topocentric`
  (`crates/sky_engine_core/src/satellites.rs:302`) takes observer height and GMST explicitly.

Two ideas are worth knowing about even though neither justifies work today: their
run-length boolean-mask window extractor is a tidy formulation if we ever vectorise the
coarse scan, and their constraint memoisation (`_cached_check`, rounded
`(type, ra, dec, utime, roll)` key with hit/miss instrumentation, plus a dedicated benchmark
script) is a sound pattern if repeated visibility queries during timeline scrubbing ever
show up in a profile. Neither is a reason to read this repo again.

### coast-sim-orbit-visualizer — *borrow techniques (narrow)*

**Recommendation: nothing to adopt; one or two small rendering ideas worth stealing. Most of
what it does, we already do — and in the one place our architectures differ, ours is the
better fit.**

| Property | Finding |
|---|---|
| License | Apache-2.0 with the notice properly filled in (`Copyright 2026 CosmicFrontierLabs`). Earth textures are NASA public domain, attributed in `textures/SOURCES.md` |
| Version / maturity | `package.json` 1.0.0 (hand-set; no git tags), no CHANGELOG, ~38 commits, last push 2026-07-16 |
| Size | ~6.6k TS LOC across 30 files, ~1.4k Python (FastAPI serializer). **Two Python test files; zero TypeScript tests** |
| Dependencies | Exactly two runtime deps: `three ^0.183.2`, `luxon ^3.7.2`. Vite 5, TypeScript strict |
| CI | pytest + `npm run typecheck` + `vite build` + Docker publish |

Same rendering stack as ours (plain Three.js + `OrbitControls`, no Cesium, no
react-three-fiber), which makes the comparison meaningful. Data flow is "one precomputed
JSON blob for the whole timeline, loaded once" — served by FastAPI, or dragged onto the
canvas for a zero-backend demo.

**Where we differ, and why we're right:** it runs an unconditional `requestAnimationFrame`
loop that re-renders every frame (`app/orbit_viz.ts`). Our renderer is render-on-demand and
skips frames when nothing changed. Do not import anything from their loop structure.

**Explicitly absent, contrary to the issue's expectation:** there is **no orbit-track
rendering at all** — no orbit polyline, no trail, no ground track, no coverage footprint.
The spacecraft is drawn as an instantaneous marker. There is also no LOD, no texture
streaming, and the "star field" is 8000 uniformly random `THREE.Points` with no catalog, no
magnitudes and no colours. So the two things we might most have wanted to compare against —
satellite track tessellation and star rendering — do not exist here.

**Worth borrowing (small, specific):**

1. **Sun-aware atmosphere rim shader** — `src/scene_setup.ts` (~30 lines, two uniforms):
   `rim = pow(1 - dot(viewDir, normal), 3.2)` with
   `sunFactor = smoothstep(-0.3, 0.6, dot(normalize(worldPos), uSunDir))` mixing a dusk
   colour into a day colour. Our atmosphere is a plain `MeshBasicMaterial` shell
   (`apps/web/src/renderer/layers/earth.ts:295`), so this is a genuine visual upgrade for
   the space-view Earth: the glow would brighten on the sunlit limb and redden at the
   terminator instead of being uniform. Cheap, self-contained, and it does not add
   per-frame work beyond two uniform updates (compatible with render-on-demand).
2. **Uniform-grid sampling + quaternion SLERP with hemisphere correction** —
   `src/ephem_sampling.ts`. The `if (q0.dot(q1) < 0) negate q1` guard and their explicit
   note about scalar-first ECI→body vs. Three.js body→world conventions are the two things
   people get wrong. Relevant only if we ever animate an attitude-carrying object; our
   satellites are positions, not orientations.

**Not applicable to us,** despite looking useful in the abstract: their dynamic
`near`/`far` retuning exists because their scene spans a 6 m spacecraft to the Moon's orbit.
Our camera sits at the centre of a unit sky sphere with fixed `0.1 … 1000` clipping
(`apps/web/src/renderer/context.ts:35`) and has no such dynamic range. Likewise their
canvas→`CanvasTexture`→`Sprite` labels, GMST→Earth-rotation quaternion, procedural fallback
texture and Earth-parented surface markers are all patterns we already implement
(`renderer/utils/textures.ts`, `renderer/layers/earth.ts:575`, the label manager).

---

## Secondary repos

Quick pass over the rest of the organisation, for completeness. None warrant further
investigation.

| Repo | Language | License | Note |
|---|---|---|---|
| `cfl-foundations` | Rust | **none** | Shared crates (clock, meter-math, image proc, star projection, a `shared-wasm` serialization crate). The only one with any conceptual overlap, but it is unlicensed — meaning all rights reserved — and unpublished. Not usable. |
| `solid-diff` | Rust | **none** | Visual diffs of SolidWorks `.SLDPRT` files. Unrelated. |
| `sig-int` | Rust | Apache-2.0 | Nested-signal visualization; 50 KB, last touched 2026-03. Unrelated. |
| `tiny-tracker` | Rust | **none** | Internal task tracker. Unrelated. |
| `jetson-gpio-rust` | Rust | MIT | GPIO for NVIDIA Jetson. Unrelated. |
| `cfl-manimations` | Python | **none** | Manim animations of tracking algorithms. Unrelated. |

Licensing note for the organisation as a whole: `cfl-foundations`, `focalplane` (no LICENSE
file), `solid-diff`, `tiny-tracker` and `cfl-manimations` carry no usable licence grant.
Only `rust-ephem`, `coast-sim`, `coast-sim-orbit-visualizer` (Apache-2.0), `sig-int`
(Apache-2.0) and `jetson-gpio-rust` (MIT) are safe to reference in any form beyond reading.

---

## Follow-up work

Adoption work is deliberately **not** implemented in this evaluation. Issues filed:

- **[#89](https://github.com/rjwalters/once-around/issues/89) — Replace the cylindrical
  Earth-shadow approximation with a conical umbra/penumbra model.** Borrowed technique from
  rust-ephem `src/constraints/eclipse.rs`. Measured ~60 s error at both ends of every
  eclipse ([§3](#3-earth-shadow-model-our-cylinder-vs-rust-ephems-umbrapenumbra-cones)),
  which directly truncates reported ISS passes. ~20 lines, no new dependencies. Highest
  value-to-effort item in this survey.
- **[#90](https://github.com/rjwalters/once-around/issues/90) — Add an offline SGP4
  cross-check of the committed satellite ephemeris.** The validation-only adoption
  recommended for rust-ephem, implemented with the `sgp4` crate (MIT, verified
  wasm32-clean) instead of rust-ephem itself. Today nothing checks the Horizons pipeline at
  all.
- **[#91](https://github.com/rjwalters/once-around/issues/91) — Committed ISS ephemeris
  drifts ~240 km by the end of its 28-day window.** Found by
  [§2](#2-our-shipped-iss_ephemerisbin-vs-both-fresh-sources--the-interesting-result). The
  drift accumulates *inside* JPL's own 28-day prediction rather than between our weekly
  refreshes, so the decision is about **how much of that window we ship and how far-out
  predictions are presented in the UI**. Refresh cadence is not a co-equal remedy: going
  daily is worth only ~187 km → ~150 km at +21 d. A decision issue, not a prescribed fix.

Explicitly **not** filed:

- Adopting rust-ephem, focalplane, coast-sim or any `cfl-foundations` crate as a dependency —
  ruled out above on WASM, packaging and licensing grounds.
- Blackbody-derived star colour (focalplane's Ballesteros formula) — a real option, but an
  aesthetic change to a deliberately stylised renderer; documented above rather than filed.

---

## Appendix: reproduction

The comparison scripts were written as throwaway analysis tooling and are not committed;
they are short enough to reconstruct from this description, and the pinned inputs are the
part that matters.

**Environment**

```bash
uv venv --python 3.12 rvenv
uv pip install --python rvenv/bin/python rust-ephem astropy   # rust_ephem 0.12.0 wheel
curl "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE" > iss.tle
```

ISS TLE used throughout (epoch 2026-07-29 02:53:37 UTC):

```
1 25544U 98067A   26210.12010945  .00008919  00000+0  16839-3 0  9999
2 25544  51.6320  92.5793 0007055 349.1886  10.8949 15.49239716578255
```

**Horizons queries** used exactly the parameter set from
`scripts/generate_satellite_ephemeris.py` (`COMMAND=-125544`, `CENTER=500@399`,
`REF_PLANE=FRAME`, `VEC_TABLE=2`, `VEC_CORR=NONE`, `OUT_UNITS=KM-S`, `CSV_FORMAT=YES`).
Two gotchas cost time and are worth recording:

- Horizons rejects `START_TIME=2026-07-29 12:00` unless the value is **single-quoted**
  (`START_TIME='2026-07-29 12:00'`); our generator sidesteps this by passing date-only values.
- Vector-table times are **TDB**, while rust-ephem takes UTC datetimes. The comparison
  converts with `astropy.time.Time(jd, format="jd", scale="tdb").utc` before propagating;
  skipping this step produces a spurious ~69 s (≈530 km) along-track offset.

**Comparison method** — for each window, take Horizons' JDTDB grid, convert the first sample
to UTC, run `rust_ephem.TLEEphemeris(tle1, tle2, begin, end, step_size=60)`, read
`gcrs_pv.position` / `.velocity`, verify time-tag alignment (< 0.05 ms observed), then
report `|Δr|`, the along-track projection onto the velocity unit vector, the perpendicular
residual, and the geocentric angular separation.

**Shipped-file comparison** — read `apps/web/public/data/iss_ephemeris.bin` directly
(`<I` count header, then `<f8` quadruples), match samples to Horizons by JDTDB (exact,
both on minute grids), and difference.

**Eclipse comparison** — both shadow models re-implemented in NumPy from the Rust sources
(`is_in_earth_shadow` and `EclipseEvaluator::shadow_geometry`), evaluated on the same
rust-ephem trajectory (48 h at 5 s; quantisation ±5 s, an order of magnitude below the
~60 s effect being measured). Geocentric Sun position obtained as
`gcrs_pv.position + sun_pv.position` (rust-ephem's `sun_pv` is spacecraft-relative;
sanity-checked at |r_sun| ≈ 1.52 × 10⁸ km).

**WASM checks**

```bash
git clone https://github.com/CosmicFrontierLabs/rust-ephem
cargo build --target wasm32-unknown-unknown          # fails: getrandom 0.2
# with getrandom/js forced:                          # fails: ring, openssl-sys build scripts
cargo build --no-default-features --target wasm32-unknown-unknown   # still fails: ring

# control: the pure-Rust pieces rust-ephem builds on
cargo new --lib sgp4wasm && cd sgp4wasm
cargo add sgp4@2.4 erfa@0.2
cargo build --target wasm32-unknown-unknown          # succeeds
```
