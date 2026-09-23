import { afterEach, expect, it, vi } from "vitest";
import { PerspectiveCamera, Quaternion, Vector3 } from "three";
import { createCelestialControls } from "./index";

vi.mock("./debug", () => ({ updateDebug: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

it("preserves AR roll through time/location updates and releases it for manual controls", () => {
  vi.stubGlobal("window", new EventTarget());
  const element = Object.assign(new EventTarget(), { style: { cursor: "" } }) as unknown as HTMLElement;
  const camera = new PerspectiveCamera();
  const controls = createCelestialControls(camera, element);
  controls.setEnabled(false);
  controls.setTopocentricParams(0, 0);
  // North-facing with a quarter-turn roll: back points north, display up points east.
  controls.setARQuaternion(new Quaternion(0.5, 0.5, -0.5, 0.5));
  const initial = camera.quaternion.clone();
  controls.setTopocentricParams(0, 0);
  expect(camera.quaternion.angleTo(initial)).toBeLessThan(1e-7);
  expect(camera.getWorldDirection(new Vector3()).distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-12);
  expect(camera.up.distanceTo(new Vector3(0, 0, 1))).toBeLessThan(1e-12);

  // Six sidereal hours later, east rotates from world +Z to +X.
  controls.setTopocentricParams(0, Math.PI / 2);
  expect(camera.getWorldDirection(new Vector3()).distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-12);
  expect(camera.up.distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-12);
  controls.setTopocentricParams(Math.PI / 4, Math.PI / 2);
  expect(camera.getWorldDirection(new Vector3()).distanceTo(new Vector3(0, Math.SQRT1_2, -Math.SQRT1_2))).toBeLessThan(1e-12);
  expect(camera.up.distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-12);

  controls.setEnabled(true);
  controls.setTopocentricParams(0, 0);
  expect(camera.up.distanceTo(new Vector3(-1, 0, 0))).toBeLessThan(1e-12);
  controls.dispose();
});
