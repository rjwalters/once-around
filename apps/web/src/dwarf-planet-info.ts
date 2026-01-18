/**
 * Information about dwarf planets and trans-Neptunian objects.
 */

export interface DwarfPlanetInfo {
  name: string;
  designation: string;
  type: string;
  diameter: string;
  orbitalPeriod: string;
  distance: string;
  moons: string;
  discoveredYear: string;
  description: string;
}

export const DWARF_PLANET_INFO: Record<string, DwarfPlanetInfo> = {
  "Pluto": {
    name: "Pluto",
    designation: "134340 Pluto",
    type: "Dwarf Planet (Plutino)",
    diameter: "2,377 km",
    orbitalPeriod: "248 years",
    distance: "30-49 AU",
    moons: "5 (Charon, Nix, Hydra, Kerberos, Styx)",
    discoveredYear: "1930",
    description: "Once considered the ninth planet, Pluto was reclassified as a dwarf planet in 2006. NASA's New Horizons mission revealed a world with nitrogen glaciers, mountain ranges, and a thin atmosphere. Its largest moon Charon is so large that the two form a binary system."
  },
  "Ceres": {
    name: "Ceres",
    designation: "1 Ceres",
    type: "Dwarf Planet (Asteroid Belt)",
    diameter: "939 km",
    orbitalPeriod: "4.6 years",
    distance: "2.6-3.0 AU",
    moons: "None",
    discoveredYear: "1801",
    description: "The largest object in the asteroid belt and the only dwarf planet in the inner solar system. NASA's Dawn mission discovered bright salt deposits in craters, suggesting a subsurface ocean may have existed. Ceres contains about a third of the asteroid belt's total mass."
  },
  "Eris": {
    name: "Eris",
    designation: "136199 Eris",
    type: "Dwarf Planet (Scattered Disc)",
    diameter: "2,326 km",
    orbitalPeriod: "559 years",
    distance: "38-98 AU",
    moons: "1 (Dysnomia)",
    discoveredYear: "2005",
    description: "The most massive known dwarf planet, Eris is slightly smaller but more massive than Pluto. Its discovery sparked the debate that led to Pluto's reclassification. Named after the Greek goddess of discord, it has a highly inclined and eccentric orbit."
  },
  "Makemake": {
    name: "Makemake",
    designation: "136472 Makemake",
    type: "Dwarf Planet (Cubewano)",
    diameter: "1,430 km",
    orbitalPeriod: "306 years",
    distance: "38-53 AU",
    moons: "1 (MK2)",
    discoveredYear: "2005",
    description: "The second-brightest Kuiper belt object after Pluto. Its surface is covered in frozen methane, ethane, and nitrogen, giving it a reddish-brown color. Named after the Rapa Nui creator god, it was discovered shortly after Easter 2005."
  },
  "Haumea": {
    name: "Haumea",
    designation: "136108 Haumea",
    type: "Dwarf Planet (Cubewano)",
    diameter: "1,632 km (longest axis)",
    orbitalPeriod: "285 years",
    distance: "35-51 AU",
    moons: "2 (Hi'iaka, Namaka) + ring",
    discoveredYear: "2004",
    description: "A uniquely elongated dwarf planet that rotates every 4 hours, the fastest spin of any known large body. This rapid rotation has stretched it into an ellipsoid shape. It has a ring system and a family of icy fragments from an ancient collision."
  },
  "Sedna": {
    name: "Sedna",
    designation: "90377 Sedna",
    type: "Extreme Trans-Neptunian Object",
    diameter: "~1,000 km",
    orbitalPeriod: "~11,400 years",
    distance: "76-937 AU",
    moons: "Unknown",
    discoveredYear: "2003",
    description: "One of the most distant known objects in the solar system, Sedna never comes closer than 76 AU to the Sun. Its extremely elongated orbit suggests it may have been influenced by a passing star or an undiscovered massive planet in the outer solar system."
  },
  "Quaoar": {
    name: "Quaoar",
    designation: "50000 Quaoar",
    type: "Trans-Neptunian Object (Cubewano)",
    diameter: "1,110 km",
    orbitalPeriod: "288 years",
    distance: "42-45 AU",
    moons: "1 (Weywot) + rings",
    discoveredYear: "2002",
    description: "A large Kuiper belt object with a surprisingly distant ring system that defies current understanding of ring formation. Named after the creation deity of the Tongva people of California, it has a moon named after the Tongva sky god."
  },
  "Gonggong": {
    name: "Gonggong",
    designation: "225088 Gonggong",
    type: "Dwarf Planet Candidate (Scattered Disc)",
    diameter: "1,230 km",
    orbitalPeriod: "554 years",
    distance: "34-101 AU",
    moons: "1 (Xiangliu)",
    discoveredYear: "2007",
    description: "One of the largest known trans-Neptunian objects, with a highly inclined orbit. Its red surface suggests methane ice. Named after the Chinese water god who caused floods and chaos, its moon is named after the serpent that attended him."
  },
  "Orcus": {
    name: "Orcus",
    designation: "90482 Orcus",
    type: "Trans-Neptunian Object (Plutino)",
    diameter: "910 km",
    orbitalPeriod: "247 years",
    distance: "30-48 AU",
    moons: "1 (Vanth)",
    discoveredYear: "2004",
    description: "Often called the 'anti-Pluto' because its orbit is almost a mirror image of Pluto's - when Pluto is at perihelion, Orcus is near aphelion. Named after the Etruscan god of the underworld, its large moon Vanth may form a binary system."
  },
  "Varuna": {
    name: "Varuna",
    designation: "20000 Varuna",
    type: "Trans-Neptunian Object (Cubewano)",
    diameter: "668 km",
    orbitalPeriod: "283 years",
    distance: "41-45 AU",
    moons: "None known",
    discoveredYear: "2000",
    description: "One of the first large Kuiper belt objects discovered, Varuna helped establish that the outer solar system contains many substantial bodies. Named after the Hindu deity of water and the celestial ocean, it has a rapid 6.3-hour rotation period."
  },
  "Vesta": {
    name: "Vesta",
    designation: "4 Vesta",
    type: "Asteroid (Main Belt)",
    diameter: "525 km",
    orbitalPeriod: "3.6 years",
    distance: "2.2-2.6 AU",
    moons: "None",
    discoveredYear: "1807",
    description: "The second-largest asteroid and second-most massive object in the asteroid belt. NASA's Dawn spacecraft orbited Vesta in 2011-2012, revealing a differentiated body with an iron core, making it more like a small planet. Its surface shows evidence of ancient lava flows."
  },
  "Pallas": {
    name: "Pallas",
    designation: "2 Pallas",
    type: "Asteroid (Main Belt)",
    diameter: "512 km",
    orbitalPeriod: "4.6 years",
    distance: "2.1-3.4 AU",
    moons: "None",
    discoveredYear: "1802",
    description: "The third-largest asteroid by volume but second by mass. Pallas has an unusually tilted orbit (34°) compared to other large asteroids. Its surface is rich in carbon compounds, giving it a very dark appearance."
  },
  "Hygiea": {
    name: "Hygiea",
    designation: "10 Hygiea",
    type: "Asteroid (Main Belt)",
    diameter: "434 km",
    orbitalPeriod: "5.6 years",
    distance: "2.8-3.5 AU",
    moons: "None",
    discoveredYear: "1849",
    description: "The fourth-largest asteroid and the largest of the dark C-type asteroids. Recent observations suggest Hygiea may be nearly spherical, potentially qualifying it as a dwarf planet. It's the largest member of the Hygiea asteroid family."
  },
  "Apophis": {
    name: "Apophis",
    designation: "99942 Apophis",
    type: "Near-Earth Asteroid (Aten)",
    diameter: "370 m",
    orbitalPeriod: "0.89 years",
    distance: "0.75-1.1 AU",
    moons: "None",
    discoveredYear: "2004",
    description: "A potentially hazardous asteroid that will pass within 31,000 km of Earth on April 13, 2029 - closer than geostationary satellites. Named after the Egyptian god of chaos. Future impacts have been ruled out for at least 100 years."
  },
  "Bennu": {
    name: "Bennu",
    designation: "101955 Bennu",
    type: "Near-Earth Asteroid (Apollo)",
    diameter: "490 m",
    orbitalPeriod: "1.2 years",
    distance: "0.9-1.4 AU",
    moons: "None",
    discoveredYear: "1999",
    description: "A carbon-rich asteroid visited by NASA's OSIRIS-REx mission, which collected samples and returned them to Earth in 2023. Named after the Egyptian deity associated with rebirth. Bennu has a small chance of impacting Earth in the late 2100s."
  }
};
