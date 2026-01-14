import { defineConfig } from "vite";
import { execSync } from "child_process";
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
  plugins: [wasm(), topLevelAwait()],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __GIT_COMMIT__: JSON.stringify(getGitCommit()),
  },
  build: {
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
        },
      },
    },
  },
});
