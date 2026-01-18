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

## Satellite System & Orbital Perspective

A multi-phase feature to generalize satellite tracking and eventually allow users to "ride" on space telescopes.

### Phase 1: Generalized Satellite Tracking ✓ COMPLETE

Refactored ISS-specific code into a flexible multi-satellite system.

- ✓ Renamed `iss.rs` to `satellites.rs` with support for N satellites
- ✓ Each satellite: name, ephemeris data, visual properties (color, size, icon)
- ✓ Shared interpolation, shadow calculation, and horizon visibility code
- ✓ Added Hubble Space Telescope (Horizons ID: -48)
- ✓ Single frontend renderer handles all satellites
- ✓ All satellites searchable and visible in topocentric mode
- ✓ LOD system with detail sprites when zoomed in (ISS shows detailed image)
- ✓ Distance displayed in satellite labels (e.g., "ISS (412 km)")
- ✓ Toast notifications when satellite position unavailable (ephemeris out of range)
- ✓ Cache-busting for ephemeris loading to ensure fresh data

### Phase 2: Space Telescope View Modes

Four view modes are now supported:
1. **Geocentric** - Center of Earth, no Earth rendering
2. **Topocentric** - Earth's surface at lat/long with horizon
3. **Hubble** - LEO (~540 km), Earth visible as large sphere below
4. **JWST** - L2 (~1.5M km), Earth/Sun/Moon as distant dots

#### Phase 2a: Hubble View Mode ✓ COMPLETE

Observer rides on Hubble Space Telescope in low Earth orbit.

- ✓ ViewMode extended to include 'hubble'
- ✓ Earth rendered as sphere positioned toward nadir
- ✓ Day/night terminator with city lights
- ✓ Cloud layer with slow drift animation
- ✓ Quaternion-based free navigation
- ✓ Scintillation automatically disabled
- ✓ Earth occlusion of labels/markers

#### Phase 2b: JWST View Mode ✓ COMPLETE

Observer at L2 Lagrange point, ~1.5 million km from Earth.

- ✓ ViewMode extended to include 'jwst'
- ✓ UI button added to view mode toggle
- ✓ Quaternion-based free navigation
- ✓ Scintillation disabled (in space)
- ✓ Earth rendered with LOD system (sprite → disk → textured sphere based on zoom)
- ✓ Earth night side with city lights + atmospheric limb glow
- ✓ Moon with earthshine illumination (bluish tint, dynamic intensity based on Earth's phase)
- ✓ Moon label shows earthshine strength (bright/moderate/dim)
- ✓ Sun avoidance zone overlay (~45° half-angle cone with gradient)
- Deep field images prominently featured (already available via DSO layer toggle)

#### Phase 2c: Orbital Mechanics Visualization (Planned)

Help users understand orbital constraints.

- Sun avoidance zone overlay (~50° for Hubble - can't point near Sun)
- South Atlantic Anomaly (SAA) visualization (radiation zone)
- Show orbital path

**Educational value:** Most planetarium apps show the sky from Earth. These modes let users experience what Hubble and JWST "see" - unique perspectives that build intuition about space-based astronomy.

### Phase 3: Guide Star Lock

Simulate how real space telescopes maintain precise pointing.

**The problem:** Space telescopes need arcsecond-level stability. They achieve this by locking Fine Guidance Sensors (FGS) onto "guide stars."

**Implementation:**
- User selects a star in the field of view to use as guide star
- Camera locks onto that star, tracking it as the satellite orbits
- FGS crosshair overlay shows the lock
- Field of view drifts naturally if no guide star selected
- Info panel explains: "Guide star: HD 12345 (mag 8.2) - FGS locked"

**Educational value:** Explains a key aspect of how Hubble, JWST, and other space telescopes actually work. Users experience why guide stars matter.

### Future Extensions

- **Historical missions** - Ride on Voyager, see what it saw at Jupiter flyby

---

## Medium Priority

### Meteor Showers ✓ COMPLETE

Display meteor shower radiants during active periods.

- ✓ 12 major annual showers with radiant positions, date ranges, ZHR, parent body
- ✓ Starburst radiant markers on sky (brighter during peak)
- ✓ Labels show shower name with star indicator at peak
- ✓ Radiants drift-corrected based on current date
- ✓ Searchable by name (e.g., "Perseids", "Geminids")
- ✓ Toggle via checkbox or keyboard shortcut (M)

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

**Current state:** DSO/deep field rendering complete with 28 deep field images.

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

---

## Technical Debt

Items to address for long-term maintainability:

- **Satellite ephemeris date range** - Current tabulated data covers ~30 days. Need strategy for keeping current (cron regeneration) or switch to TLE/SGP4 propagation. ✓ Toast message now shown when date is out of range.
- **Test coverage** - Astronomy calculations should have regression tests against known positions (JPL Horizons, etc.)

---

## Not Planned

- **User accounts / cloud sync** — unnecessary complexity
- **Atmospheric refraction simulation** — academic rather than practical
- **Full satellite catalog** — scope creep, dedicated apps exist
