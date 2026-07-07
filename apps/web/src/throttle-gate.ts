/**
 * A minimal, pure time-based throttle gate.
 *
 * `shouldRun(now)` returns `true` at most once per `intervalMs` window, letting
 * callers cheaply decide whether an expensive operation should execute on a
 * given tick. Passing `force = true` always runs and re-bases the interval so
 * that a mandatory terminal update (e.g. the exact final keyframe time in a
 * tour transition) never lands on a stale throttle step.
 *
 * The gate is intentionally free of any `performance.now()` / `Date.now()`
 * dependency: the caller injects the current time. This keeps it a pure,
 * deterministically testable unit.
 */
export interface ThrottleGate {
  /**
   * @param now   Monotonic timestamp (e.g. `performance.now()`), in ms.
   * @param force When true, always runs and re-bases the interval to `now`.
   * @returns `true` if the caller should perform the throttled work.
   */
  shouldRun(now: number, force?: boolean): boolean;
  /**
   * Reset the gate so the next `shouldRun` call runs immediately, regardless of
   * how recently a prior run occurred. Use at the start of a new interval-based
   * activity (e.g. a fresh tour transition).
   */
  reset(): void;
}

/**
 * Create a {@link ThrottleGate} that allows work through at most once per
 * `intervalMs`. The first call after creation (or after {@link ThrottleGate.reset})
 * always runs.
 *
 * @param intervalMs Minimum spacing between allowed runs, in milliseconds.
 */
export function createThrottleGate(intervalMs: number): ThrottleGate {
  // Negative infinity guarantees the first (non-forced) call runs.
  let lastRun = Number.NEGATIVE_INFINITY;

  return {
    shouldRun(now: number, force = false): boolean {
      if (force || now - lastRun >= intervalMs) {
        lastRun = now;
        return true;
      }
      return false;
    },
    reset(): void {
      lastRun = Number.NEGATIVE_INFINITY;
    },
  };
}
