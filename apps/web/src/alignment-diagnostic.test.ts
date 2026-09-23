import { describe, expect, it } from "vitest";
import {
  captureDiagnostic,
  captureProblem,
  exportCaptures,
  gpsProblem,
  pointingErrors,
  signedAngleDifference,
  type CaptureInput,
} from "./alignment-diagnostic";

function input(): CaptureInput {
  return {
    target: "Moon",
    now: new Date("2026-01-01T02:00:00Z"),
    monotonicNow: 2000,
    cameraReady: true,
    gps: {
      latitude: 37,
      longitude: -122,
      accuracy: 10,
      timestamp: Date.parse("2026-01-01T01:59:59Z"),
    },
    orientation: {
      alpha: 0,
      beta: 120,
      gamma: 0,
      headingReference: "absolute",
      compassAccuracy: null,
      receivedAt: 1500,
    },
    expected: { altitude: 30, azimuth: 10 },
    declination: 10,
    screenRotation: 0,
  };
}

describe("diagnostic measurements", () => {
  it.each([
    [1, 359, 2],
    [359, 1, -2],
    [180, 0, -180],
    [0, 180, -180],
    [-1, 1, -2],
  ])(
    "wraps measured %s minus expected %s to %s",
    (measured, expected, difference) => {
      expect(signedAngleDifference(measured, expected)).toBe(difference);
    },
  );
  it("computes signed horizontal/vertical differences and independent great-circle error", () => {
    expect(
      pointingErrors(
        { altitude: 0, azimuth: 1 },
        { altitude: 0, azimuth: 359 },
      ),
    ).toEqual({
      altitude: 0,
      azimuth: 2,
      greatCircle: expect.closeTo(2, 8),
    });
    const errors = pointingErrors(
      { altitude: 45, azimuth: 90 },
      { altitude: 30, azimuth: 0 },
    );
    expect(errors.altitude).toBe(15);
    expect(errors.azimuth).toBe(90);
    expect(errors.greatCircle).toBeCloseTo(69.2951889);
  });
  it("uses magnetic declination once, retains provenance, and keeps the optical axis invariant under screen rotation", () => {
    const portrait = captureDiagnostic(input());
    const landscape = captureDiagnostic({ ...input(), screenRotation: 90 });
    expect(portrait.measured.altitude).toBeCloseTo(30);
    expect(portrait.measured.azimuth).toBe(10);
    expect(portrait.rawMeasured.azimuth).toBe(0);
    expect(portrait.errors.greatCircle).toBeCloseTo(0);
    expect(landscape.measured).toEqual(portrait.measured);
    expect(landscape.screenRotation).toBe(90);
    expect(portrait.orientation.ageMs).toBe(500);
    expect(portrait.gps.ageMs).toBe(1000);
    expect(portrait.orientation.compassAccuracy).toBeNull();
  });
  it("rejects absent, stale, future and inaccurate GPS fixes", () => {
    const base = input();
    const now = base.now.getTime();
    expect(gpsProblem(null, now)).toContain("Waiting");
    for (const changed of [
      { timestamp: now - 30000 },
      { timestamp: now + 1 },
      { accuracy: 101 },
      { latitude: NaN },
      { accuracy: -1 },
    ]) {
      expect(gpsProblem({ ...base.gps!, ...changed }, now)).not.toBeNull();
    }
    expect(
      gpsProblem({ ...base.gps!, timestamp: now - 29999, accuracy: 100 }, now),
    ).toBeNull();
  });
  it("requires fresh accepted orientation at capture time", () => {
    const base = input();
    for (const sample of [
      null,
      { ...base.orientation!, receivedAt: -1000 },
      { ...base.orientation!, receivedAt: 2001 },
      { ...base.orientation!, alpha: NaN },
    ]) {
      const bad = { ...base, orientation: sample };
      expect(captureProblem(bad)).not.toBeNull();
      expect(() => captureDiagnostic(bad)).toThrow();
    }
  });
  it("requires live camera and an above-horizon finite expected position", () => {
    for (const changed of [
      { cameraReady: false },
      { expected: null },
      { expected: { altitude: 0, azimuth: 90 } },
      { expected: { altitude: -1, azimuth: 90 } },
      { declination: NaN },
    ]) {
      expect(() => captureDiagnostic({ ...input(), ...changed })).toThrow();
    }
  });
  it("takes immutable snapshots and exports coordinates only when requested", () => {
    const source = input();
    const capture = captureDiagnostic(source);
    source.gps!.latitude = 0;
    source.orientation!.alpha = 50;
    expect(capture.gps.latitude).toBe(37);
    expect(capture.orientation.alpha).toBe(0);
    const redacted = JSON.parse(exportCaptures([capture], false));
    expect(redacted.captures[0].gps.latitude).toBeUndefined();
    expect(redacted.captures[0].gps.longitude).toBeUndefined();
    expect(redacted.captures[0].gps.accuracy).toBe(10);
    expect(
      JSON.parse(exportCaptures([capture], true)).captures[0].gps.latitude,
    ).toBe(37);
    expect(capture.gps.latitude).toBe(37);
  });
});
