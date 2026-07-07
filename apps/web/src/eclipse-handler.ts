/**
 * Eclipse navigation handler.
 */

import { getNextTotalSolarEclipse } from "./eclipseData";
import {
  computeLocalCircumstances,
  getEclipsePath,
  type EclipsePath,
  type LocalCircumstances,
} from "./eclipsePaths";
import { renderEclipsePathMapSvg } from "./eclipse-path-map";
import type { BodyPositions, Position3D } from "./body-positions";

export interface EclipseHandlerOptions {
  getDatetimeInputValue: () => string | undefined;
  setDatetimeInputValue: (value: string) => void;
  stopTimePlayback: () => void;
  applyTimeToEngine: (date: Date) => void;
  recomputeEngine: () => void;
  updateRenderer: () => void;
  getBodyPositions: () => BodyPositions;
  positionToRaDec: (pos: Position3D) => { ra: number; dec: number };
  calculateSunMoonSeparation: (bodyPos: BodyPositions) => number | null;
  updateEclipseRendering: (separation: number) => void;
  updateVideoMarkers: (bodyPos: BodyPositions) => void;
  animateToRaDec: (ra: number, dec: number, duration: number) => void;
  /** Current observer location (degrees). */
  getObserverLocation: () => { latitude: number; longitude: number };
  /** Move the observer to the given location (e.g. "navigate to path"). */
  setObserverLocation: (location: {
    latitude: number;
    longitude: number;
    name?: string;
  }) => void;
}

/**
 * Format a Date to datetime-local input value format.
 */
function formatDatetimeLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Format a duration in seconds as "Nm Ss" (or "Ss" for < 1 minute).
 */
