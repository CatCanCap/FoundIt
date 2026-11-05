// Uploads the demo photos (data/demo-showcase.json, "photos") to our Cloudinary
// account, the same way the report form does, and saves their links in
// data/demo-photos.json for scripts/seed-demo.js. Run it once:
//   node scripts/upload-demo-photos.js
// Photos already in data/demo-photos.json are skipped, so running it again only
// uploads new ones. The photos are public-domain files from Wikimedia Commons.
//
// It reads the cloud name and the unsigned upload preset from client/.env.local
// (VITE_CLOUDINARY_CLOUD_NAME, VITE_CLOUDINARY_UPLOAD_PRESET). Neither is secret,
// but they are not printed.
const fs = require('fs');
const path = require('path');
const { demo } = require('../data/load-demo');

const OUT_FILE = path.join(__dirname, '../data/demo-photos.json');
const ENV_FILE = path.join(__dirname, '../../client/.env.local');
// Wikimedia asks every script to name itself
const USER_AGENT = 'FoundIt-demo-seed/1.0 (SMU IS216 student project)';

function readClientSetting(name) {
  const text = fs.readFileSync(ENV_FILE, 'utf8');
  const line = text.split('\n').find((entry) => entry.startsWith(`${name}=`));
  const value = line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '') : '';
  if (!value) throw new Error(`${name} is empty in client/.env.local`);
  return value;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function download(url) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (response.ok) return new Blob([await response.arrayBuffer()], { type: response.headers.get('content-type') || 'image/jpeg' });
    // Wikimedia answers 429 when asked too quickly
    if (response.status !== 429 || attempt === 4) throw new Error(`download failed (${response.status})`);
    await wait(5000 * attempt);
  }
}

async function main() {
  const cloudName = readClientSetting('VITE_CLOUDINARY_CLOUD_NAME');
  const uploadPreset = readClientSetting('VITE_CLOUDINARY_UPLOAD_PRESET');
  const saved = fs.existsSync(OUT_FILE) ? JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')) : {};

  for (const [key, photo] of Object.entries(demo.photos)) {
    if (saved[key]) continue;
    const body = new FormData();
    body.append('file', await download(photo.url), path.basename(photo.file));
    body.append('upload_preset', uploadPreset);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, {
      method: 'POST', body,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data.secure_url !== 'string') {
      throw new Error(`Uploading ${key} failed (${response.status}): ${data.error?.message || 'no link returned'}`);
    }
    saved[key] = data.secure_url;
    // Saved after every photo, so a failure part way keeps the ones that worked
    fs.writeFileSync(OUT_FILE, `${JSON.stringify(saved, null, 2)}\n`);
    console.log(`Uploaded ${key}`);
    await wait(1500);
  }
  console.log(`${Object.keys(saved).length} of ${Object.keys(demo.photos).length} photos are in data/demo-photos.json`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
