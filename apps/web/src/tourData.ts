/**
 * Predefined Tour Definitions
 *
 * Contains guided astronomical tours for planetarium-style experiences.
 */

import type { TourDefinition } from './tour';

/**
 * 2024 Total Solar Eclipse Tour
 *
 * Watch the April 8, 2024 total solar eclipse from partial phase through totality.
 * Greatest eclipse occurs at 18:17:16 UTC with 4m28s of totality.
 * Viewed from Dallas, Texas (32.78°N, 96.80°W) on the path of totality.
 *
 * Sun position on April 8: RA ~17°, Dec ~7°
 */
export const ECLIPSE_2024_TOUR: TourDefinition = {
  id: 'eclipse-2024',
  name: '2024 Total Solar Eclipse',
  description: 'Watch the April 8, 2024 eclipse from Dallas, Texas',
  keyframes: [
    {
      // Start: 45 minutes before totality, wide view
      // Position computed dynamically - tracks the Sun
      // Sets observer to Dallas, Texas on the path of totality
      target: 'sun',
      fov: 40,
      datetime: '2024-04-08T17:32:16Z',
      holdDuration: 3000,
      transitionDuration: 1000,
      timeMode: 'instant',
      location: {
        latitude: 32.78,
        longitude: -96.80,
        name: 'Dallas, Texas',
      },
      caption: 'April 8, 2024 - The Great North American Eclipse begins... (Viewing from Dallas, TX)',
    },
    {
      // 30 minutes before: partial eclipse underway, zoom in a bit
      target: 'sun',
      fov: 15,
      datetime: '2024-04-08T17:47:16Z',
      holdDuration: 3000,
      transitionDuration: 4000,
      timeMode: 'animate',
      caption: 'The Moon begins to cover the Sun',
    },
    {
      // 15 minutes before: more coverage
      target: 'sun',
      fov: 8,
      datetime: '2024-04-08T18:02:16Z',
      holdDuration: 2500,
      transitionDuration: 4000,
      timeMode: 'animate',
      caption: 'The partial phase deepens',
    },
    {
      // 5 minutes before: zoomed in, approaching totality
      target: 'sun',
      fov: 4,
      datetime: '2024-04-08T18:12:16Z',
      holdDuration: 2000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'Almost there... the light fades',
    },
    {
      // Maximum eclipse (totality)
      target: 'sun',
      fov: 3,
      datetime: '2024-04-08T18:17:16Z',
      holdDuration: 5000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'TOTALITY! The solar corona is revealed',
    },
    {
      // 2 minutes after totality peak
      target: 'sun',
      fov: 3,
      datetime: '2024-04-08T18:19:30Z',
      holdDuration: 3000,
      transitionDuration: 2000,
      timeMode: 'animate',
      caption: 'Diamond ring effect as totality ends',
    },
    {
      // 10 minutes after: Moon moving away
      target: 'sun',
      fov: 8,
      datetime: '2024-04-08T18:27:16Z',
      holdDuration: 2500,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'The Moon continues its journey',
    },
    {
      // Final view: wide shot, 30 minutes after
      target: 'sun',
      fov: 30,
      datetime: '2024-04-08T18:47:16Z',
      holdDuration: 3000,
      transitionDuration: 4000,
      timeMode: 'animate',
      caption: 'The eclipse draws to a close',
    },
  ],
};

/**
 * Jupiter's Galilean Moons Tour
 *
 * Watch the dance of Io, Europa, Ganymede, and Callisto over ~42 hours
 * (one complete Io orbit).
 *
 * Uses a date in mid-2024 when Jupiter is well-positioned.
 * Jupiter position June 15, 2024: RA ~67.5° (4h 30m), Dec ~21.5° (in Taurus)
 * Verified against JPL Horizons ephemeris.
 */
export const JUPITER_MOONS_TOUR: TourDefinition = {
  id: 'jupiter-moons',
  name: "Jupiter's Galilean Moons",
  description: 'Watch the dance of Io, Europa, Ganymede, and Callisto',
  keyframes: [
    {
      // Start: Jupiter in view, snap immediately to position
      // Position computed dynamically from engine at keyframe datetime
      target: 'jupiter',
      fov: 20,
      datetime: '2024-06-15T00:00:00Z',
      holdDuration: 3000,
      transitionDuration: 0, // Instant snap to Jupiter
      timeMode: 'instant',
      caption: 'Jupiter and its four Galilean moons',
    },
    {
      // Zoom in to see moons clearly
      target: 'jupiter',
      fov: 1.5,
      datetime: '2024-06-15T00:00:00Z',
      holdDuration: 3000,
      transitionDuration: 2000,
      timeMode: 'instant',
      caption: 'Io, Europa, Ganymede, and Callisto orbit Jupiter',
    },
    {
      // +6 hours: Io has moved noticeably
      target: 'jupiter',
      fov: 1.5,
      datetime: '2024-06-15T06:00:00Z',
      holdDuration: 2500,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'Io completes an orbit every 42 hours',
    },
    {
      // +12 hours
      target: 'jupiter',
      fov: 1.5,
      datetime: '2024-06-15T12:00:00Z',
      holdDuration: 2500,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'Europa orbits in 3.5 days',
    },
    {
      // +18 hours
      target: 'jupiter',
      fov: 1.5,
      datetime: '2024-06-15T18:00:00Z',
      holdDuration: 2500,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'Ganymede, the largest moon in the solar system',
    },
    {
      // +24 hours
      target: 'jupiter',
      fov: 1.5,
      datetime: '2024-06-16T00:00:00Z',
      holdDuration: 2500,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'One Earth day has passed',
    },
    {
      // +36 hours
      target: 'jupiter',
      fov: 1.5,
      datetime: '2024-06-16T12:00:00Z',
      holdDuration: 2500,
      transitionDuration: 4000,
      timeMode: 'animate',
      caption: 'Callisto orbits farthest out, taking 17 days',
    },
    {
      // +42 hours: Io completes one orbit
      target: 'jupiter',
      fov: 1.5,
      datetime: '2024-06-16T18:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'Io has completed one full orbit around Jupiter',
    },
  ],
};

/**
 * Comet NEOWISE Tour (July 2020)
 *
 * C/2020 F3 NEOWISE was one of the brightest comets in decades.
 * Discovered March 27, 2020 by the NEOWISE space telescope.
 * Perihelion: July 3, 2020 (0.29 AU from Sun)
 * Peak brightness: magnitude ~1 in mid-July 2020
 * Orbital period: ~6,800 years - returns around year 8800!
 */
export const NEOWISE_2020_TOUR: TourDefinition = {
  id: 'neowise-2020',
  name: 'Comet NEOWISE (2020)',
  description: 'Witness the brightest comet in decades',
  keyframes: [
    {
      // Start: Wide view showing the comet in the pre-dawn sky
      target: 'neowise',
      fov: 40,
      datetime: '2020-07-10T04:00:00Z',
      holdDuration: 4000,
      transitionDuration: 1000,
      timeMode: 'instant',
      caption: 'July 2020: Comet NEOWISE blazes in the pre-dawn sky at magnitude 1',
    },
    {
      // Zoom in to see the comet structure
      target: 'neowise',
      fov: 15,
      datetime: '2020-07-10T04:00:00Z',
      holdDuration: 4000,
      transitionDuration: 2000,
      timeMode: 'instant',
      caption: 'Discovered by NASA\'s NEOWISE space telescope on March 27, 2020',
    },
    {
      // Close-up view
      target: 'neowise',
      fov: 8,
      datetime: '2020-07-15T04:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'The comet passed just 0.29 AU from the Sun on July 3rd',
    },
    {
      // Peak visibility mid-July
      target: 'neowise',
      fov: 10,
      datetime: '2020-07-18T21:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'Mid-July: Now visible in evening skies, the comet\'s twin tails stretch across the sky',
    },
    {
      // Late July as it fades
      target: 'neowise',
      fov: 15,
      datetime: '2020-07-23T21:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'NEOWISE was visible to the naked eye for over a month',
    },
    {
      // Final view with context
      target: 'neowise',
      fov: 30,
      datetime: '2020-07-30T21:00:00Z',
      holdDuration: 5000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'With a 6,800-year orbit, NEOWISE won\'t return until around year 8800',
    },
  ],
};

