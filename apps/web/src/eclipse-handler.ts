/**
 * Eclipse navigation handler.
 */

import { getNextTotalSolarEclipse } from "./eclipseData";

export interface EclipseHandlerOptions {
  getDatetimeInputValue: () => string | undefined;
  setDatetimeInputValue: (value: string) => void;
  stopTimePlayback: () => void;
  applyTimeToEngine: (date: Date) => void;
  recomputeEngine: () => void;
  updateRenderer: () => void;
  getBodyPositions: () => Map<string, { x: number; y: number; z: number }>;
  positionToRaDec: (pos: { x: number; y: number; z: number }) => { ra: number; dec: number };
  calculateSunMoonSeparation: (bodyPos: Map<string, { x: number; y: number; z: number }>) => number | null;
  updateEclipseRendering: (separation: number) => void;
  updateVideoMarkers: (bodyPos: Map<string, { x: number; y: number; z: number }>) => void;
  animateToRaDec: (ra: number, dec: number, duration: number) => void;
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
  } = options;

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

      console.log(`Next total solar eclipse: ${nextEclipse.datetime}`);
      console.log(`Path: ${nextEclipse.path}`);
      console.log(`Duration: ${nextEclipse.durationSec}s`);
    } else {
      console.log("No more total solar eclipses in the catalog (extends to 2045)");
    }
  };
}
