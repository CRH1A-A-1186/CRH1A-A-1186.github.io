// Can normal play crash the physics engine? Matter's Collision._findSupports can throw on
// degenerate contacts, so hammer the real game with many rounds and many policies.
import { loadGame } from './harness.mjs';

const { GP, tick } = loadGame();
const { ADJM } = GP;

let crashes = 0, firstCrash = null;

function chooseX(piece, policy, frame) {
  if (policy === 'sweep') return 12 + (GP.BW - 24) * ((frame % 240) / 240);
  if (policy === 'center') return GP.W / 2;
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
        if (x < 30 || x > GP.W - 30) continue;
        const [, py] = GP.hoverAt(x);
        cand.push({ x, s: b.position.y - py * 0.5 + ((frame + x) % 7 - 3) * 0.5 });
      }
    }
    if (cand.length) { cand.sort((a, b) => b.s - a.s); return cand[0].x; }
  }
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
    if (contact * 4 + py * 0.02 < bestScore) { bestScore = contact * 4 + py * 0.02; best = x; }
  }
  return best;
}

const policies = ['smart', 'sweep', 'center', 'stack'];
// Expose the sample size so the suite can run a quicker pass when iterating.
const QUICK = process.argv.includes('--quick');
const FULL = process.argv.includes('--full');
const PER_POLICY = QUICK ? 3 : FULL ? 25 : 12;
console.log(`hammering the engine: ${PER_POLICY} rounds x ${policies.length} policies = ${PER_POLICY * policies.length} rounds`);
let rounds = 0, timeups = 0, overflows = 0, wins = 0;
for (const policy of policies) {
  for (let i = 0; i < PER_POLICY; i++) {
    try {
      GP.startGame();
      let frame = 0;
      while (GP.state === 'play' && frame < 60 * 300) {
        if (GP.current) { GP.setHoverX(chooseX(GP.current.piece, policy, frame)); GP.drop(); }
        tick(1); frame++;
      }
      rounds++;
      if (GP.lastFinish && GP.lastFinish.kind === 'timeup') timeups++;
      if (GP.lastFinish && GP.lastFinish.kind === 'overflow') overflows++;
      if (GP.chinaCount) wins++;
    } catch (e) {
      crashes++;
      if (!firstCrash) firstCrash = { policy, i, error: e.message, stack: (e.stack || '').split('\n').slice(0, 5).join('\n') };
    }
  }
}

console.log(`rounds played: ${rounds}`);
console.log(`  ended by overflow: ${overflows}`);
console.log(`  ended by countdown: ${timeups}`);
console.log(`  completed maps (should be 0 for a random bot): ${wins}`);
console.log(`physics crashes: ${crashes}`);
if (firstCrash) {
  console.log(`  first crash: ${firstCrash.policy} run ${firstCrash.i}: ${firstCrash.error}`);
  console.log(firstCrash.stack);
}
process.exitCode = crashes ? 1 : 0;
