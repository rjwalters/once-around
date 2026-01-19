/**
 * Label Manager
 *
 * A priority-based label culling system that prevents overlap by hiding
 * lower-priority labels when they collide with higher-priority ones.
 * Labels fade smoothly and more labels become visible when zoomed in.
 */

import * as THREE from "three";
import type { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Information about a label to be managed.
 */
export interface ManagedLabelInfo {
  /** Unique identifier for this label */
  id: string;
  /** World position of the labeled object */
  worldPos: THREE.Vector3;
  /** Priority (higher = more important, shown over lower priority) */
  priority: number;
  /** The CSS2DObject label element */
  label: CSS2DObject;
  /** Optional flag line to coordinate opacity with */
  flagLine?: THREE.LineSegments;
  /** Optional flag line index (for multi-segment flag lines) */
  flagLineIndex?: number;
}

/**
 * Internal state for a managed label.
 */
interface LabelState {
  /** Current opacity (0-1) */
  currentOpacity: number;
  /** Target opacity (0 or 1) */
  targetOpacity: number;
  /** Hysteresis counter (frames since target changed) */
  hysteresisCounter: number;
  /** Last update frame */
  lastFrame: number;
}

/**
 * Screen-space bounding box.
 */
interface ScreenBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

// Estimated label dimensions in pixels (CSS labels)
const LABEL_WIDTH_PX = 80;
const LABEL_HEIGHT_PX = 20;

// Fade animation rate (opacity change per second)
const FADE_RATE = 4.0;

// Hysteresis: wait this many frames before showing a hidden label
// to prevent flickering when labels are near the visibility threshold
const HYSTERESIS_SHOW_FRAMES = 6;

// Minimum opacity threshold - below this, label is fully hidden
const MIN_OPACITY_THRESHOLD = 0.01;

// Padding between labels (pixels)
const LABEL_PADDING_PX = 4;

// -----------------------------------------------------------------------------
// Priority Constants (exported for use by layers)
// -----------------------------------------------------------------------------

export const LABEL_PRIORITY = {
  SUN: 1000,
  PLANET: 900,
  MOON: 850,
  MAJOR_MOON: 800,
  MINOR_BODY_HIGH: 700,  // Pluto
  MINOR_BODY_LOW: 600,   // Others
  VIDEO: 500,
  STAR_BRIGHTEST: 500,
  COMET: 400,
  DSO_BRIGHTEST: 400,
  SATELLITE: 300,
  METEOR_SHOWER: 200,
};

/**
 * Calculate star priority based on magnitude.
 * Brighter stars (lower magnitude) get higher priority.
 * Priority = 500 - (magnitude * 20), clamped to [200, 500]
 */
export function starPriorityFromMagnitude(magnitude: number): number {
  const priority = 500 - magnitude * 20;
  return Math.max(200, Math.min(500, priority));
}

/**
 * Calculate DSO priority based on magnitude.
 * Priority = 400 - (magnitude * 5), clamped to [200, 400]
 */
export function dsoPriorityFromMagnitude(magnitude: number): number {
  const priority = 400 - magnitude * 5;
  return Math.max(200, Math.min(400, priority));
}

// -----------------------------------------------------------------------------
// LabelManager Class
// -----------------------------------------------------------------------------

export class LabelManager {
  private camera: THREE.PerspectiveCamera | null = null;
  private containerWidth: number = 0;
  private containerHeight: number = 0;
  private currentFrame: number = 0;

  // Registered labels for current frame
  private frameLabels: ManagedLabelInfo[] = [];

  // Persistent state for each label (by id)
  private labelStates: Map<string, LabelState> = new Map();

  // Reusable vector for projections
  private projVector = new THREE.Vector3();

  /**
   * Begin a new frame. Call this before layer updates.
   * @param camera - The perspective camera for projection
   * @param fov - Field of view in degrees (currently unused, for future FOV-based culling)
   * @param container - The container element (for getting dimensions)
   */
  beginFrame(camera: THREE.PerspectiveCamera, _fov: number, container: HTMLElement): void {
    this.camera = camera;
    this.containerWidth = container.clientWidth;
    this.containerHeight = container.clientHeight;
    this.currentFrame++;

    // Clear frame labels for new registrations
    this.frameLabels = [];
  }

  /**
   * Register a label for the current frame.
   * Call this from each layer's update() after their existing visibility checks.
   */
  registerLabel(info: ManagedLabelInfo): void {
    this.frameLabels.push(info);
  }

  /**
   * End the frame. Resolves overlaps and applies fades.
   * Call this after all layer updates.
   * @param deltaTime - Time since last frame in seconds
   */
  endFrame(deltaTime: number): void {
    if (!this.camera || this.frameLabels.length === 0) {
      return;
    }

    // Project all labels to screen space and calculate bounds
    const labelBounds: Array<{ info: ManagedLabelInfo; bounds: ScreenBounds; screenPos: THREE.Vector2 }> = [];

    for (const info of this.frameLabels) {
      const screenPos = this.projectToScreen(info.worldPos);

      // Skip labels that are behind the camera
      if (screenPos === null) {
        this.hideLabel(info.id, info.label, info.flagLine, info.flagLineIndex, deltaTime);
        continue;
      }

      const bounds = this.calculateBounds(screenPos);
      labelBounds.push({ info, bounds, screenPos });
    }

    // Sort by priority (highest first)
    labelBounds.sort((a, b) => b.info.priority - a.info.priority);

    // Greedy overlap resolution
    const visibleBounds: ScreenBounds[] = [];

    for (const item of labelBounds) {
      const { info, bounds } = item;

      // Check if this label overlaps any already-visible higher-priority label
      const overlaps = visibleBounds.some(vb => this.boundsOverlap(bounds, vb));

      if (!overlaps) {
        // This label is visible
        this.showLabel(info.id, info.label, info.flagLine, info.flagLineIndex, deltaTime);
        visibleBounds.push(bounds);
      } else {
        // This label is hidden due to overlap
        this.hideLabel(info.id, info.label, info.flagLine, info.flagLineIndex, deltaTime);
      }
    }

    // Clean up stale states (labels not seen for a while)
    this.cleanupStaleStates();
  }

  /**
   * Project a world position to screen coordinates.
   * Returns null if the point is behind the camera.
   */
  private projectToScreen(worldPos: THREE.Vector3): THREE.Vector2 | null {
    if (!this.camera) return null;

    this.projVector.copy(worldPos);
    this.projVector.project(this.camera);

    // Check if behind camera (z > 1 means behind)
    if (this.projVector.z > 1) {
      return null;
    }

    // Convert from NDC (-1 to 1) to screen coordinates
    const x = (this.projVector.x + 1) * 0.5 * this.containerWidth;
    const y = (1 - this.projVector.y) * 0.5 * this.containerHeight;

    return new THREE.Vector2(x, y);
  }

  /**
   * Calculate screen-space bounding box for a label.
   */
  private calculateBounds(screenPos: THREE.Vector2): ScreenBounds {
    // Label is positioned at screenPos, typically anchor is center-bottom or center
    // CSS2D labels are centered horizontally, positioned at the anchor
    const halfWidth = (LABEL_WIDTH_PX + LABEL_PADDING_PX) / 2;
    const height = LABEL_HEIGHT_PX + LABEL_PADDING_PX;

    return {
      left: screenPos.x - halfWidth,
      right: screenPos.x + halfWidth,
      top: screenPos.y - height,
      bottom: screenPos.y,
    };
  }

  /**
   * Check if two bounding boxes overlap.
   */
  private boundsOverlap(a: ScreenBounds, b: ScreenBounds): boolean {
    return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
  }

  /**
   * Get or create state for a label.
   */
  private getState(id: string): LabelState {
    let state = this.labelStates.get(id);
    if (!state) {
      state = {
        currentOpacity: 1,  // Start visible
        targetOpacity: 1,
        hysteresisCounter: 0,
        lastFrame: this.currentFrame,
      };
      this.labelStates.set(id, state);
    }
    state.lastFrame = this.currentFrame;
    return state;
  }

  /**
   * Mark a label as visible and apply fade-in.
   */
  private showLabel(
    id: string,
    label: CSS2DObject,
    flagLine: THREE.LineSegments | undefined,
    flagLineIndex: number | undefined,
    deltaTime: number
  ): void {
    const state = this.getState(id);

    // Apply hysteresis when transitioning from hidden to visible
    if (state.targetOpacity === 0) {
      state.hysteresisCounter++;
      if (state.hysteresisCounter < HYSTERESIS_SHOW_FRAMES) {
        // Not enough frames yet, keep hidden
        this.applyOpacity(label, flagLine, flagLineIndex, state.currentOpacity, deltaTime, 0);
        return;
      }
    }

    state.targetOpacity = 1;
    state.hysteresisCounter = 0;
    this.applyOpacity(label, flagLine, flagLineIndex, state.currentOpacity, deltaTime, 1);
    state.currentOpacity = this.lerp(state.currentOpacity, 1, Math.min(1, FADE_RATE * deltaTime));
  }

  /**
   * Mark a label as hidden and apply fade-out.
   */
  private hideLabel(
    id: string,
    label: CSS2DObject,
    flagLine: THREE.LineSegments | undefined,
    flagLineIndex: number | undefined,
    deltaTime: number
  ): void {
    const state = this.getState(id);

    // Reset hysteresis when hiding
    if (state.targetOpacity === 1) {
      state.hysteresisCounter = 0;
    }

    state.targetOpacity = 0;
    this.applyOpacity(label, flagLine, flagLineIndex, state.currentOpacity, deltaTime, 0);
    state.currentOpacity = this.lerp(state.currentOpacity, 0, Math.min(1, FADE_RATE * deltaTime));
  }

  /**
   * Apply opacity to a label and its flag line.
   */
  private applyOpacity(
    label: CSS2DObject,
    flagLine: THREE.LineSegments | undefined,
    flagLineIndex: number | undefined,
    currentOpacity: number,
    deltaTime: number,
    targetOpacity: number
  ): void {
    // Lerp toward target
    const newOpacity = this.lerp(currentOpacity, targetOpacity, Math.min(1, FADE_RATE * deltaTime));

    // Apply to label element
    if (label.element) {
      if (newOpacity < MIN_OPACITY_THRESHOLD) {
        label.element.style.opacity = '0';
        label.element.style.pointerEvents = 'none';
      } else {
        label.element.style.opacity = String(newOpacity);
        label.element.style.pointerEvents = newOpacity > 0.5 ? '' : 'none';
      }
    }

    // Apply to flag line if present
    if (flagLine) {
      if (flagLineIndex !== undefined) {
        // Multi-segment flag line: modify vertex colors or positions for this specific segment
        const geometry = flagLine.geometry as THREE.BufferGeometry;
        const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
        const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;

        if (colorAttr) {
          // Has vertex colors: scale colors by opacity
          const v0 = flagLineIndex * 2;
          const v1 = flagLineIndex * 2 + 1;

          // Store original colors if we're showing (opacity > 0.5) or if not yet stored
          const colorArray = colorAttr.array as Float32Array;
          const userData = colorAttr.userData;
          const key = `origColor_${flagLineIndex}`;

          if (targetOpacity > 0.5 || userData[key] === undefined) {
            // Store the current colors as original
            userData[key] = [
              colorArray[v0 * 3], colorArray[v0 * 3 + 1], colorArray[v0 * 3 + 2],
              colorArray[v1 * 3], colorArray[v1 * 3 + 1], colorArray[v1 * 3 + 2],
            ];
          }

          // Scale colors by opacity
          const orig = userData[key] as number[];
          colorAttr.setXYZ(v0, orig[0] * newOpacity, orig[1] * newOpacity, orig[2] * newOpacity);
          colorAttr.setXYZ(v1, orig[3] * newOpacity, orig[4] * newOpacity, orig[5] * newOpacity);
          colorAttr.needsUpdate = true;
        } else if (posAttr) {
          // No vertex colors: collapse positions to hide segment when opacity is low
          const v0 = flagLineIndex * 2;
          const v1 = flagLineIndex * 2 + 1;
          const posArray = posAttr.array as Float32Array;
          const userData = posAttr.userData;
          const key = `origPos_${flagLineIndex}`;

          // Store original positions if we're showing or if not yet stored
          if (targetOpacity > 0.5 || userData[key] === undefined) {
            userData[key] = [
              posArray[v0 * 3], posArray[v0 * 3 + 1], posArray[v0 * 3 + 2],
              posArray[v1 * 3], posArray[v1 * 3 + 1], posArray[v1 * 3 + 2],
            ];
          }

          const orig = userData[key] as number[];
          // Interpolate positions toward each other (collapse to midpoint when hidden)
          const midX = (orig[0] + orig[3]) / 2;
          const midY = (orig[1] + orig[4]) / 2;
          const midZ = (orig[2] + orig[5]) / 2;

          posAttr.setXYZ(v0,
            orig[0] * newOpacity + midX * (1 - newOpacity),
            orig[1] * newOpacity + midY * (1 - newOpacity),
            orig[2] * newOpacity + midZ * (1 - newOpacity)
          );
          posAttr.setXYZ(v1,
            orig[3] * newOpacity + midX * (1 - newOpacity),
            orig[4] * newOpacity + midY * (1 - newOpacity),
            orig[5] * newOpacity + midZ * (1 - newOpacity)
          );
          posAttr.needsUpdate = true;
        }
      } else {
        // Dedicated flag line: apply material opacity
        const material = flagLine.material as THREE.LineBasicMaterial;
        if (material && 'opacity' in material) {
          // Store original opacity if not set
          if (material.userData.originalOpacity === undefined) {
            material.userData.originalOpacity = material.opacity;
          }
          material.opacity = (material.userData.originalOpacity as number) * newOpacity;
        }
      }
    }
  }

  /**
   * Linear interpolation.
   */
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /**
   * Clean up states for labels not seen in recent frames.
   */
  private cleanupStaleStates(): void {
    const staleThreshold = this.currentFrame - 60; // ~1 second at 60fps

    for (const [id, state] of this.labelStates) {
      if (state.lastFrame < staleThreshold) {
        this.labelStates.delete(id);
      }
    }
  }

  /**
   * Reset all label states (useful when switching view modes).
   */
  reset(): void {
    this.labelStates.clear();
    this.frameLabels = [];
  }
}
