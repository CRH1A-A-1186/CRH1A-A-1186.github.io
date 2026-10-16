/* Headless verification for 中国省份游戏.
 *
 * Runs the real game bundle under Node with the browser stubs from tools/harness.mjs, drives the
 * same fixed 60 Hz step loop the page's requestAnimationFrame driver uses, and plays whole games.
 * Checks the things that must hold:
 *   - the pack: 34 provinces, symmetric adjacency, connected regions, the two islands detached
 *   - geometry: every province has real extent, area, and closed rings
 *   - play: only adjacent provinces ever merge; score only rises; the box never loses a piece
 *   - tuning: across play policies, rounds end by the countdown rather than instantly by overflow
 *
 * Run: node tools/verify.mjs      (from the china-pack directory, after tools/bundle.mjs)
 */
import { loadGame } from './harness.mjs';

const { GP, tick } = loadGame();
const { PROV, REGIONS, ADJM, TOTAL } = GP;
const problems = [];
const note = (msg) => { problems.push(msg); console.log('  !! ' + msg); };

console.log(`loaded: ${TOTAL} provinces, ${REGIONS.length} regions`);
if (TOTAL !== 34) note(`expected 34 provinces, got ${TOTAL}`);

// ---------------------------------------------------------------- pack invariants
{
  let edges = 0;
  for (const c of Object.keys(ADJM)) edges += ADJM[c].size;
  console.log(`adjacency: ${edges / 2} pairs, symmetric=${edges % 2 === 0}`);
  if (edges % 2) note('adjacency is not symmetric');
  // 海南 and 台湾 are islands: no land border, but they face a province across a strait, and the
  // pack treats that as adjacency so they can actually be merged. Nothing may be isolated.
  if (ADJM[460000].size === 0) note('海南 has no neighbours at all: it could never merge with anything');
  if (ADJM[710000].size === 0) note('台湾 has no neighbours at all: it could never merge with anything');
  if (!ADJM[460000].has(440000)) note('海南 is not adjacent to 广东 (琼州海峡)');
  if (!ADJM[710000].has(350000)) note('台湾 is not adjacent to 福建 (台湾海峡)');
  for (const c of Object.keys(ADJM).map(Number)) {
    if (!PROV[c]) continue;
    if (ADJM[c].size === 0) note(`${PROV[c].name} has no neighbours at all`);
  }
  if (!ADJM[810000].has(440000) || !ADJM[820000].has(440000)) note('香港/澳门 must border 广东');
  if (!ADJM[110000].has(120000) || !ADJM[110000].has(130000)) note('北京 must border 天津 and 河北');
  if (!ADJM[440000].has(450000) || !ADJM[440000].has(430000)) note('广东 must border 广西 and 湖南');
  if (!ADJM[650000].has(540000)) note('新疆 must border 西藏');
  for (const c of Object.keys(ADJM).map(Number)) {
    for (const n of ADJM[c]) if (!ADJM[n].has(c)) note(`asymmetric pair ${c}/${n}`);
  }
  const seen = new Set([110000]); const q = [110000];
  while (q.length) for (const n of ADJM[q.pop()]) if (!seen.has(n)) { seen.add(n); q.push(n); }
  console.log(`all provinces reachable from 北京: ${seen.size} of 34` +
    ` (海南/台湾 join through their strait crossings)`);
  if (seen.size !== 34) note(`adjacency graph reaches only ${seen.size} of 34 provinces`);

  // a declared region must be a connected group of provinces
  for (const r of REGIONS) {
    if (r.single) continue;
    const set = new Set(r.codes);
    const s2 = new Set([r.codes[0]]); const q2 = [r.codes[0]];
    while (q2.length) for (const n of ADJM[q2.pop()]) if (set.has(n) && !s2.has(n)) { s2.add(n); q2.push(n); }
    if (s2.size !== r.codes.length) note(`region ${r.name} is not connected (${s2.size}/${r.codes.length})`);
  }
  // every province must be in exactly one region
  const counted = new Map();
  for (const r of REGIONS) for (const c of r.codes) counted.set(c, (counted.get(c) || 0) + 1);
  if (counted.size !== 34) note(`regions cover ${counted.size} provinces, expected 34`);
  for (const [c, n] of counted) if (n !== 1) note(`province ${c} appears in ${n} regions`);

  // geometry
  let verts = 0;
  for (const c of Object.keys(PROV).map(Number)) {
    const p = PROV[c];
    if (!p) continue;
    if (!(p.w > 0) || !(p.h > 0)) note(`${p.name} has a degenerate bounding box`);
    if (!(p.area > 0)) note(`${p.name} has no area`);
    for (const ring of p.pts) if (ring.length < 3) note(`${p.name} has a ring with ${ring.length} points`);
    verts += p.pts.reduce((a, r) => a + r.length, 0);
  }
  const widest = Object.keys(PROV).map(Number).filter((c) => PROV[c])
    .map((c) => ({ n: PROV[c].name, w: PROV[c].w })).sort((a, b) => b.w - a.w)[0];
  const smallest = Object.keys(PROV).map(Number).filter((c) => PROV[c])
    .map((c) => ({ n: PROV[c].name, a: PROV[c].area })).sort((a, b) => a.a - b.a)[0];
  console.log(`geometry: ${verts} vertices; widest ${widest.n} ${widest.w.toFixed(0)} km; ` +
    `smallest ${smallest.n} ${smallest.a.toFixed(0)} km2`);
  // the smallest piece must still be visible on screen
  const tiny = GP.buildPiece([820000]);
  const minSide = Math.min(tiny.maxX - tiny.minX, tiny.maxY - tiny.minY);
  console.log(`澳门 piece renders ${(tiny.maxX - tiny.minX).toFixed(0)} x ${(tiny.maxY - tiny.minY).toFixed(0)} units`);
  if (minSide < 8) note(`澳门 renders only ${minSide.toFixed(1)} units across: invisible`);
  // the largest single piece must fit the box
  const big = GP.buildPiece([650000]);
  const bigW = big.maxX - big.minX;
  console.log(`新疆 piece is ${bigW.toFixed(0)} units wide (box ${GP.BW})`);
  if (bigW > GP.BW * 0.7) note(`新疆 takes ${(bigW / GP.BW * 100).toFixed(0)}% of the box width: too dominant`);
}

