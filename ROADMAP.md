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

### ~~Comet Tracking~~ (Done)
Full comet ephemeris system with orbital mechanics for all orbit types:

**Orbital mechanics (Rust/WASM):**
- Elliptical orbit solver (Kepler equation, e < 1)
- Parabolic orbit solver (Barker's equation, e = 1)
- Hyperbolic orbit solver (e > 1)
- Comet magnitude formula: m = H + 5·log₁₀(Δ) + K·log₁₀(r)

**Comets included:**
- 1P/Halley (periodic, 76 years)
- 2P/Encke (shortest period, 3.3 years)
- 67P/Churyumov-Gerasimenko (Rosetta mission target)
- 46P/Wirtanen (2018 close approach)
- C/2020 F3 NEOWISE (spectacular 2020 comet)
- C/2023 A3 Tsuchinshan-ATLAS (2024 comet)
- C/1995 O1 Hale-Bopp (Great Comet of 1997)

**Frontend features:**
- Comet labels with current magnitude
- Clickable info popups (orbital period, perihelion, next return, history)
- Comet tails rendering with anti-solar shader (tails point away from Sun)
- Comets in search index
- Guided tours: NEOWISE 2020, Hale-Bopp 1997, Halley 1986, Halley 2061

### ~~Observer Location & Topocentric Corrections~~ (Partially Done)

Basic observer location selection and topocentric Moon parallax correction.

**Completed:**
- [x] Location selection UI with city search (~100 cities)
- [x] Manual lat/lon input
- [x] "Use my location" geolocation
- [x] Settings persistence and URL params
- [x] GMST computation in Rust engine
- [x] Topocentric Moon parallax correction (~1° shift)
- [x] Ground plane rendering (toggleable)

**Remaining (see View Mode System below):**
- [ ] Alt/Az coordinate display
- [ ] Cardinal direction markers on horizon
- [ ] Eclipse path integration

---

### View Mode System: Geocentric vs Topocentric (Major Feature)

Two distinct viewing perspectives with fundamentally different navigation models.

#### Conceptual Model

**Geocentric Mode** (current default):
- Observer conceptually at Earth's center
- Celestial sphere is the fixed reference frame
- RA/Dec coordinates are primary
- No horizon (meaningless from Earth's center)
- Observer location controls hidden
- Time changes move Sun/Moon/planets; stars stay fixed
- Use case: "Explore the celestial sphere"

**Topocentric Mode** (new):
- Observer standing on Earth's surface
- Local horizon is the fixed reference frame (always horizontal on screen)
- Alt/Az coordinates are primary, RA/Dec secondary
- Horizon visible with ground plane
- Observer location controls visible and affect the view
- Time changes rotate the entire sky around the celestial pole
- Use case: "What's in my sky tonight?"

#### Key Differences

| Aspect | Geocentric | Topocentric |
|--------|------------|-------------|
| Reference frame | Celestial sphere | Local horizon |
| Primary coords | RA / Dec | Altitude / Azimuth |
| Camera "up" | Toward celestial north | Toward local zenith |
| Navigation | Pan around sphere | Azimuth + Altitude |
| Horizon | Not shown | Always horizontal |
| Location panel | Hidden | Visible |
| Time scrub effect | Bodies move, stars fixed | Entire sky rotates |
| Moon position | Geocentric | Parallax-corrected |

#### Phase 1: Mode Infrastructure & UI Reorganization

**Settings:**
```typescript
interface Settings {
  viewMode: 'geocentric' | 'topocentric';
  // ... existing fields
}
```

**UI Changes:**
- Add prominent mode toggle at top of controls
- Reorganize location panel:
  - Move "Show horizon" toggle into location section
  - Only show location section in topocentric mode
  - Add LST display in topocentric mode

```
┌─────────────────────────────────────────────┐
│ View Mode                                   │
│ [🌐 Geocentric] [🧭 Topocentric]            │
└─────────────────────────────────────────────┘

When Topocentric selected:
┌─────────────────────────────────────────────┐
│ 📍 Observer Location                        │
│ San Francisco, USA                          │
│ 37.77°N, 122.42°W                           │
│ [Search cities...] [📍 Use location]        │
│                                             │
│ ☑ Show horizon                              │
│ ☐ Cardinal directions (N/E/S/W)             │
│                                             │
│ Local Sidereal Time: 14h 23m                │
└─────────────────────────────────────────────┘
```

#### Phase 2: Scene Transformation

In topocentric mode, transform the scene so the horizon is horizontal.

**Key insight:** Keep stars in equatorial coordinates, apply a transformation matrix.

```typescript
// Scene transformation for topocentric mode:
// 1. Rotate by -LST around Y (celestial pole) to align local meridian
// 2. Rotate by (90° - latitude) around X to tilt pole to correct altitude

function computeTopocentricTransform(
  latitude: number,           // radians
  localSiderealTime: number   // radians
): THREE.Matrix4 {
  // After transformation:
  // - Horizon plane is at Y = 0
  // - Zenith is +Y
  // - North is +Z (or -Z)
  // - East is +X

  const coLatitude = Math.PI / 2 - latitude;

  const rotLST = new THREE.Matrix4().makeRotationY(-localSiderealTime);
  const rotLat = new THREE.Matrix4().makeRotationX(coLatitude);

  return rotLat.multiply(rotLST);
}
```

**Celestial pole position:**
- North celestial pole appears at: Azimuth = 0° (north), Altitude = observer latitude
- At latitude 40°N, Polaris is 40° above northern horizon
- At equator, both poles are on the horizon
- In southern hemisphere, south celestial pole is visible

#### Phase 3: Horizon-Locked Camera Controls

New control mode for topocentric view:

```typescript
interface TopocentricCameraState {
  azimuth: number;    // 0-360°, 0 = North, 90 = East
  altitude: number;   // -90 to +90°, 0 = horizon, 90 = zenith
  fov: number;
}

// Control behavior:
// - Horizontal drag → change azimuth
// - Vertical drag → change altitude
// - Camera "up" vector always points to zenith
// - No roll allowed (horizon always level)
```

**Modify `controls.ts`:**
- Add `setViewMode(mode: 'geocentric' | 'topocentric')`
- In topocentric mode:
  - Track azimuth/altitude instead of quaternion
  - Constrain camera orientation to horizon-level
  - Convert to/from equatorial for compatibility

**Edge cases:**
- Zenith (alt = 90°): Azimuth is undefined, any value works
- Nadir (alt = -90°): Blocked by ground plane
- Wrap azimuth at 0°/360° boundary

#### Phase 4: Coordinate Display

**Geocentric mode:**
```
RA 12h 34m  Dec +45° 30'  FOV 60°
```

**Topocentric mode:**
```
Az 135° (SE)  Alt 45°  FOV 60°
RA 12h 34m  Dec +45° 30'
```

**New UI elements for topocentric:**
- Local Sidereal Time display
- Compass direction abbreviation (N, NE, E, SE, S, SW, W, NW)
- Sun altitude indicator (day/twilight/night)

#### Phase 5: Time Animation Behavior

**Geocentric (current):**
- Stars stay fixed in view
- Sun/Moon/planets move along their paths
- Camera position unchanged

**Topocentric (new):**
- Camera stays fixed relative to ground (azimuth/altitude constant)
- Entire sky rotates around celestial pole at 15°/hour
- Stars rise in east, transit meridian, set in west
- Dramatic visual effect when scrubbing time

**Implementation:**
- Time change updates LST
- LST change updates scene transformation
- Camera azimuth/altitude stay constant
- Visual effect: stars appear to drift westward

**Optional enhancement:** "Track object" mode
- Lock camera to a specific star/planet
- As time changes, camera follows the object
- Useful for watching a star rise/set

#### Phase 6: Feature Integration

**Tours:**
- Tours specify RA/Dec targets (or use `target: 'jupiter'` etc.)
- In topocentric mode, convert RA/Dec to Alt/Az at runtime
- Tours work in both modes without modification

**Search:**
- Search results show both coordinate systems
- In topocentric mode, show "Above horizon" / "Below horizon"
- Future: show rise/set times

**Mode switching:**
- When switching modes, keep the same celestial object centered
- Convert current RA/Dec to Alt/Az (or vice versa)
- Smooth transition if possible

**AR Mode:**
- Works in both modes
- In topocentric mode, device compass could provide true azimuth
- Enhanced "point your phone at the sky" experience

#### Phase 7: Polish

**Cardinal direction markers:**
- N/E/S/W labels on horizon
- Optional compass rose at nadir
- Intermediate directions (NE, SE, SW, NW)

**Atmospheric effects (optional):**
- Stars dim near horizon (airmass extinction)
- ~0.5 magnitude dimmer at 10° altitude
- Atmospheric refraction (~0.5° at horizon)

**Twilight indication (optional):**
- Sky background color based on sun altitude
- Civil/nautical/astronomical twilight zones

#### Data Structures

```typescript
type ViewMode = 'geocentric' | 'topocentric';

interface TopocentricState {
  azimuth: number;           // degrees, 0 = north
  altitude: number;          // degrees, 0 = horizon
  localSiderealTime: number; // degrees (or hours)
}

interface ViewCoordinates {
  // Equatorial (always computed)
  ra: number;
  dec: number;

  // Horizontal (computed in topocentric mode)
  azimuth?: number;
  altitude?: number;
}

// Coordinate conversion
function equatorialToHorizontal(
  ra: number, dec: number,           // degrees
  lst: number,                        // local sidereal time, degrees
  latitude: number                    // observer latitude, degrees
): { azimuth: number; altitude: number };

function horizontalToEquatorial(
  azimuth: number, altitude: number,  // degrees
  lst: number,                        // local sidereal time, degrees
  latitude: number                    // observer latitude, degrees
): { ra: number; dec: number };
```

#### Files to Modify

| File | Changes |
|------|---------|
| `settings.ts` | Add `viewMode` field |
| `controls.ts` | Add topocentric navigation mode (az/alt) |
| `renderer.ts` | Scene transformation matrix for topocentric |
| `main.ts` | Mode toggle logic, coordinate display, LST computation |
| `index.html` | Mode toggle UI, reorganized location panel |
| `ui.ts` | Alt/Az formatting, compass directions |
| `tour.ts` | Convert tour targets based on view mode |

#### Implementation Order

1. **UI reorganization** - Mode toggle, move horizon into location panel
2. **Scene transformation** - Apply rotation matrix in topocentric mode
3. **Camera controls** - Horizon-locked navigation (az/alt)
4. **Coordinate display** - Show Alt/Az in topocentric mode
5. **Time behavior** - Sky rotation around pole
6. **Feature integration** - Tours, search, mode switching
7. **Polish** - Cardinal markers, atmospheric effects

#### Verification

1. **Pole altitude:** At latitude 40°N, Polaris should be at altitude ~40°
2. **Cardinal directions:** Az = 0° should face celestial north pole
3. **Horizon level:** Horizon always horizontal regardless of where you look
4. **Time scrub:** Stars move westward at 15°/hour
5. **Mode switch:** Same object stays centered when switching modes
6. **Tours:** Jupiter moons tour works in both modes
7. **Ground plane:** Objects below horizon hidden by ground
8. **Southern hemisphere:** At -40° lat, south celestial pole at alt 40° (south)

#### Edge Cases

- **Zenith view:** At alt = 90°, azimuth is undefined (singularity)
- **Nadir view:** Should be blocked by ground plane
- **Equator:** Both celestial poles on horizon
- **Poles:** Celestial pole at zenith, all stars circumpolar (or never rise)
- **Circumpolar objects:** Never set at high latitudes
- **Date line crossing:** LST computation handles longitude correctly

---

### Legacy: Original Observer Location Plan

<details>
<summary>Original detailed plan (kept for reference)</summary>

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

</details>

---

### ~~UI Framework: Tailwind CSS + shadcn/ui~~ (Done)

Refactored from vanilla CSS to Tailwind CSS v4 with modern utility-first styling.

#### Completed
- **Tailwind CSS v4** installed with `@tailwindcss/postcss`
- **PostCSS pipeline** configured (`postcss.config.js`)
- **External stylesheet** (`src/styles.css`) with:
  - Tailwind imports and custom `@theme` configuration
  - shadcn/ui compatible CSS variables (HSL colors in `:root`)
  - All migrated styles from inline CSS (~1900 lines)
  - shadcn-inspired component classes (buttons, inputs, modals)
- **Utility function** (`src/lib/utils.ts`) with `cn()` helper
- **index.html** cleaned (60KB → 17KB, inline CSS removed)
- **Build output**: CSS bundle 47KB (8KB gzip)

#### Files Added/Modified
| File | Changes |
|------|---------|
| `package.json` | Added tailwindcss, @tailwindcss/postcss, autoprefixer, class-variance-authority, clsx, tailwind-merge, lucide-react, @radix-ui/react-slot |
| `postcss.config.js` | New - PostCSS configuration |
| `src/styles.css` | New - All styles (2183 lines) |
| `src/lib/utils.ts` | New - `cn()` utility function |
| `src/main.ts` | Added CSS import |
| `index.html` | Removed inline CSS |

#### Future Enhancements (Optional)
- Add more Tailwind utility classes directly to HTML elements
- Consider React migration for full shadcn/ui component usage
- Add dark/light mode toggle (currently always dark)

## Low Priority

### Nebula Rendering & Overrides
Render nebulae as textured sprites or procedural effects, with support for tour-based overrides.

**Use cases:**
- Betelgeuse nova tour: Show expanding supernova remnant in later keyframes
- Famous nebulae: Orion Nebula (M42), Horsehead Nebula, Crab Nebula (M1), Ring Nebula (M57)
- Historical supernovae: Crab Nebula from SN 1054, Tycho's SNR, Kepler's SNR

**Implementation approach:**
- Nebula override system similar to star overrides
- Each nebula: position (RA/Dec), angular size, texture/color, opacity
- Tours can dynamically spawn/scale nebulae (e.g., Betelgeuse remnant grows over time)
- Consider: Billboard sprites vs procedural shaders vs pre-rendered images

**Potential nebulae to include:**
- Emission: Orion (M42), Lagoon (M8), Eagle (M16), Carina
- Reflection: Witch Head, IC 2118
- Planetary: Ring (M57), Helix, Cat's Eye, Dumbbell (M27)
- Supernova remnants: Crab (M1), Veil, Cassiopeia A

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
- [x] Comet tracking: Halley, Encke, 67P/C-G, Wirtanen, NEOWISE, Tsuchinshan-ATLAS, Hale-Bopp
- [x] Comet tail rendering with anti-solar orientation
- [x] Comet guided tours (NEOWISE 2020, Hale-Bopp 1997, Halley 1986, Halley 2061)

## Not Planned

- Extended object catalogs (Messier, NGC) — videos are the content
- User accounts / cloud sync — unnecessary complexity
- Atmospheric simulation — academic rather than practical
