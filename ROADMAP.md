# Roadmap

Feature ideas for future development.

For completed features, see [docs/COMPLETED_FEATURES.md](docs/COMPLETED_FEATURES.md).

---

## High Priority

### PWA Support

Add `manifest.json` and service worker for offline stargazing.

**Why high priority:** Stargazers are outdoors, often without connectivity. This is the single biggest practical improvement for actual use.

- Offline-first architecture with service worker caching
- "Add to home screen" on mobile
- Faster repeat loads
- Full-screen mode without browser chrome

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

### Meteor Showers

Display meteor shower radiants during active periods.

- Show radiant position on sky
- Badge/indicator: "Perseids active - 100/hr at peak"
- Data is just coordinates + date ranges (low complexity)
- Major observing events that drive engagement

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

### ISS Pass Predictions

Predict ISS visibility from observer location.

- Calculate when ISS is above horizon AND illuminated AND sky is dark
- Show pass time, max altitude, direction, brightness
- "Next visible pass" in Tonight's Highlights panel
- Requires refactoring current ephemeris approach or switching to TLE/SGP4

---

## Low Priority

### Tour-Based Nebula Overrides

Extend DSO rendering with tour-based overrides for dynamic effects.

**Current state:** Basic DSO rendering complete with 28 objects.

**Remaining work:**
- Nebula override system similar to star overrides
- Tours can dynamically spawn/scale nebulae (e.g., Betelgeuse remnant grows over time)

**Use cases:**
- Betelgeuse nova tour: Show expanding supernova remnant
- Historical supernovae: Crab Nebula from SN 1054

### Keyboard Shortcut Help

Press `?` to show overlay listing all keyboard shortcuts.

### Video Curation Expansion

Review uncurated videos for mappable objects.
Manual task, not a code feature.

### Historical Sky Events

"On this day in history" feature with notable observations.

- Quick jumps to historical dates:
  - Galileo's Jupiter moons (Jan 7, 1610)
  - Tycho's supernova (Nov 11, 1572)
  - First Moon landing (July 20, 1969)
- Low implementation effort, high educational value

---

## Optional Polish

Features that enhance the experience but are not essential:

- **Atmospheric extinction** - Stars dim near horizon based on airmass
- **Twilight sky color** - Sky background gradient based on sun altitude
- **Track object mode** - Camera follows a star/planet as it rises/sets
- **Satellite tracking** - Starlink, Hubble, other bright satellites (requires TLE/SGP4)

---

## Technical Debt

Items to address for long-term maintainability:

- **ISS ephemeris date range** - Current tabulated data covers limited period. Need strategy for keeping current (cron regeneration) or switch to TLE propagation. Should show message when date is out of range.
- **TypeScript strict mode** - Type mismatches (Vector3 vs plain objects, WASM bindings) being worked around. Should clean up.
- **Test coverage** - Astronomy calculations should have regression tests against known positions (JPL Horizons, etc.)

---

## Not Planned

- **User accounts / cloud sync** — unnecessary complexity
- **Atmospheric refraction simulation** — academic rather than practical
- **Full satellite catalog** — scope creep, dedicated apps exist
