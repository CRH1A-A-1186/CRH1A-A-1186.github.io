/* Regression: shaking must not leak into the next round.
 *
 * Report: shake on and off until the map completes - then in round 2 the first piece slides to
 * the far left/right edge by itself.
 *
 * Cause: a shake physically moves the walls by shakeX every frame. Completing the map mid-shake
 * cleared the shake state but left the walls at the shifted positions, and the next round did not
 * put them back, so the box stayed offset by one amplitude and a freshly dropped piece was shoved
 * against the edge.
 *
 * Run: node tools/verify-shake.mjs      (from the china-pack directory)
 */
import { loadGame } from './harness.mjs';

const { GP, tick } = loadGame();
const problems = [];
const note = (m) => { problems.push(m); console.log('  !! ' + m); };
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

function wallReport(label, tol = 0.01) {
  const w = GP.wallXs, b = GP.wallBaseXs;
  const ok = near(w.left, b.left, tol) && near(w.right, b.right, tol) && near(w.floor, b.floor, tol);
  console.log(`  ${label.padEnd(34)} left=${w.left.toFixed(2)} (base ${b.left}) right=${w.right.toFixed(2)} (base ${b.right}) floor=${w.floor.toFixed(2)} (base ${b.floor})  ${ok ? 'ok' : 'OFFSET'}`);
  return ok;
}

// ---------------------------------------------------------------- 1. a shake caught at its peak
console.log('=== completing the map mid-shake must reset the walls ===');
{
  GP.startGame();
  GP.setOrderedDeal(true);
  tick(20);
  GP.startShake();
  console.log(`  started a shake: shaking=${GP.shaking}`);

  // step until the shake is at its largest displacement, then fire the completion there
  let peak = 0, guard = 0;
  while (guard++ < 120 && GP.shaking) {
    tick(1);
    if (Math.abs(GP.shakeX) > Math.abs(peak)) peak = GP.shakeX;
    if (Math.abs(GP.shakeX) > 6) break;          // near the amplitude
  }
  const wallsAtPeak = GP.wallXs;
  const base = GP.wallBaseXs;
  console.log(`  caught the shake at shakeX=${GP.shakeX.toFixed(2)} (peak seen ${peak.toFixed(2)})`);
  console.log(`  walls at that instant: left=${wallsAtPeak.left.toFixed(2)} right=${wallsAtPeak.right.toFixed(2)} floor=${wallsAtPeak.floor.toFixed(2)}`);
  const displaced = !near(wallsAtPeak.left, base.left, 0.5);
  console.log(`  walls actually displaced: ${displaced}`);
  if (!displaced) note('the shake never displaced the walls; the case is not being exercised');

  console.log(`  completing the map while still shaking (shaking=${GP.shaking})`);
  GP.forceChina();
  tick(1);
  if (!wallReport('right after the finale starts')) note('walls not reset when the finale starts');

  for (let i = 0; i < 60 * 6; i++) tick(1);
  console.log(`  round now ${GP.round}, shaking=${GP.shaking}, shakeX=${GP.shakeX.toFixed(2)}`);
  if (!wallReport('in the next round')) note('walls still offset in the next round');
  GP.setOrderedDeal(false);
}

// ---------------------------------------------------------------- 2. a piece dropped in round 2 stays put
// Comparing one drop is noisy: a concave piece dropped flat can topple and land 10-40 units off, and
// which piece gets dealt is random. So run the same situation twice with a fixed RNG -- once
// advancing normally, once completing the map mid-shake -- and compare where the piece lands.
console.log('\n=== the first piece of round 2 must land where an unshaken run puts it ===');
{
  const realRandom = Math.random;
  const seed = (n) => {
    let s = n >>> 0;
    Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  };

  // play into round 2 and drop the first piece of the new round at the centre
  function round2Drop(shaking) {
    seed(20251017);
    GP.startGame();
    tick(20);
    if (shaking) {
      GP.startShake();
      let guard = 0;
      while (guard++ < 120 && GP.shaking && Math.abs(GP.shakeX) < 6) tick(1);
    }
    GP.forceChina();
    for (let i = 0; i < 60 * 6 && GP.round === 1; i++) tick(1);
    for (let i = 0; i < 200 && !GP.current; i++) tick(1);
    if (!GP.current) return null;
    const want = GP.W / 2;
    GP.hoverAt(want);
    const before = GP.pieces.length;
    GP.drop();
    for (let i = 0; i < 90; i++) tick(1);
    // take the body this drop added; pieces[0] can be a leftover from the previous round
    const b = GP.pieces[GP.pieces.length - 1];
    if (!b || GP.pieces.length <= before - 0) { /* merged on landing is fine */ }
    return b ? { cx: (b.bounds.min.x + b.bounds.max.x) / 2, want, walls: GP.wallXs } : null;
  }

  try {
    const control = round2Drop(false);
    const shaken = round2Drop(true);
    if (!control || !shaken) note('could not reach round 2 in one of the runs');
    else {
      console.log(`  unshaken run: piece landed at x=${control.cx.toFixed(1)} (aim ${control.want})`);
      console.log(`  shaken run:   piece landed at x=${shaken.cx.toFixed(1)} (aim ${shaken.want})`);
      const diff = Math.abs(control.cx - shaken.cx);
      console.log(`  difference: ${diff.toFixed(1)} units`);
      // the same piece in the same situation must land in the same place
      if (diff > 15) note(`the shaken run landed ${diff.toFixed(1)} units away from the unshaken one — the shake leaked`);
    }
  } finally {
    Math.random = realRandom;
  }
}

// ---------------------------------------------------------------- 3. a normal shake still restores itself
console.log('\n=== an ordinary shake settles back on its own ===');
{
  GP.startGame();
  tick(20);
  GP.startShake();
  for (let i = 0; i < 30; i++) tick(1);
  const during = GP.shakeX;
  for (let i = 0; i < 60 * 3; i++) tick(1);          // well past SHAKE_GRACE
  console.log(`  during shake shakeX=${during.toFixed(2)}, afterwards shakeX=${GP.shakeX.toFixed(2)}, shaking=${GP.shaking}`);
  if (!near(GP.shakeX, 0)) note('shakeX did not return to 0');
  if (GP.shaking) note('still marked as shaking after it should have finished');
  if (!wallReport('after a normal shake')) note('walls not back after a normal shake');
}

console.log('\nsummary: ' + (problems.length ? `${problems.length} problem(s)` : 'shake state stays inside its own round'));
for (const p of problems) console.log('  - ' + p);
process.exit(problems.length ? 1 : 0);
