## Project

An interactive night-sky visualizer: TypeScript/Three.js frontend (`apps/web`) over a Rust/WASM astronomy engine (`crates/sky_engine_core`, bindings in `crates/sky_engine`). See [README.md](README.md) and [docs/COMPLETED_FEATURES.md](docs/COMPLETED_FEATURES.md).

## Commands

```bash
pnpm build:wasm                 # build the WASM module (required before dev/build; test:unit is wasm-free by design)
pnpm typecheck                  # web type-check
pnpm test:unit                  # web unit tests (vitest)
pnpm build                      # production build
cargo test -p sky_engine_core   # Rust engine suites (unit + golden + Horizons accuracy)
```

## Gotchas

- **Web unit tests must stay WASM-free.** The CI geometry job never builds WASM; a test that transitively imports `apps/web/src/engine.ts` fails CI with "Cannot find module './wasm/sky_engine'" even if it passes locally against a stale build. Put shared constants in WASM-free modules (see `apps/web/src/satellites-config.ts`).
- **`crates/sky_engine_core/tests/golden_positions.rs` is bit-exact per platform** (macOS/Apple Silicon values differ 1–2 ULP from Linux libm), so it is excluded from the CI Rust job and must be regenerated locally when engine positions legitimately change — follow the regeneration procedure documented in that file. Do not add tolerances to it.
- **Merging PRs**: use `./.loom/scripts/merge-pr.sh <PR>` (never `gh pr merge`). GitHub auto-merge is disabled on this repo, so plain `merge-pr.sh <PR>` after CI is green — `--auto` fails.
- **Render-on-demand**: the renderer skips frames when nothing changed. New per-frame code must not allocate or force continuous re-renders; follow existing patterns in `apps/web/src/animation-loop.ts` and `renderer/layers/earth.ts`.
- **Satellite ephemeris** auto-refreshes weekly via `.github/workflows/refresh-satellite-ephemeris.yml`; Horizons only carries the ISS predicted trajectory ~30 days out and the generation script clamps to it.

<!-- BEGIN REPO-SKILLS -->
This repository has [Repo Skills](https://github.com/rjwalters/repo) v0.4.3 installed —
general repository hygiene and environment commands invoked as `/repo:<command>`. Run
`/repo:help` for the command list, or see `.claude/skills/repo/SKILL.md` for the full
guide. Hygiene commands apply safe, reversible fixes by default and report each
change; run with `--ask` to review first, and `--prune` to allow irreversible
removals. Managed by `install.sh` — edit outside the markers only.
<!-- END REPO-SKILLS -->

<!-- BEGIN LOOM ORCHESTRATION -->
This repository uses [Loom](https://github.com/rjwalters/loom) for AI-powered development orchestration — see the Loom repository for the full guide (roles, labels, worktrees, configuration). When installed, Loom also writes a locally-substituted copy of that guide to `.loom/CLAUDE.md`.
<!-- END LOOM ORCHESTRATION -->