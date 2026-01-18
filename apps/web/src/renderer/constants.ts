/**
 * Renderer Constants
 *
 * Shared constants used throughout the renderer modules.
 */

import * as THREE from "three";

// -----------------------------------------------------------------------------
// Geometry constants
// -----------------------------------------------------------------------------

export const SKY_RADIUS = 50;
export const MILKY_WAY_RADIUS = 49; // Slightly behind stars
export const LABEL_OFFSET = 1.8; // Distance to offset labels from objects

// -----------------------------------------------------------------------------
// Orbit path configuration
// -----------------------------------------------------------------------------

// Planets to show orbits for: Mercury(2), Venus(3), Mars(4), Jupiter(5), Saturn(6), Uranus(7), Neptune(8)
// Exclude Sun(0) and Moon(1) - Moon's path is complex, Sun defines the ecliptic
export const ORBIT_PLANET_INDICES = [2, 3, 4, 5, 6, 7, 8];
export const ORBIT_NUM_POINTS = 120; // Points per orbit path (reduced from 400 for performance)

// Orbital periods in days - use full period to show complete apparent path
// Outer planets use shorter spans since full orbits are visually similar
export const ORBIT_PERIODS_DAYS: Record<number, number> = {
  2: 88,      // Mercury - full orbit
  3: 225,     // Venus - full orbit
  4: 687,     // Mars (~2 years) - full orbit
  5: 2000,    // Jupiter - ~5.5 years (reduced from 12)
  6: 3000,    // Saturn - ~8 years (reduced from 29)
  7: 3000,    // Uranus - ~8 years (reduced from 30)
  8: 3000,    // Neptune - ~8 years (reduced from 30)
};

// -----------------------------------------------------------------------------
// Body names and colors
// -----------------------------------------------------------------------------

export const BODY_NAMES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"];

// Colors for celestial bodies: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune
export const BODY_COLORS: THREE.Color[] = [
  new THREE.Color(1.0, 0.95, 0.4),  // Sun - bright yellow
  new THREE.Color(0.9, 0.9, 0.85),  // Moon - pale white
  new THREE.Color(0.7, 0.7, 0.7),   // Mercury - gray
  new THREE.Color(1.0, 0.95, 0.8),  // Venus - pale yellow
  new THREE.Color(1.0, 0.4, 0.3),   // Mars - red-orange
  new THREE.Color(0.9, 0.85, 0.7),  // Jupiter - tan
  new THREE.Color(0.9, 0.8, 0.6),   // Saturn - gold
  new THREE.Color(0.6, 0.85, 0.9),  // Uranus - pale cyan
  new THREE.Color(0.4, 0.5, 0.9),   // Neptune - blue
];

export const CONSTELLATION_COLOR = new THREE.Color(0.2, 0.4, 0.6);

// -----------------------------------------------------------------------------
// Minor body configuration (dwarf planets and asteroids)
// -----------------------------------------------------------------------------

// Minor body names in order from WASM buffer
export const MINOR_BODY_NAMES = [
  "Pluto", "Ceres", "Eris", "Makemake", "Haumea",
  "Sedna", "Quaoar", "Gonggong", "Orcus", "Varuna",
  "Vesta", "Pallas", "Hygiea", "Apophis", "Bennu"
] as const;

export const MINOR_BODY_COUNT = 15;

// Colors for minor bodies based on actual observed surface colors
export const MINOR_BODY_COLORS: THREE.Color[] = [
  new THREE.Color(0.85, 0.80, 0.75),  // Pluto - pinkish-tan (nitrogen ice + tholins)
  new THREE.Color(0.75, 0.75, 0.70),  // Ceres - gray (rocky, some ice)
  new THREE.Color(0.90, 0.88, 0.85),  // Eris - pale white (methane ice)
  new THREE.Color(0.85, 0.60, 0.50),  // Makemake - reddish (tholins)
  new THREE.Color(0.70, 0.55, 0.50),  // Haumea - reddish-brown (dark spot)
  new THREE.Color(0.75, 0.40, 0.35),  // Sedna - very red (most red known object)
  new THREE.Color(0.70, 0.55, 0.50),  // Quaoar - reddish-brown
  new THREE.Color(0.70, 0.50, 0.45),  // Gonggong - red
  new THREE.Color(0.70, 0.70, 0.65),  // Orcus - neutral gray (water ice)
  new THREE.Color(0.65, 0.50, 0.45),  // Varuna - reddish
  new THREE.Color(0.80, 0.80, 0.75),  // Vesta - light gray (basaltic)
  new THREE.Color(0.60, 0.60, 0.55),  // Pallas - darker gray (B-type)
  new THREE.Color(0.50, 0.50, 0.50),  // Hygiea - dark gray (C-type)
  new THREE.Color(0.65, 0.60, 0.55),  // Apophis - gray (S-type asteroid)
  new THREE.Color(0.35, 0.35, 0.35),  // Bennu - very dark (B-type, carbonaceous)
];

