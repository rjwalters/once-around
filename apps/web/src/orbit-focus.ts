/**
 * Orbit focus handler - click on planet labels to focus their orbits.
 */

export interface OrbitFocusOptions {
  isOrbitsVisible: () => boolean;
  setOrbitsVisible: (visible: boolean) => void;
  focusOrbit: (bodyIndex: number | null) => void;
  computeOrbits: () => void;
  saveOrbitsVisible: (visible: boolean) => void;
}

export interface OrbitFocusHandler {
  /** Reset the focused orbit (show all) */
  resetFocus: () => void;
  /** Get the currently focused body index (null = show all) */
  getFocusedBody: () => number | null;
}

/**
 * Set up orbit focus click handler for planet labels.
 */
export function setupOrbitFocus(options: OrbitFocusOptions): OrbitFocusHandler {
  const {
    isOrbitsVisible,
    setOrbitsVisible,
    focusOrbit,
    computeOrbits,
    saveOrbitsVisible,
  } = options;

  // Track which planet is focused (null = show all, body index = focused)
  let focusedOrbitBody: number | null = null;

  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains("planet-label") && target.dataset.body) {
      const bodyIndex = parseInt(target.dataset.body, 10);
      if (!isNaN(bodyIndex)) {
        // Only handle planets with orbits (indices 2-8: Mercury through Neptune)
        // Sun (0) and Moon (1) don't have orbit lines
        if (bodyIndex >= 2 && bodyIndex <= 8) {
          // If orbits are visible, toggle focus
          if (isOrbitsVisible()) {
            if (focusedOrbitBody === bodyIndex) {
              // Clicking the same planet again: show all orbits
              focusedOrbitBody = null;
              focusOrbit(null);
            } else {
              // Focus on this planet's orbit
              focusedOrbitBody = bodyIndex;
              focusOrbit(bodyIndex);
            }
          } else {
            // Orbits not visible: turn them on and focus on this planet
            setOrbitsVisible(true);
            computeOrbits();
            focusedOrbitBody = bodyIndex;
            focusOrbit(bodyIndex);
            saveOrbitsVisible(true);
          }
        }
      }
    }
  });

  return {
    resetFocus: () => {
      focusedOrbitBody = null;
    },
    getFocusedBody: () => focusedOrbitBody,
  };
}
