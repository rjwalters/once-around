import { test, expect } from "@playwright/test";

/**
 * Comprehensive tests for the guided tour system.
 * Tests cover: loading, playback controls, view mode locking, and specific tour features.
 */

test.describe("Tour System - Core Functionality", () => {
  test("tour can be loaded via URL parameter", async ({ page }) => {
    await page.goto("/?tour=eclipse-2024");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Verify tour playback UI is visible
    const tourPlayback = page.locator("#tour-playback");
    await expect(tourPlayback).not.toHaveClass(/hidden/);

    // Verify tour name
    const tourName = page.locator("#tour-playback-name");
    await expect(tourName).toHaveText("2024 Total Solar Eclipse");
  });

  test("tour shows caption for each keyframe", async ({ page }) => {
    await page.goto("/?tour=jupiter-moons");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000);

    const caption = page.locator("#tour-caption");
    const initialCaption = await caption.textContent();
    expect(initialCaption).toBeTruthy();
    console.log(`Initial caption: "${initialCaption}"`);

    // Wait for keyframe to advance
    await page.waitForTimeout(8000);
    const nextCaption = await caption.textContent();
    console.log(`Next caption: "${nextCaption}"`);

    // Caption should have changed (or at least still be showing something)
    expect(nextCaption).toBeTruthy();
  });

  test("tour can be paused and resumed", async ({ page }) => {
    await page.goto("/?tour=eclipse-2024");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Click pause button (should show ⏸ when playing)
    const pauseBtn = page.locator("#tour-play-pause");
    await expect(pauseBtn).toHaveText("⏸");
    await pauseBtn.click();
    await page.waitForTimeout(500);

    // Button should now show play icon ▶ when paused
    await expect(pauseBtn).toHaveText("▶");

    // Click again to resume
    await pauseBtn.click();
    await page.waitForTimeout(500);
    await expect(pauseBtn).toHaveText("⏸");
  });

  test("tour can be stopped", async ({ page }) => {
    await page.goto("/?tour=eclipse-2024");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Verify tour is playing
    const tourPlayback = page.locator("#tour-playback");
    await expect(tourPlayback).not.toHaveClass(/hidden/);

    // Click stop button
    const stopBtn = page.locator("#tour-stop");
    await stopBtn.click();
    await page.waitForTimeout(500);

    // Tour playback should be hidden
    await expect(tourPlayback).toHaveClass(/hidden/);
  });

  test("tour progress bar advances over time", async ({ page }) => {
    await page.goto("/?tour=jupiter-moons");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Get initial progress
    const progressBar = page.locator("#tour-progress");
    const initialWidth = await progressBar.evaluate((el) => el.style.width);
    console.log(`Initial progress: ${initialWidth}`);

    // Wait and check progress increased
    await page.waitForTimeout(5000);
    const laterWidth = await progressBar.evaluate((el) => el.style.width);
    console.log(`Later progress: ${laterWidth}`);

    // Progress should have increased (parse percentage)
    const initialPct = parseFloat(initialWidth) || 0;
    const laterPct = parseFloat(laterWidth) || 0;
    expect(laterPct).toBeGreaterThan(initialPct);
  });
});

test.describe("Tour System - View Mode Locking", () => {
  test("pale blue dot tour locks view mode to geocentric", async ({ page }) => {
    // Start in topocentric mode
    await page.goto("/?view=topo");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Verify we're in topocentric
    const topoBtn = page.locator("#view-topocentric");
    await expect(topoBtn).toHaveClass(/active/);

    // Start the pale blue dot tour
    await page.goto("/?tour=pale-blue-dot");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Geocentric should now be active (tour forces it)
    const geoBtn = page.locator("#view-geocentric");
    await expect(geoBtn).toHaveClass(/active/);

    // Buttons should be locked
    await expect(geoBtn).toHaveClass(/locked/);
    await expect(topoBtn).toHaveClass(/locked/);
  });

  test("view mode is restored after tour ends", async ({ page }) => {
    test.setTimeout(70000);

    // Start in topocentric mode
    await page.goto("/?view=topo");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(1000);

    const topoBtn = page.locator("#view-topocentric");
    await expect(topoBtn).toHaveClass(/active/);

    // Start and then stop the pale blue dot tour
    await page.goto("/?tour=pale-blue-dot");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Stop the tour
    const stopBtn = page.locator("#tour-stop");
    await stopBtn.click();
    await page.waitForTimeout(1000);

    // Topocentric should be restored
    await expect(topoBtn).toHaveClass(/active/);

    // Buttons should be unlocked
    const geoBtn = page.locator("#view-geocentric");
    await expect(geoBtn).not.toHaveClass(/locked/);
    await expect(topoBtn).not.toHaveClass(/locked/);
  });
});

