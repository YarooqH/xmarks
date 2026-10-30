// Records the README demo: save a post from the home timeline into a new
// category with a note, open XMarks from the browser toolbar, then go to the
// dashboard to tag it and find it again.
//
//   npm run demo               (run `npm run build` in the repo root first; needs ffmpeg on PATH)
//
// Same setup as capture.mjs: the real extension in Edge, the look-alike X pages
// from fixtures/, no network. Headless Edge has no toolbar and can't show an
// action popup, so the recording happens inside a drawn browser window
// (STAGE_HTML): a page of the extension with a tab strip, an address bar and the
// pinned XMarks button, showing X, the popup and the dashboard in iframes. The
// extension is run from a copy of dist/ with that page added and the content
// script allowed into frames; dist/ itself isn't touched.
//
// The library starts with the demo posts minus the first timeline post, which
// gets saved on camera.
//
// Frames come from Chrome's screencast (sharper than Playwright's video) and
// are stitched by ffmpeg into output/demo/xmarks-demo.gif and .mp4.

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoLibrary } from './demo-library.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION = path.resolve(here, '..', 'dist');
const OUT = path.join(here, 'output', 'demo');
const FRAMES = path.join(OUT, 'frames');
const BROWSER = process.env.XMARKS_BROWSER ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const VIEWPORT = { width: 1280, height: 860 };
const GIF_WIDTH = 960;
const GIF_FPS = 15;
// The post saved on camera, so it's left out of the starting library.
const SAVED_HANDLE = 'heehee_official';

const fixture = (name) => readFileSync(path.join(here, 'fixtures', name), 'utf8');
const X_HOME = fixture('x-home.html');
const X_POSTS_JS = fixture('x-home-posts.js');
const ASSETS_HTML = fixture('assets.html');

// Avatars are photos (fixtures/avatars/*.png, gitignored; see CREDITS.md there),
// keyed by file name like the drawings.
function loadAvatars(art) {
  const dir = path.join(here, 'fixtures', 'avatars');
  if (!existsSync(dir)) return console.warn('no fixtures/avatars/ (gitignored): avatars will be blank');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.png'))) art.set(file.slice(0, -4), readFileSync(path.join(dir, file)));
}


// ---- Browser window ----
// A generic dark browser frame: no browser's logo or branding. Extension pages
// don't run inline scripts, so the behaviour is added with page.evaluate(STAGE_JS).

const icon = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

const STAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>XMarks demo</title>
<style>
  :root { --strip: #1c1d20; --bar: #2c2d31; --omni: #1c1d20; --text: #e8eaed; --muted: #9aa0a6; --line: #45474b; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; overflow: hidden; background: #000; color: var(--text);
    font: 13px/1.2 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif; }
  svg { display: block; }

  .strip { height: 40px; background: var(--strip); display: flex; align-items: flex-end; padding: 0 0 0 8px; }
  #tabs { display: flex; align-items: flex-end; gap: 2px; }
  .tab { width: 236px; height: 34px; display: flex; align-items: center; gap: 9px; padding: 0 10px 0 13px;
    border-radius: 9px 9px 0 0; color: var(--muted); animation: tab-in .22s ease-out; }
  .tab.active { background: var(--bar); color: var(--text); }
  .tab .fav { width: 16px; height: 16px; flex: none; }
  .tab .title { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tab .close { width: 16px; height: 16px; flex: none; opacity: .75; }
  @keyframes tab-in { from { width: 0; opacity: 0; } }
  .plus { width: 28px; height: 28px; margin: 0 0 3px 6px; display: grid; place-items: center; color: var(--muted); }
  .plus svg { width: 16px; height: 16px; }
  .win { margin-left: auto; align-self: stretch; display: flex; }
  .win span { width: 46px; display: grid; place-items: center; color: var(--muted); }
  .win svg { width: 14px; height: 14px; }

  .bar { height: 44px; background: var(--bar); display: flex; align-items: center; gap: 4px; padding: 0 8px; border-bottom: 1px solid #000; }
  .ic { width: 34px; height: 34px; flex: none; display: grid; place-items: center; border-radius: 50%; color: var(--text); transition: background .15s; }
  .ic.dim { color: var(--muted); }
  .ic svg { width: 18px; height: 18px; }
  .omni { flex: 1; height: 34px; margin: 0 8px; border-radius: 17px; background: var(--omni); display: flex; align-items: center; gap: 10px;
    padding: 0 14px; font-size: 14px; white-space: nowrap; overflow: hidden; }
  .omni svg, .omni img { width: 16px; height: 16px; flex: none; color: var(--muted); }
  .omni .chip { font-weight: 600; }
  .omni .sep { width: 1px; height: 16px; background: var(--line); }
  .omni .rest { color: var(--muted); }
  #ext img { width: 18px; height: 18px; }
  #ext.hover { background: rgba(255,255,255,.08); }
  #ext.on { background: rgba(255,255,255,.16); }
  .avatar { width: 24px; height: 24px; border-radius: 50%; background: linear-gradient(135deg, #1d9bf0, #7856ff); }

  .view { position: absolute; left: 0; right: 0; top: 85px; bottom: 0; visibility: hidden; }
  .view.active { visibility: visible; }
  .view iframe { display: block; width: 100%; height: 100%; border: 0; background: #000; }

  #popup { position: absolute; top: 80px; width: 380px; height: 580px; border-radius: 10px; overflow: hidden; background: #000;
    border: 1px solid var(--line); box-shadow: 0 14px 44px rgba(0,0,0,.65); opacity: 0; transform: translateY(-6px);
    transition: opacity .16s ease-out, transform .16s ease-out; pointer-events: none; }
  #popup.open { opacity: 1; transform: none; pointer-events: auto; }
  #popup iframe { display: block; width: 100%; height: 100%; border: 0; }

  #demo-cursor { position: fixed; left: 0; top: 0; width: 22px; height: 22px; z-index: 30; pointer-events: none;
    transform: translate(var(--x, -100px), var(--y, -100px)); filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
  #demo-ripple { position: fixed; z-index: 29; width: 36px; height: 36px; margin: -18px 0 0 -18px; border-radius: 50%;
    background: rgba(29,155,240,.45); pointer-events: none; opacity: 0; transform: scale(.3); }
  #demo-ripple.on { animation: demo-ripple .45s ease-out; }
  @keyframes demo-ripple { 0% { opacity: .9; transform: scale(.3); } 100% { opacity: 0; transform: scale(1.3); } }
  #demo-caption { position: fixed; left: 50%; bottom: 28px; z-index: 28; pointer-events: none;
    transform: translate(-50%, 12px); opacity: 0; transition: opacity .3s, transform .3s; white-space: nowrap;
    display: flex; align-items: center; gap: 12px; padding: 12px 22px 12px 12px; border-radius: 9999px;
    background: rgba(21,24,28,.95); border: 1px solid #2f3336; box-shadow: 0 8px 28px rgba(0,0,0,.55);
    color: #e7e9ea; font: 600 19px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  #demo-caption.on { opacity: 1; transform: translate(-50%, 0); }
  #demo-caption b { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: #1d9bf0; color: #fff; font-size: 16px; }
</style>
</head>
<body>
  <div class="strip">
    <div id="tabs"></div>
    <div class="plus">${icon('<path d="M12 5v14M5 12h14"/>')}</div>
    <div class="win">
      <span>${icon('<path d="M5 12h14"/>')}</span>
      <span>${icon('<rect x="5" y="5" width="14" height="14" rx="1"/>')}</span>
      <span>${icon('<path d="M6 6l12 12M18 6L6 18"/>')}</span>
    </div>
  </div>
  <div class="bar">
    <div class="ic">${icon('<path d="M19 12H5M11 6l-6 6 6 6"/>')}</div>
    <div class="ic dim">${icon('<path d="M5 12h14M13 6l6 6-6 6"/>')}</div>
    <div class="ic">${icon('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>')}</div>
    <div class="omni" id="omni"></div>
    <div class="ic" id="ext"><img src="/icon-32.png" alt=""></div>
    <div class="ic dim"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4c-1.1 0-2 .9-2 2v3.8h1.5a2.7 2.7 0 0 1 0 5.4H2V20c0 1.1.9 2 2 2h3.8v-1.5a2.7 2.7 0 0 1 5.4 0V22H17c1.1 0 2-.9 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z"/></svg></div>
    <div class="ic"><span class="avatar"></span></div>
    <div class="ic">${icon('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>', 'fill="currentColor"')}</div>
  </div>
  <div id="views"></div>
  <div id="popup"><iframe title="XMarks popup"></iframe></div>
  <div id="demo-caption"></div>
  <div id="demo-ripple"></div>
  <div id="demo-cursor"><svg viewBox="0 0 22 22" width="22" height="22"><path d="M3 2l15 9.2-6.6 1.3L8 19z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg></div>
</body>
</html>`;

const GLOBE = icon('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>', 'class="fav"');
const LOCK = icon('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>');
const CLOSE = icon('<path d="M7 7l10 10M17 7L7 17"/>', 'class="close"');

const STAGE_JS = `(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  window.__stage = {
    // omni: [address bar HTML], src: the page shown in the tab.
    openTab({ title, fav, omni, src }) {
      for (const el of document.querySelectorAll('.tab.active, .view.active')) el.classList.remove('active');
      const tab = document.createElement('div');
      tab.className = 'tab active';
      tab.innerHTML = fav + '<span class="title">' + esc(title) + '</span>' + ${JSON.stringify(CLOSE)};
      $('tabs').append(tab);
      const view = document.createElement('div');
      view.className = 'view active';
      const frame = document.createElement('iframe');
      frame.src = src;
      view.append(frame);
      $('views').append(view);
      $('omni').innerHTML = omni;
    },
    loadPopup(src) {
      const ext = $('ext').getBoundingClientRect();
      $('popup').style.left = (ext.right + 4 - 380) + 'px';
      $('popup').querySelector('iframe').src = src;
      $('ext').classList.add('on');
    },
    showPopup() { $('popup').classList.add('open'); },
    closePopup() { $('popup').classList.remove('open'); $('ext').classList.remove('on'); },
    hoverExt(on) { $('ext').classList.toggle('hover', on); },
    at(x, y) { $('demo-cursor').style.setProperty('--x', (x - 3) + 'px'); $('demo-cursor').style.setProperty('--y', (y - 2) + 'px'); },
    ripple(x, y) {
      const r = $('demo-ripple');
      r.style.left = x + 'px'; r.style.top = y + 'px';
      r.classList.remove('on'); void r.offsetWidth; r.classList.add('on');
    },
    caption(step, text) {
      const c = $('demo-caption');
      c.classList.remove('on');
      setTimeout(() => {
        c.innerHTML = '<b>' + step + '</b><span>' + esc(text) + '</span>';
        c.classList.add('on');
      }, c.innerHTML ? 300 : 0);
    },
  };
})();`;


// ---- Cursor and captions ----
// Headless screencasts don't show the pointer, and mouse events inside the
// iframes never reach the window frame, so the drawn cursor is moved directly.

let pointer = { x: 900, y: 460 };

async function caption(page, step, text) {
  await page.evaluate(([s, t]) => window.__stage.caption(s, t), [step, text]);
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

async function pointAt(page, x, y) {
  await page.mouse.move(x, y);
  await page.evaluate(([px, py]) => window.__stage.at(px, py), [x, y]);
}

/** Glide the pointer to the centre of `target` (a locator, in any frame) over ~`ms`. */
async function moveTo(page, target, ms = 650) {
  const box = await target.boundingBox();
  if (!box) throw new Error('no bounding box for move target');
  const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const from = { ...pointer };
  // Timed by the clock: each step also waits on an evaluate for the drawn cursor.
  const start = Date.now();
  for (let k = 0; k < 1; ) {
    k = Math.min(1, (Date.now() - start) / ms);
    await pointAt(page, from.x + (to.x - from.x) * ease(k), from.y + (to.y - from.y) * ease(k));
  }
  pointer = to;
}

async function click(page, target, ms) {
  await moveTo(page, target, ms);
  await page.waitForTimeout(120);
  await page.evaluate(([x, y]) => window.__stage.ripple(x, y), [pointer.x, pointer.y]);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
}

/** The first frame whose URL passes `test`, once it exists. */
async function frameWhere(page, test) {
  for (let i = 0; i < 300; i++) {
    const frame = page.frames().find((f) => test(f.url()));
    if (frame) return frame;
    await page.waitForTimeout(50);
  }
  throw new Error('frame never appeared');
}


// ---- Screencast ----

const frames = []; // { t, file }
const speedRanges = []; // { from, to, speed } in wall-clock ms
let cdp = null;
let frameNo = 0;

async function startCast(page) {
  cdp = await page.context().newCDPSession(page);
  cdp.on('Page.screencastFrame', async ({ data, sessionId }) => {
    const file = path.join(FRAMES, `f${String(frameNo++).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ t: Date.now(), file });
    cdp?.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: VIEWPORT.width, maxHeight: VIEWPORT.height, everyNthFrame: 1 });
}

