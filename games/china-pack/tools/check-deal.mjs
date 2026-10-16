// Check the opening deal: 32 pieces, with 京津冀 and 粤港澳 already joined.
import { loadGame } from './harness.mjs';

const { GP } = loadGame();
const deck = GP.freshDeck();
console.log(`pieces per round: ${deck.length}  (PIECE_COUNT=${GP.PIECE_COUNT})`);

const groups = deck.filter((u) => u.length > 1);
console.log(`starting groups: ${groups.map((u) => u.map((c) => GP.PROV[c].name).join('+')).join('   |   ')}`);

const all = new Set();
for (const u of deck) for (const c of u) all.add(c);
console.log(`provinces covered: ${all.size} of 34`);
const missing = GP.PROV.map((p) => p[0]).filter((c) => GP.PROV[c] && !all.has(c));
if (missing.length) console.log('MISSING:', missing.map((c) => GP.PROV[c].name).join(','));

// no province may repeat between units
const seen = new Map();
for (const u of deck) for (const c of u) seen.set(c, (seen.get(c) || 0) + 1);
const dupes = [...seen].filter(([, n]) => n > 1);
console.log(`repeated provinces: ${dupes.length ? dupes.map(([c]) => GP.PROV[c].name).join(',') : 'none'}`);

// dimensions of every starting piece: all must fit the box comfortably
console.log('\nstarting piece sizes (units, box is 300 x 372):');
let worst = { name: '', w: 0 };
for (const u of deck) {
  const p = GP.buildPiece(u);
  const w = p.maxX - p.minX, h = p.maxY - p.minY;
  if (w > worst.w) worst = { name: p.name, w };
  if (u.length > 1 || w > 70) {
    console.log(`  ${p.name.padEnd(22)} ${u.length}省  ${w.toFixed(0)} x ${h.toFixed(0)}`);
  }
}
console.log(`widest starting piece: ${worst.name} ${worst.w.toFixed(0)} units (${(worst.w / GP.BW * 100).toFixed(0)}% of box width)`);

// the dead-end provinces must no longer be dealt alone
const solo = [];
for (const u of deck) {
  if (u.length !== 1) continue;
  const c = u[0];
  if (GP.ADJM[c].size <= 2) solo.push(`${GP.PROV[c].name}(${GP.ADJM[c].size} neighbours)`);
}
console.log(`\nstarting pieces with <=2 neighbours (dead-end risk): ${solo.length ? solo.join(', ') : 'none'}`);
