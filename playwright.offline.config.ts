import { defineConfig, devices } from "@playwright/test";

/**
 * Offline-reopen regression (issue #145), run with `pnpm test:offline`.
 *
 * Runs against a production build served by `vite preview`, because the
 * service worker's precache list is only injected into dist/sw.js at build
 * time (the dev server has no hashed assets). Requires `pnpm build:wasm` first,
 * so it is local-only and not part of the WASM-free CI unit job.
 */
const PORT = 4173;

export default defineConfig({
  testDir: "./tests",
  testMatch: "offline-shell.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    serviceWorkers: "allow",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm --filter once-around-web build && pnpm --filter once-around-web preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180000,
  },
});
