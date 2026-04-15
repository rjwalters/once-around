/**
 * Diagnostic test to troubleshoot mobile loading issues on oncearound.org
 */
import { test, expect, devices } from "@playwright/test";

// Test against production site with mobile emulation
const PROD_URL = "https://oncearound.org";

test.describe("Mobile Loading Diagnostics", () => {
  test("diagnose loading screen hang on iPhone", async ({ browser }) => {
    // Create a context with iPhone emulation
    const context = await browser.newContext({
      ...devices["iPhone 12"],
      // Enable console logging
    });

    const page = await context.newPage();

    // Track console messages
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      const text = `[${msg.type()}] ${msg.text()}`;
      consoleLogs.push(text);
      console.log(`CONSOLE: ${text}`);
    });

    // Track page errors
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      const text = `PAGE ERROR: ${err.message}`;
      pageErrors.push(text);
      console.log(text);
    });

    // Track failed network requests
    const failedRequests: string[] = [];
    const pendingRequests = new Map<string, number>();

    page.on("request", (request) => {
      pendingRequests.set(request.url(), Date.now());
    });

    page.on("requestfailed", (request) => {
      const text = `FAILED: ${request.url()} - ${request.failure()?.errorText}`;
      failedRequests.push(text);
      console.log(text);
      pendingRequests.delete(request.url());
    });

    page.on("requestfinished", (request) => {
      const startTime = pendingRequests.get(request.url());
      if (startTime) {
        const duration = Date.now() - startTime;
        if (duration > 1000) {
          console.log(`SLOW REQUEST (${duration}ms): ${request.url()}`);
        }
      }
      pendingRequests.delete(request.url());
    });

    console.log("\n========================================");
    console.log("Starting mobile loading diagnostic test");
    console.log(`URL: ${PROD_URL}`);
    console.log(`Device: iPhone 12`);
    console.log("========================================\n");

    // Navigate to the page
    console.log("Navigating to page...");
    const startTime = Date.now();

    try {
      await page.goto(PROD_URL, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      console.log(
        `DOM content loaded in ${Date.now() - startTime}ms`
      );
    } catch (e) {
      console.log(`Navigation failed: ${e}`);
    }

    // Check if loading overlay exists
    const loadingOverlay = page.locator("#loading");
    const loadingExists = await loadingOverlay.count();
    console.log(`\nLoading overlay exists: ${loadingExists > 0}`);

    // Wait for loading overlay to disappear (with timeout)
    console.log("\nWaiting for loading screen to disappear...");
    const loadingStartTime = Date.now();

    try {
      await expect(loadingOverlay).toHaveCount(0, { timeout: 60000 });
      const loadingTime = Date.now() - loadingStartTime;
      console.log(`SUCCESS: Loading screen dismissed after ${loadingTime}ms`);
    } catch (e) {
      const elapsed = Date.now() - loadingStartTime;
      console.log(`\nFAILED: Loading screen still visible after ${elapsed}ms`);

      // Check which console logs we got
      console.log("\n--- Console logs received ---");
      consoleLogs.forEach((log) => console.log(log));

      // Check for specific progress markers
      const hasInit = consoleLogs.some((l) =>
        l.includes("Initializing Once Around")
      );
      const hasEngineLoading = consoleLogs.some((l) =>
        l.includes("Loading sky engine")
      );
      const hasEngineLoaded = consoleLogs.some((l) =>
        l.includes("Engine loaded")
      );
      const hasReady = consoleLogs.some((l) =>
        l.includes("Once Around ready")
      );

      console.log("\n--- Loading progress ---");
      console.log(`1. Initializing:      ${hasInit ? "YES" : "NO"}`);
      console.log(`2. Loading engine:    ${hasEngineLoading ? "YES" : "NO"}`);
      console.log(`3. Engine loaded:     ${hasEngineLoaded ? "YES" : "NO"}`);
      console.log(`4. App ready:         ${hasReady ? "YES" : "NO"}`);

      // Check for pending requests
      if (pendingRequests.size > 0) {
        console.log("\n--- Pending network requests ---");
        pendingRequests.forEach((startTime, url) => {
          console.log(`  ${url} (pending for ${Date.now() - startTime}ms)`);
        });
      }

      // Check for errors
      if (pageErrors.length > 0) {
        console.log("\n--- Page errors ---");
        pageErrors.forEach((err) => console.log(err));
      }

      if (failedRequests.length > 0) {
        console.log("\n--- Failed requests ---");
        failedRequests.forEach((req) => console.log(req));
      }

      // Take a screenshot
      await page.screenshot({
        path: "tests/screenshots/mobile-loading-stuck.png",
        fullPage: true,
      });
      console.log("\nScreenshot saved to tests/screenshots/mobile-loading-stuck.png");
    }

    // Final summary
    console.log("\n========================================");
    console.log("DIAGNOSTIC SUMMARY");
    console.log("========================================");
    console.log(`Total console logs: ${consoleLogs.length}`);
    console.log(`Page errors: ${pageErrors.length}`);
    console.log(`Failed requests: ${failedRequests.length}`);
    console.log(`Total time: ${Date.now() - startTime}ms`);

    await context.close();
  });

  test("diagnose loading screen hang on Android", async ({ browser }) => {
    // Create a context with Android emulation
    const context = await browser.newContext({
      ...devices["Pixel 5"],
    });

    const page = await context.newPage();

    // Track console messages
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    // Track page errors
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    // Track failed requests
    const failedRequests: string[] = [];
    page.on("requestfailed", (request) => {
      failedRequests.push(`${request.url()} - ${request.failure()?.errorText}`);
    });

    console.log("\n========================================");
    console.log("Testing on Android (Pixel 5)");
    console.log("========================================\n");

    const startTime = Date.now();
    await page.goto(PROD_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

    const loadingOverlay = page.locator("#loading");

    try {
      await expect(loadingOverlay).toHaveCount(0, { timeout: 60000 });
      console.log(`SUCCESS: Loaded in ${Date.now() - startTime}ms`);
    } catch (e) {
      console.log(`FAILED: Loading stuck after ${Date.now() - startTime}ms`);
      console.log("\nConsole logs:");
      consoleLogs.forEach((l) => console.log(l));
      if (pageErrors.length) {
        console.log("\nErrors:", pageErrors);
      }
      if (failedRequests.length) {
        console.log("\nFailed requests:", failedRequests);
      }
    }

    await context.close();
  });

  test("compare desktop vs mobile loading", async ({ browser }) => {
    console.log("\n========================================");
    console.log("Comparing Desktop vs Mobile Loading");
    console.log("========================================\n");

    // Test desktop
    const desktopContext = await browser.newContext({
      ...devices["Desktop Chrome"],
    });
    const desktopPage = await desktopContext.newPage();
    let desktopReady = false;
    desktopPage.on("console", (msg) => {
      if (msg.text().includes("Once Around ready")) desktopReady = true;
    });

    const desktopStart = Date.now();
    await desktopPage.goto(PROD_URL, { waitUntil: "domcontentloaded" });
    try {
      await expect(desktopPage.locator("#loading")).toHaveCount(0, {
        timeout: 30000,
      });
      console.log(`Desktop: Loaded in ${Date.now() - desktopStart}ms`);
    } catch {
      console.log(`Desktop: FAILED after ${Date.now() - desktopStart}ms`);
    }
    await desktopContext.close();

    // Test mobile
    const mobileContext = await browser.newContext({
      ...devices["iPhone 12"],
    });
    const mobilePage = await mobileContext.newPage();
    let mobileReady = false;
    mobilePage.on("console", (msg) => {
      if (msg.text().includes("Once Around ready")) mobileReady = true;
    });

    const mobileStart = Date.now();
    await mobilePage.goto(PROD_URL, { waitUntil: "domcontentloaded" });
    try {
      await expect(mobilePage.locator("#loading")).toHaveCount(0, {
        timeout: 30000,
      });
      console.log(`Mobile:  Loaded in ${Date.now() - mobileStart}ms`);
    } catch {
      console.log(`Mobile:  FAILED after ${Date.now() - mobileStart}ms`);
    }
    await mobileContext.close();
  });

  test("test with slow 3G network throttling", async ({ browser }) => {
    console.log("\n========================================");
    console.log("Testing with Slow 3G Network Throttling");
    console.log("========================================\n");

    const context = await browser.newContext({
      ...devices["iPhone 12"],
    });

    const page = await context.newPage();

    // Create CDP session for network throttling
    const client = await context.newCDPSession(page);
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: (500 * 1024) / 8, // 500 kbps
      uploadThroughput: (500 * 1024) / 8,
      latency: 400, // 400ms latency
    });

    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      const text = `[${msg.type()}] ${msg.text()}`;
      consoleLogs.push(text);
      console.log(`CONSOLE: ${text}`);
    });

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      console.log(`PAGE ERROR: ${err.message}`);
      pageErrors.push(err.message);
    });

    const failedRequests: string[] = [];
    page.on("requestfailed", (request) => {
      const text = `FAILED: ${request.url()} - ${request.failure()?.errorText}`;
      failedRequests.push(text);
      console.log(text);
    });

    const startTime = Date.now();

    try {
      await page.goto(PROD_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
      console.log(`DOM loaded in ${Date.now() - startTime}ms`);
    } catch (e) {
      console.log(`Navigation timeout: ${e}`);
    }

    const loadingOverlay = page.locator("#loading");

    try {
      await expect(loadingOverlay).toHaveCount(0, { timeout: 120000 });
      console.log(`SUCCESS: Loaded in ${Date.now() - startTime}ms`);
    } catch {
      console.log(`FAILED: Loading stuck after ${Date.now() - startTime}ms`);

      // Check progress
      const hasInit = consoleLogs.some((l) => l.includes("Initializing"));
      const hasEngineLoading = consoleLogs.some((l) => l.includes("Loading sky engine"));
      const hasEngineLoaded = consoleLogs.some((l) => l.includes("Engine loaded"));
      const hasReady = consoleLogs.some((l) => l.includes("Once Around ready"));

      console.log("\n--- Loading progress ---");
      console.log(`1. Initializing:      ${hasInit ? "YES" : "NO"}`);
      console.log(`2. Loading engine:    ${hasEngineLoading ? "YES" : "NO"}`);
      console.log(`3. Engine loaded:     ${hasEngineLoaded ? "YES" : "NO"}`);
      console.log(`4. App ready:         ${hasReady ? "YES" : "NO"}`);

      if (pageErrors.length) console.log("\nErrors:", pageErrors);
      if (failedRequests.length) console.log("\nFailed:", failedRequests);

      await page.screenshot({
        path: "tests/screenshots/slow-3g-loading-stuck.png",
      });
    }

    await context.close();
  });

  test("test with service worker disabled", async ({ browser }) => {
    console.log("\n========================================");
    console.log("Testing with Service Worker Disabled");
    console.log("========================================\n");

    const context = await browser.newContext({
      ...devices["iPhone 12"],
      serviceWorkers: "block",
    });

    const page = await context.newPage();

    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    const startTime = Date.now();
    await page.goto(PROD_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

    const loadingOverlay = page.locator("#loading");

    try {
      await expect(loadingOverlay).toHaveCount(0, { timeout: 60000 });
      console.log(`SUCCESS (no SW): Loaded in ${Date.now() - startTime}ms`);
    } catch {
      console.log(`FAILED (no SW): Stuck after ${Date.now() - startTime}ms`);
      console.log("Console logs:");
      consoleLogs.forEach((l) => console.log(l));
    }

    await context.close();
  });

  test("test with WebGL disabled (should fail gracefully)", async ({ browser }) => {
    console.log("\n========================================");
    console.log("Testing WebGL Failure Handling");
    console.log("========================================\n");

    const context = await browser.newContext({
      ...devices["iPhone 12"],
    });

    const page = await context.newPage();

    // Inject script to break WebGL before page loads
    await page.addInitScript(() => {
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
        if (type === "webgl" || type === "webgl2") {
          console.log("[TEST] Blocking WebGL context creation");
          return null;
        }
        return originalGetContext.apply(this, [type, ...args] as Parameters<typeof originalGetContext>);
      };
    });

    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      const text = `[${msg.type()}] ${msg.text()}`;
      consoleLogs.push(text);
      console.log(`CONSOLE: ${text}`);
    });

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      console.log(`PAGE ERROR: ${err.message}`);
      pageErrors.push(err.message);
    });

    const startTime = Date.now();
    await page.goto(PROD_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait a bit for initialization to fail
    await page.waitForTimeout(5000);

    const loadingOverlay = page.locator("#loading");
    const loadingExists = await loadingOverlay.count();

    console.log(`\nLoading overlay still visible: ${loadingExists > 0}`);
    console.log(`Time elapsed: ${Date.now() - startTime}ms`);

    if (pageErrors.length) {
      console.log("\nPage errors (expected with WebGL disabled):");
      pageErrors.forEach((e) => console.log(`  - ${e}`));
    }

    // Check if error is displayed to user
    const errorMessage = page.locator('text="Failed to initialize"');
    const errorShown = await errorMessage.count();
    console.log(`Error message shown to user: ${errorShown > 0}`);

    await page.screenshot({
      path: "tests/screenshots/webgl-disabled.png",
    });
    console.log("Screenshot saved to tests/screenshots/webgl-disabled.png");

    await context.close();
  });

  test("check for iOS Safari specific issues", async ({ browser }) => {
    console.log("\n========================================");
    console.log("Testing iOS Safari Specific Issues");
    console.log("========================================\n");

    // Use Safari user agent
    const context = await browser.newContext({
      ...devices["iPhone 12 Pro"],
      // Safari doesn't support some features
      hasTouch: true,
      isMobile: true,
    });

    const page = await context.newPage();

    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      const text = `[${msg.type()}] ${msg.text()}`;
      consoleLogs.push(text);
      if (msg.type() === "error" || msg.type() === "warning") {
        console.log(`CONSOLE: ${text}`);
      }
    });

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      console.log(`PAGE ERROR: ${err.message}`);
      pageErrors.push(err.message);
    });

    // Check for requestIdleCallback support (not available in Safari)
    await page.addInitScript(() => {
      if (!("requestIdleCallback" in window)) {
        console.log("[TEST] requestIdleCallback not supported (Safari behavior)");
      }
    });

    const startTime = Date.now();
    await page.goto(PROD_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

    const loadingOverlay = page.locator("#loading");

    try {
      await expect(loadingOverlay).toHaveCount(0, { timeout: 60000 });
      console.log(`SUCCESS (iOS Safari): Loaded in ${Date.now() - startTime}ms`);
    } catch {
      console.log(`FAILED (iOS Safari): Stuck after ${Date.now() - startTime}ms`);
      console.log("\nAll console messages:");
      consoleLogs.forEach((l) => console.log(l));
    }

    await context.close();
  });
});
