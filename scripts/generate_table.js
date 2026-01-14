const fs = require('fs');
const path = require('path');

const catalog = require('../data/catalog.json');

// Check which transcripts we have
const subtitlesDir = 'data/subtitles';
const availableTranscripts = new Set();
if (fs.existsSync(subtitlesDir)) {
  fs.readdirSync(subtitlesDir).forEach(file => {
    if (file.endsWith('.vtt')) {
      const videoId = file.replace('.en.vtt', '');
      availableTranscripts.add(videoId);
    }
  });
}

// Helper to convert RA from sexagesimal to decimal degrees
function raToDecimal(ra) {
  if (!ra) return null;
  const parts = ra.trim().split(/\s+/);
  if (parts.length >= 3) {
    const h = parseFloat(parts[0]);
    const m = parseFloat(parts[1]);
    const s = parseFloat(parts[2]);
    return ((h + m/60 + s/3600) * 15).toFixed(6);
  }
  return null;
}

// Helper to convert Dec from sexagesimal to decimal degrees
function decToDecimal(dec) {
  if (!dec) return null;
  const parts = dec.trim().split(/\s+/);
  if (parts.length >= 3) {
    const sign = dec.trim().startsWith('-') ? -1 : 1;
    const d = Math.abs(parseFloat(parts[0]));
    const m = parseFloat(parts[1]);
    const s = parseFloat(parts[2]);
    return (sign * (d + m/60 + s/3600)).toFixed(6);
  }
  return null;
}

// Generate output
const output = catalog
  .filter(v => v.objectName) // Only "Once Around" videos
  .map(v => ({
    title: v.title,
    objectName: v.objectName,
    url: v.url,
    videoId: v.videoId,
    category: v.category,
    isMoving: v.isMoving,
    ra_sexagesimal: v.ra || null,
    dec_sexagesimal: v.dec || null,
    ra_decimal: raToDecimal(v.ra),
    dec_decimal: decToDecimal(v.dec),
    simbadName: v.simbadName || null,
    hasTranscript: availableTranscripts.has(v.videoId),
    notes: v.notes || null
  }));

// Output as JSON
console.log(JSON.stringify(output, null, 2));

// Also generate CSV
const csvLines = [
  'title,object_name,url,video_id,category,is_moving,ra,dec,ra_decimal,dec_decimal,simbad_name,has_transcript,notes'
];

output.forEach(v => {
  const line = [
    `"${v.title.replace(/"/g, '""')}"`,
    `"${v.objectName.replace(/"/g, '""')}"`,
    v.url,
    v.videoId,
    v.category,
    v.isMoving,
    v.ra_sexagesimal ? `"${v.ra_sexagesimal}"` : '',
    v.dec_sexagesimal ? `"${v.dec_sexagesimal}"` : '',
    v.ra_decimal || '',
    v.dec_decimal || '',
    v.simbadName ? `"${v.simbadName}"` : '',
    v.hasTranscript,
    v.notes ? `"${v.notes.replace(/"/g, '""')}"` : ''
  ].join(',');
  csvLines.push(line);
});

fs.writeFileSync('data/catalog.csv', csvLines.join('\n'));
console.error(`\nGenerated CSV with ${output.length} entries at data/catalog.csv`);
console.error(`Transcripts available: ${availableTranscripts.size}`);
