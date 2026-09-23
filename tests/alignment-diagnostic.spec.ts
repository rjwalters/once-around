import { test, expect, type Page } from "@playwright/test";

declare global {
  interface Window {
    diagnosticMock: {
      cameraCalls: number;
      stoppedTracks: number;
      clearedWatches: number;
      permissionCalls: boolean[];
      permissionActive: boolean[];
      copied: string;
      gps: (age?: number, accuracy?: number, latitude?: number) => void;
      gpsError: (code: number) => void;
      orientation: (absolute?: boolean) => void;
      resolveCamera: () => void;
      resolvePermission: (permission: string) => void;
    };
  }
}

async function mockDevices(
  page: Page,
  options: {
    deniedCamera?: boolean;
    delayedCamera?: boolean;
    delayedPermission?: boolean;
    deniedMotion?: boolean;
  } = {},
) {
  await page.clock.install({ time: new Date("2026-01-01T02:00:00Z") });
  await page.addInitScript((options) => {
    let gpsSuccess: PositionCallback;
    let gpsFailure: PositionErrorCallback;
    const mock = (window.diagnosticMock = {
      cameraCalls: 0,
      stoppedTracks: 0,
      clearedWatches: 0,
      permissionCalls: [] as boolean[],
      permissionActive: [] as boolean[],
      copied: "",
      gps: (age = 0, accuracy = 8, latitude = 37.7749) =>
        gpsSuccess({
          coords: { latitude, longitude: -122.4194, accuracy },
          timestamp: Date.now() - age,
        } as GeolocationPosition),
      gpsError: (code: number) =>
        gpsFailure({ code } as GeolocationPositionError),
      orientation: (absolute = true) =>
        window.dispatchEvent(
          new DeviceOrientationEvent("deviceorientationabsolute", {
            alpha: 225,
            beta: 130,
            gamma: 0,
            absolute,
          }),
        ),
      resolveCamera: () => {},
      resolvePermission: (_permission: string) => {},
    });
    Object.defineProperty(DeviceOrientationEvent, "requestPermission", {
      value: (absolute: boolean) => {
        mock.permissionCalls.push(absolute);
        mock.permissionActive.push(navigator.userActivation.isActive);
        return options.delayedPermission
          ? new Promise<string>((resolve) => {
              mock.resolvePermission = resolve;
            })
          : Promise.resolve(options.deniedMotion ? "denied" : "granted");
      },
    });
    Object.defineProperty(navigator, "geolocation", {
      value: {
        watchPosition: (
          success: PositionCallback,
          failure: PositionErrorCallback,
        ) => {
          gpsSuccess = success;
          gpsFailure = failure;
          return 7;
        },
        clearWatch: () => {
          mock.clearedWatches++;
        },
      },
    });
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (value: string) => {
          mock.copied = value;
        },
      },
    });
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: async (constraints: MediaStreamConstraints) => {
          mock.cameraCalls++;
          if (
            JSON.stringify(constraints) !==
            JSON.stringify({
              audio: false,
              video: { facingMode: { exact: "environment" } },
            })
          )
            throw new Error("Expected rear camera only");
          if (options.deniedCamera)
            throw new DOMException("denied", "NotAllowedError");
          if (options.delayedCamera)
            await new Promise<void>((resolve) => {
              mock.resolveCamera = resolve;
            });
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 480;
          canvas.getContext("2d")!.fillRect(0, 0, 640, 480);
          const stream = canvas.captureStream(10);
          for (const track of stream.getTracks()) {
            const stop = track.stop.bind(track);
            track.stop = () => {
              mock.stoppedTracks++;
              stop();
            };
            track.getSettings = () => ({ facingMode: "environment" });
          }
          return stream;
        },
      },
    });
  }, options);
  await page.goto("/test.html");
  await expect(page.locator("#target-status")).toContainText(
    "waiting for current GPS",
  );
}

