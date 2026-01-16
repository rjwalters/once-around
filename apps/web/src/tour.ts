/**
 * Tour / Scene Replay System
 *
 * Provides planetarium-style guided tours that control both camera position
 * and simulation time for scripted astronomical experiences.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Target body names that can be used in keyframes.
 * These are resolved to RA/Dec at runtime based on the keyframe datetime.
 */
export type TargetBody =
  | 'sun'
  | 'moon'
  | 'mercury'
  | 'venus'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'
  // Comets
  | 'halley'
  | 'encke'
  | 'churyumov-gerasimenko'
  | 'wirtanen'
  | 'neowise'
  | 'tsuchinshan-atlas'
  | 'hale-bopp';

/**
 * Observer location for a keyframe.
 */
export interface TourLocation {
  /** Latitude in degrees (-90 to +90) */
  latitude: number;

  /** Longitude in degrees (-180 to +180) */
  longitude: number;

  /** Optional location name for display */
  name?: string;
}

/**
 * A single keyframe in a tour sequence.
 */
export interface TourKeyframe {
  /** Right Ascension in degrees (0-360). Required if target is not specified. */
  ra?: number;

  /** Declination in degrees (-90 to +90). Required if target is not specified. */
  dec?: number;

  /** Target body to point at. If specified, ra/dec are computed from the body's position at datetime. */
  target?: TargetBody;

  /** Field of view in degrees (0.5-100) */
  fov: number;

  /** Simulation datetime (ISO 8601 string) */
  datetime: string;

  /** Duration to hold at this keyframe before transitioning (ms) */
  holdDuration: number;

  /** Duration of transition TO this keyframe from previous (ms). First keyframe uses this for initial setup. */
  transitionDuration: number;

  /** How time progresses during transition: 'instant' jumps, 'animate' interpolates */
  timeMode: 'instant' | 'animate';

  /** Optional observer location. If specified, moves observer to this location. */
  location?: TourLocation;

  /** Optional caption/annotation for this keyframe */
  caption?: string;
}

/**
 * A complete tour definition.
 */
export interface TourDefinition {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** Short description */
  description: string;

  /** Ordered sequence of keyframes */
  keyframes: TourKeyframe[];

  /** Whether tour should loop (default: false) */
  loop?: boolean;
}

/**
 * Current state of tour playback.
 */
export interface TourPlaybackState {
  /** Current status */
  status: 'idle' | 'playing' | 'paused';

  /** Currently playing tour (null if idle) */
  currentTour: TourDefinition | null;

  /** Index of current keyframe (0-based) */
  currentKeyframeIndex: number;

  /** Progress within current segment (0-1) */
  segmentProgress: number;

  /** Whether in hold phase or transition phase */
  phase: 'hold' | 'transition';

  /** Overall tour progress (0-1) */
  overallProgress: number;

  /** Current caption text (if any) */
  currentCaption: string | null;
}

/**
 * Resolved position for a celestial body.
 */
export interface BodyPosition {
  ra: number; // degrees
  dec: number; // degrees
}

/**
 * Callbacks provided to the tour engine for integration.
 */
export interface TourCallbacks {
  /** Animate camera to RA/Dec position */
  animateToRaDec: (ra: number, dec: number, durationMs: number) => void;

  /** Set camera FOV directly */
  setFov: (fov: number) => void;

  /** Get current camera FOV */
  getFov: () => number;

  /** Set simulation time and trigger updates */
  setTime: (date: Date) => void;

  /** Set observer location (lat/lon) */
  setLocation?: (latitude: number, longitude: number, name?: string) => void;

  /** Get current observer location */
  getLocation?: () => TourLocation;

  /** Resolve a body's position at a given datetime. Required if using target-based keyframes. */
  resolveBodyPosition?: (target: TargetBody, datetime: Date) => BodyPosition;

  /** Called when playback state changes */
  onStateChange?: (state: TourPlaybackState) => void;