// ---------------------------------------------------------------- play policies
function chooseX(piece, policy, frame) {
  if (policy === 'sweep') return 12 + (GP.BW - 24) * ((frame % 240) / 240);
  if (policy === 'center') return GP.W / 2;
  const neighbours = new Set();
  for (const c of piece.codes) for (const n of ADJM[c]) neighbours.add(n);
  const partners = GP.pieces.filter((b) => b.piece.codes.some((c) => neighbours.has(c)));
  if (partners.length) {
    if (policy === 'stack') {
      partners.sort((a, b) => b.position.y - a.position.y);
      return partners[0].position.x;
    }
    // 'smart': drop beside a neighbouring province so the two touch without building a tower
    const mine = (piece.maxX - piece.minX) / 2;
    const scored = [];
    for (const b of partners) {
      const halfW = (b.piece.maxX - b.piece.minX) / 2;
      const gap = 0.94 * (halfW + mine);
      for (const side of [-1, 1]) {
        const x = b.position.x + side * gap;
        if (x < 30 || x > GP.W - 30) continue;
        const [, py] = GP.hoverAt(x);
        scored.push({ x, score: b.position.y - py * 0.5 + ((frame + x) % 7 - 3) * 0.5 });
      }
    }
    if (scored.length) { scored.sort((a, b) => b.score - a.score); return scored[0].x; }
  }
  // nothing adjacent in play: aim for the least crowded column
  let best = GP.W / 2, bestScore = Infinity;
  for (let x = 30; x <= GP.W - 30; x += 8) {
    const [px, py] = GP.hoverAt(x);
    let contact = 0;
    for (const b of GP.pieces) {
      const rx = (b.piece.maxX - b.piece.minX) / 2 + (piece.maxX - piece.minX) / 2;
      const ry = (b.piece.maxY - b.piece.minY) / 2 + (piece.maxY - piece.minY) / 2;
      const dx = b.position.x - px, dy = b.position.y - py;
      if (Math.abs(dx) < rx && Math.abs(dy) < ry) contact += (1 - Math.abs(dx) / rx) * (1 - Math.abs(dy) / ry);
    }
    const score = contact * 4 + py * 0.02;
    if (score < bestScore) { bestScore = score; best = x; }
  }
  return best;
}

