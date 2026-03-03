#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const RAW_FILE = path.join(__dirname, '..', 'raw_videos.json');
const OUTPUT_FILE = path.join(__dirname, '..', 'videos.json');
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  console.error('GROQ_API_KEY environment variable is required.');
  console.error('Get a free key at https://console.groq.com/keys');
  process.exit(1);
}

const BATCH_SIZE = 20;
const DELAY_MS = 3000;

async function callGroq(titles) {
  const prompt = `You are a geography expert. Given these YouTube video titles from a Turkish travel vlogger (Fatih Koparan), extract the location (country and city/region) for each video.

Return ONLY a JSON array with objects having these fields:
- "index": the index number from the input
- "country": country name in English (null if no location found)
- "city": city or region name in English (null if not specific)
- "lat": latitude as number
- "lng": longitude as number

If a video title doesn't mention any specific location, return null for all location fields.
If only a country is mentioned without a specific city, use the capital city's coordinates.

Video titles:
${titles.map((t, i) => `${i}: ${t}`).join('\n')}

Return ONLY the JSON array, no markdown, no explanation.`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 4096
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data.choices[0].message.content.trim();

  // Extract JSON from response (handle potential markdown wrapping)
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`Could not parse JSON from: ${content.slice(0, 200)}`);

  return JSON.parse(jsonMatch[0]);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const rawVideos = JSON.parse(fs.readFileSync(RAW_FILE, 'utf-8'));

  // Load existing results to skip already geocoded videos
  let existing = {};
  if (fs.existsSync(OUTPUT_FILE)) {
    const prev = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
    for (const v of prev) {
      existing[v.id] = v;
    }
  }

  const toGeocode = rawVideos.filter(v => !existing[v.id]);
  console.log(`Total: ${rawVideos.length}, Already geocoded: ${Object.keys(existing).length}, New: ${toGeocode.length}`);

  if (toGeocode.length === 0) {
    console.log('All videos already geocoded. Nothing to do.');
    return;
  }

  // Process in batches
  const results = { ...existing };
  for (let i = 0; i < toGeocode.length; i += BATCH_SIZE) {
    const batch = toGeocode.slice(i, i + BATCH_SIZE);
    const titles = batch.map(v => v.title);

    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toGeocode.length / BATCH_SIZE)} (${batch.length} videos)...`);

    try {
      const locations = await callGroq(titles);

      for (const loc of locations) {
        if (loc == null) continue;
        const video = batch[loc.index];
        if (!video) continue;

        results[video.id] = {
          ...video,
          country: loc.country,
          city: loc.city,
          lat: loc.lat,
          lng: loc.lng
        };
      }
    } catch (err) {
      console.error(`Batch error: ${err.message}`);
      // Save what we have and continue
    }

    if (i + BATCH_SIZE < toGeocode.length) {
      await sleep(DELAY_MS);
    }
  }

  // Merge with existing (keep geocoded data, add raw data for non-geocoded)
  const finalVideos = rawVideos.map(v => {
    if (results[v.id]) return results[v.id];
    return { ...v, country: null, city: null, lat: null, lng: null };
  });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalVideos, null, 2), 'utf-8');

  const withLocation = finalVideos.filter(v => v.lat !== null);
  console.log(`\nDone! ${withLocation.length}/${finalVideos.length} videos have locations.`);
  console.log(`Saved to videos.json`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
