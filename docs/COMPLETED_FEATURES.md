# Completed Features

Historical record of implemented features in Once Around the Night Sky.

## Table of Contents

- [Core Features](#core-features)
- [Guided Tours](#guided-tours)
- [Mobile & Touch](#mobile--touch)
- [Comet System](#comet-system)
- [Observer Location & Topocentric Mode](#observer-location--topocentric-mode)
- [View Mode System](#view-mode-system)
- [Deep Sky Objects](#deep-sky-objects)
- [Stellar Scintillation](#stellar-scintillation)
- [UI Framework](#ui-framework)
- [Astronomical Corrections](#astronomical-corrections)
- [Solar System Objects](#solar-system-objects)
- [Satellite Tracking](#satellite-tracking)
- [Meteor Showers](#meteor-showers)

---

## Core Features

- **Search / Go-to** - Fuzzy matching and autocomplete for stars, planets, constellations, DSOs, satellites. Enter key selects first result.
- **URL deep linking** - Share specific views with ra, dec, fov, t, mag parameters
- **Keyboard shortcuts** - L/C/V/O/D/E/N/P, arrows, space, /
- **Night vision mode** - Red-only color scheme for outdoor observing (toggle with R key)

---

## Guided Tours

Planetarium-style guided tours with keyframe animation.

**Features:**
- Smooth camera transitions between keyframes
- Time control during tours
- Star/object overrides for special effects
- Predefined tours: 2024 Eclipse, Jupiter's Moons, comet appearances

**Comet Tours:**
- NEOWISE 2020
- Hale-Bopp 1997
- Halley 1986
- Halley 2061 (future return)

---

## Mobile & Touch

Better experience on phones and tablets:

- Touch-friendly controls (pinch zoom, drag to pan)
- Responsive UI that adapts to small screens
- AR "Magic Window" mode (device orientation controls camera)
- Collapsible control panel on mobile

---

## Comet System

Full comet ephemeris system with orbital mechanics for all orbit types.

### Orbital Mechanics (Rust/WASM)

- Elliptical orbit solver (Kepler equation, e < 1)
- Parabolic orbit solver (Barker's equation, e = 1)
- Hyperbolic orbit solver (e > 1)
- Comet magnitude formula: m = H + 5·log₁₀(Δ) + K·log₁₀(r)

### Comets Included

| Comet | Type | Notes |
|-------|------|-------|
| 1P/Halley | Periodic | 76-year orbit |
| 2P/Encke | Periodic | Shortest period (3.3 years) |
| 67P/Churyumov-Gerasimenko | Periodic | Rosetta mission target |
| 46P/Wirtanen | Periodic | 2018 close approach |
| C/2020 F3 NEOWISE | Long-period | Spectacular 2020 comet |
| C/2023 A3 Tsuchinshan-ATLAS | Long-period | 2024 comet |
| C/1995 O1 Hale-Bopp | Long-period | Great Comet of 1997 |

### Frontend Features

- Comet labels with current magnitude
- Clickable info popups (orbital period, perihelion, next return, history)
- Comet tails rendering with anti-solar shader (tails point away from Sun)
- Comets in search index

---

## Observer Location & Topocentric Mode

### Location Selection

- City search with ~100 cities
- Manual lat/lon input
- "Use my location" geolocation
- Settings persistence and URL params

### Astronomical Computations

- GMST computation (IAU 2006 formula)
- Local Sidereal Time (LST) calculation and display
- Topocentric Moon parallax correction (~1° shift)

### Visual Features

- Ground plane rendering (toggleable)
- Alt/Az coordinate display with compass directions
- Cardinal direction markers on horizon (N/NE/E/SE/S/SW/W/NW)

---

## View Mode System

Two distinct viewing perspectives with fundamentally different navigation models.

### Geocentric Mode

- Observer conceptually at Earth's center
- Celestial sphere is the fixed reference frame
- RA/Dec coordinates are primary
- No horizon (meaningless from Earth's center)
- Time changes move Sun/Moon/planets; stars stay fixed
- Use case: "Explore the celestial sphere"

### Topocentric Mode

- Observer standing on Earth's surface
- Local horizon is the fixed reference frame (always horizontal on screen)
- Alt/Az coordinates are primary, RA/Dec secondary
- Horizon visible with ground plane
- Observer location controls visible and affect the view
- Time changes rotate the entire sky around the celestial pole
- Use case: "What's in my sky tonight?"

### Key Differences

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

### Implementation Details

- View mode toggle with settings persistence
- Horizon-locked camera in topocentric mode (zenith = up)
- Topocentric camera controls (drag for azimuth/altitude)
- Ground plane rotation with LST
- Local Sidereal Time (LST) display in location panel
- Coordinate conversion functions (equatorial ↔ horizontal)

<details>
<summary>Original Design Documentation</summary>

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
- Reorganize location panel
- Add LST display in topocentric mode

#### Phase 2: Scene Transformation

In topocentric mode, transform the scene so the horizon is horizontal.

**Key insight:** Keep stars in equatorial coordinates, apply a transformation matrix.

```typescript
function computeTopocentricTransform(
  latitude: number,           // radians
  localSiderealTime: number   // radians
): THREE.Matrix4 {
  const coLatitude = Math.PI / 2 - latitude;
  const rotLST = new THREE.Matrix4().makeRotationY(-localSiderealTime);
  const rotLat = new THREE.Matrix4().makeRotationX(coLatitude);
  return rotLat.multiply(rotLST);
}
```

#### Phase 3: Horizon-Locked Camera Controls

```typescript
interface TopocentricCameraState {
  azimuth: number;    // 0-360°, 0 = North, 90 = East
  altitude: number;   // -90 to +90°, 0 = horizon, 90 = zenith
  fov: number;
}
```

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

#### Data Structures

```typescript
type ViewMode = 'geocentric' | 'topocentric';

interface TopocentricState {
  azimuth: number;           // degrees, 0 = north
  altitude: number;          // degrees, 0 = horizon
  localSiderealTime: number; // degrees (or hours)
}

interface ViewCoordinates {
  ra: number;
  dec: number;
  azimuth?: number;
  altitude?: number;
}

function equatorialToHorizontal(
  ra: number, dec: number,
  lst: number,
  latitude: number
): { azimuth: number; altitude: number };

function horizontalToEquatorial(
  azimuth: number, altitude: number,
  lst: number,
  latitude: number
): { ra: number; dec: number };
```

#### Files Modified

| File | Changes |
|------|---------|
| `settings.ts` | Add `viewMode` field |
| `controls.ts` | Add topocentric navigation mode (az/alt) |
| `renderer.ts` | Scene transformation matrix for topocentric |
| `main.ts` | Mode toggle logic, coordinate display, LST computation |
| `index.html` | Mode toggle UI, reorganized location panel |
| `ui.ts` | Alt/Az formatting, compass directions |
| `tour.ts` | Convert tour targets based on view mode |

#### Verification Checklist

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

</details>

---

## Deep Sky Objects

28 DSOs rendered with full visual treatment.

### Object Types

- **Galaxies:** M31 (Andromeda), M33 (Triangulum), LMC, SMC, M81, M82
- **Emission Nebulae:** M42 (Orion), M8 (Lagoon), M17 (Omega), M20 (Trifid), NGC7000 (North America), IC1396
- **Planetary Nebulae:** M57 (Ring), M27 (Dumbbell), NGC7293 (Helix)
- **Globular Clusters:** NGC5139 (Omega Centauri), NGC104 (47 Tuc), M13, M22, M5
- **Open Clusters:** M45 (Pleiades), M44 (Beehive), Hyades, M7, NGC869/884 (Double Cluster)
- **Dark Nebulae:** Coalsack

### Rendering Features

- Elliptical sprite rendering with position angle and axis ratio
- Type-based color coding
- Labels with catalog IDs
- Info modals with descriptions, distances, and physical details
- Flag lines connecting labels to objects (color-coded by type)

---

## Stellar Scintillation

Atmospheric twinkling simulation for bright stars in topocentric view mode.

### The Physics

Scintillation ("twinkling") is caused by atmospheric turbulence bending starlight through pockets of air with varying temperature and density:

1. **Intensity scintillation** - rapid brightness fluctuations (5-20 Hz)
2. **Chromatic scintillation** - color flashes (red/blue/green) from wavelength-dependent refraction
3. **Position scintillation** - tiny apparent position shifts (usually sub-arcsecond)

### Factors Affecting Scintillation

| Factor | Effect |
|--------|--------|
| **Altitude** | Stars near horizon twinkle dramatically (38× more atmosphere than zenith) |
| **Brightness** | Brighter stars show more noticeable color flashes (Sirius is famous for this) |
| **Angular size** | Point sources twinkle; planets (with disk) barely twinkle; Moon/Sun don't |
| **Seeing conditions** | Varies night-to-night based on atmospheric stability |
| **Wavelength** | Blue light scintillates more than red (causes chromatic effect) |

**Airmass by altitude:**
- Zenith (90°): 1.0 airmass
- 30° altitude: ~2.0 airmasses
- 10° altitude: ~5.6 airmasses
- Horizon (0°): ~38 airmasses

### Implementation

- Custom GLSL shader with altitude-based intensity
- Chromatic modulation (R/G/B at slightly different frequencies)
- Multi-frequency oscillation for natural randomness
- User-adjustable "Atmospheric seeing" control (None/Excellent/Average/Poor)
- Only enabled in topocentric mode

### Priority Stars

Stars prioritized for scintillation (brightest, most often observed at low altitude):
- **Sirius** (α CMa, mag -1.46) - the classic "twinkling star"
- **Canopus** (α Car, mag -0.72) - southern observers
- **Arcturus** (α Boo, mag -0.05)
- **Vega** (α Lyr, mag 0.03)
- **Capella** (α Aur, mag 0.08)
- **Rigel** (β Ori, mag 0.13)

---

## UI Framework

Refactored from vanilla CSS to Tailwind CSS v4 with modern utility-first styling.

### What's Included

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

### Files Added/Modified

| File | Changes |
|------|---------|
| `package.json` | Added tailwindcss, @tailwindcss/postcss, autoprefixer, class-variance-authority, clsx, tailwind-merge |
| `postcss.config.js` | New - PostCSS configuration |
| `src/styles.css` | New - All styles (2183 lines) |
| `src/lib/utils.ts` | New - `cn()` utility function |
| `src/main.ts` | Added CSS import |
| `index.html` | Removed inline CSS |

---

## Astronomical Corrections

### Nutation Corrections

- Δψ (nutation in longitude)
- Δε (nutation in obliquity)
- Improved apparent positions for all objects

### Annual Aberration

- Correction for Sun and Moon (~20 arcseconds)
- Accounts for Earth's orbital motion

### Moon Orbital Planes

- Jupiter moon orbital plane fix (3° tilt)
- Saturn moon orbital plane fix (27° tilt now properly rendered)

---

## Solar System Objects

### Planets & Moons

| Body | Moons Included |
|------|----------------|
| Mars | Phobos, Deimos |
| Jupiter | Io, Europa, Ganymede, Callisto |
| Saturn | Mimas, Enceladus, Tethys, Dione, Rhea, Titan |
| Uranus | Miranda, Ariel, Umbriel, Titania, Oberon |
| Neptune | Triton (retrograde orbit) |

### Dwarf Planets & TNOs

- **Dwarf planets:** Pluto, Ceres, Eris, Makemake, Haumea
- **TNOs:** Sedna, Quaoar, Gonggong, Orcus, Varuna

### Asteroids & NEOs

- **Major asteroids:** Vesta, Pallas, Hygiea
- **Near-Earth objects:** Apophis, Bennu

---

## Satellite Tracking

Real-time satellite positions with visibility indication.

### Satellites Supported

| Satellite | Horizons ID | Altitude |
|-----------|-------------|----------|
| ISS (International Space Station) | -125544 | ~420 km |
| Hubble Space Telescope | -48 | ~540 km |

### Implementation

- **Tabulated ephemeris** - Pre-computed positions from NASA Horizons API
- **Cubic spline interpolation** - Smooth position between tabulated points (Catmull-Rom)
- **Earth shadow calculation** - Cylindrical approximation for umbra detection
- **Topocentric conversion** - ECI to observer-relative coordinates
- **Horizon culling** - Satellites hidden when below observer's horizon
- **Cache-busting** - Ephemeris fetch includes timestamp to ensure fresh data

### Visual Features

- Bright yellow-white marker when illuminated by Sun
- Dim blue-gray when in Earth's shadow (still shown if above horizon)
- Labels show name, shadow state, and distance (e.g., "ISS (412 km)")
- LOD system: detailed sprites when zoomed in (ISS shows actual image)
- Searchable by name or full name

### Data Pipeline

```
NASA Horizons API → Python script → Binary ephemeris file → WASM loader
```

Binary format: `[count: u32][jd: f64, x: f64, y: f64, z: f64]...`

Ephemeris regeneration script: `scripts/generate_satellite_ephemeris.py`

### Visibility Rules

Satellites are displayed when ALL conditions are met:
1. Ephemeris data loaded and date in range
2. Above observer's horizon (topocentric mode)
3. Position successfully interpolated

When date is outside ephemeris range, search displays toast notification explaining the issue.

Illumination state shown but doesn't hide the satellite (observers may want to see where it is even in shadow).

---

## Meteor Showers

Display meteor shower radiants with activity indicators.

### Showers Included

| Shower | Peak | ZHR | Parent Body |
|--------|------|-----|-------------|
| Quadrantids | Jan 4 | 120 | 2003 EH1 |
| Lyrids | Apr 22 | 18 | C/1861 G1 (Thatcher) |
| Eta Aquariids | May 6 | 50 | 1P/Halley |
| Southern Delta Aquariids | Jul 30 | 25 | 96P/Machholz |
| Alpha Capricornids | Jul 30 | 5 | 169P/NEAT |
| Perseids | Aug 12 | 100 | 109P/Swift-Tuttle |
| Draconids | Oct 8 | 10 | 21P/Giacobini-Zinner |
| Orionids | Oct 21 | 20 | 1P/Halley |
| Taurids | Nov 5 | 5 | 2P/Encke |
| Leonids | Nov 17 | 15 | 55P/Tempel-Tuttle |
| Geminids | Dec 14 | 150 | 3200 Phaethon |
| Ursids | Dec 22 | 10 | 8P/Tuttle |

### Features

- **Starburst radiant markers** - Orange markers at radiant positions
- **Peak indicators** - Brighter markers and star (★) in label during peak
- **Radiant drift correction** - Positions adjusted based on current date
- **Activity dates** - Only active showers are displayed
- **Searchable** - Find showers by name with peak date and ZHR in results
- **Keyboard shortcut** - Toggle with M key
