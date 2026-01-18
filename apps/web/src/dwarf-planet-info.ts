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
  "Ixion": {
    name: "Ixion",
    designation: "28978 Ixion",
    type: "Trans-Neptunian Object (Plutino)",
    diameter: "617 km",
    orbitalPeriod: "250 years",
    distance: "30-49 AU",
    moons: "None known",
    discoveredYear: "2001",
    description: "A moderately red plutino with a surface likely covered in organic compounds called tholins. Named after the Greek mythological figure condemned to spin eternally on a wheel of fire, it shares Pluto's 3:2 orbital resonance with Neptune."
  },
  "Huya": {
    name: "Huya",
    designation: "38628 Huya",
    type: "Trans-Neptunian Object (Plutino)",
    diameter: "406 km",
    orbitalPeriod: "250 years",
    distance: "29-50 AU",
    moons: "1",
    discoveredYear: "2000",
    description: "A plutino discovered on the March equinox, named after Juy\u00e1, the rain god of the Wayuu people of Venezuela and Colombia. Its surface appears relatively neutral in color compared to other trans-Neptunian objects."
  },
  "Chaos": {
    name: "Chaos",
    designation: "19521 Chaos",
    type: "Trans-Neptunian Object (Cubewano)",
    diameter: "~600 km",
    orbitalPeriod: "309 years",
    distance: "41-51 AU",
    moons: "None known",
    discoveredYear: "1998",
    description: "Named after the primordial void in Greek mythology from which the first gods emerged. Chaos was among the earlier trans-Neptunian objects discovered during systematic surveys of the outer solar system."
  },
  "Salacia": {
    name: "Salacia",
    designation: "120347 Salacia",
    type: "Trans-Neptunian Object (Cubewano)",
    diameter: "854 km",
    orbitalPeriod: "274 years",
    distance: "38-47 AU",
    moons: "1 (Actaea)",
    discoveredYear: "2004",
    description: "A large binary trans-Neptunian object named after the Roman goddess of the sea. Unusually dark for its size, suggesting a carbon-rich surface. Its moon Actaea is named after a sea nymph in Greek mythology."
  },
  "Varda": {
    name: "Varda",
    designation: "174567 Varda",
    type: "Trans-Neptunian Object (Cubewano)",
    diameter: "792 km",
    orbitalPeriod: "313 years",
    distance: "40-52 AU",
    moons: "1 (Ilmar\u00eb)",
    discoveredYear: "2003",
    description: "Named after the queen of the Valar in Tolkien's legendarium, who created the stars. Varda and its moon Ilmar\u00eb form a binary system where the moon is about half the size of the primary, similar to Pluto-Charon."
  }
};
