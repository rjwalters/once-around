import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createARModeManager } from "./ar-mode";
import type { OrientationStatus } from "./orientation-sensor";

type SensorStatus = { sensorStatus: OrientationStatus; sensorMessage: string | null };
const sensor = vi.hoisted(() => ({
  supported: true,
  permissionRequired: false,
  permissionGranted: true,
  state: { sensorStatus: "idle", sensorMessage: null } as SensorStatus,
  onStateChange: (_state: SensorStatus) => {},
}));

function emitSensorState(sensorStatus: OrientationStatus, sensorMessage: string | null): void {
  sensor.state = { sensorStatus, sensorMessage };
  sensor.onStateChange(sensor.state);
}

vi.mock("./deviceOrientation", () => ({
  createDeviceOrientationManager: (callbacks: { onStateChange: (state: SensorStatus) => void }) => {
    sensor.onStateChange = callbacks.onStateChange;
    return {
      isSupported: () => sensor.supported,
      requiresPermission: () => sensor.permissionRequired,
      requestPermission: async () => {
        if (!sensor.permissionGranted) emitSensorState("unavailable", "Motion permission was denied.");
        return sensor.permissionGranted;
      },
      getState: () => sensor.state,
      start: () => emitSensorState("pending", "Waiting for a compass direction."),
      stop: () => emitSensorState("idle", null),
    };
  },
}));

beforeEach(() => {
  sensor.supported = true;
  sensor.permissionRequired = false;
  sensor.permissionGranted = true;
  sensor.state = { sensorStatus: "idle", sensorMessage: null };
  vi.stubGlobal("document", { getElementById: () => null });
});
afterEach(() => vi.unstubAllGlobals());

it("stops conflicting activity before enabling live observation and notifies exit once", async () => {
  const events: string[] = [];
  const manager = createARModeManager({
    onOrientationChange: vi.fn(),
    onBeforeEnable: () => events.push("stop simulation"),
    setControlsEnabled: (enabled) => events.push(`controls ${enabled}`),
    onModeChange: (enabled) => events.push(`live ${enabled}`),
  });
  await manager.toggle();
  expect(events).toEqual(["stop simulation", "controls false", "live true"]);
  expect(manager.isEnabled()).toBe(true);
  manager.disable();
  manager.disable();
  expect(events.slice(3)).toEqual(["controls true", "live false"]);
  expect(manager.isEnabled()).toBe(false);
});

function createVisibleManager() {
  const status = { textContent: "", classList: { toggle: vi.fn() } };
  vi.stubGlobal("document", { getElementById: (id: string) => id === "ar-mode-status" ? status : null });
  const manager = createARModeManager({
    onOrientationChange: vi.fn(), setControlsEnabled: vi.fn(), onModeChange: vi.fn(),
  });
  return { manager, status };
}

it("retains pending sensor state through toggle and later GPS/time updates", async () => {
  const { manager, status } = createVisibleManager();
  await manager.toggle();
  expect(status.textContent).toContain("Waiting for a compass direction");
  manager.setStatusMessage("Live time · GPS current");
  expect(status.textContent).toContain("Waiting for a compass direction");
  expect(status.textContent).toContain("Live time · GPS current");
  emitSensorState("usable", null);
  expect(status.textContent).toBe("Live time · GPS current");
  manager.disable();
  expect(status.textContent).toBe("");
});

it.each(["stale", "unavailable"] as const)("keeps %s sensor warnings while observation status changes", async (state) => {
  const { manager, status } = createVisibleManager();
  await manager.toggle();
  emitSensorState(state, "Move the phone slightly to refresh.");
  manager.setStatusMessage("GPS updated");
  expect(status.textContent).toBe("Move the phone slightly to refresh. GPS updated");
  manager.setStatusMessage("Waiting for GPS");
  expect(status.textContent).toBe("Move the phone slightly to refresh. Waiting for GPS");
  emitSensorState("usable", null);
  expect(status.textContent).toBe("Waiting for GPS");
  manager.disable();
});

it("retains permission denial until retry and then shows pending state", async () => {
  sensor.permissionRequired = true;
  sensor.permissionGranted = false;
  const { manager, status } = createVisibleManager();
  await manager.toggle();
  expect(manager.isEnabled()).toBe(false);
  expect(status.textContent).toBe("Motion permission was denied.");
  manager.setStatusMessage("GPS updated");
  expect(status.textContent).toBe("Motion permission was denied.");
  sensor.permissionGranted = true;
  await manager.toggle();
  expect(manager.isEnabled()).toBe(true);
  expect(status.textContent).toContain("Waiting for a compass direction");
  expect(status.textContent).not.toContain("denied");
  manager.disable();
});
