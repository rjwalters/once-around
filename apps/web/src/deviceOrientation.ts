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
 * Extract altitude and azimuth from device orientation.
 *
 * Device orientation angles:
 * - alpha: 0-360° compass heading (0 = North, increases clockwise)
 * - beta: -180 to 180° pitch (0 = flat, 90 = screen facing up/zenith)
 * - gamma: -90 to 90° roll (tilt left/right)
 *
 * For a "point at sky" app in portrait mode:
 * - alpha gives azimuth (compass heading)
 * - beta gives altitude (0° = horizon, 90° = zenith when phone vertical)
 * - gamma gives roll around the viewing axis
 *
 * Screen orientation adjusts for landscape modes.
 */
function deviceOrientationToAltAz(
  alpha: number,
  beta: number,
  gamma: number,
  screenOrientation: number
): { altitude: number; azimuth: number } {
  // Adjust for screen orientation
  // Portrait: 0°, Landscape left: 90°, Landscape right: -90°/270°
  let adjustedBeta = beta;
  let adjustedGamma = gamma;

  if (screenOrientation === 90) {
    // Landscape left (home button on right)
    adjustedBeta = gamma;
    adjustedGamma = -beta;
  } else if (screenOrientation === -90 || screenOrientation === 270) {
    // Landscape right (home button on left)
    adjustedBeta = -gamma;
    adjustedGamma = beta;
  } else if (screenOrientation === 180) {
    // Upside down portrait
    adjustedBeta = -beta;
    adjustedGamma = -gamma;
  }

  // The view direction is where the BACK of the phone points (camera mode).
  // From the ZXY rotation matrix R = Rz(α) · Rx(β) · Ry(γ), the back-of-phone
  // direction (0,0,-1) in device space maps to world space as:
  //   east  = -sin(α)·sin(β)
  //   north =  cos(α)·sin(β)
  //   up    = -cos(β)
  //
  // This gives altitude = β - 90° and azimuth = 360° - α.
  //
  // Examples (portrait, gamma=0):
  //   Phone flat, screen up (β=0°):   back faces down  → alt = -90° (ground)
  //   Phone vertical (β=90°):         back faces ahead  → alt = 0°  (horizon)
  //   Phone flat, screen down (β=180°): back faces up   → alt = 90° (zenith)

  let altitude = adjustedBeta - 90;
  altitude = Math.max(-90, Math.min(90, altitude));

  // Device alpha increases counterclockwise viewed from above (W3C spec),
  // but astronomical azimuth increases clockwise, so we negate.
  let azimuth = (360 - alpha) % 360;
  azimuth = ((azimuth % 360) + 360) % 360;

  return { altitude, azimuth };
}

/**
 * Convert altitude/azimuth to a quaternion for topocentric viewing.
 *
 * In topocentric mode:
 * - Azimuth 0° = North, 90° = East, 180° = South, 270° = West
 * - Altitude 0° = horizon, 90° = zenith, -90° = nadir
 * - "Up" in the view should be toward the zenith
 */
function altAzToQuaternion(altitude: number, azimuth: number): THREE.Quaternion {
  const altRad = THREE.MathUtils.degToRad(altitude);
  const azRad = THREE.MathUtils.degToRad(azimuth);

  // In the app's topocentric coordinate system:
  // - Looking north (az=0) at horizon (alt=0): view direction is toward north
  // - The camera's local -Z should point at the sky location
  // - The camera's local +Y should point toward zenith (projected onto view plane)

  // Compute view direction from alt/az
  // Standard conversion:
  // x = cos(alt) * sin(az)  (east component)
  // y = sin(alt)            (up component)
  // z = cos(alt) * cos(az)  (north component)
  // But we need to map to the app's coordinate system

  // In the app's world coords for topocentric:
  // The ground plane orientation depends on observer latitude
  // For simplicity, let's create a quaternion that rotates:
  // 1. First rotate around Y (up) by -azimuth to face the right direction
  // 2. Then rotate around the local X (right) by altitude to tilt up/down

  const quaternion = new THREE.Quaternion();

  // Start looking at RA=0, Dec=0 (which is -X direction in world coords)
  // Rotate around Y axis by azimuth (note: azimuth increases clockwise when viewed from above)
  const yawQuat = new THREE.Quaternion();
  yawQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -azRad);

  // Rotate around X axis by altitude (tilt up)
  const pitchQuat = new THREE.Quaternion();
  pitchQuat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), altRad);

  // Combine: first yaw, then pitch
  quaternion.multiplyQuaternions(yawQuat, pitchQuat);

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

  // Track smoothed altitude and azimuth
  let currentAltitude = 0;
  let currentAzimuth = 0;

  function handleOrientation(event: DeviceOrientationEvent): void {
    if (event.alpha === null || event.beta === null || event.gamma === null) {
      return;
    }

    // Extract altitude and azimuth from device orientation
    const { altitude, azimuth } = deviceOrientationToAltAz(
      event.alpha,
      event.beta,
      event.gamma,
      getScreenOrientation()
    );

    // Smooth altitude and azimuth
    // For azimuth, handle wrap-around at 0/360
    let azDiff = azimuth - currentAzimuth;
    if (azDiff > 180) azDiff -= 360;
    if (azDiff < -180) azDiff += 360;
    currentAzimuth = (currentAzimuth + azDiff * SMOOTHING_FACTOR + 360) % 360;
    currentAltitude = currentAltitude + (altitude - currentAltitude) * SMOOTHING_FACTOR;

    // Create quaternion from smoothed alt/az
    targetQuaternion = altAzToQuaternion(currentAltitude, currentAzimuth);

    // Smooth quaternion interpolation (SLERP) for additional smoothness
    currentQuaternion.slerp(targetQuaternion, SMOOTHING_FACTOR);

    callbacks.onOrientationChange({
      quaternion: currentQuaternion.clone(),
      altitude: currentAltitude,
      azimuth: currentAzimuth,
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
