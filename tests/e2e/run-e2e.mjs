/**
 * Real Chromium MV3 E2E Verification Suite for Ghadhul Bashar (غض البصر).
 *
 * Uses existing cached Playwright Chromium binary (--headless=new) without
 * downloading extra browsers, testing:
 *   1. Real 4-model ONNX WASM inference & two-tier dHash cache hit
 *   2. Closed Shadow DOM (<gb-overlay-root>) zero-flash & tamper resistance
 *   3. Zero-CORS media compatibility (audio & video without Access-Control-Allow-Origin)
 *   4. Zero-Hydration DOM attribute immutability on React/Next.js-style SSR nodes
 *   5. Responsive <picture>/<img srcset> currentSrc selection
 *   6. Popup UI, Arabic RTL layout switch, and Offline Time-Lock enforcement
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST_CHROME = path.join(ROOT, 'apps', 'extension', 'dist', 'chrome');
const CHROME_EXEC =
  process.env.GB_CHROME_EXEC ||
  '/home/ridlo/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function makePng(width, height, rgbFn) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = rgbFn(x, y, width, height);
      const px = row + 1 + x * 4;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(raw)),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeSilentWav(durationSec = 1, sampleRate = 8000) {
  const numSamples = durationSec * sampleRate;
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

function startServer(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      resolve({ server: srv, port: addr.port });
    });
  });
}

async function run() {
  assert.ok(fs.existsSync(DIST_CHROME), 'dist/chrome missing; run npm run build first');
  assert.ok(fs.existsSync(CHROME_EXEC), `Chromium binary missing at ${CHROME_EXEC}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-e2e-'));
  const userDataDir = path.join(tmpDir, 'profile');
  fs.mkdirSync(userDataDir, { recursive: true });

  // Prepare deterministic offline test fixtures
  const safePng = makePng(160, 120, (x, y) => [
    Math.round((x / 160) * 80) + 20,
    Math.round((y / 120) * 140) + 60,
    90,
  ]);
  // High-contrast 400x200 checkerboard left + crisp vertical stripes right for surgical blur pixel check
  const compositePng = makePng(400, 200, (x, y) => {
    const stripe = ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0) ? 245 : 15;
    if (x < 200) {
      return [stripe, stripe, stripe];
    }
    const bar = Math.floor(x / 6) % 2 === 0 ? 245 : 15;
    return [bar, bar, bar];
  });
  const hiResPng = makePng(240, 160, (x, y) => [
    40,
    Math.round((x / 240) * 180) + 40,
    Math.round((y / 160) * 150) + 50,
  ]);
  const fallbackPng = makePng(100, 100, () => [200, 30, 30]);
  const wavBuf = makeSilentWav(1);
  let webmBuf = null;

  const requestedUrls = [];

  // Cross-origin media server WITHOUT Access-Control-Allow-Origin headers
  const crossSrv = await startServer((req, res) => {
    if (req.url === '/quran.wav') {
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wavBuf.length });
      res.end(wavBuf);
      return;
    }
    if (req.url === '/stream.webm' && webmBuf) {
      res.writeHead(200, { 'Content-Type': 'video/webm', 'Content-Length': webmBuf.length });
      res.end(webmBuf);
      return;
    }
    res.writeHead(404).end();
  });

  // Main site origin
  const appSrv = await startServer((req, res) => {
    requestedUrls.push({
      url: req.url,
      secFetchSite: req.headers['sec-fetch-site'] || '',
      userAgent: req.headers['user-agent'] || '',
    });

    if (req.url === '/safe.png' || req.url === '/safe-copy.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' }).end(safePng);
      return;
    }
    if (req.url === '/composite.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' }).end(compositePng);
      return;
    }
    if (req.url === '/hi-res.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' }).end(hiResPng);
      return;
    }
    if (req.url === '/fallback.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' }).end(fallbackPng);
      return;
    }
    if (req.url === '/iframe.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' }).end(`
        <!doctype html><html><body>
          <img id="iframe-img" src="/safe.png" width="120" height="90" />
        </body></html>
      `);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(`
      <!doctype html>
      <html>
        <head><title>Ghadhul Bashar E2E Fixture</title></head>
        <body>
          <div id="ssr-root">
            <img id="ssr-img" src="/safe.png" width="160" height="120" class="hero-img" />
            <img id="dup-img" src="/safe.png" width="160" height="120" class="dup-img" />
          </div>
          <picture>
            <source srcset="/hi-res.png 1x" />
            <img id="srcset-img" src="/fallback.png" width="240" height="160" />
          </picture>
          <img id="composite-img" src="/composite.png" width="400" height="200" style="display:block; margin: 12px 0;" />
          <audio id="quran-audio" src="http://127.0.0.1:${crossSrv.port}/quran.wav" preload="auto"></audio>
          ${
            webmBuf
              ? `<video id="cross-video" src="http://127.0.0.1:${crossSrv.port}/stream.webm" width="160" height="120" muted playsinline autoplay loop preload="auto"></video>`
              : ''
          }
          <iframe id="child-frame" src="/iframe.html" width="160" height="120"></iframe>
        </body>
      </html>
    `);
  });

  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      executablePath: CHROME_EXEC,
      headless: false,
      args: [
        '--headless=new',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        `--disable-extensions-except=${DIST_CHROME}`,
        `--load-extension=${DIST_CHROME}`,
      ],
    });

    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 15_000 });
    }
    const extId = new URL(sw.url()).host;
    assert.ok(extId, 'Extension ID should resolve from service worker URL');

    // Close onboarding tab if auto-opened on install so test tab stays clean
    for (const p of context.pages()) {
      if (p.url().includes('onboarding.html')) {
        await p.close();
      }
    }

    // Generate a real WebM video clip via Chromium MediaRecorder (zero external deps)
    const genPage = await context.newPage();
    const webmBytes = await genPage.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = 120;
      const ctx = c.getContext('2d');
      const stream = c.captureStream(10);
      const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      const done = new Promise((res) => (rec.onstop = res));
      rec.start();
      for (let f = 0; f < 4; f++) {
        ctx.fillStyle = f % 2 === 0 ? '#11332b' : '#1b4d3e';
        ctx.fillRect(0, 0, 160, 120);
        await new Promise((r) => setTimeout(r, 70));
      }
      rec.stop();
      await done;
      const blob = new Blob(chunks, { type: 'video/webm' });
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    webmBuf = Buffer.from(webmBytes);
    await genPage.close();

    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(`http://127.0.0.1:${appSrv.port}/`, { waitUntil: 'networkidle' });

    // 1. Verify Closed Shadow DOM overlay host exists & is tamper-resistant
    await page.waitForFunction(
      () => Boolean(document.documentElement.querySelector('gb-overlay-root')),
      { timeout: 10_000 }
    );
    const shadowClosed = await page.evaluate(() => {
      const host = document.documentElement.querySelector('gb-overlay-root');
      return host !== null && host.shadowRoot === null;
    });
    assert.equal(shadowClosed, true, 'gb-overlay-root must use closed ShadowRoot');

    // 2. Verify Zero DOM Attribute Mutation (SSR Hydration safety + zero crossorigin mutation)
    const attrAudit = await page.evaluate(() => {
      const img = document.getElementById('ssr-img');
      const audio = document.getElementById('quran-audio');
      const video = document.getElementById('cross-video');
      return {
        imgAttrs: Array.from(img.attributes).map((a) => `${a.name}=${a.value}`),
        audioCrossorigin: audio.getAttribute('crossorigin'),
        audioError: audio.error ? audio.error.code : null,
        audioReadyState: audio.readyState,
        videoCrossorigin: video ? video.getAttribute('crossorigin') : null,
        videoError: video && video.error ? video.error.code : null,
        videoReadyState: video ? video.readyState : 1,
      };
    });

    assert.deepEqual(attrAudit.imgAttrs, [
      'id=ssr-img',
      'src=/safe.png',
      'width=160',
      'height=120',
      'class=hero-img',
    ]);
    assert.equal(attrAudit.audioCrossorigin, null, 'Must never mutate crossorigin on audio');
    assert.equal(attrAudit.audioError, null, 'Cross-origin audio without CORS must not error');
    assert.equal(attrAudit.videoCrossorigin, null, 'Must never mutate crossorigin on video');
    assert.equal(attrAudit.videoError, null, 'Cross-origin video without CORS must not error');

    // 3. Wait for real ONNX inference across page images and check telemetry via popup
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/ui/popup.html`, { waitUntil: 'domcontentloaded' });

    // Inject a distinct URL (/safe-copy.png) with identical pixels to verify Perceptual dHash cache hit
    await page.evaluate(() => {
      const img = document.createElement('img');
      img.id = 'dhash-clone';
      img.src = '/safe-copy.png';
      img.width = 160;
      img.height = 120;
      document.body.appendChild(img);
    });

    // Poll until checkedCount >= 5 (ssr-img, dup-img, srcset-img, composite-img, dhash-clone, iframe-img)
    let telemetry = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      telemetry = await popup.evaluate(async () => {
        const tabs = await chrome.tabs.query({ url: 'http://127.0.0.1/*' });
        const tabId = tabs[0]?.id;
        return chrome.runtime.sendMessage({ type: 'GB_GET_TAB_TELEMETRY', tabId });
      });
      if (telemetry && telemetry.checkedCount >= 5 && telemetry.cacheHitCount >= 1 && telemetry.backend !== 'idle') {
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    assert.ok(telemetry, 'Tab telemetry must be returned');
    assert.ok(telemetry.checkedCount >= 5, `Expected >=5 checked images, got ${telemetry.checkedCount}`);
    assert.ok(telemetry.cacheHitCount >= 1, `Expected >=1 dHash/URL cache hit for safe-copy/dup, got ${telemetry.cacheHitCount}`);
    assert.ok(telemetry.backend === 'wasm' || telemetry.backend === 'webgpu', `Unexpected backend: ${telemetry.backend}`);

    // 4. Verify real Chromium Surgical Frosted Blur pixel isolation via screenshot:
    // Apply surgical mask ONLY to left region [0.05..0.40, 0.10..0.90] of #composite-img, leaving right side sharp!
    await popup.evaluate(async () => {
      const tabs = await chrome.tabs.query({ url: 'http://127.0.0.1/*' });
      const tabId = tabs[0]?.id;
      await chrome.tabs.sendMessage(tabId, {
        type: 'GB_MANUAL_OVERRIDE',
        mode: 'mask',
        selector: '#composite-img',
        regions: [{ x: 0.05, y: 0.10, w: 0.35, h: 0.80, label: 'FACE_FEMALE', confidence: 0.95 }],
      });
    });
    await page.bringToFront();
    await new Promise((r) => setTimeout(r, 200));

    const compRect = await page.evaluate(() => {
      const r = document.getElementById('composite-img').getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    });
    const shotBuf = await page.screenshot();
    // Inspect PNG pixel contrast inside Playwright page canvas from screenshot data URL
    const contrastMetrics = await page.evaluate(async ({ b64, rect }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await new Promise((res) => (img.onload = res));
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const measureStd = (rx, ry, rw, rh) => {
        const d = ctx.getImageData(rx, ry, rw, rh).data;
        let sum = 0;
        let sumSq = 0;
        const n = rw * rh;
        for (let i = 0; i < d.length; i += 4) {
          const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          sum += lum;
          sumSq += lum * lum;
        }
        const mean = sum / n;
        return Math.sqrt(Math.max(0, sumSq / n - mean * mean));
      };

      const maskedStd = measureStd(rect.x + 40, rect.y + 40, 80, 80);
      const sharpStd = measureStd(rect.x + 250, rect.y + 40, 80, 80);
      return { maskedStd, sharpStd };
    }, { b64: shotBuf.toString('base64'), rect: compRect });

    assert.ok(
      contrastMetrics.maskedStd < 30,
      `Surgical blurred left region should have low contrast std (<30), got ${contrastMetrics.maskedStd.toFixed(1)}`
    );
    assert.ok(
      contrastMetrics.sharpStd > 85,
      `Unmasked right region must remain 100% sharp (std >85), got ${contrastMetrics.sharpStd.toFixed(1)}`
    );

    // 4. Verify <picture>/<source> currentSrc classification: fallback.png must NOT be fetched by extension offscreen
    const hiResRequests = requestedUrls.filter((r) => r.url === '/hi-res.png').length;
    const fallbackRequests = requestedUrls.filter((r) => r.url === '/fallback.png').length;
    assert.ok(hiResRequests >= 2, `Expected hi-res.png to be fetched by page + extension, got ${hiResRequests}`);
    assert.equal(fallbackRequests, 0, 'fallback.png from <picture> must not be analyzed instead of currentSrc');

    // 5. Verify Arabic RTL layout switching in Popup + Offline Time-Lock enforcement
    await popup.selectOption('#localeSelect', 'ar');
    await popup.waitForFunction(() => document.documentElement.dir === 'rtl');
    const dirAr = await popup.evaluate(() => document.documentElement.dir);
    assert.equal(dirAr, 'rtl');

    await popup.click('#lockBtn');
    const lockAttempt = await popup.evaluate(async () => {
      const current = await chrome.runtime.sendMessage({ type: 'GB_GET_SETTINGS' });
      return chrome.runtime.sendMessage({
        type: 'GB_UPDATE_SETTINGS',
        next: { ...current, enabled: false },
      });
    });
    assert.equal(lockAttempt.ok, false, 'Offline Time-Lock must block disabling protection');
    assert.equal(lockAttempt.error, 'LOCKED');

    assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join('; ')}`);

    console.log(
      `[E2E PASS] backend=${telemetry.backend}, checked=${telemetry.checkedCount}, cacheHits=${telemetry.cacheHitCount}, avgLatency=${telemetry.avgLatencyMs}ms, zeroCorsBreakage=OK, ssrHydrationSafe=OK, currentSrcOnly=OK, timeLock=OK`
    );
  } finally {
    await context?.close().catch(() => {});
    appSrv.server.close();
    crossSrv.server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error('[E2E FAIL]', err);
  process.exit(1);
});
