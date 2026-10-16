// Settle the two size knobs on one consistent measurement.
//
//   PIECE_SCALE  scales every piece (early game crowding)
//   MERGE_EXP    scales merged pieces only (endgame crowding)
//
// Random-play bot, fixed number of runs per setting, reporting the things the player feels:
// how full the box gets, how often a round ends by overflow instead of the countdown, and how
// large a chain a normal player could reach.
import { loadGame } from './harness.mjs';

const { GP } = loadGame();
const { PROV, ADJM } = GP;
const RUNS = 24;

function chooseX(piece, frame) {
  const nb = new Set();
  for (const c of piece.codes) for (const n of ADJM[c]) nb.add(n);
  const partners = GP.pieces.filter((b) => b.piece.codes.some((c) => nb.has(c)));
  if (partners.length) {
    const mine = (piece.maxX - piece.minX) / 2;
    const cand = [];
    for (const b of partners) {
      const gap = 0.94 * ((b.piece.maxX - b.piece.minX) / 2 + mine);
      for (const side of [-1, 1]) {
        const x = b.position.x + side * gap;
        if (x < 28 || x > GP.W - 28) continue;
        const [, py] = GP.hoverAt(x);
        cand.push({ x, s: b.position.y - py * 0.5 + ((frame + x) % 7 - 3) * 0.5 });
      }
    }
    if (cand.length) { cand.sort((a, b) => b.s - a.s); return cand[0].x; }
  }
  let best = GP.W / 2, bestScore = Infinity;
  for (let x = 28; x <= GP.W - 28; x += 8) {
    const [px, py] = GP.hoverAt(x);
    let contact = 0;
    for (const b of GP.pieces) {
      const rx = (b.piece.maxX - b.piece.minX) / 2 + (piece.maxX - piece.minX) / 2;
      const ry = (b.piece.maxY - b.piece.minY) / 2 + (piece.maxY - piece.minY) / 2;
      const dx = b.position.x - px, dy = b.position.y - py;
      if (Math.abs(dx) < rx && Math.abs(dy) < ry) contact += (1 - Math.abs(dx) / rx) * (1 - Math.abs(dy) / ry);
    }
    if (contact * 4 + py * 0.02 < bestScore) { bestScore = contact * 4 + py * 0.02; best = x; }
  }
  return best;
}
function ringArea(r) {
  let a = 0;
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a / 2);
}
function fillNow() {
  let drawn = 0;
  for (const b of GP.pieces) for (const c of b.piece.codes) for (const r of PROV[c].pts) drawn += ringArea(r) * b.piece.s * b.piece.s;
  return drawn / (GP.BW * GP.BH);
}

function trial(scale, mergeExp) {
  GP.setSizeModel(0.28, mergeExp, scale);
  const fill = [], big = [];
  let overflow = 0, wins = 0;
  for (let i = 0; i < RUNS; i++) {
    GP.startGame();
    let frame = 0, peak = 0, biggest = 0;
    while (GP.state === 'play' && frame < 60 * 300) {
      if (GP.current) { GP.setHoverX(chooseX(GP.current.piece, frame)); GP.drop(); }
      GP.step(); frame++;
      if (frame % 5 === 0) peak = Math.max(peak, fillNow());
      for (const b of GP.pieces) biggest = Math.max(biggest, b.piece.codes.length);
      if (GP.chinaCount) break;
    }
    fill.push(peak); big.push(biggest);
    if (GP.lastFinish && GP.lastFinish.kind === 'overflow') overflow++;
    if (GP.chinaCount) wins++;
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return { scale, mergeExp, fill: avg(fill), big: avg(big), maxBig: Math.max(...big), overflow: overflow / RUNS, wins };
}

console.log(`${RUNS} rounds per setting, random-play bot`);
console.log('scale  mergeExp |  箱子填充 | 平均最大块 | 最好 | 溢出结束 | 拼成');
const results = [];
for (const scale of [0.80, 0.88, 0.95]) {
  for (const mergeExp of [0.28, 0.30, 0.31, 0.32]) {
    const r = trial(scale, mergeExp);
    results.push(r);
    console.log(`${scale.toFixed(2)}   ${mergeExp.toFixed(3)}   | ${(r.fill * 100).toFixed(0).padStart(8)}% | ` +
      `${r.big.toFixed(1).padStart(10)} | ${String(r.maxBig).padStart(4)} | ${(r.overflow * 100).toFixed(0).padStart(7)}% | ${r.wins}`);
  }
}
const balanced = results
  .filter((r) => r.overflow >= 0.3 && r.overflow <= 0.7)
  .sort((a, b) => b.maxBig - a.maxBig || b.fill - a.fill)[0];
console.log('\n在"溢出结束 30%~70%"里最好的一组: ' +
  (balanced ? `scale=${balanced.scale} mergeExp=${balanced.mergeExp}（填充 ${(balanced.fill * 100).toFixed(0)}%，最好 ${balanced.maxBig} 省，溢出 ${(balanced.overflow * 100).toFixed(0)}%）`
    : '没有落在区间内的组合'));
GP.setSizeModel(0.28, 0.31, 0.88);
