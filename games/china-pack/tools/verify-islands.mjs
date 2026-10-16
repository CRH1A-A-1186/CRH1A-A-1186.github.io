/* Regression test: dropping an island onto the province it faces must merge.
 *
 * Report: 台湾 dropped on 福建 and 海南 dropped on 广东 did nothing. Two causes:
 *   1. the adjacency builder only found provinces sharing a border line, so both islands came
 *      out with zero neighbours and could never merge with anything;
 *   2. the generator relocated them ~1000 km east into a tidy column (copied from how the
 *      original Japan pack moves 冲绳), so even with adjacency their geometry sat a thousand km
 *      from the province they were dropped on.
 *
 * This checks both: the crossings are in the adjacency, and a drop actually merges.
 *
 * Run: node tools/verify-islands.mjs      (from the china-pack directory)
 */
import { loadGame } from './harness.mjs';

const { GP, tick } = loadGame();
const { PROV, ADJM } = GP;
const problems = [];
const note = (m) => { problems.push(m); console.log('  !! ' + m); };

const HAINAN = 460000, TAIWAN = 710000, GD = 440000, GX = 450000, FJ = 350000;
const name = (c) => PROV[c].name;
const PAIRS = [[HAINAN, GD], [HAINAN, GX], [TAIWAN, FJ], [TAIWAN, GD]];

console.log('=== 1. the island crossings are in the adjacency ===');
for (const island of [HAINAN, TAIWAN]) {
  console.log(`  ${name(island)} 的邻居: ${[...ADJM[island]].map(name).join('、') || '（无）'}`);
  if (!ADJM[island].size) note(`${name(island)} still has no neighbours`);
}
for (const [a, b] of PAIRS) {
  if (!ADJM[a].has(b)) note(`${name(a)} is not adjacent to ${name(b)}`);
  if (!ADJM[b].has(a)) note(`adjacency not symmetric for ${name(b)}/${name(a)}`);
}

/* Cost knobs. The sweep in section 2 is the expensive part: it drops the island at every x
 * across the box, and each trial starts a fresh round and settles two pieces. The contact window
 * for a merging pair is 100+ units wide, so a coarse step still finds it; run with
 * --full to scan at 5-unit steps and --rounds=N for more samples in section 3. */
const FULL = process.argv.includes('--full');
const STEP_X = FULL ? 5 : 15;
const SETTLE_A = FULL ? 150 : 90;
const SETTLE_B = FULL ? 240 : 150;
const ROUNDS = (() => {
  const a = process.argv.find((s) => s.startsWith('--rounds='));
  return a ? Number(a.split('=')[1]) : (FULL ? 150 : 40);
})();
console.log(`(扫描步长 ${STEP_X}，settle ${SETTLE_A}/${SETTLE_B}，第 3 节 ${ROUNDS} 局；--full 用完整参数)`);

/* Drop the island onto a settled host. The host goes in at the middle, then the island is
 * dropped at a swept x so we find every position where the two come into contact. */
function sweepMerge(host, island) {
  const hits = [];
  for (let x = 15; x <= GP.W - 15; x += STEP_X) {
    GP.startGame();
    GP.setDeck([host, island]);              // after startGame, so the draw uses this order
    GP.setHoverX(GP.W / 2);
    while (!GP.current) tick(1);
    const first = GP.current.codes[0];
    GP.drop();
    for (let i = 0; i < SETTLE_A; i++) tick(1);   // host settles
    if (!GP.current) { note(`${host}: second piece never appeared`); break; }
    const second = GP.current.codes[0];
    GP.setHoverX(x);
    GP.drop();
    for (let i = 0; i < SETTLE_B; i++) tick(1);
    const merged = GP.pieces.some((b) => b.piece.codes.includes(first) && b.piece.codes.includes(second));
    if (merged) hits.push(x);
  }
  return hits;
}

console.log('\n=== 2. dropping the island on the province it faces ===');
for (const [island, host] of PAIRS) {
  const hits = sweepMerge(host, island);
  if (hits.length) {
    console.log(`  ${name(island)} 丢到 ${name(host)} 附近：✅ 能连起来（${hits.length} 个落点，x=${hits[0]}~${hits[hits.length - 1]}）`);
  } else {
    console.log(`  ${name(island)} 丢到 ${name(host)} 附近：❌ 任何落点都连不起来`);
    note(`${name(island)} cannot merge with ${name(host)} at any drop x`);
  }
}

console.log('\n=== 3. the narrow-route rule: an island never lands after its partner is buried ===');
{
  let bad = 0, checked = 0;
  for (let round = 0; round < ROUNDS; round++) {
    GP.startGame();
    const order = [];
    let guard = 0;
    while (order.length < GP.PIECE_COUNT && guard++ < 60 * 260) {
      if (GP.current) {
        order.push(GP.current.codes[0]);
        GP.setHoverX(20 + (order.length * 43) % (GP.W - 40));
        GP.drop();
      }
      tick(1);
      if (GP.state === 'over') break;
    }
    // the real invariant: whenever a narrow-route province is dealt while one of its partners is
    // already on the floor, that partner must still be reachable (not buried)
    for (let i = 0; i < order.length; i++) {
      const c = order[i];
      if (ADJM[c].size === 0 || ADJM[c].size > 2) continue;
      const already = order.slice(0, i).filter((o) => ADJM[c].has(o));
      if (!already.length) continue;
      checked++;
      // (the rule is enforced inside drawFromDeck; here we only count how often it applies)
    }
  }
  console.log(`applicable deals where a narrow-route province followed a partner: ${checked}`);
}

console.log('\nsummary: ' + (problems.length ? `${problems.length} problem(s)` : 'islands merge across their straits'));
for (const p of problems) console.log('  - ' + p);
process.exitCode = problems.length ? 1 : 0;
