/**
 * Keyboard shortcuts handler.
 */

export interface KeyboardHandlerOptions {
  // Toggle callbacks
  toggleLabels: () => void;
  toggleConstellations: () => void;
  toggleVideos: () => void;
  toggleOrbits: () => void;
  toggleDSOs: () => void;
  toggleNightVision: () => void;
  toggleHorizon: () => void;
  // Action callbacks
  handleNextEclipse: () => void;
  jumpToNow: () => void;
  animateToGalacticCenter: () => void;
  stepTimeBackward: () => void;
  stepTimeForward: () => void;
  togglePlayback: () => void;
  focusSearch: () => void;
  showHelp: () => void;
}

/**
 * Set up global keyboard shortcuts.
 */
export function setupKeyboardHandler(options: KeyboardHandlerOptions): void {
  const {
    toggleLabels,
    toggleConstellations,
    toggleVideos,
    toggleOrbits,
    toggleDSOs,
    toggleNightVision,
    toggleHorizon,
    handleNextEclipse,
    jumpToNow,
    animateToGalacticCenter,
    stepTimeBackward,
    stepTimeForward,
    togglePlayback,
    focusSearch,
    showHelp,
  } = options;

  window.addEventListener("keydown", (event) => {
    // Don't trigger shortcuts when typing in input fields
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    // Don't intercept browser shortcuts (Cmd/Ctrl + key combinations)
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    switch (event.key.toLowerCase()) {
      case "l":
        toggleLabels();
        break;
      case "c":
        toggleConstellations();
        break;
      case "v":
        toggleVideos();
        break;
      case "o":
        toggleOrbits();
        break;
      case "d":
        toggleDSOs();
        break;
      case "r":
        toggleNightVision();
        break;
      case "h":
        toggleHorizon();
        break;
      case "e":
        handleNextEclipse();
        break;
      case "n":
        jumpToNow();
        break;
      case " ":
        event.preventDefault();
        animateToGalacticCenter();
        break;
      case "arrowleft":
        event.preventDefault();
        stepTimeBackward();
        break;
      case "arrowright":
        event.preventDefault();
        stepTimeForward();
        break;
      case "p":
        togglePlayback();
        break;
      case "/":
        event.preventDefault();
        focusSearch();
        break;
      case "?":
        event.preventDefault();
        showHelp();
        break;
    }
  });
}
