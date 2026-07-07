import { defineConfig } from "vitest/config";
import { execSync } from "child_process";
import { resolve } from "path";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

// Get git commit hash at build time
function getGitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
    {
      // Inject a preload hint for the hashed wasm asset. The filename is only
      // known after bundling, so we read it from ctx.bundle in a post-transform.
      // In dev mode there is no bundle, so this is a no-op.
      name: "inject-wasm-preload",
      transformIndexHtml: {
        order: "post",
        handler(html, ctx) {
          const bundle = ctx.bundle;
          if (!bundle) return html; // dev server: no bundle available
          const wasmAsset = Object.values(bundle).find(
            (chunk) => chunk.type === "asset" && chunk.fileName.endsWith(".wasm"),
          );
          if (!wasmAsset) return html;
          return {
            html,
            tags: [
              {
                tag: "link",
                attrs: {
                  rel: "preload",
                  as: "fetch",
                  href: `/${wasmAsset.fileName}`,
                  crossorigin: "",
                },
                injectTo: "head",
              },
            ],
          };
        },
      },
    },
  ],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __GIT_COMMIT__: JSON.stringify(getGitCommit()),
  },
  build: {
    target: "esnext",
    rollupOptions: {
      // Multi-page build. `main` is the full star-map app; `test` is a
      // standalone AR calibration diagnostics page (test.html) that imports
      // only the geometry modules + wasm engine, so it never pulls in the
      // Three.js renderer or the star-map UI bundle.
      input: {
        main: resolve(__dirname, "index.html"),
        test: resolve(__dirname, "test.html"),
      },
      output: {
        manualChunks: {
          three: ["three"],
        },
      },
    },
  },
  test: {
    // Geometry modules are pure math; the node environment runs them cleanly
    // (no DOM, no WASM). Three.js is only used for vector/quaternion math,
    // which works under node.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
