# Roadmap

Feature ideas for future development.

## High Priority

### Search / Go-to Functionality
Add a search box that centers the view on named objects. Should search across:
- Planet names (Mars, Jupiter, Saturn, etc.)
- Major star names (Sirius, Betelgeuse, Vega, etc.)
- Constellation names (Orion, Ursa Major, etc.)
- Video object names (Crab Nebula, Andromeda Galaxy, etc.)

Autocomplete dropdown as user types. Press Enter or click result to animate camera to that position.

### URL Deep Linking
Encode view state in URL parameters for sharing specific sky views:
```
?ra=5.5&dec=-5.4&fov=10&t=2024-01-15T20:00
```

Parameters to support:
- `ra` / `dec` — Camera pointing direction
- `fov` — Field of view in degrees
- `t` — Date/time (ISO 8601)
- `mag` — Limiting magnitude
- `video` — Video ID to auto-open on load

Use `history.replaceState()` to update URL as user navigates without creating history entries.

## Medium Priority

### Keyboard Shortcut Help
Press `?` to show overlay with all keyboard shortcuts:
- `C` — Toggle constellations
- `L` — Toggle labels
- `V` — Toggle videos
- `O` — Toggle orbits
- `P` — Play/pause time
- `Space` — Go to galactic center
- `←/→` — Step time backward/forward
- `↑/↓` — Rotate view

### Night Vision Mode
Red-only color scheme for outdoor observing. Toggle with `N` key or UI button.
Could be implemented with CSS filter or a proper theme system.

## Low Priority

### Observer Location
Add location picker (or manual lat/lon input) to show:
- Horizon plane with cardinal directions (N/S/E/W)
- Which objects are currently above/below horizon
- Optional: altitude/azimuth coordinates in addition to RA/Dec

### PWA Support
Add `manifest.json` and service worker for:
- Offline use while stargazing
- "Add to home screen" on mobile
- Faster repeat loads via caching

## Not Planned

- Extended object catalogs (Messier, NGC) — videos are the content
- Higher precision ephemeris — current accuracy is sufficient
- User accounts / cloud sync — unnecessary complexity
- Atmospheric simulation — academic rather than practical
