const { chromium } = require('playwright');
const fs = require('fs');

// Load video list
const videos = JSON.parse(fs.readFileSync('data/videos_clean.json', 'utf8'));

async function getTranscript(page, videoUrl, videoTitle) {
  try {
    await page.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Try to click "...more" to expand description
    try {
      const expandButton = page.locator('#expand, #description-inline-expander tp-yt-paper-button, [aria-label*="more"]').first();
      if (await expandButton.isVisible({ timeout: 2000 })) {
        await expandButton.click();
        await page.waitForTimeout(1000);
      }
    } catch (e) {}

    // Get description
    const description = await page.evaluate(() => {
      const desc = document.querySelector('#description-inline-expander, ytd-text-inline-expander, #description');
      return desc ? desc.innerText : '';
    });

    // Try to open transcript from the menu
    let transcript = '';
    try {
      // Click the "..." menu below the video
      const menuButton = page.locator('ytd-menu-renderer button[aria-label="More actions"]').first();
      if (await menuButton.isVisible({ timeout: 3000 })) {
        await menuButton.click();
        await page.waitForTimeout(500);

        // Click "Show transcript"
        const transcriptButton = page.locator('tp-yt-paper-listbox ytd-menu-service-item-renderer').filter({ hasText: /transcript/i }).first();
        if (await transcriptButton.isVisible({ timeout: 2000 })) {
          await transcriptButton.click();
          await page.waitForTimeout(2000);

          // Get transcript text
          transcript = await page.evaluate(() => {
            const segments = document.querySelectorAll('ytd-transcript-segment-renderer yt-formatted-string');
            return Array.from(segments).map(s => s.innerText).join(' ');
          });
        }
      }
    } catch (e) {
      // transcript will remain empty
    }

    // If no transcript panel, try to get auto-captions from page data
    if (!transcript) {
      transcript = await page.evaluate(() => {
        // Try to find captions in ytInitialPlayerResponse
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
          if (script.textContent.includes('captionTracks')) {
            const match = script.textContent.match(/"captionTracks":\s*(\[.*?\])/);
            if (match) {
              try {
                return 'Captions available: ' + match[1].slice(0, 200);
              } catch (e) {}
            }
          }
        }
        return '';
      });
    }

    return { description, transcript };
  } catch (err) {
    return { description: '', transcript: '', error: err.message };
  }
}

async function scrapeAllTranscripts() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const results = [];

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    console.error(`[${i + 1}/${videos.length}] ${video.title}`);

    const { description, transcript, error } = await getTranscript(page, video.url, video.title);

    results.push({
      ...video,
      description: description || '',
      transcript: transcript || '',
      error: error || null
    });

    // Rate limit
    await page.waitForTimeout(1000);

    // Save progress every 20 videos
    if ((i + 1) % 20 === 0) {
      fs.writeFileSync('data/transcripts_progress.json', JSON.stringify(results, null, 2));
      console.error(`  Saved progress: ${results.length} videos`);
    }
  }

  await browser.close();
  return results;
}

// Run
scrapeAllTranscripts()
  .then(results => {
    fs.writeFileSync('data/videos_with_transcripts.json', JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
    console.error(`\nDone! Scraped ${results.length} videos`);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
