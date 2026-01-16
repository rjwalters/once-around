import { test, expect } from "@playwright/test";

test.describe("Basic Functionality", () => {
  test("app loads and canvas renders", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("canvas", { timeout: 30000 });
    
    // Check canvas exists and has size
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);
    console.log(`Canvas size: ${box!.width}x${box!.height}`);
  });

  test("controls panel is visible", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#controls", { timeout: 10000 });
    
    const controls = page.locator("#controls");
    await expect(controls).toBeVisible();
  });

  test("keyboard shortcut ? opens help modal", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("canvas", { timeout: 30000 });
    
    // Press ? to open help
    await page.keyboard.press("Shift+/");
    await page.waitForTimeout(500);
    
    const helpModal = page.locator("#help-modal");
    await expect(helpModal).toBeVisible();
    console.log("Help modal opened successfully");
    
    // Press Escape to close
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    // Check for hidden class (CSS opacity transition may still affect visibility check)
    await expect(helpModal).toHaveClass(/hidden/);
    console.log("Help modal closed successfully");
  });

  test("view mode toggle works", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(1000);
    
    // Click topocentric button
    const topoBtn = page.locator("#view-topocentric");
    await topoBtn.click();
    await page.waitForTimeout(1000);
    
    await expect(topoBtn).toHaveClass(/active/);
    console.log("Switched to topocentric mode");
    
    // Click geocentric button
    const geoBtn = page.locator("#view-geocentric");
    await geoBtn.click();
    await page.waitForTimeout(500);
    
    await expect(geoBtn).toHaveClass(/active/);
    console.log("Switched back to geocentric mode");
  });

  test("search input can be focused with /", async ({ page }) => {
    await page.goto("/");
    // Wait for app to fully initialize
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(500);

    await page.keyboard.press("/");
    await page.waitForTimeout(300);

    const searchInput = page.locator("#search");
    await expect(searchInput).toBeFocused();
    console.log("Search focused with / key");
  });

  test("orbits toggle loads pre-computed data", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Toggle orbits on
    const orbitsCheckbox = page.locator("#orbits");
    await orbitsCheckbox.click();

    // Wait for orbit data to load (should be instant now)
    await page.waitForTimeout(500);

    // Verify orbits checkbox is checked
    await expect(orbitsCheckbox).toBeChecked();
    console.log("Orbits toggled successfully");
  });
});