function playGame({ policy, label, maxFrames = 60 * 400, verbose = true }) {
  const merges = [];
  let lastScore = -1, lastCount = 0, illegal = null;
  let drops = 0, lastDealt = 0, maxPiece = 0, frame = 0;

  GP.startGame();
  const t0 = performance.now();
  while (frame < maxFrames) {
    if (GP.current) { GP.setHoverX(chooseX(GP.current.piece, policy, frame)); GP.drop(); }
    tick(1); frame++;

    if (GP.dealt > lastDealt) { lastDealt = GP.dealt; drops++; }
    if (GP.pieces.length < lastCount) merges.push(lastCount - GP.pieces.length);
    lastCount = GP.pieces.length;
    for (const b of GP.pieces) maxPiece = Math.max(maxPiece, b.piece.codes.length);

    // every piece in the box must be a connected group of provinces
    for (const b of GP.pieces) {
      if (b.piece.codes.length < 2) continue;
      const set = new Set(b.piece.codes);
      const s2 = new Set([b.piece.codes[0]]); const q = [b.piece.codes[0]];
      while (q.length) for (const n of ADJM[q.pop()]) if (set.has(n) && !s2.has(n)) { s2.add(n); q.push(n); }
      if (s2.size !== set.size) { illegal = b.piece.codes.slice(); break; }
    }
    if (illegal) break;
    if (GP.score < lastScore) note(`${label}: score decreased`);
    lastScore = GP.score;
    if (GP.state === 'over') break;
  }

  if (!GP.chinaCount) {
    // every province that has been dealt must still be somewhere in the box (or merged away)
    const all = new Set();
    for (const b of GP.pieces) for (const c of b.piece.codes) all.add(c);
    const expected = new Set();
    for (const p of GP.PROV) if (p) expected.add(p.code);
    if (all.size !== GP.dropped) note(`${label}: ${GP.dropped} provinces dealt but ${all.size} present`);
    // the round must hand out exactly PIECE_COUNT pieces, covering all 34 provinces
    if (GP.dealt > GP.PIECE_COUNT) note(`${label}: dealt ${GP.dealt} pieces, more than ${GP.PIECE_COUNT}`);
    if (GP.dropped > 34) note(`${label}: more than 34 provinces dealt`);
  }
  if (illegal) note(`${label}: merged a non-adjacent group: ${illegal.join(',')}`);
  if (verbose) {
    console.log(`${label}: ${drops} drops, biggest=${maxPiece}省, score=${GP.score}, 拼成=${GP.chinaCount}, ` +
      `merges=${merges.length}, ended by ${GP.lastFinish ? GP.lastFinish.kind : '?'}, ${(frame / 60).toFixed(1)}s`);
  }
  return { drops, maxPiece, score: GP.score, china: GP.chinaCount, illegal, kind: GP.lastFinish ? GP.lastFinish.kind : null };
}

console.log('\n=== gameplay ===');
const QUICK = process.argv.includes('--quick');
const PER_POLICY = QUICK ? 2 : 6;          // rounds per play policy
const results = {};
for (const policy of ['center', 'sweep', 'stack', 'smart']) {
  const runs = [];
  for (let i = 0; i < PER_POLICY; i++) runs.push(playGame({ policy, label: `${policy} ${i + 1}`, verbose: i === 0 }));
  results[policy] = runs;
  const avg = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
  const best = Math.max(...runs.map((r) => r.maxPiece));
  console.log(`  ${policy.padEnd(7)}: avg ${avg((r) => r.drops).toFixed(1)} drops, best ${String(best).padStart(2)}省, ` +
    `wins ${runs.reduce((a, r) => a + r.china, 0)}/6, countdown endings ${runs.filter((r) => r.kind === 'timeup').length}/6`);
}

if (Object.values(results).flat().some((r) => r.illegal)) note('a run merged non-adjacent provinces');
const all = Object.values(results).flat();
const bestOverall = Math.max(...all.map((r) => r.maxPiece));
const timeoutRate = all.filter((r) => r.kind === 'timeup').length / all.length;
console.log(`\nbest single piece across ${all.length} runs: ${bestOverall} of ${TOTAL}`);
console.log(`rounds ending by the countdown rather than overflow: ${(timeoutRate * 100).toFixed(0)}%`);
if (bestOverall < 8) note(`merging stalls: best piece was only ${bestOverall} provinces`);
if (timeoutRate < 0.25) note(`the box overflows too fast: only ${(timeoutRate * 100).toFixed(0)}% of rounds reached the countdown`);

console.log('\n=== summary ===');
if (problems.length) {
  console.log(`${problems.length} problem(s):`);
  for (const p of problems) console.log('  - ' + p);
  process.exitCode = 1;
} else {
  console.log('all checks passed');
}
