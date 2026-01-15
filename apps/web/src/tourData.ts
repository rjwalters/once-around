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
 *
 * Sun position on April 8: RA ~17°, Dec ~7°
 */
export const ECLIPSE_2024_TOUR: TourDefinition = {
  id: 'eclipse-2024',
  name: '2024 Total Solar Eclipse',
  description: 'Watch the April 8, 2024 eclipse from partial phase through totality',
  keyframes: [
    {
      // Start: 45 minutes before totality, wide view
      ra: 17.5,
      dec: 7.2,
      fov: 40,
      datetime: '2024-04-08T17:32:16Z',
      holdDuration: 3000,
      transitionDuration: 1000,
      timeMode: 'instant',
      caption: 'April 8, 2024 - The Great North American Eclipse begins...',
    },
    {
      // 30 minutes before: partial eclipse underway, zoom in a bit
      ra: 17.5,
      dec: 7.2,
      fov: 15,
      datetime: '2024-04-08T17:47:16Z',
      holdDuration: 3000,
      transitionDuration: 4000,
      timeMode: 'animate',
      caption: 'The Moon begins to cover the Sun',
    },
    {
      // 15 minutes before: more coverage
      ra: 17.5,
      dec: 7.2,
      fov: 8,
      datetime: '2024-04-08T18:02:16Z',
      holdDuration: 2500,
      transitionDuration: 4000,
      timeMode: 'animate',
      caption: 'The partial phase deepens',
    },
    {
      // 5 minutes before: zoomed in, approaching totality
      ra: 17.5,
      dec: 7.2,
      fov: 4,
      datetime: '2024-04-08T18:12:16Z',
      holdDuration: 2000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'Almost there... the light fades',
    },
    {
      // Maximum eclipse (totality)
      ra: 17.5,
      dec: 7.2,
      fov: 3,
      datetime: '2024-04-08T18:17:16Z',
      holdDuration: 5000,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'TOTALITY! The solar corona is revealed',
    },
    {
      // 2 minutes after totality peak
      ra: 17.5,
      dec: 7.2,
      fov: 3,
      datetime: '2024-04-08T18:19:30Z',
      holdDuration: 3000,
      transitionDuration: 2000,
      timeMode: 'animate',
      caption: 'Diamond ring effect as totality ends',
    },
    {
      // 10 minutes after: Moon moving away
      ra: 17.5,
      dec: 7.2,
      fov: 8,
      datetime: '2024-04-08T18:27:16Z',
      holdDuration: 2500,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'The Moon continues its journey',
    },
    {
      // Final view: wide shot, 30 minutes after
      ra: 17.5,
      dec: 7.2,
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
 * Jupiter position June 2024: RA ~65°, Dec ~23°
 */
export const JUPITER_MOONS_TOUR: TourDefinition = {
  id: 'jupiter-moons',
  name: "Jupiter's Galilean Moons",
  description: 'Watch the dance of Io, Europa, Ganymede, and Callisto',
  keyframes: [
    {
      // Start: Jupiter in view
      ra: 65,
      dec: 23,
      fov: 20,
      datetime: '2024-06-15T00:00:00Z',
      holdDuration: 3000,
      transitionDuration: 1000,
      timeMode: 'instant',
      caption: 'Jupiter and its four Galilean moons',
    },
    {
      // Zoom in to see moons clearly
      ra: 65,
      dec: 23,
      fov: 1.5,
      datetime: '2024-06-15T00:00:00Z',
      holdDuration: 3000,
      transitionDuration: 2000,
      timeMode: 'instant',
      caption: 'Io, Europa, Ganymede, and Callisto orbit Jupiter',
    },
    {
      // +6 hours: Io has moved noticeably
      ra: 65,
      dec: 23,
      fov: 1.5,
      datetime: '2024-06-15T06:00:00Z',
      holdDuration: 2500,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'Io completes an orbit every 42 hours',
    },
    {
      // +12 hours
      ra: 65,
      dec: 23,
      fov: 1.5,
      datetime: '2024-06-15T12:00:00Z',
      holdDuration: 2500,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'Europa orbits in 3.5 days',
    },
    {
      // +18 hours
      ra: 65,
      dec: 23,
      fov: 1.5,
      datetime: '2024-06-15T18:00:00Z',
      holdDuration: 2500,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'Ganymede, the largest moon in the solar system',
    },
    {
      // +24 hours
      ra: 65,
      dec: 23,
      fov: 1.5,
      datetime: '2024-06-16T00:00:00Z',
      holdDuration: 2500,
      transitionDuration: 3000,
      timeMode: 'animate',
      caption: 'One Earth day has passed',
    },
    {
      // +36 hours
      ra: 65,
      dec: 23,
      fov: 1.5,
      datetime: '2024-06-16T12:00:00Z',
      holdDuration: 2500,
      transitionDuration: 4000,
      timeMode: 'animate',
      caption: 'Callisto orbits farthest out, taking 17 days',
    },
    {
      // +42 hours: Io completes one orbit
      ra: 65,
      dec: 23,
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
 * All predefined tours.
 */
export const PREDEFINED_TOURS: TourDefinition[] = [
  ECLIPSE_2024_TOUR,
  JUPITER_MOONS_TOUR,
];

/**
 * Get a tour by ID.
 */
export function getTourById(id: string): TourDefinition | undefined {
  return PREDEFINED_TOURS.find(tour => tour.id === id);
}
