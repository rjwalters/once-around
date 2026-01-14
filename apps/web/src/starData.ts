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
      "A blue supergiant shining with about 120,000 times the Sun's luminosity. The name comes from Arabic 'rijl' meaning 'foot', marking Orion's left foot. Despite its 'beta' designation, it's usually brighter than Betelgeuse (alpha). Only 8 million years old, Rigel has already exhausted its core hydrogen.",
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
      "One of the largest stars visible to the naked eye - if placed at the Sun's position, its surface would extend past Mars's orbit. The name derives from Arabic 'Ibt al-Jauzāʾ' meaning 'Armpit of Orion', though it was famously mistranscribed over centuries. Betelgeuse is expected to explode as a supernova within the next 100,000 years.",
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
      "One of the closest stars visible to the naked eye. The name comes from Arabic 'al-Ṭāʾir' meaning 'The Flying One', referring to the eagle. Altair rotates incredibly fast - every 9 hours compared to the Sun's 25 days - causing it to be noticeably flattened. Part of the Summer Triangle with Vega and Deneb.",
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
      "The 'Eye of the Bull' in Taurus. The name comes from Arabic 'al-Dabarān' meaning 'The Follower', as it appears to follow the Pleiades star cluster across the sky. Although it appears to be part of the Hyades cluster, Aldebaran is actually much closer - a foreground star in the same direction.",
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
      "One of the most luminous stars known, shining with over 200,000 times the Sun's luminosity. The name is simply Arabic 'dhanab' meaning 'tail' - it marks the tail of Cygnus the Swan. Despite being about 100 times farther than most bright stars, Deneb still appears among the 20 brightest. Part of the Summer Triangle.",
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

  // Bellatrix - HR 1790
  1790: {
    name: "Bellatrix",
    designation: "Gamma Orionis",
    constellation: "Orion",
    type: "B2III - Blue giant",
    magnitude: 1.64,
    distance: "250 light-years",
    description:
      "Orion's left shoulder, forming a rectangle with Betelgeuse, Rigel, and Saiph. The name means 'female warrior' in Latin. Bellatrix is one of the hottest stars visible to the naked eye, with a surface temperature of about 22,000 K - nearly 4 times hotter than the Sun.",
    ra: 81.28,
    dec: 6.35,
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

  // ==========================================
  // First Magnitude Stars (added for constellation coverage)
  // ==========================================

  // Achernar - HR 472
  472: {
    name: "Achernar",
    designation: "Alpha Eridani",
    constellation: "Eridanus",
    type: "B6Vep - Blue main-sequence star",
    magnitude: 0.46,
    distance: "139 light-years",
    description:
      "The ninth-brightest star in the night sky and the brightest in Eridanus, marking the river's end. Achernar is one of the flattest stars known - it rotates so fast (once every 2 days) that its equatorial diameter is 50% larger than its polar diameter. The name means 'End of the River' in Arabic.",
    ra: 24.43,
    dec: -57.24,
  },

  // Acrux - HR 4730
  4730: {
    name: "Acrux",
    designation: "Alpha Crucis",
    constellation: "Crux",
    type: "B0.5IV + B1V - Blue subgiant binary",
    magnitude: 0.76,
    distance: "320 light-years",
    description:
      "The brightest star in the Southern Cross and the southernmost first-magnitude star. Actually a multiple star system with two brilliant blue components orbiting each other. Acrux appears on the flags of Australia, New Zealand, Brazil, Papua New Guinea, and Samoa.",
    ra: 186.65,
    dec: -63.10,
  },

  // ==========================================
  // Second Magnitude Stars
  // ==========================================

  // Alnair - HR 8425
  8425: {
    name: "Alnair",
    designation: "Alpha Gruis",
    constellation: "Grus",
    type: "B7IV - Blue-white subgiant",
    magnitude: 1.74,
    distance: "101 light-years",
    description:
      "The brightest star in Grus, the Crane. Its name derives from the Arabic 'al-nayyir' meaning 'the bright one'. Alnair is a young star, only about 100 million years old, and rotates rapidly with a period of less than a day.",
    ra: 332.06,
    dec: -46.96,
  },

  // Alioth - HR 4905
  4905: {
    name: "Alioth",
    designation: "Epsilon Ursae Majoris",
    constellation: "Ursa Major",
    type: "A1III-IVp - White giant",
    magnitude: 1.77,
    distance: "81 light-years",
    description:
      "The brightest star in Ursa Major and the 31st brightest in the sky. Despite its epsilon designation, it outshines all other stars in the Big Dipper. Alioth is a peculiar star with an unusual distribution of elements in its atmosphere, causing its brightness to vary slightly.",
    ra: 193.51,
    dec: 55.96,
  },

  // Dubhe - HR 4301
  4301: {
    name: "Dubhe",
    designation: "Alpha Ursae Majoris",
    constellation: "Ursa Major",
    type: "K0III + F0V - Orange giant binary",
    magnitude: 1.79,
    distance: "123 light-years",
    description:
      "One of the two 'Pointer Stars' in the Big Dipper - draw a line through Merak and Dubhe and extend it about 5× their separation to find Polaris. The name means 'bear' in Arabic. Dubhe is actually a binary system with an orange giant primary and a yellow-white companion orbiting every 44 years.",
    ra: 165.93,
    dec: 61.75,
  },

  // Merak - HR 4295
  4295: {
    name: "Merak",
    designation: "Beta Ursae Majoris",
    constellation: "Ursa Major",
    type: "A1V - White main-sequence star",
    magnitude: 2.37,
    distance: "79 light-years",
    description:
      "The second 'Pointer Star' in the Big Dipper, forming a line with Dubhe that points to Polaris. The name comes from Arabic 'al-maraqq' meaning 'the loins' of the bear. Merak has an infrared excess indicating a debris disk of dust and possibly asteroids orbiting the star.",
    ra: 165.46,
    dec: 56.38,
  },

  // Algol - HR 936
  936: {
    name: "Algol",
    designation: "Beta Persei",
    constellation: "Perseus",
    type: "B8V + K0IV - Eclipsing binary",
    magnitude: 2.12,
    distance: "93 light-years",
    description:
      "The 'Demon Star' - its name comes from Arabic 'al-ghūl' meaning 'the demon' or 'the ghoul'. Ancient astronomers noticed its brightness drops from magnitude 2.1 to 3.4 every 2.87 days as a dimmer companion star passes in front. This made it a symbol of ill omen across many cultures. Algol was the first eclipsing binary discovered (1669).",
    ra: 47.04,
    dec: 40.96,
  },

  // Mirfak - HR 1017
  1017: {
    name: "Mirfak",
    designation: "Alpha Persei",
    constellation: "Perseus",
    type: "F5Ib - Yellow-white supergiant",
    magnitude: 1.80,
    distance: "510 light-years",
    description:
      "The brightest star in Perseus and the brightest member of the Alpha Persei Cluster, a group of young stars moving together through space. The name means 'elbow' in Arabic, referring to its position in the constellation figure. Mirfak is about 5,000 times more luminous than the Sun.",
    ra: 51.08,
    dec: 49.86,
  },

  // Kaus Australis - HR 6879
  6879: {
    name: "Kaus Australis",
    designation: "Epsilon Sagittarii",
    constellation: "Sagittarius",
    type: "B9.5III - Blue-white giant",
    magnitude: 1.85,
    distance: "143 light-years",
    description:
      "The brightest star in Sagittarius, marking the base of the Archer's bow. The name combines Arabic 'qaus' (bow) with Latin 'australis' (southern). Located near the center of the Milky Way, it serves as a guide to the galactic core region.",
    ra: 276.04,
    dec: -34.38,
  },

  // Atria - HR 6217
  6217: {
    name: "Atria",
    designation: "Alpha Trianguli Australis",
    constellation: "Triangulum Australe",
    type: "K2IIb-IIIa - Orange giant",
    magnitude: 1.91,
    distance: "415 light-years",
    description:
      "The brightest star in Triangulum Australe, the Southern Triangle. Its name is a contraction of 'Alpha Trianguli Australis'. Atria is an orange giant about 5,500 times more luminous than the Sun, with a stellar wind that creates a visible bow shock in infrared images.",
    ra: 252.17,
    dec: -69.03,
  },

  // Peacock - HR 7790
  7790: {
    name: "Peacock",
    designation: "Alpha Pavonis",
    constellation: "Pavo",
    type: "B2IV - Blue subgiant",
    magnitude: 1.94,
    distance: "179 light-years",
    description:
      "The brightest star in Pavo, the Peacock. It was given its English name by Her Majesty's Nautical Almanac Office in the 1930s. Peacock is a spectroscopic binary with a close companion completing an orbit every 11.75 days.",
    ra: 306.41,
    dec: -56.74,
  },

  // Hamal - HR 617
  617: {
    name: "Hamal",
    designation: "Alpha Arietis",
    constellation: "Aries",
    type: "K2III - Orange giant",
    magnitude: 2.00,
    distance: "66 light-years",
    description:
      "The brightest star in Aries, marking the Ram's head. Around 2000 BCE, Hamal was very close to the vernal equinox point, making Aries the first constellation of the zodiac. In 2011, an exoplanet about 1.8 times Jupiter's mass was discovered orbiting Hamal.",
    ra: 31.79,
    dec: 23.46,
  },

  // Alphard - HR 3748
  3748: {
    name: "Alphard",
    designation: "Alpha Hydrae",
    constellation: "Hydra",
    type: "K3II-III - Orange giant",
    magnitude: 2.00,
    distance: "177 light-years",
    description:
      "The brightest star in Hydra, the Water Serpent - the largest constellation in the sky. Known as the 'Solitary One' because it lies in a relatively star-poor region. Alphard is an evolved giant star about 50 times the Sun's diameter, slowly pulsating in brightness.",
    ra: 141.90,
    dec: -8.66,
  },

  // Diphda - HR 188
  188: {
    name: "Diphda",
    designation: "Beta Ceti",
    constellation: "Cetus",
    type: "K0III - Orange giant",
    magnitude: 2.04,
    distance: "96 light-years",
    description:
      "The brightest star in Cetus, the Sea Monster, despite its beta designation. Also known as Deneb Kaitos ('tail of the whale'). Diphda is an evolved giant star about 145 times more luminous than the Sun, and one of the brightest X-ray sources among normal giant stars.",
    ra: 10.90,
    dec: -17.99,
  },

  // Saiph - HR 2004
  2004: {
    name: "Saiph",
    designation: "Kappa Orionis",
    constellation: "Orion",
    type: "B0.5Ia - Blue supergiant",
    magnitude: 2.07,
    distance: "720 light-years",
    description:
      "Orion's right foot, diagonally opposite Betelgeuse. The name comes from Arabic 'saif al-jabbar' meaning 'sword of the giant'. Despite appearing dimmer than Rigel, Saiph is actually hotter and intrinsically more luminous - it just appears fainter because it's farther away and much of its light is in the ultraviolet.",
    ra: 86.94,
    dec: -9.67,
  },

  // Schedar - HR 168
  168: {
    name: "Schedar",
    designation: "Alpha Cassiopeiae",
    constellation: "Cassiopeia",
    type: "K0IIIa - Orange giant",
    magnitude: 2.24,
    distance: "228 light-years",
    description:
      "One of the five bright stars forming Cassiopeia's distinctive W shape. The name derives from Arabic 'sadr' meaning 'breast'. Schedar is a giant star about 40 times the Sun's diameter, with a suspected faint companion detected through variations in its radial velocity.",
    ra: 10.13,
    dec: 56.54,
  },

  // Alphecca - HR 5793
  5793: {
    name: "Alphecca",
    designation: "Alpha Coronae Borealis",
    constellation: "Corona Borealis",
    type: "A0V + G5V - White binary",
    magnitude: 2.23,
    distance: "75 light-years",
    description:
      "The brightest star in Corona Borealis, the Northern Crown, also known as Gemma ('the jewel'). It's an eclipsing binary system where a cooler companion star periodically passes in front of the primary, causing subtle brightness dips every 17 days.",
    ra: 233.67,
    dec: 26.71,
  },

  // Alpheratz - HR 15
  15: {
    name: "Alpheratz",
    designation: "Alpha Andromedae",
    constellation: "Andromeda",
    type: "B8IVpMnHg - Blue-white subgiant",
    magnitude: 2.06,
    distance: "97 light-years",
    description:
      "The brightest star in Andromeda, also historically shared with Pegasus as Delta Pegasi. Alpheratz is chemically peculiar with unusually high concentrations of mercury and manganese in its atmosphere. It forms the northeast corner of the Great Square of Pegasus.",
    ra: 2.10,
    dec: 29.09,
  },

  // Eltanin - HR 6705
  6705: {
    name: "Eltanin",
    designation: "Gamma Draconis",
    constellation: "Draco",
    type: "K5III - Orange giant",
    magnitude: 2.24,
    distance: "148 light-years",
    description:
      "The brightest star in Draco, the Dragon. In about 1.5 million years, Eltanin will pass within 28 light-years of Earth, becoming one of the brightest stars in our sky. James Bradley's observations of Eltanin in 1728 led to the discovery of stellar aberration.",
    ra: 269.15,
    dec: 51.49,
  },

  // Enif - HR 8308
  8308: {
    name: "Enif",
    designation: "Epsilon Pegasi",
    constellation: "Pegasus",
    type: "K2Ib - Orange supergiant",
    magnitude: 2.38,
    distance: "690 light-years",
    description:
      "The brightest star in Pegasus, marking the flying horse's muzzle. The name means 'nose' in Arabic. Enif is an evolved supergiant about 185 times the Sun's diameter. In 1972, it unexpectedly flared to magnitude 0.7 before returning to normal - a rare event for this type of star.",
    ra: 326.05,
    dec: 9.88,
  },

  // ==========================================
  // Third Magnitude Stars
  // ==========================================

  // Ankaa - HR 99
  99: {
    name: "Ankaa",
    designation: "Alpha Phoenicis",
    constellation: "Phoenix",
    type: "K0III - Orange giant",
    magnitude: 2.40,
    distance: "77 light-years",
    description:
      "The brightest star in Phoenix, marking the mythical bird's breast. The name is derived from the Arabic word for 'phoenix'. Ankaa is a spectroscopic binary with an orbital period of about 10 years, and the primary is an orange giant roughly 15 times the Sun's diameter.",
    ra: 6.57,
    dec: -42.31,
  },

  // Zubeneschamali - HR 5685
  5685: {
    name: "Zubeneschamali",
    designation: "Beta Librae",
    constellation: "Libra",
    type: "B8V - Blue-white main-sequence star",
    magnitude: 2.61,
    distance: "185 light-years",
    description:
      "The brightest star in Libra, historically reported by many observers to appear distinctly green - an unusual color for a star. The name means 'Northern Claw' from when these stars were part of Scorpius. It rotates rapidly, completing a rotation in less than a day.",
    ra: 229.25,
    dec: -9.38,
  },

  // Unukalhai - HR 5854
  5854: {
    name: "Unukalhai",
    designation: "Alpha Serpentis",
    constellation: "Serpens",
    type: "K2III - Orange giant",
    magnitude: 2.63,
    distance: "73 light-years",
    description:
      "The brightest star in Serpens, the only constellation divided into two parts (Serpens Caput and Serpens Cauda). The name means 'Neck of the Serpent' in Arabic. Unukalhai is a giant star about 12 times the Sun's diameter with a confirmed stellar companion.",
    ra: 236.07,
    dec: 6.43,
  },

  // Kornephoros - HR 6148
  6148: {
    name: "Kornephoros",
    designation: "Beta Herculis",
    constellation: "Hercules",
    type: "G7IIIa - Yellow giant",
    magnitude: 2.77,
    distance: "139 light-years",
    description:
      "The brightest star in Hercules, despite its beta designation. The name means 'club-bearer' in Greek. Kornephoros is actually a binary system with a companion star orbiting every 410 days. The primary is a yellow giant about 17 times the Sun's diameter.",
    ra: 247.55,
    dec: 21.49,
  },

  // Suhail - HR 3634
  3634: {
    name: "Suhail",
    designation: "Lambda Velorum",
    constellation: "Vela",
    type: "K4Ib-II - Orange supergiant",
    magnitude: 2.21,
    distance: "573 light-years",
    description:
      "One of the brightest stars in Vela, the Sail. Suhail is an irregular variable star and evolved supergiant about 11,000 times more luminous than the Sun. The name comes from Arabic, possibly meaning 'smooth' or 'level ground'.",
    ra: 136.99,
    dec: -43.43,
  },

  // Naos - HR 3165
  3165: {
    name: "Naos",
    designation: "Zeta Puppis",
    constellation: "Puppis",
    type: "O4If - Blue supergiant",
    magnitude: 2.25,
    distance: "1,080 light-years",
    description:
      "One of the hottest and most luminous stars visible to the naked eye, with a surface temperature of about 42,000 K. Naos is a runaway star ejected from a binary system, speeding through space at 60 km/s. Its powerful stellar wind loses a mass equal to Earth every year.",
    ra: 120.90,
    dec: -40.00,
  },

  // Gienah - HR 4662
  4662: {
    name: "Gienah",
    designation: "Gamma Corvi",
    constellation: "Corvus",
    type: "B8IIIp - Blue giant",
    magnitude: 2.59,
    distance: "154 light-years",
    description:
      "The brightest star in Corvus, the Crow. The name means 'wing' in Arabic. Gienah is a chemically peculiar star with excess mercury and manganese in its atmosphere. It forms part of the distinctive quadrilateral shape that makes Corvus easy to identify.",
    ra: 183.95,
    dec: -17.54,
  },

  // Arneb - HR 1865
  1865: {
    name: "Arneb",
    designation: "Alpha Leporis",
    constellation: "Lepus",
    type: "F0Ib - White supergiant",
    magnitude: 2.58,
    distance: "2,200 light-years",
    description:
      "The brightest star in Lepus, the Hare, located just south of Orion. The name means 'the hare' in Arabic. Arneb is a rare white supergiant, about 129 times the Sun's diameter. At its great distance, it must be extraordinarily luminous - about 32,000 times the Sun.",
    ra: 83.18,
    dec: -17.82,
  },

  // Phact - HR 1956
  1956: {
    name: "Phact",
    designation: "Alpha Columbae",
    constellation: "Columba",
    type: "B7IVe - Blue subgiant",
    magnitude: 2.65,
    distance: "268 light-years",
    description:
      "The brightest star in Columba, the Dove. The name derives from Arabic 'al-fakhitah' meaning 'ring dove'. Phact is a Be star - a rapidly rotating star that throws off material into a surrounding disk, causing emission lines in its spectrum.",
    ra: 84.91,
    dec: -34.07,
  },

  // Deneb Algedi - HR 8322
  8322: {
    name: "Deneb Algedi",
    designation: "Delta Capricorni",
    constellation: "Capricornus",
    type: "A7III - White giant",
    magnitude: 2.81,
    distance: "39 light-years",
    description:
      "One of the brightest stars in Capricornus, despite its delta designation. The name means 'tail of the goat' in Arabic. Deneb Algedi is an eclipsing binary system where the components partially block each other every 24.5 hours, causing small brightness variations.",
    ra: 326.76,
    dec: -16.13,
  },

  // Sadalsuud - HR 8232
  8232: {
    name: "Sadalsuud",
    designation: "Beta Aquarii",
    constellation: "Aquarius",
    type: "G0Ib - Yellow supergiant",
    magnitude: 2.87,
    distance: "540 light-years",
    description:
      "The brightest star in Aquarius, the Water Bearer. The name means 'luck of lucks' in Arabic, as its heliacal rising marked the end of winter in ancient times. Sadalsuud is a rare yellow supergiant, about 50 times the Sun's diameter and 2,200 times its luminosity.",
    ra: 322.89,
    dec: -5.57,
  },
};