// -----------------------------------------------------------------------------
// Planetary moon configuration
// -----------------------------------------------------------------------------

// Planetary moon colors: Io, Europa, Ganymede, Callisto, Titan
export const PLANETARY_MOON_COLORS: THREE.Color[] = [
  new THREE.Color(0.95, 0.85, 0.4),  // Io - yellowish (sulfur volcanism)
  new THREE.Color(0.85, 0.8, 0.75),  // Europa - brownish-white (icy)
  new THREE.Color(0.65, 0.6, 0.55),  // Ganymede - gray-brown
  new THREE.Color(0.4, 0.4, 0.4),    // Callisto - dark gray (heavily cratered)
  new THREE.Color(0.9, 0.7, 0.4),    // Titan - orange (thick atmosphere)
];

// Apparent magnitudes of planetary moons (used for star-like brightness rendering)
export const PLANETARY_MOON_MAGNITUDES = [
  5.0,  // Io
  5.3,  // Europa
  4.6,  // Ganymede (brightest Galilean moon)
  5.7,  // Callisto
  8.4,  // Titan (much dimmer, often hard to see)
];

export const PLANETARY_MOON_NAMES = ["Io", "Europa", "Ganymede", "Callisto", "Titan"];

// FOV threshold for showing planetary moons (degrees) - only show when zoomed in
export const PLANETARY_MOONS_FOV_THRESHOLD = 30;

// -----------------------------------------------------------------------------
// Comet configuration
// -----------------------------------------------------------------------------

// Comet names in order from WASM buffer
export const COMET_NAMES = [
  "1P/Halley", "2P/Encke", "67P/C-G", "46P/Wirtanen",
  "C/2020 F3 NEOWISE", "C/2023 A3 T-ATLAS", "C/1995 O1 Hale-Bopp"
];

// Comet color - cyan-green to reflect their icy composition and coma glow
export const COMET_COLOR = new THREE.Color(0.5, 0.9, 0.8);

// -----------------------------------------------------------------------------
// LOD constants for star rendering
// -----------------------------------------------------------------------------

// Magnitude threshold - always render stars brighter than this
export const LOD_BRIGHT_MAG_THRESHOLD = 4.5;

// Target star counts at different FOV ranges
export const LOD_MAX_STARS_WIDE_FOV = 8000;   // FOV > 70°
export const LOD_MAX_STARS_MEDIUM_FOV = 15000; // FOV 40-70°
export const LOD_MAX_STARS_NARROW_FOV = 40000; // FOV < 40°

// Point source angular size in arcseconds - simulates telescope resolving power
// A typical backyard telescope (6-8") has ~1 arcsec resolving power
export const POINT_SOURCE_ANGULAR_SIZE_ARCSEC = 1.0;
export const POINT_SOURCE_MIN_SIZE_PX = 1.5; // Minimum size so stars don't disappear at wide FOV

// -----------------------------------------------------------------------------
// Major stars to label
// -----------------------------------------------------------------------------

