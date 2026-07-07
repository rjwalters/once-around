import { describe, it, expect } from "vitest";
import {
  createRenderScheduler,
  isAlwaysRenderMode,
  type AlwaysRenderInputs,
} from "./render-scheduler";

/** All-static baseline: clean, geocentric, nothing animating. */
function staticInputs(): AlwaysRenderInputs {
  return {
    viewMode: "geocentric",
    arEnabled: false,
    coronaActive: false,
    fadesInProgress: false,
    controlsAnimating: false,
    tourActive: false,
  };
}

describe("createRenderScheduler", () => {
  it("starts dirty so the first frame renders", () => {
    const s = createRenderScheduler();
    expect(s.peekNeedsRender()).toBe(true);
    expect(s.shouldRender(false)).toBe(true);
  });

  it("clears the dirty flag after a render", () => {
    const s = createRenderScheduler();
    expect(s.shouldRender(false)).toBe(true);
    // Now clean and static: no render.
    expect(s.peekNeedsRender()).toBe(false);
    expect(s.shouldRender(false)).toBe(false);
  });

  it("re-renders once after requestRender(), then stops", () => {
    const s = createRenderScheduler();
    s.shouldRender(false); // consume initial dirty
    expect(s.shouldRender(false)).toBe(false);

    s.requestRender();
    expect(s.peekNeedsRender()).toBe(true);
    expect(s.shouldRender(false)).toBe(true); // renders once
    expect(s.shouldRender(false)).toBe(false); // then clean again
  });

  it("requestRender is idempotent (multiple calls -> single render)", () => {
    const s = createRenderScheduler();
    s.shouldRender(false); // consume initial dirty
    s.requestRender();
    s.requestRender();
    s.requestRender();
    expect(s.shouldRender(false)).toBe(true);
    expect(s.shouldRender(false)).toBe(false);
  });

  it("always-render mode bypasses the flag without keeping it dirty", () => {
    const s = createRenderScheduler();
    s.shouldRender(false); // consume initial dirty -> now clean
    expect(s.peekNeedsRender()).toBe(false);

    // Always-render forces a render even though clean...
    expect(s.shouldRender(true)).toBe(true);
    // ...and does not leave the flag dirty for when the mode ends.
    expect(s.peekNeedsRender()).toBe(false);
    expect(s.shouldRender(false)).toBe(false);
  });
});

describe("isAlwaysRenderMode", () => {
  it("returns false when clean, static, and geocentric", () => {
    expect(isAlwaysRenderMode(staticInputs())).toBe(false);
  });

  it.each([
    ["topocentric viewMode", { viewMode: "topocentric" as const }],
    ["hubble viewMode", { viewMode: "hubble" as const }],
    ["jwst viewMode", { viewMode: "jwst" as const }],
    ["AR enabled", { arEnabled: true }],
    ["corona active", { coronaActive: true }],
    ["fades in progress", { fadesInProgress: true }],
    ["controls animating", { controlsAnimating: true }],
    ["tour active", { tourActive: true }],
  ])("returns true when %s", (_label, override) => {
    expect(isAlwaysRenderMode({ ...staticInputs(), ...override })).toBe(true);
  });

  it("keeps geocentric as a non-always-render mode", () => {
    expect(
      isAlwaysRenderMode({ ...staticInputs(), viewMode: "geocentric" })
    ).toBe(false);
  });
});
