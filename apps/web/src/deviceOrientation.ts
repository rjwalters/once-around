/**
 * Device Orientation Manager
 * Handles device orientation API, iOS permission requests, and sensor smoothing.
 */

import * as THREE from "three";

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
  onOrientationChange: (quaternion: THREE.Quaternion) => void;
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
 * Convert device orientation to quaternion for celestial viewing.
 *
 * Device orientation angles:
 * - alpha: 0-360° compass heading (0 = North)
 * - beta: -180 to 180° pitch (0 = flat, 90 = pointing up)
 * - gamma: -90 to 90° roll (tilt left/right)
 *
 * We need to convert these to a quaternion that represents looking at the sky:
 * - When phone points straight up (beta=90), we should see the zenith
 * - When phone points at horizon (beta=0), we should see along that azimuth
 * - Alpha (compass) rotates around the vertical axis
 */
function deviceOrientationToQuaternion(
  alpha: number,
  beta: number,
  gamma: number,
  screenOrientation: number
): THREE.Quaternion {
  // Convert to radians
  const alphaRad = THREE.MathUtils.degToRad(alpha);
  const betaRad = THREE.MathUtils.degToRad(beta);
  const gammaRad = THREE.MathUtils.degToRad(gamma);
  const orientRad = THREE.MathUtils.degToRad(screenOrientation);

  // Start with identity
  const quaternion = new THREE.Quaternion();

  // Create Euler angles for device orientation
  // The standard device orientation uses ZXY order
  const euler = new THREE.Euler();
  euler.set(betaRad, alphaRad, -gammaRad, "YXZ");

  quaternion.setFromEuler(euler);

  // Apply screen orientation correction
  const screenRotation = new THREE.Quaternion();
  screenRotation.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -orientRad);
  quaternion.multiply(screenRotation);

  // Rotate to align with celestial sphere coordinate system
  // The celestial sphere uses: X = RA=0/Dec=0, Y = north pole (Dec=90), Z = RA=90/Dec=0
  // Device orientation after euler: Z-forward, Y-up
  // We need to map device frame to celestial frame so that:
  // - Tilting phone up/down (beta) changes declination
  // - Rotating phone left/right (alpha) changes RA
  //
  // First rotate -90° around Z to align device X with celestial forward
  // Then rotate -90° around the new X to point device up toward celestial pole
  const worldCorrection = new THREE.Quaternion();
  worldCorrection.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
  quaternion.multiply(worldCorrection);

  const worldCorrection2 = new THREE.Quaternion();
  worldCorrection2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  quaternion.multiply(worldCorrection2);

  return quaternion;
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

  function updateState(updates: Partial<DeviceOrientationState>): void {
    state = { ...state, ...updates };
    callbacks.onStateChange(state);
  }

  function getScreenOrientation(): number {
    if (typeof screen.orientation !== "undefined") {
      return screen.orientation.angle;
    }
    // Fallback for older browsers
    return (window.orientation as number) || 0;
  }

  function handleOrientation(event: DeviceOrientationEvent): void {
    if (event.alpha === null || event.beta === null || event.gamma === null) {
      return;
    }

    // Calculate target quaternion from device orientation
    targetQuaternion = deviceOrientationToQuaternion(
      event.alpha,
      event.beta,
      event.gamma,
      getScreenOrientation()
    );

    // Smooth interpolation (SLERP)
    currentQuaternion.slerp(targetQuaternion, SMOOTHING_FACTOR);

    callbacks.onOrientationChange(currentQuaternion.clone());
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

    orientationHandler = handleOrientation;
    window.addEventListener("deviceorientation", orientationHandler, true);
    updateState({ enabled: true });
  }

  function stop(): void {
    if (!state.enabled || !orientationHandler) {
      return;
    }

    window.removeEventListener("deviceorientation", orientationHandler, true);
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