/**
 * Comet Hale-Bopp Tour (1997)
 *
 * C/1995 O1 Hale-Bopp was the "Great Comet of 1997".
 * Discovered July 23, 1995 by Alan Hale and Thomas Bopp.
 * Perihelion: April 1, 1997 (0.91 AU from Sun)
 * Peak brightness: magnitude -1.8 (brighter than any star except Sirius)
 * Visible to naked eye for 18 months - a record!
 * Orbital period: ~2,533 years - returns around year 4530
 */
export const HALE_BOPP_1997_TOUR: TourDefinition = {
  id: 'hale-bopp-1997',
  name: 'Comet Hale-Bopp (1997)',
  description: 'The Great Comet of 1997',
  keyframes: [
    {
      // Early 1997 - comet approaching
      target: 'hale-bopp',
      fov: 40,
      datetime: '1997-02-15T20:00:00Z',
      holdDuration: 4000,
      transitionDuration: 1000,
      timeMode: 'instant',
      caption: 'February 1997: Hale-Bopp approaches, already visible to the naked eye',
    },
    {
      // Zoom in
      target: 'hale-bopp',
      fov: 15,
      datetime: '1997-03-01T20:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'Discovered in 1995 when still beyond Jupiter - unusually far for a comet discovery',
    },
    {
      // Approaching perihelion
      target: 'hale-bopp',
      fov: 10,
      datetime: '1997-03-20T20:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'March 1997: Hale-Bopp brightens as it nears the Sun',
    },
    {
      // Perihelion - maximum brightness
      target: 'hale-bopp',
      fov: 8,
      datetime: '1997-04-01T20:00:00Z',
      holdDuration: 5000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'April 1, 1997: Perihelion! At magnitude -1.8, brighter than any star except Sirius',
    },
    {
      // Post-perihelion
      target: 'hale-bopp',
      fov: 12,
      datetime: '1997-04-15T21:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'The comet displayed spectacular twin dust and ion tails',
    },
    {
      // Wide view with context
      target: 'hale-bopp',
      fov: 30,
      datetime: '1997-05-01T21:00:00Z',
      holdDuration: 5000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'Visible to the naked eye for 18 months - a record! Returns around year 4530',
    },
  ],
};

/**
 * Halley's Comet Tour (1986)
 *
 * 1P/Halley is the most famous periodic comet.
 * First recognized as periodic by Edmond Halley in 1705.
 * Perihelion: February 9, 1986 (0.59 AU from Sun)
 * The 1986 apparition was unfavorable - Earth was on opposite side of Sun
 * Peak brightness: magnitude ~2.1 (fainter than usual due to geometry)
 * Orbital period: ~76 years - returns in 2061!
 */
export const HALLEY_1986_TOUR: TourDefinition = {
  id: 'halley-1986',
  name: 'Halley\'s Comet (1986)',
  description: 'The most famous comet returns every 76 years',
  keyframes: [
    {
      // Approaching Earth
      target: 'halley',
      fov: 40,
      datetime: '1985-12-01T20:00:00Z',
      holdDuration: 4000,
      transitionDuration: 1000,
      timeMode: 'instant',
      caption: 'December 1985: Halley\'s Comet approaches for its 30th recorded visit',
    },
    {
      // Historical context
      target: 'halley',
      fov: 20,
      datetime: '1986-01-15T20:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'Observed since 240 BC, Edmond Halley predicted its return in 1705',
    },
    {
      // Perihelion
      target: 'halley',
      fov: 12,
      datetime: '1986-02-09T12:00:00Z',
      holdDuration: 5000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'February 9, 1986: Perihelion at 0.59 AU from the Sun',
    },
    {
      // Close approach context
      target: 'halley',
      fov: 15,
      datetime: '1986-03-15T20:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: '1986 was an unfavorable apparition - Earth was on the opposite side of the Sun',
    },
    {
      // Space probes
      target: 'halley',
      fov: 10,
      datetime: '1986-03-14T00:00:00Z',
      holdDuration: 4000,
      transitionDuration: 2000,
      timeMode: 'instant',
      caption: 'March 14: ESA\'s Giotto spacecraft flew within 596 km of Halley\'s nucleus',
    },
    {
      // Final view
      target: 'halley',
      fov: 30,
      datetime: '1986-04-15T20:00:00Z',
      holdDuration: 5000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'Halley returns in July 2061 - mark your calendar!',
    },
  ],
};

/**
 * Halley's Comet Tour (2061)
 *
 * 1P/Halley's next apparition will be much more favorable than 1986!
 * Perihelion: July 28, 2061 (0.59 AU from Sun)
 * The geometry is excellent - Earth will be on the same side as the comet
 * Expected peak brightness: magnitude ~0 (as bright as Vega!)
 * This will be the best Halley apparition since 1986
 */
export const HALLEY_2061_TOUR: TourDefinition = {
  id: 'halley-2061',
  name: 'Halley\'s Comet (2061)',
  description: 'Preview the next return of history\'s most famous comet',
  keyframes: [
    {
      // Early approach
      target: 'halley',
      fov: 40,
      datetime: '2061-05-01T21:00:00Z',
      holdDuration: 4000,
      transitionDuration: 1000,
      timeMode: 'instant',
      caption: 'May 2061: Halley\'s Comet returns for its 31st recorded apparition',
    },
    {
      // Building anticipation
      target: 'halley',
      fov: 20,
      datetime: '2061-06-15T21:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'Unlike 1986, this will be a spectacular apparition - Earth is well-positioned',
    },
    {
      // Approaching perihelion
      target: 'halley',
      fov: 12,
      datetime: '2061-07-15T21:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'The comet brightens rapidly as it approaches the Sun',
    },
    {
      // Perihelion
      target: 'halley',
      fov: 8,
      datetime: '2061-07-28T12:00:00Z',
      holdDuration: 5000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'July 28, 2061: Perihelion! Expected to reach magnitude 0 - as bright as Vega',
    },
    {
      // Post-perihelion spectacle
      target: 'halley',
      fov: 10,
      datetime: '2061-08-15T21:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'August 2061: The tail stretches magnificently across the sky',
    },
    {
      // Historical perspective
      target: 'halley',
      fov: 15,
      datetime: '2061-09-01T21:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'Halley has inspired humanity for over 2,000 years of recorded history',
    },
    {
      // Final view
      target: 'halley',
      fov: 30,
      datetime: '2061-10-01T21:00:00Z',
      holdDuration: 5000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'After 2061, Halley won\'t return until 2134. Will you be there to see it?',
    },
  ],
};

/**
 * Betelgeuse Nova Tour (Hypothetical)
 *
 * A hypothetical tour showing what it might look like when Betelgeuse
 * explodes as a Type II supernova. This is a fictional event set in 2031.
 *
 * Scientific basis:
 * - Betelgeuse (HR 2061) is a red supergiant ~700 light-years away
 * - Expected to explode within the next 100,000 years
 * - Peak brightness estimate: magnitude -11 to -14 (we use -12.4)
 * - Would be visible in daylight, cast shadows at night
 * - Type II-P light curve: rapid rise, ~100 day plateau, gradual fade
 */
