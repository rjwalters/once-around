# Roadmap

Feature ideas for future development.

For completed features, see [docs/COMPLETED_FEATURES.md](docs/COMPLETED_FEATURES.md).

---

## High Priority

### Rise/Set Times

Show when objects rise, transit, and set for the current location.

**Why high priority:** Answers the fundamental question "when can I see X tonight?"

- Sun rise/set and twilight times (civil, nautical, astronomical)
- Moon rise/set and transit
- Planet visibility windows
- Compute from observer location + date

### Tonight's Highlights Panel

Surface actionable observing info in topocentric mode.

```
┌─────────────────────────────────┐
│ Tonight's Sky                   │
├─────────────────────────────────┤
│ Moon: Waxing Gibbous (68%)     │
│    Sets 2:34 AM                 │
│                                 │
│ Planets visible:                │
│ • Jupiter - South, 45° alt     │
│ • Saturn - SW, setting 11pm    │
│                                 │
│ ISS Pass: 8:47 PM (bright!)    │
│ • Max alt: 78° • Duration: 6m  │
└─────────────────────────────────┘
```

Requires rise/set calculation as prerequisite.

---

## Medium Priority

### Eclipse Path Integration

Extend the eclipse feature with location-aware path visualization.

- Show eclipse center path on celestial sphere
- "Navigate to path" button → set location to nearest path point
- Calculate local eclipse circumstances:
  - Contact times (C1, C2, C3, C4)
  - Maximum eclipse time and duration of totality
  - Sun altitude at maximum
- Path distance: "You are X km from the center line"

Upcoming eclipses: Spain 2026, Egypt 2027, Australia 2028.

### Orbital Mechanics Visualization

Help users understand orbital constraints for space telescope view modes.

- Sun avoidance zone overlay (~50° for Hubble - can't point near Sun)
- South Atlantic Anomaly (SAA) visualization (radiation zone)
- Show orbital path

### Guide Star Lock

Simulate how real space telescopes maintain precise pointing.

**The problem:** Space telescopes need arcsecond-level stability. They achieve this by locking Fine Guidance Sensors (FGS) onto "guide stars."

**Implementation:**
- User selects a star in the field of view to use as guide star
- Camera locks onto that star, tracking it as the satellite orbits
- FGS crosshair overlay shows the lock
- Field of view drifts naturally if no guide star selected
- Info panel explains: "Guide star: HD 12345 (mag 8.2) - FGS locked"

**Educational value:** Explains a key aspect of how Hubble, JWST, and other space telescopes actually work.

---

## Low Priority

### Tour-Based Nebula Overrides

Extend DSO rendering with tour-based overrides for dynamic effects.

- Nebula override system similar to star overrides
- Tours can dynamically spawn/scale nebulae (e.g., Betelgeuse remnant grows over time)

**Use cases:**
- Betelgeuse nova tour: Show expanding supernova remnant
- Historical supernovae: Crab Nebula from SN 1054

### Keyboard Shortcut Help

Press `?` to show overlay listing all keyboard shortcuts.

### Historical Sky Events

"On this day in history" feature with notable observations.

- Quick jumps to historical dates:
  - Galileo's Jupiter moons (Jan 7, 1610)
  - Tycho's supernova (Nov 11, 1572)
  - First Moon landing (July 20, 1969)
- Low implementation effort, high educational value

### Historical Missions

Ride on Voyager, see what it saw at Jupiter flyby.

---

## Optional Polish

Features that enhance the experience but are not essential:

- **Atmospheric extinction** - Stars dim near horizon based on airmass
- **Twilight sky color** - Sky background gradient based on sun altitude
- **Track object mode** - Camera follows a star/planet as it rises/sets

---

## Technical Debt

Items to address for long-term maintainability:

- **Satellite ephemeris date range** - Current tabulated data covers ~30 days. Need strategy for keeping current (cron regeneration) or switch to TLE/SGP4 propagation.
- **Test coverage** - Astronomy calculations should have regression tests against known positions (JPL Horizons, etc.)

---

## Not Planned

- **User accounts / cloud sync** — unnecessary complexity
- **Atmospheric refraction simulation** — academic rather than practical
- **Full satellite catalog** — scope creep, dedicated apps exist
