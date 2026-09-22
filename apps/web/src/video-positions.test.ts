import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import videoCatalog from "../public/videos.json";
import { createVideoMarkersLayer, type VideoPlacement } from "./videos";
import { createSearchUI } from "./search-ui";
import { positionToRaDec, raDecToPosition } from "./geometry/coordinates";

const movingSubjects: Record<string, string> = {
  "pk95qpndSVM": "Mars",
  "Uypw6qHt_JA": "Mars",
  "3eoqEq-5x-c": "Mars",
  "yyeWHCWMjwM": "Jupiter",
  "u91Em5m8u6U": "Saturn",
  "pkykYCDRdKk": "Sedna",
};
const fixture: VideoPlacement[] = videoCatalog.filter(
  (video) => video.id in movingSubjects || video.id === "IO-bQQQjHGI"
);
// A second upload about the same body must not overwrite the first association.
fixture.push({ ...fixture.find((v) => v.id === "pkykYCDRdKk")!, id: "another-sedna-video" });
movingSubjects["another-sedna-video"] = "Sedna";

function positions(offset: number): Map<string, THREE.Vector3> {
  return new Map(["Mars", "Jupiter", "Saturn", "Sedna"].map((name, i) =>
    [name, raDecToPosition(30 + offset + i * 45, 10 + i, 49.5)]
  ));
}

beforeEach(() => {
  vi.stubGlobal("document", {
    getElementById: () => null,
    createElement: () => ({ getContext: () => ({ fillText: vi.fn() }) }),
  });
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => fixture })));
});
afterEach(() => vi.unstubAllGlobals());

describe("video positions", () => {
  it("tracks every body video and keeps grouped labels distinct after time changes", async () => {
    const scene = new THREE.Scene();
    let ready!: () => void;
    const populated = new Promise<void>((resolve) => { ready = resolve; });
    const initial = positions(0);
    const layer = createVideoMarkersLayer(scene, () => {}, initial, ready);
    await populated;

    for (const [id, body] of Object.entries(movingSubjects)) {
      expect(layer.markers.get(id)!.position.distanceTo(initial.get(body)!)).toBeLessThan(1e-10);
    }

    for (const offset of [50, 100]) {
      const current = positions(offset);
      layer.updateMovingPositions(current);
      for (const [id, body] of Object.entries(movingSubjects)) {
        const marker = layer.markers.get(id)!;
        expect(marker.position.distanceTo(current.get(body)!)).toBeLessThan(1e-10);
        const raycaster = new THREE.Raycaster();
        vi.spyOn(raycaster, "intersectObjects").mockReturnValue([{ object: marker, distance: 1, point: marker.position.clone() }]);
        const selected = layer.getVideoAtPosition(raycaster)!;
        const expected = positionToRaDec(current.get(body)!);
        expect(selected.id).toBe(id);
        expect(selected.ra).toBeCloseTo(expected.ra, 8);
        expect(selected.dec).toBeCloseTo(expected.dec, 8);
      }
      // Both Mars features, the earlier moons video, and repeated Sedna remain separate.
      for (const ids of [["pk95qpndSVM", "Uypw6qHt_JA", "3eoqEq-5x-c"], ["pkykYCDRdKk", "another-sedna-video"]]) {
        for (let i = 1; i < ids.length; i++) {
          expect(layer.labels.get(ids[0])!.position.distanceTo(layer.labels.get(ids[i])!.position)).toBeGreaterThan(1);
        }
      }
    }

    // A near-Earth asteroid without a runtime model must not get a frozen marker.
    expect(videoCatalog.some((video) => video.id === "Y3xnBHMMkI8")).toBe(false);
  });

  it("searches body features at the current position while fixed videos keep their catalog position", () => {
    let current = positions(0);
    const navigate = vi.fn();
    const ui = createSearchUI({
      getSearchIndex: () => fixture.map((v) => ({ name: v.object, type: "video", ra: v.ra, dec: v.dec })),
      navigateToResult: navigate,
      getPlanetPosition: (body) => {
        const position = current.get(body);
        return position ? positionToRaDec(position) : null;
      },
    });
    for (const offset of [50, 100]) {
      current = positions(offset);
      for (const [id, body] of Object.entries(movingSubjects)) {
        const video = fixture.find((v) => v.id === id)!;
        expect(ui.navigateToObject(video.object)).toBe(true);
        expect(navigate).toHaveBeenLastCalledWith(expect.objectContaining(positionToRaDec(current.get(body)!)));
      }
    }
    const fixed = fixture.find((v) => v.id === "IO-bQQQjHGI")!;
    ui.navigateToObject(fixed.object);
    expect(navigate).toHaveBeenLastCalledWith(expect.objectContaining({ ra: fixed.ra, dec: fixed.dec }));
  });
});