export const BETELGEUSE_NOVA_TOUR: TourDefinition = {
  id: 'betelgeuse-nova',
  name: 'Betelgeuse Nova',
  description: 'Witness a hypothetical supernova explosion',
  keyframes: [
    {
      // Keyframe 1: Normal Betelgeuse (Feb 14, 2031 evening)
      ra: 88.79,
      dec: 7.41,
      fov: 40,
      datetime: '2031-02-14T23:00:00Z',
      holdDuration: 4000,
      transitionDuration: 1000,
      timeMode: 'instant',
      caption: 'Orion rises in the winter sky. Betelgeuse marks the hunter\'s shoulder...',
      starOverrides: [{ starHR: 2061, magnitude: 0.42, bvColor: 1.85 }],
    },
    {
      // Keyframe 2: Shock breakout begins (Feb 15 04:00)
      ra: 88.79,
      dec: 7.41,
      fov: 15,
      datetime: '2031-02-15T04:00:00Z',
      holdDuration: 3000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'The core collapses. Shock breakout begins...',
      starOverrides: [{ starHR: 2061, magnitude: -8, bvColor: 0.0, scale: 3 }],
    },
    {
      // Keyframe 3: Peak brightness (Feb 15 12:00)
      ra: 88.79,
      dec: 7.41,
      fov: 20,
      datetime: '2031-02-15T12:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'At magnitude -12, Betelgeuse rivals the full Moon',
      starOverrides: [{ starHR: 2061, magnitude: -12.4, bvColor: -0.1, scale: 8 }],
    },
    {
      // Keyframe 4: Plateau phase (Mar 15, 2031)
      ra: 88.79,
      dec: 7.41,
      fov: 25,
      datetime: '2031-03-15T20:00:00Z',
      holdDuration: 3000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'The plateau phase: bright enough to cast shadows at night',
      starOverrides: [{ starHR: 2061, magnitude: -11, bvColor: 0.2, scale: 6 }],
    },
    {
      // Keyframe 5: Fading (Jun 15, 2031)
      ra: 88.79,
      dec: 7.41,
      fov: 30,
      datetime: '2031-06-15T21:00:00Z',
      holdDuration: 3000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'The supernova fades as radioactive decay slows',
      starOverrides: [{ starHR: 2061, magnitude: -2, bvColor: 0.8, scale: 2 }],
    },
    {
      // Keyframe 6: Dim remnant (Feb 2032)
      ra: 88.79,
      dec: 7.41,
      fov: 30,
      datetime: '2032-02-15T20:00:00Z',
      holdDuration: 3000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'One year later: a dim ember where the star once burned',
      starOverrides: [{ starHR: 2061, magnitude: 4, bvColor: 1.2, scale: 1.2 }],
    },
    {
      // Keyframe 7: Nebula forming (Feb 2036)
      ra: 88.79,
      dec: 7.41,
      fov: 25,
      datetime: '2036-02-15T20:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'Five years on: the Betelgeuse Nebula takes shape',
      starOverrides: [{ starHR: 2061, magnitude: 6, bvColor: 0.5, scale: 1.5 }],
    },
    {
      // Keyframe 8: Far future nebula (Feb 2131)
      ra: 88.79,
      dec: 7.41,
      fov: 35,
      datetime: '2131-02-15T20:00:00Z',
      holdDuration: 5000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'A century later: Orion wears a new jewel at its shoulder',
      starOverrides: [{ starHR: 2061, magnitude: 8, bvColor: 0.3, scale: 2 }],
    },
  ],
};

/**
 * SN 1054 Tour - The Crab Nebula Supernova
 *
 * On July 4, 1054 CE, Chinese astronomers recorded a "guest star" near Zeta Tauri.
 * It was visible in daylight for 23 days and remained visible at night for nearly 2 years.
 * Today, the remnant is known as the Crab Nebula (M1).
 *
 * Position: RA 5h 34m 32s (83.63°), Dec +22° 00' 52" (+22.01°)
 * Peak magnitude: approximately -6 (brighter than Venus)
 * Distance: ~6,500 light-years
 */
export const SN_1054_TOUR: TourDefinition = {
  id: 'sn-1054',
  name: 'SN 1054: Birth of the Crab Nebula',
  description: 'Witness the supernova that Chinese astronomers called a "guest star"',
  keyframes: [
    {
      // Keyframe 1: The night sky before the supernova (July 3, 1054)
      // Viewing from Kaifeng, China (Song dynasty capital)
      ra: 83.63,
      dec: 22.01,
      fov: 40,
      datetime: '1054-07-03T20:00:00Z',
      holdDuration: 4000,
      transitionDuration: 1000,
      timeMode: 'instant',
      location: {
        latitude: 34.79,
        longitude: 114.35,
        name: 'Kaifeng, China',
      },
      caption: 'July 3, 1054 CE - Kaifeng, capital of the Song Dynasty. The constellation Taurus rises in the pre-dawn sky...',
    },
    {
      // Keyframe 2: First light of the supernova (July 4, 1054 pre-dawn)
      ra: 83.63,
      dec: 22.01,
      fov: 20,
      datetime: '1054-07-04T03:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'July 4, 1054 - A new star appears! Court astronomers record a "guest star" near Tianguan (Zeta Tauri)',
      starOverrides: [{ starHR: -1054, ra: 83.63, dec: 22.01, magnitude: 0, bvColor: -0.2, scale: 2 }],
    },
    {
      // Keyframe 3: Brightening rapidly
      ra: 83.63,
      dec: 22.01,
      fov: 15,
      datetime: '1054-07-05T03:00:00Z',
      holdDuration: 3000,
      transitionDuration: 2000,
      timeMode: 'animate',
      caption: 'The guest star brightens rapidly, outshining every star in the sky',
      starOverrides: [{ starHR: -1054, ra: 83.63, dec: 22.01, magnitude: -4, bvColor: -0.2, scale: 4 }],
    },
    {
      // Keyframe 4: Peak brightness - visible in daylight
      ra: 83.63,
      dec: 22.01,
      fov: 20,
      datetime: '1054-07-10T12:00:00Z',
      holdDuration: 5000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'At magnitude -6, the "guest star" is visible in broad daylight for 23 days',
      starOverrides: [{ starHR: -1054, ra: 83.63, dec: 22.01, magnitude: -6, bvColor: -0.1, scale: 6 }],
    },
    {
      // Keyframe 5: Still brilliant after a month
      ra: 83.63,
      dec: 22.01,
      fov: 25,
      datetime: '1054-08-15T20:00:00Z',
      holdDuration: 3000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'August 1054 - No longer visible by day, but still brilliant at night',
      starOverrides: [{ starHR: -1054, ra: 83.63, dec: 22.01, magnitude: -2, bvColor: 0.2, scale: 3 }],
    },
    {
      // Keyframe 6: Fading over months
      ra: 83.63,
      dec: 22.01,
      fov: 30,
      datetime: '1055-01-15T20:00:00Z',
      holdDuration: 3000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'January 1055 - Six months later, the guest star continues to fade',
      starOverrides: [{ starHR: -1054, ra: 83.63, dec: 22.01, magnitude: 2, bvColor: 0.8, scale: 1.5 }],
    },
    {
      // Keyframe 7: Last visibility (April 1056)
      ra: 83.63,
      dec: 22.01,
      fov: 30,
      datetime: '1056-04-06T20:00:00Z',
      holdDuration: 3000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'April 1056 - After 653 days, the guest star finally fades from naked-eye visibility',
      starOverrides: [{ starHR: -1054, ra: 83.63, dec: 22.01, magnitude: 6, bvColor: 1.0, scale: 1 }],
    },
    {
      // Keyframe 8: The Crab Nebula today
      ra: 83.63,
      dec: 22.01,
      fov: 8,
      datetime: '2024-01-15T20:00:00Z',
      holdDuration: 5000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'Today: The Crab Nebula (M1) - a pulsar and expanding shell of gas, 6,500 light-years away',
      // No star override - show the actual nebula via deep field image
    },
  ],
};

