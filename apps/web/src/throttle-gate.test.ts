import { describe, it, expect } from "vitest";
import { createThrottleGate } from "./throttle-gate";

describe("createThrottleGate", () => {
  it("runs on the very first call", () => {
    const gate = createThrottleGate(67);
    expect(gate.shouldRun(0)).toBe(true);
  });

  it("skips calls that arrive within the interval", () => {
    const gate = createThrottleGate(67);
    expect(gate.shouldRun(1000)).toBe(true); // first run establishes baseline
    expect(gate.shouldRun(1016)).toBe(false); // +16ms  (a ~60fps frame)
    expect(gate.shouldRun(1033)).toBe(false); // +33ms
    expect(gate.shouldRun(1050)).toBe(false); // +50ms
  });

  it("runs again once the interval has fully elapsed", () => {
    const gate = createThrottleGate(67);
    expect(gate.shouldRun(1000)).toBe(true);
    expect(gate.shouldRun(1050)).toBe(false); // +50ms < 67ms
    expect(gate.shouldRun(1067)).toBe(true); // exactly +67ms
    expect(gate.shouldRun(1100)).toBe(false); // +33ms after the 1067 run
    expect(gate.shouldRun(1134)).toBe(true); // +67ms after the 1067 run
  });

  it("caps throughput to roughly the target rate over a 60fps burst", () => {
    const gate = createThrottleGate(67); // ~15Hz
    let runs = 0;
    // Simulate one second of 60fps ticks (16.67ms apart).
    for (let frame = 0; frame < 60; frame++) {
      if (gate.shouldRun(frame * (1000 / 60))) runs++;
    }
    // The acceptance criterion is <= 15 recomputes/sec. With 60fps quantization
    // against a 67ms window, four frames (66.7ms) just miss the gate, so the
    // effective rate settles around 12/sec — always at or under the 15 cap.
    expect(runs).toBeLessThanOrEqual(15);
    expect(runs).toBeGreaterThanOrEqual(10);
  });

  it("always runs when force is true, even inside the interval", () => {
    const gate = createThrottleGate(67);
    expect(gate.shouldRun(1000)).toBe(true);
    expect(gate.shouldRun(1010)).toBe(false); // throttled
    expect(gate.shouldRun(1010, true)).toBe(true); // forced terminal update
  });

  it("re-bases the interval after a forced run", () => {
    const gate = createThrottleGate(67);
    gate.shouldRun(1000); // baseline at 1000
    expect(gate.shouldRun(1050, true)).toBe(true); // forced run re-bases to 1050
    // Now the next throttled call is measured from 1050, not 1000.
    expect(gate.shouldRun(1100)).toBe(false); // +50ms from 1050
    expect(gate.shouldRun(1117)).toBe(true); // +67ms from 1050
  });

  it("runs immediately again after reset (state resets between transitions)", () => {
    const gate = createThrottleGate(67);
    expect(gate.shouldRun(1000)).toBe(true);
    expect(gate.shouldRun(1010)).toBe(false); // throttled within interval
    gate.reset();
    expect(gate.shouldRun(1011)).toBe(true); // reset clears the baseline
  });
});
