# Once Around the Night Sky

An interactive celestial visualizer for Paul Fellows' excellent [Once Around](https://www.youtube.com/@oncearound) series of astronomy YouTube videos.

<p align="center">
  <a href="https://once-around.pages.dev">
    <img src="jupiter.gif" width="500" alt="Jupiter and its Galilean moons in motion">
  </a>
</p>

## Live Demo

**[once-around.pages.dev](https://once-around.pages.dev)**

## Features

### Sky Rendering
- **120,000+ stars** from the Yale Bright Star Catalog with accurate magnitudes
- **Milky Way** procedurally rendered based on galactic coordinates
- **88 constellations** with IAU-standard lines and labels
- **Stellar scintillation** (twinkling) simulation in topocentric mode

### Solar System
- **Planets** with real-time positions via VSOP87 theory
- **Planetary moons** — Jupiter (4), Saturn (6), Uranus (5), Neptune (1), Mars (2)
- **Dwarf planets** — Pluto, Ceres, Eris, Makemake, Haumea
- **Comets** — Halley, NEOWISE, Hale-Bopp, Tsuchinshan-ATLAS, and more
- **Orbital paths** showing apparent motion against the stars

### Deep Sky Objects
- **28 deep field images** from Hubble and JWST at actual sky positions
- **DSO markers** for galaxies, nebulae, and star clusters with info popups
- Includes Andromeda, Orion Nebula, Pillars of Creation, Magellanic Clouds

### View Modes
- **Geocentric** — Explore the celestial sphere from Earth's center
- **Topocentric** — Your local sky with horizon, Alt/Az coordinates
- **Hubble** — Ride the telescope in LEO with Earth below
- **JWST** — View from L2 with Sun avoidance zone overlay

### Satellites & Meteor Showers
- **ISS and Hubble** tracking with real-time positions and shadow state
- **12 meteor showers** with radiant markers during active periods

### Additional Features
- **Search** — Find any star, planet, constellation, DSO, or satellite
- **Time controls** — Scrub through time to watch celestial motion
- **Video markers** — Links to relevant Once Around episodes
- **Guided tours** — Animated journeys (eclipses, comet appearances)
- **AR mode** — Use device orientation to explore (mobile)
- **Night vision** — Red-only mode for outdoor observing

## Controls

| Action | Input |
|--------|-------|
| Look around | Click and drag |
| Zoom | Scroll wheel or pinch |
| Search | Press `/` |
| Toggle labels | `L` |
| Toggle constellations | `C` |
| Toggle video markers | `V` |
| Toggle DSOs | `D` |
| Toggle orbits | `O` |
| Toggle meteor showers | `M` |
| Night vision mode | `R` |

## Tech Stack

- **Frontend**: TypeScript, Three.js, Vite
- **Astronomy Engine**: Rust compiled to WebAssembly
  - VSOP87 planetary theory
  - Custom orbital mechanics for planetary moons
  - Yale Bright Star Catalog (BSC5) data
- **Deployment**: Cloudflare Pages

## Project Structure

```
once-around/
├── apps/web/          # Three.js frontend application
├── crates/
│   ├── sky_engine/        # WASM bindings
│   └── sky_engine_core/   # Core astronomy calculations (Rust)
└── data/              # Star catalog and video placement data
```

## Development

```bash
# Install dependencies
pnpm install

# Build WASM module
pnpm build:wasm

# Start dev server
pnpm dev

# Build for production
pnpm build:all

# Deploy to Cloudflare
pnpm run deploy
```

## Credits

- [Paul Fellows / Once Around](https://www.youtube.com/@oncearound) for the inspiring video series
- Yale Bright Star Catalog for star data
- VSOP87 theory by Pierre Bretagnon and Gerard Francou

## License

MIT
