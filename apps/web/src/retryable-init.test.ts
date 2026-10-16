import { describe, it, expect, vi } from "vitest";
import { retryableInit } from "./retryable-init";

describe("retryableInit", () => {
  it("shares one in-flight attempt between concurrent callers", async () => {
    const fn = vi.fn(async () => 42);
    const init = retryableInit(fn);
    const [a, b] = await Promise.all([init(), init()]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("reuses a successful attempt forever", async () => {
    const fn = vi.fn(async () => "ok");
    const init = retryableInit(fn);
    await init();
    await init();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries after a rejected attempt instead of reusing the rejection", async () => {
    let calls = 0;
    const init = retryableInit(async () => {
      calls++;
      if (calls === 1) throw new Error("Failed to load ISS ephemeris: 503");
      return "ready";
    });

    await expect(init()).rejects.toThrow("503");
    await expect(init()).resolves.toBe("ready");
    expect(calls).toBe(2);
    // Once it has succeeded, it is cached.
    await expect(init()).resolves.toBe("ready");
    expect(calls).toBe(2);
  });

  it("converts a synchronous throw into a retryable rejection", async () => {
    let calls = 0;
    const init = retryableInit((() => {
      calls++;
      if (calls === 1) throw new Error("sync boom");
      return Promise.resolve("ok");
    }) as () => Promise<string>);

    await expect(init()).rejects.toThrow("sync boom");
    await expect(init()).resolves.toBe("ok");
  });
});
