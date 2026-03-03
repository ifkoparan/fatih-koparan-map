#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHANNEL_URL = 'https://www.youtube.com/@ifkoparan/videos';
const OUTPUT_FILE = path.join(__dirname, '..', 'raw_videos.json');

console.log('Fetching videos from Fatih Koparan channel...');

const output = execSync(
  `yt-dlp --flat-playlist --print "%(id)s\t%(title)s" "${CHANNEL_URL}"`,
  { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
);

const videos = output
  .trim()
  .split('\n')
  .map(line => {
    const [id, ...titleParts] = line.split('\t');
    const title = titleParts.join('\t');
    return {
      id,
      title,
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
    };
  })
  .filter(v => v.id && v.title);

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(videos, null, 2), 'utf-8');
console.log(`Saved ${videos.length} videos to raw_videos.json`);
