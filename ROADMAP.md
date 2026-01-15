# Roadmap

Feature ideas for future development.

## Medium Priority

### Video Curation Expansion
Review uncurated videos (192 of 306) for mappable objects:
- Some map to specific locations (e.g., supernova remnants)
- Some are topical and cannot be placed (Magnetars, Cosmic Rays, etc.)

### Keyboard Shortcut Help
Press `?` to show overlay with all keyboard shortcuts.

### Night Vision Mode
Red-only color scheme for outdoor observing. Toggle with UI button.
Could be implemented with CSS filter or a proper theme system.

## Low Priority

### Observer Location
Add location picker (or manual lat/lon input) to show:
- Horizon plane with cardinal directions (N/S/E/W)
- Which objects are currently above/below horizon
- Optional: altitude/azimuth coordinates in addition to RA/Dec

### Topocentric Moon Position
Add observer location to compute topocentric (rather than geocentric) Moon position.
Would improve eclipse alignment from ~0.5° to near-perfect for a given location.
Requires: observer lat/lon, local sidereal time calculation, parallax correction.

### PWA Support
Add `manifest.json` and service worker for:
- Offline use while stargazing
- "Add to home screen" on mobile
- Faster repeat loads via caching

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
