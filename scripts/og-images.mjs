#!/usr/bin/env node
/**
 * Render the link-preview cards (1200×630):
 *   public/og-image.png        — the site
 *   public/video/og-image.png  — the "How it works" film page
 *
 *   node scripts/og-images.mjs [--pw <playwright-core dir>] [--qr <qrcode dir>]
 *
 * Background: scripts/og/background.jpg (Downtown Memphis at blue hour,
 * generated with Higgsfield — no text in it). Everything on top — words and a
 * real, scannable QR code — is drawn here, so it stays crisp and exact.
 * Needs playwright-core + qrcode (not dependencies: `npm i --no-save
 * playwright-core qrcode`, or pass their folders) and Google Chrome
 * (override with CHROME_PATH).
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? resolve(process.argv[i + 1]) : null;
};
const { chromium } = require(arg('--pw') ?? 'playwright-core');
const QRCode = require(arg('--qr') ?? 'qrcode');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const SITE = 'https://www.901safety.com';
const SITE_SHORT = '901safety.com';

// Inlined as data URLs: a page built with setContent() can't load file:// assets.
const BG = join(ROOT, 'scripts', 'og', 'background.jpg');
if (!existsSync(BG)) throw new Error('missing scripts/og/background.jpg');
const dataUrl = (path, type) => `data:${type};base64,${readFileSync(path).toString('base64')}`;
const font = (pkg, file) => dataUrl(join(ROOT, 'node_modules', '@fontsource-variable', pkg, 'files', file), 'font/woff2');
const filmSeconds = Number(readFileSync(join(ROOT, 'src', 'film', 'filmMeta.ts'), 'utf8').match(/FILM_DURATION = ([\d.]+)/)?.[1] ?? 0);
const filmLength = `${Math.floor(filmSeconds / 60)}:${String(Math.floor(filmSeconds % 60)).padStart(2, '0')}`;

const qr = (url) =>
  QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0b1222', light: '#ffffff' } });

const SHIELD = `<svg viewBox="0 0 64 64" width="60" height="60"><defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26406b"/><stop offset="1" stop-color="#111a33"/></linearGradient>
  <linearGradient id="sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e7cd8c"/><stop offset=".55" stop-color="#c5a55a"/><stop offset="1" stop-color="#b08e44"/></linearGradient></defs>
  <rect width="64" height="64" rx="15" fill="url(#bg)"/><rect x="1.75" y="1.75" width="60.5" height="60.5" rx="13.25" fill="none" stroke="#c5a55a" stroke-opacity=".35" stroke-width="1.5"/>
  <path d="M19 15.5 L45 15.5 Q47 15.5 47 18 L47 33 Q47 43.5 32 50.5 Q17 43.5 17 33 L17 18 Q17 15.5 19 15.5 Z" fill="url(#sh)"/>
  <path d="M24.5 32.6 L29.8 38 L40 26.4" fill="none" stroke="#13203a" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const PHONE = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>`;

const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: Inter; src: url(${font('inter', 'inter-latin-wght-normal.woff2')}) format('woff2'); font-weight: 100 900; }
  @font-face { font-family: Mono; src: url(${font('jetbrains-mono', 'jetbrains-mono-latin-wght-normal.woff2')}) format('woff2'); font-weight: 100 800; }
  * { box-sizing: border-box; margin: 0; }
  body { position: relative; width: 1200px; height: 630px; overflow: hidden; font-family: Inter, sans-serif; color: #fff;
    background: url(${dataUrl(BG, 'image/jpeg')}) center 38% / cover no-repeat, #070b16; }
  .shade { position: absolute; inset: 0;
    background:
      linear-gradient(90deg, rgb(7 11 22 / .93) 0%, rgb(7 11 22 / .82) 34%, rgb(7 11 22 / .38) 58%, rgb(7 11 22 / 0) 76%),
      linear-gradient(0deg, rgb(7 11 22 / .7) 0%, rgb(7 11 22 / 0) 38%),
      radial-gradient(42% 52% at 88% 86%, rgb(7 11 22 / .62), transparent 70%); }
  .card { position: absolute; inset: 0; padding: 54px 64px 50px; }
  .brand { display: flex; align-items: center; gap: 16px; }
  .brand b { display: block; font-size: 23px; font-weight: 700; letter-spacing: -.01em; }
  .brand i { display: block; margin-top: 5px; font-style: normal; font-size: 12.5px; font-weight: 700; letter-spacing: .22em; text-transform: uppercase; color: #ddc882; }
  .eyebrow { margin-top: 44px; display: inline-flex; align-items: center; gap: 10px; font-size: 14.5px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: #ddc882; }
  .eyebrow::before { content: ''; width: 9px; height: 9px; border-radius: 99px; background: #34d399; box-shadow: 0 0 0 4px rgb(52 211 153 / .18); }
  h1 { margin-top: 14px; font-size: 60px; line-height: 1.02; font-weight: 800; letter-spacing: -.028em; text-shadow: 0 2px 26px rgb(0 0 0 / .5); }
  h1 em { font-style: normal; color: #e8d9a8; }
  .lede { margin-top: 16px; max-width: 590px; font-size: 22px; line-height: 1.38; color: #d6dcea; text-shadow: 0 1px 14px rgb(0 0 0 / .5); }
  .chips { margin-top: 22px; display: flex; flex-wrap: nowrap; gap: 8px; }
  .chips span { padding: 6px 12px; border-radius: 999px; border: 1px solid rgb(232 217 168 / .38); background: rgb(11 18 34 / .62);
    font-size: 14.5px; font-weight: 600; color: #f3eace; white-space: nowrap; backdrop-filter: blur(4px); }
  .sos { margin-top: 20px; display: inline-flex; align-items: center; gap: 9px; padding: 8px 15px 8px 12px; border-radius: 999px;
    border: 1.5px solid rgb(248 113 113 / .75); background: rgb(69 10 10 / .5); color: #fecaca; font-size: 15px; font-weight: 700; }
  .scan { position: absolute; right: 56px; bottom: 44px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .qr { width: 178px; height: 178px; padding: 13px; border-radius: 20px; background: #fff;
    box-shadow: 0 0 0 4px rgb(212 181 102 / .9), 0 18px 50px rgb(0 0 0 / .55); }
  .qr svg { display: block; width: 100%; height: 100%; }
  .scan b { font-family: Mono, monospace; font-size: 19px; font-weight: 700; color: #f3eace; text-shadow: 0 1px 10px rgb(0 0 0 / .7); }
  .scan small { margin-top: -6px; font-size: 13px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: #ddc882; }
  .play { display: inline-flex; align-items: center; gap: 12px; margin-top: 24px; padding: 11px 22px 11px 12px; border-radius: 999px;
    background: #d4b566; color: #0b1222; font-size: 21px; font-weight: 800; box-shadow: 0 12px 34px rgb(0 0 0 / .45); }
  .play span { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 999px; background: #0b1222; }
</style></head><body><div class="shade"></div><div class="card">${body}</div></body></html>`;

const brand = `<div class="brand">${SHIELD}<div><b>Core Downtown Memphis</b><i>Safety Dashboard</i></div></div>`;
const sos = `<div><div class="sos">${PHONE} In danger? Call 911 first.</div></div>`;
const scan = (url, label) => `<div class="scan"><div class="qr">${url}</div><b>${label}</b><small>Scan to open</small></div>`;

const cards = [
  {
    out: join(ROOT, 'public', 'og-image.png'),
    html: page(`${brand}
      <div class="eyebrow">A self-regulated safety dashboard</div>
      <h1>Downtown Memphis,<br><em>watching out for<br>each other.</em></h1>
      <p class="lede">Businesses report what they see. Downtown public-safety officers see it at once.</p>
      <div class="chips"><span>Report by voice</span><span>Guided form</span><span>Quick alert</span><span>Live Ops map</span><span>Lookout board</span></div>
      ${sos}${scan(await qr(SITE), SITE_SHORT)}`),
  },
  {
    out: join(ROOT, 'public', 'video', 'og-image.png'),
    html: page(`${brand}
      <div class="eyebrow">How it works · film · ${filmLength}</div>
      <h1>How the Safety<br><em>Dashboard works</em></h1>
      <p class="lede">A self-regulated safety dashboard for Downtown Memphis — report, respond, stay in the loop.</p>
      <div class="play"><span><svg width="16" height="18" viewBox="0 0 18 20"><path d="M2 1.5 L16.5 10 L2 18.5 Z" fill="#d4b566"/></svg></span>Watch · ${filmLength}</div>
      ${sos}${scan(await qr(`${SITE}/how-it-works`), `${SITE_SHORT}/how-it-works`)}`),
  },
];

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--headless=new'] });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
for (const card of cards) {
  const p = await ctx.newPage();
  await p.setContent(card.html, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(200);
  await p.screenshot({ path: card.out, type: 'png' });
  console.log('wrote', card.out.replace(`${ROOT}/`, ''));
}
await browser.close();
