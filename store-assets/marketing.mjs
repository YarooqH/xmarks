// Builds the landing page's images from the store screenshots in output/.
//
//   npm run marketing          (run `npm run capture` first)
//
// Writes to output/:
//   promo-small-440x280.jpg         Chrome Web Store small promo tile (required)
//   promo-marquee-1400x560.jpg      Chrome Web Store marquee promo tile (optional)
//
// and to ../landing/public/:
//   og.png                          1200x630 link preview (Open Graph / X card)
//   screens/<name>.jpg              1280x800, copied from output/
//   screens/<name>@2x.webp          2560x1600, converted from output/2x/
//   favicon.svg, favicon.ico (16/32/48), apple-touch-icon.png (180)
//
// and ../public/favicon.svg, the tab icon for the extension's own pages.

import { chromium } from 'playwright';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'output');
const LANDING = path.resolve(here, '..', 'landing');
const PUBLIC = path.join(LANDING, 'public');
const SCREENS = path.join(PUBLIC, 'screens');
const BROWSER = process.env.XMARKS_BROWSER ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

// The frames of the landing page's guided tour (components/Screens.astro).
const shots = [
  { from: '04-timeline-button', to: 'timeline-button' },
  { from: '05-timeline-popover', to: 'timeline-popover' },
  { from: '06-timeline-saved', to: 'timeline-saved' },
  { from: '01-dashboard', to: 'dashboard' },
  { from: '02-dashboard-search', to: 'dashboard-search' },
  { from: '03-dashboard-category', to: 'dashboard-category' },
  { from: '08-sync-entry', to: 'sync-entry' },
  { from: '09-sync-panel', to: 'sync-panel' },
];

const dataUrl = (file, type) => `data:${type};base64,${readFileSync(file).toString('base64')}`;

// The mark from the landing page's Logo component, so the card matches the site.
const logoPath = readFileSync(path.join(LANDING, 'src', 'components', 'Logo.astro'), 'utf8').match(/<path fill="currentColor" d="([^"]+)"/)[1];
const font = dataUrl(path.join(LANDING, 'node_modules', '@fontsource-variable', 'schibsted-grotesk', 'files', 'schibsted-grotesk-latin-wght-normal.woff2'), 'font/woff2');

const ogHtml = `<!doctype html>
<html><head><style>
  @font-face { font-family: 'Schibsted'; src: url(${font}) format('woff2'); font-weight: 400 900; }
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #000; }
  body { position: relative; font-family: 'Schibsted', sans-serif; color: #e7e9ea; -webkit-font-smoothing: antialiased; }
  .copy { position: absolute; left: 72px; top: 0; bottom: 0; width: 560px; display: flex; flex-direction: column; justify-content: center; gap: 28px; }
  .lockup { display: flex; align-items: center; gap: 2px; font-size: 34px; font-weight: 700; letter-spacing: -0.02em; }
  .lockup svg { width: 39px; height: 39px; }
  h1 { margin: 0; font-size: 60px; line-height: 0.98; font-weight: 800; letter-spacing: -0.035em; }
  h1 span { display: block; white-space: nowrap; color: #1d9bf0; }
  p { margin: 0; font-size: 25px; line-height: 1.4; color: #8b98a5; }
  .shot { position: absolute; left: 680px; top: 96px; width: 820px; border-radius: 20px; border: 1px solid #2f3336;
          box-shadow: 0 0 40px rgba(29, 155, 240, 0.18); }
</style></head><body>
  <div class="copy">
    <div class="lockup"><svg viewBox="0 0 67 67"><path fill="currentColor" d="${logoPath}"/></svg><span>Marks</span></div>
    <h1>Save it on X. <span>Find it in XMarks.</span></h1>
    <p>Search, sort and annotate your X bookmarks. Free, and it all stays in your browser.</p>
  </div>
  <img class="shot" src="${dataUrl(path.join(OUT, '01-dashboard.jpg'), 'image/jpeg')}">
</body></html>`;

// Chrome Web Store promo tiles. JPEG, because the store rejects PNGs with an alpha channel.
const lockup = (size) =>
  `<div class="lockup" style="font-size:${size}px"><svg viewBox="0 0 67 67" style="width:${size * 1.14}px;height:${size * 1.14}px"><path fill="currentColor" d="${logoPath}"/></svg><span>Marks</span></div>`;

const tileBase = (w, h) => `
  @font-face { font-family: 'Schibsted'; src: url(${font}) format('woff2'); font-weight: 400 900; }
  * { box-sizing: border-box; }
  html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; background: #000; }
  body { position: relative; font-family: 'Schibsted', sans-serif; color: #e7e9ea; -webkit-font-smoothing: antialiased; }
  .lockup { display: flex; align-items: center; gap: 2px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
  h1 { margin: 0; font-weight: 800; letter-spacing: -0.035em; line-height: 0.98; }
  h1 span { color: #1d9bf0; }`;

