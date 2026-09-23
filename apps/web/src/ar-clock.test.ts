import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AR_CLOCK_INTERVAL_MS, createARClock } from "./ar-clock";
import { createTimeControls, formatDatetimeLocal } from "./time-controls";
import { parseDatetimeLocal } from "./ui";

class FakeDocument extends EventTarget {
  hidden = false;
  getElementById() { return null; }
}

class FakeInput extends EventTarget {
  value = "2000-01-01T00:00";
}

let documentStub: FakeDocument;
let windowStub: EventTarget;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-23T01:02:34.567Z"));
  documentStub = new FakeDocument();
  windowStub = new EventTarget();
  vi.stubGlobal("document", documentStub);
  vi.stubGlobal("window", windowStub);
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("AR wall clock", () => {
  it("replaces a stale simulation date immediately, retaining seconds and milliseconds", () => {
    let displayed = new Date("2000-01-01T00:00:00Z");
    const clock = createARClock((date) => { displayed = date; });
    clock.start();
    expect(displayed.toISOString()).toBe("2026-09-23T01:02:34.567Z");
    vi.advanceTimersByTime(AR_CLOCK_INTERVAL_MS * 2);
    expect(displayed.getTime()).toBe(Date.now());
    clock.stop();
  });

  it("suspends hidden work, catches up on resume, and cleans up on exit", () => {
    const tick = vi.fn();
    const clock = createARClock(tick);
    clock.start();
    clock.start();
    expect(vi.getTimerCount()).toBe(1);
    documentStub.hidden = true;
    documentStub.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(600000);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    documentStub.hidden = false;
    documentStub.dispatchEvent(new Event("visibilitychange"));
    expect(tick).toHaveBeenLastCalledWith(new Date());
    expect(vi.getTimerCount()).toBe(1);
    clock.stop();
    documentStub.dispatchEvent(new Event("visibilitychange"));
    windowStub.dispatchEvent(new Event("pageshow"));
    vi.advanceTimersByTime(600000);
    expect(tick).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    expect(clock.isActive()).toBe(false);
  });

  it("handles page-cache suspension and repeated resumes without duplicate timers", () => {
    const tick = vi.fn();
    const clock = createARClock(tick);
    clock.start();
    windowStub.dispatchEvent(new Event("pagehide"));
    vi.advanceTimersByTime(600000);
    expect(tick).toHaveBeenCalledTimes(1);
    windowStub.dispatchEvent(new Event("pageshow"));
    windowStub.dispatchEvent(new Event("pageshow"));
    expect(tick).toHaveBeenLastCalledWith(new Date());
    expect(vi.getTimerCount()).toBe(1);
    clock.stop();
  });
});

describe("live observation and time controls", () => {
  it("stops simulated playback on entry and permits it again after leaving live observation", () => {
    const input = new FakeInput();
    const clock = createARClock((date) => { input.value = formatDatetimeLocal(date); });
    const controls = createTimeControls({
      datetimeInput: input as unknown as HTMLInputElement,
      onBeforeTimeChange: clock.stop,
    });
    controls.startPlayback();
    expect(controls.isPlaying()).toBe(true);
    // AR's pre-enable callback stops playback before starting the live clock.
    controls.stopPlayback();
    clock.start();
    vi.advanceTimersByTime(5000);
    expect(parseDatetimeLocal(input.value)?.getTime()).toBe(Math.floor(Date.now() / 1000) * 1000);
    controls.startPlayback();
    expect(clock.isActive()).toBe(false);
    vi.advanceTimersByTime(400);
    expect(parseDatetimeLocal(input.value)?.getTime()).toBe(new Date("2026-09-23T03:02:39Z").getTime());
    controls.stopPlayback();
  });

  it.each(["step", "now", "focus"])("leaves live observation before %s and stops updating the input", (action) => {
    const input = new FakeInput();
    const tick = vi.fn((date: Date) => { input.value = formatDatetimeLocal(date); });
    const clock = createARClock(tick);
    const controls = createTimeControls({
      datetimeInput: input as unknown as HTMLInputElement,
      onBeforeTimeChange: clock.stop,
    });
    controls.setupEventListeners();
    clock.start();
    if (action === "step") controls.stepTime(1);
    else if (action === "now") controls.jumpToNow();
    else input.dispatchEvent(new Event("focus"));
    expect(clock.isActive()).toBe(false);
    const manualTime = input.value;
    vi.advanceTimersByTime(600000);
    expect(input.value).toBe(manualTime);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("Now retains seconds outside AR", () => {
    const input = new FakeInput();
    createTimeControls({ datetimeInput: input as unknown as HTMLInputElement }).jumpToNow();
    expect(parseDatetimeLocal(input.value)?.getUTCSeconds()).toBe(34);
  });
});
