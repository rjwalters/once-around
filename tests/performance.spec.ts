import { test, expect, Page } from "@playwright/test";

interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  minFps: number;
  maxFps: number;
  droppedFrames: number;
}

async function measureFPS(page: Page, duration: number = 3000): Promise<PerformanceMetrics> {
  return await page.evaluate((duration) => {
    return new Promise<PerformanceMetrics>((resolve) => {
      const frameTimes: number[] = [];
      let lastTime = performance.now();
      let frameCount = 0;
      const startTime = lastTime;

      function measureFrame() {
        const now = performance.now();
        const deltaTime = now - lastTime;
        frameTimes.push(deltaTime);
        lastTime = now;
        frameCount++;

        if (now - startTime < duration) {
          requestAnimationFrame(measureFrame);
        } else {
          // Calculate metrics
          const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
          const fps = 1000 / avgFrameTime;
          const minFrameTime = Math.min(...frameTimes);
          const maxFrameTime = Math.max(...frameTimes);
          const droppedFrames = frameTimes.filter((t) => t > 33.33).length; // >30fps threshold

          resolve({
            fps: Math.round(fps * 10) / 10,
            frameTime: Math.round(avgFrameTime * 100) / 100,
            minFps: Math.round((1000 / maxFrameTime) * 10) / 10,
            maxFps: Math.round((1000 / minFrameTime) * 10) / 10,
            droppedFrames,
          });
        }
      }

      requestAnimationFrame(measureFrame);
    });
  }, duration);
}

async function simulateDrag(page: Page, distance: number = 300, duration: number = 1000) {
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not found");

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  // Start drag
  await page.mouse.move(startX, startY);
  await page.mouse.down();

  // Drag in a circle pattern
  const steps = Math.floor(duration / 16); // ~60fps
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const x = startX + Math.cos(angle) * distance;
    const y = startY + Math.sin(angle) * distance * 0.5;
    await page.mouse.move(x, y);
    await page.waitForTimeout(16);
  }

  await page.mouse.up();
}

test.describe("Performance Benchmarks", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the app to fully load
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2000); // Allow initial render to stabilize
  });

  test("idle FPS should be stable", async ({ page }) => {
    console.log("\n=== Idle Performance ===");
    const metrics = await measureFPS(page, 3000);
    console.log(`FPS: ${metrics.fps} (min: ${metrics.minFps}, max: ${metrics.maxFps})`);
    console.log(`Frame time: ${metrics.frameTime}ms`);
    console.log(`Dropped frames: ${metrics.droppedFrames}`);

    // Headless Chrome typically runs slower - expect 12+ fps baseline
    expect(metrics.fps).toBeGreaterThan(12);
  });

  test("drag performance should maintain acceptable FPS", async ({ page }) => {
    console.log("\n=== Drag Performance ===");

    // Start FPS measurement
    const fpsPromise = measureFPS(page, 5000);

    // Perform drag operations during measurement
    await simulateDrag(page, 200, 4000);

    const metrics = await fpsPromise;
    console.log(`FPS during drag: ${metrics.fps} (min: ${metrics.minFps}, max: ${metrics.maxFps})`);
    console.log(`Frame time: ${metrics.frameTime}ms`);
    console.log(`Dropped frames: ${metrics.droppedFrames}`);

    // Headless Chrome drag should maintain 12+ fps
    expect(metrics.fps).toBeGreaterThan(12);
  });

  test("zoom performance should maintain acceptable FPS", async ({ page }) => {
    console.log("\n=== Zoom Performance ===");

    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    // Position mouse at center
    await page.mouse.move(centerX, centerY);

    // Start FPS measurement
    const fpsPromise = measureFPS(page, 4000);

    // Zoom in and out repeatedly
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, -100); // Zoom in
      await page.waitForTimeout(150);
      await page.mouse.wheel(0, 100); // Zoom out
      await page.waitForTimeout(150);
    }

    const metrics = await fpsPromise;
    console.log(`FPS during zoom: ${metrics.fps} (min: ${metrics.minFps}, max: ${metrics.maxFps})`);
    console.log(`Frame time: ${metrics.frameTime}ms`);
    console.log(`Dropped frames: ${metrics.droppedFrames}`);

    // Zoom with throttling should maintain 12+ fps
    expect(metrics.fps).toBeGreaterThan(12);
  });

  test("combined drag and zoom stress test", async ({ page }) => {
    console.log("\n=== Stress Test ===");

    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    // Start FPS measurement
    const fpsPromise = measureFPS(page, 6000);

    // Aggressive interaction pattern
    for (let i = 0; i < 3; i++) {
      // Quick drag
      await page.mouse.move(centerX, centerY);
      await page.mouse.down();
      for (let j = 0; j < 20; j++) {
        const angle = (j / 20) * Math.PI * 2;
        await page.mouse.move(
          centerX + Math.cos(angle) * 150,
          centerY + Math.sin(angle) * 100
        );
      }
      await page.mouse.up();

      // Zoom while moving
      await page.mouse.wheel(0, -50);
      await page.waitForTimeout(50);
      await page.mouse.wheel(0, 50);
      await page.waitForTimeout(50);
    }

    const metrics = await fpsPromise;
    console.log(`FPS during stress test: ${metrics.fps} (min: ${metrics.minFps}, max: ${metrics.maxFps})`);
    console.log(`Frame time: ${metrics.frameTime}ms`);
    console.log(`Dropped frames: ${metrics.droppedFrames}`);

    // Stress test - expect 12+ fps even under heavy load
    expect(metrics.fps).toBeGreaterThan(12);
  });
});