/**
 * SN 1572 Tour - Tycho's Supernova
 *
 * On November 11, 1572, Tycho Brahe observed a "new star" in Cassiopeia.
 * His meticulous observations proved that the heavens could change,
 * challenging the Aristotelian view of an unchanging celestial sphere.
 *
 * Position: RA 0h 25m 19s (6.33°), Dec +64° 08' (+64.14°)
 * Peak magnitude: approximately -4 (as bright as Venus)
 * Type: Ia supernova (thermonuclear)
 * Distance: ~8,000 light-years
 */
export const SN_1572_TOUR: TourDefinition = {
  id: 'sn-1572',
  name: "SN 1572: Tycho's Supernova",
  description: 'The star that shattered the unchanging heavens',
  keyframes: [
    {
      // Keyframe 1: The night sky before the supernova
      // Viewing from Hven island, Denmark (Tycho's observatory)
      ra: 6.33,
      dec: 64.14,
      fov: 50,
      datetime: '1572-11-10T20:00:00Z',
      holdDuration: 4000,
      transitionDuration: 1000,
      timeMode: 'instant',
      location: {
        latitude: 55.91,
        longitude: 12.70,
        name: 'Hven Island, Denmark',
      },
      caption: 'November 10, 1572 - Hven Island, Denmark. Cassiopeia wheels overhead in the autumn sky...',
    },
    {
      // Keyframe 2: First sighting
      ra: 6.33,
      dec: 64.14,
      fov: 30,
      datetime: '1572-11-11T19:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'November 11, 1572 - Tycho Brahe spots a brilliant new star where none had been before',
      starOverrides: [{ starHR: -1572, ra: 6.33, dec: 64.14, magnitude: 0, bvColor: -0.2, scale: 2 }],
    },
    {
      // Keyframe 3: Peak brightness
      ra: 6.33,
      dec: 64.14,
      fov: 25,
      datetime: '1572-11-16T19:00:00Z',
      holdDuration: 5000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'Mid-November: At magnitude -4, it rivals Venus and is visible in daylight',
      starOverrides: [{ starHR: -1572, ra: 6.33, dec: 64.14, magnitude: -4, bvColor: -0.1, scale: 5 }],
    },
    {
      // Keyframe 4: Still bright after a month
      ra: 6.33,
      dec: 64.14,
      fov: 35,
      datetime: '1572-12-15T19:00:00Z',
      holdDuration: 3000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'December 1572 - Tycho measures its position nightly, finding no parallax - it must be among the stars',
      starOverrides: [{ starHR: -1572, ra: 6.33, dec: 64.14, magnitude: -1, bvColor: 0.2, scale: 3 }],
    },
    {
      // Keyframe 5: Changing color as it fades
      ra: 6.33,
      dec: 64.14,
      fov: 35,
      datetime: '1573-03-01T20:00:00Z',
      holdDuration: 3000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'March 1573 - The star turns yellow, then red as it fades',
      starOverrides: [{ starHR: -1572, ra: 6.33, dec: 64.14, magnitude: 2, bvColor: 1.2, scale: 1.5 }],
    },
    {
      // Keyframe 6: Last visibility
      ra: 6.33,
      dec: 64.14,
      fov: 40,
      datetime: '1574-03-01T20:00:00Z',
      holdDuration: 3000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'March 1574 - After 16 months, the "new star" fades from view',
      starOverrides: [{ starHR: -1572, ra: 6.33, dec: 64.14, magnitude: 6, bvColor: 1.5, scale: 1 }],
    },
    {
      // Keyframe 7: Present day - the remnant
      ra: 6.33,
      dec: 64.14,
      fov: 15,
      datetime: '2024-11-11T20:00:00Z',
      holdDuration: 5000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: "Today: Tycho's SNR - an expanding shell of gas, proof that stars are born and die",
    },
  ],
};

/**
 * SN 1604 Tour - Kepler's Supernova
 *
 * On October 9, 1604, a new star appeared in Ophiuchus near a rare
 * Jupiter-Saturn-Mars conjunction. Johannes Kepler observed it from Prague,
 * writing "De Stella Nova" about his findings.
 *
 * This was the last supernova visible to the naked eye in our galaxy.
 *
 * Position: RA 17h 30m 36s (262.65°), Dec -21° 29' (-21.48°)
 * Peak magnitude: approximately -2.5
 * Type: Ia supernova (thermonuclear)
 * Distance: ~20,000 light-years
 */
export const SN_1604_TOUR: TourDefinition = {
  id: 'sn-1604',
  name: "SN 1604: Kepler's Supernova",
  description: 'The last supernova seen in our galaxy',
  keyframes: [
    {
      // Keyframe 1: The planetary conjunction that drew attention to this region
      // Viewing from Prague (Kepler's location)
      ra: 262.65,
      dec: -21.48,
      fov: 40,
      datetime: '1604-10-08T04:00:00Z',
      holdDuration: 4000,
      transitionDuration: 1000,
      timeMode: 'instant',
      location: {
        latitude: 50.09,
        longitude: 14.42,
        name: 'Prague, Bohemia',
      },
      caption: 'October 8, 1604 - Prague. Astronomers watch a rare Jupiter-Saturn-Mars conjunction in Ophiuchus...',
    },
    {
      // Keyframe 2: First sighting
      ra: 262.65,
      dec: -21.48,
      fov: 25,
      datetime: '1604-10-09T04:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'October 9, 1604 - A new star appears! Kepler is initially clouded out but soon observes it',
      starOverrides: [{ starHR: -1604, ra: 262.65, dec: -21.48, magnitude: 0, bvColor: -0.2, scale: 2 }],
    },
    {
      // Keyframe 3: Peak brightness
      ra: 262.65,
      dec: -21.48,
      fov: 20,
      datetime: '1604-10-17T04:00:00Z',
      holdDuration: 5000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'Mid-October: At magnitude -2.5, the nova outshines Jupiter nearby',
      starOverrides: [{ starHR: -1604, ra: 262.65, dec: -21.48, magnitude: -2.5, bvColor: -0.1, scale: 4 }],
    },
    {
      // Keyframe 4: Context with planets
      ra: 262.65,
      dec: -21.48,
      fov: 35,
      datetime: '1604-11-15T04:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'November 1604 - The new star amid the planetary gathering sparks debate across Europe',
      starOverrides: [{ starHR: -1604, ra: 262.65, dec: -21.48, magnitude: 0, bvColor: 0.3, scale: 2.5 }],
    },
    {
      // Keyframe 5: Fading through winter
      ra: 262.65,
      dec: -21.48,
      fov: 35,
      datetime: '1605-03-01T05:00:00Z',
      holdDuration: 3000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'March 1605 - Kepler continues observations as the star fades',
      starOverrides: [{ starHR: -1604, ra: 262.65, dec: -21.48, magnitude: 3, bvColor: 1.0, scale: 1.5 }],
    },
    {
      // Keyframe 6: Last visibility
      ra: 262.65,
      dec: -21.48,
      fov: 40,
      datetime: '1605-10-01T04:00:00Z',
      holdDuration: 3000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'October 1605 - After one year, the stella nova fades from naked-eye visibility',
      starOverrides: [{ starHR: -1604, ra: 262.65, dec: -21.48, magnitude: 6, bvColor: 1.3, scale: 1 }],
    },
    {
      // Keyframe 7: Present day
      ra: 262.65,
      dec: -21.48,
      fov: 15,
      datetime: '2024-07-15T04:00:00Z',
      holdDuration: 5000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: "Today: Kepler's SNR - No supernova has been seen in our galaxy since. We are overdue.",
    },
  ],
};

/**
 * SN 1987A Tour - Supernova in the Large Magellanic Cloud
 *
 * On February 23, 1987, a supernova was observed in the Large Magellanic Cloud,
 * the first naked-eye supernova since Kepler's in 1604 - a gap of 383 years.
 * It was also the first supernova from which neutrinos were detected.
 *
 * Position: RA 5h 35m 28s (83.87°), Dec -69° 16' (-69.27°)
 * Peak magnitude: approximately +3
 * Type: II supernova (core collapse)
 * Distance: ~168,000 light-years (in the LMC)
 */