async function stopCast(page, hold = 0) {
  if (hold) await page.waitForTimeout(hold);
  // Repeat the last frame so the recording holds until this moment.
  const last = frames.at(-1);
  if (last) frames.push({ t: Date.now(), file: last.file });
  await cdp.send('Page.stopScreencast').catch(() => {});
  await cdp.detach().catch(() => {});
  cdp = null;
}

async function fast(speed, fn) {
  const from = Date.now();
  await fn();
  speedRanges.push({ from, to: Date.now(), speed });
}

/** Wall-clock duration from a to b, shortened inside the fast ranges. */
function played(a, b) {
  let ms = b - a;
  for (const r of speedRanges) {
    const overlap = Math.min(b, r.to) - Math.max(a, r.from);
    if (overlap > 0) ms -= overlap - overlap / r.speed;
  }
  return ms;
}

function encode() {
  const lines = [];
  for (let i = 0; i < frames.length - 1; i++) {
    const ms = played(frames[i].t, frames[i + 1].t);
    if (ms <= 0) continue;
    lines.push(`file '${frames[i].file.replaceAll('\\', '/')}'`, `duration ${(ms / 1000).toFixed(4)}`);
  }
  // The concat demuxer ignores the last entry's duration unless it's repeated.
  lines.push(lines.at(-2));
  const list = path.join(OUT, 'frames.txt');
  writeFileSync(list, lines.join('\n') + '\n');

  const mp4 = path.join(OUT, 'xmarks-demo.mp4');
  const gif = path.join(OUT, 'xmarks-demo.gif');
  const run = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  run(['-f', 'concat', '-safe', '0', '-i', list, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', mp4]);
  run(['-i', mp4, '-vf',
    `fps=${GIF_FPS},scale=${GIF_WIDTH}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
    '-loop', '0', gif]);
  console.log('wrote', mp4);
  console.log('wrote', gif);
}


// ---- Run ----

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

// The extension copy: dist/ plus the window page, content script in frames too.
const extDir = mkdtempSync(path.join(tmpdir(), 'xmarks-demo-ext-'));
cpSync(EXTENSION, extDir, { recursive: true });
const manifest = JSON.parse(readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));
for (const cs of manifest.content_scripts) cs.all_frames = true;
writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
writeFileSync(path.join(extDir, 'demo-stage.html'), STAGE_HTML);

const profile = mkdtempSync(path.join(tmpdir(), 'xmarks-demo-'));
const context = await chromium.launchPersistentContext(profile, {
  executablePath: BROWSER,
  headless: true,
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
  colorScheme: 'dark',
  args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
});

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 15000 }));
  const extId = new URL(worker.url()).host;
  console.log('extension', extId);

  const nowIso = new Date().toISOString();
  await worker.evaluate(async (iso) => {
    await chrome.storage.local.set({
      xmarks_onboarding: {
        version: 1, popupSeenAt: iso, dashboardSeenAt: iso, welcomePanelDismissed: true,
        firstSaveCompleted: true, firstSyncCompleted: true, firstDashboardActionCompleted: true,
        syncHintDismissed: true, saveModeGuidanceDismissed: true, tourCompletedAt: iso, tourDismissedAt: iso,
      },
    });
    await chrome.storage.sync.set({
      themeMode: 'dark', accentColor: '#1d9bf0', cardDensity: 'comfortable',
      saveMode: 'injected', injectedPosition: 'next-to-bookmark',
    });
  }, nowIso);

  const page = await context.newPage();

  await page.route('https://studio.local/', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: ASSETS_HTML }));
  await page.goto('https://studio.local/');
  const art = new Map();
  for (const el of await page.locator('[data-asset]').all()) {
    art.set(await el.getAttribute('data-asset'), await el.screenshot({ type: 'png', scale: 'css' }));
  }
  await page.unroute('https://studio.local/');
  loadAvatars(art);

  // The demo library, minus the post that gets saved on camera.
  const extUrl = (file) => `chrome-extension://${extId}/${file}`;
  await page.goto(extUrl('dashboard.html'));
  await page.waitForLoadState('networkidle');
  const lib = demoLibrary(Date.now(), (name) => (art.has(name) ? `data:image/png;base64,${art.get(name).toString('base64')}` : ''));
  lib.bookmarks = lib.bookmarks.filter((b) => b.authorHandle !== SAVED_HANDLE);
  await page.evaluate(async ({ categories, bookmarks }) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('TwitterBookmarkDB');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['bookmarks', 'categories'], 'readwrite');
      tx.objectStore('bookmarks').clear();
      tx.objectStore('categories').clear();
      for (const c of categories) tx.objectStore('categories').put({ ...c, createdAt: new Date(c.createdAt) });
      for (const b of bookmarks) {
        const row = { ...b, createdAt: new Date(b.createdAt), savedAt: new Date(b.savedAt) };
        if (!row.note) delete row.note;
        if (!row.quotedTweet) delete row.quotedTweet;
        tx.objectStore('bookmarks').put(row);
      }
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, lib);

  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'x.com' && url.pathname === '/home') {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: X_HOME });
    }
    if (url.hostname === 'x.com' && url.pathname === '/fixtures/x-home-posts.js') {
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: X_POSTS_JS });
    }
    if (url.hostname === 'pbs.twimg.com') {
      const name = path.basename(url.pathname, '.png');
      if (art.has(name)) return route.fulfill({ status: 200, contentType: 'image/png', body: art.get(name) });
    }
    return url.protocol.startsWith('http') ? route.abort() : route.continue();
  });

  await page.goto(extUrl('demo-stage.html'));
  await page.evaluate(STAGE_JS);
  await page.evaluate(([fav, lock]) => window.__stage.openTab({
    title: 'Home', fav, src: 'https://x.com/home',
    omni: `${lock}<span>x.com/home</span>`,
  }), [GLOBE, LOCK]);
  const x = await frameWhere(page, (u) => u.startsWith('https://x.com/home'));
  await x.waitForSelector('.twtbk-save-btn', { timeout: 15000 });
  await pointAt(page, pointer.x, pointer.y);
  await page.waitForTimeout(500);
  await startCast(page);

  // Scene 1: save a post from the timeline into a new category, with a note.
  console.log('scene 1: save');
  await caption(page, '1', 'Save a post to a new category, with a note');
  await page.waitForTimeout(1300);
  await click(page, x.locator('.twtbk-save-btn').first(), 800);
  await x.waitForSelector('.twtbk-popover', { timeout: 5000 });
  await page.waitForTimeout(700);
  await click(page, x.locator('#twtbk-note'), 550);
  await page.keyboard.type('my reply to every email from now on', { delay: 30 });
  await page.waitForTimeout(500);
  await click(page, x.locator('#twtbk-new-cat'), 550);
  await page.keyboard.type('Reactions', { delay: 55 });
  await page.waitForTimeout(350);
  await click(page, x.locator('#twtbk-add-cat'), 400);
  const reactions = x.locator('.twtbk-cat-item', { hasText: 'Reactions' });
  await reactions.waitFor({ timeout: 5000 });
  await reactions.evaluate((el) => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  await page.waitForTimeout(700);
  await click(page, reactions, 500);
  await x.waitForSelector('#twtbk-toast', { timeout: 5000 });
  await page.waitForTimeout(1700);

  // Scene 2: the toolbar popup with the latest saves.
  console.log('scene 2: popup');
  await caption(page, '2', 'Open XMarks from the toolbar');
  await page.waitForTimeout(900);
  await moveTo(page, page.locator('#ext'), 900);
  await page.evaluate(() => window.__stage.hoverExt(true));
  await page.waitForTimeout(350);
  await click(page, page.locator('#ext'), 100);
  await page.evaluate((src) => window.__stage.loadPopup(src), extUrl('index.html'));
  const popup = await frameWhere(page, (u) => u.endsWith('/index.html'));
  await fast(4, () => popup.waitForSelector('.popup-bm-item', { timeout: 10000 }));
  // Keep "Open Full Dashboard" in this window instead of opening a real tab.
  await popup.evaluate(() => { chrome.tabs.create = ({ url }) => { parent.__openTab = url; }; });
  await page.evaluate(() => { window.__stage.hoverExt(false); window.__stage.showPopup(); });
  await page.waitForTimeout(1300);
  await moveTo(page, popup.locator('.popup-bm-item').first(), 700);
  await page.waitForTimeout(1500);
  await click(page, popup.locator('.popup-footer .btn-primary'), 800);
  await page.waitForFunction(() => window.__openTab, null, { timeout: 5000 });

  // Scene 3: the dashboard. Tag the new post, then find it by its note.
  console.log('scene 3: dashboard');
  await page.waitForTimeout(250);
  await page.evaluate(([src, fav, id]) => {
    window.__stage.closePopup();
    window.__stage.openTab({
      title: 'XMarks - Dashboard', fav: `<img class="fav" src="/favicon.svg" alt="">`, src,
      omni: `${fav}<span class="chip">XMarks</span><span class="sep"></span><span class="rest">chrome-extension://${id}/dashboard.html</span>`,
    });
  }, [extUrl('dashboard.html'), '<img src="/icon-32.png" alt="">', extId]);
  const dash = await frameWhere(page, (u) => u.endsWith('/dashboard.html'));
  await fast(4, () => dash.waitForSelector('.bm-author-name', { timeout: 15000 }));
  await caption(page, '3', 'Tag it, sort it, find it again');
  await page.waitForTimeout(1600);
  await click(page, dash.locator('.sidebar-item', { hasText: 'Reactions' }).first(), 900);
  await page.waitForTimeout(1100);
  await click(page, dash.getByRole('button', { name: '+ Tag' }).first(), 800);
  await page.keyboard.type('iconic', { delay: 85 });
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1100);
  await click(page, dash.locator('.sidebar-item', { hasText: 'All Bookmarks' }).first(), 900);
  await page.waitForTimeout(900);
  await click(page, dash.locator('.search-input'), 700);
  await page.keyboard.type('email', { delay: 90 });
  await page.waitForTimeout(1100);
  await moveTo(page, dash.getByText('my reply to every email from now on').first(), 700);
  await stopCast(page, 2400);
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
  rmSync(extDir, { recursive: true, force: true });
}

encode();
console.log('done ->', OUT);
