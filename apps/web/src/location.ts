/**
 * Observer Location Manager
 * Handles location selection, geolocation, and coordinate display.
 */

import { DEFAULT_LOCATION, searchCities, type City } from "./cityData";

export interface ObserverLocation {
  latitude: number; // -90 to +90, positive = North
  longitude: number; // -180 to +180, positive = East
  name?: string; // Display name (city name or "Custom")
}

export interface LocationManager {
  getLocation(): ObserverLocation;
  setLocation(location: ObserverLocation): void;
  setLocationFromCity(city: City): void;
  requestGeolocation(): Promise<ObserverLocation | null>;
  searchCities(query: string): City[];
}

interface LocationCallbacks {
  onLocationChange: (location: ObserverLocation) => void;
}

/**
 * Format latitude for display (e.g., "37.77° N")
 */
export function formatLatitude(lat: number): string {
  const absLat = Math.abs(lat);
  const dir = lat >= 0 ? "N" : "S";
  return `${absLat.toFixed(2)}° ${dir}`;
}

/**
 * Format longitude for display (e.g., "122.42° W")
 */
export function formatLongitude(lon: number): string {
  const absLon = Math.abs(lon);
  const dir = lon >= 0 ? "E" : "W";
  return `${absLon.toFixed(2)}° ${dir}`;
}

/**
 * Format location for compact display (e.g., "37.77° N, 122.42° W")
 */
export function formatLocationShort(location: ObserverLocation): string {
  return `${formatLatitude(location.latitude)}, ${formatLongitude(location.longitude)}`;
}

/**
 * Validate latitude value
 */
export function isValidLatitude(lat: number): boolean {
  return !isNaN(lat) && lat >= -90 && lat <= 90;
}

/**
 * Validate longitude value
 */
export function isValidLongitude(lon: number): boolean {
  return !isNaN(lon) && lon >= -180 && lon <= 180;
}

/**
 * Create a location manager instance
 */
export function createLocationManager(
  initialLocation: ObserverLocation | null,
  callbacks: LocationCallbacks
): LocationManager {
  // Start with provided location or default to San Francisco
  let currentLocation: ObserverLocation = initialLocation ?? {
    latitude: DEFAULT_LOCATION.lat,
    longitude: DEFAULT_LOCATION.lon,
    name: DEFAULT_LOCATION.name,
  };

  function getLocation(): ObserverLocation {
    return { ...currentLocation };
  }

  function setLocation(location: ObserverLocation): void {
    // Validate coordinates
    if (!isValidLatitude(location.latitude)) {
      console.warn("Invalid latitude:", location.latitude);
      return;
    }
    if (!isValidLongitude(location.longitude)) {
      console.warn("Invalid longitude:", location.longitude);
      return;
    }

    currentLocation = {
      latitude: location.latitude,
      longitude: location.longitude,
      name: location.name ?? "Custom",
    };

    callbacks.onLocationChange(currentLocation);
  }

  function setLocationFromCity(city: City): void {
    setLocation({
      latitude: city.lat,
      longitude: city.lon,
      name: `${city.name}, ${city.country}`,
    });
  }

  async function requestGeolocation(): Promise<ObserverLocation | null> {
    if (!("geolocation" in navigator)) {
      console.warn("Geolocation not supported");
      return null;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location: ObserverLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            name: "My Location",
          };
          setLocation(location);
          resolve(location);
        },
        (error) => {
          console.warn("Geolocation error:", error.message);
          resolve(null);
        },
        {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 300000, // Cache for 5 minutes
        }
      );
    });
  }

  return {
    getLocation,
    setLocation,
    setLocationFromCity,
    requestGeolocation,
    searchCities: (query: string) => searchCities(query, 8),
  };
}