export const SN_1987A_TOUR: TourDefinition = {
  id: 'sn-1987a',
  name: 'SN 1987A: Return of the Supernovae',
  description: 'The first naked-eye supernova in 383 years',
  keyframes: [
    {
      // Keyframe 1: The LMC before the supernova
      // Viewing from Las Campanas Observatory, Chile
      ra: 83.87,
      dec: -69.27,
      fov: 40,
      datetime: '1987-02-23T01:00:00Z',
      holdDuration: 4000,
      transitionDuration: 1000,
      timeMode: 'instant',
      location: {
        latitude: -29.01,
        longitude: -70.69,
        name: 'Las Campanas Observatory, Chile',
      },
      caption: 'February 23, 1987 - Las Campanas Observatory, Chile. The Large Magellanic Cloud hangs in the southern sky...',
    },
    {
      // Keyframe 2: Neutrino burst (3 hours before visible light)
      ra: 83.87,
      dec: -69.27,
      fov: 25,
      datetime: '1987-02-23T07:35:00Z',
      holdDuration: 4000,
      transitionDuration: 2000,
      timeMode: 'animate',
      caption: '7:35 UTC - Deep underground, neutrino detectors in Japan and USA record a burst of particles. The core has collapsed.',
    },
    {
      // Keyframe 3: First light detected
      ra: 83.87,
      dec: -69.27,
      fov: 15,
      datetime: '1987-02-24T03:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'February 24 - Ian Shelton photographs a new star in the LMC. After 383 years, a supernova is visible to the naked eye!',
      starOverrides: [{ starHR: -1987, ra: 83.87, dec: -69.27, magnitude: 4.5, bvColor: 0.0, scale: 2 }],
    },
    {
      // Keyframe 4: Peak brightness
      ra: 83.87,
      dec: -69.27,
      fov: 20,
      datetime: '1987-05-20T03:00:00Z',
      holdDuration: 5000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'May 1987 - SN 1987A reaches peak brightness at magnitude +3, easily visible to the naked eye',
      starOverrides: [{ starHR: -1987, ra: 83.87, dec: -69.27, magnitude: 2.9, bvColor: 0.5, scale: 3 }],
    },
    {
      // Keyframe 5: Fading but still bright
      ra: 83.87,
      dec: -69.27,
      fov: 25,
      datetime: '1987-10-01T03:00:00Z',
      holdDuration: 3000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'October 1987 - Astronomers worldwide study the supernova as it fades',
      starOverrides: [{ starHR: -1987, ra: 83.87, dec: -69.27, magnitude: 5, bvColor: 1.0, scale: 1.5 }],
    },
    {
      // Keyframe 6: Below naked-eye visibility
      ra: 83.87,
      dec: -69.27,
      fov: 25,
      datetime: '1988-02-23T03:00:00Z',
      holdDuration: 3000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'February 1988 - One year later, SN 1987A has faded below naked-eye visibility',
      starOverrides: [{ starHR: -1987, ra: 83.87, dec: -69.27, magnitude: 8, bvColor: 1.2, scale: 1 }],
    },
    {
      // Keyframe 7: Present day - the expanding ring
      ra: 83.87,
      dec: -69.27,
      fov: 10,
      datetime: '2024-02-23T03:00:00Z',
      holdDuration: 5000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'Today: SN 1987A\'s expanding rings are studied by Hubble and JWST. We await the next galactic supernova.',
    },
  ],
};

/**
 * 1769 Transit of Venus Tour - Captain Cook's Expedition
 *
 * On June 3, 1769, Captain James Cook observed the transit of Venus from Tahiti
 * as part of a worldwide effort to measure the distance to the Sun (the AU).
 * This expedition later led to Cook's exploration of Australia and New Zealand.
 *
 * The transit lasted about 6 hours. Venus appeared as a small black dot
 * crossing the Sun's disk - a rare event that wouldn't repeat until 1874.
 *
 * Contact times (approximate UTC):
 * - First contact (ingress): 21:25 June 3
 * - Maximum transit: 00:25 June 4
 * - Fourth contact (egress): 03:25 June 4
 */
export const VENUS_TRANSIT_1769_TOUR: TourDefinition = {
  id: 'venus-transit-1769',
  name: '1769 Transit of Venus',
  description: "Captain Cook's expedition to measure the solar system",
  keyframes: [
    {
      // Keyframe 1: Setting the scene - Point Venus, Tahiti
      target: 'sun',
      fov: 30,
      datetime: '1769-06-03T21:00:00Z',
      holdDuration: 4000,
      transitionDuration: 1000,
      timeMode: 'instant',
      location: {
        latitude: -17.4849,
        longitude: -149.4983,
        name: 'Point Venus, Tahiti',
      },
      caption: "June 3, 1769 - Point Venus, Tahiti. Captain Cook's HMS Endeavour has sailed halfway around the world for this moment...",
    },
    {
      // Keyframe 2: First contact - Venus begins crossing the Sun's limb
      target: 'sun',
      fov: 8,
      datetime: '1769-06-03T21:25:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'First contact - Venus begins its journey across the face of the Sun',
    },
    {
      // Keyframe 3: Ingress complete - the "black drop" effect
      target: 'sun',
      fov: 5,
      datetime: '1769-06-03T21:45:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'The infamous "black drop effect" makes precise timing difficult',
    },
    {
      // Keyframe 4: Transit in progress
      target: 'sun',
      fov: 6,
      datetime: '1769-06-03T23:00:00Z',
      holdDuration: 3000,
      transitionDuration: 4000,
      timeMode: 'animate',
      caption: 'Venus crosses the solar disk - observers worldwide time the same event to calculate parallax',
    },
    {
      // Keyframe 5: Maximum transit
      target: 'sun',
      fov: 5,
      datetime: '1769-06-04T00:25:00Z',
      holdDuration: 4000,
      transitionDuration: 4000,
      timeMode: 'animate',
      caption: 'Maximum transit - Venus at its closest to the Sun\'s center',
    },
    {
      // Keyframe 6: Approaching egress
      target: 'sun',
      fov: 6,
      datetime: '1769-06-04T02:30:00Z',
      holdDuration: 3000,
      transitionDuration: 4000,
      timeMode: 'animate',
      caption: 'The transit nears its end. From the timing differences, astronomers calculated the Sun is 93 million miles away',
    },
    {
      // Keyframe 7: Fourth contact - egress complete
      target: 'sun',
      fov: 8,
      datetime: '1769-06-04T03:25:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'Fourth contact - Venus exits the solar disk. The next transit won\'t occur until 1874',
    },
    {
      // Keyframe 8: Closing context
      target: 'sun',
      fov: 25,
      datetime: '1769-06-04T03:30:00Z',
      holdDuration: 5000,
      transitionDuration: 2000,
      timeMode: 'instant',
      caption: "Cook's expedition continued on to chart New Zealand and Australia, changing world maps forever",
    },
  ],
};

/**
 * 2012 Transit of Venus Tour
 *
 * The last transit of Venus until December 2117 occurred on June 5-6, 2012.
 * Venus transits come in pairs 8 years apart, separated by over a century.
 * The previous pair was in 2004 and 2012; the next pair will be in 2117 and 2125.
 *
 * This was the first Venus transit in the age of modern space telescopes.
 * SDO, Hubble, and ground-based observatories all captured the event.
 *
 * Contact times (UTC):
 * - First contact: 22:09 June 5
 * - Maximum: 01:29 June 6
 * - Fourth contact: 04:49 June 6
 */
