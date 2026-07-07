import { describe, it, expect, vi } from "vitest";
import { once } from "./videos";

describe("once", () => {
  it("invokes the factory only once across multiple calls", async () => {
    const factory = vi.fn(async () => 42);
    const memoized = once(factory);

    const [a, b, c] = await Promise.all([memoized(), memoized(), memoized()]);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(c).toBe(42);
  });

  it("returns the identical promise instance on every call", () => {
    const memoized = once(async () => ({ shared: true }));
    const first = memoized();
    const second = memoized();
    expect(first).toBe(second);
  });

  it("does not re-invoke the factory after the promise resolves", async () => {
    const factory = vi.fn(async () => "loaded");
    const memoized = once(factory);

    expect(await memoized()).toBe("loaded");
    expect(await memoized()).toBe("loaded");
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("memoizes a rejected promise (single attempt, no retry)", async () => {
    const factory = vi.fn(async () => {
      throw new Error("boom");
    });
    const memoized = once(factory);

    await expect(memoized()).rejects.toThrow("boom");
    await expect(memoized()).rejects.toThrow("boom");
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
