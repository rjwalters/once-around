# Roadmap

Feature ideas for future development.

## High Priority

### ~~Scene Replay / Tours~~ (Done)
Planetarium-style guided tours with keyframe animation.
Predefined tours: "2024 Eclipse", "Jupiter's Moons".

### ~~Mobile / Touch Improvements~~ (Done)
Better experience on phones and tablets:
- Touch-friendly controls (pinch zoom, drag to pan)
- Responsive UI that adapts to small screens
- AR "Magic Window" mode (device orientation controls camera)
- Collapsible control panel on mobile

## Medium Priority

### Comet Tracking
Add orbital elements for periodic comets:
- Halley, Encke, Tempel 1 (periodic)
- Near-parabolic comets (C/2023 A3 Tsuchinshan-ATLAS, etc.)

Requires: parabolic/hyperbolic orbit solver (e ≥ 1)

### Observer Location & Topocentric View (Major Feature)

Transform from geocentric (Earth-center) view to topocentric (Earth-surface) view.
Critical for accurate eclipse visualization - the Moon's parallax (~1°) determines
whether you see totality or a partial eclipse from a given location.

#### Phase 1: Location Selection Core
**New file:** `apps/web/src/location.ts`

- Manual latitude/longitude input (-90 to +90, -180 to +180)
- City search with autocomplete (fuzzy matching like existing search)
- "Use my location" button (Geolocation API)
- Store in settings, sync to URL params (?lat=&lon=)

**City database (~200 entries):**
- World capitals and major cities
- Major observatories (Mauna Kea, Paranal, etc.)
- Eclipse path cities (for upcoming eclipses)
- Format: `{ name, country, lat, lon, timezone }`

#### Phase 2: Sidereal Time & Hour Angle
**Modify:** `sky_engine_core` (Rust/WASM)

- Compute Greenwich Mean Sidereal Time (GMST) from Julian Date
- Expose GMST to JavaScript
- Compute Local Sidereal Time: `LST = GMST + longitude`
- Compute Hour Angle: `H = LST - RA`

**Formula (IAU 2006):**
```
GMST = 280.46061837 + 360.98564736629 * (JD - 2451545.0)
     + 0.000387933 * T² - T³/38710000
```

#### Phase 3: Topocentric Moon Correction
**Modify:** `sky_engine_core` moon ephemeris

Apply parallax correction to Moon position:
```
π = Moon's horizontal parallax ≈ 0.95° (varies with distance)
Δα = -π × cos(φ') × sin(H) / cos(δ)
Δδ = -π × (sin(φ')cos(δ) - cos(φ')cos(H)sin(δ))
```

Where:
- φ' = observer's geocentric latitude
- H = hour angle
- δ = declination
- π = asin(Earth_radius / Moon_distance)

