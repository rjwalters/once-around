# Roadmap

Feature ideas for future development.

## High Priority

### Scene Replay / Tours
Infrastructure for scripted sequences that control both camera position and time progression, enabling planetarium-style guided tours.

Components:
- Scene format: array of keyframes with RA/Dec, FOV, datetime, duration
- Playback engine: smooth interpolation between keyframes
- UI: play/pause controls, progress indicator
- Predefined tours: "Solar Eclipse 2024", "Jupiter's Moons", etc.

### Mobile / Touch Improvements
Better experience on phones and tablets:
- Touch-friendly controls (pinch zoom, drag to pan)
- Responsive UI that adapts to small screens
- Gesture support for common actions

## Medium Priority

### Comet Tracking
Add orbital elements for periodic comets:
- Halley, Encke, Tempel 1 (periodic)
- Near-parabolic comets (C/2023 A3 Tsuchinshan-ATLAS, etc.)

Requires: parabolic/hyperbolic orbit solver (e ≥ 1)

### Observer Location
Add location picker (or manual lat/lon input) to show:
- Horizon plane with cardinal directions (N/S/E/W)
- Which objects are currently above/below horizon
- Alt/Az coordinates in addition to RA/Dec

### Topocentric Moon Position
Compute topocentric (rather than geocentric) Moon position.
Would improve eclipse alignment from ~0.5° to near-perfect for a given location.
Requires: observer lat/lon, local sidereal time, parallax correction.
Depends on: Observer Location

## Low Priority

### Keyboard Shortcut Help
Press `?` to show overlay listing all keyboard shortcuts.

### Night Vision Mode
Red-only color scheme for outdoor observing.
Could be CSS filter or proper theme system.

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
