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

- **Engine-computed eclipse circumstances** - Local contact times still use the curated chord-factor estimate; a topocentric Sun-Moon minimum search (or full Besselian elements) needs a time-parameterized ephemeris callable from the TS layer (see PR #70).
- **Minor-body element refresh cadence** - Main-belt asteroids drift ~12-15′ by 2030 and NEO elements are invalid across Earth encounters (two-body limits, documented per body in minor_bodies.rs); refreshing elements periodically would keep them tight.

---

## Not Planned

- **User accounts / cloud sync** — unnecessary complexity
- **Atmospheric refraction simulation** — academic rather than practical
- **Full satellite catalog** — scope creep, dedicated apps exist
