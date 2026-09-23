import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import { createDeviceOrientationManager } from "./deviceOrientation";
import {
  createOrientationSensor,
  getScreenOrientationAngle,
  isOrientationSampleFresh,
  normalizeOrientationSample,
  ORIENTATION_MAX_AGE_MS,
  type OrientationReading,
} from "./orientation-sensor";

const absolute: OrientationReading = { alpha: 0, beta: 90, gamma: 0, absolute: true };

describe("north-referenced sample normalization", () => {
  it("accepts absolute readings without inventing an accuracy estimate", () => {
    expect(normalizeOrientationSample(absolute, 10)).toEqual({
      alpha: 0, beta: 90, gamma: 0, receivedAt: 10,
      headingReference: "absolute", compassAccuracy: null,
    });
  });

  it("accepts a valid platform compass even when alpha is relative or missing", () => {
    expect(normalizeOrientationSample({ ...absolute, alpha: null, absolute: false,
      webkitCompassHeading: 90, webkitCompassAccuracy: 4 }, 10)).toMatchObject({
      alpha: 270, headingReference: "webkit-compass", compassAccuracy: 4,
    });
    expect(normalizeOrientationSample({ ...absolute, webkitCompassHeading: 0 }, 10)?.compassAccuracy).toBeNull();
  });

  it.each([false, undefined])("rejects alpha without an absolute reference (%s)", (value) => {
    expect(normalizeOrientationSample({ ...absolute, absolute: value }, 0)).toBeNull();
  });

  it.each(["alpha", "beta", "gamma"] as const)("rejects null and nonfinite %s", (axis) => {
    for (const value of [null, NaN, Infinity, -Infinity]) {
      expect(normalizeOrientationSample({ ...absolute, [axis]: value }, 0)).toBeNull();
    }
  });

  it("rejects out-of-range angles and invalid compass readings even with absolute alpha", () => {
    for (const angles of [{ alpha: -1 }, { alpha: 360 }, { beta: 181 }, { gamma: -91 }]) {
      expect(normalizeOrientationSample({ ...absolute, ...angles }, 0)).toBeNull();
    }
    for (const heading of [-1, 360, Infinity, NaN]) {
      expect(normalizeOrientationSample({ ...absolute, webkitCompassHeading: heading }, 0)).toBeNull();
    }
    for (const accuracy of [-1, 181, Infinity, NaN]) {
      expect(normalizeOrientationSample({ ...absolute, webkitCompassHeading: 0,
        webkitCompassAccuracy: accuracy }, 0)).toBeNull();
    }
  });

  it("rejects stale, future and nonfinite sample ages", () => {
    const sample = normalizeOrientationSample(absolute, 100);
    expect(isOrientationSampleFresh(sample, 100)).toBe(true);
    expect(isOrientationSampleFresh(sample, 100 + ORIENTATION_MAX_AGE_MS - 1)).toBe(true);
    expect(isOrientationSampleFresh(sample, 100 + ORIENTATION_MAX_AGE_MS)).toBe(false);
    expect(isOrientationSampleFresh(sample, 99)).toBe(false);
    expect(isOrientationSampleFresh(sample, Infinity)).toBe(false);
    expect(isOrientationSampleFresh(null, 100)).toBe(false);
    expect(normalizeOrientationSample(absolute, NaN)).toBeNull();
  });
});

function fakeBrowser() {
  const orientation = Object.assign(new EventTarget(), { angle: 0 });
  const browser = Object.assign(new EventTarget(), {
    DeviceOrientationEvent: class extends Event {},
    screen: { orientation },
    orientation: 0,
  });
  vi.stubGlobal("window", browser);
  return browser;
}

function dispatch(browser: EventTarget, reading = absolute, eventName = "deviceorientationabsolute") {
  browser.dispatchEvent(Object.assign(new Event(eventName), reading));
}

beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("sensor lifecycle", () => {
  it("handles a missing window or missing API without throwing", async () => {
    vi.stubGlobal("window", undefined);
    const sensor = createOrientationSensor({ onSample: vi.fn(), onStateChange: vi.fn() });
    expect(sensor.getState().sensorStatus).toBe("unavailable");
    expect(await sensor.requestPermission()).toBe(false);
    sensor.start();
    sensor.stop();
    expect(sensor.getSample()).toBeNull();
    vi.stubGlobal("window", new EventTarget());
    expect(createOrientationSensor({ onSample: vi.fn(), onStateChange: vi.fn() }).isSupported()).toBe(false);
  });

  it("times out a missing/relative-only sensor and recovers on a valid ordinary event", () => {
    const browser = fakeBrowser();
    const onSample = vi.fn();
    const sensor = createOrientationSensor({ onSample, onStateChange: vi.fn() });
    sensor.start();
    expect(sensor.getState().sensorStatus).toBe("pending");
    dispatch(browser, { ...absolute, absolute: false });
    vi.advanceTimersByTime(ORIENTATION_MAX_AGE_MS);
    expect(sensor.getState().sensorStatus).toBe("unavailable");
    expect(sensor.getState().sensorMessage).toContain("No compass direction received");
    expect(onSample).not.toHaveBeenCalled();
    dispatch(browser, absolute, "deviceorientation");
    expect(sensor.getState().sensorStatus).toBe("usable");
    expect(onSample).toHaveBeenCalledTimes(1);
    sensor.stop();
  });

  it("expires the last valid sample despite a stream of relative readings", () => {
    const browser = fakeBrowser();
    const sensor = createOrientationSensor({ onSample: vi.fn(), onStateChange: vi.fn() });
    sensor.start();
    dispatch(browser);
    vi.advanceTimersByTime(ORIENTATION_MAX_AGE_MS - 1);
    dispatch(browser, { ...absolute, absolute: false }, "deviceorientation");
    expect(sensor.getSample()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(sensor.getState()).toMatchObject({ sensorStatus: "stale", headingReference: null, compassAccuracy: null });
    expect(sensor.getSample()).toBeNull();
    sensor.stop();
  });

  it("treats silence after a stationary pose as unverified freshness, not sensor failure", () => {
    const browser = fakeBrowser();
    const sensor = createOrientationSensor({ onSample: vi.fn(), onStateChange: vi.fn() });
    sensor.start();
    dispatch(browser);
    // Browsers need not emit another event until the device moves significantly.
    vi.advanceTimersByTime(ORIENTATION_MAX_AGE_MS);
    expect(sensor.getState()).toMatchObject({ sensorStatus: "stale" });
    expect(sensor.getState().sensorMessage).toContain("Need a recent compass reading");
    expect(sensor.getState().sensorMessage).toContain("Move the phone slightly");
    expect(sensor.getState().sensorMessage).not.toMatch(/stopped|failed|calibrat/i);
    expect(sensor.getSample()).toBeNull();
    dispatch(browser, { ...absolute, alpha: 0.2 });
    expect(sensor.getState()).toMatchObject({ sensorStatus: "usable", sensorMessage: null });
    expect(sensor.getSample()?.alpha).toBe(0.2);
    sensor.stop();
  });

  it("stops both listeners and its timer, and restarts waiting for a new sample", () => {
    const browser = fakeBrowser();
    const onSample = vi.fn();
    const onStateChange = vi.fn();
    const sensor = createOrientationSensor({ onSample, onStateChange });
    sensor.start();
    sensor.start();
    dispatch(browser);
    expect(onSample).toHaveBeenCalledTimes(1);
    sensor.stop();
    const stateCount = onStateChange.mock.calls.length;
    dispatch(browser);
    dispatch(browser, absolute, "deviceorientation");
    vi.advanceTimersByTime(ORIENTATION_MAX_AGE_MS * 2);
    expect(onSample).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledTimes(stateCount);
    expect(vi.getTimerCount()).toBe(0);
    sensor.start();
    expect(sensor.getState().sensorStatus).toBe("pending");
    expect(sensor.getSample()).toBeNull();
    sensor.stop();
  });

  it("does not start after denied or rejected permission, and can retry", async () => {
    const browser = fakeBrowser();
    const requestPermission = vi.fn().mockResolvedValueOnce("denied")
      .mockRejectedValueOnce(new Error("policy denied")).mockResolvedValueOnce("granted");
    Object.assign(browser.DeviceOrientationEvent, { requestPermission });
    const sensor = createOrientationSensor({ onSample: vi.fn(), onStateChange: vi.fn() });
    expect(sensor.requiresPermission()).toBe(true);
    sensor.start();
    expect(sensor.getState().enabled).toBe(false);
    expect(await sensor.requestPermission()).toBe(false);
    expect(await sensor.requestPermission()).toBe(false);
    expect(sensor.getState().sensorStatus).toBe("unavailable");
    expect(await sensor.requestPermission()).toBe(true);
    expect(requestPermission).toHaveBeenLastCalledWith(true);
    sensor.start();
    expect(sensor.getState().sensorStatus).toBe("pending");
    sensor.stop();
  });
});

describe("smoothed screen orientation", () => {
  it("snaps first, restarted and recovered samples to the actual pose", () => {
    const browser = fakeBrowser();
    const manager = createDeviceOrientationManager({ onOrientationChange: vi.fn(), onStateChange: vi.fn() });
    const pointing = () => new Vector3(0, 0, -1).applyQuaternion(manager.getQuaternion()!);
    manager.start();
    expect(manager.getQuaternion()).toBeNull();
    dispatch(browser);
    expect(pointing().distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-12);
    dispatch(browser, { ...absolute, alpha: 180 });
    expect(Math.abs(pointing().x)).toBeGreaterThan(0.1); // subsequent samples are smoothed
    manager.stop();
    manager.start();
    dispatch(browser, { ...absolute, alpha: 180 });
    expect(pointing().distanceTo(new Vector3(0, -1, 0))).toBeLessThan(1e-12);
    vi.advanceTimersByTime(ORIENTATION_MAX_AGE_MS);
    expect(manager.getQuaternion()).toBeNull();
    dispatch(browser);
    expect(pointing().distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-12);
    manager.stop();
  });

  it("applies display rotation immediately and removes screen listeners on stop", () => {
    const browser = fakeBrowser();
    const onOrientationChange = vi.fn();
    const manager = createDeviceOrientationManager({ onOrientationChange, onStateChange: vi.fn() });
    manager.start();
    dispatch(browser);
    browser.screen.orientation.angle = 90;
    browser.screen.orientation.dispatchEvent(new Event("change"));
    const quaternion = manager.getQuaternion()!;
    expect(new Vector3(0, 0, -1).applyQuaternion(quaternion).distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-12);
    expect(new Vector3(0, 1, 0).applyQuaternion(quaternion).distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-12);
    manager.stop();
    const count = onOrientationChange.mock.calls.length;
    browser.screen.orientation.dispatchEvent(new Event("change"));
    browser.dispatchEvent(new Event("orientationchange"));
    expect(onOrientationChange).toHaveBeenCalledTimes(count);
  });

  it("uses legacy screen rotation when the modern API is missing or invalid", () => {
    vi.stubGlobal("window", { orientation: -90 });
    expect(getScreenOrientationAngle()).toBe(270);
    vi.stubGlobal("window", { orientation: 180, screen: { orientation: { angle: NaN } } });
    expect(getScreenOrientationAngle()).toBe(180);
    vi.stubGlobal("window", {});
    expect(getScreenOrientationAngle()).toBe(0);
  });
});
