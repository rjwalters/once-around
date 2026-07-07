/**
 * Unit tests for device-orientation geometry.
 *
 * `deviceOrientationToAltAz` is validated against an INDEPENDENTLY constructed
 * ZXY rotation-matrix reference: the module derives a hand-simplified closed
 * form for the back-of-phone direction, while this test composes the three
 * elementary rotation matrices R = Rz(alpha)*Rx(beta)*Ry(gamma) explicitly and
 * applies them to (0,0,-1). Agreement across a full alpha/beta/gamma sweep
 * (to < 1e-9°) confirms the closed form is correct.
 *
 * `deviceOrientationToQuaternion` (added in PR #25) is cross-checked for
 * consistency: applying the quaternion to (0,0,-1) must reproduce the same
 * alt/az as `deviceOrientationToAltAz`.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  compassHeadingToAlpha,
  deviceOrientationToAltAz,
  deviceOrientationToQuaternion,
} from "../device-orientation";

type Vec3 = [number, number, number];
type Mat3 = [Vec3, Vec3, Vec3];

const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

function matMul(a: Mat3, b: Mat3): Mat3 {
  const out: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += a[i][k] * b[k][j];
      out[i][j] = s;
    }
  }
  return out;
}

function matVec(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

function rotZ(a: number): Mat3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
}

function rotX(a: number): Mat3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [1, 0, 0],
    [0, c, -s],
    [0, s, c],
  ];
}

function rotY(a: number): Mat3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c],
  ];
}

/**
 * Independent reference: rotate the back-of-phone vector (0,0,-1) from the
 * device frame into the ENU (east, north, up) frame via the intrinsic ZXY
 * rotation, then read off altitude/azimuth. This deliberately does NOT reuse
 * the module's simplified trigonometric expressions.
 */
function referenceAltAz(
  alphaDeg: number,
  betaDeg: number,
  gammaDeg: number
): { altitude: number; azimuth: number } {
  const R = matMul(
    matMul(rotZ(rad(alphaDeg)), rotX(rad(betaDeg))),
    rotY(rad(gammaDeg))
  );
  const [east, north, up] = matVec(R, [0, 0, -1]);
  const altitude = deg(Math.asin(Math.max(-1, Math.min(1, up))));
  let azimuth = deg(Math.atan2(east, north));
  azimuth = ((azimuth % 360) + 360) % 360;
  return { altitude, azimuth };
}

/** Smallest absolute difference between two azimuths, accounting for wrap. */
function azDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

describe("deviceOrientationToAltAz – full sweep vs ZXY rotation-matrix reference", () => {
  it("matches the independent matrix reference to < 1e-9° across the sweep", () => {
    let maxAltErr = 0;
    let maxAzErr = 0;
    let samples = 0;
    for (let alpha = 0; alpha < 360; alpha += 30) {
      for (let beta = -170; beta <= 170; beta += 20) {
        for (let gamma = -80; gamma <= 80; gamma += 20) {
          const got = deviceOrientationToAltAz(alpha, beta, gamma);
          const ref = referenceAltAz(alpha, beta, gamma);
          maxAltErr = Math.max(maxAltErr, Math.abs(got.altitude - ref.altitude));
          // Azimuth is undefined at the zenith/nadir; ignore az error when the
          // pointing direction is within 1e-6° of straight up/down.
          if (Math.abs(ref.altitude) < 90 - 1e-6) {
            maxAzErr = Math.max(maxAzErr, azDiff(got.azimuth, ref.azimuth));
          }
          samples++;
        }
      }
    }
    expect(samples).toBeGreaterThan(1000);
    expect(maxAltErr).toBeLessThan(1e-9);
    expect(maxAzErr).toBeLessThan(1e-9);
  });
});

describe("deviceOrientationToQuaternion – consistency with deviceOrientationToAltAz", () => {
  it("quaternion applied to (0,0,-1) reproduces the alt/az to < 1e-9°", () => {
    let maxAltErr = 0;
    let maxAzErr = 0;
    for (let alpha = 0; alpha < 360; alpha += 45) {
      for (let beta = -160; beta <= 160; beta += 40) {
        for (let gamma = -80; gamma <= 80; gamma += 40) {
          const q = deviceOrientationToQuaternion(alpha, beta, gamma);
          const back = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
          // ENU: x = east, y = north, z = up
          const altitude = deg(
            Math.asin(Math.max(-1, Math.min(1, back.z)))
          );
          let azimuth = deg(Math.atan2(back.x, back.y));
          azimuth = ((azimuth % 360) + 360) % 360;

          const ref = deviceOrientationToAltAz(alpha, beta, gamma);
          maxAltErr = Math.max(maxAltErr, Math.abs(altitude - ref.altitude));
          if (Math.abs(ref.altitude) < 90 - 1e-6) {
            maxAzErr = Math.max(maxAzErr, azDiff(azimuth, ref.azimuth));
          }
        }
      }
    }
    expect(maxAltErr).toBeLessThan(1e-9);
    expect(maxAzErr).toBeLessThan(1e-9);
  });
});

describe("deviceOrientationToAltAz – named poses", () => {
  it("portrait, phone-top up, facing north -> azimuth 0, altitude 0", () => {
    // beta = 90: screen faces the user, back of phone points to the horizon.
    // alpha = 0: that horizontal direction is north.
    const { altitude, azimuth } = deviceOrientationToAltAz(0, 90, 0);
    expect(altitude).toBeCloseTo(0, 9);
    expect(azimuth).toBeCloseTo(0, 9);
  });

  it("flat on table, screen up -> altitude -90 (back points at the ground)", () => {
    const { altitude } = deviceOrientationToAltAz(0, 0, 0);
    expect(altitude).toBeCloseTo(-90, 9);
  });

  it("landscape rolled +90 -> back points west (azimuth 270), horizon", () => {
    const { altitude, azimuth } = deviceOrientationToAltAz(0, 0, 90);
    expect(altitude).toBeCloseTo(0, 9);
    expect(azimuth).toBeCloseTo(270, 9);
  });

  it("landscape rolled -90 -> back points east (azimuth 90), horizon", () => {
    const { altitude, azimuth } = deviceOrientationToAltAz(0, 0, -90);
    expect(altitude).toBeCloseTo(0, 9);
    expect(azimuth).toBeCloseTo(90, 9);
  });
});

describe("compassHeadingToAlpha – edge cases", () => {
  it("returns null for missing / invalid / negative headings", () => {
    expect(compassHeadingToAlpha(undefined)).toBeNull();
    expect(compassHeadingToAlpha(Number.NaN)).toBeNull();
    expect(compassHeadingToAlpha(-1)).toBeNull();
  });

  it("maps valid headings via (360 - heading) % 360", () => {
    expect(compassHeadingToAlpha(0)).toBe(0);
    expect(compassHeadingToAlpha(180)).toBe(180);
    expect(compassHeadingToAlpha(359.9)).toBeCloseTo(0.1, 9);
  });
});
