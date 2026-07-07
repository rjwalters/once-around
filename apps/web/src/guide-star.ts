/**
 * Guide Star Lock — Fine Guidance Sensor (FGS) pointing simulation.
 *
 * Real space telescopes (Hubble, JWST) hold their attitude by locking their
 * Fine Guidance Sensors onto a bright "guide star" in the field and steering to
 * keep it fixed on the sensor. This module recreates that idiom in the space
 * telescope view modes (`hubble`, `jwst`):
 *
 *   1. The observer points the telescope at a region (drag / search / zoom).
 *   2. Pressing "Lock Guide Star" acquires the nearest bright catalog star to
 *      the current pointing, slews to center it, and freezes free navigation so
 *      the pointing is held steady — exactly what an FGS lock does.
 *   3. An FGS crosshair reticle is projected onto the guide star every rendered
 *      frame, and a status readout names the locked star.
 *
 * Render-on-demand: the `hubble`/`jwst` modes are already always-render, so the
 * reticle projection rides the existing per-frame render without introducing a
 * new continuous-render trigger. The `hold()` re-point is epsilon-gated so it
 * only requests a render when the pointing has actually drifted off the guide
 * star (which, with input frozen and stars fixed in the inertial frame, is
 * effectively never) — a static, on-target lock stays static.
 */

import * as THREE from "three";
import { STAR_DATA } from "./starData";
import { angularSeparation, raDecToDirection } from "./geometry/coordinates";
import { showToast } from "./toast";

/** A star that can be acquired as a guide star. */
export interface GuideStarCandidate {
  name: string;
  /** Right ascension in degrees. */
  ra: number;
  /** Declination in degrees. */
  dec: number;
  /** Apparent visual magnitude (lower = brighter). */
  magnitude: number;
}

/** Result of a guide-star acquisition search. */
export interface GuideStarMatch {
  star: GuideStarCandidate;
  /** Angular separation from the search center, in degrees. */
  separationDeg: number;
}

/**
 * Half-angle of the FGS acquisition field, in degrees. A guide star must fall
 * within this cone of the current pointing to be acquired. Kept generous
 * because the bright-star catalog is sparse (~50 stars), while still small
 * enough that "lock" centers on a star the observer is deliberately pointing at.
 */
export const ACQUISITION_RADIUS_DEG = 25;

/**
 * Pointing error (degrees) beyond which the lock re-asserts itself. Below this
 * the guide star is considered dead-centered and no re-point (and no render) is
 * issued, so a settled lock does not churn the render-on-demand scheduler.
 */
export const HOLD_EPSILON_DEG = 0.02;

/** Build the guide-star candidate list from the bright-star catalog. */
export function buildGuideStarCandidates(): GuideStarCandidate[] {
  return Object.values(STAR_DATA).map((s) => ({
    name: s.name,
    ra: s.ra,
    dec: s.dec,
    magnitude: s.magnitude,
  }));
}

/**
 * Find the guide star nearest the given pointing, within `maxRadiusDeg`.
 *
 * Nearest (rather than brightest) is used so that "lock" centers on the star
 * the observer is actually pointing at. Exact-distance ties are broken toward
 * the brighter star. Returns null when no candidate is within range.
 */
export function findNearestGuideStar(
  centerRaDeg: number,
  centerDecDeg: number,
  maxRadiusDeg: number,
  candidates: GuideStarCandidate[]
): GuideStarMatch | null {
  let best: GuideStarMatch | null = null;
  for (const c of candidates) {
    // angularSeparation is a pure great-circle distance; feeding it
    // (dec, ra) pairs yields the on-sky separation between two RA/Dec points.
    const sep = angularSeparation(centerDecDeg, centerRaDeg, c.dec, c.ra);
    if (sep > maxRadiusDeg) continue;
    if (
      best === null ||
      sep < best.separationDeg ||
      (sep === best.separationDeg && c.magnitude < best.star.magnitude)
    ) {
      best = { star: c, separationDeg: sep };
    }
  }
  return best;
}

