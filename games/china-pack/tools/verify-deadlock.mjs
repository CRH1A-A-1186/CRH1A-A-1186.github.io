/* Regression test for the 河北 dead end, now fixed structurally.
 *
 * Report: if 山东/河北/辽宁/内蒙古 come early and link up, a 北京 or 天津 drawn later can never
 * be added - 北京 and 天津 only touch 河北 (and each other), so once 河北 is walled in, the pair
 * has no route into the map.
 *
 * The fix: those provinces are never dealt alone. 京津冀 ship as one starting piece and 粤港澳
 * as another, so a province whose only route into the map is a single partner is already joined
 * to it from the first hand. Nothing has to be arranged in the right order any more.
 *
 * This checks the structure (the deal, the grouping, no remaining single-route province) and
 * that a hand behaves like any other piece.
 *
 * Run: node tools/verify-deadlock.mjs      (from the china-pack directory)
 */
import { loadGame } from './harness.mjs';

const { GP, tick } = loadGame();
const { PROV, ADJM } = GP;
const problems = [];
const note = (m) => { problems.push(m); console.log('  !! ' + m); };

const name = (c) => PROV[c].name;
const BEIJING = 110000, TIANJIN = 120000, HEBEI = 130000;
const GD = 440000, HK = 810000, MO = 820000;

console.log('=== why these groups exist ===');
for (const c of [BEIJING, TIANJIN, HK, MO]) {
  console.log(`  ${name(c).padEnd(8)} 只和 ${[...ADJM[c]].map(name).join('、')} 接壤`);
}
const pair = [...new Set([...ADJM[BEIJING], ...ADJM[TIANJIN]])];
console.log(`  ${name(BEIJING)}+${name(TIANJIN)} 合起来也只接 ${pair.map(name).join('、')}` +
  ` —— 也就是说这一对通往全国的唯一出口就是 ${name(HEBEI)}`);

// ---------------------------------------------------------------- 1. the structure
console.log('\n=== the deal never hands out a single-route province on its own ===');
{
  const deck = GP.freshDeck();
  const flat = deck.flat();
  console.log(`pieces per round: ${deck.length} (was 34), covering ${new Set(flat).size} provinces`);
  if (deck.length !== 30) note(`expected 30 starting pieces, got ${deck.length}`);

  const all = new Set();
  for (const u of deck) for (const c of u) all.add(c);
  if (all.size !== 34) note(`the deal covers ${all.size} provinces, expected 34`);
  for (const p of GP.PROV) {
    if (!p) continue;
    const n = flat.filter((c) => c === p.code).length;   // PROV is keyed by code, so use .code
    if (n !== 1) note(`${p.name} appears ${n} times in the opening deal`);
  }  for (const [label, codes] of [['京津冀', [BEIJING, TIANJIN, HEBEI]], ['粤港澳', [GD, HK, MO]]]) {
    const unit = deck.find((u) => u.includes(codes[0]));
    const ok = unit && unit.length === codes.length && codes.every((c) => unit.includes(c));
    console.log(`  ${label} 作为一整块发牌: ${ok}  (${unit ? unit.map(name).join('+') : '?'})`);
    if (!ok) note(`${label} is not dealt as one piece`);
  }

  // A one-province starting piece with few neighbours is only safe if those neighbours border
  // each other, so burying one of them still leaves the other reachable.
  const risky = [];
  for (const u of deck) {
    if (u.length !== 1) continue;
    const nb = [...ADJM[u[0]]];
    if (nb.length === 0 || nb.length > 2) continue;
    const mutual = nb.every((a) => nb.every((b) => a === b || ADJM[a].has(b)));
    if (!mutual) risky.push(`${name(u[0])}(${nb.map(name).join('/')})`);
  }
  console.log(`  剩下的低度数单块: ${risky.length ? risky.join(', ') : '无'}`);
  if (risky.length) note(`still single-route: ${risky.join(', ')}`);
}

// ---------------------------------------------------------------- 2. the hand behaves as a piece
console.log('\n=== the 京津冀 hand behaves like any other piece ===');
{
  const piece = GP.buildPiece([BEIJING, TIANJIN, HEBEI]);
  const has = [BEIJING, TIANJIN, HEBEI].every((c) => piece.codes.includes(c));
  console.log(`  含 3 个省: ${has}   ${(piece.maxX - piece.minX).toFixed(0)} x ${(piece.maxY - piece.minY).toFixed(0)} units` +
    `   名字: ${piece.name}`);
  if (!has) note('京津冀 group does not contain all three provinces');
  if (piece.maxX - piece.minX > GP.BW * 0.5) note('京津冀 is too wide for the box');
  // 河北 is still the only way on to the rest of the map, and it is inside the hand from the start
  const outside = [...ADJM[HEBEI]].filter((c) => ![BEIJING, TIANJIN, HEBEI].includes(c));
  console.log(`  河北 对外还有 ${outside.length} 个邻居: ${outside.map(name).join('、')}` +
    ` —— 这一块随时可以往这些方向连出去`);
  if (!outside.length) note('京津冀 has no way to grow into the rest of the map');
}

console.log('\n=== the 粤港澳 hand likewise ===');
{
  const piece = GP.buildPiece([GD, HK, MO]);
  const has = [GD, HK, MO].every((c) => piece.codes.includes(c));
  console.log(`  含 3 个省: ${has}   ${(piece.maxX - piece.minX).toFixed(0)} x ${(piece.maxY - piece.minY).toFixed(0)} units` +
    `   名字: ${piece.name}`);
  if (!has) note('粤港澳 group does not contain all three provinces');
  // 澳门 is now inside this piece, so it can never be stranded waiting for 广东
  if (ADJM[MO].size !== 1) note('澳门 no longer has exactly one neighbour - recheck the grouping');
  console.log(`  澳门 唯一邻居 ${name(GD)} 就在同一块里: ${piece.codes.includes(GD)}`);
}

// ---------------------------------------------------------------- 3. a real round still works
console.log('\n=== a real round deals every province exactly once ===');
{
  GP.startGame();
  const seen = [];
  let pieces = 0;
  const t0 = performance.now();
  // Play this one at a roomier size: the question here is whether the *deal* covers every
  // province, not whether the round can avoid overflowing (that is what verify.mjs measures).
  GP.setSizeModel(0.28, 0.32, 0.78);
  while (GP.state === 'play' && performance.now() - t0 < 90000) {
    if (GP.current) {
      seen.push(...GP.current.codes);
      GP.setHoverX(24 + (pieces * 41) % (GP.W - 48));
      GP.drop();
      pieces++;
    }
    tick(1);
  }
  const uniq = new Set(seen);
  console.log(`  dropped ${pieces} pieces covering ${uniq.size} provinces; ended by ` +
    `${GP.lastFinish ? GP.lastFinish.kind : '?'}, score ${GP.score}`);
  if (GP.lastFinish && GP.lastFinish.kind !== 'overflow' && uniq.size !== 34) {
    const missing = GP.PROV.filter((p) => p && !uniq.has(p.code)).map((p) => p.name);
    note(`round did not cover all 34 provinces (missing ${missing.join(',')})`);
  }
  if (pieces !== GP.PIECE_COUNT && GP.state === 'play') {
    note(`only ${pieces} pieces dropped, expected ${GP.PIECE_COUNT}`);
  }
  GP.setSizeModel(0.28, 0.32, 0.92);       // back to the shipped settings
}

console.log('\nsummary: ' + (problems.length ? `${problems.length} problem(s)` : 'the dead end is structurally gone'));
for (const p of problems) console.log('  - ' + p);
process.exitCode = problems.length ? 1 : 0;
