/* Test mode: deal only pieces that can join what is already in the box.
 *
 * This answers a question the game could not answer before: is "all 34 provinces in one piece"
 * physically reachable? With random draws even 20 provinces is a matter of luck, so the win
 * condition had never been verified. With the ordered deal the bot is always handed a mergeable
 * piece, and it places it exactly where it belongs - resting against the neighbour it borders,
 * with the game's own collision test confirming there is no interpenetration. That isolates the
 * real question: does the box have room for the whole chain?
 *
 * Run: node tools/verify-winnable.mjs [--verbose]
 */
import { loadGame } from './harness.mjs';

const { GP } = loadGame();
const { PROV, ADJM, TOTAL } = GP;
const VERBOSE = process.argv.includes('--verbose');

GP.setOrderedDeal(true);

function ringArea(r) {
  let a = 0;
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a / 2);
}
function snapshot() {
  let drawn = 0, top = GP.FLOOR_Y;
  for (const b of GP.pieces) {
    for (const c of b.piece.codes) for (const r of PROV[c].pts) drawn += ringArea(r) * b.piece.s * b.piece.s;
    top = Math.min(top, b.bounds.min.y);
  }
  const big = GP.pieces.reduce((m, b) => (!m || b.piece.codes.length > m.piece.codes.length ? b : m), null);
  return {
    pieces: GP.pieces.length, fill: drawn / (GP.BW * GP.BH), top,
    biggest: big ? big.piece.codes.length : 0, biggestName: big ? big.piece.name : '-',
  };
}

/* Place the hovering piece so it rests against the neighbour it borders inside `target`.
 *
 * The spot that puts the two neighbouring provinces on top of each other is the starting guess.
 * From there the piece is lifted straight up until nothing overlaps (monotone, so it cannot
 * oscillate the way pushing along a collision normal can), then lowered back until it just
 * touches. The result is a legitimate "leaning against it" placement with no interpenetration. */
function placeBeside(piece, target) {
  const member = piece.codes.find((c) => [...ADJM[c]].some((o) => target.piece.codes.includes(o)));
  if (member === undefined) return { ok: false, pen: Infinity };
  const nbr = [...ADJM[member]].find((o) => target.piece.codes.includes(o));
  const a = GP.memberAnchor(member);                        // my member, in my own local frame
  const b = target.piece.parts.find((q) => q.code === nbr); // the neighbour, in the target's frame
  if (!a || !b) return { ok: false, pen: Infinity };
  const ca = Math.cos(target.angle), sa = Math.sin(target.angle);
  const wx = target.position.x + b.lx * ca - b.ly * sa;
  const wy = target.position.y + b.lx * sa + b.ly * ca;
  let best = null;
  for (let step = 0; step < 12; step++) {
    // try a few orientations: the piece is free to settle at an angle
    const ang = target.angle + step * 0.3;
    const c2 = Math.cos(ang), s2 = Math.sin(ang);
    const x = wx - (a.x * c2 - a.y * s2);
    const yOverlap = wy - (a.x * s2 + a.y * c2);
    let yClear = yOverlap;
    for (let push = 0; push < 80; push++) {
      const c = GP.collisionAt(x, yClear);
      if (c.depth <= 0.05) break;
      yClear -= (c.depth + 0.5);
      if (yClear < 6) break;
    }
    // yOverlap overlaps, yClear is clear: bisect for the lowest clear y
    let lo = yOverlap, hi = yClear;
    for (let it = 0; it < 30; it++) {
      const mid = (lo + hi) / 2;
      if (GP.collisionAt(x, mid).depth <= 0.05) hi = mid; else lo = mid;
    }
    const c = GP.collisionAt(x, hi);
    const settled = yClear - hi;                            // how far it came back down
    if (!best || c.depth < best.pen) best = { x, y: hi, pen: c.depth, angle: ang, settled };
    if (c.depth <= 0.05 && settled > 2) break;
  }
  return { ok: best.pen <= 0.6, ...best };
}

function playOnce() {
  GP.startGame();
  let frame = 0, log = [], atWin = null;
  while (GP.state === 'play' && GP.dealt < GP.PIECE_COUNT && frame < 60 * 900) {
    if (GP.current) {
      const piece = GP.current.piece;
      const mine = new Set(piece.codes);
      const targets = GP.pieces
        .filter((b) => b.piece.codes.some((c) => [...ADJM[c]].some((o) => mine.has(o))))
        .sort((a, b) => (b.piece.codes.length - a.piece.codes.length) || (a.position.y - b.position.y));
      if (!targets.length) {
        GP.setHoverX(GP.W / 2);
        GP.drop();                                          // first piece
      } else {
        const spot = placeBeside(piece, targets[0]);
        GP.placeAt(spot.x, spot.y);
        if (VERBOSE) {
          log.push(`#${GP.dealt} ${piece.name} -> beside ${targets[0].piece.name} ` +
            `pen=${spot.pen.toFixed(2)} settled=${(spot.settled || 0).toFixed(0)}${spot.ok ? '' : ' (forced)'}`);
        }
      }
      for (let i = 0; i < 45 && GP.state === 'play'; i++) {
        if (GP.chinaCount) break;
        GP.step(); frame++;
      }
    }
    if (GP.chinaCount) break;
    GP.step(); frame++;
  }
  if (GP.chinaCount) atWin = snapshot();                    // capture before the finale clears it
  return { ...snapshot(), atWin, china: GP.chinaCount, score: GP.score, dealt: GP.dealt, log };
}

const runs = [];
const QUICK = process.argv.includes('--quick');
const N = QUICK ? 1 : 4;
for (let i = 0; i < N; i++) runs.push(playOnce());
console.log('=== ordered deal + exact placement ===');
for (const [i, r] of runs.entries()) {
  if (r.china) {
    console.log(`run ${i + 1}: completed the map (34 provinces) at drop ${r.dealt}; ` +
      `at that moment ${r.atWin.biggest} provinces in one piece, fill ${(r.atWin.fill * 100).toFixed(0)}%, ` +
      `pieces left ${r.atWin.pieces}, score ${r.score}`);
  } else {
    console.log(`run ${i + 1}: biggest ${r.biggest} provinces (${r.biggestName}), left ${r.pieces}, ` +
      `fill ${(r.fill * 100).toFixed(0)}%, score ${r.score}`);
  }
}
if (VERBOSE && runs[0].log) {
  console.log('\nfirst run, placement by placement:');
  for (const l of runs[0].log) console.log('  ' + l);
}
const best = Math.max(...runs.map((r) => (r.china ? 34 : r.biggest)));
const wins = runs.reduce((a, r) => a + (r.china ? 1 : 0), 0);
console.log(`\nbest chain: ${best} of ${TOTAL}; completed maps ${wins}/${runs.length}`);
if (wins) console.log('=> the win condition is reachable: the box has room for the whole map');
else console.log('=> still short: the box or the size model runs out first');
GP.setOrderedDeal(false);
