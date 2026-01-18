/**
 * Deep Field Image Data
 *
 * Catalog of deep field images (Hubble, JWST) with precise celestial coordinates.
 * These are real NASA images displayed at their actual sky positions.
 */

export interface DeepField {
  id: string;              // "HDF", "HUDF", "JWST-SMACS", "M51"
  name: string;            // "Hubble Deep Field", "Whirlpool Galaxy"
  ra: number;              // Right ascension in degrees
  dec: number;             // Declination in degrees
  sizeArcmin: number;      // Angular size in arcminutes
  textureUrl: string;      // "/deep-fields/hdf.jpg"
  rotationAngle: number;   // Sky orientation in degrees
  description: string;     // For info popups
  telescope: "HST" | "JWST";
  category?: "deep_field" | "messier";  // Optional category for filtering
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
    category: "deep_field",
  },

  // ============================================
  // MESSIER OBJECTS - Iconic imagery
  // ============================================

  // M51 - Whirlpool Galaxy
  {
    id: "M51",
    name: "Whirlpool Galaxy",
    ra: 202.47,             // 13h 29m 52.7s
    dec: 47.195,            // +47° 11' 43"
    sizeArcmin: 11,         // ~11' x 7', using major axis
    textureUrl: "/messier/m51.jpg",
    rotationAngle: 163,     // Position angle ~163°
    description: "The Whirlpool Galaxy (M51) and its companion NGC 5195 form one of the most famous interacting galaxy pairs. Located 23 million light-years away in Canes Venatici, its grand-design spiral arms are sites of intense star formation triggered by the gravitational interaction with its smaller companion.",
    telescope: "HST",
    category: "messier",
  },

  // M104 - Sombrero Galaxy
  {
    id: "M104",
    name: "Sombrero Galaxy",
    ra: 189.998,            // 12h 39m 59.4s
    dec: -11.623,           // -11° 37' 23"
    sizeArcmin: 9,          // ~9' x 4', using major axis
    textureUrl: "/messier/m104.jpg",
    rotationAngle: 90,      // Nearly edge-on, PA ~90°
    description: "The Sombrero Galaxy (M104) is an unbarred spiral galaxy 31 million light-years away in Virgo. Its distinctive appearance comes from its nearly edge-on orientation, prominent dust lane, and unusually large central bulge containing several hundred billion stars. The galaxy also hosts a supermassive black hole of about 1 billion solar masses.",
    telescope: "HST",
    category: "messier",
  },

  // M57 - Ring Nebula (Hubble)
  {
    id: "M57",
    name: "Ring Nebula",
    ra: 283.396,            // 18h 53m 35s
    dec: 33.029,            // +33° 01' 45"
    sizeArcmin: 1.5,        // ~1.4' x 1.0', small but detailed
    textureUrl: "/messier/m57.jpg",
    rotationAngle: 0,
    description: "The Ring Nebula (M57) is a planetary nebula in Lyra, about 2,300 light-years away. This Hubble image reveals the intricate structure of gas ejected by a dying Sun-like star. The central white dwarf, faintly visible at the center, ionizes the surrounding gas creating the colorful glow. The nebula is expanding at about 20 km/s and is approximately 4,000 years old.",
    telescope: "HST",
    category: "messier",
  },

  // M31 - Andromeda Galaxy
  {
    id: "M31",
    name: "Andromeda Galaxy",
    ra: 10.685,             // 0h 42m 44s
    dec: 41.269,            // +41° 16' 9"
    sizeArcmin: 190,        // ~190' x 60', our nearest large galaxy neighbor
    textureUrl: "/messier/m31.jpg",
    rotationAngle: 35,      // Position angle ~35°
    description: "The Andromeda Galaxy (M31) is the nearest major galaxy to the Milky Way, at 2.5 million light-years away. Containing roughly one trillion stars, it is on a collision course with our galaxy, expected to merge in about 4.5 billion years. Visible to the naked eye, it has been observed since antiquity.",
    telescope: "HST",
    category: "messier",
  },

  // M42 - Orion Nebula
  {
    id: "M42",
    name: "Orion Nebula",
    ra: 83.82,              // 5h 35m 17s
    dec: -5.39,             // -5° 23' 28"
    sizeArcmin: 65,         // ~85' x 60', using average
    textureUrl: "/messier/m42.jpg",
    rotationAngle: 0,
    description: "The Orion Nebula (M42) is the closest massive star-forming region to Earth at 1,344 light-years. Located in Orion's sword, it contains the Trapezium, a tight cluster of young hot stars whose ultraviolet radiation illuminates the surrounding gas. Over 700 stars in various stages of formation have been identified within the nebula.",
    telescope: "HST",
    category: "messier",
  },

  // M8 - Lagoon Nebula
  {
    id: "M8",
    name: "Lagoon Nebula",
    ra: 270.94,             // 18h 03m 37s
    dec: -24.39,            // -24° 23' 12"
    sizeArcmin: 90,         // ~90' x 40', one of the largest emission nebulae
    textureUrl: "/messier/m8.jpg",
    rotationAngle: 0,
    description: "The Lagoon Nebula (M8) is one of the largest and brightest emission nebulae in the sky, visible to the naked eye from dark locations. Located 4,100 light-years away in Sagittarius, it contains the open cluster NGC 6530 and the Hourglass Nebula at its center. The nebula spans about 110 light-years and is an active stellar nursery.",
    telescope: "HST",
    category: "messier",
  },

  // M20 - Trifid Nebula
  {
    id: "M20",
    name: "Trifid Nebula",
    ra: 270.60,             // 18h 02m 23s
    dec: -23.03,            // -23° 01' 48"
    sizeArcmin: 28,         // ~28' diameter
    textureUrl: "/messier/m20.jpg",
    rotationAngle: 0,
    description: "The Trifid Nebula (M20) is a unique combination of three nebula types: an emission nebula (red), reflection nebula (blue), and dark nebula (the lanes that give it its name). Located 5,200 light-years away in Sagittarius, it was named 'Trifid' by John Herschel for the three dark dust lanes that appear to divide it into three lobes.",
    telescope: "HST",
    category: "messier",
  },

  // M1 - Crab Nebula
  {
    id: "M1",
    name: "Crab Nebula",
    ra: 83.633,             // 5h 34m 32s
    dec: 22.015,            // +22° 00' 52"
    sizeArcmin: 7,          // ~7' x 5'
    textureUrl: "/messier/m1.jpg",
    rotationAngle: 0,
    description: "The Crab Nebula (M1) is the remnant of a supernova explosion witnessed by Chinese astronomers in 1054 AD. Located 6,500 light-years away in Taurus, it contains a pulsar at its center - a rapidly spinning neutron star emitting radiation 30 times per second. The nebula is expanding at about 1,500 km/s.",
    telescope: "HST",
    category: "messier",
  },

  // M101 - Pinwheel Galaxy
  {
    id: "M101",
    name: "Pinwheel Galaxy",
    ra: 210.802,            // 14h 03m 12.6s
    dec: 54.349,            // +54° 20' 57"
    sizeArcmin: 29,         // ~29' x 27', nearly face-on
    textureUrl: "/messier/m101.jpg",
    rotationAngle: 0,
    description: "The Pinwheel Galaxy (M101) is a face-on spiral galaxy 21 million light-years away in Ursa Major. With a diameter of 170,000 light-years, it is nearly twice the size of the Milky Way. Its asymmetric shape is the result of gravitational interactions with companion galaxies, which have also triggered extensive star formation in its spiral arms.",
    telescope: "HST",
    category: "messier",
  },

  // M27 - Dumbbell Nebula
  {
    id: "M27",
    name: "Dumbbell Nebula",
    ra: 299.902,            // 19h 59m 36.3s
    dec: 22.721,            // +22° 43' 16"
    sizeArcmin: 8,          // ~8' x 5.7'
    textureUrl: "/messier/m27.jpg",
    rotationAngle: 0,
    description: "The Dumbbell Nebula (M27) was the first planetary nebula ever discovered, by Charles Messier in 1764. Located 1,360 light-years away in Vulpecula, it represents the final stage of a Sun-like star's life. The central white dwarf is one of the largest known, and the nebula continues to expand at about 31 km/s.",
    telescope: "HST",
    category: "messier",
  },

  // ============================================
  // GLOBULAR CLUSTERS
  // ============================================

  // M13 - Great Globular Cluster in Hercules
  {
    id: "M13",
    name: "Hercules Globular Cluster",
    ra: 250.423,            // 16h 41m 41.6s
    dec: 36.461,            // +36° 27' 41"
    sizeArcmin: 20,         // ~20' diameter
    textureUrl: "/messier/m13.jpg",
    rotationAngle: 0,
    description: "The Great Globular Cluster in Hercules (M13) is one of the brightest globular clusters visible from the Northern Hemisphere. Located 22,200 light-years away, it contains several hundred thousand stars packed into a sphere about 145 light-years across. In 1974, the Arecibo message was beamed toward M13 as an attempt at interstellar communication.",
    telescope: "HST",
    category: "messier",
  },

  // M3 - Globular Cluster in Canes Venatici
  {
    id: "M3",
    name: "M3 Globular Cluster",
    ra: 205.548,            // 13h 42m 11.6s
    dec: 28.377,            // +28° 22' 38"
    sizeArcmin: 18,         // ~18' diameter
    textureUrl: "/messier/m3.jpg",
    rotationAngle: 0,
    description: "M3 is one of the largest and brightest globular clusters in the sky, containing approximately 500,000 stars. Located 33,900 light-years away in Canes Venatici, it was the first Messier object discovered by Charles Messier himself in 1764. The cluster is notable for its large population of variable stars, with over 270 identified.",
    telescope: "HST",
    category: "messier",
  },

  // M5 - Globular Cluster in Serpens
  {
    id: "M5",
    name: "M5 Globular Cluster",
    ra: 229.638,            // 15h 18m 33.2s
    dec: 2.081,             // +2° 04' 52"
    sizeArcmin: 23,         // ~23' diameter
    textureUrl: "/messier/m5.jpg",
    rotationAngle: 0,
    description: "M5 is one of the oldest globular clusters known, estimated at 13 billion years old. Located 24,500 light-years away in Serpens, it contains over 100,000 stars and spans about 165 light-years in diameter. Under dark skies, it is just visible to the naked eye. The cluster contains 105 known variable stars, mostly RR Lyrae type.",
    telescope: "HST",
    category: "messier",
  },

  // M22 - Sagittarius Cluster
  {
    id: "M22",
    name: "Sagittarius Cluster",
    ra: 279.100,            // 18h 36m 24s
    dec: -23.903,           // -23° 54' 12"
    sizeArcmin: 32,         // ~32' diameter, one of the largest
    textureUrl: "/messier/m22.jpg",
    rotationAngle: 0,
    description: "M22 is one of the nearest and brightest globular clusters, located just 10,400 light-years away in Sagittarius near the galactic bulge. It was one of the first globulars discovered (1665) and contains around 70,000 stars. M22 is notable for containing two stellar-mass black holes, the first ever found in a globular cluster.",
    telescope: "HST",
    category: "messier",
  },
];

/**
 * Get a deep field by ID.
 */
export function getDeepFieldById(id: string): DeepField | undefined {
  return DEEP_FIELD_DATA.find(df => df.id === id);
}
