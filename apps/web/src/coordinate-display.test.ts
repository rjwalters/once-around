import { describe, it, expect } from "vitest";
import { throttleRemainingMs } from "./coordinate-display";

const INTERVAL = 100;

describe("throttleRemainingMs", () => {
  it("returns 0 when the full interval has elapsed", () => {
    expect(throttleRemainingMs(1000, 900, INTERVAL)).toBe(0);
  });

  it("returns 0 when more than the interval has elapsed", () => {
    expect(throttleRemainingMs(1000, 800, INTERVAL)).toBe(0);
  });

  it("returns 0 exactly at the interval boundary", () => {
    expect(throttleRemainingMs(1000, 900, INTERVAL)).toBe(0);
  });

  it("returns the remaining time when called mid-interval", () => {
    // 40 ms elapsed since last update -> 60 ms remaining before the next.
    expect(throttleRemainingMs(1040, 1000, INTERVAL)).toBe(60);
  });

  it("returns the full interval when called immediately after an update", () => {
    expect(throttleRemainingMs(1000, 1000, INTERVAL)).toBe(100);
  });

  it("caps the effective update rate at the interval (trailing invocation)", () => {
    // Simulate a rapid burst of camera-change events during a drag: 300 events
    // over 500 ms. A correct trailing throttle should only fire updates spaced
    // at least INTERVAL apart, never at the ~16 ms rAF cadence.
    let lastUpdateTime = 0;
    let updates = 0;
    for (let t = 0; t <= 500; t += 5) {
      const remaining = throttleRemainingMs(t, lastUpdateTime, INTERVAL);
      if (remaining === 0) {
        updates++;
        lastUpdateTime = t;
      }
    }
    // 500 ms at 10 Hz => at most ~6 immediate updates (t=0,100,200,300,400,500).
    expect(updates).toBeLessThanOrEqual(6);
    expect(updates).toBeGreaterThanOrEqual(5);
  });
});
