# Roadmap

Feature ideas for future development.

For completed features, see [docs/COMPLETED_FEATURES.md](docs/COMPLETED_FEATURES.md).

---

## High Priority

### More Guided Tours

The tour system is now mature. Ideas for additional tours:

**Great Comets**
- Comet of 1811 (visible for 9 months)
- Comet Ikeya-Seki 1965 (sun-grazing, visible in daylight)

**Historical Eclipses**
- 1919 Eddington Eclipse (proved general relativity)
- 585 BC Eclipse (stopped a battle)

**Space Mission Moments**
- Apollo 8 Earthrise (December 24, 1968)
- Voyager 1 Pale Blue Dot (February 14, 1990)

---

## Medium Priority

### Eclipse Path Integration

Extend the eclipse feature with location-aware path visualization.

- Show eclipse center path on celestial sphere
- "Navigate to path" button → set location to nearest path point
- Calculate local eclipse circumstances (contact times, duration)
- Path distance: "You are X km from the center line"

Upcoming eclipses: Spain 2026, Egypt 2027, Australia 2028.

### Orbital Mechanics Visualization

Help users understand orbital constraints for space telescope view modes.

- Sun avoidance zone overlay (~50° for Hubble)
- South Atlantic Anomaly (SAA) visualization
- Show orbital path

### Guide Star Lock

Simulate how space telescopes maintain precise pointing using guide stars.

- User selects a star as guide star
- Camera locks onto that star, tracking it
- FGS crosshair overlay shows the lock

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

- **Satellite ephemeris date range** - Current data covers ~30 days. Need cron regeneration or TLE/SGP4.
- **Test coverage** - Astronomy calculations should have regression tests against JPL Horizons.

---

## Not Planned

- **User accounts / cloud sync** — unnecessary complexity
- **Atmospheric refraction simulation** — academic rather than practical
- **Full satellite catalog** — scope creep, dedicated apps exist