This shifts Moon position by up to 1° based on observer location.
Sun parallax is tiny (~8.8") but could add for completeness.

#### Phase 4: Alt/Az Coordinate Display
**Modify:** `apps/web/src/main.ts`, coordinate display

Show altitude and azimuth alongside RA/Dec:
```
sin(alt) = sin(δ)sin(φ) + cos(δ)cos(φ)cos(H)
cos(az) = (sin(δ) - sin(φ)sin(alt)) / (cos(φ)cos(alt))
sin(az) = -cos(δ)sin(H) / cos(alt)
```

- Altitude: degrees above horizon (-90 to +90)
- Azimuth: compass bearing (0° = North, 90° = East)
- Display: "Alt +45° Az 270° (W)"

#### Phase 5: Horizon Rendering
**Modify:** `apps/web/src/renderer.ts`

Add toggleable horizon visualization:
- **Horizon ring:** Great circle at alt=0°, updates with LST
- **Cardinal markers:** N/S/E/W labels on horizon
- **Ground plane:** Optional dark disc below horizon
- **Horizon fade:** Objects below horizon rendered at reduced opacity

Implementation approach:
- Keep celestial sphere rendering unchanged
- Add horizon as overlay that rotates with sidereal time
- Horizon ring position: Dec = 0 rotated by latitude around E-W axis

**Rendering math:**
```
// Horizon is 90° from local zenith
// Zenith: Dec = latitude, RA = LST
// Rotate horizon ring based on observer latitude
horizonTilt = latitude  // Angle from celestial equator
horizonRotation = LST   // Rotation around polar axis
```

#### Phase 6: Eclipse Path Integration
**Extend:** Eclipse feature

- Show eclipse center path on celestial sphere (as a line)
- "Navigate to path" button → set location to nearest path point
- Calculate local eclipse circumstances:
  - Contact times (C1, C2, C3, C4)
  - Maximum eclipse time
  - Duration of totality (if applicable)
  - Sun altitude at maximum

**UI Enhancement:**
- Eclipse banner shows "Totality visible: Yes/No" based on location
- Path distance: "You are X km from the center line"

#### Data Structures

```typescript
interface ObserverLocation {
  latitude: number;   // -90 to +90, positive = North
  longitude: number;  // -180 to +180, positive = East
  elevation?: number; // meters above sea level (optional)
  name?: string;      // "San Francisco, CA" or custom
}

interface LocalCoordinates {
  altitude: number;   // degrees above horizon
  azimuth: number;    // degrees from North, clockwise
  hourAngle: number;  // hours from meridian
}

interface City {
  name: string;
  country: string;
  lat: number;
  lon: number;
  timezone: string;   // "America/Los_Angeles"
  population?: number; // for sorting results
}
```

#### UI Components

**Location Panel (in controls):**
```
┌─────────────────────────────────┐
│ 📍 Observer Location            │
│ ┌─────────────────────────────┐ │
│ │ Search cities...            │ │
│ └─────────────────────────────┘ │
│ Lat: [  37.77 ] Lon: [ -122.42] │
│ [📍 Use My Location]            │
│ ☐ Show horizon                  │
│ LST: 14h 23m                    │
└─────────────────────────────────┘
```

**Coordinate Display (bottom right):**
```
RA 12h 34m  Dec +45° 30'  FOV 60°
Alt +67°  Az 180° (S)
```

#### Implementation Order

1. **Location input + settings** - UI only, no coordinate transforms
2. **City search database** - JSON file with ~200 cities
3. **GMST/LST computation** - Add to Rust engine, expose to JS
4. **Alt/Az display** - Show local coordinates (still geocentric Moon)
5. **Moon parallax correction** - The critical eclipse accuracy fix
6. **Horizon rendering** - Visual reference for local sky
7. **Eclipse path integration** - Show path, navigate to location

#### Files to Modify/Create

| File | Changes |
|------|---------|
| `apps/web/src/location.ts` | NEW - Location manager, city search |
| `apps/web/src/cityData.ts` | NEW - City database (~200 entries) |
| `apps/web/src/settings.ts` | Add observer location fields |
| `apps/web/src/main.ts` | Wire location UI, alt/az display |
| `apps/web/index.html` | Location panel UI, horizon toggle |
| `crates/sky_engine_core/src/lib.rs` | Add GMST, LST, parallax functions |
| `crates/sky_engine_core/src/moon.rs` | Topocentric correction |
| `apps/web/src/renderer.ts` | Horizon ring, cardinal markers |
| `apps/web/src/eclipseData.ts` | Add path coordinates, local circumstances |

#### Verification

1. Set location to observatory with known coordinates
2. Compare computed LST with published value
3. Set location on eclipse path → Moon should perfectly occult Sun
4. Set location off path → should see partial eclipse
5. Horizon should show North star at altitude = latitude (Northern hemisphere)
6. Objects should rise in East, set in West
7. Circumpolar objects (Dec > 90° - lat) should never set

## Low Priority

### Keyboard Shortcut Help
Press `?` to show overlay listing all keyboard shortcuts.

### ~~Night Vision Mode~~ (Done)
Red-only color scheme for outdoor observing.
Toggle with checkbox or `R` key.

### PWA Support
Add `manifest.json` and service worker for:
- Offline use while stargazing
- "Add to home screen" on mobile
- Faster repeat loads via caching

### Video Curation Expansion
Review uncurated videos for mappable objects.
Manual task, not a code feature.

## Completed

- [x] Search / Go-to functionality with fuzzy matching and autocomplete
- [x] URL deep linking (ra, dec, fov, t, mag parameters)
- [x] Keyboard shortcuts (L/C/V/O/D/E/N/P, arrows, space, /)
- [x] Nutation corrections (Δψ, Δε) for improved apparent positions
- [x] Annual aberration correction for Sun and Moon (~20 arcseconds)
- [x] Saturn moon orbital plane fix (27° tilt now properly rendered)
- [x] Jupiter moon orbital plane fix (3° tilt)
- [x] Saturn moons: Mimas, Enceladus, Tethys, Dione, Rhea, Titan
- [x] Dwarf planets: Pluto, Ceres, Eris, Makemake, Haumea
- [x] TNOs: Sedna, Quaoar, Gonggong, Orcus, Varuna
- [x] Uranus moons: Miranda, Ariel, Umbriel, Titania, Oberon
- [x] Neptune moon: Triton (retrograde orbit)
- [x] Mars moons: Phobos, Deimos
- [x] Major asteroids: Vesta, Pallas, Hygiea
- [x] Near-Earth objects: Apophis, Bennu

## Not Planned

- Extended object catalogs (Messier, NGC) — videos are the content
- User accounts / cloud sync — unnecessary complexity
- Atmospheric simulation — academic rather than practical
