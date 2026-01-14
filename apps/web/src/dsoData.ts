/**
 * Deep Sky Object (DSO) data for rendering and info popups.
 * Includes galaxies, nebulae, and star clusters.
 */

export type DSOType =
  | "galaxy"
  | "emission_nebula"
  | "planetary_nebula"
  | "reflection_nebula"
  | "dark_nebula"
  | "globular_cluster"
  | "open_cluster";

export interface DSO {
  id: string; // Catalog ID (e.g., "M31", "NGC 224")
  name: string; // Common name
  type: DSOType;
  ra: number; // Right ascension in degrees
  dec: number; // Declination in degrees
  magnitude: number; // Total/integrated magnitude
  sizeArcmin: [number, number]; // Major, minor axis in arcminutes
  positionAngle: number; // Orientation in degrees (N through E)
  distance: string; // Distance as string
  description: string;
}

/**
 * Colors for each DSO type (used in rendering)
 */
export const DSO_COLORS: Record<DSOType, string> = {
  galaxy: "#ffe4b5", // Warm yellow-white
  emission_nebula: "#ff6b8a", // Pinkish-red (H-alpha)
  planetary_nebula: "#88ddff", // Cyan-blue
  reflection_nebula: "#6699ff", // Blue
  dark_nebula: "#1a1a2e", // Very dark
  globular_cluster: "#ffdd88", // Golden
  open_cluster: "#aaccff", // Light blue-white
};

/**
 * Catalog of prominent deep sky objects visible to naked eye or binoculars.
 */
