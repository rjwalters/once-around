# Roadmap

Feature ideas for future development.

For completed features, see [docs/COMPLETED_FEATURES.md](docs/COMPLETED_FEATURES.md).

---

## Remaining Work

### Eclipse Path Integration

Extend the eclipse feature with location-aware path visualization.

- Show eclipse center path on celestial sphere
- "Navigate to path" button → set location to nearest path point
- Calculate local eclipse circumstances:
  - Contact times (C1, C2, C3, C4)
  - Maximum eclipse time
  - Duration of totality (if applicable)
  - Sun altitude at maximum
- Eclipse banner shows "Totality visible: Yes/No" based on location
- Path distance: "You are X km from the center line"

---

## Low Priority

### Tour-Based Nebula Overrides

Extend DSO rendering with tour-based overrides for dynamic effects.

**Current state:** Basic DSO rendering is complete with 28 objects rendered as elliptical sprites with labels, info modals, and flag lines.

**Remaining work:**
- Nebula override system similar to star overrides
- Tours can dynamically spawn/scale nebulae (e.g., Betelgeuse remnant grows over time)
- Textured sprites or procedural shaders for enhanced visuals

**Use cases:**
- Betelgeuse nova tour: Show expanding supernova remnant
- Historical supernovae: Crab Nebula from SN 1054, Tycho's SNR, Kepler's SNR

### Keyboard Shortcut Help

Press `?` to show overlay listing all keyboard shortcuts.

### PWA Support

Add `manifest.json` and service worker for:
- Offline use while stargazing
- "Add to home screen" on mobile
- Faster repeat loads via caching

### Video Curation Expansion

Review uncurated videos for mappable objects.
Manual task, not a code feature.

---

## Optional Polish

Features that would enhance the experience but are not essential:

- **Atmospheric extinction** - Stars dim near horizon based on airmass
- **Twilight sky color** - Sky background changes based on sun altitude
- **Track object mode** - Camera follows a star/planet as it rises/sets
- **Rise/set times** - Show when objects rise and set for current location

---

## Not Planned

- **User accounts / cloud sync** — unnecessary complexity
- **Atmospheric refraction simulation** — academic rather than practical
