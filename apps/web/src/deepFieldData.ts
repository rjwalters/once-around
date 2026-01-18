/**
 * Deep Field Image Data
 *
 * Catalog of deep field images (Hubble, JWST) with precise celestial coordinates.
 * These are real NASA images displayed at their actual sky positions.
 */

export interface DeepField {
  id: string;              // "HDF", "HUDF", "JWST-SMACS"
  name: string;            // "Hubble Deep Field"
  ra: number;              // Right ascension in degrees
  dec: number;             // Declination in degrees
  sizeArcmin: number;      // Angular size in arcminutes
  textureUrl: string;      // "/deep-fields/hdf.jpg"
  rotationAngle: number;   // Sky orientation in degrees
  description: string;     // For info popups
  telescope: "HST" | "JWST";
}

/**
 * Catalog of deep field images.
 * Coordinates and sizes from NASA/STScI documentation.
 */
export const DEEP_FIELD_DATA: DeepField[] = [
  // Hubble Deep Field (1995)
  {
    id: "HDF",
    name: "Hubble Deep Field",
    ra: 189.2,              // 12h 36m 49s
    dec: 62.217,            // +62° 13' 2"
    sizeArcmin: 2.6,
    textureUrl: "/deep-fields/hdf.jpg",
    rotationAngle: 0,
    description: "The original Hubble Deep Field, observed in December 1995. This 10-day exposure revealed nearly 3,000 galaxies in a tiny patch of sky in Ursa Major, fundamentally changing our understanding of the early universe.",
    telescope: "HST",
  },

  // Hubble Ultra Deep Field (2003-2004)
  {
    id: "HUDF",
    name: "Hubble Ultra Deep Field",
    ra: 53.16,              // 3h 32m 39s
    dec: -27.79,            // -27° 47' 24"
    sizeArcmin: 3.4,
    textureUrl: "/deep-fields/hudf.jpg",
    rotationAngle: 0,
    description: "The deepest visible-light image of the cosmos ever taken, accumulated over 400 Hubble orbits between 2003-2004. Located in the constellation Fornax, it contains approximately 10,000 galaxies, with some light having traveled over 13 billion years to reach us.",
    telescope: "HST",
  },

  // JWST First Deep Field - SMACS 0723 (2022)
  {
    id: "JWST-SMACS",
    name: "JWST First Deep Field",
    ra: 110.83,             // 7h 23m 20s
    dec: -73.45,            // -73° 27'
    sizeArcmin: 2.4,
    textureUrl: "/deep-fields/jwst-smacs.jpg",
    rotationAngle: 0,
    description: "The first deep field image from the James Webb Space Telescope, released July 11, 2022. Shows the galaxy cluster SMACS 0723 as it appeared 4.6 billion years ago, with gravitational lensing revealing extremely distant background galaxies from the early universe.",
    telescope: "JWST",
  },

  // JWST Carina Nebula "Cosmic Cliffs" (2022)
  {
    id: "JWST-CARINA",
    name: "Cosmic Cliffs (Carina Nebula)",
    ra: 161.26,             // 10h 45m 2s
    dec: -59.98,            // -59° 59'
    sizeArcmin: 16,
    textureUrl: "/deep-fields/jwst-carina.jpg",
    rotationAngle: 0,
    description: "The edge of a star-forming region NGC 3324 in the Carina Nebula, imaged by JWST. These 'Cosmic Cliffs' are about 7 light-years high, with the infrared view revealing previously hidden young stars and jets of material from newborn stars.",
    telescope: "JWST",
  },

  // JWST Pillars of Creation (2022)
  {
    id: "JWST-PILLARS",
    name: "Pillars of Creation",
    ra: 274.7,              // 18h 18m 48s
    dec: -13.78,            // -13° 47' (in Eagle Nebula M16)
    sizeArcmin: 4,
    textureUrl: "/deep-fields/jwst-pillars.jpg",
    rotationAngle: 0,
    description: "JWST's near-infrared view of the iconic Pillars of Creation in the Eagle Nebula (M16). These towering structures of gas and dust are about 5 light-years tall and are actively forming new stars. The infrared view reveals young stars hidden within the pillars.",
    telescope: "JWST",
  },
];

/**
 * Get a deep field by ID.
 */
export function getDeepFieldById(id: string): DeepField | undefined {
  return DEEP_FIELD_DATA.find(df => df.id === id);
}
