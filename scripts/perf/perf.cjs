#!/usr/bin/env node
// Frame-level checks for the street's animations, run in the Chrome installed on
// this machine. See README.md for what each check measures and how to read it.
//
//   node scripts/perf/perf.cjs [check] [--phone] [--cpu=N] [--runs=N] [--url=URL]
//   checks: smoke, opening, glides, swipes, hurry, all (default)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright-core');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.includes('=') ? hit.split('=').slice(1).join('=') : true;
};
const check = args.find(a => !a.startsWith('--')) || 'all';
const DIST = path.resolve(__dirname, '../../dist');

const desktop = {name: 'desktop 1440×900@2x', context: {viewport: {width: 1440, height: 900}, deviceScaleFactor: 2}};
const phone = {name: 'phone 390×844@3x', phone: true,
  context: {viewport: {width: 390, height: 844}, deviceScaleFactor: 3, isMobile: true, hasTouch: true}};

// Compositor frame outcomes come from Chrome's PipelineReporter trace events.
const TRACE = '-*,cc,benchmark,blink.user_timing,disabled-by-default-devtools.timeline.frame,devtools.timeline,gpu';

// ---- Local static server for dist/ --------------------------------------------
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.json': 'application/json', '.pdf': 'application/pdf', '.txt': 'text/plain'};
function serve() {
  const server = http.createServer((req, res) => {
    let name = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (name.endsWith('/')) name += 'index.html';
    const file = path.join(DIST, name);
    if (!file.startsWith(DIST + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404); return res.end(); }
      res.writeHead(200, {'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// ---- Shared helpers ------------------------------------------------------------
let browser, cdp, base;

async function newPage(profile, {cpu = 1} = {}) {
  const context = await browser.newContext(profile.context);
  const page = await context.newPage();
  await page.bringToFront();
  if (cpu > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', {rate: cpu});
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  // perf:* marks land in the trace; window.perf holds the same moments for the page side.
  await page.addInitScript(() => {
    const perf = window.perf = {openingEnded: false, pullAt: 0};
    const mark = name => performance.mark('perf:' + name);
    document.addEventListener('animationstart', event => {
      if (event.animationName === 'needle-pullback') { perf.pullAt = performance.now(); mark('pull'); }
    }, true);
    document.addEventListener('street-opening-end', () => { perf.openingEnded = true; mark('opening-end'); });
    document.addEventListener('DOMContentLoaded', () => {
      const rail = document.getElementById('street-rail');
      perf.glides = [];
      let current = null;
      new MutationObserver(() => {
        if (rail.hasAttribute('data-route-gliding')) { current = {t: [], x: []}; perf.glides.push(current); mark('glide-start'); }
        else { current = null; mark('glide-end'); }
      }).observe(rail, {attributes: true, attributeFilter: ['data-route-gliding']});
      (function sample(time) {
        if (current) { current.t.push(time); current.x.push(rail.scrollLeft); }
        requestAnimationFrame(sample);
      })(performance.now());
    });
  });
  return {page, context, errors};
}

async function traced(work) {
  const events = [];
  const collect = event => events.push(...event.value);
  cdp.on('Tracing.dataCollected', collect);
  await cdp.send('Tracing.start', {transferMode: 'ReportEvents', categories: TRACE});
  try { await work(); } finally {
    const complete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
    await cdp.send('Tracing.end');
    await complete;
    cdp.off('Tracing.dataCollected', collect);
  }
  return events;
}

// Frames Chrome dropped between two trace timestamps, plus the slowest main-thread frame.
function frameStats(events, pid, from, to) {
  const frames = new Map();
  let longestMain = 0, main = 0, raster = 0;
  for (const event of events) {
    if (event.ts < from || event.ts > to) continue;
    if (event.name === 'PipelineReporter' && event.ph === 'b' && event.pid === pid) {
      const report = event.args.chrome_frame_reporter || event.args.frame_reporter || {};
      if (report.frame_type === 'FORKED' || report.state === 'STATE_NO_UPDATE_DESIRED') continue;
      if (report.state === 'STATE_DROPPED' || !frames.has(report.frame_sequence)) frames.set(report.frame_sequence, report.state);
    }
    if (event.ph !== 'X' || !event.dur) continue;
    if (event.name === 'ProxyMain::BeginMainFrame' && event.pid === pid) {
      main += event.dur / 1000;
      longestMain = Math.max(longestMain, event.dur / 1000);
    }
    if (event.name === 'RasterTask') raster += event.dur / 1000;
  }
  const dropped = [...frames.values()].filter(state => state === 'STATE_DROPPED').length;
  return {dropped, frames: frames.size, longestMain, main, raster};
}

const marks = (events, name) => events.filter(e => e.name === 'perf:' + name).sort((a, b) => a.ts - b.ts);
const fmt = n => n.toFixed(1);
const say = line => console.log(line);

async function settleOpening(page) {
  await page.waitForFunction(() => window.perf.openingEnded, null, {timeout: 15000});
}

// ---- Checks --------------------------------------------------------------------
async function smoke() {
  say('\n== smoke: loads every stop, no failed requests or script errors');
  const {page, context, errors} = await newPage(desktop);
  const failed = [];
  page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) failed.push(`${r.status()} ${r.url()}`); });
  await page.goto(base);
  await page.mouse.move(300, 400);
  await settleOpening(page);
  for (const hash of ['#work', '#experience', '#contact', '#about']) {
    await page.click(`.route-nav a[href="${hash}"]`);
    await page.waitForTimeout(1500);
  }
  const state = await page.evaluate(() => ({hash: location.hash, pulled: window.perf.pullAt > 0,
    stage: !document.querySelector('.city-stage').hidden}));
  await context.close();
  const ok = state.pulled && state.stage && state.hash === '#about' && !failed.length && !errors.length;
  say(`   opening played: ${state.pulled}, street shown: ${state.stage}, ended at ${state.hash}`);
  if (failed.length) say('   failed requests:\n     ' + failed.join('\n     '));
  if (errors.length) say('   script errors:\n     ' + errors.join('\n     '));
  say(`   ${ok ? 'OK' : 'PROBLEM'}`);
  return ok;
}

async function opening(profile, cpu, runs) {
  say(`\n== opening: camera pullback, ${profile.name}, CPU ${cpu}×, ${runs} runs`);
  const rows = [];
  for (let run = 0; run < runs; run++) {
    const {page, context} = await newPage(profile, {cpu});
    const events = await traced(async () => {
      await page.goto(base);
      await settleOpening(page);
    });
    const [pull] = marks(events, 'pull'), [end] = marks(events, 'opening-end');
    if (pull && end) rows.push(frameStats(events, pull.pid, pull.ts, end.ts));
    await context.close();
  }
  if (!rows.length) return say('   the opening never played');
  say(`   dropped frames per run: [${rows.map(r => r.dropped)}]`);
  const avg = key => fmt(rows.reduce((t, r) => t + r[key], 0) / rows.length);
  say(`   per run: main thread ${avg('main')}ms, raster ${avg('raster')}ms, slowest main frame ${fmt(Math.max(...rows.map(r => r.longestMain)))}ms`);
}

async function glides(profile, cpu, runs) {
  const order = ['#work', '#experience', '#contact', '#about', '#work'];
  say(`\n== glides: top nav after the opening (${order.join(' → ')}), ${profile.name}, CPU ${cpu}×, ${runs} runs`);
  const table = order.map(() => []);
  for (let run = 0; run < runs; run++) {
    const {page, context} = await newPage(profile, {cpu});
    await page.goto(base);
    // A real visitor's pointer has moved long before the first click; Chrome's
    // first pointer event costs ~35ms and would otherwise land in the first glide.
    if (!profile.phone) await page.mouse.move(300, 400);
    await settleOpening(page);
    await page.waitForTimeout(1000);
    const events = await traced(async () => {
      for (const hash of order) {
        const link = `.route-nav a[href="${hash}"]`;
        await (profile.phone ? page.tap(link) : page.click(link));
        await page.waitForTimeout(2200);
      }
    });
    const recorded = await page.evaluate(() => window.perf.glides);
    const starts = marks(events, 'glide-start'), ends = marks(events, 'glide-end');
    order.forEach((hash, i) => {
      if (!starts[i] || !ends[i] || !recorded[i]) return;
      const stats = frameStats(events, starts[i].pid, starts[i].ts, ends[i].ts);
      const t = recorded[i].t;
      const gaps = t.slice(1).map((v, k) => v - t[k]).filter(v => v > 20).length;
      table[i].push(`${stats.dropped} dropped, ${gaps} slow, ${Math.round(t.at(-1) - t[0])}ms`);
    });
    await context.close();
  }
  order.forEach((hash, i) => say(`   ${String(i + 1)}. ${hash.padEnd(12)} ${table[i].join('  |  ')}`));
}

async function swipes(cpu, runs) {
  say(`\n== swipes: finger swipes on the street, ${phone.name}, CPU ${cpu}×, ${runs} runs`);
  let dropped = 0, frames = 0;
  const perSwipe = [];
  for (let run = 0; run < runs; run++) {
    const {page, context} = await newPage(phone, {cpu});
    const input = await context.newCDPSession(page);
    await page.goto(base);
    await settleOpening(page);
    await page.waitForTimeout(1000);
    for (const dx of [-320, -320, -320, -320, 320, 320, 320, 320]) {
      const events = await traced(async () => {
        await page.evaluate(() => performance.mark('perf:swipe-start'));
        await input.send('Input.synthesizeScrollGesture', {x: 200, y: 520, xDistance: dx, yDistance: 0, speed: 1400, gestureSourceType: 'touch'});
        await page.waitForTimeout(1600);
        await page.evaluate(() => performance.mark('perf:swipe-end'));
      });
      const [a] = marks(events, 'swipe-start'), [b] = marks(events, 'swipe-end');
      const stats = frameStats(events, a.pid, a.ts, b.ts);
      dropped += stats.dropped; frames += stats.frames; perSwipe.push(stats.dropped);
    }
    await context.close();
  }
  say(`   dropped ${dropped} of ${frames} frames (${fmt(dropped / frames * 100)}%), per swipe: [${perSwipe}]`);
  say('   swipes 1–4 move away from About, 5–8 come back');
}

async function hurry(profile) {
  say(`\n== hurry: a nav click mid-opening should finish the zoom smoothly, ${profile.name}`);
  for (const [label, offset] of [['0.9s into the pullback', 900], ['1.5s into the pullback', 1500]]) {
    const {page, context} = await newPage(profile);
    await page.goto(base);
    if (!profile.phone) await page.mouse.move(300, 400);
    await page.waitForFunction(() => window.perf.pullAt > 0, null, {timeout: 15000});
    await page.evaluate(offset => new Promise(resolve => {
      const due = window.perf.pullAt + offset;
      (function wait() { if (performance.now() >= due) resolve(); else setTimeout(wait, 4); })();
    }), offset);
    await page.evaluate(() => {
      const stage = document.querySelector('.city-stage');
      window.perf.scales = [];
      (function sample() {
        window.perf.scales.push(new DOMMatrix(getComputedStyle(stage).transform).a);
        if (!window.perf.glides.length) requestAnimationFrame(sample);
      })();
    });
    const link = '.route-nav a[href="#work"]';
    await (profile.phone ? page.tap(link) : page.click(link));
    await page.waitForTimeout(2500);
    const {scales, hash} = await page.evaluate(() => ({scales: window.perf.scales, hash: location.hash}));
    const jump = Math.max(0, ...scales.slice(1).map((s, i) => Math.abs(s - scales[i])));
    say(`   ${label}: zoom ${fmt(scales[0])}× → 1×, largest one-frame change ${jump.toFixed(3)} (a cut is 0.2+), arrived ${hash}`);
    await context.close();
  }
}

// ---- Main ----------------------------------------------------------------------
(async () => {
  const server = flag('url') ? null : await serve();
  base = flag('url') || `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({channel: 'chrome', headless: false,
    args: ['--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']});
  cdp = await browser.newBrowserCDPSession();
  const runs = Number(flag('runs', 3));
  const cpu = Number(flag('cpu', 0));
  const profile = flag('phone') ? phone : desktop;
  let ok = true;
  say(`Chrome ${browser.version()} · ${base}`);
  try {
    if (check === 'smoke') ok = await smoke();
    else if (check === 'opening') await opening(profile, cpu || (profile.phone ? 4 : 1), runs);
    else if (check === 'glides') await glides(profile, cpu || (profile.phone ? 4 : 1), runs);
    else if (check === 'swipes') await swipes(cpu || 4, Number(flag('runs', 2)));
    else if (check === 'hurry') await hurry(profile);
    else if (check === 'all') {
      ok = await smoke();
      await opening(desktop, 1, runs);
      await opening(phone, 4, runs);
      await glides(desktop, 1, runs);
      await glides(phone, 4, 2);
      await swipes(4, 2);
      await hurry(desktop);
    } else {
      say(`unknown check "${check}" (smoke, opening, glides, swipes, hurry, all)`);
      ok = false;
    }
  } finally {
    await browser.close();
    server?.close();
  }
  process.exitCode = ok ? 0 : 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
