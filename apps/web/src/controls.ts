/**
 * Camera Controls Module (Facade)
 *
 * Re-exports from the controls/ subdirectory.
 * This preserves the existing import path for consumers.
 */

export {
  createCelestialControls,
  type CameraState,
  type ViewMode,
  type CelestialControls,
} from "./controls/index";
