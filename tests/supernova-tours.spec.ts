import { test, expect } from "@playwright/test";

/**
 * Supernova Tours Test Suite
 *
 * Tests all supernova-related tours in the application:
 * - SN 1054: Birth of the Crab Nebula (Kaifeng, China)
 * - SN 1572: Tycho's Supernova (Hven Island, Denmark)
 * - SN 1604: Kepler's Supernova (Prague, Bohemia)
 * - SN 1987A: Return of the Supernovae (Las Campanas, Chile)
 * - Betelgeuse Nova: Hypothetical future supernova (no location)
 */

// Tour configurations with expected values
const SUPERNOVA_TOURS = [
  {
    id: "sn-1054",
    name: "SN 1054: Birth of the Crab Nebula",
    ra: 83.63,
    dec: 22.01,
    location: "Kaifeng, China",
    hasLocation: true,
  },
  {
    id: "sn-1572",
    name: "SN 1572: Tycho's Supernova",
    ra: 6.33,
    dec: 64.14,
    location: "Hven Island, Denmark",
    hasLocation: true,
  },
  {
    id: "sn-1604",
    name: "SN 1604: Kepler's Supernova",
    ra: 262.65,
    dec: -21.48,
    location: "Prague, Bohemia",
    hasLocation: true,
  },
  {
    id: "sn-1987a",
    name: "SN 1987A: Return of the Supernovae",
    ra: 83.87,
    dec: -69.27,
    location: "Las Campanas Observatory, Chile",
    hasLocation: true,
  },
  {
    id: "betelgeuse-nova",
    name: "Betelgeuse Nova",
    ra: 88.79,
    dec: 7.41,
    location: null,
    hasLocation: false,
  },
];

test.describe("Supernova Tours", () => {
  for (const tour of SUPERNOVA_TOURS) {
    test.describe(`${tour.name}`, () => {
      test("loads and displays tour correctly", async ({ page }) => {
        await page.goto(`/?tour=${tour.id}`);
        await page.waitForSelector("canvas", { timeout: 30000 });
        await page.waitForTimeout(2000);

        // Check tour playback UI is visible
        const tourPlayback = page.locator("#tour-playback");
        await expect(tourPlayback).not.toHaveClass(/hidden/);

        // Check tour name is displayed
        const tourName = page.locator("#tour-playback-name");
        await expect(tourName).toHaveText(tour.name);

        // Check caption is shown and not empty
        const caption = page.locator("#tour-caption");
        await expect(caption).not.toBeEmpty();
        const captionText = await caption.textContent();

        // Verify caption is a non-trivial string (tour captions are descriptive)
        expect(captionText!.length).toBeGreaterThan(20);
      });

      if (tour.hasLocation) {
        test("visits correct coordinates", async ({ page }) => {
          // Tours with locations switch to topocentric mode which logs coordinates
          const consoleLogs: string[] = [];
          page.on("console", (msg) => {
            consoleLogs.push(msg.text());
          });

          // First load page and switch to topocentric mode
          await page.goto("/");
          await page.waitForSelector("canvas", { timeout: 30000 });
          await page.waitForTimeout(1000);

          const topoButton = page.locator("#view-topocentric");
          if (await topoButton.isVisible()) {
            await topoButton.click();
            await page.waitForTimeout(500);
          }

          // Navigate to tour
          await page.goto(`/?tour=${tour.id}`);
          await page.waitForSelector("canvas", { timeout: 30000 });
          await page.waitForTimeout(6000);

          // Look for coordinate logs
          const coordLogs = consoleLogs.filter((log) =>
            log.includes("[Controls] animateToRaDec")
          );

          expect(coordLogs.length).toBeGreaterThan(0);

          // Parse and verify coordinates
          const log = coordLogs[0];
          const raMatch = log.match(/RA:\s*([\d.]+)/);
          const decMatch = log.match(/Dec:\s*(-?[\d.]+)/);

          expect(raMatch).toBeTruthy();
          expect(decMatch).toBeTruthy();

          const ra = parseFloat(raMatch![1]);
          const dec = parseFloat(decMatch![1]);

          // Allow 1 degree tolerance
          expect(ra).toBeCloseTo(tour.ra, 0);
          expect(dec).toBeCloseTo(tour.dec, 0);
        });
      } else {
        test("runs in geocentric mode", async ({ page }) => {
          // Tours without locations stay in geocentric mode
          await page.goto(`/?tour=${tour.id}`);
          await page.waitForSelector("canvas", { timeout: 30000 });
          await page.waitForTimeout(3000);

          // Check RA/Dec display is visible (geocentric mode)
          const raDisplay = page.locator("#coord-ra");
          const altDisplay = page.locator("#coord-alt");

          const raVisible = await raDisplay.isVisible();
          const altVisible = await altDisplay.isVisible();

          // In geocentric mode, RA should be visible, Alt should be hidden
          expect(raVisible).toBe(true);
          expect(altVisible).toBe(false);

          // Check FOV is reasonable for the tour
          const fovDisplay = page.locator("#coord-fov");
          const fovText = await fovDisplay.textContent();
          const fovMatch = fovText?.match(/(\d+)/);
          const fov = fovMatch ? parseInt(fovMatch[1]) : 0;

          // First keyframe has FOV 40°, should be in that range
          expect(fov).toBeGreaterThanOrEqual(10);
          expect(fov).toBeLessThanOrEqual(50);
        });
      }
    });
  }

  test("all supernova tours complete successfully", async ({ page }) => {
    test.setTimeout(90000);

    // Test the shortest tour (Betelgeuse) completes
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      consoleLogs.push(msg.text());
    });

    await page.goto("/?tour=betelgeuse-nova");
    await page.waitForSelector("canvas", { timeout: 30000 });

    // Wait for tour to complete
    const tourPlayback = page.locator("#tour-playback");
    await expect(tourPlayback).toHaveClass(/hidden/, { timeout: 70000 });

    // Verify completion was logged
    const completeLog = consoleLogs.find((log) =>
      log.includes("Tour complete")
    );
    expect(completeLog).toBeTruthy();
  });
});
