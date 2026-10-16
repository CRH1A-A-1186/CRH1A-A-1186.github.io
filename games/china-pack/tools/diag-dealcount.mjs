// Reproduce the report: on dropping the 29th piece the game behaves as if every piece has been
// placed - it awards the all-placed bonus and starts the final countdown.
//
// Watch the deck length, the dealt counter and the countdown across the whole round.
import { loadGame } from './harness.mjs';

const { GP } = loadGame();
const { ADJM } = GP;
const name = (c) => GP.PROV[c].name;

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
  return GP.W / 2;
}

console.log(`PIECE_COUNT (pieces per round) = ${GP.PIECE_COUNT}`);
GP.startGame();
console.log(`opening deck length = ${GP.deck.length}`);
console.log('');
console.log('drop | piece                      | provinces | deck before -> after | dealt | dropped | countdown');

let frame = 0, lastDealt = 0;
let bonusAt = null, countdownAt = null;
const N = GP.PIECE_COUNT + 2;
for (let i = 0; i < N; i++) {
  // wait for the next piece to be handed over
  let guard = 0;
  while (!GP.current && GP.state === 'play' && guard++ < 3000) { GP.step(); frame++; }
  if (!GP.current) break;

  const piece = GP.current.piece;
  const deckBefore = GP.deck.length;
  const before = { dealt: GP.dealt, dropped: GP.dropped, timeUp: GP.timeUpAt };
  GP.setHoverX(chooseX(piece, frame));
  GP.drop();
  const deckAfter = GP.deck.length;

  // the bonus and countdown are applied inside drop(); check them right away
  const bonusFired = GP.timeUpAt !== null && before.timeUp === null;
  const allDroppedSeen = GP.dropped; // for reference only

  console.log(`${String(i + 1).padStart(4)} | ${piece.name.padEnd(26)} | ${String(piece.codes.length).padStart(9)} | ` +
    `${String(deckBefore).padStart(4)} -> ${String(deckAfter).padStart(11)} | ${String(GP.dealt).padStart(5)} | ` +
    `${String(GP.dropped).padStart(7)} | ${GP.timeUpAt === null ? '-' : 'RUNNING'}${bonusFired ? '  <== 加分+倒计时在这里触发' : ''}`);

  if (bonusFired && bonusAt === null) bonusAt = i + 1;
  if (GP.timeUpAt !== null && countdownAt === null) countdownAt = i + 1;

  // let it settle a bit
  for (let k = 0; k < 30 && GP.state === 'play'; k++) { GP.step(); frame++; }
  if (GP.state !== 'play') break;
}

console.log('');
console.log(`每局 ${GP.PIECE_COUNT} 块；加分/倒计时在第 ${bonusAt} 块触发`);
if (bonusAt !== GP.PIECE_COUNT) {
  console.log(`!! 应该是第 ${GP.PIECE_COUNT} 块，实际第 ${bonusAt} 块 —— 差 ${GP.PIECE_COUNT - bonusAt} 块`);
} else {
  console.log('触发时机正确');
}
