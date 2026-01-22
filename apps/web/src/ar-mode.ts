/**
 * AR Mode (Device Orientation) management.
 */

import { createDeviceOrientationManager } from "./deviceOrientation";

export interface ARModeOptions {
  onOrientationChange: (altitude: number, azimuth: number) => void;
  setControlsEnabled: (enabled: boolean) => void;
  onModeChange: (enabled: boolean) => void;
}

export interface ARModeManager {
  isEnabled: () => boolean;
  toggle: () => Promise<void>;
  disable: () => void;
  setupEventListeners: () => void;
}

/**
 * Create an AR mode manager for device orientation control.
 */
export function createARModeManager(options: ARModeOptions): ARModeManager {
  const { onOrientationChange, setControlsEnabled, onModeChange } = options;

  let enabled = false;

  // Get DOM elements
  const arModeBtn = document.getElementById("ar-mode-btn");
  const arToggleMobile = document.getElementById("ar-toggle-mobile");
  const arModeStatus = document.getElementById("ar-mode-status");

  // Create device orientation manager
  const deviceOrientation = createDeviceOrientationManager({
    onOrientationChange: (data) => {
      if (enabled) {
        onOrientationChange(data.altitude, data.azimuth);
      }
    },
    onStateChange: (state) => {
      if (arModeBtn) {
        arModeBtn.classList.toggle("active", state.enabled);
      }
      if (arToggleMobile) {
        arToggleMobile.classList.toggle("active", state.enabled);
      }
    },
  });

  function updateUI(isEnabled: boolean, message?: string): void {
    if (arModeBtn) {
      arModeBtn.classList.toggle("active", isEnabled);
      arModeBtn.setAttribute("aria-pressed", String(isEnabled));
    }
    if (arToggleMobile) {
      arToggleMobile.classList.toggle("active", isEnabled);
      arToggleMobile.setAttribute("aria-pressed", String(isEnabled));
    }
    if (arModeStatus) {
      arModeStatus.textContent = message ?? "";
      arModeStatus.classList.toggle("visible", !!message);
    }
  }

  function disable(): void {
    if (!enabled) return;
    deviceOrientation.stop();
    setControlsEnabled(true);
    enabled = false;
    updateUI(false);
    onModeChange(false);
  }

  async function toggle(): Promise<void> {
    if (!deviceOrientation.isSupported()) {
      updateUI(false, "Not supported on this device");
      setTimeout(() => updateUI(false), 3000);
      return;
    }

    if (enabled) {
      // Disable AR mode
      disable();
      return;
    }

    // Enable AR mode
    if (deviceOrientation.requiresPermission()) {
      const granted = await deviceOrientation.requestPermission();
      if (!granted) {
        updateUI(false, "Permission denied");
        setTimeout(() => updateUI(false), 3000);
        return;
      }
    }

    deviceOrientation.start();
    setControlsEnabled(false);
    enabled = true;
    updateUI(true);
    onModeChange(true);
  }

  function setupEventListeners(): void {
    const isSupported = deviceOrientation.isSupported();

    // Setup main AR button (in controls panel)
    if (arModeBtn) {
      if (!isSupported) {
        arModeBtn.classList.add("unsupported");
        arModeBtn.title = "Device orientation not supported";
      } else {
        arModeBtn.addEventListener("click", () => {
          void toggle();
        });
      }
    }

    // Setup mobile AR toggle button (floating at top right)
    if (arToggleMobile) {
      if (!isSupported) {
        arToggleMobile.classList.add("unsupported");
        arToggleMobile.title = "Device orientation not supported";
      } else {
        arToggleMobile.addEventListener("click", () => {
          void toggle();
        });
      }
    }
  }

  return {
    isEnabled: () => enabled,
    toggle,
    disable,
    setupEventListeners,
  };
}
