/**
 * Render Scheduler (render-on-demand)
 *
 * Owns a single "dirty" flag that gates the expensive WebGL + CSS2D render
 * calls in the animation loop. The rAF loop keeps running continuously, but
 * `renderer.render()` is skipped on frames where nothing has changed AND no
 * always-render mode is active.
 *
 * Any code path that mutates something the renderer draws (camera, time, layer
 * visibility, resize, ...) must call `requestRender()`. A missed call produces
 * a stale frame, so callers should err on the side of requesting a render.
 *
 * "Always-render" modes (topocentric scintillation, hubble/jwst continuous
 * motion, AR device orientation, eclipse corona shader, in-progress label
 * fades, camera fly-to animations, active tour) bypass the flag entirely
 * because they animate every frame without a discrete triggering event.
 */

/**
 * Inputs to the always-render decision. All are sampled once per frame by the
 * animation loop. Kept as a plain data object so the decision is a pure,
 * unit-testable function.
 */
export interface AlwaysRenderInputs {
  /** Current view mode. */
  viewMode: "geocentric" | "topocentric" | "hubble" | "jwst";
  /** AR device-orientation mode is active (orientation fires ~60 Hz). */
  arEnabled: boolean;
  /** Eclipse corona shader is visible and advancing its time uniform. */
  coronaActive: boolean;
  /** One or more labels are mid-fade (opacity lerping toward its target). */
  fadesInProgress: boolean;
  /** Controls are running a multi-frame camera animation (slerp / roll / alt-az). */
  controlsAnimating: boolean;
  /** A tour is playing or paused (not idle). */
  tourActive: boolean;
}

/**
 * Pure decision: should the frame be rendered regardless of the dirty flag?
 *
 * Returns true when any mode needs continuous frames. Kept side-effect free so
 * it can be exhaustively unit tested.
 */
export function isAlwaysRenderMode(inputs: AlwaysRenderInputs): boolean {
  return (
    inputs.viewMode === "topocentric" ||
    inputs.viewMode === "hubble" ||
    inputs.viewMode === "jwst" ||
    inputs.arEnabled ||
    inputs.coronaActive ||
    inputs.fadesInProgress ||
    inputs.controlsAnimating ||
    inputs.tourActive
  );
}

export interface RenderScheduler {
  /** Mark the scene dirty so the next frame renders. Idempotent. */
  requestRender(): void;
  /**
   * Decide whether to render this frame and consume the dirty flag.
   *
   * Returns true (and clears the dirty flag) when the scene is dirty OR an
   * always-render mode is active; returns false when the scene is clean and
   * static, in which case the caller should skip the render calls.
   */
  shouldRender(alwaysRender: boolean): boolean;
  /** Inspect the dirty flag without consuming it (for tests / diagnostics). */
  peekNeedsRender(): boolean;
}

/**
 * Create a render scheduler. Starts dirty so the very first frame always
 * renders (avoids a blank canvas before the first triggering event).
 */
export function createRenderScheduler(): RenderScheduler {
  let needsRender = true;

  return {
    requestRender(): void {
      needsRender = true;
    },
    shouldRender(alwaysRender: boolean): boolean {
      if (needsRender || alwaysRender) {
        needsRender = false;
        return true;
      }
      return false;
    },
    peekNeedsRender(): boolean {
      return needsRender;
    },
  };
}
