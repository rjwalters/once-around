import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocationManager, formatObservingLocation } from "./location";

const selected = { latitude: 51.5, longitude: -0.1, name: "London" };

afterEach(() => vi.unstubAllGlobals());

describe("observing location acquisition", () => {
  it.each([
    [1, "permission denied"],
    [2, "unavailable"],
    [3, "timed out"],
  ])("preserves and visibly identifies the selected site on GPS failure %i", async (code, message) => {
    vi.stubGlobal("navigator", { geolocation: {
      getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => error({ code } as GeolocationPositionError),
    } });
    const changed = vi.fn();
    const stateChanged = vi.fn();
    const manager = createLocationManager(selected, { onLocationChange: changed, onStateChange: stateChanged });
    expect(await manager.requestGeolocation()).toBeNull();
    expect(changed).not.toHaveBeenCalled();
    expect(manager.getLocation()).toEqual(selected);
    expect(stateChanged.mock.calls[0][0].status).toBe("acquiring");
    expect(manager.getState().status).toBe("error");
    const status = formatObservingLocation(manager.getState());
    expect(status).toContain(message);
    expect(status).toContain("Selected site: London");
  });

  it("reports browsers without GPS instead of claiming a local fix", async () => {
    vi.stubGlobal("navigator", {});
    const manager = createLocationManager(selected, { onLocationChange: vi.fn() });
    await manager.requestGeolocation();
    expect(formatObservingLocation(manager.getState())).toContain("unavailable");
    expect(manager.getState().source).toBe("selected");
  });

  it("shows successful GPS coordinates, accuracy, and time while requesting a fresh fix", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => success({
      coords: { latitude: 37.8, longitude: -122.4, accuracy: 12 }, timestamp: 1234567890000,
    } as GeolocationPosition));
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
    const changed = vi.fn();
    const manager = createLocationManager(selected, { onLocationChange: changed });
    await manager.requestGeolocation();
    expect(changed).toHaveBeenCalledOnce();
    expect(manager.getState()).toMatchObject({ source: "gps", status: "ready", accuracy: 12, timestamp: 1234567890000 });
    expect(formatObservingLocation(manager.getState())).toContain("GPS fix: My Location");
    expect(formatObservingLocation(manager.getState())).toContain("±12 m");
    expect(getCurrentPosition.mock.calls[0]).toEqual([
      expect.any(Function), expect.any(Function), { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    ]);
  });

  it("never lets a delayed GPS response overwrite a newer manual choice", async () => {
    let success!: PositionCallback;
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: (callback: PositionCallback) => { success = callback; } } });
    const manager = createLocationManager(selected, { onLocationChange: vi.fn() });
    const pending = manager.requestGeolocation();
    const manual = { latitude: 40, longitude: -75, name: "Observing site" };
    manager.setLocation(manual);
    success({ coords: { latitude: 1, longitude: 2, accuracy: 5 }, timestamp: Date.now() } as GeolocationPosition);
    expect(await pending).toBeNull();
    expect(manager.getLocation()).toEqual(manual);
    expect(formatObservingLocation(manager.getState())).toContain("Selected site: Observing site");
  });
});
