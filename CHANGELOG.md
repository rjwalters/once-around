# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Rise/set times panel for the Sun, Moon, and planets in topocentric mode (#81)
- Periodic minor-body element refresh machinery: a Horizons-backed rewrite script plus a quarterly workflow that opens a refresh PR when osculating elements drift (#80)

### Changed
- Keyboard help overlay is now driven by a shared shortcut registry, so the `?` overlay and the handlers can't drift apart (#79)
- Golden position suite runs on a dedicated macOS Apple Silicon CI job; `sky_engine` pass-prediction tests are pinned to a fixed ISS ephemeris fixture and run in CI (#78, #85)

## [0.9.0] - 2026-07-07

First tagged release, snapshotting the app after the July 2026 development cycle. The baseline product — ~8,400 Yale BSC stars, VSOP87 planets and moons, geocentric/topocentric/Hubble/JWST view modes, deep fields, satellites, meteor showers, AR mode, and PWA support — is documented in [docs/COMPLETED_FEATURES.md](docs/COMPLETED_FEATURES.md).

### Added
- Five new guided tours, bringing the total to 23: Great Comet of 1811, Ikeya-Seki 1965, Historical Eclipses (1919 Eddington + 585 BCE Battle of Halys), and Space Mission Moments (Apollo 8 Earthrise + Pale Blue Dot) (#47, #48, #49)
- Eclipse path toolkit: center-line data for the 2026/2027/2028 total eclipses with an SVG mini-map, "navigate to path", distance-from-center-line readout, and local circumstances (#50)
- Eclipse center-line ground tracks rendered on the 3D Earth globe (#67)
- Hubble orbital-constraint overlays: ~50° Sun-avoidance cone, South Atlantic Anomaly cap, and orbital-path ring (#51)
- FGS guide-star lock for the Hubble/JWST modes (`G` key) (#52)
- ISS pass staleness detection with an explicit "ephemeris expired" warning, plus a weekly GitHub Actions job that refreshes ISS/Hubble ephemeris from NASA Horizons (#53)
- JPL Horizons accuracy regression suite validating Sun, Moon, planets, Pluto, comets, and all 14 minor bodies against external reference data, running offline from checked-in fixtures (#54)
- Rust engine test suites now run in CI on every PR (#65)

### Fixed
- Minor bodies now use real JPL Horizons osculating elements at a documented epoch — Ceres improved from ~18° off to 0.21′ (#66)
- `test_halley_1986_perihelion` asserted against the wrong epoch (1994, not 1986) and had failed since introduction (#54)
- Horizons ephemeris generation retries on timeout and clamps the request window to the data Horizons actually has (~30 days for ISS) (#63, #64)

### Changed
- README rewritten to match the shipped product (corrected star count, full keyboard map, new Accuracy section); CLAUDE.md now carries a contributor/agent quick reference (#72)