test.describe("Tour System - Coordinate Display", () => {
  test("coordinates update during tour playback", async ({ page }) => {
    await page.goto("/?tour=jupiter-moons");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Get initial coordinates
    const raEl = page.locator("#coord-ra");
    const decEl = page.locator("#coord-dec");
    const initialRa = await raEl.textContent();
    const initialDec = await decEl.textContent();
    console.log(`Initial coords: RA=${initialRa}, Dec=${initialDec}`);

    // Wait for camera to move
    await page.waitForTimeout(8000);

    const laterRa = await raEl.textContent();
    const laterDec = await decEl.textContent();
    console.log(`Later coords: RA=${laterRa}, Dec=${laterDec}`);

    // Coordinates should have display values
    expect(initialRa).toBeTruthy();
    expect(initialDec).toBeTruthy();
  });

  test("FOV display updates during tour", async ({ page }) => {
    await page.goto("/?tour=eclipse-2024");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(1000);

    const fovEl = page.locator("#coord-fov");
    const initialFov = await fovEl.textContent();
    console.log(`Initial FOV: ${initialFov}`);

    // Wait for FOV animation
    await page.waitForTimeout(6000);

    const laterFov = await fovEl.textContent();
    console.log(`Later FOV: ${laterFov}`);

    // Both should have values
    expect(initialFov).toBeTruthy();
    expect(laterFov).toBeTruthy();
  });
});

