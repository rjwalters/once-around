/**
 * Keyboard shortcut registry — the single source of truth shared between the
 * global key dispatch (`keyboard-handler.ts`) and the help overlay (`#help-modal`).
 *
 * IMPORTANT: This module must stay WASM-free. It must NOT import `engine.ts`
 * (directly or transitively) so that the WASM-free CI geometry/vitest job can
 * import it without building the WASM module. See the CLAUDE.md gotcha and the
 * `satellites-config.ts` precedent.
 */

/** Grouping used to lay the overlay out into sections, in this order. */
export type ShortcutCategory = "view" | "time" | "other" | "mouse";

/**
 * A shortcut that is dispatched from a keydown. Its `id` matches a callback
 * field on `KeyboardHandlerOptions`, which couples the registry to the dispatch
 * at compile time (see `keyboard-handler.ts`).
 */
export interface DispatchShortcut {
  kind: "dispatch";
  /** Stable id — must equal a callback key in `KeyboardHandlerOptions`. */
  id: string;
  /** `event.key.toLowerCase()` values that trigger this shortcut. */
  eventKeys: string[];
  /** Label shown inside the `<kbd>` in the overlay. */
  display: string;
  /** Human-readable description shown next to the key. */
  description: string;
  category: ShortcutCategory;
  /** Whether the keydown should `preventDefault()` (e.g. Space, `/`, arrows). */
  preventDefault?: boolean;
}

/**
 * A row that appears in the overlay for documentation only — it has no keydown
 * dispatch here (e.g. mouse gestures, Esc handled by `modal-utils`, arrow-key
 * camera panning handled in `controls/index.ts`).
 */
export interface InfoShortcut {
  kind: "info";
  /** Label shown in the overlay. */
  display: string;
  description: string;
  category: ShortcutCategory;
  /** Render the label as a plain action chip instead of a `<kbd>`. */
  displayKind?: "kbd" | "action";
}

export type Shortcut = DispatchShortcut | InfoShortcut;

/**
 * Canonical list of every keyboard shortcut and documented input gesture.
 *
 * Dispatch entries are consumed by `setupKeyboardHandler` to build its
 * key -> callback map, so adding a binding here (or removing one) automatically
 * updates both the dispatch and the overlay — they cannot drift apart.
 */
export const KEYBOARD_SHORTCUTS: readonly Shortcut[] = [
  // --- View Controls -------------------------------------------------------
  {
    kind: "dispatch",
    id: "toggleLabels",
    eventKeys: ["l"],
    display: "L",
    description: "Toggle labels",
    category: "view",
  },
  {
    kind: "dispatch",
    id: "toggleConstellations",
    eventKeys: ["c"],
    display: "C",
    description: "Toggle constellations",
    category: "view",
  },
  {
    kind: "dispatch",
    id: "toggleVideos",
    eventKeys: ["v"],
    display: "V",
    description: "Toggle videos",
    category: "view",
  },
  {
    kind: "dispatch",
    id: "toggleOrbits",
    eventKeys: ["o"],
    display: "O",
    description: "Toggle orbits",
    category: "view",
  },
  {
    kind: "dispatch",
    id: "toggleDSOs",
    eventKeys: ["d"],
    display: "D",
    description: "Toggle deep sky objects",
    category: "view",
  },
  {
    kind: "dispatch",
    id: "toggleDeepFields",
    eventKeys: ["f"],
    display: "F",
    description: "Toggle deep-field markers",
    category: "view",
  },
  {
    kind: "dispatch",
    id: "toggleMeteorShowers",
    eventKeys: ["m"],
    display: "M",
    description: "Toggle meteor showers",
    category: "view",
  },
  {
    kind: "dispatch",
    id: "toggleHorizon",
    eventKeys: ["h"],
    display: "H",
    description: "Toggle horizon/ground",
    category: "view",
  },
  {
    kind: "dispatch",
    id: "toggleNightVision",
    eventKeys: ["r"],
    display: "R",
    description: "Night vision mode",
    category: "view",
  },
  {
    kind: "dispatch",
    id: "toggleGuideStarLock",
    eventKeys: ["g"],
    display: "G",
    description: "Lock FGS guide star (Hubble/JWST)",
    category: "view",
  },

  // --- Time & Navigation ---------------------------------------------------
  {
    kind: "dispatch",
    id: "jumpToNow",
    eventKeys: ["n"],
    display: "N",
    description: "Jump to current time",
    category: "time",
  },
  {
    kind: "dispatch",
    id: "togglePlayback",
    eventKeys: ["p"],
    display: "P",
    description: "Play/pause time",
    category: "time",
  },
  {
    kind: "dispatch",
    id: "stepTimeBackward",
    eventKeys: ["arrowleft"],
    display: "←",
    description: "Step time backward",
    category: "time",
    preventDefault: true,
  },
  {
    kind: "dispatch",
    id: "stepTimeForward",
    eventKeys: ["arrowright"],
    display: "→",
    description: "Step time forward",
    category: "time",
    preventDefault: true,
  },
  {
    kind: "dispatch",
    id: "handleNextEclipse",
    eventKeys: ["e"],
    display: "E",
    description: "Next total eclipse",
    category: "time",
  },
  {
    kind: "dispatch",
    id: "animateToGalacticCenter",
    eventKeys: [" "],
    display: "Space",
    description: "Go to galactic center",
    category: "time",
    preventDefault: true,
  },
  {
    kind: "info",
    display: "↑ ↓",
    description: "Pan camera up/down (arrow keys also rotate the view)",
    category: "time",
  },

  // --- Other ---------------------------------------------------------------
  {
    kind: "dispatch",
    id: "focusSearch",
    eventKeys: ["/"],
    display: "/",
    description: "Focus search",
    category: "other",
    preventDefault: true,
  },
  {
    kind: "dispatch",
    id: "showHelp",
    eventKeys: ["?"],
    display: "?",
    description: "Show/hide this help",
    category: "other",
    preventDefault: true,
  },
  {
    kind: "info",
    display: "Esc",
    description: "Stop tour / close modal",
    category: "other",
  },

  // --- Mouse & Touch -------------------------------------------------------
  {
    kind: "info",
    display: "Drag",
    description: "Look around",
    category: "mouse",
    displayKind: "action",
  },
  {
    kind: "info",
    display: "Scroll",
    description: "Zoom in/out",
    category: "mouse",
    displayKind: "action",
  },
  {
    kind: "info",
    display: "Click",
    description: "Select object",
    category: "mouse",
    displayKind: "action",
  },
];

