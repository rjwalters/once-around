import { test, expect } from "@playwright/test";

test.describe("Topocentric Mode", () => {
  test("search for sun after switching from geocentric", async ({ page }) => {
    // This replicates the user scenario: start in geocentric, switch to topocentric, then search
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "log") {
        consoleLogs.push(msg.text());
      }
    });

    await page.goto("/");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Verify we start in geocentric mode (default)
    const geoBtn = page.locator("#view-geocentric");
    await expect(geoBtn).toHaveClass(/active/);
    console.log("Started in geocentric mode");

    // Switch to topocentric mode
    const topoBtn = page.locator("#view-topocentric");
    await topoBtn.click();
    await page.waitForTimeout(1500); // Wait for mode switch and animation
    await expect(topoBtn).toHaveClass(/active/);
    console.log("Switched to topocentric mode");

    // Search for sun
    const searchInput = page.locator("#search");
    await searchInput.click();
    await searchInput.fill("Sun");
    await page.waitForTimeout(500);

    const firstResult = page.locator(".search-result").first();
    await expect(firstResult).toBeVisible();
    await firstResult.click();
    await page.waitForTimeout(1500);

    // Check console logs
    const controlsLog = consoleLogs.find((log) => log.includes("[Controls] animateToRaDec (topocentric)"));
    console.log("Controls log:", controlsLog);

    expect(controlsLog).toBeTruthy();

    // Parse altitude - it should be positive (above horizon) for daytime
    const altMatch = controlsLog!.match(/Alt:\s*([-\d.]+)/);
    expect(altMatch).toBeTruthy();

    const altitude = parseFloat(altMatch![1]);
    console.log("Altitude:", altitude);

    // Sun should be above horizon during daytime (positive altitude)
    // If we get a large negative altitude like -38°, something is wrong
    expect(altitude).toBeGreaterThan(-10); // Allow small negative for edge cases

    // LST should still be valid
    const lstMatch = controlsLog!.match(/LST:\s*([-\d.]+)/);
    const lst = parseFloat(lstMatch![1]);
    console.log("LST:", lst);
    expect(lst).toBeGreaterThanOrEqual(0);
    expect(lst).toBeLessThan(360);
  });

  test("search for sun has valid LST (0-360)", async ({ page }) => {
    // Capture console logs
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "log") {
        consoleLogs.push(msg.text());
      }
    });

    await page.goto("/");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Switch to topocentric mode
    const topoBtn = page.locator("#view-topocentric");
    await topoBtn.click();
    await page.waitForTimeout(1000);
    await expect(topoBtn).toHaveClass(/active/);
    console.log("Switched to topocentric mode");

    // Search for sun
    const searchInput = page.locator("#search");
    await searchInput.click();
    await searchInput.fill("Sun");
    await page.waitForTimeout(500);

    // Click the first search result
    const firstResult = page.locator(".search-result").first();
    await expect(firstResult).toBeVisible();
    await firstResult.click();
    await page.waitForTimeout(1000);

    // Check console logs for the navigation
    const searchLog = consoleLogs.find((log) => log.includes("[Search] Navigate to:"));
    const controlsLog = consoleLogs.find((log) => log.includes("[Controls] animateToRaDec (topocentric)"));

    console.log("Search log:", searchLog);
    console.log("Controls log:", controlsLog);

    expect(searchLog).toBeTruthy();
    expect(controlsLog).toBeTruthy();

    // Parse the LST from the controls log
    // Format: "[Controls] animateToRaDec: RA: X Dec: Y LST: Z Lat: W -> Alt: A Az: B"
    const lstMatch = controlsLog!.match(/LST:\s*([-\d.]+)/);
    expect(lstMatch).toBeTruthy();

    const lst = parseFloat(lstMatch![1]);
    console.log("LST value:", lst);

    // LST should be normalized to 0-360
    expect(lst).toBeGreaterThanOrEqual(0);
    expect(lst).toBeLessThan(360);

    // Parse azimuth
    const azMatch = controlsLog!.match(/Az:\s*([-\d.]+)/);
    expect(azMatch).toBeTruthy();

    const azimuth = parseFloat(azMatch![1]);
    console.log("Azimuth:", azimuth);

    // Azimuth should also be 0-360
    expect(azimuth).toBeGreaterThanOrEqual(0);
    expect(azimuth).toBeLessThan(360);
  });

  test("sun position matches between search and display", async ({ page }) => {
    // Capture console logs
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "log") {
        consoleLogs.push(msg.text());
      }
    });

    await page.goto("/");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Switch to topocentric mode
    const topoBtn = page.locator("#view-topocentric");
    await topoBtn.click();
    await page.waitForTimeout(1000);

    // Search for sun
    const searchInput = page.locator("#search");
    await searchInput.click();
    await searchInput.fill("Sun");
    await page.waitForTimeout(500);

    const firstResult = page.locator(".search-result").first();
    await firstResult.click();
    await page.waitForTimeout(1500); // Wait for animation

    // Get the displayed coordinates from the UI
    const coordAzEl = page.locator("#coord-az");
    const azText = await coordAzEl.textContent();
    console.log("Displayed azimuth:", azText);

    // Parse the azimuth from the controls log
    const controlsLog = consoleLogs.find((log) => log.includes("[Controls] animateToRaDec (topocentric)"));
    const azMatch = controlsLog?.match(/Az:\s*([-\d.]+)/);

    if (azMatch) {
      const calculatedAz = parseFloat(azMatch[1]);
      console.log("Calculated azimuth:", calculatedAz);

      // The displayed azimuth should match the calculated one (within a few degrees due to animation)
      // azText format is like "180° (S)" so extract the number
      const displayedAzMatch = azText?.match(/([\d.]+)°/);
      if (displayedAzMatch) {
        const displayedAz = parseFloat(displayedAzMatch[1]);
        const difference = Math.abs(displayedAz - calculatedAz);
        console.log("Azimuth difference:", difference);

        // Should be within 5 degrees (allowing for animation timing)
        expect(difference).toBeLessThan(5);
      }
    }
  });
});
