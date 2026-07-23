import { describe, it, expect } from "vitest";
import {
  KEYBOARD_SHORTCUTS,
  isDispatchShortcut,
  renderShortcutHelp,
  type Shortcut,
} from "./keyboard-shortcuts";

/**
 * Canonical dispatch bindings, mirroring the `handlers` map wired in
 * `keyboard-handler.ts` (which is itself keyed by `ShortcutId`). This is the
 * drift guard required by the issue: adding, removing, or re-keying a
 * dispatched binding in the registry without updating this list (and the
 * matching callback in `keyboard-handler.ts`) fails the test.
 */
const EXPECTED_DISPATCH: Record<string, string[]> = {
  toggleLabels: ["l"],
  toggleConstellations: ["c"],
  toggleVideos: ["v"],
  toggleOrbits: ["o"],
  toggleDSOs: ["d"],
  toggleDeepFields: ["f"],
  toggleMeteorShowers: ["m"],
  toggleHorizon: ["h"],
  toggleNightVision: ["r"],
  toggleGuideStarLock: ["g"],
  jumpToNow: ["n"],
  togglePlayback: ["p"],
  stepTimeBackward: ["arrowleft"],
  stepTimeForward: ["arrowright"],
  handleNextEclipse: ["e"],
  animateToGalacticCenter: [" "],
  focusSearch: ["/"],
  showHelp: ["?"],
};

describe("KEYBOARD_SHORTCUTS registry", () => {
  const dispatch = KEYBOARD_SHORTCUTS.filter(isDispatchShortcut);

  it("dispatch bindings exactly match the canonical id -> eventKeys map (drift guard)", () => {
    const actual: Record<string, string[]> = {};
    for (const s of dispatch) {
      actual[s.id] = [...s.eventKeys];
    }
    expect(actual).toEqual(EXPECTED_DISPATCH);
  });

  it("every dispatched shortcut carries the previously missing F and M bindings", () => {
    const byId = new Map(dispatch.map((s) => [s.id, s]));
    expect(byId.get("toggleDeepFields")?.eventKeys).toEqual(["f"]);
    expect(byId.get("toggleMeteorShowers")?.eventKeys).toEqual(["m"]);
  });

  it("does not document a phantom Tab shortcut", () => {
    const mentionsTab = KEYBOARD_SHORTCUTS.some(
      (s) => s.display.toLowerCase() === "tab" || (isDispatchShortcut(s) && s.eventKeys.includes("tab"))
    );
    expect(mentionsTab).toBe(false);
  });

  it("every entry has non-empty help text (display + description)", () => {
    for (const s of KEYBOARD_SHORTCUTS) {
      expect(s.display.trim().length, `display for ${describeShortcut(s)}`).toBeGreaterThan(0);
      expect(s.description.trim().length, `description for ${describeShortcut(s)}`).toBeGreaterThan(0);
    }
  });

  it("every dispatched shortcut has at least one lowercase event key", () => {
    for (const s of dispatch) {
      expect(s.eventKeys.length, `eventKeys for ${s.id}`).toBeGreaterThan(0);
      for (const key of s.eventKeys) {
        expect(key, `event key for ${s.id}`).toBe(key.toLowerCase());
      }
    }
  });

  it("no two dispatched shortcuts claim the same event key", () => {
    const seen = new Map<string, string>();
    for (const s of dispatch) {
      for (const key of s.eventKeys) {
        expect(seen.has(key), `key "${key}" is bound by both ${seen.get(key)} and ${s.id}`).toBe(
          false
        );
        seen.set(key, s.id);
      }
    }
  });
});

describe("renderShortcutHelp", () => {
  it("builds a section per non-empty category, in order, from the registry", () => {
    const container = new FakeElement("div");
    renderShortcutHelp(container as unknown as HTMLElement);

    const sections = container.children;
    // View Controls, Time & Navigation, Other, Mouse & Touch all have entries.
    expect(sections.map((s) => s.children[0].textContent)).toEqual([
      "View Controls",
      "Time & Navigation",
      "Other",
      "Mouse & Touch",
    ]);
  });

  it("renders every registry entry exactly once as a help-shortcut row", () => {
    const container = new FakeElement("div");
    renderShortcutHelp(container as unknown as HTMLElement);

    const rows = collect(container, (n) => n.className === "help-shortcut");
    expect(rows.length).toBe(KEYBOARD_SHORTCUTS.length);

    const rendered = rows.map((row) => ({
      display: row.children[0].textContent,
      description: row.children[1].textContent,
    }));
    for (const s of KEYBOARD_SHORTCUTS) {
      expect(rendered).toContainEqual({ display: s.display, description: s.description });
    }
  });

  it("renders mouse gestures as action chips and keys as <kbd>", () => {
    const container = new FakeElement("div");
    renderShortcutHelp(container as unknown as HTMLElement);

    const rows = collect(container, (n) => n.className === "help-shortcut");
    const drag = rows.find((r) => r.children[0].textContent === "Drag");
    const labelKey = rows.find((r) => r.children[0].textContent === "L");
    expect(drag?.children[0].tagName).toBe("span");
    expect(drag?.children[0].className).toBe("help-action");
    expect(labelKey?.children[0].tagName).toBe("kbd");
  });

  it("replaces existing children on re-render (no duplication)", () => {
    const container = new FakeElement("div");
    renderShortcutHelp(container as unknown as HTMLElement);
    const first = container.children.length;
    renderShortcutHelp(container as unknown as HTMLElement);
    expect(container.children.length).toBe(first);
  });
});

function describeShortcut(s: Shortcut): string {
  return isDispatchShortcut(s) ? s.id : `info:${s.display}`;
}

// --- Minimal DOM stand-in (vitest runs under the "node" environment) --------

class FakeElement {
  tagName: string;
  className = "";
  textContent = "";
  children: FakeElement[] = [];
  ownerDocument = {
    createElement: (tag: string) => new FakeElement(tag),
  };

  constructor(tag: string) {
    this.tagName = tag;
  }

  appendChild(child: FakeElement): void {
    this.children.push(child);
  }

  replaceChildren(): void {
    this.children = [];
  }
}

function collect(node: FakeElement, pred: (n: FakeElement) => boolean): FakeElement[] {
  const out: FakeElement[] = [];
  const walk = (n: FakeElement) => {
    if (pred(n)) out.push(n);
    for (const c of n.children) walk(c);
  };
  walk(node);
  return out;
}
