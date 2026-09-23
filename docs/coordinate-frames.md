# Sky coordinate frames

Every engine render direction and map layer uses **fixed J2000 mean equatorial
axes**: stars, deep sky objects, constellations, video markers, Sun/planets, Moon,
planetary moons, minor bodies, comets, satellite directions and planet tracks.
Rust XYZ maps to Three.js `(-X, Z, Y)`. Catalog coordinates remain fixed; proper
motion is not modeled. J2000 describes the axes, not necessarily an astrometric
position: the Sun and Moon retain the engine's approximate aberration correction.

- VSOP87A and orbital elements refer to the J2000 ecliptic. Convert them with
  fixed J2000 obliquity, never today's true obliquity or nutation in longitude.
- The Meeus lunar series is already mean equinox-of-date. Convert with mean
  obliquity of date, then inverse-precess once into J2000.
- For observer geometry, precess J2000 into the **mean equator/equinox of date**
  and use GMST plus east-positive longitude. Lunar parallax is calculated in that
  frame and converted back before writing the render buffer. Satellite ICRF/J2000
  vectors use the same boundary before subtracting the observer's position.
- The camera's east/north/up vectors, ground/cardinal labels, horizon culling,
  scintillation and Earth orientation use the inverse rotation, so the entire
  fixed sky map has the correct observed orientation. The standalone Sun/Moon
  diagnostic uses the same date-aware horizontal conversion.

`sky_engine_core::frames` and `geometry/precession.ts` implement IAU 1976
precession, following Lieske (1979), equations 6–7. The independently published
[ERFA pmat76 tests](https://github.com/liberfa/erfa/blob/master/src/t_erfa_c.c)
verify both implementations. This model is adequate for the app's arcminute
accuracy near modern epochs; it is not a claim of modern astrometric precision.
Rust uses TT/TDB for precession and UTC as the UT1 approximation for GMST. The
browser uses UTC for both; the TT difference changes precession by <0.001 arcsec.

Nutation is consistently omitted from observed projection; **GMST must not be
silently replaced with GAST** without adding the matching nutation rotation.
Atmospheric refraction is not applied to rendered or diagnostic positions, so
low objects can appear above the predicted geometric direction. Rise/set event
thresholds separately include conventional refraction/limb allowances. Planetary
light-time and annual aberration remain approximate/omitted; the Moon uses a
truncated series and a spherical sea-level observer. Comets and fixed orbital
elements remain coarse away from their element epochs.

Offline tests compare the actual f32 engine buffers and browser projection with
[JPL Horizons](https://ssd.jpl.nasa.gov/horizons/manual.html) apparent horizontal
quantity 4, explicitly `APPARENT=AIRLESS`, at Boulder, Sydney and London in 2026
and 2035. `scripts/fetch_observed_reference.py` regenerates that independent
fixture; no network is used by tests. Existing 3-arcminute planet and 6-arcminute
topocentric Moon bounds are retained. The older ICRF ephemeris tests still guard
the underlying orbital calculations. Bit-exact goldens were deliberately
regenerated on macOS/Apple Silicon for this frame correction (#119).
