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
  getState(): LocationState;
  setLocation(location: ObserverLocation): void;
  setLocationFromCity(city: City): void;
  requestGeolocation(): Promise<ObserverLocation | null>;
  searchCities(query: string, signal?: AbortSignal): Promise<City[]>;
}

interface LocationCallbacks {
  onLocationChange: (location: ObserverLocation) => void;
  onStateChange?: (state: LocationState) => void;
}

export interface LocationState {
  location: ObserverLocation;
  source: "selected" | "gps";
  status: "idle" | "acquiring" | "ready" | "error";
  accuracy: number | null;
  timestamp: number | null;
  error: string | null;
}

/** Always identify the site still in use, including when GPS fails. */
export function formatObservingLocation(state: LocationState): string {
  const site = `${state.location.name ?? "Custom"} (${formatLocationShort(state.location)})`;
  const source = state.source === "gps" ? "GPS fix" : "Selected site";
  const accuracy = state.source === "gps" && state.accuracy !== null
    ? `, ±${Math.round(state.accuracy)} m` : "";
  const when = state.timestamp !== null ? ` at ${new Date(state.timestamp).toLocaleTimeString()}` : "";
  const location = `${source}: ${site}${accuracy}${when}`;
  if (state.status === "acquiring") return `Getting current location…\nUsing ${location}`;
  if (state.error) return `${state.error}\nUsing ${location}. Choose a site in Location if needed.`;
  return location;
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
  // Persisted coordinates are a selected site, never proof of a fresh GPS fix.
  let state: LocationState = {
    location: currentLocation, source: "selected", status: "idle",
    accuracy: null, timestamp: null, error: null,
  };
  let requestId = 0;

  function getState(): LocationState {
    return { ...state, location: getLocation() };
  }

  function notify(): void {
    callbacks.onStateChange?.(getState());
  }

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

    // A manual choice supersedes any in-flight GPS request.
    requestId++;
    currentLocation = {
      latitude: location.latitude,
      longitude: location.longitude,
      name: location.name ?? "Custom",
    };

    state = { location: currentLocation, source: "selected", status: "ready",
      accuracy: null, timestamp: null, error: null };
    callbacks.onLocationChange(getLocation());
    notify();
  }

  function setLocationFromCity(city: City): void {
    setLocation({
      latitude: city.lat,
      longitude: city.lon,
      name: `${city.name}, ${city.country}`,
    });
  }

  async function requestGeolocation(): Promise<ObserverLocation | null> {
    const id = ++requestId;
    state = { ...state, status: "acquiring", error: null };
    notify();

    function fail(message: string): null {
      if (id === requestId) {
        state = { ...state, status: "error", error: message };
        notify();
      }
      return null;
    }

    if (!navigator.geolocation) return fail("Location is unavailable in this browser.");

    return new Promise((resolve) => {
      try {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (id !== requestId) { resolve(null); return; }
            if (!isValidLatitude(position.coords.latitude) || !isValidLongitude(position.coords.longitude)) {
              resolve(fail("Location returned invalid coordinates."));
              return;
            }
            const location: ObserverLocation = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              name: "My Location",
            };
            currentLocation = location;
            state = { location, source: "gps", status: "ready",
              accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
              timestamp: position.timestamp, error: null };
            callbacks.onLocationChange(getLocation());
            notify();
            resolve(getLocation());
          },
          (error) => {
            const message = error.code === 1 ? "Location permission denied."
              : error.code === 3 ? "Location request timed out." : "Current location is unavailable.";
            resolve(fail(message));
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          }
        );
      } catch {
        resolve(fail("Current location is unavailable."));
      }
    });
  }

  return {
    getLocation,
    getState,
    setLocation,
    setLocationFromCity,
    requestGeolocation,
    searchCities: (query: string, signal?: AbortSignal) => searchCities(query, 8, signal),
  };
}