  /** Called when tour completes */
  onTourComplete?: () => void;

  /** Called when user should see a caption */
  onCaptionChange?: (caption: string | null) => void;
}

/**
 * Tour engine interface.
 */
export interface TourEngine {
  /** Start playing a tour from the beginning */
  play(tour: TourDefinition): void;

  /** Pause playback */
  pause(): void;

  /** Resume from paused state */
  resume(): void;

  /** Stop playback and reset to idle */
  stop(): void;

  /** Skip to next keyframe */
  next(): void;

  /** Go to previous keyframe */
  previous(): void;

  /** Get current playback state */
  getState(): TourPlaybackState;

  /** Called each frame to update interpolation */
  update(): void;

  /** Check if tour is currently active */
  isActive(): boolean;
}

// ============================================================================
// Implementation
// ============================================================================

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Resolve a keyframe's RA/Dec position.
 * If the keyframe has a target body, compute the position from the engine.
 * Otherwise, use the explicit ra/dec values.
 */
function resolveKeyframePosition(
  keyframe: TourKeyframe,
  resolveBodyPosition?: (target: TargetBody, datetime: Date) => BodyPosition
): { ra: number; dec: number } {
  if (keyframe.target) {
    if (!resolveBodyPosition) {
      console.error(
        `Tour keyframe has target '${keyframe.target}' but no resolveBodyPosition callback provided`
      );
      return { ra: keyframe.ra ?? 0, dec: keyframe.dec ?? 0 };
    }
    const datetime = new Date(keyframe.datetime);
    return resolveBodyPosition(keyframe.target, datetime);
  }

  if (keyframe.ra === undefined || keyframe.dec === undefined) {
    console.error('Tour keyframe must have either target or ra/dec specified');
    return { ra: 0, dec: 0 };
  }

  return { ra: keyframe.ra, dec: keyframe.dec };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpTime(fromDate: Date, toDate: Date, t: number): Date {
  const fromMs = fromDate.getTime();
  const toMs = toDate.getTime();
  return new Date(lerp(fromMs, toMs, t));
}

/**
 * Create a tour engine instance.
 */
export function createTourEngine(callbacks: TourCallbacks): TourEngine {
  // Playback state
  let status: 'idle' | 'playing' | 'paused' = 'idle';
  let currentTour: TourDefinition | null = null;
  let currentKeyframeIndex = 0;
  let phase: 'hold' | 'transition' = 'transition';
  let segmentStartTime = 0;

  // Interpolation state (for FOV, time, and location)
  let startFov = 60;
  let targetFov = 60;
  let startTime: Date = new Date();
  let targetTime: Date = new Date();
  let currentTimeMode: 'instant' | 'animate' = 'instant';

  // Location interpolation state
  let startLocation: TourLocation | null = null;
  let targetLocation: TourLocation | null = null;
  let hasLocationChange = false;

  // Track if we've started the camera animation for current transition
  let cameraAnimationStarted = false;

  function getState(): TourPlaybackState {
    const overallProgress = calculateOverallProgress();
    const currentKeyframe = currentTour?.keyframes[currentKeyframeIndex];

    return {
      status,
      currentTour,
      currentKeyframeIndex,
      segmentProgress: calculateSegmentProgress(),
      phase,
      overallProgress,
      currentCaption: currentKeyframe?.caption ?? null,
    };
  }

  function calculateSegmentProgress(): number {
    if (status === 'idle' || !currentTour) return 0;

    const keyframe = currentTour.keyframes[currentKeyframeIndex];
    const elapsed = performance.now() - segmentStartTime;
    const duration = phase === 'transition' ? keyframe.transitionDuration : keyframe.holdDuration;

    if (duration === 0) return 1;
    return Math.min(1, elapsed / duration);
  }

  function calculateOverallProgress(): number {
    if (!currentTour || currentTour.keyframes.length === 0) return 0;

    // Calculate total tour duration
    let totalDuration = 0;
    let elapsedDuration = 0;

    for (let i = 0; i < currentTour.keyframes.length; i++) {
      const kf = currentTour.keyframes[i];
      const keyframeDuration = kf.transitionDuration + kf.holdDuration;
      totalDuration += keyframeDuration;

      if (i < currentKeyframeIndex) {
        elapsedDuration += keyframeDuration;
      } else if (i === currentKeyframeIndex) {
        const segmentProgress = calculateSegmentProgress();
        if (phase === 'transition') {
          elapsedDuration += kf.transitionDuration * segmentProgress;
        } else {
          elapsedDuration += kf.transitionDuration + kf.holdDuration * segmentProgress;
        }
      }
    }

    return totalDuration > 0 ? elapsedDuration / totalDuration : 0;
  }

  function notifyStateChange(): void {
    callbacks.onStateChange?.(getState());
  }

  function play(tour: TourDefinition): void {
    if (tour.keyframes.length === 0) {
      console.warn('Cannot play empty tour');
      return;
    }

    currentTour = tour;
    currentKeyframeIndex = 0;
    status = 'playing';
    phase = 'transition';
    segmentStartTime = performance.now();
    cameraAnimationStarted = false;

    // Set up first keyframe transition
    const firstKeyframe = tour.keyframes[0];
    startFov = callbacks.getFov();
    targetFov = firstKeyframe.fov;
    startTime = new Date();
    targetTime = new Date(firstKeyframe.datetime);
    currentTimeMode = firstKeyframe.timeMode;

    // Set up location interpolation
    if (firstKeyframe.location && callbacks.setLocation) {
      startLocation = callbacks.getLocation?.() ?? null;
      targetLocation = firstKeyframe.location;
      hasLocationChange = true;
      // For first keyframe, set location immediately (no smooth transition from unknown start)
      callbacks.setLocation(
        targetLocation.latitude,
        targetLocation.longitude,
        targetLocation.name
      );
    } else {
      hasLocationChange = false;
      targetLocation = null;
    }

    // Resolve position (either from target body or explicit ra/dec)
    const { ra, dec } = resolveKeyframePosition(firstKeyframe, callbacks.resolveBodyPosition);

    // Start camera animation
    callbacks.animateToRaDec(ra, dec, firstKeyframe.transitionDuration);
    cameraAnimationStarted = true;

    // If instant time mode, set time immediately
    if (firstKeyframe.timeMode === 'instant') {
      callbacks.setTime(targetTime);
    }

    // Notify caption
    callbacks.onCaptionChange?.(firstKeyframe.caption ?? null);

    notifyStateChange();
  }

  function pause(): void {
    if (status === 'playing') {
      status = 'paused';
      notifyStateChange();
    }
  }

  function resume(): void {
    if (status === 'paused') {
      // Adjust segment start time to account for pause duration
      // (This is a simplification - a more robust impl would track pause time)
      status = 'playing';
      notifyStateChange();
    }
  }

  function stop(): void {
    status = 'idle';
    currentTour = null;
    currentKeyframeIndex = 0;
    phase = 'transition';
    callbacks.onCaptionChange?.(null);
    notifyStateChange();
  }

  function advanceToKeyframe(index: number): void {
    if (!currentTour) return;

    if (index >= currentTour.keyframes.length) {
      // Tour complete
      if (currentTour.loop) {
        index = 0;
      } else {
        stop();
        callbacks.onTourComplete?.();
        return;
      }
    }

    if (index < 0) {
      index = 0;
    }

    const prevKeyframe = currentTour.keyframes[currentKeyframeIndex];
    currentKeyframeIndex = index;
    const keyframe = currentTour.keyframes[index];

    // Start transition phase
    phase = 'transition';
    segmentStartTime = performance.now();
    cameraAnimationStarted = false;

    // Set up interpolation
    startFov = callbacks.getFov();
    targetFov = keyframe.fov;
    startTime = prevKeyframe ? new Date(prevKeyframe.datetime) : new Date();
    targetTime = new Date(keyframe.datetime);
    currentTimeMode = keyframe.timeMode;

    // Set up location interpolation
    if (keyframe.location && callbacks.setLocation) {
      startLocation = prevKeyframe?.location ?? callbacks.getLocation?.() ?? null;
      targetLocation = keyframe.location;
      hasLocationChange = true;
    } else {
      hasLocationChange = false;
      startLocation = null;
      targetLocation = null;
    }

    // Resolve position (either from target body or explicit ra/dec)
    const { ra, dec } = resolveKeyframePosition(keyframe, callbacks.resolveBodyPosition);

    // Start camera animation
    callbacks.animateToRaDec(ra, dec, keyframe.transitionDuration);
    cameraAnimationStarted = true;

    // If instant time mode, set time immediately
    if (keyframe.timeMode === 'instant') {
      callbacks.setTime(targetTime);
    }

    // Update caption
    callbacks.onCaptionChange?.(keyframe.caption ?? null);

    notifyStateChange();
  }

  function next(): void {
    if (status === 'idle' || !currentTour) return;
    advanceToKeyframe(currentKeyframeIndex + 1);
  }

  function previous(): void {
    if (status === 'idle' || !currentTour) return;
    advanceToKeyframe(currentKeyframeIndex - 1);
  }

  function update(): void {
    if (status !== 'playing' || !currentTour) return;

    const keyframe = currentTour.keyframes[currentKeyframeIndex];
    const elapsed = performance.now() - segmentStartTime;

    if (phase === 'transition') {
      const duration = keyframe.transitionDuration;

      if (duration === 0) {
        // Instant transition
        callbacks.setFov(targetFov);
        if (currentTimeMode === 'animate') {
          callbacks.setTime(targetTime);
        }
        // Set location immediately for instant transitions
        if (hasLocationChange && targetLocation && callbacks.setLocation) {
          callbacks.setLocation(
            targetLocation.latitude,
            targetLocation.longitude,
            targetLocation.name
          );
        }
        phase = 'hold';
        segmentStartTime = performance.now();
        notifyStateChange();
        return;
      }

      const t = Math.min(1, elapsed / duration);
      const eased = easeInOutCubic(t);

      // Interpolate FOV
      const newFov = lerp(startFov, targetFov, eased);
      callbacks.setFov(newFov);

      // Interpolate time if in animate mode
      if (currentTimeMode === 'animate') {
        const newTime = lerpTime(startTime, targetTime, eased);
        callbacks.setTime(newTime);
      }

      // Interpolate location if changing
      if (hasLocationChange && targetLocation && callbacks.setLocation) {
        if (startLocation) {
          // Smooth interpolation between locations
          const newLat = lerp(startLocation.latitude, targetLocation.latitude, eased);
          const newLon = lerp(startLocation.longitude, targetLocation.longitude, eased);
          callbacks.setLocation(newLat, newLon, targetLocation.name);
        } else {
          // No start location, just set target
          callbacks.setLocation(
            targetLocation.latitude,
            targetLocation.longitude,
            targetLocation.name
          );
        }
      }

      // Check if transition complete
      if (t >= 1) {
        phase = 'hold';
        segmentStartTime = performance.now();
        notifyStateChange();
      }
    } else {
      // Hold phase
      const duration = keyframe.holdDuration;

      if (duration === 0 || elapsed >= duration) {
        // Hold complete, advance to next keyframe
        advanceToKeyframe(currentKeyframeIndex + 1);
      }
    }
  }

  function isActive(): boolean {
    return status !== 'idle';
  }

  return {
    play,
    pause,
    resume,
    stop,
    next,
    previous,
    getState,
    update,
    isActive,
  };
}