// Major stars to label - includes all stars named in constellation descriptions
// HR (Harvard Revised / BSC) number → name
// Sorted roughly by magnitude (brightest first)
export const MAJOR_STARS: [number, string][] = [
  // First magnitude and brighter
  [2491, "Sirius"],       // α CMa, mag -1.46
  [2326, "Canopus"],      // α Car, mag -0.72
  [5340, "Arcturus"],     // α Boo, mag -0.05
  [7001, "Vega"],         // α Lyr, mag 0.03
  [1708, "Capella"],      // α Aur, mag 0.08
  [1713, "Rigel"],        // β Ori, mag 0.13
  [2943, "Procyon"],      // α CMi, mag 0.34
  [2061, "Betelgeuse"],   // α Ori, mag 0.42
  [472, "Achernar"],      // α Eri, mag 0.46
  [7557, "Altair"],       // α Aql, mag 0.76
  [4730, "Acrux"],        // α Cru, mag 0.77
  [1457, "Aldebaran"],    // α Tau, mag 0.85
  [5056, "Spica"],        // α Vir, mag 0.97
  [6134, "Antares"],      // α Sco, mag 1.06
  [2990, "Pollux"],       // β Gem, mag 1.14
  [8728, "Fomalhaut"],    // α PsA, mag 1.16
  [7924, "Deneb"],        // α Cyg, mag 1.25
  [3982, "Regulus"],      // α Leo, mag 1.36
  [2891, "Castor"],       // α Gem, mag 1.58
  [1790, "Bellatrix"],    // γ Ori, mag 1.64 - Orion's left shoulder
  // Second magnitude
  [8425, "Alnair"],       // α Gru, mag 1.74 - Grus
  [4905, "Alioth"],       // ε UMa, mag 1.77 - Ursa Major
  [4301, "Dubhe"],        // α UMa, mag 1.79 - Ursa Major (pointer star)
  [1017, "Mirfak"],       // α Per, mag 1.80 - Perseus
  [936, "Algol"],         // β Per, mag 2.12 - Perseus (the Demon Star)
  [6879, "Kaus Australis"], // ε Sgr, mag 1.85 - Sagittarius
  [6217, "Atria"],        // α TrA, mag 1.92 - Triangulum Australe
  [7790, "Peacock"],      // α Pav, mag 1.94 - Pavo
  [424, "Polaris"],       // α UMi, mag 1.98
  [617, "Hamal"],         // α Ari, mag 2.00 - Aries
  [3748, "Alphard"],      // α Hya, mag 2.00 - Hydra
  [188, "Diphda"],        // β Cet, mag 2.02 - Cetus
  [2004, "Saiph"],        // κ Ori, mag 2.07 - Orion's right foot
  [168, "Schedar"],       // α Cas, mag 2.24 - Cassiopeia
  [5054, "Mizar"],        // ζ UMa, mag 2.23
  [6556, "Rasalhague"],   // α Oph, mag 2.08 - Ophiuchus
  [5793, "Alphecca"],     // α CrB, mag 2.23 - Corona Borealis
  [15, "Alpheratz"],      // α And, mag 2.07 - Andromeda
  [6705, "Eltanin"],      // γ Dra, mag 2.23 - Draco
  [4295, "Merak"],        // β UMa, mag 2.37 - Ursa Major (pointer star)
  [8308, "Enif"],         // ε Peg, mag 2.38 - Pegasus
  // Third magnitude (notable constellation stars)
  [99, "Ankaa"],          // α Phe, mag 2.40 - Phoenix
  [5685, "Zubeneschamali"], // β Lib, mag 2.61 - Libra
  [5854, "Unukalhai"],    // α Ser, mag 2.63 - Serpens
  [6148, "Kornephoros"],  // β Her, mag 2.78 - Hercules
  [3634, "Suhail"],       // γ Vel, mag 2.23 - Vela
  [3165, "Naos"],         // ζ Pup, mag 2.21 - Puppis
  [4662, "Gienah"],       // γ Crv, mag 2.58 - Corvus
  [1865, "Arneb"],        // α Lep, mag 2.58 - Lepus
  [1956, "Phact"],        // α Col, mag 2.65 - Columba
  [8322, "Deneb Algedi"], // δ Cap, mag 2.85 - Capricornus
  [8232, "Sadalsuud"],    // β Aqr, mag 2.90 - Aquarius
];

// -----------------------------------------------------------------------------
// Deep Field visibility thresholds
// -----------------------------------------------------------------------------

// Deep field images fade in based on their apparent size in pixels
// Start fade-in: when image would be ~30px on screen (barely visible)
// Fully visible: when image would be ~100px on screen (meaningful detail)
export const DEEP_FIELD_FADE_START_PX = 30;
export const DEEP_FIELD_FADE_END_PX = 100;
