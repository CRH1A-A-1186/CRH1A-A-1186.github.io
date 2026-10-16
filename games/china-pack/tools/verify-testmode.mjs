/* Checks for the ordered-deal test mode, and for the decoupling of the two size exponents.
 *
 * Test mode contract:
 *   - every hand is a piece that can actually join something already in the box
 *   - the mode never breaks the deal: all pieces, all 34 provinces, exactly once
 *   - turning it off restores random dealing
 *
 * Size model contract:
 *   - MERGE_EXP changes merged pieces and must not change single provinces
 *   - SIZE_EXP is the knob that changes single provinces
 *
 * Run: node tools/verify-testmode.mjs      (from the china-pack directory)
 */
import { loadGame } from './harness.mjs';

const { GP } = loadGame();
const { PROV, ADJM, TOTAL } = GP;
const problems = [];
const note = (m) => { problems.push(m); console.log('  !! ' + m); };

// This file plays several whole rounds, so it exposes a lighter sample for iteration.
const QUICK = process.argv.includes('--quick');
const ROUNDS = QUICK ? 2 : 6;

// ---------------------------------------------------------------- end-of-deal bookkeeping
console.log('=== the all-placed bonus and the countdown fire on the LAST piece ===');
{
  // The deck is drawn two ahead (current + next), so "the deck is empty" happens one piece
  // early: the last piece is still sitting in `next`. That off-by-one used to start the final
  // countdown and pay the +1,000 bonus on the second-to-last drop.
  //
  // Play at a roomier size so the round normally survives long enough to place every piece;
  // a round that overflows early is skipped, since it says nothing about this bookkeeping.
  GP.setSizeModel(0.28, 0.32, 0.72);
  let checked = 0;
  for (let round = 0; round < 4 && checked < 3; round++) {
    GP.startGame();
    let frame = 0, bonusAt = null, provincesAtBonus = null, droppedAtBonus = null;
    let countdownStartedAt = null, countdownTarget = null, simAtBonus = null;
    for (let i = 1; i <= GP.PIECE_COUNT + 3; i++) {
      let guard = 0;
      while (!GP.current && GP.state === 'play' && guard++ < 4000) { GP.step(); frame++; }
      if (!GP.current) break;
      const before = GP.timeUpAt;
      GP.setHoverX(GP.W / 2);
      GP.drop();
      if (before === null && GP.timeUpAt !== null) {
        // sample immediately: this is the instant the bonus is applied inside drop()
        bonusAt = i;
        provincesAtBonus = GP.dropped;
        droppedAtBonus = GP.dealt;
        countdownStartedAt = GP.simTime;
        countdownTarget = GP.timeUpAt;
      }
      for (let k = 0; k < 20 && GP.state === 'play'; k++) { GP.step(); frame++; }
      if (GP.state !== 'play') break;
    }
    if (GP.lastFinish && GP.lastFinish.kind === 'overflow' && bonusAt === null) {
      console.log(`  round ${round + 1}: 溢出结束，跳过（这一局没投满 ${GP.PIECE_COUNT} 块）`);
      continue;
    }
    checked++;
    console.log(`  round ${round + 1}: 开局牌堆 ${GP.PIECE_COUNT - 2} 张，奖励/倒计时在第 ${bonusAt} 块触发` +
      `（此时已投放 ${provincesAtBonus} 个省 / ${droppedAtBonus} 块），倒计时 ${Math.round((countdownTarget - countdownStartedAt) / 1000)}s`);
    if (bonusAt !== GP.PIECE_COUNT) note(`round ${round + 1}: bonus fired on piece ${bonusAt}, expected ${GP.PIECE_COUNT}`);
    if (provincesAtBonus !== TOTAL) note(`round ${round + 1}: bonus fired with ${provincesAtBonus} provinces placed, expected ${TOTAL}`);
    if (droppedAtBonus !== GP.PIECE_COUNT) note(`round ${round + 1}: bonus fired after ${droppedAtBonus} pieces, expected ${GP.PIECE_COUNT}`);
    if (!(countdownTarget > countdownStartedAt)) note(`round ${round + 1}: countdown started already expired`);
  }
  if (!checked) note('could not play a round through to the last piece; bookkeeping unverified');
  GP.setSizeModel(0.28, 0.32, 0.92);      // back to the shipped settings
}

// ---------------------------------------------------------------- size model decoupling
console.log('=== MERGE_EXP must not resize single provinces ===');
{
  const SINGLES = [820000, 310000, 110000, 440000, 150000, 650000];
  const widths = (exp, mergeExp) => {
    GP.setSizeModel(exp, mergeExp, 0.92);
    return SINGLES.map((c) => {
      const p = GP.buildPiece([c]);
      return p.maxX - p.minX;
    });
  };
  const a = widths(0.28, 0.28);
  const b = widths(0.28, 0.32);
  const c = widths(0.34, 0.32);
  const same = a.every((w, i) => Math.abs(w - b[i]) < 0.01);
  console.log(`  mergeExp 0.28 -> 0.32 时单省宽度: ${SINGLES.map((code, i) => `${PROV[code].label} ${a[i].toFixed(0)}->${b[i].toFixed(0)}`).join('  ')}`);
  console.log(`  单省大小不变: ${same}`);
  if (!same) note('MERGE_EXP changed single-province sizes; the knobs are not decoupled');
  const grew = c.some((w, i) => w > a[i] + 0.5);
  console.log(`  SIZE_EXP 0.28 -> 0.34 确实会改变单省: ${grew}`);
  if (!grew) note('SIZE_EXP does not change single-province sizes');

  // and merged pieces really do respond to MERGE_EXP
  const big = (mergeExp) => {
    GP.setSizeModel(0.28, mergeExp, 0.92);
    const p = GP.buildPiece([110000, 120000, 130000, 140000, 150000, 610000, 620000, 640000, 650000, 630000,
      510000, 500000, 520000, 530000, 540000, 410000, 420000, 430000, 440000, 450000]);
    return p.maxX - p.minX;
  };
  const m1 = big(0.28), m2 = big(0.32);
  console.log(`  20 省合并块宽度: mergeExp 0.28 -> ${m1.toFixed(0)}，0.32 -> ${m2.toFixed(0)}（+${(m2 / m1 * 100 - 100).toFixed(0)}%）`);
  if (!(m2 > m1 + 1)) note('MERGE_EXP does not change merged-piece size');
  GP.setSizeModel(0.28, 0.32, 0.92);
}

