/**
 * Build-time service-worker manifest injection (issue #145).
 *
 * `public/sw.js` is copied verbatim into `dist/`, so on its own it cannot know
 * the content-hashed filenames Vite emits under `assets/`. The `sw-precache-
 * manifest` plugin in `vite.config.ts` uses these helpers after the bundle is
 * written to rewrite two placeholders in `dist/sw.js`:
 *
 *   const BUILD_VERSION = /* __SW_BUILD_VERSION__ *\/ 'dev';
 *   const BUILD_ASSETS = /* __SW_BUILD_ASSETS__ *\/ [];
 *
 * In dev the placeholders are left alone, so the worker still parses and runs
 * (with an empty asset list and a `dev` cache version).
 *
 * This module is deliberately pure and WASM-free (no Node or DOM imports) so it
 * can be imported both by the Vite config and by the vitest unit suite.
 */

export const BUILD_VERSION_PLACEHOLDER = "/* __SW_BUILD_VERSION__ */ 'dev'";
export const BUILD_ASSETS_PLACEHOLDER = "/* __SW_BUILD_ASSETS__ */ []";

/** Extensions of bundle outputs the app needs to boot offline. */
const PRECACHE_EXTENSIONS = [".js", ".css", ".wasm"];

/**
 * Select the bundle outputs to precache: every `assets/*` JS/CSS/WASM file,
 * returned as root-relative URLs, de-duplicated and sorted so the list (and
 * therefore the derived cache version) is deterministic across builds.
 */
export function collectPrecacheAssets(fileNames: Iterable<string>): string[] {
  const urls = new Set<string>();
  for (const fileName of fileNames) {
    const normalized = fileName.replace(/^\/+/, "");
    if (!normalized.startsWith("assets/")) continue;
    if (!PRECACHE_EXTENSIONS.some((ext) => normalized.endsWith(ext))) continue;
    urls.add(`/${normalized}`);
  }
  return [...urls].sort();
}

/**
 * Derive a short, stable cache version from the precache list plus any extra
 * build identity (e.g. the git commit). Hashed filenames change whenever their
 * content changes, so a new deploy with different code yields a new version,
 * which makes the worker's `activate` handler evict the previous caches.
 *
 * Uses 32-bit FNV-1a so it has no Node/crypto dependency.
 */
export function computeCacheVersion(assets: readonly string[], extra = ""): string {
  let hash = 0x811c9dc5;
  const input = `${assets.join("\n")}\n${extra}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `b-${hash.toString(16).padStart(8, "0")}`;
}

/**
 * Replace the build placeholders in the service-worker source. Throws if either
 * placeholder is missing so a refactor of `sw.js` fails the build loudly
 * instead of silently shipping a worker with an empty precache list.
 */
export function injectPrecacheManifest(
  swSource: string,
  manifest: { assets: readonly string[]; version: string },
): string {
  for (const placeholder of [BUILD_VERSION_PLACEHOLDER, BUILD_ASSETS_PLACEHOLDER]) {
    if (!swSource.includes(placeholder)) {
      throw new Error(`sw.js is missing the build placeholder: ${placeholder}`);
    }
  }
  // Use replacer functions so `$` sequences in the payload are never treated
  // as replacement patterns.
  return swSource
    .replace(BUILD_VERSION_PLACEHOLDER, () => JSON.stringify(manifest.version))
    .replace(BUILD_ASSETS_PLACEHOLDER, () => JSON.stringify(manifest.assets, null, 2));
}
