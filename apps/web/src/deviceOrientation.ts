/**
 * Device Orientation Manager
 * Handles device orientation API, iOS permission requests, and sensor smoothing.
 * Pure math lives in geometry/device-orientation.ts.
 */

import * as THREE from "three";
import {
  compassHeadingToAlpha,
  deviceOrientationToAltAz,
  deviceOrientationToQuaternion,
} from "./geometry/device-orientation";

// iOS Safari exposes a true compass heading on orientation events
interface DeviceOrientationEventiOS extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

export interface DeviceOrientationState {
  supported: boolean;
  permissionRequired: boolean;
  permissionGranted: boolean;
  enabled: boolean;
}

export interface DeviceOrientationManager {
  getState(): DeviceOrientationState;
  isSupported(): boolean;
  requiresPermission(): boolean;
  requestPermission(): Promise<boolean>;
  start(): void;
  stop(): void;
  getQuaternion(): THREE.Quaternion;
}

interface DeviceOrientationCallbacks {
  onOrientationChange: (data: { quaternion: THREE.Quaternion; altitude: number; azimuth: number }) => void;
  onStateChange: (state: DeviceOrientationState) => void;
}

// Smoothing factor (0-1): higher = more responsive, lower = smoother
const SMOOTHING_FACTOR = 0.3;

/**
 * Check if device orientation API is available
 */
function checkSupport(): boolean {
  return "DeviceOrientationEvent" in window;
}

/**
 * Check if permission request is required (iOS 13+)
 */
function checkPermissionRequired(): boolean {
  return (
    typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
      .requestPermission === "function"
  );
}

/**
 * Create a device orientation manager
 */
export function createDeviceOrientationManager(
  callbacks: DeviceOrientationCallbacks
): DeviceOrientationManager {
  let state: DeviceOrientationState = {
    supported: checkSupport(),
    permissionRequired: checkPermissionRequired(),
    permissionGranted: false,
    enabled: false,
  };

  // Current and smoothed quaternions
  let currentQuaternion = new THREE.Quaternion();
  let targetQuaternion = new THREE.Quaternion();

  // Event handler reference for cleanup
  let orientationHandler: ((event: DeviceOrientationEvent) => void) | null = null;
  let orientationEventName: "deviceorientation" | "deviceorientationabsolute" = "deviceorientation";

  function updateState(updates: Partial<DeviceOrientationState>): void {
    state = { ...state, ...updates };
    callbacks.onStateChange(state);
  }

  function handleOrientation(event: DeviceOrientationEvent): void {
    if (event.alpha === null || event.beta === null || event.gamma === null) {
      return;
    }

    // iOS never fires deviceorientationabsolute and its alpha has an arbitrary
    // zero point, but Safari provides a true compass heading — prefer it so
    // azimuth is north-referenced.
    const compassAlpha = compassHeadingToAlpha(
      (event as DeviceOrientationEventiOS).webkitCompassHeading
    );
    const alpha = compassAlpha ?? event.alpha;

    // Build the full device→ENU orientation (including roll) as the SLERP
    // target. Smoothing is applied once, on the quaternion, to avoid the
    // double-filtering that a separate alt/az filter would introduce.
    targetQuaternion = deviceOrientationToQuaternion(alpha, event.beta, event.gamma);
    currentQuaternion.slerp(targetQuaternion, SMOOTHING_FACTOR);

    // Alt/az are still derived from the raw angles for the coordinate readout.
    // (The camera orientation itself is driven by the quaternion above.)
    const { altitude, azimuth } = deviceOrientationToAltAz(alpha, event.beta, event.gamma);

    callbacks.onOrientationChange({
      quaternion: currentQuaternion.clone(),
      altitude,
      azimuth,
    });
  }

  async function requestPermission(): Promise<boolean> {
    if (!state.supported) {
      return false;
    }

    if (!state.permissionRequired) {
      // No permission needed, assume granted
      updateState({ permissionGranted: true });
      return true;
    }

    try {
      const DeviceOrientationEventWithPermission = DeviceOrientationEvent as unknown as {
        requestPermission: () => Promise<"granted" | "denied">;
      };

      const result = await DeviceOrientationEventWithPermission.requestPermission();
      const granted = result === "granted";
      updateState({ permissionGranted: granted });
      return granted;
    } catch (error) {
      console.error("Failed to request device orientation permission:", error);
      updateState({ permissionGranted: false });
      return false;
    }
  }

  function start(): void {
    if (!state.supported || state.enabled) {
      return;
    }

    if (state.permissionRequired && !state.permissionGranted) {
      console.warn("Cannot start device orientation: permission not granted");
      return;
    }

    // Android Chrome's plain deviceorientation alpha is relative to an
    // arbitrary startup heading; the absolute variant is north-referenced.
    // (iOS lacks the absolute event but compensates via webkitCompassHeading.)
    orientationEventName =
      "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    orientationHandler = handleOrientation;
    window.addEventListener(
      orientationEventName,
      orientationHandler as EventListener,
      true
    );
    updateState({ enabled: true });
  }

  function stop(): void {
    if (!state.enabled || !orientationHandler) {
      return;
    }

    window.removeEventListener(orientationEventName, orientationHandler as EventListener, true);
    orientationHandler = null;
    updateState({ enabled: false });
  }

  return {
    getState: () => ({ ...state }),
    isSupported: () => state.supported,
    requiresPermission: () => state.permissionRequired,
    requestPermission,
    start,
    stop,
    getQuaternion: () => currentQuaternion.clone(),
  };
}