const smallTileHtml = `<!doctype html><html><head><style>${tileBase(440, 280)}
  body { display: flex; flex-direction: column; justify-content: center; gap: 22px; padding: 0 40px;
         background: radial-gradient(120% 90% at 100% 100%, rgba(29, 155, 240, 0.35), #000 60%); }
  h1 { font-size: 40px; }
</style></head><body>
  ${lockup(30)}
  <h1>Your X bookmarks, <span>searchable.</span></h1>
</body></html>`;

const marqueeHtml = `<!doctype html><html><head><style>${tileBase(1400, 560)}
  .copy { position: absolute; left: 80px; top: 0; bottom: 0; width: 600px; display: flex; flex-direction: column; justify-content: center; gap: 30px; }
  h1 { font-size: 64px; }
  h1 span { display: block; white-space: nowrap; }
  p { margin: 0; font-size: 26px; line-height: 1.4; color: #8b98a5; }
  .shot { position: absolute; left: 740px; top: 70px; width: 820px; border-radius: 20px; border: 1px solid #2f3336;
          box-shadow: 0 0 40px rgba(29, 155, 240, 0.18); }
</style></head><body>
  <div class="copy">
    ${lockup(36)}
    <h1>Save it on X. <span>Find it in XMarks.</span></h1>
    <p>Search, sort and annotate your X bookmarks. Free, and it all stays in your browser.</p>
  </div>
  <img class="shot" src="${dataUrl(path.join(OUT, '01-dashboard.jpg'), 'image/jpeg')}">
</body></html>`;

const tiles = [
  { html: smallTileHtml, w: 440, h: 280, file: 'promo-small-440x280.jpg' },
  { html: marqueeHtml, w: 1400, h: 560, file: 'promo-marquee-1400x560.jpg' },
];

// Favicon: the white mark on a black circle, like the extension's store icon.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <circle cx="64" cy="64" r="64" fill="#000"/>
  <path fill="#fff" transform="translate(23 23) scale(1.224)" d="${logoPath}"/>
</svg>
`;
// iOS rounds the corners itself, so the touch icon is a full black square.
const touchIconHtml = `<!doctype html><html><head><style>
  html, body { margin: 0; width: 180px; height: 180px; background: #000; }
  svg { display: block; width: 180px; height: 180px; }
</style></head><body><svg viewBox="0 0 128 128"><path fill="#fff" transform="translate(23 23) scale(1.224)" d="${logoPath}"/></svg></body></html>`;

/** An .ico holding PNG images (supported by every browser since IE Vista-era). */
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

mkdirSync(SCREENS, { recursive: true });
const browser = await chromium.launch({ executablePath: BROWSER, headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

  await page.setContent(ogHtml);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(PUBLIC, 'og.png'), type: 'png' });
  console.log('  saved og.png');

  writeFileSync(path.join(PUBLIC, 'favicon.svg'), favicon);
  writeFileSync(path.resolve(here, '..', 'public', 'favicon.svg'), favicon);
  const pngs = [];
  for (const size of [16, 32, 48]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${favicon}`);
    pngs.push({ size, data: await page.screenshot({ type: 'png', omitBackground: true }) });
  }
  writeFileSync(path.join(PUBLIC, 'favicon.ico'), ico(pngs));
  await page.setViewportSize({ width: 180, height: 180 });
  await page.setContent(touchIconHtml);
  await page.screenshot({ path: path.join(PUBLIC, 'apple-touch-icon.png'), type: 'png' });
  console.log('  saved favicon.svg, favicon.ico, apple-touch-icon.png');

  for (const t of tiles) {
    await page.setViewportSize({ width: t.w, height: t.h });
    await page.setContent(t.html);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(OUT, t.file), type: 'jpeg', quality: 95 });
    console.log('  saved', t.file);
  }

  for (const { from, to } of shots) {
    copyFileSync(path.join(OUT, `${from}.jpg`), path.join(SCREENS, `${to}.jpg`));

    const webp = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      return canvas.toDataURL('image/webp', 0.82).split(',')[1];
    }, dataUrl(path.join(OUT, '2x', `${from}@2x.png`), 'image/png'));
    writeFileSync(path.join(SCREENS, `${to}@2x.webp`), Buffer.from(webp, 'base64'));
    console.log('  saved', `screens/${to}.jpg`, `screens/${to}@2x.webp`);
  }
} finally {
  await browser.close();
}