function formatDuration(sec: number): string {
  const rounded = Math.round(sec);
  if (rounded < 60) return `${rounded}s`;
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

/**
 * Format a distance in km with sensible precision.
 */
function formatDistanceKm(km: number): string {
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/**
 * Render the path-aware section of the eclipse banner (distance readout, local
 * circumstances, mini-map) for the given path and observer location.
 */
function renderPathSection(
  path: EclipsePath,
  observer: { latitude: number; longitude: number }
): void {
  const section = document.getElementById("eclipse-path-section");
  const distanceEl = document.getElementById("eclipse-banner-distance");
  const circumstancesEl = document.getElementById("eclipse-banner-circumstances");
  const mapEl = document.getElementById("eclipse-path-map");
  const navBtn = document.getElementById("eclipse-navigate-btn");

  const circ: LocalCircumstances = computeLocalCircumstances(path, {
    lat: observer.latitude,
    lon: observer.longitude,
  });

  if (distanceEl) {
    distanceEl.textContent = circ.insidePath
      ? `Inside the path — ${formatDistanceKm(circ.distanceKm)} from the center line`
      : `You are ${formatDistanceKm(circ.distanceKm)} from the center line`;
  }

  if (circumstancesEl) {
    if (circ.insidePath && circ.localDurationSec > 0) {
      circumstancesEl.textContent = `Local totality ≈ ${formatDuration(
        circ.localDurationSec
      )}`;
    } else {
      circumstancesEl.textContent = "No totality here — navigate to the path";
    }
  }

  if (mapEl) {
    mapEl.innerHTML = renderEclipsePathMapSvg(
      path,
      { lat: observer.latitude, lon: observer.longitude },
      circ.nearest
    );
  }

  if (navBtn) {
    navBtn.textContent = circ.insidePath
      ? "Recenter on path"
      : "Navigate to path";
  }

  if (section) {
    section.classList.remove("hidden");
  }
}

/**
 * Create an eclipse navigation handler.
 */
export function createEclipseHandler(options: EclipseHandlerOptions): () => void {
  const {
    getDatetimeInputValue,
    setDatetimeInputValue,
    stopTimePlayback,
    applyTimeToEngine,
    recomputeEngine,
    updateRenderer,
    getBodyPositions,
    positionToRaDec,
    calculateSunMoonSeparation,
    updateEclipseRendering,
    updateVideoMarkers,
    animateToRaDec,
    getObserverLocation,
    setObserverLocation,
  } = options;

  // The path currently shown in the banner, used by the navigate button.
  let activePath: EclipsePath | null = null;

  // Wire the "navigate to path" button once. It reads the active path and the
  // current observer at click time so it always acts on the shown eclipse.
  const navBtn = document.getElementById("eclipse-navigate-btn");
  navBtn?.addEventListener("click", () => {
    if (!activePath) return;
    const observer = getObserverLocation();
    const { nearest } = computeLocalCircumstances(activePath, {
      lat: observer.latitude,
      lon: observer.longitude,
    });
    setObserverLocation({
      latitude: nearest.lat,
      longitude: nearest.lon,
      name: `${activePath.label} center line`,
    });
    // Refresh the readouts/map against the new observer location.
    renderPathSection(activePath, getObserverLocation());
  });

  return function handleNextEclipse(): void {
    stopTimePlayback();

    // Get current date from datetime input or use now
    // Add 1 minute buffer to avoid re-selecting the same eclipse
    const currentValue = getDatetimeInputValue();
    const currentTime = currentValue ? new Date(currentValue) : new Date();
    const searchTime = new Date(currentTime.getTime() + 60 * 1000);
    const nextEclipse = getNextTotalSolarEclipse(searchTime);

    if (nextEclipse) {
      const eclipseDate = new Date(nextEclipse.datetime);

      // Update the datetime input
      setDatetimeInputValue(formatDatetimeLocal(eclipseDate));

      // Update the engine directly
      applyTimeToEngine(eclipseDate);
      recomputeEngine();
      updateRenderer();

      // Get updated body positions
      const bodyPos = getBodyPositions();

      // Update eclipse rendering (shows corona)
      const sunMoonSep = calculateSunMoonSeparation(bodyPos);
      if (sunMoonSep !== null) {
        updateEclipseRendering(sunMoonSep);
      }

      const sunPos = bodyPos.get("Sun");
      const moonPos = bodyPos.get("Moon");

      // Update video markers with new body positions
      updateVideoMarkers(bodyPos);

      if (sunPos) {
        const sunRaDec = positionToRaDec(sunPos);
        animateToRaDec(sunRaDec.ra, sunRaDec.dec, 1000);

        // Update eclipse banner with separation
        if (moonPos) {
          const separation = calculateSunMoonSeparation(bodyPos);
          const sepEl = document.getElementById("eclipse-banner-sep");
          if (sepEl && separation !== null) {
            sepEl.textContent = separation.toFixed(2);
          }
        }
      }

      // Show eclipse info banner
      const eclipseBanner = document.getElementById("eclipse-banner");
      const dateEl = document.getElementById("eclipse-banner-date");
      const pathEl = document.getElementById("eclipse-banner-path");
      const durationEl = document.getElementById("eclipse-banner-duration");

      if (eclipseBanner) {
        if (dateEl) {
          dateEl.textContent = eclipseDate.toLocaleDateString("en-US", {
            year: "numeric", month: "short", day: "numeric",
            hour: "2-digit", minute: "2-digit", timeZone: "UTC"
          }) + " UTC";
        }
        if (pathEl) pathEl.textContent = nextEclipse.path;
        if (durationEl) durationEl.textContent = String(nextEclipse.durationSec);
        eclipseBanner.classList.remove("hidden");
      }

      // Location-aware path section: center line, distance, local
      // circumstances and navigate-to-path.
      activePath = getEclipsePath(nextEclipse.datetime);
      const pathSection = document.getElementById("eclipse-path-section");
      if (activePath) {
        renderPathSection(activePath, getObserverLocation());
      } else if (pathSection) {
        pathSection.classList.add("hidden");
      }

      console.log(`Next total solar eclipse: ${nextEclipse.datetime}`);
      console.log(`Path: ${nextEclipse.path}`);
      console.log(`Duration: ${nextEclipse.durationSec}s`);
    } else {
      console.log("No more total solar eclipses in the catalog (extends to 2045)");
    }
  };
}
