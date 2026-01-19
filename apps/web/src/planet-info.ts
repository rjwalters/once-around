/**
 * Planet and major body information for info modals.
 */

export interface PlanetInfo {
  name: string;
  type: string;
  diameter: string;
  distance: string;
  orbitalPeriod: string;
  rotationPeriod: string;
  moons: string;
  description: string;
}

// Body indices: Sun=0, Moon=1, Mercury=2, Venus=3, Mars=4, Jupiter=5, Saturn=6, Uranus=7, Neptune=8
export const PLANET_INFO: Record<string, PlanetInfo> = {
  "Sun": {
    name: "Sun",
    type: "G-type Star",
    diameter: "1,392,700 km",
    distance: "1 AU (149.6M km)",
    orbitalPeriod: "N/A",
    rotationPeriod: "25 days (equator)",
    moons: "8 planets",
    description: "Our Sun is a yellow dwarf star at the center of the Solar System. It contains 99.86% of the system's mass and provides the light and heat that makes life on Earth possible. The Sun is about 4.6 billion years old and will continue to burn hydrogen for another 5 billion years."
  },
  "Moon": {
    name: "Moon",
    type: "Natural Satellite",
    diameter: "3,474 km",
    distance: "384,400 km",
    orbitalPeriod: "27.3 days",
    rotationPeriod: "27.3 days (tidally locked)",
    moons: "N/A",
    description: "Earth's only natural satellite, the Moon is the fifth largest moon in the Solar System. It's the only celestial body beyond Earth that humans have visited. The Moon's gravitational influence produces Earth's tides and has stabilized our planet's axial tilt over billions of years."
  },
  "Mercury": {
    name: "Mercury",
    type: "Terrestrial Planet",
    diameter: "4,879 km",
    distance: "0.39 AU",
    orbitalPeriod: "88 days",
    rotationPeriod: "59 days",
    moons: "0",
    description: "The smallest planet and closest to the Sun, Mercury has extreme temperature variations from -180°C at night to 430°C during the day. Despite being nearest to the Sun, it's not the hottest planet—Venus holds that record due to its thick atmosphere."
  },
  "Venus": {
    name: "Venus",
    type: "Terrestrial Planet",
    diameter: "12,104 km",
    distance: "0.72 AU",
    orbitalPeriod: "225 days",
    rotationPeriod: "243 days (retrograde)",
    moons: "0",
    description: "Often called Earth's twin due to similar size, Venus has a thick toxic atmosphere creating a runaway greenhouse effect with surface temperatures of 465°C. It rotates backwards compared to most planets. Venus is the brightest natural object in Earth's sky after the Sun and Moon."
  },
  "Mars": {
    name: "Mars",
    type: "Terrestrial Planet",
    diameter: "6,779 km",
    distance: "1.52 AU",
    orbitalPeriod: "687 days",
    rotationPeriod: "24.6 hours",
    moons: "2 (Phobos, Deimos)",
    description: "The Red Planet gets its color from iron oxide on its surface. Mars has the largest volcano (Olympus Mons) and canyon system (Valles Marineris) in the Solar System. Evidence suggests Mars once had liquid water, making it a prime target in the search for past life."
  },
  "Jupiter": {
    name: "Jupiter",
    type: "Gas Giant",
    diameter: "139,820 km",
    distance: "5.2 AU",
    orbitalPeriod: "11.9 years",
    rotationPeriod: "9.9 hours",
    moons: "95 known",
    description: "The largest planet, Jupiter could fit all other planets inside it twice over. Its Great Red Spot is a storm larger than Earth that has raged for centuries. Jupiter's four largest moons—Io, Europa, Ganymede, and Callisto—were discovered by Galileo in 1610."
  },
  "Saturn": {
    name: "Saturn",
    type: "Gas Giant",
    diameter: "116,460 km",
    distance: "9.5 AU",
    orbitalPeriod: "29.5 years",
    rotationPeriod: "10.7 hours",
    moons: "146 known",
    description: "Famous for its spectacular ring system made of ice and rock, Saturn is the least dense planet—it would float in water. Its moon Titan is larger than Mercury and has a thick atmosphere. The Cassini mission spent 13 years studying this magnificent system."
  },
  "Uranus": {
    name: "Uranus",
    type: "Ice Giant",
    diameter: "50,724 km",
    distance: "19.2 AU",
    orbitalPeriod: "84 years",
    rotationPeriod: "17.2 hours (retrograde)",
    moons: "28 known",
    description: "Uranus rotates on its side, likely due to a massive ancient collision. It was the first planet discovered with a telescope (by William Herschel in 1781). Its blue-green color comes from methane in its atmosphere. Uranus has faint rings and 28 known moons."
  },
  "Neptune": {
    name: "Neptune",
    type: "Ice Giant",
    diameter: "49,244 km",
    distance: "30.1 AU",
    orbitalPeriod: "165 years",
    rotationPeriod: "16.1 hours",
    moons: "16 known",
    description: "The windiest planet with speeds up to 2,100 km/h, Neptune was the first planet located through mathematical prediction rather than observation. Its largest moon Triton orbits backwards and is likely a captured Kuiper Belt object. Neptune has only been visited once, by Voyager 2 in 1989."
  }
};
