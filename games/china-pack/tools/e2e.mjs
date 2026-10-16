/* End-to-end check of the built page.
 *
 * Launches Microsoft Edge headless with remote debugging, loads index.html over file://, and
 * drives it through the DevTools protocol: click 寮€濮? play a whole round by dispatching real
 * pointer events at the canvas, read the game's own state, and save screenshots.
 *
 * Run: node tools/e2e.mjs      (from the china-pack directory)
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const EDGE = EDGE_CANDIDATES.find((p) => fs.existsSync(p));
const PAGE = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const OUT = path.join(ROOT, 'data');
const PORT = 9333;
const profile = path.join(os.tmpdir(), 'dsh-cn-pack-edge');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!EDGE) {
  console.error('no Edge/Chrome found; skipping the browser check');
  process.exit(0);
}
console.log('browser:', EDGE);
console.log('page   :', PAGE);

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--mute-audio', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--window-size=420,880', '--force-device-scale-factor=2', PAGE,
], { stdio: 'ignore' });

let ws;
let nextId = 1;
const waiting = new Map();
const consoleLogs = [];
const pageErrors = [];

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('page exception: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}

try {
  // find the page target
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(500);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    } catch { /* not up yet */ }
  }
  if (!target) throw new Error('could not attach to Edge');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && waiting.has(msg.id)) {
      const { resolve, reject } = waiting.get(msg.id);
      waiting.delete(msg.id);
      if (msg.error) reject(new Error(msg.method + ': ' + JSON.stringify(msg.error)));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      consoleLogs.push(`${msg.params.type}: ` + msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      pageErrors.push('log: ' + msg.params.entry.text);
    }
  };

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: PAGE });
  await sleep(2500);

  // --- the page loaded and the game initialised ---
  const boot = await evaluate(`(() => ({
    hasGame: typeof window.__cnPack === 'object',
    total: window.__cnPack && window.__cnPack.TOTAL,
    state: window.__cnPack && window.__cnPack.state,
    titleHidden: document.getElementById('title').hidden,
    canvasW: document.getElementById('cv').style.width,
    canvasH: document.getElementById('cv').style.height,
    startVisible: !document.getElementById('start').hidden,
    provNames: window.__cnPack ? Object.keys(window.__cnPack.PROV).length : 0,
  }))()`);
  console.log('boot:', JSON.stringify(boot));

  await send('Page.captureScreenshot', {}).then((r) => fs.writeFileSync(`${OUT}/shots/shot-title.png`, Buffer.from(r.data, 'base64')));

  // --- press 寮€濮?---
  await evaluate(`document.getElementById('start').click()`);
  await sleep(1200);
  const started = await evaluate(`(() => ({ state: window.__cnPack.state, dropped: window.__cnPack.dropped,
    titleHidden: document.getElementById('title').hidden, resetLabel: document.getElementById('reset-label').textContent }))()`);
  console.log('after 寮€濮?', JSON.stringify(started));

  // --- play: dispatch real pointer events on the canvas, aiming at the emptiest column ---
  const playResult = await evaluate(`(async () => {
    const GP = window.__cnPack;
    const cv = document.getElementById('cv');
    const W = GP.W, H = GP.H;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const fire = (type, x, y, buttons) => {
      const r = cv.getBoundingClientRect();
      cv.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true,
        buttons: buttons === undefined ? (type === 'pointerup' ? 0 : 1) : buttons,
        clientX: r.left + (x / W) * r.width, clientY: r.top + (y / H) * r.height,
      }));
    };
    let drops = 0, maxPiece = 0, frames = 0;
    let bonusAt = null, bonusProvinces = null, countdownSeen = false;
    const t0 = performance.now();
    while (GP.state === 'play' && performance.now() - t0 < 90000) {
      if (GP.current) {
        // Did the all-placed bonus / countdown just start? It must land on the last piece:
        // the deck is drawn two ahead, so "deck empty" is one piece early.
        if (GP.timeUpAt !== null && !countdownSeen) {
          countdownSeen = true;
          bonusAt = GP.dealt + 1;          // this drop is the one that set it
          bonusProvinces = GP.dropped;
        }
        // aim: try columns, prefer one whose topmost piece is lowest and that has room
        let best = 20 + Math.random() * (W - 40), bestTop = -Infinity;
        for (let x = 24; x <= W - 24; x += 10) {
          const [px, py] = GP.hoverAt(x);
          let top = GP.FLOOR_Y;
          for (const b of GP.pieces) {
            if (Math.abs(b.position.x - px) < 45) top = Math.min(top, b.bounds.min.y - py);
          }
          const score = top + Math.random() * 12;
          if (score > bestTop) { bestTop = score; best = x; }
        }
        fire('pointerdown', best, GP.RIM_Y + 40);
        fire('pointerup', best, GP.RIM_Y + 40);
        drops++;
        if (GP.timeUpAt !== null && bonusAt === null) { bonusAt = GP.dealt; bonusProvinces = GP.dropped; countdownSeen = true; }
      }
      for (const b of GP.pieces) maxPiece = Math.max(maxPiece, b.piece.codes.length);
      await sleep(16);
      frames++;
    }
    return { drops, maxPiece, state: GP.state, score: GP.score, china: GP.chinaCount,
      pieces: GP.pieces.length, round: GP.round, seconds: (performance.now() - t0) / 1000,
      bonusAt, bonusProvinces, pieceCount: GP.PIECE_COUNT,
      finish: GP.lastFinish, resultHidden: document.getElementById('result').hidden,
      head: document.getElementById('r-head').textContent,
      count: document.getElementById('r-count').textContent,
      scoreText: document.getElementById('r-score').textContent,
      regions: document.getElementById('r-regions').textContent,
      shareHref: document.getElementById('share').getAttribute('href'),
    };
  })()`);
  console.log('play:', JSON.stringify(playResult, null, 1));
  await send('Page.captureScreenshot', {}).then((r) => fs.writeFileSync(`${OUT}/shots/shot-result.png`, Buffer.from(r.data, 'base64')));

  // --- the share button must point at a service reachable from mainland China, and the link
  // must be filled in as soon as the result appears (not only after the first click) ---
  const shareCheck = await evaluate(`(() => {
    const a = document.getElementById('share');
    const href = (a.getAttribute('href') || '').toLowerCase();
    const icon = a.querySelector('svg');
    let decoded = '';
    try { decoded = decodeURIComponent(href); } catch (_) {}
    return {
      href,
      pointsToWeibo: href.indexOf('weibo.com') >= 0,
      mentionsTwitter: href.indexOf('twitter') >= 0 || href.indexOf('x.com') >= 0,
      decodedHasScore: decoded.indexOf('%E5%BE%97%E5%88%86') >= 0 || decoded.indexOf('得分') >= 0,
      iconClass: icon ? icon.getAttribute('class') : null,
      credits: [...document.querySelectorAll('.credit')].map((e) => e.textContent.replace(/\\s+/g, ' ').trim()),
      creditLinks: [...document.querySelectorAll('.credit a')].map((e) => e.getAttribute('href')),
      toastPresent: !!document.getElementById('toast'),
      ariaLabel: a.getAttribute('aria-label'),
    };
  })()`);
  console.log('share check:', JSON.stringify(shareCheck, null, 1));
  if (!shareCheck.pointsToWeibo) { console.error('  !! share button does not point at weibo'); pageErrors.push('share target is not weibo'); }
  if (shareCheck.mentionsTwitter) { console.error('  !! share link mentions twitter/x.com'); pageErrors.push('share link mentions twitter'); }
  if (!shareCheck.decodedHasScore) { console.error('  !! share link does not carry the score'); pageErrors.push('share text missing'); }
  if (!shareCheck.creditLinks.some((h) => h && h.includes('dopagamelab'))) {
    console.error('  !! the original game is not credited on the page'); pageErrors.push('missing original credit');
  }
  if (!shareCheck.toastPresent) { console.error('  !! no copy-confirmation element'); pageErrors.push('missing toast element'); }
  if (shareCheck.iconClass !== 'share-icon') {
    console.error('  !! share icon is not the neutral one: ' + shareCheck.iconClass); pageErrors.push('share icon wrong');
  }

  // --- clicking share in a desktop browser must open the weibo composer, copy the score and
  // confirm it on screen. The clipboard is stubbed so the check does not depend on permission.
  //
  // Note the result guard: for the first second after the result appears the game deliberately
  // ignores taps on the result row, so a click must be preceded by a wait (see below). ---
  const guarded = await evaluate(`(() => {
    const s = document.getElementById('share');
    return { hasWaitClass: s.classList.contains('wait'), ariaDisabled: s.getAttribute('aria-disabled') };
  })()`);
  console.log('share guard right after the result:', JSON.stringify(guarded));

  await sleep(1300);                     // let the result guard expire
  const shareClick = await evaluate(`(async () => {
    let copied = null;
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: (t) => { copied = t; return Promise.resolve(); } },
      });
    } catch (e) { return { stubError: String(e) }; }
    const a = document.getElementById('share');
    a.addEventListener('click', (ev) => ev.preventDefault(), { once: true });   // do not navigate
    a.click();
    await new Promise((r) => setTimeout(r, 250));
    const toast = document.getElementById('toast');
    return {
      copied, toastShown: toast.classList.contains('show'), toastText: toast.textContent,
      hrefAfter: a.getAttribute('href'),
      // the result screen must stay up: sharing must not start a new round
      stillOver: window.__cnPack.state === 'over',
      guardCleared: !a.classList.contains('wait'),
    };
  })()`);
  console.log('share click:', JSON.stringify({ ...shareClick, copied: shareClick.copied ? '(score text)' : null }));
  if (shareClick.stubError) { console.error('  !! could not stub the clipboard: ' + shareClick.stubError); pageErrors.push('clipboard stub failed'); }
  if (!shareClick.guardCleared) { console.error('  !! result guard never cleared'); pageErrors.push('result guard stuck'); }
  if (!shareClick.toastShown) { console.error('  !! no on-screen confirmation after copying'); pageErrors.push('toast not shown'); }
  if (!shareClick.copied || shareClick.copied.indexOf('得分') < 0) {
    console.error('  !! score text was not copied'); pageErrors.push('copy failed');
  }
  if (!shareClick.stillOver) { console.error('  !! sharing started a new round'); pageErrors.push('share reset the game'); }
  await send('Page.captureScreenshot', {}).then((r) => fs.writeFileSync(`${OUT}/shots/shot-result.png`, Buffer.from(r.data, 'base64')));

  // --- the all-placed bonus must land on the LAST piece, not the second-to-last ---
  // The deck is drawn two ahead, so "deck empty" happens one piece early. Play at a roomier size
  // so the round survives to the last piece, then check which drop started the countdown.
  const lateCheck = await evaluate(`(async () => {
    const GP = window.__cnPack;
    const cv = document.getElementById('cv');
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const fire = (type, x, y) => {
      const r = cv.getBoundingClientRect();
      cv.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1,
        pointerType: 'mouse', isPrimary: true, buttons: type === 'pointerup' ? 0 : 1,
        clientX: r.left + (x / GP.W) * r.width, clientY: r.top + (y / GP.H) * r.height }));
    };
    GP.setSizeModel(0.28, 0.32, 0.72);          // roomy, so the round reaches the last piece
    let result = null;
    for (let attempt = 0; attempt < 3 && !result; attempt++) {
      GP.startGame();
      let firedAt = null, firedProvinces = null, lastSeen = 0;
      while (GP.state === 'play' && lastSeen < GP.PIECE_COUNT + 2) {
        if (GP.current) {
          const wasNull = GP.timeUpAt === null;
          let best = GP.W / 2, bestTop = -Infinity;
          for (let x = 30; x <= GP.W - 30; x += 12) {
            const [px, py] = GP.hoverAt(x);
            let top = GP.FLOOR_Y;
            for (const b of GP.pieces) if (Math.abs(b.position.x - px) < 45) top = Math.min(top, b.bounds.min.y - py);
            if (top + Math.random() * 8 > bestTop) { bestTop = top + Math.random() * 8; best = x; }
          }
          fire('pointerdown', best, GP.RIM_Y + 40);
          fire('pointerup', best, GP.RIM_Y + 40);
          lastSeen++;
          if (wasNull && GP.timeUpAt !== null) { firedAt = GP.dealt; firedProvinces = GP.dropped; }
        }
        await sleep(12);
      }
      if (firedAt !== null) result = { firedAt, firedProvinces, dealt: GP.dealt, dropped: GP.dropped,
        countdownLeft: GP.timeUpAt === null ? null : Math.round((GP.timeUpAt - GP.simTime) / 1000),
        pieceCount: GP.PIECE_COUNT, finished: GP.lastFinish ? GP.lastFinish.kind : 'still playing' };
    }
    GP.setSizeModel(0.28, 0.32, 0.92);          // restore the shipped settings
    return result;
  })()`);
  console.log('all-placed bonus timing:', JSON.stringify(lateCheck));
  if (!lateCheck) {
    console.error('  !! never reached the last piece in the browser');
    pageErrors.push('all-placed bonus timing unverified');
  } else {
    if (lateCheck.firedAt !== lateCheck.pieceCount) {
      console.error(`  !! bonus fired on piece ${lateCheck.firedAt}, expected ${lateCheck.pieceCount}`);
      pageErrors.push('all-placed bonus fires one piece early');
    }
    if (lateCheck.firedProvinces !== 34) {
      console.error(`  !! bonus fired with ${lateCheck.firedProvinces} provinces placed, expected 34`);
      pageErrors.push('all-placed bonus fires before every province is placed');
    }
  }

  // --- 鍐嶆潵涓€灞€, then inspect a mid-game frame ---
  // the result card ignores taps for its first second (so a stray tap cannot skip it)
  await sleep(1300);
  await evaluate(`document.getElementById('retry').click()`);
  await sleep(1500);
  const mid = await evaluate(`(() => ({ state: window.__cnPack.state, dropped: window.__cnPack.dropped,
    pieces: window.__cnPack.pieces.length, round: window.__cnPack.round }))()`);
  console.log('after 鍐嶆潵涓€灞€:', JSON.stringify(mid));
  if (mid.state !== 'play' || mid.dropped > 3) {
    console.error('  !! 鍐嶆潵涓€灞€ did not start a fresh round');
    pageErrors.push('retry did not restart the round');
  }

  // --- drop a dozen pieces so the screenshot shows real play, then shake ---
  const shakeCheck = await evaluate(`(async () => {
    const GP = window.__cnPack;
    const cv = document.getElementById('cv');
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const fire = (type, x, y) => {
      const r = cv.getBoundingClientRect();
      cv.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1,
        pointerType: 'mouse', isPrimary: true, buttons: type === 'pointerup' ? 0 : 1,
        clientX: r.left + (x / GP.W) * r.width, clientY: r.top + (y / GP.H) * r.height }));
    };
    while (GP.dropped < 11 && GP.state === 'play') {
      if (GP.current) {
        let best = GP.W / 2, bestTop = -Infinity;
        for (let x = 30; x <= GP.W - 30; x += 10) {
          const [px, py] = GP.hoverAt(x);
          let top = GP.FLOOR_Y;
          for (const b of GP.pieces) if (Math.abs(b.position.x - px) < 45) top = Math.min(top, b.bounds.min.y - py);
          if (top + Math.random() * 10 > bestTop) { bestTop = top + Math.random() * 10; best = x; }
        }
        fire('pointerdown', best, GP.RIM_Y + 40);
        fire('pointerup', best, GP.RIM_Y + 40);
      }
      await sleep(20);
    }
    await sleep(400);
    const before = GP.pieces.map((b) => [b.position.x, b.position.y]);
    document.getElementById('shuffle').click();
    await sleep(300);
    const during = GP.pieces.map((b) => [b.position.x, b.position.y]);
    await sleep(1600);
    const moved = before.filter((p, i) => during[i] && Math.hypot(during[i][0] - p[0], during[i][1] - p[1]) > 1).length;
    return { pieces: GP.pieces.length, dropped: GP.dropped, shaken: moved, state: GP.state, score: GP.score };
  })()`);
  console.log('mid-game + 鎽囦竴鎽?', JSON.stringify(shakeCheck));
  if (shakeCheck.shaken === 0) {
    console.error('  !! 鎽囦竴鎽?did not move any piece');
    pageErrors.push('shake moved nothing');
  }
  await send('Page.captureScreenshot', {}).then((r) => fs.writeFileSync(`${OUT}/shots/shot-play.png`, Buffer.from(r.data, 'base64')));

  console.log('\nconsole messages:', consoleLogs.length ? consoleLogs.join('\n  ') : '(none)');
  console.log('page errors:', pageErrors.length ? pageErrors.join('\n  ') : '(none)');
  process.exitCode = pageErrors.length ? 1 : 0;
} catch (e) {
  console.error('DRIVER ERROR:', e.message);
  process.exitCode = 2;
} finally {
  try { ws && ws.close(); } catch {}
  edge.kill();
  await sleep(400);
}
