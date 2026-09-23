import { describe, expect, it } from "vitest";
import {
  canonicalJSON,
  isAlignmentReport,
} from "../../web/src/alignment-report-schema";
import fixture from "./report.json";
const report = () => structuredClone(fixture);
function change(path: string, value: unknown) {
  const data = report();
  const parts = path.split(".");
  let target: any = data;
  for (const part of parts.slice(0, -1)) target = target[part];
  target[parts.at(-1)!] = value;
  return data;
}

describe("complete report schema", () => {
  it("accepts current measurements, both targets/references, coordinate opt-in and ten captures", () => {
    expect(isAlignmentReport(report())).toBe(true);
    const data = report();
    data.coordinatesIncluded = true;
    Object.assign(data.captures[0].gps, { latitude: -90, longitude: 180 });
    data.captures[0].target = "Sun";
    data.captures[0].orientation.headingReference = "webkit-compass";
    Object.assign(data.captures[0].orientation, { compassAccuracy: 180 });
    data.captures = Array.from({ length: 10 }, () =>
      structuredClone(data.captures[0]),
    );
    expect(isAlignmentReport(data)).toBe(true);
  });
  it("requires every field and rejects extra fields at every object depth", () => {
    function visit(value: any, path: string[] = []) {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach((v, i) => visit(v, [...path, String(i)]));
        return;
      }
      const target = (data: any) => path.reduce((v, key) => v[key], data);
      const extra = report();
      target(extra).image = "not permitted";
      expect(isAlignmentReport(extra), path.join(".")).toBe(false);
      for (const key of Object.keys(value)) {
        const missing = report();
        delete target(missing)[key];
        expect(isAlignmentReport(missing), [...path, key].join(".")).toBe(
          false,
        );
        visit(value[key], [...path, key]);
      }
    }
    visit(report());
  });
  it.each([
    ["schema", "v2"],
    ["angleUnit", "radians"],
    ["errorConvention", "reversed"],
    ["coordinatesIncluded", "true"],
    ["device.phone", ""],
    ["device.phone", "x".repeat(81)],
    ["device.browser", "UA\nheader"],
    ["device.browser", 7],
    ["build.commit", "bad"],
    ["build.time", "2026-02-30T00:00:00.000Z"],
    ["captures", []],
    ["captures", Array(11).fill(fixture.captures[0])],
    ["captures.0.target", "Venus"],
    ["captures.0.utc", "yesterday"],
    ["captures.0.expected.altitude", 0],
    ["captures.0.measured.altitude", 91],
    ["captures.0.rawMeasured.altitude", -91],
    ["captures.0.expected.azimuth", 360],
    ["captures.0.measured.azimuth", -1],
    ["captures.0.rawMeasured.azimuth", Infinity],
    ["captures.0.errors.altitude", -181],
    ["captures.0.errors.azimuth", 180],
    ["captures.0.errors.greatCircle", 181],
    ["captures.0.gps.accuracy", 101],
    ["captures.0.gps.accuracy", -1],
    ["captures.0.gps.timestamp", -1],
    ["captures.0.gps.ageMs", 30000],
    ["captures.0.orientation.alpha", 360],
    ["captures.0.orientation.beta", 181],
    ["captures.0.orientation.gamma", -91],
    ["captures.0.orientation.receivedAt", -1],
    ["captures.0.orientation.headingReference", "relative"],
    ["captures.0.orientation.compassAccuracy", -1],
    ["captures.0.orientation.compassAccuracy", 181],
    ["captures.0.orientation.ageMs", 3000],
    ["captures.0.screenRotation", 360],
    ["captures.0.magneticDeclination", NaN],
    ["captures.0.magneticDeclination", 181],
  ])("rejects invalid %s", (path, value) =>
    expect(isAlignmentReport(change(path, value))).toBe(false),
  );
  it("forbids either coordinate without consent and requires both bounded coordinates with consent", () => {
    for (const coordinate of ["latitude", "longitude"]) {
      expect(isAlignmentReport(change(`captures.0.gps.${coordinate}`, 1))).toBe(
        false,
      );
    }
    const data = report();
    data.coordinatesIncluded = true;
    expect(isAlignmentReport(data)).toBe(false);
    Object.assign(data.captures[0].gps, { latitude: 90, longitude: -180 });
    expect(isAlignmentReport(data)).toBe(true);
    Object.assign(data.captures[0].gps, { latitude: 91 });
    expect(isAlignmentReport(data)).toBe(false);
    Object.assign(data.captures[0].gps, { latitude: 0, longitude: 181 });
    expect(isAlignmentReport(data)).toBe(false);
  });
  it("rejects nonobjects and canonicalizes recursively for stable fingerprints", () => {
    for (const value of [null, [], true, 1, "report"])
      expect(isAlignmentReport(value)).toBe(false);
    expect(canonicalJSON({ b: [2, { z: true, a: 1 }], a: 0 })).toBe(
      '{"a":0,"b":[2,{"a":1,"z":true}]}',
    );
  });
});
