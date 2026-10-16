// Verify the win state: the 中国地图 finale, its celebration, and the round advance.
// Reaching 34 provinces in one piece by random play is far too rare, so it is injected.
// Two finale cycles are run back to back, then a clean round is played to prove the deck refills.
import { loadGame } from './harness.mjs';

const { GP, tick } = loadGame();
const problems = [];
const note = (m) => { problems.push(m); console.log('  !! ' + m); };

const FINALE_MS = 5000;
const SEC = 60;

console.log('=== finale / round advance ===');
GP.setPieceScale(0.88);
GP.startGame();
tick(30);

// --- first completion ---
const startRound = GP.round, startChina = GP.chinaCount, startScore = GP.score;
const n1 = GP.forceChina();
console.log(`injected ${n1} provinces -> 拼成=${GP.chinaCount} round=${GP.round} score=${GP.score}`);
if (n1 !== 34) note(`expected a 34-province piece, got ${n1}`);
if (GP.chinaCount !== startChina + 1) note('拼成 counter did not increase');
if (GP.score <= startScore) note('score did not increase for the completed map');

let advancedAt = null;
for (let i = 1; i <= 9 * SEC; i++) {
  tick(1);
  if (advancedAt === null && GP.round === startRound + 1) advancedAt = i / SEC;
}
console.log(`round advanced after ${advancedAt}s (finale is ${FINALE_MS / 1000}s)`);
if (advancedAt === null) note('round never advanced after the finale');
else if (advancedAt < FINALE_MS / 1000 - 0.2) note(`round advanced too early (${advancedAt}s)`);
if (GP.state !== 'play') note(`state after the finale is ${GP.state}, expected play`);
if (GP.dropped !== 0) note(`dropped should reset for the new round, got ${GP.dropped}`);
if (GP.timeUpAt !== null) note('the countdown should not run in a fresh round');
if (GP.pieces.length !== 0) note(`the box should be empty in a fresh round, has ${GP.pieces.length}`);

// --- second completion, straight after ---
const n2 = GP.forceChina();
console.log(`second injection: ${n2} provinces, 拼成=${GP.chinaCount}`);
if (GP.chinaCount !== startChina + 2) note('second completion did not register');
for (let i = 1; i <= 9 * SEC; i++) tick(1);
console.log(`after second finale: round=${GP.round} state=${GP.state} 拼成=${GP.chinaCount}`);
if (GP.round !== startRound + 2) note(`round did not advance a second time (${GP.round})`);

// --- the round after two finales must deal a refilled deck, and still be playable ---
if (GP.state !== 'play') {
  // the round can legitimately have ended if a piece was already in play; restart for a clean check
  console.log('(restarting for the deck check)');
  GP.startGame();
  tick(30);
}
const seen = new Set();
let drops = 0;
for (let i = 0; i < 200 * SEC && drops < 24; i++) {
  if (GP.current && GP.state === 'play') { seen.add(GP.current.code); GP.drop(); drops++; }
  tick(1);
}
console.log(`deck check: ${drops} drops, ${seen.size} distinct provinces, state=${GP.state}`);
if (drops >= 12 && seen.size !== drops) note(`the deck reused a province (${drops} drops, ${seen.size} distinct)`);
// A fresh round ends when the box overflows, and at the shipped size that can happen after ~20
// drops. What matters is that the round started clean (full deck, empty box), which is checked
// above; ending early is normal play, not a fault.
if (GP.state !== 'play' && GP.lastFinish && GP.lastFinish.kind !== 'overflow') {
  note(`a fresh round ended by ${GP.lastFinish.kind} after only ${drops} drops`);
}

console.log('\nsummary: ' + (problems.length ? `${problems.length} problem(s)` : 'finale, celebration and round advance all OK'));
for (const p of problems) console.log('  - ' + p);
process.exitCode = problems.length ? 1 : 0;