// ---------------------------------------------------------------- the ordered deal
console.log('\n=== ordered deal: every hand can join the box ===');
{
  GP.setOrderedDeal(true);
  if (!GP.orderedDeal) note('setOrderedDeal(true) did not take effect');
  let hands = 0, joinable = 0, firstPiece = 0;
  const seenCodes = new Set();
  let piecesDealt = 0;
  for (let round = 0; round < ROUNDS; round++) {
    GP.startGame();
    let frame = 0;
    while (GP.state === 'play' && frame < 60 * 400) {
      if (GP.current) {
        const piece = GP.current.piece;
        const mine = new Set(piece.codes);
        const hasLink = GP.pieces.length === 0
          || GP.pieces.some((b) => b.piece.codes.some((c) => [...ADJM[c]].some((o) => mine.has(o))));
        hands++;
        if (GP.pieces.length === 0) firstPiece++;
        else if (hasLink) joinable++;
        else note(`hand ${hands} (${piece.name}) could not join anything while the box was not empty`);
        for (const c of piece.codes) seenCodes.add(c);
        piecesDealt++;
        // the game's own loader reports the links it sees
        if (GP.pieces.length && GP.adjLinksToBox(piece.codes) === 0) {
          note(`adjLinksToBox says 0 for ${piece.name} although it was dealt in ordered mode`);
        }
        GP.setHoverX(30 + (hands * 47) % (GP.W - 60));
        GP.drop();
      }
      GP.step(); frame++;
    }
  }
  console.log(`  ${round_()}: ${hands} hands, ${joinable} joinable (${firstPiece} opening piece)`);
  console.log(`  provinces seen across 6 rounds: ${seenCodes.size}`);
  if (seenCodes.size !== TOTAL) note(`ordered dealing covered only ${seenCodes.size} provinces`);
  GP.setOrderedDeal(false);
  if (GP.orderedDeal) note('setOrderedDeal(false) did not take effect');
  console.log('  mode off again: ok');
}
function round_() { return '6 rounds'; }

// ---------------------------------------------------------------- the deal is intact
console.log('\n=== the deal still hands out everything ===');
{
  // Check the deck itself rather than a played round: a round may legitimately end early by
  // overflowing, which says nothing about whether the deal covers all 34 provinces.
  for (const ordered of [false, true]) {
    GP.setOrderedDeal(ordered);
    const deck = GP.freshDeck();
    const units = deck.map((u) => (Array.isArray(u) ? u.slice() : [u]));
    const flat = units.flat();
    const counts = new Map();
    for (const c of flat) counts.set(c, (counts.get(c) || 0) + 1);
    const dupes = [...counts].filter(([, n]) => n !== 1);
    console.log(`  ordered=${String(ordered).padEnd(5)}: 开局 ${units.length} 块，覆盖 ${counts.size} 个省，重复 ${dupes.length}`);
    if (units.length !== GP.PIECE_COUNT) note(`ordered=${ordered}: deck has ${units.length} units, expected ${GP.PIECE_COUNT}`);
    if (counts.size !== TOTAL) note(`ordered=${ordered}: deck covers ${counts.size} provinces, expected ${TOTAL}`);
    if (dupes.length) note(`ordered=${ordered}: provinces repeated in the deck: ${dupes.map(([c]) => PROV[c].label).join(',')}`);
    // and a full round really does deal them all
    GP.startGame();
    let n = 0, frame = 0;
    const dealt = new Set();
    while (GP.state === 'play' && frame < 60 * 500) {
      if (GP.current) { for (const c of GP.current.codes) dealt.add(c); n++; GP.setHoverX(GP.W / 2); GP.drop(); }
      GP.step(); frame++;
    }
    console.log(`     一局实测: 投出 ${n} 块 / ${dealt.size} 个省，因 ${GP.lastFinish ? GP.lastFinish.kind : '?'} 结束`);
    if (n < GP.PIECE_COUNT && GP.lastFinish && GP.lastFinish.kind !== 'overflow') {
      note(`ordered=${ordered}: round ended by ${GP.lastFinish.kind} after only ${n} pieces`);
    }
  }
  GP.setOrderedDeal(false);
}

console.log('\nsummary: ' + (problems.length ? `${problems.length} problem(s)` : 'test mode and size model behave as specified'));
for (const p of problems) console.log('  - ' + p);
process.exitCode = problems.length ? 1 : 0;