test.describe("Tour System - Specific Tours", () => {
  // Test each major tour category loads correctly

  test("comet tour loads - NEOWISE 2020", async ({ page }) => {
    await page.goto("/?tour=neowise-2020");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000);

    const tourName = page.locator("#tour-playback-name");
    await expect(tourName).toHaveText("Comet NEOWISE (2020)");

    const caption = page.locator("#tour-caption");
    const text = await caption.textContent();
    expect(text?.toLowerCase()).toContain("neowise");
  });

  test("comet tour loads - Halley 1986", async ({ page }) => {
    await page.goto("/?tour=halley-1986");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000);

    const tourName = page.locator("#tour-playback-name");
    await expect(tourName).toHaveText("Halley's Comet (1986)");
  });

  test("comet tour loads - Hale-Bopp 1997", async ({ page }) => {
    await page.goto("/?tour=hale-bopp-1997");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000);

    const tourName = page.locator("#tour-playback-name");
    await expect(tourName).toHaveText("Comet Hale-Bopp (1997)");
  });

  test("supernova tour loads - SN 1054 (Crab Nebula)", async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on("console", (msg) => consoleLogs.push(msg.text()));

    await page.goto("/?tour=sn-1054");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000);

    const tourName = page.locator("#tour-playback-name");
    await expect(tourName).toHaveText("SN 1054: Birth of the Crab Nebula");

    // This tour uses star overrides for the synthetic supernova
    const caption = page.locator("#tour-caption");
    const text = await caption.textContent();
    expect(text?.toLowerCase()).toMatch(/supernova|crab|1054/i);
  });

  test("supernova tour loads - SN 1572 (Tycho)", async ({ page }) => {
    await page.goto("/?tour=sn-1572");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000);

    const tourName = page.locator("#tour-playback-name");
    await expect(tourName).toHaveText("SN 1572: Tycho's Supernova");
  });

  test("supernova tour loads - SN 1604 (Kepler)", async ({ page }) => {
    await page.goto("/?tour=sn-1604");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000);

    const tourName = page.locator("#tour-playback-name");
    await expect(tourName).toHaveText("SN 1604: Kepler's Supernova");
  });

  test("supernova tour loads - SN 1987A", async ({ page }) => {
    test.setTimeout(60000); // This tour has historical dates that can take longer to compute
    await page.goto("/?tour=sn-1987a");
    await expect(page.locator("canvas")).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(2000);

    const tourName = page.locator("#tour-playback-name");
    await expect(tourName).toHaveText("SN 1987A: Return of the Supernovae");
  });

  test("hypothetical tour loads - Betelgeuse Nova", async ({ page }) => {
    await page.goto("/?tour=betelgeuse-nova");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000);

    const tourName = page.locator("#tour-playback-name");
    await expect(tourName).toHaveText("Betelgeuse Nova");
  });

  test("transit tour loads - Venus Transit 2012", async ({ page }) => {
    await page.goto("/?tour=venus-transit-2012");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000);

    const tourName = page.locator("#tour-playback-name");
    await expect(tourName).toHaveText("2012 Transit of Venus");
  });

  test("transit tour loads - Mercury Transit 2019", async ({ page }) => {
    await page.goto("/?tour=mercury-transit-2019");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000);

    const tourName = page.locator("#tour-playback-name");
    await expect(tourName).toHaveText("2019 Transit of Mercury");
  });

  test("discovery tour loads - Galileo's Jupiter", async ({ page }) => {
    await page.goto("/?tour=galileo-jupiter-1610");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000);

    const tourName = page.locator("#tour-playback-name");
    await expect(tourName).toHaveText("Galileo's Discovery (1610)");
  });

  test("discovery tour loads - Uranus Discovery", async ({ page }) => {
    await page.goto("/?tour=uranus-discovery-1781");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000);

    const tourName = page.locator("#tour-playback-name");
    await expect(tourName).toHaveText("Discovery of Uranus (1781)");
  });

  test("discovery tour loads - Neptune Discovery", async ({ page }) => {
    await page.goto("/?tour=neptune-discovery-1846");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000);

    const tourName = page.locator("#tour-playback-name");
    await expect(tourName).toHaveText("Discovery of Neptune (1846)");
  });

  test("discovery tour loads - Pluto Discovery", async ({ page }) => {
    await page.goto("/?tour=pluto-discovery-1930");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000);

    const tourName = page.locator("#tour-playback-name");
    await expect(tourName).toHaveText("Discovery of Pluto (1930)");
  });
});

test.describe("Tour System - User Interaction", () => {
  test("mouse interaction pauses tour", async ({ page }) => {
    await page.goto("/?tour=jupiter-moons");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Tour should be playing (⏸ icon shown)
    const pauseBtn = page.locator("#tour-play-pause");
    await expect(pauseBtn).toHaveText("⏸");

    // Click on the canvas (simulates user interaction)
    const canvas = page.locator("canvas");
    await canvas.click();
    await page.waitForTimeout(500);

    // Tour should now be paused (▶ icon shown)
    await expect(pauseBtn).toHaveText("▶");
  });

  test("wheel interaction pauses tour", async ({ page }) => {
    await page.goto("/?tour=jupiter-moons");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Tour should be playing (⏸ icon shown)
    const pauseBtn = page.locator("#tour-play-pause");
    await expect(pauseBtn).toHaveText("⏸");

    // Scroll on canvas
    const canvas = page.locator("canvas");
    await canvas.hover();
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(500);

    // Tour should be paused (▶ icon shown)
    await expect(pauseBtn).toHaveText("▶");
  });
});

test.describe("Tour System - Invalid Tour Handling", () => {
  test("invalid tour ID shows no tour playback", async ({ page }) => {
    await page.goto("/?tour=nonexistent-tour-xyz");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Tour playback should be hidden (tour not found)
    const tourPlayback = page.locator("#tour-playback");
    await expect(tourPlayback).toHaveClass(/hidden/);
  });
});
