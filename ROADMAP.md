# Roadmap

Feature ideas for future development.

For completed features, see [docs/COMPLETED_FEATURES.md](docs/COMPLETED_FEATURES.md).

---

## Low Priority

### Rise/Set Times

Show when objects rise, transit, and set for the current location.

- Sun rise/set and twilight times
- Moon rise/set and transit
- Planet visibility windows

### Tonight's Highlights Panel

Surface observing info in topocentric mode (moon phase, visible planets, ISS passes).

### Keyboard Shortcut Help

Press `?` to show overlay listing all keyboard shortcuts.

### Historical Missions

Ride on Voyager, see what it saw at Jupiter flyby.

---

## Optional Polish

- **Atmospheric extinction** - Stars dim near horizon based on airmass
- **Twilight sky color** - Sky background gradient based on sun altitude
- **Track object mode** - Camera follows a star/planet as it rises/sets

---

## Technical Debt

- **Eclipse ground track on globe** - Eclipse paths (2026) shipped with an SVG mini-map; a 3D on-sphere ground track and engine-computed Besselian elements were deferred.
- **Minor-body accuracy** - Most minor bodies use estimated mean anomalies (Ceres is ~18° off Horizons); refine elements or document the limitation.
- **Rust tests in CI** - `cargo test` (golden + Horizons accuracy suites) runs only locally; CI covers just web typecheck + unit tests.

---

## Not Planned

- **User accounts / cloud sync** — unnecessary complexity
- **Atmospheric refraction simulation** — academic rather than practical
- **Full satellite catalog** — scope creep, dedicated apps exist
