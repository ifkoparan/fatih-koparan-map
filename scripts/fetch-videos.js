#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHANNEL_URL = 'https://www.youtube.com/@ifkoparan/videos';
const OUTPUT_FILE = path.join(__dirname, '..', 'raw_videos.json');

console.log('Fetching videos from Fatih Koparan channel...');

const output = execSync(
  `yt-dlp --flat-playlist --print "%(id)s\t%(title)s\t%(upload_date)s" "${CHANNEL_URL}"`,
  { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
);

// Load existing dates to preserve them (flat-playlist can't fetch dates)
const existingDates = {};
if (fs.existsSync(OUTPUT_FILE)) {
  const prev = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
  for (const v of prev) {
    if (v.uploadDate) existingDates[v.id] = v.uploadDate;
  }
}

const videos = output
  .trim()
  .split('\n')
  .map(line => {
    const parts = line.split('\t');
    const id = parts[0];
    const title = parts[1] || '';
    const rawDate = parts[2] || '';
    const uploadDate = rawDate.length === 8
      ? `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6,8)}`
      : existingDates[id] || null;
    return {
      id,
      title,
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      uploadDate
    };
  })
  .filter(v => v.id && v.title);

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(videos, null, 2), 'utf-8');
console.log(`Saved ${videos.length} videos to raw_videos.json`);
