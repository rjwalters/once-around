/** Device orientation, north-reference validation, smoothing and screen axes. */
import * as THREE from "three";
import { deviceOrientationToAltAz } from "./geometry/device-orientation";
import {
  applyScreenOrientation,
  deviceOrientationToQuaternion,
} from "./geometry/device-orientation-three";
import {
  createOrientationSensor,
  getScreenOrientationAngle,
  type OrientationSensor,
  type OrientationSensorState,
} from "./orientation-sensor";

export type DeviceOrientationState = OrientationSensorState;

export interface DeviceOrientationManager extends Omit<OrientationSensor, "getSample"> {
  /** Null when the sensor has no current usable north-referenced reading. */
  getQuaternion(): THREE.Quaternion | null;
}

interface DeviceOrientationCallbacks {
  onOrientationChange: (data: { quaternion: THREE.Quaternion; altitude: number; azimuth: number }) => void;
  onStateChange: (state: DeviceOrientationState) => void;
}

const SMOOTHING_FACTOR = 0.3;

export function createDeviceOrientationManager(
  callbacks: DeviceOrientationCallbacks
): DeviceOrientationManager {
  const currentQuaternion = new THREE.Quaternion();
  const screenQuaternion = new THREE.Quaternion();
  let initialized = false;
  let listeningForScreen = false;
  let screenOrientation: ScreenOrientation | undefined;

  function emitOrientation(): void {
    const sample = sensor.getSample();
    if (!sample || !initialized) return;
    applyScreenOrientation(currentQuaternion, getScreenOrientationAngle(), screenQuaternion);
    const { altitude, azimuth } = deviceOrientationToAltAz(sample.alpha, sample.beta, sample.gamma);
    callbacks.onOrientationChange({ quaternion: screenQuaternion.clone(), altitude, azimuth });
  }

  const sensor = createOrientationSensor({
    onSample(sample) {
      const target = deviceOrientationToQuaternion(sample.alpha, sample.beta, sample.gamma);
      if (!initialized) currentQuaternion.copy(target);
      else currentQuaternion.slerp(target, SMOOTHING_FACTOR);
      initialized = true;
      emitOrientation();
    },
    onStateChange(state) {
      if (state.sensorStatus !== "usable") initialized = false;
      callbacks.onStateChange(state);
    },
  });

  function start(): void {
    sensor.start();
    if (!sensor.getState().enabled || listeningForScreen) return;
    screenOrientation = window.screen?.orientation;
    screenOrientation?.addEventListener("change", emitOrientation);
    window.addEventListener("orientationchange", emitOrientation);
    listeningForScreen = true;
  }

  function stop(): void {
    if (listeningForScreen) {
      screenOrientation?.removeEventListener("change", emitOrientation);
      window.removeEventListener("orientationchange", emitOrientation);
    }
    listeningForScreen = false;
    screenOrientation = undefined;
    initialized = false;
    currentQuaternion.identity();
    screenQuaternion.identity();
    sensor.stop();
  }

  return {
    getState: sensor.getState,
    isSupported: sensor.isSupported,
    requiresPermission: sensor.requiresPermission,
    requestPermission: sensor.requestPermission,
    start, stop,
    getQuaternion: () => sensor.getSample() && initialized ? screenQuaternion.clone() : null,
  };
}
