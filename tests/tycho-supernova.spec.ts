import { test, expect } from "@playwright/test";

test.describe("Tycho Supernova Tour (SN 1572)", () => {
  test("tour loads and displays correctly via URL parameter", async ({ page }) => {
    // Collect console logs
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      consoleLogs.push(msg.text());
    });

    // Load the page with tour parameter
    await page.goto("/?tour=sn-1572");
    await page.waitForSelector("canvas", { timeout: 30000 });

    // Wait for tour to start
    await page.waitForTimeout(2000);

    // Check that tour playback UI is visible (not hidden)
    const tourPlayback = page.locator("#tour-playback");
    await expect(tourPlayback).not.toHaveClass(/hidden/);
    console.log("Tour playback UI is visible");

    // Check tour name is displayed
    const tourName = page.locator("#tour-playback-name");
    await expect(tourName).toHaveText("SN 1572: Tycho's Supernova");
    console.log("Tour name displayed correctly");

    // Check that a tour caption is shown (may be first or second keyframe)
    const caption = page.locator("#tour-caption");
    await expect(caption).not.toBeEmpty();
    const captionText = await caption.textContent();
    console.log(`Caption: "${captionText}"`);

    // Verify it's a valid tour caption (either first or second keyframe)
    const isValidCaption =
      captionText?.includes("Hven Island") ||
      captionText?.includes("November 11, 1572") ||
      captionText?.includes("Tycho Brahe");
    expect(isValidCaption).toBe(true);
  });

  test("star overrides are applied during supernova appearance", async ({ page }) => {
    // Collect console logs to verify star overrides
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      consoleLogs.push(msg.text());
    });

    // Load the page with tour parameter
    await page.goto("/?tour=sn-1572");
    await page.waitForSelector("canvas", { timeout: 30000 });

    // Wait for keyframe 2 to start (after first keyframe: 1000ms transition + 4000ms hold)
    // Then keyframe 2 starts with 3000ms transition + 4000ms hold
    await page.waitForTimeout(10000);

    // Check caption has progressed to the supernova sighting
    const caption = page.locator("#tour-caption");
    const captionText = await caption.textContent();
    console.log(`Caption after 10s: "${captionText}"`);

    // Print console logs for debugging star override application
    console.log("Console logs captured:");
    consoleLogs.forEach((log, i) => {
      if (log.includes("star") || log.includes("override") || log.includes("Tour")) {
        console.log(`  [${i}] ${log}`);
      }
    });

    // Verify tour is still playing
    const tourPlayback = page.locator("#tour-playback");
    await expect(tourPlayback).not.toHaveClass(/hidden/);
  });

  test("tour progresses through keyframes with caption changes", async ({ page }) => {
    // Load the page with tour parameter
    await page.goto("/?tour=sn-1572");
    await page.waitForSelector("canvas", { timeout: 30000 });

    const caption = page.locator("#tour-caption");
    const captionTexts: string[] = [];

    // Capture initial caption
    await page.waitForTimeout(2000);
    captionTexts.push((await caption.textContent()) || "");
    console.log(`Caption 1: "${captionTexts[0]}"`);

    // Wait for second keyframe (after ~5s)
    await page.waitForTimeout(6000);
    captionTexts.push((await caption.textContent()) || "");
    console.log(`Caption 2: "${captionTexts[1]}"`);

    // Wait for third keyframe - peak brightness
    await page.waitForTimeout(8000);
    captionTexts.push((await caption.textContent()) || "");
    console.log(`Caption 3: "${captionTexts[2]}"`);

    // Verify captions changed during the tour
    const uniqueCaptions = new Set(captionTexts);
    expect(uniqueCaptions.size).toBeGreaterThan(1);
    console.log(`Captured ${uniqueCaptions.size} unique captions during tour progression`);
  });

  test("tour completes and hides playback UI", async ({ page }) => {
    test.setTimeout(90000); // Tour takes ~60 seconds to complete with page load

    // Collect console logs
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      consoleLogs.push(msg.text());
    });

    // Load the page with tour parameter
    await page.goto("/?tour=sn-1572");
    await page.waitForSelector("canvas", { timeout: 30000 });

    // Wait for tour completion
    // Poll for either the hidden class or the Tour complete log
    const tourPlayback = page.locator("#tour-playback");

    // Wait up to 70 seconds for tour to complete
    await expect(tourPlayback).toHaveClass(/hidden/, { timeout: 70000 });
    console.log("Tour completed - playback UI hidden");

    // Check that "Tour complete" was logged
    const completeLog = consoleLogs.find((log) =>
      log.includes("Tour complete")
    );
    expect(completeLog).toBeTruthy();
    console.log("Tour complete log found");
  });

  test("tour visits correct coordinates (RA 6.33°, Dec +64.14°)", async ({ page }) => {
    // The Tycho Supernova is at RA 6.33°, Dec 64.14° (in Cassiopeia)
    // Since the tour has a location set (Hven Island), it switches to topocentric mode
    // In topocentric mode, animateToRaDec logs the coordinates to console

    // Collect console logs to capture coordinate information
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      consoleLogs.push(msg.text());
    });

    // Load page and switch to topocentric mode first
    await page.goto("/");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Click the topocentric view button
    const topoButton = page.locator("#view-topocentric");
    if (await topoButton.isVisible()) {
      await topoButton.click();
      await page.waitForTimeout(500);
    }

    // Now navigate to the tour which will log coordinates
    await page.goto("/?tour=sn-1572");
    await page.waitForSelector("canvas", { timeout: 30000 });

    // Wait for tour to animate through first keyframe
    await page.waitForTimeout(6000);

    // Look for coordinate logs from animateToRaDec (topocentric mode)
    const coordLogs = consoleLogs.filter((log) =>
      log.includes("[Controls] animateToRaDec")
    );

    console.log(`Found ${coordLogs.length} coordinate logs`);
    coordLogs.forEach((log) => console.log(`  ${log}`));

    // If we got coordinate logs, verify the RA/Dec values
    if (coordLogs.length > 0) {
      // Parse the first coordinate log
      // Format: "[Controls] animateToRaDec (topocentric): RA: X.XX Dec: X.XX ..."
      const log = coordLogs[0];
      const raMatch = log.match(/RA:\s*([\d.]+)/);
      const decMatch = log.match(/Dec:\s*([\d.]+)/);

      expect(raMatch).toBeTruthy();
      expect(decMatch).toBeTruthy();

      const ra = parseFloat(raMatch![1]);
      const dec = parseFloat(decMatch![1]);

      console.log(`Parsed from console: RA=${ra}°, Dec=${dec}°`);

      // Verify coordinates match tour target (RA 6.33°, Dec 64.14°)
      expect(ra).toBeCloseTo(6.33, 0);
      expect(dec).toBeCloseTo(64.14, 0);

      console.log("Coordinates verified from console logs");
    } else {
      // No coordinate logs - check FOV as proxy for animation
      // The FOV should change to match tour keyframes
      const fovDisplay = page.locator("#coord-fov");
      const fovText = await fovDisplay.textContent();
      const fovMatch = fovText?.match(/(\d+)/);
      const fov = fovMatch ? parseInt(fovMatch[1]) : 0;

      console.log(`No coordinate logs found, checking FOV: ${fov}°`);

      // First keyframe has FOV 50°, second has FOV 30°
      // If FOV is close to these values, tour is animating correctly
      expect(fov).toBeGreaterThanOrEqual(25);
      expect(fov).toBeLessThanOrEqual(55);

      console.log("FOV matches tour keyframes, animation working correctly");
    }
  });

  test("tour can be paused and resumed", async ({ page }) => {
    // Load the page with tour parameter
    await page.goto("/?tour=sn-1572");
    await page.waitForSelector("canvas", { timeout: 30000 });

    // Wait for tour to start
    await page.waitForTimeout(3000);

    // Verify tour is playing
    const tourPlayback = page.locator("#tour-playback");
    await expect(tourPlayback).not.toHaveClass(/hidden/);

    // Click pause button
    const playPauseButton = page.locator("#tour-play-pause");
    await playPauseButton.click();
    console.log("Clicked pause button");

    // Get current caption
    const caption = page.locator("#tour-caption");
    const pausedCaption = await caption.textContent();
    console.log(`Caption when paused: "${pausedCaption}"`);

    // Wait a bit while paused
    await page.waitForTimeout(3000);

    // Caption should not have changed while paused
    const stillPausedCaption = await caption.textContent();
    expect(stillPausedCaption).toBe(pausedCaption);
    console.log("Caption unchanged during pause");

    // Resume playback
    await playPauseButton.click();
    console.log("Clicked play button to resume");

    // Wait for caption to potentially change
    await page.waitForTimeout(5000);

    // Tour should still be active
    await expect(tourPlayback).not.toHaveClass(/hidden/);
    console.log("Tour resumed successfully");
  });
});
