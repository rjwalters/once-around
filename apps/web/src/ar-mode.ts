/**
 * AR Mode (Device Orientation) management.
 */

import * as THREE from "three";
import { createDeviceOrientationManager } from "./deviceOrientation";

export interface ARModeOptions {
  onOrientationChange: (data: {
    quaternion: THREE.Quaternion;
    altitude: number;
    azimuth: number;
  }) => void;
  setControlsEnabled: (enabled: boolean) => void;
  onModeChange: (enabled: boolean) => void;
  onBeforeEnable?: () => void;
}

export interface ARModeManager {
  isEnabled: () => boolean;
  toggle: () => Promise<void>;
  disable: () => void;
  setStatusMessage: (message: string) => void;
  setupEventListeners: () => void;
}

/**
 * Create an AR mode manager for device orientation control.
 */
export function createARModeManager(options: ARModeOptions): ARModeManager {
  const { onOrientationChange, setControlsEnabled, onModeChange } = options;

  let enabled = false;
  let statusMessage = "";
  let sensorMessage = "";

  // Get DOM elements
  const arModeBtn = document.getElementById("ar-mode-btn");
  const arToggleMobile = document.getElementById("ar-toggle-mobile");
  const arModeStatus = document.getElementById("ar-mode-status");

  // Create device orientation manager
  const deviceOrientation = createDeviceOrientationManager({
    onOrientationChange: (data) => {
      if (enabled) {
        onOrientationChange(data);
      }
    },
    onStateChange: (state) => {
      // Keep sensor validity independent of clock/GPS status. In particular,
      // a later GPS success must not erase a stale or unavailable compass.
      sensorMessage = state.sensorMessage ?? "";
      if (enabled) updateUI(true);
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
      const text = message ?? (isEnabled ? [sensorMessage, statusMessage].filter(Boolean).join(" ") : "");
      arModeStatus.textContent = text;
      arModeStatus.classList.toggle("visible", !!text);
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
        updateUI(false, deviceOrientation.getState().sensorMessage ?? "Permission denied");
        return;
      }
    }

    options.onBeforeEnable?.();
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
    setStatusMessage: (message) => {
      statusMessage = message;
      if (enabled) updateUI(true);
    },
    setupEventListeners,
  };
}
