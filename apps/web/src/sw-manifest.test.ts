import { describe, expect, it } from "vitest";
import {
  BUILD_ASSETS_PLACEHOLDER,
  BUILD_VERSION_PLACEHOLDER,
  collectPrecacheAssets,
  computeCacheVersion,
  injectPrecacheManifest,
} from "./sw-manifest";
// Vite `?raw` import keeps this test free of Node type dependencies.
import SW_SOURCE from "../public/sw.js?raw";

// Shape of the Vite 8 / Rolldown bundle keys observed in a real `pnpm build`.
const BUNDLE_KEYS = [
  "index.html",
  "test.html",
  "assets/main-BNDk2o7J.js",
  "assets/main-C3XNQgkK.css",
  "assets/three-CQaaMCsS.js",
  "assets/test-XTTXqtFK.js",
  "assets/orbit-worker-COdIGL0J.js",
  "assets/sky_engine_bg-BrMybKcC.wasm",
  "assets/main-BNDk2o7J.js.map",
  "assets/logo-abc123.png",
];

describe("collectPrecacheAssets", () => {
  it("keeps only assets/* JS, CSS and WASM as sorted root-relative URLs", () => {
    expect(collectPrecacheAssets(BUNDLE_KEYS)).toEqual([
      "/assets/main-BNDk2o7J.js",
      "/assets/main-C3XNQgkK.css",
      "/assets/orbit-worker-COdIGL0J.js",
      "/assets/sky_engine_bg-BrMybKcC.wasm",
      "/assets/test-XTTXqtFK.js",
      "/assets/three-CQaaMCsS.js",
    ]);
  });

  it("de-duplicates entries", () => {
    expect(
      collectPrecacheAssets(["assets/three-A.js", "/assets/three-A.js", "assets/three-A.js"]),
    ).toEqual(["/assets/three-A.js"]);
  });
});

describe("computeCacheVersion", () => {
  const assets = collectPrecacheAssets(BUNDLE_KEYS);

  it("is deterministic", () => {
    expect(computeCacheVersion(assets, "abc1234")).toBe(computeCacheVersion([...assets], "abc1234"));
    expect(computeCacheVersion(assets, "abc1234")).toMatch(/^b-[0-9a-f]{8}$/);
  });

  it("changes when a hashed asset changes", () => {
    const changed = assets.map((a) => a.replace("main-BNDk2o7J", "main-Zz999999"));
    expect(computeCacheVersion(changed, "abc1234")).not.toBe(computeCacheVersion(assets, "abc1234"));
  });

  it("changes when the build identity changes", () => {
    expect(computeCacheVersion(assets, "abc1234")).not.toBe(computeCacheVersion(assets, "def5678"));
  });
});

describe("injectPrecacheManifest", () => {
  it("public/sw.js carries both placeholders and dev defaults", () => {
    expect(SW_SOURCE).toContain(BUILD_VERSION_PLACEHOLDER);
    expect(SW_SOURCE).toContain(BUILD_ASSETS_PLACEHOLDER);
  });

  it("replaces both placeholders in the real sw.js", () => {
    const assets = collectPrecacheAssets(BUNDLE_KEYS);
    const out = injectPrecacheManifest(SW_SOURCE, { assets, version: "b-1234abcd" });
    expect(out).not.toContain(BUILD_VERSION_PLACEHOLDER);
    expect(out).not.toContain(BUILD_ASSETS_PLACEHOLDER);
    expect(out).toContain('const BUILD_VERSION = "b-1234abcd";');
    expect(out).toContain('"/assets/sky_engine_bg-BrMybKcC.wasm"');

    // The injected values are what the worker actually evaluates.
    const evaluate = new Function(
      `${out.slice(0, out.indexOf("const CACHE_VERSION"))}; return { BUILD_VERSION, BUILD_ASSETS };`,
    );
    expect(evaluate()).toEqual({ BUILD_VERSION: "b-1234abcd", BUILD_ASSETS: assets });
  });

  it("does not interpret $ patterns in the payload", () => {
    const out = injectPrecacheManifest(SW_SOURCE, { assets: ["/assets/a-$&.js"], version: "v$1" });
    expect(out).toContain('"/assets/a-$&.js"');
    expect(out).toContain('const BUILD_VERSION = "v$1";');
  });

  it("throws when a placeholder is missing", () => {
    const broken = SW_SOURCE.replace(BUILD_ASSETS_PLACEHOLDER, "[]");
    expect(() => injectPrecacheManifest(broken, { assets: [], version: "v" })).toThrow(
      /__SW_BUILD_ASSETS__/,
    );
  });
});
