#!/usr/bin/env node
const { execSync } = require('child_process');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAW_FILE = path.join(__dirname, '..', 'raw_videos.json');
const PARALLEL = 15;

async function getDate(videoId) {
  return new Promise((resolve) => {
    exec(
      `yt-dlp --skip-download --remote-components ejs:github --print "%(upload_date)s" "https://www.youtube.com/watch?v=${videoId}"`,
      { timeout: 60000 },
      (err, stdout, stderr) => {
        if (stderr) console.error(`[${videoId}] stderr: ${stderr.trim().split('\n').slice(0, 3).join(' | ')}`);
        if (err) { console.error(`[${videoId}] Error: ${err.message}`); resolve(null); return; }
        const raw = stdout.trim();
        console.log(`[${videoId}] raw output: "${raw}"`);
        if (raw.length === 8 && raw !== 'NA') {
          resolve(`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`);
        } else {
          resolve(null);
        }
      }
    );
  });
}

async function processBatch(videos) {
  return Promise.all(videos.map(async v => {
    const date = await getDate(v.id);
    return { id: v.id, uploadDate: date };
  }));
}

async function main() {
  const rawVideos = JSON.parse(fs.readFileSync(RAW_FILE, 'utf-8'));
  const needDates = rawVideos.filter(v => !v.uploadDate);

  console.log(`Total: ${rawVideos.length}, Need dates: ${needDates.length}`);

  if (needDates.length === 0) {
    console.log('All videos have dates.');
    return;
  }

  const dateMap = {};
  let done = 0;

  for (let i = 0; i < needDates.length; i += PARALLEL) {
    const batch = needDates.slice(i, i + PARALLEL);
    const results = await processBatch(batch);

    for (const r of results) {
      if (r.uploadDate) dateMap[r.id] = r.uploadDate;
    }

    done += batch.length;
    const found = Object.keys(dateMap).length;
    console.log(`Progress: ${done}/${needDates.length} processed, ${found} dates found`);
  }

  // Update raw_videos.json
  const updated = rawVideos.map(v => ({
    ...v,
    uploadDate: dateMap[v.id] || v.uploadDate || null
  }));

  fs.writeFileSync(RAW_FILE, JSON.stringify(updated, null, 2), 'utf-8');

  const withDate = updated.filter(v => v.uploadDate).length;
  console.log(`\nDone! ${withDate}/${updated.length} videos have dates.`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