/** Distance at which the guide-star direction is placed for screen projection. */
const RETICLE_PROJECT_RADIUS = 100;

type SpaceAwareViewMode = "geocentric" | "topocentric" | "hubble" | "jwst";

function isSpaceTelescopeMode(mode: string): boolean {
  return mode === "hubble" || mode === "jwst";
}

export interface GuideStarLockControls {
  getRaDec: () => { ra: number; dec: number };
  animateToRaDec: (ra: number, dec: number, durationMs?: number) => void;
  lookAtRaDec: (ra: number, dec: number) => void;
  setEnabled: (enabled: boolean) => void;
}

export interface GuideStarLockDeps {
  /** Overlay parent (the canvas container) the reticle is positioned within. */
  container: HTMLElement;
  /** The perspective camera used to project the guide star to screen. */
  camera: THREE.PerspectiveCamera;
  /** Camera controls facade (pointing + input enable). */
  controls: GuideStarLockControls;
  /** Current view mode (guide lock is only available in space telescope modes). */
  getViewMode: () => string;
  /** Mark the scene dirty so the next frame renders. */
  requestRender: () => void;
}

export interface GuideStarLock {
  /** Wire up the lock button. */
  setupEventListeners: () => void;
  /** Toggle the lock (engage if released, release if engaged). */
  toggle: () => void;
  /** Release the lock if engaged (no-op otherwise). */
  release: () => void;
  /** Whether a guide star is currently locked. */
  isLocked: () => boolean;
  /** Name of the locked guide star, or null when unlocked. */
  getGuideStarName: () => string | null;
  /**
   * Re-assert the lock if the pointing has drifted past HOLD_EPSILON_DEG.
   * Called before the render-skip gate so a correction can trigger a render.
   */
  hold: (controlsAnimating: boolean) => void;
  /**
   * Reposition the FGS reticle over the guide star. Called on rendered frames
   * only (after the render-skip gate), so the DOM overlay stays in sync with
   * the WebGL frame.
   */
  renderOverlay: () => void;
  /** React to a view-mode change: show/hide the button, auto-release on exit. */
  onViewModeChange: (mode: SpaceAwareViewMode) => void;
}

/**
 * Create the guide-star lock controller. Builds the FGS reticle overlay and
 * wires the lock button. The candidate list can be injected for testing.
 */
