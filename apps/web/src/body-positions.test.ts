import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  getBodyPositionInto,
  getBodyPositions,
  BODY_NAMES,
  MINOR_BODY_NAMES,
  COMET_NAMES,
  SKY_RADIUS,
  type BodyPositionBuffers,
} from "./body-positions";

const RADIUS = SKY_RADIUS - 0.5;

/**
 * Build synthetic buffers where each body's rust coordinates are a distinct
 * direction so the coordinate transform and index mapping can be verified.
 * Major bodies use stride 3; minor bodies and comets use stride 4.
 */
function makeBuffers(): BodyPositionBuffers {
  const bodies = new Float32Array(BODY_NAMES.length * 3);
  const minorBodies = new Float32Array(MINOR_BODY_NAMES.length * 4);
  const comets = new Float32Array(COMET_NAMES.length * 4);

  // Major body 0 (Sun): rust +X  -> Three.js (-1, 0, 0)
  bodies[0] = 1;
  bodies[1] = 0;
  bodies[2] = 0;
  // Major body 1 (Moon): rust +Y  -> Three.js (0, 0, 1)
  bodies[3] = 0;
  bodies[4] = 1;
  bodies[5] = 0;
  // Major body 2 (Mercury): rust +Z -> Three.js (0, 1, 0)
  bodies[6] = 0;
  bodies[7] = 0;
  bodies[8] = 1;

  // First minor body: rust +X, plus a 4th angular-diameter slot that must be ignored.
  minorBodies[0] = 1;
  minorBodies[1] = 0;
  minorBodies[2] = 0;
  minorBodies[3] = 999; // angular diameter, ignored

  // First comet: rust +Y, plus a 4th magnitude slot that must be ignored.
  comets[0] = 0;
  comets[1] = 1;
  comets[2] = 0;
  comets[3] = 999; // magnitude, ignored

  return { bodies, minorBodies, comets };
}

describe("getBodyPositionInto", () => {
  it("applies the rust -> Three.js transform and scales to the sky radius (Sun)", () => {
    const out = new THREE.Vector3(123, 456, 789); // pre-filled to prove it is overwritten
    getBodyPositionInto(makeBuffers(), 0, out);
    expect(out.x).toBeCloseTo(-RADIUS, 5);
    expect(out.y).toBeCloseTo(0, 5);
    expect(out.z).toBeCloseTo(0, 5);
    expect(out.length()).toBeCloseTo(RADIUS, 5);
  });

  it("swaps Y/Z for Y-up (Moon: rust +Y -> Three.js +Z)", () => {
    const out = new THREE.Vector3();
    getBodyPositionInto(makeBuffers(), 1, out);
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(0, 5);
    expect(out.z).toBeCloseTo(RADIUS, 5);
  });

  it("maps rust +Z to Three.js +Y (Mercury)", () => {
    const out = new THREE.Vector3();
    getBodyPositionInto(makeBuffers(), 2, out);
    expect(out.y).toBeCloseTo(RADIUS, 5);
  });

  it("reads minor bodies with stride 4 (index offset past major bodies)", () => {
    const out = new THREE.Vector3();
    // First minor body is at global index BODY_NAMES.length; rust +X -> -X.
    getBodyPositionInto(makeBuffers(), BODY_NAMES.length, out);
    expect(out.x).toBeCloseTo(-RADIUS, 5);
    expect(out.y).toBeCloseTo(0, 5);
    expect(out.z).toBeCloseTo(0, 5);
  });

  it("reads comets with stride 4 (index offset past major + minor bodies)", () => {
    const out = new THREE.Vector3();
    const cometStart = BODY_NAMES.length + MINOR_BODY_NAMES.length;
    // First comet: rust +Y -> +Z.
    getBodyPositionInto(makeBuffers(), cometStart, out);
    expect(out.z).toBeCloseTo(RADIUS, 5);
  });

  it("produces identical results to getBodyPositions for every named body", () => {
    const buffers = makeBuffers();
    const map = getBodyPositions(buffers);
    const out = new THREE.Vector3();
    const allNames = [...BODY_NAMES, ...MINOR_BODY_NAMES, ...COMET_NAMES];
    allNames.forEach((name, index) => {
      getBodyPositionInto(buffers, index, out);
      const fromMap = map.get(name)!;
      expect(out.x).toBeCloseTo(fromMap.x, 6);
      expect(out.y).toBeCloseTo(fromMap.y, 6);
      expect(out.z).toBeCloseTo(fromMap.z, 6);
    });
  });
});
