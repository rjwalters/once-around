/**
 * Re-export coordinate functions from their canonical location in geometry/.
 * Keeps existing imports in controls/index.ts working without changes.
 */
export {
  raDecToDirection,
  raDecToQuaternion,
  equatorialToHorizontal,
  horizontalToEquatorial,
} from "../geometry/coordinates";