export function createGuideStarLock(
  deps: GuideStarLockDeps,
  candidates: GuideStarCandidate[] = buildGuideStarCandidates()
): GuideStarLock {
  const { container, camera, controls, getViewMode, requestRender } = deps;

  let locked = false;
  let guideStar: GuideStarCandidate | null = null;

  // Precomputed guide-star geometry (stars are fixed in the inertial frame, so
  // this is set once at engage time and reused every frame — no per-frame alloc).
  const guideStarDir = new THREE.Vector3();
  const guideStarWorldPos = new THREE.Vector3();
  const _camDir = new THREE.Vector3();
  const _ndc = new THREE.Vector3();

  const button = document.getElementById("guide-star-lock");

  // --- FGS reticle overlay (built once, shown only while locked) -------------
  const reticle = document.createElement("div");
  reticle.className = "fgs-reticle";
  reticle.style.display = "none";
  reticle.setAttribute("aria-hidden", "true");
  reticle.innerHTML = `
    <svg class="fgs-reticle-svg" viewBox="0 0 120 120" width="120" height="120">
      <circle class="fgs-ring" cx="60" cy="60" r="34" />
      <line class="fgs-tick" x1="60" y1="6"  x2="60" y2="30" />
      <line class="fgs-tick" x1="60" y1="90" x2="60" y2="114" />
      <line class="fgs-tick" x1="6"  y1="60" x2="30" y2="60" />
      <line class="fgs-tick" x1="90" y1="60" x2="114" y2="60" />
      <circle class="fgs-dot" cx="60" cy="60" r="2" />
    </svg>
    <div class="fgs-reticle-label"></div>
  `;
  const reticleLabel = reticle.querySelector(".fgs-reticle-label") as HTMLDivElement;
  container.appendChild(reticle);

  function updateButton(): void {
    if (!button) return;
    button.classList.toggle("active", locked);
    if (locked && guideStar) {
      button.textContent = `\u{1F513} Release: ${guideStar.name}`;
      button.setAttribute("title", `FGS locked on ${guideStar.name} — click to release`);
    } else {
      button.textContent = "\u{1F512} Lock Guide Star";
      button.setAttribute("title", "Acquire the nearest bright star as an FGS guide star");
    }
  }

  function engage(): boolean {
    if (!isSpaceTelescopeMode(getViewMode())) {
      showToast("FGS guide-star lock is only available in Hubble and JWST modes.");
      return false;
    }
    const { ra, dec } = controls.getRaDec();
    const match = findNearestGuideStar(ra, dec, ACQUISITION_RADIUS_DEG, candidates);
    if (!match) {
      showToast("FGS: no guide star within acquisition range — slew closer to a bright star.");
      return false;
    }

    guideStar = match.star;
    locked = true;

    // Cache the fixed guide-star geometry for per-frame projection.
    guideStarDir.copy(raDecToDirection(guideStar.ra, guideStar.dec));
    guideStarWorldPos.copy(guideStarDir).multiplyScalar(RETICLE_PROJECT_RADIUS);

    // Slew to center the guide star, then freeze navigation so pointing holds.
    controls.animateToRaDec(guideStar.ra, guideStar.dec, 700);
    controls.setEnabled(false);

    reticleLabel.textContent = `FGS LOCK · ${guideStar.name}`;
    reticle.style.display = "block";
    updateButton();
    requestRender();
    showToast(`FGS locked on ${guideStar.name}.`);
    return true;
  }

  function release(): void {
    if (!locked) return;
    locked = false;
    guideStar = null;
    controls.setEnabled(true);
    reticle.style.display = "none";
    updateButton();
    requestRender();
  }

  function toggle(): void {
    if (locked) {
      release();
    } else {
      engage();
    }
  }

  function hold(controlsAnimating: boolean): void {
    if (!locked || !guideStar) return;
    // Don't fight the acquisition slew — let the animation reach the target.
    if (controlsAnimating) return;
    const { ra, dec } = controls.getRaDec();
    const err = angularSeparation(dec, ra, guideStar.dec, guideStar.ra);
    if (err > HOLD_EPSILON_DEG) {
      // Re-assert the lock. Epsilon-gated so an on-target lock never re-points
      // and therefore never requests a render on a static frame.
      controls.lookAtRaDec(guideStar.ra, guideStar.dec);
      requestRender();
    }
  }

  function renderOverlay(): void {
    if (!locked || !guideStar) return;

    // Hide the reticle when the guide star is behind the camera.
    camera.getWorldDirection(_camDir);
    if (_camDir.dot(guideStarDir) <= 0) {
      reticle.style.display = "none";
      return;
    }

    _ndc.copy(guideStarWorldPos).project(camera);
    const width = container.clientWidth;
    const height = container.clientHeight;
    const x = (_ndc.x * 0.5 + 0.5) * width;
    const y = (-_ndc.y * 0.5 + 0.5) * height;

    reticle.style.display = "block";
    reticle.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  }

  function onViewModeChange(mode: SpaceAwareViewMode): void {
    const isSpace = isSpaceTelescopeMode(mode);
    button?.classList.toggle("hidden", !isSpace);
    // Leaving a space telescope mode drops the lock (FGS only exists there).
    if (!isSpace && locked) {
      release();
    }
  }

  function setupEventListeners(): void {
    button?.addEventListener("click", toggle);
    // Reflect the initial mode (button hidden outside space telescope modes).
    onViewModeChange(getViewMode() as SpaceAwareViewMode);
    updateButton();
  }

  return {
    setupEventListeners,
    toggle,
    release,
    isLocked: () => locked,
    getGuideStarName: () => guideStar?.name ?? null,
    hold,
    renderOverlay,
    onViewModeChange,
  };
}