/** The id of every dispatched shortcut — matches a `KeyboardHandlerOptions` callback. */
export type ShortcutId =
  | "toggleLabels"
  | "toggleConstellations"
  | "toggleVideos"
  | "toggleOrbits"
  | "toggleDSOs"
  | "toggleDeepFields"
  | "toggleMeteorShowers"
  | "toggleHorizon"
  | "toggleNightVision"
  | "toggleGuideStarLock"
  | "jumpToNow"
  | "togglePlayback"
  | "stepTimeBackward"
  | "stepTimeForward"
  | "handleNextEclipse"
  | "animateToGalacticCenter"
  | "focusSearch"
  | "showHelp";

/** Type guard narrowing a shortcut to a dispatched binding. */
export function isDispatchShortcut(s: Shortcut): s is DispatchShortcut {
  return s.kind === "dispatch";
}

/** Section titles and render order for the help overlay. */
const CATEGORY_ORDER: ReadonlyArray<{ category: ShortcutCategory; title: string }> = [
  { category: "view", title: "View Controls" },
  { category: "time", title: "Time & Navigation" },
  { category: "other", title: "Other" },
  { category: "mouse", title: "Mouse & Touch" },
];

/**
 * Build the help-overlay content from the registry into `container`, replacing
 * any existing children. Pure DOM — no Three.js, no render loop interaction.
 * WASM-free (uses only the DOM), safe to call at startup.
 */
export function renderShortcutHelp(container: HTMLElement): void {
  const doc = container.ownerDocument;
  container.replaceChildren();

  for (const { category, title } of CATEGORY_ORDER) {
    const entries = KEYBOARD_SHORTCUTS.filter((s) => s.category === category);
    if (entries.length === 0) continue;

    const section = doc.createElement("div");
    section.className = "help-section";

    const heading = doc.createElement("h3");
    heading.textContent = title;
    section.appendChild(heading);

    const list = doc.createElement("div");
    list.className = "help-shortcuts";

    for (const entry of entries) {
      const row = doc.createElement("div");
      row.className = "help-shortcut";

      const asAction = entry.kind === "info" && entry.displayKind === "action";
      const label = doc.createElement(asAction ? "span" : "kbd");
      if (asAction) label.className = "help-action";
      label.textContent = entry.display;

      const desc = doc.createElement("span");
      desc.textContent = entry.description;

      row.appendChild(label);
      row.appendChild(desc);
      list.appendChild(row);
    }

    section.appendChild(list);
    container.appendChild(section);
  }
}
