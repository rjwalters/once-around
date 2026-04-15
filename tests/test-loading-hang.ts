/**
 * Test script to reproduce intermittent loading hangs on mobile.
 * Tests multiple conditions that could cause the loading screen to get stuck.
 */
import { chromium, devices } from "playwright";

const PROD_URL = "https://oncearound.org";
const TIMEOUT_MS = 30000; // 30 second timeout

interface TestResult {
  name: string;
  success: boolean;
  loadTimeMs?: number;
  error?: string;
  lastConsoleLog?: string;
  pendingRequests?: string[];
}

async function runTest(name: string, testFn: () => Promise<TestResult>): Promise<TestResult> {
  console.log(`\n--- Running: ${name} ---`);
  try {
    const result = await testFn();
    if (result.success) {
      console.log(`  PASS: Loaded in ${result.loadTimeMs}ms`);
    } else {
      console.log(`  FAIL: ${result.error}`);
      if (result.lastConsoleLog) {
        console.log(`  Last console log: ${result.lastConsoleLog}`);
      }
      if (result.pendingRequests?.length) {
        console.log(`  Pending requests: ${result.pendingRequests.join(", ")}`);
      }
    }
    return result;
  } catch (e) {
    const result: TestResult = {
      name,
      success: false,
      error: String(e),
    };
    console.log(`  FAIL: ${result.error}`);
    return result;
  }
}

async function testWithDevice(
  deviceName: string,
  options: {
    clearCache?: boolean;
    throttle?: { downloadKbps: number; uploadKbps: number; latencyMs: number };
    blockServiceWorker?: boolean;
    timeout?: number;
  } = {}
): Promise<TestResult> {
  const browser = await chromium.launch();
  const device = devices[deviceName];
  if (!device) {
    throw new Error(`Unknown device: ${deviceName}`);
  }

  const context = await browser.newContext({
    ...device,
    serviceWorkers: options.blockServiceWorker ? "block" : "allow",
  });

  const page = await context.newPage();

  // Apply network throttling if requested
  if (options.throttle) {
    const client = await context.newCDPSession(page);
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: (options.throttle.downloadKbps * 1024) / 8,
      uploadThroughput: (options.throttle.uploadKbps * 1024) / 8,
      latency: options.throttle.latencyMs,
    });
  }

  // Track console logs
  const consoleLogs: string[] = [];
  page.on("console", (msg) => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });

  // Track pending requests
  const pendingRequests = new Map<string, number>();
  page.on("request", (req) => {
    pendingRequests.set(req.url(), Date.now());
  });
  page.on("requestfinished", (req) => {
    pendingRequests.delete(req.url());
  });
  page.on("requestfailed", (req) => {
    pendingRequests.delete(req.url());
  });

  const startTime = Date.now();
  const timeout = options.timeout ?? TIMEOUT_MS;

  try {
    // Clear cache if requested by navigating with cache disabled
    if (options.clearCache) {
      const client = await context.newCDPSession(page);
      await client.send("Network.clearBrowserCache");
    }

    await page.goto(PROD_URL, {
      waitUntil: "domcontentloaded",
      timeout,
    });

    // Wait for loading overlay to disappear
    const loadingOverlay = page.locator("#loading");
    await loadingOverlay.waitFor({ state: "detached", timeout });

    const loadTimeMs = Date.now() - startTime;
    await context.close();
    await browser.close();

    return {
      name: deviceName,
      success: true,
      loadTimeMs,
    };
  } catch (e) {
    const elapsed = Date.now() - startTime;
    const pending = Array.from(pendingRequests.keys());
    await context.close();
    await browser.close();

    return {
      name: deviceName,
      success: false,
      loadTimeMs: elapsed,
      error: String(e),
      lastConsoleLog: consoleLogs[consoleLogs.length - 1],
      pendingRequests: pending.length > 0 ? pending : undefined,
    };
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("Loading Hang Diagnostic Tests");
  console.log("=".repeat(60));

  const results: TestResult[] = [];

  // Test 1: Fresh load on Pixel 5 (cache cleared)
  results.push(
    await runTest("Pixel 5 - Fresh load (cache cleared)", () =>
      testWithDevice("Pixel 5", { clearCache: true })
    )
  );

  // Test 2: Cached load on Pixel 5
  results.push(
    await runTest("Pixel 5 - Cached load", () => testWithDevice("Pixel 5"))
  );

  // Test 3: Pixel 5 with slow network
  results.push(
    await runTest("Pixel 5 - Slow 3G network", () =>
      testWithDevice("Pixel 5", {
        throttle: { downloadKbps: 400, uploadKbps: 400, latencyMs: 400 },
        timeout: 120000,
      })
    )
  );

  // Test 4: Pixel 5 with very slow network (2G-like)
  results.push(
    await runTest("Pixel 5 - Very slow network (2G)", () =>
      testWithDevice("Pixel 5", {
        throttle: { downloadKbps: 50, uploadKbps: 50, latencyMs: 1000 },
        timeout: 180000,
      })
    )
  );

  // Test 5: Pixel 5 without service worker
  results.push(
    await runTest("Pixel 5 - No service worker", () =>
      testWithDevice("Pixel 5", { blockServiceWorker: true })
    )
  );

  // Test 6: iPhone 12 - Fresh load
  results.push(
    await runTest("iPhone 12 - Fresh load", () =>
      testWithDevice("iPhone 12", { clearCache: true })
    )
  );

  // Test 7: iPhone 12 Pro - Fresh load
  results.push(
    await runTest("iPhone 12 Pro - Fresh load", () =>
      testWithDevice("iPhone 12 Pro", { clearCache: true })
    )
  );

  // Test 8: Pixel 7 - Fresh load
  results.push(
    await runTest("Pixel 7 - Fresh load", () =>
      testWithDevice("Pixel 7", { clearCache: true })
    )
  );

  // Test 9: Multiple rapid loads (test for race conditions)
  console.log("\n--- Running: Rapid succession test (3 loads) ---");
  let rapidSuccess = 0;
  for (let i = 0; i < 3; i++) {
    const result = await testWithDevice("Pixel 5", { clearCache: true });
    if (result.success) rapidSuccess++;
    console.log(`  Attempt ${i + 1}: ${result.success ? "PASS" : "FAIL"} (${result.loadTimeMs}ms)`);
  }
  results.push({
    name: "Rapid succession test",
    success: rapidSuccess === 3,
    error: rapidSuccess < 3 ? `Only ${rapidSuccess}/3 succeeded` : undefined,
  });

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${failed}/${results.length}`);

  if (failed > 0) {
    console.log("\nFailed tests:");
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
  }

  console.log("\nLoad times:");
  results
    .filter((r) => r.loadTimeMs)
    .forEach((r) => {
      console.log(`  - ${r.name}: ${r.loadTimeMs}ms`);
    });
}

main().catch(console.error);
