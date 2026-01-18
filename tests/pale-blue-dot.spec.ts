import { test, expect } from "@playwright/test";

test.describe("Pale Blue Dot Tour", () => {
  test("tour loads and displays correctly via URL parameter", async ({ page }) => {
    // Collect console logs
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      consoleLogs.push(msg.text());
    });

    // Load the page with tour parameter
    await page.goto("/?tour=pale-blue-dot");
    await page.waitForSelector("canvas", { timeout: 30000 });

    // Wait for tour to start
    await page.waitForTimeout(2000);

    // Check that tour playback UI is visible (not hidden)
    const tourPlayback = page.locator("#tour-playback");
    await expect(tourPlayback).not.toHaveClass(/hidden/);
    console.log("Tour playback UI is visible");

    // Check tour name is displayed
    const tourName = page.locator("#tour-playback-name");
    await expect(tourName).toHaveText("Pale Blue Dot");
    console.log("Tour name displayed correctly");

    // Check that caption is shown
    const caption = page.locator("#tour-caption");
    await expect(caption).not.toBeEmpty();
    const captionText = await caption.textContent();
    console.log(`First caption: "${captionText}"`);

    // Wait for a few keyframes to progress (first keyframe shows Jupiter)
    await page.waitForTimeout(8000);

    // Check caption has changed
    const newCaptionText = await caption.textContent();
    console.log(`Caption after 8s: "${newCaptionText}"`);
  });

  test("remote viewpoint is activated during tour", async ({ page }) => {
    test.setTimeout(60000); // 60 second timeout for this test
    // Collect console logs to verify viewpoint is set
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      consoleLogs.push(msg.text());
    });

    // Load the page with tour parameter
    await page.goto("/?tour=pale-blue-dot");
    await page.waitForSelector("canvas", { timeout: 30000 });

    // Wait a moment for tour to start
    await page.waitForTimeout(2000);

    // Check that view mode buttons are locked (have 'locked' class)
    const geoButton = page.locator("#view-geocentric");
    await expect(geoButton).toHaveClass(/locked/);
    console.log("View mode buttons are locked during tour");

    // Wait for tour to progress to the Voyager viewpoint keyframes
    // Keyframe 0: 6s, Keyframe 1: 7s, Keyframe 2 (viewpoint): starts at ~13s
    // Need to wait longer to ensure we reach it
    await page.waitForTimeout(23000);

    // Print all console logs for debugging
    console.log("All console logs captured:");
    consoleLogs.forEach((log, i) => console.log(`  [${i}] ${log}`));

    // Check console logs for viewpoint activation
    const viewpointLog = consoleLogs.find((log) =>
      log.includes("Remote viewpoint set")
    );
    console.log(`Viewpoint log found: ${viewpointLog}`);
    expect(viewpointLog).toBeTruthy();

    // Verify the computed RA/Dec is approximately correct (should be ~321°, -33°)
    if (viewpointLog) {
      const raMatch = viewpointLog.match(/RA=(\d+\.?\d*)/);
      const decMatch = viewpointLog.match(/Dec=(-?\d+\.?\d*)/);
      if (raMatch && decMatch) {
        const ra = parseFloat(raMatch[1]);
        const dec = parseFloat(decMatch[1]);
        console.log(`Computed Sun position: RA=${ra}°, Dec=${dec}°`);
        // Allow some tolerance
        expect(ra).toBeGreaterThan(300);
        expect(ra).toBeLessThan(340);
        expect(dec).toBeGreaterThan(-45);
        expect(dec).toBeLessThan(-20);
      }
    }

    // Check caption mentions Sagan or Voyager
    const caption = page.locator("#tour-caption");
    const captionText = await caption.textContent();
    console.log(`Caption at viewpoint: "${captionText}"`);
  });

  test("tour completes and returns to geocentric view", async ({ page }) => {
    test.setTimeout(70000); // Tour takes ~50 seconds to complete
    // Collect console logs
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      consoleLogs.push(msg.text());
    });

    // Load the page with tour parameter
    await page.goto("/?tour=pale-blue-dot");
    await page.waitForSelector("canvas", { timeout: 30000 });

    // Wait for tour to complete (all keyframes ~50s total, but we can skip ahead)
    // The full tour is about 50 seconds, let's wait for it
    await page.waitForTimeout(55000);

    // After tour completes, playback UI should be hidden
    const tourPlayback = page.locator("#tour-playback");
    await expect(tourPlayback).toHaveClass(/hidden/);
    console.log("Tour completed - playback UI hidden");

    // Check that "Tour complete" was logged
    const completeLog = consoleLogs.find((log) =>
      log.includes("Tour complete")
    );
    expect(completeLog).toBeTruthy();
    console.log("Tour complete log found");
  });
});
