import type { SkyEngine } from "./wasm/sky_engine";

// Default limiting magnitude (dark sky / naked eye limit)
export const DEFAULT_MAG_LIMIT = 6.5;

export interface UICallbacks {
  onTimeChange: (date: Date) => void;
  onMagnitudeChange: (mag: number) => void;
}

/**
 * Get a description of sky conditions for a given limiting magnitude.
 */
function getSkyConditionHint(mag: number): string {
  if (mag <= 2) return "Bright city center";
  if (mag <= 3) return "Urban sky";
  if (mag <= 4) return "Suburban sky";
  if (mag <= 5) return "Rural sky";
  if (mag <= 6) return "Dark site";
  if (mag <= 6.5) return "Dark sky (naked eye limit)";
  if (mag <= 8) return "Binocular range";
  if (mag <= 10) return "Small telescope";
  return "Deep sky telescope";
}

export function setupUI(engine: SkyEngine, callbacks: UICallbacks): void {
  const datetimeInput = document.getElementById("datetime") as HTMLInputElement | null;
  const magnitudeInput = document.getElementById("magnitude") as HTMLInputElement | null;
  const magValue = document.getElementById("mag-value");
  const magHint = document.getElementById("mag-hint");
  const starCount = document.getElementById("star-count");
  const totalStars = document.getElementById("total-stars");

  if (!datetimeInput || !magnitudeInput) {
    console.warn("UI elements not found");
    return;
  }

  // Initialize datetime to current UTC time
  const now = new Date();
  datetimeInput.value = toLocalDatetimeString(now);

  // Set initial magnitude from slider (which has default in HTML)
  const initialMag = parseFloat(magnitudeInput.value);
  engine.set_mag_limit(initialMag);
  engine.recompute();

  // Update magnitude display
  function updateMagDisplay(mag: number): void {
    if (magValue) {
      magValue.textContent = mag.toFixed(1);
    }
    if (magHint) {
      magHint.textContent = getSkyConditionHint(mag);
    }
  }
  updateMagDisplay(initialMag);

  // Update star counts
  function updateStats(): void {
    if (starCount) {
      starCount.textContent = engine.visible_stars().toString();
    }
    if (totalStars) {
      totalStars.textContent = engine.total_stars().toString();
    }
  }
  updateStats();

  // Datetime change handler
  datetimeInput.addEventListener("change", () => {
    const date = parseDatetimeLocal(datetimeInput.value);
    if (date) {
      callbacks.onTimeChange(date);
      updateStats();
    }
  });

  // Magnitude change handler
  magnitudeInput.addEventListener("input", () => {
    const mag = parseFloat(magnitudeInput.value);
    updateMagDisplay(mag);
    callbacks.onMagnitudeChange(mag);
    updateStats();
  });
}

/**
 * Convert Date to local datetime string for input element.
 * Format: YYYY-MM-DDTHH:MM
 */
function toLocalDatetimeString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Parse a datetime-local input value as local time.
 * The datetime-local input returns "YYYY-MM-DDTHH:MM" without timezone.
 * Using new Date() on this string can be interpreted as UTC in some browsers,
 * so we explicitly parse and construct the Date as local time.
 */
export function parseDatetimeLocal(value: string): Date | null {
  // Expected format: "YYYY-MM-DDTHH:MM" or "YYYY-MM-DDTHH:MM:SS"
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1; // JS months are 0-indexed
  const day = parseInt(match[3], 10);
  const hours = parseInt(match[4], 10);
  const minutes = parseInt(match[5], 10);
  const seconds = match[6] ? parseInt(match[6], 10) : 0;

  // Construct Date using local time components
  const date = new Date(year, month, day, hours, minutes, seconds);

  // Validate the date is valid
  if (isNaN(date.getTime())) return null;

  return date;
}

/**
 * Apply engine time from a Date object.
 * Converts local time to UTC for the engine.
 */
export function applyTimeToEngine(engine: SkyEngine, date: Date): void {
  engine.set_time_utc(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1, // JS months are 0-indexed
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds() + date.getUTCMilliseconds() / 1000
  );
}