export const VENUS_TRANSIT_2012_TOUR: TourDefinition = {
  id: 'venus-transit-2012',
  name: '2012 Transit of Venus',
  description: 'The last Venus transit until 2117',
  keyframes: [
    {
      // Keyframe 1: Setting the scene - Hawaii
      target: 'sun',
      fov: 30,
      datetime: '2012-06-05T21:45:00Z',
      holdDuration: 4000,
      transitionDuration: 1000,
      timeMode: 'instant',
      location: {
        latitude: 19.8208,
        longitude: -155.4681,
        name: 'Mauna Kea, Hawaii',
      },
      caption: 'June 5, 2012 - Mauna Kea, Hawaii. The last transit of Venus for 105 years is about to begin...',
    },
    {
      // Keyframe 2: First contact
      target: 'sun',
      fov: 8,
      datetime: '2012-06-05T22:09:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'First contact - Venus touches the solar limb',
    },
    {
      // Keyframe 3: Second contact - fully on disk
      target: 'sun',
      fov: 5,
      datetime: '2012-06-05T22:27:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'Venus fully on the solar disk - NASA\'s SDO captures stunning images from orbit',
    },
    {
      // Keyframe 4: Transit in progress
      target: 'sun',
      fov: 6,
      datetime: '2012-06-06T00:00:00Z',
      holdDuration: 3000,
      transitionDuration: 4000,
      timeMode: 'animate',
      caption: 'Millions worldwide watch the transit live via webcasts',
    },
    {
      // Keyframe 5: Maximum transit
      target: 'sun',
      fov: 5,
      datetime: '2012-06-06T01:29:00Z',
      holdDuration: 4000,
      transitionDuration: 4000,
      timeMode: 'animate',
      caption: 'Maximum transit - the geometric center of the event',
    },
    {
      // Keyframe 6: Late transit
      target: 'sun',
      fov: 6,
      datetime: '2012-06-06T03:30:00Z',
      holdDuration: 3000,
      transitionDuration: 4000,
      timeMode: 'animate',
      caption: 'Venus approaches the far limb of the Sun',
    },
    {
      // Keyframe 7: Fourth contact - egress complete
      target: 'sun',
      fov: 8,
      datetime: '2012-06-06T04:49:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'Fourth contact - Venus exits. No one alive today will see another Venus transit',
    },
    {
      // Keyframe 8: Closing
      target: 'sun',
      fov: 25,
      datetime: '2012-06-06T05:00:00Z',
      holdDuration: 5000,
      transitionDuration: 2000,
      timeMode: 'instant',
      caption: 'The next transit of Venus: December 10-11, 2117. Mark your calendar... in 105 years',
    },
  ],
};

/**
 * 2019 Transit of Mercury Tour
 *
 * Mercury transits the Sun about 13 times per century, making them much more
 * common than Venus transits. The November 11, 2019 transit was visible from
 * the Americas, Europe, and Africa.
 *
 * Mercury appears much smaller than Venus during transit - only about 1/150th
 * the Sun's diameter (Venus is 1/30th). A telescope was needed to see it clearly.
 *
 * Contact times (UTC):
 * - First contact: 12:35
 * - Maximum: 15:20
 * - Fourth contact: 18:04
 *
 * The next Mercury transit visible from Earth: November 13, 2032
 */
export const MERCURY_TRANSIT_2019_TOUR: TourDefinition = {
  id: 'mercury-transit-2019',
  name: '2019 Transit of Mercury',
  description: 'A tiny planet crosses the face of our star',
  keyframes: [
    {
      // Keyframe 1: Setting the scene - Washington DC
      target: 'sun',
      fov: 25,
      datetime: '2019-11-11T12:00:00Z',
      holdDuration: 4000,
      transitionDuration: 1000,
      timeMode: 'instant',
      location: {
        latitude: 38.9072,
        longitude: -77.0369,
        name: 'Washington, DC',
      },
      caption: 'November 11, 2019 - A crisp fall morning. Mercury is about to transit the Sun...',
    },
    {
      // Keyframe 2: First contact - zoom in close
      target: 'sun',
      fov: 6,
      datetime: '2019-11-11T12:35:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'First contact - Mercury touches the solar limb. At 1/150th the Sun\'s diameter, you need a telescope to see it',
    },
    {
      // Keyframe 3: Ingress complete
      target: 'sun',
      fov: 4,
      datetime: '2019-11-11T12:37:00Z',
      holdDuration: 4000,
      transitionDuration: 2000,
      timeMode: 'animate',
      caption: 'Mercury fully on the solar disk - a tiny black dot against the brilliant photosphere',
    },
    {
      // Keyframe 4: Early transit
      target: 'sun',
      fov: 5,
      datetime: '2019-11-11T13:30:00Z',
      holdDuration: 3000,
      transitionDuration: 4000,
      timeMode: 'animate',
      caption: 'Mercury transits the Sun about 13 times per century - far more often than Venus',
    },
    {
      // Keyframe 5: Maximum transit
      target: 'sun',
      fov: 4,
      datetime: '2019-11-11T15:20:00Z',
      holdDuration: 4000,
      transitionDuration: 4000,
      timeMode: 'animate',
      caption: 'Maximum transit - Mercury at closest approach to the Sun\'s center',
    },
    {
      // Keyframe 6: Late transit
      target: 'sun',
      fov: 5,
      datetime: '2019-11-11T17:00:00Z',
      holdDuration: 3000,
      transitionDuration: 4000,
      timeMode: 'animate',
      caption: 'Approaching egress - Mercury\'s 5.5-hour journey across the Sun nears its end',
    },
    {
      // Keyframe 7: Fourth contact
      target: 'sun',
      fov: 6,
      datetime: '2019-11-11T18:04:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'Fourth contact - Mercury exits the solar disk',
    },
    {
      // Keyframe 8: Closing
      target: 'sun',
      fov: 20,
      datetime: '2019-11-11T18:10:00Z',
      holdDuration: 5000,
      transitionDuration: 2000,
      timeMode: 'instant',
      caption: 'Next Mercury transit: November 13, 2032. But for Venus, we must wait until 2117',
    },
  ],
};

/**
 * Galileo's Discovery of Jupiter's Moons Tour - January 1610
 *
 * On January 7, 1610, Galileo Galilei pointed his improved telescope at Jupiter
 * and noticed three small "stars" near the planet. Over the following nights,
 * he observed them moving - they were moons orbiting Jupiter, not Earth.
 *
 * This discovery was revolutionary: it proved not everything orbited Earth,
 * providing strong evidence for the Copernican heliocentric model.
 *
 * Galileo observed from Padua, Italy (45.41°N, 11.88°E)
 * Jupiter was in Taurus during January 1610.
 */
