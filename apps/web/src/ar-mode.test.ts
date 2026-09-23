import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createARModeManager } from "./ar-mode";

vi.mock("./deviceOrientation", () => ({
  createDeviceOrientationManager: () => ({
    isSupported: () => true,
    requiresPermission: () => false,
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));

beforeEach(() => vi.stubGlobal("document", { getElementById: () => null }));
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
