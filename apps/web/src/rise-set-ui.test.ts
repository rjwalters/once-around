import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// `rise-set-ui.ts` imports `SkyEngine` type-only and otherwise depends only on
// the WASM-free `rise-set.ts`, so this test never loads WASM (CI geometry job).
import { RiseSetUI } from "./rise-set-ui";
import type { SkyEngine } from "./wasm/sky_engine";

/**
 * Regression tests for #144: changing the observer location while the panel is
 * hidden must invalidate the cached rise/set results so the next show
 * recomputes for the current observer, while an unchanged date/location keeps
 * the cheap cached path.
 */

/** Minimal container stand-in: enough surface for RiseSetUI.render(). */
function fakeContainer() {
  return {
    style: { display: "" },
    innerHTML: "",
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

/**
 * Stub engine whose answers depend on a mutable "observer" (as the real engine's
 * do via set_observer_location). Every call records the observer it saw, so a
 * test can assert which observer the displayed data was computed for.
 */
function stubEngine() {
  const state = { observer: "A", seen: [] as string[] };
  const engine = {
    find_body_events: () => {
      state.seen.push(state.observer);
      return [];
    },
    body_altitude_at: () => {
      state.seen.push(state.observer);
      return -10;
    },
  };
  return { engine: engine as unknown as SkyEngine, state };
}

describe("RiseSetUI observer invalidation (#144)", () => {
  let recompute: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    const container = fakeContainer();
    vi.stubGlobal("document", { getElementById: () => container });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recompute = vi.spyOn(RiseSetUI.prototype as any, "recompute");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function setup() {
    const ui = new RiseSetUI({ containerId: "rise-set-panel" });
    const { engine, state } = stubEngine();
    ui.setEngine(engine);
    ui.setDate(new Date("2026-10-16T20:00:00Z"));
    return { ui, state };
  }

  it("recomputes once, for the latest observer, after hidden location changes", () => {
    const { ui, state } = setup();

    ui.setVisible(true);
    expect(recompute).toHaveBeenCalledTimes(1);
    expect(new Set(state.seen)).toEqual(new Set(["A"]));

    ui.setVisible(false);
    // Several location changes while hidden: none should compute eagerly.
    for (const obs of ["B", "C", "D"]) {
      state.observer = obs;
      ui.refresh();
    }
    expect(recompute).toHaveBeenCalledTimes(1);

    state.seen.length = 0;
    ui.setVisible(true);
    // Exactly one recompute on show, using only the latest observer.
    expect(recompute).toHaveBeenCalledTimes(2);
    expect(state.seen.length).toBeGreaterThan(0);
    expect(new Set(state.seen)).toEqual(new Set(["D"]));
  });

  it("keeps the cached path when neither date nor location changed", () => {
    const { ui, state } = setup();

    ui.setVisible(true);
    expect(recompute).toHaveBeenCalledTimes(1);

    ui.setVisible(false);
    state.seen.length = 0;
    ui.setVisible(true);
    expect(recompute).toHaveBeenCalledTimes(1);
    expect(state.seen).toEqual([]);
  });

  it("still recomputes immediately on location change while visible", () => {
    const { ui, state } = setup();

    ui.setVisible(true);
    state.observer = "B";
    state.seen.length = 0;
    ui.refresh();
    expect(recompute).toHaveBeenCalledTimes(2);
    expect(new Set(state.seen)).toEqual(new Set(["B"]));
  });

  it("invalidates a refresh that arrives before the engine is attached", () => {
    const ui = new RiseSetUI({ containerId: "rise-set-panel" });
    ui.setDate(new Date("2026-10-16T20:00:00Z"));
    ui.refresh(); // no engine yet: must not throw or compute
    expect(recompute).not.toHaveBeenCalled();

    const { engine } = stubEngine();
    ui.setEngine(engine);
    ui.setVisible(true);
    expect(recompute).toHaveBeenCalledTimes(1);
  });
});
