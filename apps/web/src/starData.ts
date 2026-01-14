/**
 * Data about famous/major stars for the info popup.
 * Keyed by HR (Harvard Revised / Bright Star Catalog) number.
 */

export interface StarInfo {
  name: string;
  designation: string; // Bayer designation (e.g., "Alpha Canis Majoris")
  constellation: string;
  type: string; // Spectral classification and description
  magnitude: number; // Apparent visual magnitude
  distance: string; // Distance in light-years
  description: string; // Interesting facts
  ra: number; // Right ascension in degrees
  dec: number; // Declination in degrees
}

export const STAR_DATA: Record<number, StarInfo> = {
  // Sirius - HR 2491
  2491: {
    name: "Sirius",
    designation: "Alpha Canis Majoris",
    constellation: "Canis Major",
    type: "A1V - White main-sequence star",
    magnitude: -1.46,
    distance: "8.6 light-years",
    description:
      "The brightest star in the night sky. Sirius is actually a binary system - the bright primary (Sirius A) is orbited by a white dwarf companion (Sirius B), sometimes called 'The Pup'. Ancient Egyptians based their calendar on its heliacal rising, which signaled the annual flooding of the Nile.",
    ra: 101.29,
    dec: -16.72,
  },

  // Canopus - HR 2326
  2326: {
    name: "Canopus",
    designation: "Alpha Carinae",
    constellation: "Carina",
    type: "A9II - White-yellow bright giant",
    magnitude: -0.72,
    distance: "310 light-years",
    description:
      "The second-brightest star in the night sky. Named after the navigator of the Greek fleet during the Trojan War. Due to its brightness and position far from the galactic plane, Canopus is used as a reference point for spacecraft navigation systems.",
    ra: 95.99,
    dec: -52.70,
  },

  // Arcturus - HR 5340
  5340: {
    name: "Arcturus",
    designation: "Alpha Bootis",
    constellation: "Bootes",
    type: "K1.5III - Orange giant",
    magnitude: -0.05,
    distance: "37 light-years",
    description:
      "The brightest star in the northern celestial hemisphere. An aging red giant about 25 times the Sun's diameter. Its light was used to open the 1933 Chicago World's Fair - the photons that triggered the switch had left Arcturus 40 years earlier, during the previous Chicago fair in 1893.",
    ra: 213.92,
    dec: 19.18,
  },

  // Vega - HR 7001
  7001: {
    name: "Vega",
    designation: "Alpha Lyrae",
    constellation: "Lyra",
    type: "A0V - White main-sequence star",
    magnitude: 0.03,
    distance: "25 light-years",
    description:
      "One of the most studied stars in astronomy, Vega was the first star (other than the Sun) to be photographed. It was the northern pole star around 12,000 BCE and will be again around 13,700 CE. Vega rotates so rapidly that it bulges noticeably at its equator.",
    ra: 279.23,
    dec: 38.78,
  },

  // Capella - HR 1708
  1708: {
    name: "Capella",
    designation: "Alpha Aurigae",
    constellation: "Auriga",
    type: "G3III + G0III - Yellow giant binary",
    magnitude: 0.08,
    distance: "43 light-years",
    description:
      "Actually a system of four stars - two large yellow giants orbiting each other, plus two distant red dwarfs. The two primary giants are both about 2.5 times the Sun's mass and 10 times its diameter. The name means 'little she-goat' in Latin.",
    ra: 79.17,
    dec: 45.99,
  },

  // Rigel - HR 1713
  1713: {
    name: "Rigel",
    designation: "Beta Orionis",
    constellation: "Orion",
    type: "B8Ia - Blue supergiant",
    magnitude: 0.13,
    distance: "860 light-years",
    description:
      "A blue supergiant that is one of the most luminous stars known, shining with about 120,000 times the Sun's luminosity. Despite its 'beta' designation, it's usually brighter than Betelgeuse (alpha). Rigel is only about 8 million years old but has already exhausted its core hydrogen.",
    ra: 78.63,
    dec: -8.20,
  },

  // Procyon - HR 2943
  2943: {
    name: "Procyon",
    designation: "Alpha Canis Minoris",
    constellation: "Canis Minor",
    type: "F5IV-V - Yellow-white subgiant",
    magnitude: 0.34,
    distance: "11.5 light-years",
    description:
      "One of our nearest stellar neighbors. Like Sirius, Procyon has a white dwarf companion. The name means 'before the dog' in Greek, as it rises just before Sirius (the Dog Star). Procyon is nearing the end of its main-sequence life and beginning to expand.",
    ra: 114.83,
    dec: 5.22,
  },

  // Betelgeuse - HR 2061
  2061: {
    name: "Betelgeuse",
    designation: "Alpha Orionis",
    constellation: "Orion",
    type: "M1-2Ia-ab - Red supergiant",
    magnitude: 0.42,
    distance: "700 light-years",
    description:
      "One of the largest stars visible to the naked eye - if placed at the Sun's position, its surface would extend past Mars's orbit. Betelgeuse is a semi-regular variable star and is expected to explode as a supernova within the next 100,000 years. In late 2019, it underwent an unusual dimming event.",
    ra: 88.79,
    dec: 7.41,
  },

  // Altair - HR 7557
  7557: {
    name: "Altair",
    designation: "Alpha Aquilae",
    constellation: "Aquila",
    type: "A7V - White main-sequence star",
    magnitude: 0.76,
    distance: "17 light-years",
    description:
      "One of the closest stars visible to the naked eye. Altair rotates incredibly fast - completing a rotation every 9 hours (compared to the Sun's 25 days), causing it to be noticeably flattened at the poles. Part of the 'Summer Triangle' asterism along with Vega and Deneb.",
    ra: 297.70,
    dec: 8.87,
  },

  // Aldebaran - HR 1457
  1457: {
    name: "Aldebaran",
    designation: "Alpha Tauri",
    constellation: "Taurus",
    type: "K5III - Orange giant",
    magnitude: 0.85,
    distance: "65 light-years",
    description:
      "The 'Eye of the Bull' in Taurus. An aging giant star about 44 times the Sun's diameter. Although it appears to be part of the Hyades star cluster, Aldebaran is actually much closer to us - a foreground star that just happens to lie in the same direction.",
    ra: 68.98,
    dec: 16.51,
  },

  // Spica - HR 5056
  5056: {
    name: "Spica",
    designation: "Alpha Virginis",
    constellation: "Virgo",
    type: "B1III-IV - Blue subgiant binary",
    magnitude: 0.97,
    distance: "250 light-years",
    description:
      "A close binary system where both stars are distorted into egg shapes by their mutual gravitational pull. The primary is one of the nearest massive stars to the Sun. Spica marks the 'ear of wheat' held by the Virgin in classical depictions of Virgo.",
    ra: 201.30,
    dec: -11.16,
  },

  // Antares - HR 6134
  6134: {
    name: "Antares",
    designation: "Alpha Scorpii",
    constellation: "Scorpius",
    type: "M1.5Iab-b - Red supergiant",
    magnitude: 1.06,
    distance: "550 light-years",
    description:
      "The 'Heart of the Scorpion', named 'rival of Mars' (Anti-Ares) due to its red color. A massive supergiant about 700 times the Sun's diameter. If placed at the Sun's position, its surface would extend between Mars and Jupiter. Antares has a blue companion star.",
    ra: 247.35,
    dec: -26.43,
  },

  // Pollux - HR 2990
  2990: {
    name: "Pollux",
    designation: "Beta Geminorum",
    constellation: "Gemini",
    type: "K0III - Orange giant",
    magnitude: 1.14,
    distance: "34 light-years",
    description:
      "The brighter of the 'Twins' in Gemini (despite its beta designation). An orange giant about 9 times the Sun's diameter. In 2006, an exoplanet was confirmed orbiting Pollux - one of the first planets discovered around a giant star.",
    ra: 116.33,
    dec: 28.03,
  },

  // Fomalhaut - HR 8728
  8728: {
    name: "Fomalhaut",
    designation: "Alpha Piscis Austrini",
    constellation: "Piscis Austrinus",
    type: "A4V - White main-sequence star",
    magnitude: 1.16,
    distance: "25 light-years",
    description:
      "Known as the 'Loneliest Star' because of its isolated position in the autumn sky. Fomalhaut is surrounded by a prominent debris disk, and in 2008 the Hubble Space Telescope directly imaged what appeared to be an exoplanet - one of the first such direct observations.",
    ra: 344.41,
    dec: -29.62,
  },

  // Deneb - HR 7924
  7924: {
    name: "Deneb",
    designation: "Alpha Cygni",
    constellation: "Cygnus",
    type: "A2Ia - White supergiant",
    magnitude: 1.25,
    distance: "2,600 light-years",
    description:
      "One of the most luminous stars known, shining with over 200,000 times the Sun's luminosity. Despite being about 100 times farther than most bright stars, Deneb still appears among the 20 brightest. It marks the tail of Cygnus the Swan and is part of the Summer Triangle.",
    ra: 310.36,
    dec: 45.28,
  },

  // Regulus - HR 3982
  3982: {
    name: "Regulus",
    designation: "Alpha Leonis",
    constellation: "Leo",
    type: "B8IVn - Blue-white subgiant",
    magnitude: 1.36,
    distance: "79 light-years",
    description:
      "The 'Heart of the Lion' and one of the stars that lies almost exactly on the ecliptic, meaning it's regularly occulted by the Moon. Regulus spins so fast (completing a rotation every 16 hours) that it's significantly flattened and would fly apart if it rotated just 16% faster.",
    ra: 152.09,
    dec: 11.97,
  },

  // Castor - HR 2891
  2891: {
    name: "Castor",
    designation: "Alpha Geminorum",
    constellation: "Gemini",
    type: "A1V + A2Vm - White binary (sextuple system)",
    magnitude: 1.58,
    distance: "52 light-years",
    description:
      "One of the most complex stellar systems known - six stars orbiting in three pairs. Through a telescope, two bright white stars are visible, but each of those is a spectroscopic binary, and a distant red dwarf pair completes the sextuple system.",
    ra: 113.65,
    dec: 31.89,
  },

  // Mizar - HR 5054
  5054: {
    name: "Mizar",
    designation: "Zeta Ursae Majoris",
    constellation: "Ursa Major",
    type: "A2V + A1V - White binary",
    magnitude: 2.23,
    distance: "83 light-years",
    description:
      "The middle star in the Big Dipper's handle. Famous as a naked-eye double star with nearby Alcor - traditionally used as an eyesight test. Mizar was the first telescopic double star discovered (1617) and the first spectroscopic binary identified (1889).",
    ra: 200.98,
    dec: 54.93,
  },

  // Polaris - HR 424
  424: {
    name: "Polaris",
    designation: "Alpha Ursae Minoris",
    constellation: "Ursa Minor",
    type: "F7Ib - Yellow-white supergiant",
    magnitude: 1.98,
    distance: "430 light-years",
    description:
      "The current North Star, located less than 1 degree from the north celestial pole. Polaris is actually a triple star system, with the primary being a Cepheid variable - a type of pulsating star historically used to measure cosmic distances. It wasn't always the pole star and won't always be.",
    ra: 37.95,
    dec: 89.26,
  },

  // Rasalhague - HR 6556
  6556: {
    name: "Rasalhague",
    designation: "Alpha Ophiuchi",
    constellation: "Ophiuchus",
    type: "A5III - White giant binary",
    magnitude: 2.08,
    distance: "47 light-years",
    description:
      "The name means 'Head of the Serpent Charmer' in Arabic. A binary system with a rapidly rotating primary star that completes a rotation every 8.5 hours, giving it a noticeably oblate shape. Ophiuchus is the 13th zodiacal constellation, though not part of traditional astrology.",
    ra: 263.73,
    dec: 12.56,
  },
};
