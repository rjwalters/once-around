import { test, expect, type Page } from "@playwright/test";

/**
 * Issue #145: after one online visit and service-worker installation, the app
 * must reopen offline (including a share URL) without an online reload.
 *
 * Run with `pnpm test:offline` (production build + vite preview; needs
 * `pnpm build:wasm` first). See playwright.offline.config.ts.
 */

const SHARE_QUERY = "?ra=83.8&dec=-5.4&fov=30";

async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector("canvas", { timeout: 30000 });
  // The overlay gets `.hidden` and is then removed from the DOM entirely.
  await page.waitForFunction(() => !document.querySelector("#loading:not(.hidden)"), null, {
    timeout: 60000,
  });
}

test("first offline reopen serves the precached shell and bundle", async ({ browser }) => {
  test.setTimeout(180000);
  // Fresh context: no prior service worker or Cache Storage.
  const context = await browser.newContext({ serviceWorkers: "allow" });
  const online = await context.newPage();
  await online.goto("/");
  await waitForAppReady(online);

  // `ready` resolves once the worker is active, i.e. after install's
  // waitUntil (all required precaching) succeeded.
  const cached = await online.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const names = await caches.keys();
    const staticName = names.find((n) => n.startsWith("once-around-static-"));
    const dynamicName = names.find((n) => n.startsWith("once-around-dynamic-"));
    const paths = async (name?: string) =>
      name ? (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname) : [];
    return { names, staticPaths: await paths(staticName), dynamicPaths: await paths(dynamicName) };
  });

  // Per-build cache version, not the old hard-coded v1 or the dev default.
  expect(cached.names.some((n) => /^once-around-static-b-[0-9a-f]{8}$/.test(n))).toBe(true);
  expect(cached.staticPaths).toContain("/");
  expect(cached.staticPaths).toContain("/data/stars/bsc5-tier1.bin");
  expect(cached.staticPaths).toContain("/data/stars/constellation-stars.bin");
  expect(cached.staticPaths.some((p) => /^\/assets\/main-.*\.js$/.test(p))).toBe(true);
  expect(cached.staticPaths.some((p) => /^\/assets\/main-.*\.css$/.test(p))).toBe(true);
  expect(cached.staticPaths.some((p) => /^\/assets\/.*\.wasm$/.test(p))).toBe(true);
  expect(cached.dynamicPaths).toContain("/data/iss_ephemeris.bin");

  await context.setOffline(true);

  for (const path of ["/", `/${SHARE_QUERY}`]) {
    const page = await context.newPage();
    // Planet/Earth .jpg textures are deliberately not precached (several MB;
    // they are runtime-cached once the worker controls the page), so only the
    // bundle and core star data are required here.
    const failed: string[] = [];
    page.on("requestfailed", (req) => {
      const url = new URL(req.url());
      if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/data/stars/")) {
        failed.push(url.pathname);
      }
    });
    let starsLoaded = 0;
    page.on("console", (msg) => {
      const m = /Engine loaded: (\d+) stars/.exec(msg.text());
      if (m) starsLoaded = Number(m[1]);
    });

    const response = await page.goto(path);
    expect(response?.fromServiceWorker()).toBe(true);
    await waitForAppReady(page);

    const box = await page.locator("canvas").first().boundingBox();
    expect(box!.width).toBeGreaterThan(100);
    expect(starsLoaded).toBeGreaterThan(0);
    expect(failed).toEqual([]);

    if (path.includes("?")) {
      // The shell is served for the share URL without rewriting it, so the
      // client-side URL state survives (the app re-serializes it, e.g. 83.80).
      const url = new URL(page.url());
      expect(Number(url.searchParams.get("ra"))).toBeCloseTo(83.8, 2);
      expect(Number(url.searchParams.get("dec"))).toBeCloseTo(-5.4, 2);
    }
    await page.close();
  }

  await context.close();
});