export const DSO_DATA: DSO[] = [
  // ============================================
  // GALAXIES
  // ============================================
  {
    id: "M31",
    name: "Andromeda Galaxy",
    type: "galaxy",
    ra: 10.68,
    dec: 41.27,
    magnitude: 3.4,
    sizeArcmin: [190, 60],
    positionAngle: 35,
    distance: "2.5 million light-years",
    description:
      "The nearest major galaxy to the Milky Way and the most distant object visible to the naked eye. Andromeda contains roughly one trillion stars and is on a collision course with our galaxy, expected to merge in about 4.5 billion years. Under dark skies, it appears as an elongated fuzzy patch.",
  },
  {
    id: "M33",
    name: "Triangulum Galaxy",
    type: "galaxy",
    ra: 23.46,
    dec: 30.66,
    magnitude: 5.7,
    sizeArcmin: [73, 45],
    positionAngle: 22,
    distance: "2.7 million light-years",
    description:
      "The third-largest galaxy in the Local Group after Andromeda and the Milky Way. This face-on spiral is challenging to see with the naked eye but reveals beautiful spiral structure in photographs. It contains the enormous star-forming region NGC 604.",
  },
  {
    id: "LMC",
    name: "Large Magellanic Cloud",
    type: "galaxy",
    ra: 80.89,
    dec: -69.76,
    magnitude: 0.9,
    sizeArcmin: [642, 552],
    positionAngle: 0,
    distance: "160,000 light-years",
    description:
      "A satellite galaxy of the Milky Way, visible from the Southern Hemisphere as a prominent fuzzy patch. The LMC hosted Supernova 1987A, the closest observed supernova since Kepler's in 1604. It contains the spectacular Tarantula Nebula.",
  },
  {
    id: "SMC",
    name: "Small Magellanic Cloud",
    type: "galaxy",
    ra: 13.19,
    dec: -72.83,
    magnitude: 2.7,
    sizeArcmin: [318, 198],
    positionAngle: 45,
    distance: "200,000 light-years",
    description:
      "The smaller companion to the Large Magellanic Cloud, also a satellite of the Milky Way. It appears as a detached piece of the Milky Way to Southern Hemisphere observers. The SMC is being gravitationally disrupted by the Milky Way.",
  },
  {
    id: "M81",
    name: "Bode's Galaxy",
    type: "galaxy",
    ra: 148.89,
    dec: 69.07,
    magnitude: 6.9,
    sizeArcmin: [27, 14],
    positionAngle: 157,
    distance: "12 million light-years",
    description:
      "A grand design spiral galaxy in Ursa Major, often photographed alongside its companion M82. Its spiral arms are sites of active star formation, triggered by gravitational interaction with M82 about 300 million years ago.",
  },
  {
    id: "M82",
    name: "Cigar Galaxy",
    type: "galaxy",
    ra: 148.97,
    dec: 69.68,
    magnitude: 8.4,
    sizeArcmin: [11, 5],
    positionAngle: 65,
    distance: "12 million light-years",
    description:
      "A starburst galaxy five times more luminous than the entire Milky Way in infrared. The close encounter with M81 triggered intense star formation. Red filaments of hydrogen gas can be seen extending perpendicular to the disk.",
  },

  // ============================================
  // EMISSION NEBULAE
  // ============================================
  {
    id: "M42",
    name: "Orion Nebula",
    type: "emission_nebula",
    ra: 83.82,
    dec: -5.39,
    magnitude: 4.0,
    sizeArcmin: [85, 60],
    positionAngle: 0,
    distance: "1,344 light-years",
    description:
      "The brightest nebula in the sky and one of the most photographed objects in astronomy. Visible to the naked eye as the fuzzy middle 'star' in Orion's sword. This stellar nursery contains the Trapezium, a tight cluster of hot young stars whose radiation illuminates the surrounding gas.",
  },
  {
    id: "M8",
    name: "Lagoon Nebula",
    type: "emission_nebula",
    ra: 270.92,
    dec: -24.38,
    magnitude: 6.0,
    sizeArcmin: [90, 40],
    positionAngle: 0,
    distance: "5,200 light-years",
    description:
      "One of the finest nebulae in the summer Milky Way, visible to the naked eye as a bright patch in Sagittarius. The dark lane that gives it its name divides the nebula. At its heart lies the Hourglass Nebula and the young open cluster NGC 6530.",
  },
  {
    id: "M17",
    name: "Omega Nebula",
    type: "emission_nebula",
    ra: 275.20,
    dec: -16.17,
    magnitude: 6.0,
    sizeArcmin: [46, 37],
    positionAngle: 0,
    distance: "5,500 light-years",
    description:
      "Also known as the Swan Nebula or Checkmark Nebula due to its distinctive shape. One of the brightest star-forming regions in our galaxy, containing enough gas to form about 10,000 stars. The visible nebula is just the illuminated edge of a much larger molecular cloud.",
  },
  {
    id: "M20",
    name: "Trifid Nebula",
    type: "emission_nebula",
    ra: 270.60,
    dec: -23.03,
    magnitude: 6.3,
    sizeArcmin: [28, 28],
    positionAngle: 0,
    distance: "5,200 light-years",
    description:
      "A striking combination of emission (red), reflection (blue), and dark nebulae divided by dark dust lanes into three lobes. Located near the Lagoon Nebula in Sagittarius. The central star illuminating the nebula is only about 300,000 years old.",
  },
  {
    id: "NGC7000",
    name: "North America Nebula",
    type: "emission_nebula",
    ra: 314.68,
    dec: 44.53,
    magnitude: 4.0,
    sizeArcmin: [120, 100],
    positionAngle: 0,
    distance: "2,600 light-years",
    description:
      "A large emission nebula near Deneb whose shape remarkably resembles the continent of North America. Despite its brightness, its large size makes it challenging to see visually. Best observed with binoculars or wide-field telescopes under dark skies.",
  },
  {
    id: "IC1396",
    name: "Elephant Trunk Nebula",
    type: "emission_nebula",
    ra: 324.75,
    dec: 57.50,
    magnitude: 3.5,
    sizeArcmin: [170, 140],
    positionAngle: 0,
    distance: "2,400 light-years",
    description:
      "A massive star-forming region in Cepheus spanning nearly 3 degrees. The 'Elephant Trunk' is a dense pillar of gas and dust being compressed and illuminated by nearby hot stars. The entire complex is one of the largest HII regions in the northern sky.",
  },

  // ============================================
  // PLANETARY NEBULAE
  // ============================================
  {
    id: "M57",
    name: "Ring Nebula",
    type: "planetary_nebula",
    ra: 283.40,
    dec: 33.03,
    magnitude: 8.8,
    sizeArcmin: [1.4, 1.0],
    positionAngle: 0,
    distance: "2,300 light-years",
    description:
      "The most famous planetary nebula, appearing as a small luminous ring in Lyra between the stars Sulafat and Sheliak. The ring is actually a barrel-shaped shell of glowing gas ejected by a dying star. The central white dwarf is magnitude 15.",
  },
  {
    id: "M27",
    name: "Dumbbell Nebula",
    type: "planetary_nebula",
    ra: 299.90,
    dec: 22.72,
    magnitude: 7.5,
    sizeArcmin: [8, 6],
    positionAngle: 0,
    distance: "1,360 light-years",
    description:
      "The first planetary nebula ever discovered (by Charles Messier in 1764). Its distinctive apple-core or dumbbell shape is visible in small telescopes. The central star was one of the first white dwarfs identified.",
  },
  {
    id: "NGC7293",
    name: "Helix Nebula",
    type: "planetary_nebula",
    ra: 337.41,
    dec: -20.84,
    magnitude: 7.6,
    sizeArcmin: [25, 25],
    positionAngle: 0,
    distance: "650 light-years",
    description:
      "One of the closest planetary nebulae and appears as one of the largest in angular size. Sometimes called the 'Eye of God' due to its appearance in photographs. Despite its apparent size, it's challenging to observe due to low surface brightness.",
  },

  // ============================================
  // GLOBULAR CLUSTERS
  // ============================================
  {
    id: "NGC5139",
    name: "Omega Centauri",
    type: "globular_cluster",
    ra: 201.70,
    dec: -47.48,
    magnitude: 3.9,
    sizeArcmin: [55, 55],
    positionAngle: 0,
    distance: "17,000 light-years",
    description:
      "The largest and brightest globular cluster visible from Earth, containing about 10 million stars. Easily visible to the naked eye from southern latitudes. May be the remnant core of a dwarf galaxy absorbed by the Milky Way, as it contains stars of different ages and metallicities.",
  },
  {
    id: "NGC104",
    name: "47 Tucanae",
    type: "globular_cluster",
    ra: 6.02,
    dec: -72.08,
    magnitude: 4.0,
    sizeArcmin: [50, 50],
    positionAngle: 0,
    distance: "16,000 light-years",
    description:
      "The second-brightest globular cluster after Omega Centauri, appearing near the Small Magellanic Cloud but much closer to us. Its dense core contains over 1 million stars packed into a relatively small volume. Visible to the naked eye as a fuzzy star.",
  },
  {
    id: "M13",
    name: "Great Hercules Cluster",
    type: "globular_cluster",
    ra: 250.42,
    dec: 36.46,
    magnitude: 5.8,
    sizeArcmin: [20, 20],
    positionAngle: 0,
    distance: "22,000 light-years",
    description:
      "The finest globular cluster visible from northern latitudes, containing about 300,000 stars. Visible to the naked eye under dark skies as a fuzzy star in Hercules. In 1974, the Arecibo message was transmitted toward M13 as an experiment in contacting extraterrestrial intelligence.",
  },
  {
    id: "M22",
    name: "Sagittarius Cluster",
    type: "globular_cluster",
    ra: 279.10,
    dec: -23.90,
    magnitude: 5.1,
    sizeArcmin: [32, 32],
    positionAngle: 0,
    distance: "10,000 light-years",
    description:
      "One of the nearest globular clusters and among the brightest in the sky. Located in the rich Sagittarius star clouds near the galactic center. M22 was one of the first globulars to have its individual stars resolved.",
  },
  {
    id: "M5",
    name: "Rose Cluster",
    type: "globular_cluster",
    ra: 229.64,
    dec: 2.08,
    magnitude: 5.7,
    sizeArcmin: [23, 23],
    positionAngle: 0,
    distance: "24,500 light-years",
    description:
      "One of the largest and oldest globular clusters known, estimated at 13 billion years old. Contains over 100,000 stars and numerous variable stars. Under excellent conditions, it can be glimpsed with the naked eye.",
  },

  // ============================================
  // OPEN CLUSTERS
  // ============================================
  {
    id: "M45",
    name: "Pleiades",
    type: "open_cluster",
    ra: 56.87,
    dec: 24.12,
    magnitude: 1.6,
    sizeArcmin: [110, 110],
    positionAngle: 0,
    distance: "444 light-years",
    description:
      "The most famous open cluster, known since antiquity as the Seven Sisters. Most people can see 6-7 stars with the naked eye, though the cluster contains over 1,000 members. Long-exposure photographs reveal beautiful blue reflection nebulosity surrounding the brightest stars.",
  },
  {
    id: "M44",
    name: "Beehive Cluster",
    type: "open_cluster",
    ra: 130.10,
    dec: 19.67,
    magnitude: 3.1,
    sizeArcmin: [95, 95],
    positionAngle: 0,
    distance: "610 light-years",
    description:
      "Also known as Praesepe (Latin for 'manger'), this large open cluster in Cancer is visible to the naked eye as a fuzzy patch. Ancient observers used its visibility as a weather predictor. The cluster is about 600 million years old and shares a common origin with the Hyades.",
  },
  {
    id: "Mel25",
    name: "Hyades",
    type: "open_cluster",
    ra: 66.75,
    dec: 15.87,
    magnitude: 0.5,
    sizeArcmin: [330, 330],
    positionAngle: 0,
    distance: "153 light-years",
    description:
      "The nearest open cluster to Earth and one of the best-studied. Its stars form the distinctive V-shape of the Bull's face in Taurus, though the bright orange star Aldebaran is not a member but lies in the foreground. The cluster is about 625 million years old.",
  },
  {
    id: "M7",
    name: "Ptolemy Cluster",
    type: "open_cluster",
    ra: 268.47,
    dec: -34.79,
    magnitude: 3.3,
    sizeArcmin: [80, 80],
    positionAngle: 0,
    distance: "980 light-years",
    description:
      "A bright open cluster in Scorpius known since antiquity, mentioned by Ptolemy in 130 AD. Contains about 80 stars brighter than magnitude 10. Best viewed from southern latitudes where it appears high in the winter sky.",
  },
  {
    id: "NGC869",
    name: "Double Cluster (h Persei)",
    type: "open_cluster",
    ra: 34.75,
    dec: 57.13,
    magnitude: 4.3,
    sizeArcmin: [30, 30],
    positionAngle: 0,
    distance: "7,500 light-years",
    description:
      "Half of the famous Double Cluster in Perseus, visible to the naked eye as a fuzzy patch between Perseus and Cassiopeia. Together with its neighbor NGC 884, they form one of the finest binocular objects in the sky. Both clusters are young, only about 13 million years old.",
  },
  {
    id: "NGC884",
    name: "Double Cluster (Chi Persei)",
    type: "open_cluster",
    ra: 35.60,
    dec: 57.15,
    magnitude: 4.4,
    sizeArcmin: [30, 30],
    positionAngle: 0,
    distance: "7,500 light-years",
    description:
      "The eastern component of the Double Cluster, slightly younger than its companion. The two clusters are physically associated and moving through space together. Both contain numerous red supergiant stars, giving them a distinctive appearance in photographs.",
  },

  // ============================================
  // DARK NEBULAE
  // ============================================
  {
    id: "Coalsack",
    name: "Coalsack Nebula",
    type: "dark_nebula",
    ra: 192.00,
    dec: -63.00,
    magnitude: 99, // Not applicable - use high value to hide
    sizeArcmin: [420, 300],
    positionAngle: 0,
    distance: "600 light-years",
    description:
      "The most prominent dark nebula in the sky, appearing as a striking dark patch against the bright southern Milky Way near the Southern Cross. Known to many cultures as a celestial landmark. The dust blocks light from more distant stars.",
  },
];

/**
 * Get DSOs that should be visible at a given magnitude limit.
 * Uses surface brightness calculation to determine visibility.
 */
export function getVisibleDSOs(magLimit: number): DSO[] {
  return DSO_DATA.filter((dso) => {
    // Dark nebulae are always "visible" (as dark patches) when mag limit allows seeing surrounding stars
    if (dso.type === "dark_nebula") {
      return magLimit >= 4.5;
    }

    // For extended objects, calculate approximate surface brightness
    // Surface brightness (mag/arcmin²) = mag + 2.5 * log10(area)
    const areaArcmin2 = Math.PI * (dso.sizeArcmin[0] / 2) * (dso.sizeArcmin[1] / 2);
    const surfaceBrightness = dso.magnitude + 2.5 * Math.log10(areaArcmin2);

    // Visibility threshold: surface brightness must be brighter than ~4 mag above limit
    // This is a rough approximation of detectability
    return surfaceBrightness < magLimit + 4;
  });
}
