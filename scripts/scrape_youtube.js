const { chromium } = require('playwright');

async function scrapeYouTubeChannel(channelUrl) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  console.error('Navigating to channel...');
  await page.goto(channelUrl, { waitUntil: 'networkidle', timeout: 30000 });

  // Wait for video grid to load
  await page.waitForSelector('ytd-rich-item-renderer', { timeout: 15000 });

  // Scroll to load all videos - use more aggressive scrolling
  let previousCount = 0;
  let currentCount = 0;
  let stableCount = 0;
  const maxStableAttempts = 5;

  console.error('Scrolling to load all videos...');

  while (stableCount < maxStableAttempts) {
    previousCount = currentCount;

    // Scroll down aggressively
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight + 5000);
    });

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Also try scrolling within the content area
    await page.evaluate(() => {
      const scrollContainer = document.querySelector('ytd-rich-grid-renderer');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    });

    await page.waitForTimeout(1000);

    // Count videos
    currentCount = await page.locator('ytd-rich-item-renderer').count();

    if (currentCount === previousCount) {
      stableCount++;
    } else {
      stableCount = 0;
    }

    console.error(`Loaded ${currentCount} videos... (stable: ${stableCount}/${maxStableAttempts})`);
  }

  console.error(`Found ${currentCount} total videos. Extracting data...`);

  // Extract video data
  const videos = await page.evaluate(() => {
    const items = document.querySelectorAll('ytd-rich-item-renderer');
    const results = [];

    items.forEach(item => {
      const titleElement = item.querySelector('#video-title-link, #video-title');
      const thumbnailLink = item.querySelector('a#thumbnail');

      if (titleElement) {
        const title = titleElement.textContent?.trim() || '';
        const href = thumbnailLink?.href || titleElement.href || '';

        // Extract video ID from URL
        const videoIdMatch = href.match(/[?&]v=([^&]+)/) || href.match(/\/shorts\/([^?]+)/);
        const videoId = videoIdMatch ? videoIdMatch[1] : '';

        if (title && videoId) {
          results.push({
            title,
            videoId,
            url: `https://www.youtube.com/watch?v=${videoId}`
          });
        }
      }
    });

    return results;
  });

  await browser.close();

  return videos;
}

async function getVideoTranscript(videoUrl, browser) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    await page.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);

    // Click "...more" to expand description
    try {
      const moreButton = page.locator('#expand, tp-yt-paper-button#expand, [aria-label="Show more"]').first();
      if (await moreButton.isVisible({ timeout: 3000 })) {
        await moreButton.click();
        await page.waitForTimeout(1000);
      }
    } catch (e) {
      // Continue without expanding
    }

    // Try to open transcript panel
    try {
      // Click the "...more" menu button below the video
      const menuButton = page.locator('button[aria-label="More actions"]').first();
      if (await menuButton.isVisible({ timeout: 3000 })) {
        await menuButton.click();
        await page.waitForTimeout(500);

        // Look for "Show transcript" option
        const transcriptOption = page.locator('text=Show transcript').first();
        if (await transcriptOption.isVisible({ timeout: 2000 })) {
          await transcriptOption.click();
          await page.waitForTimeout(2000);
        }
      }
    } catch (e) {
      // Try alternative method - look for transcript in description
    }

    // Extract description text (often contains coordinates)
    const description = await page.evaluate(() => {
      const descElement = document.querySelector('#description-inline-expander, #description, ytd-text-inline-expander');
      return descElement ? descElement.innerText : '';
    });

    // Try to get transcript segments
    const transcript = await page.evaluate(() => {
      const segments = document.querySelectorAll('ytd-transcript-segment-renderer');
      if (segments.length > 0) {
        return Array.from(segments).map(seg => seg.innerText).join(' ');
      }
      return '';
    });

    await context.close();

    return {
      description,
      transcript
    };
  } catch (err) {
    await context.close();
    return { description: '', transcript: '', error: err.message };
  }
}

async function scrapeWithTranscripts(channelUrl, sampleSize = null) {
  // First get all videos
  const videos = await scrapeYouTubeChannel(channelUrl);

  if (sampleSize) {
    console.error(`\nFetching transcripts for ${sampleSize} sample videos...`);
  } else {
    console.error(`\nFetching transcripts for all ${videos.length} videos...`);
  }

  const browser = await chromium.launch({ headless: true });

  const videosToProcess = sampleSize ? videos.slice(0, sampleSize) : videos;

  for (let i = 0; i < videosToProcess.length; i++) {
    const video = videosToProcess[i];
    console.error(`[${i + 1}/${videosToProcess.length}] Fetching: ${video.title}`);

    const { description, transcript } = await getVideoTranscript(video.url, browser);
    video.description = description;
    video.transcript = transcript;

    // Small delay between requests
    await new Promise(r => setTimeout(r, 500));
  }

  await browser.close();

  return videos;
}

// Main
const args = process.argv.slice(2);
const channelUrl = args.find(a => a.startsWith('http')) || 'https://www.youtube.com/@paulfellows5411/videos';
const withTranscripts = args.includes('--transcripts');
const sampleArg = args.find(a => a.startsWith('--sample='));
const sampleSize = sampleArg ? parseInt(sampleArg.split('=')[1]) : null;

if (withTranscripts) {
  scrapeWithTranscripts(channelUrl, sampleSize)
    .then(videos => {
      console.log(JSON.stringify(videos, null, 2));
      console.error(`\nSuccessfully extracted ${videos.length} videos with transcripts`);
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
} else {
  scrapeYouTubeChannel(channelUrl)
    .then(videos => {
      console.log(JSON.stringify(videos, null, 2));
      console.error(`\nSuccessfully extracted ${videos.length} videos`);
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
