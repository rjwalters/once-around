import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as THREE from "three";
import { createEclipseHandler, type EclipseHandlerOptions } from "./eclipse-handler";
import type { BodyPositions } from "./body-positions";

/**
 * Regression tests for #143: next-eclipse navigation must route through the
 * shared observation-time update path (main.ts `updateObservationTime`) so the
 * URL `t`, saved timestamp, `currentDate`, rise/set date, topocentric params
 * and overlays all move to the eclipse instant — and the eclipse banner must
 * still be visible afterwards even though the shared path hides it.
 *
 * WASM-free by design: `eclipse-handler.ts` only imports pure-TS modules and
 * types, so this runs in the CI geometry job (node environment, no DOM). A
 * minimal fake `document` provides the banner elements.
 */

interface FakeElement {
  id: string;
  textContent: string;
  innerHTML: string;
  classList: {
    add: (c: string) => void;
    remove: (c: string) => void;
    contains: (c: string) => boolean;
  };
  addEventListener: (type: string, fn: () => void) => void;
  click: () => void;
}

function makeElement(id: string): FakeElement {
  const classes = new Set<string>(["hidden"]);
  const clickListeners: Array<() => void> = [];
  return {
    id,
    textContent: "",
    innerHTML: "",
    classList: {
      add: (c) => void classes.add(c),
      remove: (c) => void classes.delete(c),
      contains: (c) => classes.has(c),
    },
    addEventListener: (type, fn) => {
      if (type === "click") clickListeners.push(fn);
    },
    click: () => clickListeners.forEach((fn) => fn()),
  };
}

const ELEMENT_IDS = [
  "eclipse-banner",
  "eclipse-banner-date",
  "eclipse-banner-path",
  "eclipse-banner-duration",
  "eclipse-banner-sep",
  "eclipse-path-section",
  "eclipse-banner-distance",
  "eclipse-banner-circumstances",
  "eclipse-path-map",
  "eclipse-navigate-btn",
  "eclipse-banner-close",
];

/**
 * Simulated app state mirroring what `updateObservationTime(date, true)`
 * synchronizes in main.ts.
 */
interface AppState {
  datetimeInput: string;
  currentDate: Date;
  urlT: string;
  savedDatetime: string;
  riseSetDate: Date;
  playing: boolean;
  arEnabled: boolean;
}

let elements: Map<string, FakeElement>;

beforeEach(() => {
  elements = new Map(ELEMENT_IDS.map((id) => [id, makeElement(id)]));
  vi.stubGlobal("document", {
    getElementById: (id: string) => elements.get(id) ?? null,
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup(initial: Date) {
  const state: AppState = {
    datetimeInput: "2026-10-16T12:00",
    currentDate: initial,
    urlT: initial.toISOString(),
    savedDatetime: initial.toISOString(),
    riseSetDate: initial,
    playing: true,
    arEnabled: true,
  };

  // Stand-in for main.ts `updateObservationTime(date, true)`, including its
  // banner-hiding side effect.
  const setObservationTime = vi.fn((date: Date) => {
    state.currentDate = date;
    state.riseSetDate = date;
    state.savedDatetime = date.toISOString();
    state.urlT = date.toISOString();
    elements.get("eclipse-banner")!.classList.add("hidden");
  });

  const bodyPos: BodyPositions = new Map([
    ["Sun", new THREE.Vector3(1, 0, 0)],
    ["Moon", new THREE.Vector3(1, 0.001, 0)],
  ]);

  const animateToRaDec = vi.fn();
  const options: EclipseHandlerOptions = {
    getDatetimeInputValue: () => state.datetimeInput,
    setDatetimeInputValue: (v) => {
      state.datetimeInput = v;
    },
    stopTimePlayback: () => {
      state.arEnabled = false;
      state.playing = false;
    },
    setObservationTime,
    getBodyPositions: () => bodyPos,
    positionToRaDec: () => ({ ra: 10, dec: 20 }),
    calculateSunMoonSeparation: () => 0.05,
    animateToRaDec,
    getObserverLocation: () => ({ latitude: 40, longitude: -74 }),
    setObserverLocation: () => {},
  };

  return { state, setObservationTime, animateToRaDec, handler: createEclipseHandler(options) };
}

describe("next-eclipse navigation (#143)", () => {
  it("synchronizes observation state through the shared update path", () => {
    const initial = new Date("2026-10-16T12:00:00Z");
    const { state, setObservationTime, handler } = setup(initial);

    handler();

    const eclipse = new Date("2027-08-02T10:07:50Z");
    expect(setObservationTime).toHaveBeenCalledTimes(1);
    expect(setObservationTime.mock.calls[0][0].getTime()).toBe(eclipse.getTime());
    expect(state.currentDate.getTime()).toBe(eclipse.getTime());
    expect(state.urlT).toBe("2027-08-02T10:07:50.000Z");
    expect(state.savedDatetime).toBe("2027-08-02T10:07:50.000Z");
    expect(state.riseSetDate.getTime()).toBe(eclipse.getTime());
    // Datetime input (local time, minute precision) moved to the eclipse.
    expect(new Date(state.datetimeInput).getTime()).toBe(
      new Date(eclipse.getTime() - 50 * 1000).getTime()
    );
  });

  it("shows the eclipse banner after the shared update hides it", () => {
    const { handler } = setup(new Date("2026-10-16T12:00:00Z"));
    handler();

    const banner = elements.get("eclipse-banner")!;
    expect(banner.classList.contains("hidden")).toBe(false);
    expect(elements.get("eclipse-banner-path")!.textContent).not.toBe("");
    expect(elements.get("eclipse-banner-date")!.textContent).toContain("2027");
  });

  it("stops playback and disables AR, then animates the camera", () => {
    const { state, animateToRaDec, handler } = setup(new Date("2026-10-16T12:00:00Z"));
    handler();

    expect(state.playing).toBe(false);
    expect(state.arEnabled).toBe(false);
    expect(animateToRaDec).toHaveBeenCalledWith(10, 20, 1000);
  });

  it("repeated navigation advances to each following eclipse", () => {
    const { state, setObservationTime, handler } = setup(new Date("2026-10-16T12:00:00Z"));

    handler();
    handler();

    expect(setObservationTime).toHaveBeenCalledTimes(2);
    expect(setObservationTime.mock.calls[1][0].toISOString()).toBe("2028-07-22T02:55:36.000Z");
    expect(state.urlT).toBe("2028-07-22T02:55:36.000Z");
    expect(elements.get("eclipse-banner")!.classList.contains("hidden")).toBe(false);
  });

  it("close button dismisses the banner", () => {
    const { handler } = setup(new Date("2026-10-16T12:00:00Z"));
    handler();

    const banner = elements.get("eclipse-banner")!;
    expect(banner.classList.contains("hidden")).toBe(false);
    elements.get("eclipse-banner-close")!.click();
    expect(banner.classList.contains("hidden")).toBe(true);
  });
});
