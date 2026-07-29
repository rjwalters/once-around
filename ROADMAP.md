# Roadmap

Feature ideas for future development.

For completed features, see [docs/COMPLETED_FEATURES.md](docs/COMPLETED_FEATURES.md).

---

## Low Priority

### Tonight's Highlights Panel

Roll up observing info in topocentric mode into a single summary panel (moon
phase, visible-planet overview). Rise/set times and ISS passes already have
dedicated panels (see docs/COMPLETED_FEATURES.md); the remaining work is the
moon-phase / visible-planets roll-up.

### Historical Missions

Ride on Voyager, see what it saw at Jupiter flyby.

---

## Optional Polish

- **Atmospheric extinction** - Stars dim near horizon based on airmass
- **Twilight sky color** - Sky background gradient based on sun altitude
- **Track object mode** - Camera follows a star/planet as it rises/sets

---

## Technical Debt

- **Engine-computed eclipse circumstances** - Local contact times still use the curated chord-factor estimate; a topocentric Sun-Moon minimum search (or full Besselian elements) needs a time-parameterized ephemeris callable from the TS layer (see PR #70).
- **Minor-body element refresh: human-in-the-loop step** - Refresh machinery landed in #80 (`scripts/generate_minor_body_elements.py` + quarterly `refresh-minor-body-elements.yml`, which opens a PR when elements drift). The remaining debt is that each refresh PR requires a maintainer to regenerate the golden fixtures locally on macOS/Apple Silicon and run the full `cargo test` checklist before merge.

---

## Not Planned

- **User accounts / cloud sync** — unnecessary complexity
- **Atmospheric refraction simulation** — academic rather than practical
- **Full satellite catalog** — scope creep, dedicated apps exist
