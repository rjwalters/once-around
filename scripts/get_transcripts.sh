#!/bin/bash
# Download subtitles for all videos in the catalog

mkdir -p data/subtitles

# Read video URLs from JSON and download subtitles
node -e "
const videos = require('./data/videos_clean.json');
videos.forEach((v, i) => {
  console.log(v.videoId + '\t' + v.title);
});
" | while IFS=$'\t' read -r video_id title; do
  echo "[$video_id] $title"

  # Skip if already downloaded
  if [ -f "data/subtitles/${video_id}.en.vtt" ] || [ -f "data/subtitles/${video_id}.en.srv1" ]; then
    echo "  Already have subtitle"
    continue
  fi

  # Try to get English auto-captions
  yt-dlp --skip-download \
    --write-auto-sub \
    --sub-lang en \
    --sub-format vtt \
    --convert-subs vtt \
    -o "data/subtitles/%(id)s" \
    "https://www.youtube.com/watch?v=${video_id}" 2>/dev/null

  # Small delay to avoid rate limiting
  sleep 0.5
done

echo "Done downloading subtitles"