async function start(page: Page) {
  await page.locator("#start").click();
  await page.evaluate(() => {
    window.diagnosticMock.gps();
    window.diagnosticMock.orientation();
  });
  await expect(page.locator("#camera-status")).toContainText("live");
  await expect(page.locator("#capture")).toBeEnabled();
}

test("Moon capture retains metadata, bounded history and explicit coordinate export", async ({
  page,
}) => {
  await mockDevices(page);
  expect(await page.evaluate(() => window.diagnosticMock.cameraCalls)).toBe(0);
  await expect(page.locator("#target-moon")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await start(page);
  expect(
    await page.evaluate(() => window.diagnosticMock.permissionCalls),
  ).toEqual([true]);
  expect(
    await page.evaluate(() => window.diagnosticMock.permissionActive),
  ).toEqual([true]);
  for (let index = 0; index < 11; index++) {
    await page.evaluate(() => window.diagnosticMock.orientation());
    await page.locator("#capture").click();
  }
  await expect(page.locator("#history li")).toHaveCount(10);
  await expect(page.locator("#history li").first()).toContainText(
    "Compass accuracy unknown",
  );
  await page.locator("#copy").click();
  const report = await page.evaluate(() =>
    JSON.parse(window.diagnosticMock.copied),
  );
  expect(report.coordinatesIncluded).toBe(false);
  expect(report.captures[0].gps.latitude).toBeUndefined();
  expect(report.captures[0].gps.longitude).toBeUndefined();
  expect(report.captures[0].target).toBe("Moon");
  expect(report.captures[0].expected.altitude).toBeGreaterThan(0);
  expect(report.captures[0].utc).toMatch(/^2026-01-01T02:00:/);
  expect(report.captures[0].orientation.headingReference).toBe("absolute");
  expect(report.captures[0].orientation.compassAccuracy).toBeNull();
  expect(report.captures[0].rawMeasured.azimuth).toBeCloseTo(135);
  expect(report.captures[0].errors.greatCircle).toBeGreaterThanOrEqual(0);
  await page.locator("#include-coordinates").check();
  await page.locator("#copy").click();
  expect(
    await page.evaluate(
      () => JSON.parse(window.diagnosticMock.copied).captures[0].gps.latitude,
    ),
  ).toBe(37.7749);
  const downloadEvent = page.waitForEvent("download");
  await page.locator("#download").click();
  expect((await downloadEvent).suggestedFilename()).toBe(
    "once-around-alignment.json",
  );
  await page.locator("#stop").click();
  expect(
    await page.evaluate(() => [
      window.diagnosticMock.stoppedTracks,
      window.diagnosticMock.clearedWatches,
    ]),
  ).toEqual([1, 1]);
});

test("relative readings, stale motion/GPS, inaccurate GPS and below-horizon targets cannot capture", async ({
  page,
}) => {
  await mockDevices(page);
  await page.locator("#start").click();
  await page.evaluate(() => {
    window.diagnosticMock.gps();
    window.diagnosticMock.orientation(false);
  });
  await expect(page.locator("#camera-status")).toContainText("live");
  await expect(page.locator("#capture")).toBeDisabled();
  await page.evaluate(() => window.diagnosticMock.orientation());
  await expect(page.locator("#capture")).toBeEnabled();
  await page.clock.fastForward(3100);
  await expect(page.locator("#capture")).toBeDisabled();
  await expect(page.locator("#orientation-status")).toContainText(
    "Move the phone slightly",
  );
  await page.evaluate(() => {
    window.diagnosticMock.orientation();
    window.diagnosticMock.gps(31000);
  });
  await expect(page.locator("#gps-status")).toContainText("stale");
  await expect(page.locator("#capture")).toBeDisabled();
  await page.evaluate(() => window.diagnosticMock.gps(0, 101));
  await expect(page.locator("#gps-status")).toContainText(
    "accuracy is too low",
  );
  await page.evaluate(() => {
    window.diagnosticMock.gps();
    window.diagnosticMock.orientation();
  });
  await expect(page.locator("#capture")).toBeEnabled();
  await page.locator("#target-sun").click();
  await expect(page.locator("#sun-instruction")).toBeVisible();
  await expect(page.locator("#status")).toContainText(
    "Sun is below the horizon",
  );
  await expect(page.locator("#capture")).toBeDisabled();
  await page.locator("#target-moon").click();
  await expect(page.locator("#capture")).toBeEnabled();
  await page.evaluate(() => window.diagnosticMock.gpsError(1));
  await expect(page.locator("#gps-status")).toContainText("permission denied");
  await expect(page.locator("#capture")).toBeDisabled();
});

test("denied camera is explicit and prevents capture", async ({ page }) => {
  await mockDevices(page, { deniedCamera: true });
  await page.locator("#start").click();
  await expect(page.locator("#camera-status")).toContainText(
    "permission denied",
  );
  await expect(page.locator("#capture")).toBeDisabled();
  await page.locator("#stop").click();
});

test("pagehide releases late camera and cancels late sensor/GPS callbacks", async ({
  page,
}) => {
  await mockDevices(page, { delayedCamera: true, delayedPermission: true });
  await page.locator("#start").click();
  await page.evaluate(() => {
    window.dispatchEvent(new Event("pagehide"));
    window.diagnosticMock.resolveCamera();
    window.diagnosticMock.resolvePermission("granted");
    window.diagnosticMock.gps();
  });
  await expect
    .poll(() => page.evaluate(() => window.diagnosticMock.stoppedTracks))
    .toBe(1);
  await page.evaluate(() => window.diagnosticMock.orientation());
  await expect(page.locator("#start")).toBeEnabled();
  await expect(page.locator("#capture")).toBeDisabled();
  await expect(page.locator("#orientation-status")).toContainText("off");
  await expect(page.locator("#gps-status")).toContainText("off");
  expect(await page.evaluate(() => window.diagnosticMock.clearedWatches)).toBe(
    1,
  );
});

test("denied motion stays unavailable", async ({ page }) => {
  await mockDevices(page, { deniedMotion: true });
  await page.locator("#start").click();
  await page.evaluate(() => {
    window.diagnosticMock.gps();
    window.diagnosticMock.orientation();
  });
  await expect(page.locator("#orientation-status")).toContainText(
    "permission was denied",
  );
  await expect(page.locator("#capture")).toBeDisabled();
});

for (const viewport of [
  { width: 412, height: 915 },
  { width: 915, height: 412 },
]) {
  test(`preview and reticle remain unobscured with capture visible at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await mockDevices(page);
    await start(page);
    await page.locator("#capture").scrollIntoViewIfNeeded();
    const geometry = await page.evaluate(() => {
      const preview = document
        .querySelector("#preview")!
        .getBoundingClientRect();
      const reticle = document
        .querySelector("#reticle")!
        .getBoundingClientRect();
      const capture = document
        .querySelector("#capture")!
        .getBoundingClientRect();
      const x = reticle.x + reticle.width / 2;
      const y = reticle.y + reticle.height / 2;
      return {
        centerX: x - (preview.x + preview.width / 2),
        centerY: y - (preview.y + preview.height / 2),
        reticleVisible: y > 0 && y < innerHeight,
        captureVisible: capture.top >= 0 && capture.bottom <= innerHeight,
        unobscured: document.elementFromPoint(x, y)?.id === "camera",
        noOverlap:
          capture.right <= preview.left ||
          capture.left >= preview.right ||
          capture.bottom <= preview.top ||
          capture.top >= preview.bottom,
        noHorizontalScroll: document.documentElement.scrollWidth <= innerWidth,
      };
    });
    expect(geometry).toEqual({
      centerX: 0,
      centerY: 0,
      reticleVisible: true,
      captureVisible: true,
      unobscured: true,
      noOverlap: true,
      noHorizontalScroll: true,
    });
  });
}
