// Where does test time actually go? Time the pieces separately before optimising anything.
import { loadGame } from './harness.mjs';

const { GP, tick } = loadGame();
const { PROV, ADJM } = GP;

function ms(fn, n = 1) {
  const t0 = performance.now();
  for (let i = 0; i < n; i++) fn();
  return (performance.now() - t0) / n;
}

GP.setSizeModel(0.28, 0.32, 0.92);
GP.startGame();

// 1. empty-ish physics: step with a few pieces
console.log('--- cost of one step() ---');
const bench = (label, pieces) => {
  GP.startGame();
  for (const p of pieces) { GP.setHoverX(60 + (p * 37) % 200); GP.drop(); for (let i = 0; i < 40; i++) tick(1); }
  const t = ms(() => tick(1), 2000);
  console.log(`  ${label.padEnd(28)} ${t.toFixed(3)} ms/step  (${GP.pieces.length} pieces)`);
};
bench('box empty', []);
bench('1 piece', [1]);
bench('five separate provinces', [1, 2, 3, 4, 5]);

// a big merged blob is the expensive case
GP.startGame();
GP.setOrderedDeal(true);
{
  let n = 0;
  while (GP.state === 'play' && n < 22 && GP.dealt < GP.PIECE_COUNT) {
    if (GP.current) {
      const piece = GP.current.piece;
      const mine = new Set(piece.codes);
      const targets = GP.pieces.filter((b) => b.piece.codes.some((c) => [...ADJM[c]].some((o) => mine.has(o))));
      if (targets.length) {
        const t = targets.sort((a, b) => b.piece.codes.length - a.piece.codes.length)[0];
        GP.setHoverX(t.position.x);
      } else GP.setHoverX(160);
      GP.drop(); n++;
    }
    GP.step();
  }
  for (let i = 0; i < 120; i++) GP.step();
  const biggest = GP.pieces.reduce((m, b) => Math.max(m, b.piece.codes.length), 0);
  const t = ms(() => GP.step(), 1000);
  console.log(`  ${('big blob (' + biggest + ' provinces)').padEnd(28)} ${t.toFixed(3)} ms/step  (${GP.pieces.length} pieces)`);
}
GP.setOrderedDeal(false);

// 2. the test-only collision helpers, which used to rebuild a body on every call
console.log('\n--- cost of the test helpers ---');
GP.setSizeModel(0.28, 0.32, 0.92);
GP.startGame();
const dropOne = () => {
  while (!GP.current) GP.step();
  GP.setHoverX(60 + (GP.dealt * 53) % 200);
  GP.drop();
  for (let k = 0; k < 50; k++) GP.step();
};
dropOne(); dropOne();
if (GP.current) {
  GP.collisionAt(160, 300);                                   // warm the cached probe body
  console.log(`  collisionAt(x,y)               ${ms(() => GP.collisionAt(160, 300), 500).toFixed(4)} ms/call`);
}
// placeAt consumes the hovering piece, so measure it as "fresh factory each time"
{
  let total = 0;
  const N = 30;
  for (let i = 0; i < N; i++) {
    GP.startGame();
    while (!GP.current) GP.step();
    const t0 = performance.now();
    GP.placeAt(160, 300);
    total += performance.now() - t0;
  }
  console.log(`  placeAt(x,y)                   ${(total / N).toFixed(3)} ms/call`);
}
console.log('\n--- cost of buildPiece (convex decomposition of the merged outline) ---');
GP.setSizeModel(0.28, 0.32, 0.92);
const ORDER = [110000, 120000, 130000, 140000, 150000, 610000, 620000, 640000, 650000, 630000,
  510000, 500000, 520000, 530000, 540000, 410000, 420000, 430000, 440000, 450000, 370000];
for (const n of [1, 5, 10, 15, 21]) {
  const codes = ORDER.slice(0, n);
  console.log(`  ${String(n).padStart(2)} provinces: ${ms(() => GP.buildPiece(codes), 20).toFixed(2)} ms/call`);
}

// 3. how many step() calls does a typical round cost
console.log('\n--- steps per round ---');
GP.setOrderedDeal(false);
GP.setSizeModel(0.28, 0.32, 0.92);
GP.startGame();
let steps = 0;
while (GP.state === 'play' && steps < 60000) { if (GP.current) { GP.setHoverX(160); GP.drop(); } GP.step(); steps++; }
console.log(`  a full round: ${steps} steps (ended by ${GP.lastFinish ? GP.lastFinish.kind : '?'})`);
console.log(`  at ~0.15 ms/step that is ~${(steps * 0.15 / 1000).toFixed(1)} s per round`);
