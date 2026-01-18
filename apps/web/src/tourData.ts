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
];

/**
 * Get a tour by ID.
 */
export function getTourById(id: string): TourDefinition | undefined {
  return PREDEFINED_TOURS.find(tour => tour.id === id);
}
