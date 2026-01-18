# Roadmap

Feature ideas for future development.

For completed features, see [docs/COMPLETED_FEATURES.md](docs/COMPLETED_FEATURES.md).

---

## High Priority

### Historical Supernova Tours

Guided tours of historical supernovae that changed astronomy.

**SN 1054 (Crab Nebula)** - July 4, 1054
- Chinese and Arab astronomers recorded a "guest star" visible in daylight for 23 days
- Show the sky from China, zoom to Taurus, show where the star appeared
- End at the Crab Nebula today (M1 deep field image already in app)

**Tycho's Supernova (SN 1572)** - November 11, 1572
- Tycho Brahe's observations proved stars could change, challenging Aristotelian cosmology
- Show from Denmark (Hven island), the supernova in Cassiopeia
- Reached magnitude -4 (brighter than Venus)

**Kepler's Supernova (SN 1604)** - October 9, 1604
- Last Milky Way supernova visible to naked eye
- Observed by Kepler in Prague, near Jupiter/Saturn/Mars conjunction
- Show the rare planetary grouping that drew attention to that part of sky

**SN 1987A** - February 23, 1987
- First naked-eye supernova in 383 years
- In the Large Magellanic Cloud (LMC deep field image already in app)
- Show from Chile (where first observed), neutrino detection story

### Famous Transit Tours

Historic transits used to measure the solar system.

**1769 Transit of Venus** - June 3, 1769
- Captain Cook's expedition to Tahiti
- Show the transit from Tahiti, explain how parallax measurements determined the AU
- Multiple expeditions worldwide (coordinate with historical context)

**2012 Transit of Venus** - June 5-6, 2012
- Last Venus transit until 2117
- Show the transit path across the Sun

**Mercury Transits**
- More frequent, good for demonstrating the concept
- Recent: November 11, 2019

### Discovery Moment Tours

Recreate the night sky as seen during major discoveries.

**Galileo's Jupiter Moons** - January 7-15, 1610
- Already have this tour - could expand with more historical context
- Show the nightly progression as Galileo tracked the "stars" moving

**Discovery of Uranus** - March 13, 1781
- William Herschel in Bath, England
- Initially thought it was a comet
- Show the star field in Gemini where he spotted the slow-moving object

**Discovery of Neptune** - September 23, 1846
- Mathematical prediction by Le Verrier, observed by Galle in Berlin
- Triumph of Newtonian mechanics
- Show Neptune's position among the stars

**Discovery of Pluto** - February 18, 1930
- Clyde Tombaugh at Lowell Observatory
- Blink comparator technique - show the star field, highlight Pluto's motion

---

## Medium Priority

### Eclipse Path Integration

Extend the eclipse feature with location-aware path visualization.

- Show eclipse center path on celestial sphere
- "Navigate to path" button → set location to nearest path point
- Calculate local eclipse circumstances (contact times, duration)
- Path distance: "You are X km from the center line"

Upcoming eclipses: Spain 2026, Egypt 2027, Australia 2028.

### Orbital Mechanics Visualization

Help users understand orbital constraints for space telescope view modes.

- Sun avoidance zone overlay (~50° for Hubble)
- South Atlantic Anomaly (SAA) visualization
- Show orbital path

### Guide Star Lock

Simulate how space telescopes maintain precise pointing using guide stars.

- User selects a star as guide star
- Camera locks onto that star, tracking it
- FGS crosshair overlay shows the lock

---

## Low Priority

### Rise/Set Times

Show when objects rise, transit, and set for the current location.

- Sun rise/set and twilight times
- Moon rise/set and transit
- Planet visibility windows

### Tonight's Highlights Panel

Surface observing info in topocentric mode (moon phase, visible planets, ISS passes).

### Keyboard Shortcut Help

Press `?` to show overlay listing all keyboard shortcuts.

### Historical Missions

Ride on Voyager, see what it saw at Jupiter flyby.

---

## Optional Polish

- **Atmospheric extinction** - Stars dim near horizon based on airmass
- **Twilight sky color** - Sky background gradient based on sun altitude
- **Track object mode** - Camera follows a star/planet as it rises/sets

---

## Technical Debt

- **Satellite ephemeris date range** - Current data covers ~30 days. Need cron regeneration or TLE/SGP4.
- **Test coverage** - Astronomy calculations should have regression tests against JPL Horizons.

---

## Not Planned

- **User accounts / cloud sync** — unnecessary complexity
- **Atmospheric refraction simulation** — academic rather than practical
- **Full satellite catalog** — scope creep, dedicated apps exist
