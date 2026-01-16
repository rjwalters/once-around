import { test, expect } from "@playwright/test";

test("production site performance check", async ({ page }) => {
  // Go to production
  await page.goto("https://oncearound.org");
  
  // Wait for app to load
  await page.waitForSelector("canvas", { timeout: 60000 });
  console.log("Canvas loaded");
  
  // Wait for full initialization
  await page.waitForTimeout(3000);
  
  // Measure FPS
  const metrics = await page.evaluate(() => {
    return new Promise<{fps: number, frameTime: number}>((resolve) => {
      const frameTimes: number[] = [];
      let lastTime = performance.now();
      const startTime = lastTime;
      
      function measureFrame() {
        const now = performance.now();
        frameTimes.push(now - lastTime);
        lastTime = now;
        
        if (now - startTime < 3000) {
          requestAnimationFrame(measureFrame);
        } else {
          const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
          resolve({
            fps: Math.round(1000 / avgFrameTime * 10) / 10,
            frameTime: Math.round(avgFrameTime * 100) / 100
          });
        }
      }
      requestAnimationFrame(measureFrame);
    });
  });
  
  console.log(`Production idle FPS: ${metrics.fps}, Frame time: ${metrics.frameTime}ms`);
  
  // Try dragging
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (box) {
    console.log("Testing drag interaction...");
    await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
    await page.mouse.down();
    for (let i = 0; i < 30; i++) {
      await page.mouse.move(box.x + box.width/2 + i * 5, box.y + box.height/2 + i * 3);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
  }
  
  // Measure FPS after interaction
  const metrics2 = await page.evaluate(() => {
    return new Promise<{fps: number}>((resolve) => {
      const frameTimes: number[] = [];
      let lastTime = performance.now();
      const startTime = lastTime;
      
      function measureFrame() {
        const now = performance.now();
        frameTimes.push(now - lastTime);
        lastTime = now;
        
        if (now - startTime < 2000) {
          requestAnimationFrame(measureFrame);
        } else {
          const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
          resolve({ fps: Math.round(1000 / avgFrameTime * 10) / 10 });
        }
      }
      requestAnimationFrame(measureFrame);
    });
  });
  
  console.log(`Post-interaction FPS: ${metrics2.fps}`);
  
  expect(metrics.fps).toBeGreaterThan(10);
});
