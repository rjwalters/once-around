/**
 * Label Manager
 *
 * A priority-based label culling system that prevents overlap by hiding
 * lower-priority labels when they collide with higher-priority ones.
 * Labels fade smoothly and more labels become visible when zoomed in.
 *
 * Also owns and manages all flaglines (the lines connecting labels to objects).
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
  /** World position of the labeled object (flagline start) */
  objectPos: THREE.Vector3;
  /** World position of the label (flagline end) */
  labelPos: THREE.Vector3;
  /** Priority (higher = more important, shown over lower priority) */
  priority: number;
  /** The CSS2DObject label element */
  label: CSS2DObject;
  /** Flagline color */
  color: THREE.Color;
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

// Initial capacity for flaglines (will grow if needed)
const INITIAL_FLAGLINE_CAPACITY = 200;

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

  // Flagline geometry (owned by LabelManager)
  private flagLineGeometry: THREE.BufferGeometry;
  private flagLineMaterial: THREE.LineBasicMaterial;
  private flagLineMesh: THREE.LineSegments;
  private flagLineCapacity: number;
  private positionBuffer: Float32Array;
  private colorBuffer: Float32Array;

  constructor() {
    // Initialize flagline geometry with pre-allocated buffers
    this.flagLineCapacity = INITIAL_FLAGLINE_CAPACITY;
    this.positionBuffer = new Float32Array(this.flagLineCapacity * 2 * 3);
    this.colorBuffer = new Float32Array(this.flagLineCapacity * 2 * 3);

    this.flagLineGeometry = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(this.positionBuffer, 3);
    const colorAttr = new THREE.BufferAttribute(this.colorBuffer, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    colorAttr.setUsage(THREE.DynamicDrawUsage);
    this.flagLineGeometry.setAttribute("position", posAttr);
    this.flagLineGeometry.setAttribute("color", colorAttr);

    this.flagLineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
    });

    this.flagLineMesh = new THREE.LineSegments(this.flagLineGeometry, this.flagLineMaterial);
  }

  /**
   * Get the flagline mesh to add to the scene.
   */
  getFlagLineMesh(): THREE.LineSegments {
    return this.flagLineMesh;
  }

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
   * End the frame. Resolves overlaps, updates flaglines, and applies fades.
   * Call this after all layer updates.
   * @param deltaTime - Time since last frame in seconds
   */
  endFrame(deltaTime: number): void {
    if (!this.camera) {
      this.flagLineGeometry.setDrawRange(0, 0);
      return;
    }

    if (this.frameLabels.length === 0) {
      this.flagLineGeometry.setDrawRange(0, 0);
      return;
    }

    // Ensure we have enough capacity
    if (this.frameLabels.length > this.flagLineCapacity) {
      this.growBuffers(this.frameLabels.length);
    }

    // Project all labels to screen space and calculate bounds
    const labelBounds: Array<{ info: ManagedLabelInfo; bounds: ScreenBounds; screenPos: THREE.Vector2; index: number }> = [];

    for (let i = 0; i < this.frameLabels.length; i++) {
      const info = this.frameLabels[i];
      const screenPos = this.projectToScreen(info.labelPos);

      // Skip labels that are behind the camera
      if (screenPos === null) {
        this.updateLabelOpacity(info, 0, deltaTime);
        continue;
      }

      const bounds = this.calculateBounds(screenPos);
      labelBounds.push({ info, bounds, screenPos, index: i });
    }

    // Sort by priority (highest first)
    labelBounds.sort((a, b) => b.info.priority - a.info.priority);

    // Greedy overlap resolution
    const visibleBounds: ScreenBounds[] = [];
    const visibleIndices: Set<number> = new Set();

    for (const item of labelBounds) {
      const { info, bounds, index } = item;

      // Check if this label overlaps any already-visible higher-priority label
      const overlaps = visibleBounds.some(vb => this.boundsOverlap(bounds, vb));

      if (!overlaps) {
        // This label is visible
        this.updateLabelOpacity(info, 1, deltaTime);
        visibleBounds.push(bounds);
        visibleIndices.add(index);
      } else {
        // This label is hidden due to overlap
        this.updateLabelOpacity(info, 0, deltaTime);
      }
    }

    // Update flagline geometry
    this.updateFlagLines(deltaTime);

    // Clean up stale states (labels not seen for a while)
    this.cleanupStaleStates();
  }

  /**
   * Grow the flagline buffers to accommodate more lines.
   */
  private growBuffers(minCapacity: number): void {
    const newCapacity = Math.max(minCapacity, this.flagLineCapacity * 2);
    const newPositionBuffer = new Float32Array(newCapacity * 2 * 3);
    const newColorBuffer = new Float32Array(newCapacity * 2 * 3);

    // Copy existing data
    newPositionBuffer.set(this.positionBuffer);
    newColorBuffer.set(this.colorBuffer);

    this.positionBuffer = newPositionBuffer;
    this.colorBuffer = newColorBuffer;
    this.flagLineCapacity = newCapacity;

    // Update geometry attributes
    const posAttr = new THREE.BufferAttribute(this.positionBuffer, 3);
    const colorAttr = new THREE.BufferAttribute(this.colorBuffer, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    colorAttr.setUsage(THREE.DynamicDrawUsage);
    this.flagLineGeometry.setAttribute("position", posAttr);
    this.flagLineGeometry.setAttribute("color", colorAttr);
  }

  /**
   * Update flagline geometry based on current frame's registered labels.
   */
  private updateFlagLines(deltaTime: number): void {
    const posAttr = this.flagLineGeometry.getAttribute("position") as THREE.BufferAttribute;
    const colorAttr = this.flagLineGeometry.getAttribute("color") as THREE.BufferAttribute;

    for (let i = 0; i < this.frameLabels.length; i++) {
      const info = this.frameLabels[i];
      const state = this.labelStates.get(info.id);
      const opacity = state ? state.currentOpacity : 1;
      const effectiveOpacity = opacity < MIN_OPACITY_THRESHOLD ? 0 : opacity;

      const baseIdx = i * 2;

      // Set positions (object -> label)
      posAttr.setXYZ(baseIdx, info.objectPos.x, info.objectPos.y, info.objectPos.z);
      posAttr.setXYZ(baseIdx + 1, info.labelPos.x, info.labelPos.y, info.labelPos.z);

      // Set colors with opacity applied
      colorAttr.setXYZ(baseIdx, info.color.r * effectiveOpacity, info.color.g * effectiveOpacity, info.color.b * effectiveOpacity);
      colorAttr.setXYZ(baseIdx + 1, info.color.r * effectiveOpacity, info.color.g * effectiveOpacity, info.color.b * effectiveOpacity);
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;

    // Only draw the lines we need
    this.flagLineGeometry.setDrawRange(0, this.frameLabels.length * 2);
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
   * Update label opacity based on target (0 = hidden, 1 = visible).
   */
  private updateLabelOpacity(info: ManagedLabelInfo, targetOpacity: number, deltaTime: number): void {
    const state = this.getState(info.id);

    if (targetOpacity === 1) {
      // Showing
      if (state.targetOpacity === 0) {
        state.hysteresisCounter++;
        if (state.hysteresisCounter < HYSTERESIS_SHOW_FRAMES) {
          // Not enough frames yet, keep hidden
          this.applyLabelOpacity(info.label, state.currentOpacity);
          return;
        }
      }
      state.targetOpacity = 1;
      state.hysteresisCounter = 0;
    } else {
      // Hiding
      if (state.targetOpacity === 1) {
        state.hysteresisCounter = 0;
      }
      state.targetOpacity = 0;
    }

    // Lerp current opacity toward target
    state.currentOpacity = this.lerp(state.currentOpacity, state.targetOpacity, Math.min(1, FADE_RATE * deltaTime));
    this.applyLabelOpacity(info.label, state.currentOpacity);
  }

  /**
   * Apply opacity to a label's DOM element.
   */
  private applyLabelOpacity(label: CSS2DObject, opacity: number): void {
    if (label.element) {
      if (opacity < MIN_OPACITY_THRESHOLD) {
        label.element.style.opacity = '0';
        label.element.style.pointerEvents = 'none';
      } else {
        label.element.style.opacity = String(opacity);
        label.element.style.pointerEvents = opacity > 0.5 ? '' : 'none';
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
    this.flagLineGeometry.setDrawRange(0, 0);
  }

  /**
   * Set flagline visibility.
   */
  setVisible(visible: boolean): void {
    this.flagLineMesh.visible = visible;
  }
}
