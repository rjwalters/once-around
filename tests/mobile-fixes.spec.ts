/**
 * Tests for mobile-specific fixes:
 * 1. Loading screen stays visible until GPU is ready
 * 2. Tour captions are visible on mobile screens
 */
import { test, expect, devices } from "@playwright/test";

test.describe("Mobile fixes", () => {
  test("loading screen uses fade transition before removal", async ({
    browser,
  }) => {
    test.setTimeout(60000);
    const context = await browser.newContext({
      ...devices["Pixel 5"],
    });
    const page = await context.newPage();

    // Inject a MutationObserver to detect when "hidden" class is added
    // before the element is removed from the DOM
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).__loadingFadeDetected = false;
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "attributes" && mutation.attributeName === "class") {
            const el = mutation.target as HTMLElement;
            if (el.id === "loading" && el.classList.contains("hidden")) {
              (window as unknown as Record<string, unknown>).__loadingFadeDetected = true;
            }
          }
        }
      });
      // Observe the entire document for the loading element's class changes
      document.addEventListener("DOMContentLoaded", () => {
        const loading = document.getElementById("loading");
        if (loading) {
          observer.observe(loading, { attributes: true });
        }
      });
    });

    await page.goto("/");

    // Wait for loading overlay to be removed from DOM
    const loadingOverlay = page.locator("#loading");
    await expect(loadingOverlay).toHaveCount(0, { timeout: 45000 });

    // Check that the hidden class was added before removal (fade transition)
    const fadeDetected = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__loadingFadeDetected
    );
    expect(fadeDetected).toBe(true);
    console.log("Loading screen used fade transition before removal");

    await context.close();
  });

  test("tour captions are visible on mobile during Pale Blue Dot tour", async ({
    browser,
  }) => {
    test.setTimeout(60000);
    const context = await browser.newContext({
      ...devices["Pixel 5"],
    });
    const page = await context.newPage();

    // Collect console output for debugging
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.log(`PAGE CONSOLE ERROR: ${msg.text()}`);
      }
    });
    page.on("pageerror", (err) => {
      console.log(`PAGE ERROR: ${err.message}`);
    });

    // Load page with Pale Blue Dot tour
    await page.goto("/?tour=pale-blue-dot");

    // Wait for loading overlay to disappear (app is ready)
    const loadingOverlay = page.locator("#loading");
    await expect(loadingOverlay).toHaveCount(0, { timeout: 45000 });

    // Wait for tour to start playing
    await page.waitForTimeout(3000);

    // Tour playback bar should be visible
    const tourPlayback = page.locator("#tour-playback");
    await expect(tourPlayback).toBeVisible({ timeout: 10000 });

    // Caption should be visible and non-empty
    const caption = page.locator("#tour-caption");
    await expect(caption).toBeVisible();
    await expect(caption).not.toBeEmpty();

    const captionText = await caption.textContent();
    console.log(`Caption text: "${captionText}"`);

    // Verify caption has adequate font size on mobile (should be 15px)
    const fontSize = await caption.evaluate(
      (el) => window.getComputedStyle(el).fontSize
    );
    const fontSizePx = parseFloat(fontSize);
    expect(fontSizePx).toBeGreaterThanOrEqual(14);
    console.log(`Caption font size: ${fontSize}`);

    // Verify caption has adequate contrast (should be #ddd = rgb(221,221,221))
    const color = await caption.evaluate(
      (el) => window.getComputedStyle(el).color
    );
    console.log(`Caption color: ${color}`);
    const rgbMatch = color.match(/(\d+)/g);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[0]);
      const g = parseInt(rgbMatch[1]);
      const b = parseInt(rgbMatch[2]);
      // All channels should be >= 200 for light readable text
      expect(r).toBeGreaterThanOrEqual(200);
      expect(g).toBeGreaterThanOrEqual(200);
      expect(b).toBeGreaterThanOrEqual(200);
    }

    // Verify the caption is within the viewport (not clipped off-screen)
    const captionBox = await caption.boundingBox();
    const viewportSize = page.viewportSize();
    expect(captionBox).toBeTruthy();
    expect(viewportSize).toBeTruthy();
    if (captionBox && viewportSize) {
      expect(captionBox.y).toBeGreaterThanOrEqual(0);
      expect(captionBox.y + captionBox.height).toBeLessThanOrEqual(
        viewportSize.height
      );
      console.log(
        `Caption position: y=${Math.round(captionBox.y)}, height=${Math.round(captionBox.height)}, viewport=${viewportSize.height}`
      );
    }

    // Take a screenshot for visual verification
    await page.screenshot({
      path: "tests/screenshots/mobile-tour-caption.png",
    });
    console.log("Screenshot saved to tests/screenshots/mobile-tour-caption.png");

    await context.close();
  });

  test("tour playback bar is properly positioned on mobile", async ({
    browser,
  }) => {
    test.setTimeout(60000);
    const context = await browser.newContext({
      ...devices["Pixel 5"],
    });
    const page = await context.newPage();

    await page.goto("/?tour=pale-blue-dot");

    // Wait for loading overlay to disappear
    await expect(page.locator("#loading")).toHaveCount(0, { timeout: 45000 });
    await page.waitForTimeout(3000);

    // Check the computed bottom position
    const tourPlayback = page.locator("#tour-playback");
    await expect(tourPlayback).toBeVisible({ timeout: 10000 });

    const bottom = await tourPlayback.evaluate(
      (el) => window.getComputedStyle(el).bottom
    );
    console.log(`Tour playback bottom: ${bottom}`);

    // On mobile, bottom should be 20px (reduced from desktop 60px)
    const bottomPx = parseFloat(bottom);
    expect(bottomPx).toBeLessThanOrEqual(30);

    await context.close();
  });
});