export const GALILEO_JUPITER_TOUR: TourDefinition = {
  id: 'galileo-jupiter-1610',
  name: "Galileo's Discovery (1610)",
  description: 'The night Galileo found moons orbiting Jupiter',
  keyframes: [
    {
      // Keyframe 1: Setting the scene - Padua, Italy
      target: 'jupiter',
      fov: 40,
      datetime: '1610-01-07T21:00:00Z',
      holdDuration: 4000,
      transitionDuration: 1000,
      timeMode: 'instant',
      location: {
        latitude: 45.41,
        longitude: 11.88,
        name: 'Padua, Italy',
      },
      caption: 'January 7, 1610 - Padua, Italy. Galileo Galilei turns his improved telescope toward Jupiter...',
    },
    {
      // Keyframe 2: Zoom to Jupiter
      target: 'jupiter',
      fov: 8,
      datetime: '1610-01-07T21:30:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'Through his 20x telescope, Galileo sees three small "stars" aligned near Jupiter',
    },
    {
      // Keyframe 3: Close view showing moons
      target: 'jupiter',
      fov: 2,
      datetime: '1610-01-07T22:00:00Z',
      holdDuration: 4000,
      transitionDuration: 2000,
      timeMode: 'animate',
      caption: 'He sketches their positions, thinking them fixed stars. But tomorrow, they will have moved...',
    },
    {
      // Keyframe 4: January 8 - they've moved!
      target: 'jupiter',
      fov: 2,
      datetime: '1610-01-08T21:30:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'January 8 - The "stars" have changed position! Galileo is puzzled',
    },
    {
      // Keyframe 5: January 10 - only two visible
      target: 'jupiter',
      fov: 2,
      datetime: '1610-01-10T21:30:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'January 10 - Only two "stars" visible. One must be behind Jupiter!',
    },
    {
      // Keyframe 6: January 13 - four moons!
      target: 'jupiter',
      fov: 2,
      datetime: '1610-01-13T21:30:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'January 13 - A fourth "star" appears! Galileo realizes: these are moons orbiting Jupiter',
    },
    {
      // Keyframe 7: The revelation
      target: 'jupiter',
      fov: 3,
      datetime: '1610-01-15T21:30:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'Not everything orbits Earth. The Copernican revolution has found its proof.',
    },
    {
      // Keyframe 8: Wide view - context
      target: 'jupiter',
      fov: 20,
      datetime: '1610-01-15T22:00:00Z',
      holdDuration: 5000,
      transitionDuration: 2000,
      timeMode: 'instant',
      caption: 'Galileo names them the Medicean Stars. Today we call them Io, Europa, Ganymede, and Callisto.',
    },
  ],
};

/**
 * Discovery of Uranus Tour - March 13, 1781
 *
 * William Herschel, a musician and amateur astronomer in Bath, England,
 * discovered Uranus while systematically surveying the sky. He initially
 * thought it was a comet, but its nearly circular orbit revealed it as
 * the first planet discovered in recorded history.
 *
 * Uranus was in Gemini at the time of discovery.
 * Herschel observed from his home in Bath (51.38°N, 2.36°W).
 */
export const URANUS_DISCOVERY_TOUR: TourDefinition = {
  id: 'uranus-discovery-1781',
  name: 'Discovery of Uranus (1781)',
  description: 'William Herschel finds the first new planet',
  keyframes: [
    {
      // Keyframe 1: Setting the scene - Bath, England
      target: 'uranus',
      fov: 50,
      datetime: '1781-03-13T22:00:00Z',
      holdDuration: 4000,
      transitionDuration: 1000,
      timeMode: 'instant',
      location: {
        latitude: 51.38,
        longitude: -2.36,
        name: 'Bath, England',
      },
      caption: 'March 13, 1781 - Bath, England. William Herschel surveys the sky with his homemade telescope...',
    },
    {
      // Keyframe 2: The region of sky
      target: 'uranus',
      fov: 20,
      datetime: '1781-03-13T22:30:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'Scanning Gemini, Herschel notices an object that appears as a disk, not a point of light',
    },
    {
      // Keyframe 3: Closer view
      target: 'uranus',
      fov: 8,
      datetime: '1781-03-13T23:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: '"I perceived it to be a comet," he wrote. But he would soon discover it was far more...',
    },
    {
      // Keyframe 4: A few days later - it has moved
      target: 'uranus',
      fov: 10,
      datetime: '1781-03-17T22:30:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'Days later, it has moved against the background stars - definitely not a star',
    },
    {
      // Keyframe 5: Months of observation
      target: 'uranus',
      fov: 15,
      datetime: '1781-06-01T23:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'Mathematicians calculate its orbit: nearly circular, at 19 times Earth\'s distance from the Sun',
    },
    {
      // Keyframe 6: The conclusion
      target: 'uranus',
      fov: 8,
      datetime: '1781-09-01T22:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'This is no comet - it\'s a planet! The first discovered since antiquity',
    },
    {
      // Keyframe 7: Wide context
      target: 'uranus',
      fov: 30,
      datetime: '1781-09-01T22:30:00Z',
      holdDuration: 5000,
      transitionDuration: 2000,
      timeMode: 'instant',
      caption: 'Herschel wanted to name it "Georgium Sidus" after King George III. Astronomers chose Uranus instead.',
    },
  ],
};

/**
 * Discovery of Neptune Tour - September 23, 1846
 *
 * Neptune was the first planet discovered through mathematical prediction.
 * Urbain Le Verrier calculated its position based on perturbations in Uranus's
 * orbit. Johann Galle found it at Berlin Observatory within 1° of the prediction.
 *
 * This was a triumph of Newtonian mechanics - Newton's laws could predict
 * the existence and location of an unseen world.
 *
 * Neptune was in Aquarius at the time of discovery.
 */
export const NEPTUNE_DISCOVERY_TOUR: TourDefinition = {
  id: 'neptune-discovery-1846',
  name: 'Discovery of Neptune (1846)',
  description: 'Found by mathematics before being seen',
  keyframes: [
    {
      // Keyframe 1: Setting the scene - Berlin Observatory
      target: 'neptune',
      fov: 50,
      datetime: '1846-09-23T21:00:00Z',
      holdDuration: 4000,
      transitionDuration: 1000,
      timeMode: 'instant',
      location: {
        latitude: 52.52,
        longitude: 13.41,
        name: 'Berlin Observatory',
      },
      caption: 'September 23, 1846 - Berlin Observatory. A letter from Le Verrier has just arrived...',
    },
    {
      // Keyframe 2: The prediction
      target: 'neptune',
      fov: 25,
      datetime: '1846-09-23T21:30:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'Le Verrier\'s calculations predict an unseen planet is perturbing Uranus\'s orbit',
    },
    {
      // Keyframe 3: Searching the predicted location
      target: 'neptune',
      fov: 10,
      datetime: '1846-09-23T22:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'Johann Galle and Heinrich d\'Arrest search the predicted region in Aquarius...',
    },
    {
      // Keyframe 4: Found!
      target: 'neptune',
      fov: 5,
      datetime: '1846-09-23T23:00:00Z',
      holdDuration: 5000,
      transitionDuration: 2000,
      timeMode: 'animate',
      caption: '"That star is not on the chart!" Within one degree of Le Verrier\'s prediction - Neptune is found!',
    },
    {
      // Keyframe 5: Confirmation
      target: 'neptune',
      fov: 8,
      datetime: '1846-09-24T22:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'The next night confirms it: the object has moved. A new planet, seen only 30 minutes after the search began.',
    },
    {
      // Keyframe 6: The triumph
      target: 'neptune',
      fov: 15,
      datetime: '1846-10-01T22:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'News spreads across Europe. Newton\'s laws have predicted the existence of an unseen world.',
    },
    {
      // Keyframe 7: Wide view
      target: 'neptune',
      fov: 30,
      datetime: '1846-10-01T22:30:00Z',
      holdDuration: 5000,
      transitionDuration: 2000,
      timeMode: 'instant',
      caption: 'At 30 times Earth\'s distance from the Sun, Neptune takes 165 years to orbit once.',
    },
  ],
};

/**
 * Discovery of Pluto Tour - February 18, 1930
 *
 * Clyde Tombaugh, a young astronomer at Lowell Observatory, discovered Pluto
 * using a blink comparator - alternating between two photographic plates taken
 * days apart to spot moving objects.
 *
 * The discovery was announced on March 13, 1930 - the anniversary of both
 * Herschel's discovery of Uranus and Percival Lowell's birth.
 *
 * Pluto was in Gemini at the time of discovery.
 * (Note: Pluto was reclassified as a dwarf planet in 2006.)
 */
