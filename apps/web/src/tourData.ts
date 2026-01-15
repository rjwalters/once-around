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
