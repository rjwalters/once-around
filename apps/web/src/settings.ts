/**
 * Settings persistence module.
 * Saves and restores user preferences to localStorage with debouncing.
 */

const STORAGE_KEY = "once-around-settings";
const DEBOUNCE_MS = 500;

// Increment this when coordinate system or camera orientation changes
// to invalidate old saved camera quaternions
const SETTINGS_VERSION = 2;

export interface Settings {
  // Settings schema version (for migration)
  version: number;

  // Camera state
  cameraQuaternion: { x: number; y: number; z: number; w: number };
  fov: number;

  // Time and display settings
  datetime: string; // ISO string
  magnitude: number;

  // UI toggles
  constellationsVisible: boolean;
  labelsVisible: boolean;
  videosVisible: boolean;
  orbitsVisible: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  cameraQuaternion: { x: 0, y: 0, z: 0, w: 1 },
  fov: 60,
  datetime: new Date().toISOString(),
  magnitude: 6.5,
  constellationsVisible: false,
  labelsVisible: false,
  videosVisible: true,
  orbitsVisible: false,
};

/**
 * Load settings from localStorage.
 * Returns default settings if none exist or on parse error.
 * Resets camera quaternion if settings version changed (coordinate system fix).
 */
export function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { ...DEFAULT_SETTINGS };
    }
    const parsed = JSON.parse(stored);
    // Merge with defaults to handle missing fields from older versions
    const settings = { ...DEFAULT_SETTINGS, ...parsed };

    // Check version - reset camera quaternion if outdated (coordinate system changed)
    if (!parsed.version || parsed.version < SETTINGS_VERSION) {
      console.log("Settings version changed, resetting camera orientation");
      settings.version = SETTINGS_VERSION;
      settings.cameraQuaternion = DEFAULT_SETTINGS.cameraQuaternion;
    }

    return settings;
  } catch {
    console.warn("Failed to load settings, using defaults");
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save settings to localStorage immediately.
 */
function saveSettingsImmediate(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn("Failed to save settings:", err);
  }
}

/**
 * Create a debounced settings saver.
 * Returns a function that saves settings after a delay,
 * coalescing multiple rapid calls into a single save.
 */
export function createSettingsSaver(): {
  save: (settings: Partial<Settings>) => void;
  flush: () => void;
} {
  let currentSettings = loadSettings();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function save(updates: Partial<Settings>): void {
    // Merge updates into current settings
    currentSettings = { ...currentSettings, ...updates };

    // Clear any pending save
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    // Schedule a new save
    timeoutId = setTimeout(() => {
      saveSettingsImmediate(currentSettings);
      timeoutId = null;
    }, DEBOUNCE_MS);
  }

  function flush(): void {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
      saveSettingsImmediate(currentSettings);
    }
  }

  return { save, flush };
}
