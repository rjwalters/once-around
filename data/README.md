# `data/`

Source catalogs and pipeline artifacts for the tooling in
[`scripts/`](../scripts/README.md). **The running web app never fetches
anything from this directory** — it loads only files under
`apps/web/public/`. `data/` is the input side (and, for a few files, the
review-artifact side) of the offline pipelines; see
[`README.md` → Project Structure](../README.md#project-structure) for the
lifecycle narrative and [`scripts/README.md`](../scripts/README.md) for the
per-script invoke/reads/writes table.

## Classification

Every entry is one of:

- **hand-maintained source** — edited by a human; authoritative input.
- **bootstrap intermediate (frozen)** — produced by the one-time
  catalog-bootstrap chain; not touched by the routine pipeline.
- **generated-and-tracked** — machine-produced but checked in, either as a
  review artifact or because regenerating it is expensive.
- **unreferenced — likely orphan** — checked in, but no script, workflow, test,
  or app code reads it; flagged here rather than deleted (see the notes below).

| Entry | Classification | Owned by | Consumed by |
|---|---|---|---|
| [`catalog.json`](catalog.json) | hand-maintained source | edited by hand (on-demand catalog pipeline) | `scripts/generate_table.js`; historically `scripts/create_placement_data.js` (stage 1) |
| [`once_around_catalog.json`](once_around_catalog.json) | hand-maintained source | edited by hand (present since the initial commit) | `scripts/generate-videos-json.js` |
| [`videos_clean.json`](videos_clean.json) | hand-maintained source | edited by hand (channel video list) | `scripts/get_transcripts.sh`, `scripts/scrape_transcripts.js`, `scripts/build_catalog.js` |
| [`final_placements.json`](final_placements.json) | bootstrap intermediate, now hand-updated | originally stage 2 (`scripts/create_final_placements.js`); today hand-edited as part of the on-demand pipeline | `scripts/generate-videos-json.js` |
| [`video_placements.json`](video_placements.json) | bootstrap intermediate (frozen) | stage 1 — `scripts/create_placement_data.js` | stage 2 — `scripts/create_final_placements.js` only |
| [`ephemeris.json`](ephemeris.json) | bootstrap intermediate (frozen) | `scripts/fetch_ephemeris.js` | stage 2 — `scripts/create_final_placements.js` only |
| [`catalog.csv`](catalog.csv) | generated-and-tracked (review artifact) | `scripts/generate_table.js` | nothing — human reading only |
| `subtitles/` (277 × `<videoId>.en.vtt`) | generated-and-tracked | `scripts/get_transcripts.sh` (via `yt-dlp`) | `scripts/generate_table.js`, when building `catalog.csv` |
| `stars/bsc5.dat` | hand-maintained source (raw third-party catalog) | downloaded once from Harvard TDC (see the header comment in `scripts/preprocess_stars/src/main.rs`) | `scripts/preprocess_stars` — the only input file it opens |
| `stars/bsc5.bin` | generated-and-tracked | `scripts/preprocess_stars` in its default (no-flag) single-file mode | nothing — superseded by the tiered binaries under `apps/web/public/data/stars/` |
| `stars/hip_hr_xref.dat` | **unreferenced — likely orphan**, see below | nothing | nothing |
| `hubble_ephemeris.bin` | **unreferenced — likely orphan**, see below | nothing | nothing |

### Two distinct catalog files

`catalog.json` and `once_around_catalog.json` are **not** duplicates or a typo —
they are separate hand-maintained files with different consumers.
`catalog.json` drives the review table (`generate_table.js` → `catalog.csv`) and
the frozen stage-1 bootstrap script; `once_around_catalog.json` is the one that,
together with `final_placements.json`, feeds `generate-videos-json.js` to
produce `apps/web/public/videos.json` — the file the running app actually
loads. Editing one does not affect the other.

### `stars/` feeds the app only indirectly

Nothing under `data/stars/` is served to the browser (the directory also holds a
`.gitkeep`). `scripts/preprocess_stars` reads `bsc5.dat` — and only `bsc5.dat`;
it opens no second input file — and writes the packed binaries under
`apps/web/public/data/stars/`, and *those* are what `apps/web/index.html`
preloads and `apps/web/src/engine.ts` fetches at runtime.

Those four served binaries come from **two separate runs** of the same tool:

- a `--tiered` run, which writes exactly three files into an output *directory*
  (`bsc5-tier1.bin`, `bsc5-tier2.bin`, `bsc5-tier3.bin`, split by magnitude);
- a `--hr-list` run, which writes only `constellation-stars.bin`, filtered to
  the HR ids given on the command line.

`bsc5.bin` in this directory is neither of those: it is the output of the
default no-flag mode (every parsed star in one file), an older conversion kept
alongside the raw `.dat` and no longer consumed by anything. See
[`scripts/README.md`](../scripts/README.md) for the exact invocations.

### `stars/hip_hr_xref.dat` appears orphaned

**Nothing references `data/stars/hip_hr_xref.dat`** — not
`scripts/preprocess_stars` (which takes one input path and never opens a second
file), not the web app, not the Rust crates. It arrived in commit `c021153`
("Fix constellation rendering by using BSC catalog with HR numbers"), the same
commit that deleted `apps/web/public/data/stars/hipparcos.bin` and moved
constellation rendering onto BSC HR numbers. Once the Hipparcos path was
abandoned, the HR↔HIP cross-reference it had been added to support had no
remaining consumer.

As with `hubble_ephemeris.bin` below, this file is flagged here rather than
deleted, because this README was added as a docs-only change. Removing it is a
reasonable follow-up in its own PR.

### `hubble_ephemeris.bin` appears orphaned

**Nothing references `data/hubble_ephemeris.bin`.** The live app reads
`apps/web/public/data/hubble_ephemeris.bin` instead — `apps/web/src/satellites-config.ts:31`
declares `ephemerisUrl: "/data/hubble_ephemeris.bin"`, and that URL resolves
against `apps/web/public/`, not the repo root. The weekly refresh workflow
([`refresh-satellite-ephemeris.yml`](../.github/workflows/refresh-satellite-ephemeris.yml))
likewise writes and commits only the `apps/web/public/data/` copies.

The likely origin is that `scripts/generate_satellite_ephemeris.py` **defaults**
to `--output data/<satellite>_ephemeris.bin` (repo root), so an early by-hand
run without an explicit `--output` left this 1.3 MB file behind before the
app-served copy under `apps/web/public/data/` existed.

This file is documented here rather than deleted — this README was added as a
docs-only change. Removing it (and/or changing the script's default output path)
is a good follow-up, but belongs in its own PR with its own review.

## Files that look like they belong here but don't

Two other ephemeris binaries live outside `data/` and are easy to conflate with
the entry above:

- `apps/web/public/data/iss_ephemeris.bin` — the **live** ISS ephemeris the app
  fetches; refreshed weekly by CI.
- `crates/sky_engine/tests/fixtures/iss_ephemeris_fixture.bin` — a **pinned**
  3-day window used by the `sky_engine` pass-prediction tests, deliberately
  decoupled from the live file so the weekly refresh can't break the tests.
  Regenerate it consciously; see the gotchas in [`CLAUDE.md`](../CLAUDE.md) and
  the doc comment on `ISS_EPHEMERIS_PATH` in `crates/sky_engine/src/lib.rs`.

## Untracked outputs

Some scripts write scratch files into this directory that are not checked in:
`video_placements.csv` and `final_placements.csv` (from the frozen bootstrap
stages), and `transcripts_progress.json` / `videos_with_transcripts.json` (from
`scripts/scrape_transcripts.js`). Seeing them locally after a pipeline run is
expected; they are not part of the tracked inventory above.