export const PLUTO_DISCOVERY_TOUR: TourDefinition = {
  id: 'pluto-discovery-1930',
  name: 'Discovery of Pluto (1930)',
  description: 'Clyde Tombaugh finds the ninth world',
  keyframes: [
    {
      // Keyframe 1: Setting the scene - Lowell Observatory
      ra: 101.29,
      dec: 23.01,
      fov: 50,
      datetime: '1930-01-23T04:00:00Z',
      holdDuration: 4000,
      transitionDuration: 1000,
      timeMode: 'instant',
      location: {
        latitude: 35.20,
        longitude: -111.66,
        name: 'Lowell Observatory, Flagstaff',
      },
      caption: 'January 1930 - Lowell Observatory, Arizona. Clyde Tombaugh photographs the sky, searching for "Planet X"...',
    },
    {
      // Keyframe 2: The photographic plates
      ra: 101.29,
      dec: 23.01,
      fov: 20,
      datetime: '1930-01-23T04:30:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'January 23: Tombaugh exposes a plate of the Gemini star field. Six days later, he takes another.',
    },
    {
      // Keyframe 3: January 29 - second plate
      ra: 101.29,
      dec: 23.01,
      fov: 15,
      datetime: '1930-01-29T04:30:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'January 29: The second photograph is taken. Weeks of painstaking comparison lie ahead.',
    },
    {
      // Keyframe 4: The blink comparator
      ra: 101.29,
      dec: 23.01,
      fov: 8,
      datetime: '1930-02-18T16:00:00Z',
      holdDuration: 4000,
      transitionDuration: 2000,
      timeMode: 'instant',
      caption: 'February 18, 1930 - At the blink comparator, Tombaugh alternates between the two plates...',
    },
    {
      // Keyframe 5: Discovery!
      ra: 101.29,
      dec: 23.01,
      fov: 5,
      datetime: '1930-02-18T16:00:00Z',
      holdDuration: 5000,
      transitionDuration: 1000,
      timeMode: 'instant',
      caption: 'A faint dot jumps back and forth - something has moved! After months of searching, Tombaugh has found it.',
    },
    {
      // Keyframe 6: Confirmation period
      ra: 101.29,
      dec: 23.01,
      fov: 10,
      datetime: '1930-03-01T04:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'Weeks of additional observations confirm the discovery. At magnitude 15, it\'s too faint to see without a telescope.',
    },
    {
      // Keyframe 7: Announcement
      ra: 101.29,
      dec: 23.01,
      fov: 20,
      datetime: '1930-03-13T12:00:00Z',
      holdDuration: 4000,
      transitionDuration: 2000,
      timeMode: 'instant',
      caption: 'March 13, 1930 - The discovery is announced on the 149th anniversary of Uranus\'s discovery.',
    },
    {
      // Keyframe 8: Closing
      ra: 101.29,
      dec: 23.01,
      fov: 30,
      datetime: '1930-03-13T12:00:00Z',
      holdDuration: 5000,
      transitionDuration: 2000,
      timeMode: 'instant',
      caption: 'Named Pluto after the god of the underworld. In 2006, it was reclassified as a dwarf planet - but Tombaugh\'s discovery endures.',
    },
  ],
};

/**
 * Pale Blue Dot Tour - February 14, 1990
 *
 * On February 14, 1990, Voyager 1 turned its camera backward and captured
 * the iconic "Pale Blue Dot" image of Earth from 6 billion kilometers away.
 * This photograph, showing Earth as a tiny speck suspended in a sunbeam,
 * inspired Carl Sagan's famous reflection on our place in the cosmos.
 *
 * Voyager 1 position: ~40.11 AU from the Sun
 * Earth appears at magnitude ~28 (far below visibility, shown as iconic image)
 */
export const PALE_BLUE_DOT_TOUR: TourDefinition = {
  id: 'pale-blue-dot',
  name: 'Pale Blue Dot',
  description: "See Earth as Voyager 1 saw it from 6 billion kilometers away",
  viewMode: 'geocentric',  // Required for remote viewpoint to work correctly
  keyframes: [
    {
      // Start: Context from Earth - show Jupiter which Voyager passed years ago
      target: 'jupiter',
      fov: 20,
      datetime: '1990-02-14T00:00:00Z',
      holdDuration: 5000,
      transitionDuration: 1000,
      timeMode: 'instant',
      caption: 'February 14, 1990 - Voyager 1 has traveled for 12 years since leaving Earth...',
    },
    {
      // Show the outer solar system context
      target: 'saturn',
      fov: 30,
      datetime: '1990-02-14T02:00:00Z',
      holdDuration: 4000,
      transitionDuration: 3000,
      timeMode: 'instant',
      caption: 'Now 6 billion kilometers from home, beyond the orbit of Neptune...',
    },
    {
      // Transition to Voyager's view - look toward inner solar system
      // From Voyager's position (-26.67, 28.57, 12.31) AU, the Sun appears at ~RA 321°, Dec -33°
      ra: 321,
      dec: -33,
      fov: 60,
      datetime: '1990-02-14T04:48:00Z',
      holdDuration: 5000,
      transitionDuration: 2000,
      timeMode: 'instant',
      viewpoint: { type: 'spacecraft', spacecraft: 'voyager1' },
      caption: 'Carl Sagan convinced NASA to turn Voyager\'s camera backward for one last look at home...',
    },
    {
      // Zoom toward where Earth would be
      ra: 321,
      dec: -33,
      fov: 20,
      datetime: '1990-02-14T04:48:00Z',
      holdDuration: 5000,
      transitionDuration: 3000,
      timeMode: 'instant',
      viewpoint: { type: 'spacecraft', spacecraft: 'voyager1' },
      caption: 'Earth appears as a mere point of light, caught in a scattered ray of sunlight...',
    },
    {
      // Close zoom on the Pale Blue Dot
      ra: 321,
      dec: -33,
      fov: 5,
      datetime: '1990-02-14T04:48:00Z',
      holdDuration: 6000,
      transitionDuration: 3000,
      timeMode: 'instant',
      viewpoint: { type: 'spacecraft', spacecraft: 'voyager1' },
      caption: '"Look again at that dot. That\'s here. That\'s home. That\'s us."',
    },
    {
      // Hold on the image with Sagan quote
      ra: 321,
      dec: -33,
      fov: 5,
      datetime: '1990-02-14T04:48:00Z',
      holdDuration: 7000,
      transitionDuration: 1000,
      timeMode: 'instant',
      viewpoint: { type: 'spacecraft', spacecraft: 'voyager1' },
      caption: '"Everyone you love, everyone you know, everyone you ever heard of... lived there on a mote of dust suspended in a sunbeam."',
    },
    {
      // Return to Earth perspective
      target: 'sun',
      fov: 30,
      datetime: '1990-02-14T06:00:00Z',
      holdDuration: 5000,
      transitionDuration: 2000,
      timeMode: 'instant',
      // No viewpoint = back to geocentric
      caption: 'Voyager 1 continues its journey into interstellar space, now over 160 AU from the Sun.',
    },
  ],
};

/**
 * All predefined tours.
 */
export const PREDEFINED_TOURS: TourDefinition[] = [
  ECLIPSE_2024_TOUR,
  JUPITER_MOONS_TOUR,
  NEOWISE_2020_TOUR,
  HALE_BOPP_1997_TOUR,
  HALLEY_1986_TOUR,
  HALLEY_2061_TOUR,
  BETELGEUSE_NOVA_TOUR,
  SN_1054_TOUR,
  SN_1572_TOUR,
  SN_1604_TOUR,
  SN_1987A_TOUR,
  VENUS_TRANSIT_1769_TOUR,
  VENUS_TRANSIT_2012_TOUR,
  MERCURY_TRANSIT_2019_TOUR,
  GALILEO_JUPITER_TOUR,
  URANUS_DISCOVERY_TOUR,
  NEPTUNE_DISCOVERY_TOUR,
  PLUTO_DISCOVERY_TOUR,
  PALE_BLUE_DOT_TOUR,
];

/**
 * Get a tour by ID.
 */
export function getTourById(id: string): TourDefinition | undefined {
  return PREDEFINED_TOURS.find(tour => tour.id === id);
}
