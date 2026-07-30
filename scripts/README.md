# `scripts/`

Data-pipeline and engine-support tooling. None of it is part of the web app's
build — nothing here is imported by `apps/web` or the Rust crates at build time.

The scripts in this directory have **very different lifecycles**: some run on a
CI cron, some are run by hand only when new videos are published, and some are
frozen one-time bootstrap tooling kept only so the catalog could be rebuilt from
scratch. The narrative explanation of those four lifecycle buckets lives in the
top-level [`README.md` → Project Structure](../README.md#project-structure) and
is the single source of truth for *why* each bucket exists — this file is only
the flat per-script reference (what each script does, what invokes it, what it
reads and writes), grouped in the same bucket order for scannability.

## On-demand catalog pipeline

Run manually when new videos are published on the channel. No schedule, no CI
job — dormant between runs.

| Script | Invoked by | Reads | Writes |
|---|---|---|---|
| [`get_transcripts.sh`](get_transcripts.sh) | manual (needs `yt-dlp`) | `data/videos_clean.json` | `data/subtitles/<videoId>.en.vtt` |
| [`scrape_transcripts.js`](scrape_transcripts.js) | manual (needs Playwright; fallback when `yt-dlp` has no captions) | `data/videos_clean.json` | `data/transcripts_progress.json`, `data/videos_with_transcripts.json` (both untracked scratch output) |
| [`build_catalog.js`](build_catalog.js) | manual | `data/videos_clean.json` | catalog JSON to stdout (merged by hand into `data/catalog.json`) |
| [`generate-videos-json.js`](generate-videos-json.js) | manual | `data/once_around_catalog.json`, `data/final_placements.json` | `apps/web/public/videos.json` (the file the running app loads) |
| [`generate_table.js`](generate_table.js) | manual | `data/catalog.json`, `data/subtitles/*.vtt` | `data/catalog.csv` (human-readable review table) |

Catalog changes themselves are applied by **hand-editing**
`data/catalog.json` / `data/final_placements.json` and then re-running
`generate-videos-json.js` and `generate_table.js`.

## Scheduled data refreshes

The two generators GitHub Actions runs on a cron.

| Script | Invoked by | Reads | Writes |
|---|---|---|---|
| [`generate_satellite_ephemeris.py`](generate_satellite_ephemeris.py) | CI cron — [`refresh-satellite-ephemeris.yml`](../.github/workflows/refresh-satellite-ephemeris.yml), weekly (Mon 06:00 UTC), commits directly | NASA Horizons API | `apps/web/public/data/iss_ephemeris.bin`, `apps/web/public/data/hubble_ephemeris.bin` (explicit `--output`; see note below) |
| [`generate_minor_body_elements.py`](generate_minor_body_elements.py) | CI cron — [`refresh-minor-body-elements.yml`](../.github/workflows/refresh-minor-body-elements.yml), quarterly (1 Jan/Apr/Jul/Oct), **opens a PR** rather than committing | JPL Horizons API, current constants in `crates/sky_engine_core/src/minor_bodies.rs` | rewrites the osculating-element `const` blocks in [`crates/sky_engine_core/src/minor_bodies.rs`](../crates/sky_engine_core/src/minor_bodies.rs) in place |

> **Note on the satellite output path.** `generate_satellite_ephemeris.py`
> defaults to `--output data/<satellite>_ephemeris.bin` (repo root), but the
> workflow always passes an explicit path under `apps/web/public/data/`. Always
> pass `--output` when running it by hand — see the orphaned root-level file
> flagged in [`data/README.md`](../data/README.md).

The quarterly refresh opens a PR because two checked-in fixtures pinned by the
rewritten constants cannot be regenerated on a Linux CI runner — a maintainer
has to re-run `fetch_horizons_reference.py` and regenerate
`crates/sky_engine_core/tests/golden_positions.rs` on macOS/Apple Silicon. The
workflow's PR body spells out the required steps.

## Engine-support tooling

Run by hand when the data or fixtures they feed need to change.

| Script | Invoked by | Reads | Writes |
|---|---|---|---|
| [`preprocess_stars/`](preprocess_stars/) (Rust workspace member: `Cargo.toml` + `src/main.rs`) | manual — `cargo run -p preprocess_stars -- <input.dat> <output_dir>/ --tiered` | `data/stars/bsc5.dat` (and `data/stars/hip_hr_xref.dat` for HR/HIP cross-referencing) | tiered packed binaries in `apps/web/public/data/stars/` (`bsc5-tier1.bin`, `bsc5-tier2.bin`, `bsc5-tier3.bin`, `constellation-stars.bin`) |
| [`fetch_horizons_reference.py`](fetch_horizons_reference.py) | manual (a maintainer re-runs it per quarterly refresh PR) | JPL Horizons API | `crates/sky_engine_core/tests/data/horizons_reference.csv`, the checked-in fixture that keeps [`crates/sky_engine_core/tests/horizons_accuracy.rs`](../crates/sky_engine_core/tests/horizons_accuracy.rs) offline |
| [`test_generate_minor_body_elements.py`](test_generate_minor_body_elements.py) | CI — `python-test` job in [`ci.yml`](../.github/workflows/ci.yml), every PR; also manual via `python3 scripts/test_generate_minor_body_elements.py` | nothing (network-free unit test of `generate_minor_body_elements.py`'s back-propagation math) | test results only |

## One-time catalog-bootstrap chain

Frozen. Superseded for incremental updates by the on-demand path above; kept
only so the catalog could be rebuilt from scratch. Each script carries a header
comment saying the same thing.

| Script | Invoked by | Reads | Writes |
|---|---|---|---|
| [`create_placement_data.js`](create_placement_data.js) | manual — frozen, stage 1 of 2 | `data/catalog.json` | `data/video_placements.csv` (untracked inspection export) + placement JSON to stdout, historically redirected to `data/video_placements.json` |
| [`create_final_placements.js`](create_final_placements.js) | manual — frozen, stage 2 of 2 | `data/video_placements.json`, `data/ephemeris.json` | `data/final_placements.json`, `data/final_placements.csv` (untracked), viz JSON to stdout |
| [`fetch_ephemeris.js`](fetch_ephemeris.js) | manual — frozen, feeds stage 2 | JPL Horizons API | `data/ephemeris.json` |

## See also

- [`data/README.md`](../data/README.md) — what each file and subdirectory in
  `data/` is, and which script or pipeline stage owns it.
- [`README.md` → Project Structure](../README.md#project-structure) — the
  lifecycle-bucket narrative these tables are grouped by.
