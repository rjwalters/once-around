/**
 * Keyboard shortcuts handler.
 *
 * The set of bindings lives in `keyboard-shortcuts.ts` (the single source of
 * truth shared with the help overlay). This module maps each dispatched
 * shortcut id to its callback and wires a single `keydown` listener from the
 * registry, so the overlay and the dispatch cannot drift apart.
 */

import { KEYBOARD_SHORTCUTS, isDispatchShortcut, type ShortcutId } from "./keyboard-shortcuts";

export interface KeyboardHandlerOptions {
  // Toggle callbacks
  toggleLabels: () => void;
  toggleConstellations: () => void;
  toggleVideos: () => void;
  toggleOrbits: () => void;
  toggleDSOs: () => void;
  toggleDeepFields: () => void;
  toggleMeteorShowers: () => void;
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
  /** Toggle the guide-star (FGS) lock (only acts in Hubble/JWST modes). */
  toggleGuideStarLock?: () => void;
}

/**
 * Set up global keyboard shortcuts.
 */
export function setupKeyboardHandler(options: KeyboardHandlerOptions): void {
  // Map each registry shortcut id to its callback. Keyed by `ShortcutId`, so a
  // new dispatched entry in the registry forces a matching callback here at
  // compile time (and removing one is likewise caught).
  const handlers: Record<ShortcutId, (() => void) | undefined> = {
    toggleLabels: options.toggleLabels,
    toggleConstellations: options.toggleConstellations,
    toggleVideos: options.toggleVideos,
    toggleOrbits: options.toggleOrbits,
    toggleDSOs: options.toggleDSOs,
    toggleDeepFields: options.toggleDeepFields,
    toggleMeteorShowers: options.toggleMeteorShowers,
    toggleNightVision: options.toggleNightVision,
    toggleHorizon: options.toggleHorizon,
    toggleGuideStarLock: options.toggleGuideStarLock,
    handleNextEclipse: options.handleNextEclipse,
    jumpToNow: options.jumpToNow,
    animateToGalacticCenter: options.animateToGalacticCenter,
    stepTimeBackward: options.stepTimeBackward,
    stepTimeForward: options.stepTimeForward,
    togglePlayback: options.togglePlayback,
    focusSearch: options.focusSearch,
    showHelp: options.showHelp,
  };

  // Build the `event.key.toLowerCase()` -> handler map from the registry.
  const keyMap = new Map<string, { run: () => void; preventDefault: boolean }>();
  for (const shortcut of KEYBOARD_SHORTCUTS) {
    if (!isDispatchShortcut(shortcut)) continue;
    const run = handlers[shortcut.id as ShortcutId];
    if (!run) continue;
    for (const key of shortcut.eventKeys) {
      keyMap.set(key, { run, preventDefault: shortcut.preventDefault ?? false });
    }
  }

  window.addEventListener("keydown", (event) => {
    // Don't trigger shortcuts when typing in input fields
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    // Don't intercept browser shortcuts (Cmd/Ctrl + key combinations)
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const entry = keyMap.get(event.key.toLowerCase());
    if (!entry) return;

    if (entry.preventDefault) {
      event.preventDefault();
    }
    entry.run();
  });
}
