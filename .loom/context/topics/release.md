# Release notes for once-around

Project-specific guidance for `/loom:release` (injected automatically at release time).

## Version lockstep — three files

The version lives in **three** manifests that must stay identical:

1. `Cargo.toml` — `[workspace.package].version` (member crates inherit via `version.workspace = true`)
2. `package.json` (repo root)
3. `apps/web/package.json`

The detected `cargo-workspace` fallback only bumps `Cargo.toml`. **After the Cargo bump, also update both `package.json` files to the same version** before committing, and run `cargo update --workspace` so `Cargo.lock` follows. Established at v0.9.0 (2026-07-07).

## Conventions

- Tags are `vX.Y.Z`; release commit message is `chore(release): vX.Y.Z`.
- Create a GitHub Release with the CHANGELOG entry as notes (`gh release create`). There is no `release.yml` build workflow — the tag + Release is the complete artifact.
- GitHub auto-merge is disabled in this repo; the release commit is pushed directly to `main` (sanctioned for releases).
- Deployment is manual and separate from tagging: `pnpm deploy:all` builds (including WASM) and publishes to Cloudflare Pages. If the release includes user-facing changes since the last deploy, deploy after tagging.

At extension point `post-summary`: remind the operator to check whether production (once-around.pages.dev) is running the released code, and to deploy with `pnpm deploy:all` if not.
