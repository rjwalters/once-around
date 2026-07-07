import { describe, it, expect, vi } from "vitest";
import { createTourEngine, type TourCallbacks, type TourDefinition } from "./tour";

/**
 * Regression tests for the FGS guide-star lock / tour interaction.
 *
 * A tour started while the guide-star lock is engaged must release the lock so
 * it does not keep snapping the camera back onto the guide star during keyframe
 * dwells. The release is driven by the tour engine's `onTourStart` callback,
 * which must fire for EVERY tour — including the 21-of-23 tours that carry no
 * `viewMode` (the exact case the view-mode-change release path never covers).
 */

function makeCallbacks(overrides: Partial<TourCallbacks> = {}): TourCallbacks {
  return {
    animateToRaDec: vi.fn(),
    setFov: vi.fn(),
    getFov: vi.fn(() => 60),
    setTime: vi.fn(),
    ...overrides,
  };
}

function makeTour(partial: Partial<TourDefinition> = {}): TourDefinition {
  return {
    id: "t",
    name: "Test Tour",
    description: "",
    keyframes: [
      {
        ra: 100,
        dec: 0,
        fov: 30,
        datetime: "2000-01-01T00:00:00Z",
        holdDuration: 1000,
        transitionDuration: 1000,
        timeMode: "instant",
      },
    ],
    ...partial,
  };
}

describe("tour onTourStart callback", () => {
  it("fires when a tour begins playing", () => {
    const onTourStart = vi.fn();
    const engine = createTourEngine(makeCallbacks({ onTourStart }));
    engine.play(makeTour());
    expect(onTourStart).toHaveBeenCalledTimes(1);
  });

  it("fires even when the tour carries no viewMode (the lock-hijack case)", () => {
    const onTourStart = vi.fn();
    const setViewModeLocked = vi.fn();
    const engine = createTourEngine(
      makeCallbacks({ onTourStart, setViewModeLocked })
    );

    const tour = makeTour();
    expect(tour.viewMode).toBeUndefined();

    engine.play(tour);

    // The view-mode lock path is skipped (no viewMode), so onViewModeChange
    // would never fire — but onTourStart must still run to drop the lock.
    expect(setViewModeLocked).not.toHaveBeenCalled();
    expect(onTourStart).toHaveBeenCalledTimes(1);
  });

  it("fires before any camera move so the lock is dropped up front", () => {
    const calls: string[] = [];
    const engine = createTourEngine(
      makeCallbacks({
        onTourStart: () => calls.push("start"),
        animateToRaDec: () => calls.push("animate"),
      })
    );
    engine.play(makeTour());
    expect(calls[0]).toBe("start");
  });

  it("does not fire for an empty tour (play is a no-op)", () => {
    const onTourStart = vi.fn();
    const engine = createTourEngine(makeCallbacks({ onTourStart }));
    engine.play(makeTour({ keyframes: [] }));
    expect(onTourStart).not.toHaveBeenCalled();
  });
});
