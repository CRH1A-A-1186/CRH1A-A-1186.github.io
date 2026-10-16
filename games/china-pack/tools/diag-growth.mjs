// How does a merged piece's on-screen size grow as provinces join it?
// If merging makes the piece relatively *smaller*, the late game gets easier instead of harder.
import { loadGame } from './harness.mjs';

const { GP } = loadGame();
const { PROV } = GP;
const BOX = GP.BW * GP.BH;

function sumArea(codes) { return codes.reduce((a, c) => a + PROV[c].area, 0); }

console.log('== one piece, provinces added in the order they would naturally merge ==');
console.log('provinces |  real area  | scale s |  drawn W x H  | drawn area / box | box-width %');

// a plausible merge order: 华北大区 then 西北, matching the screenshot's 28-province blob
const ORDER = [110000, 120000, 130000, 140000, 150000, 610000, 620000, 640000, 650000, 630000,
  510000, 500000, 520000, 530000, 540000, 410000, 420000, 430000, 440000, 450000, 370000,
  320000, 340000, 330000, 360000, 350000, 210000, 220000];

const rows = [];
for (const n of [1, 2, 3, 5, 8, 12, 16, 20, 24, 28]) {
  const codes = ORDER.slice(0, n);
  const piece = GP.buildPiece(codes);
  const w = piece.maxX - piece.minX, h = piece.maxY - piece.minY;
  // the drawn area is the real area scaled into world units
  let drawn = 0;
  for (const c of codes) {
    // polygon area in km^2 of the drawn ring, times the scale squared
    for (const ring of PROV[c].pts) {
      let a = 0;
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i], q = ring[(i + 1) % ring.length];
        a += p[0] * q[1] - q[0] * p[1];
      }
      drawn += Math.abs(a / 2) * piece.s * piece.s;
    }
  }
  const share = drawn / BOX;
  rows.push({ n, area: sumArea(codes), s: piece.s, w, h, share });
  console.log(`${String(n).padStart(9)} | ${(sumArea(codes) / 1e4).toFixed(0).padStart(7)}万 | ${piece.s.toFixed(4)} | ` +
    `${w.toFixed(0).padStart(4)} x ${h.toFixed(0).padStart(4)} | ${(share * 100).toFixed(1).padStart(15)}% | ` +
    `${(w / GP.BW * 100).toFixed(0).padStart(10)}%`);
}

console.log('\n== is the piece shrinking relative to itself? ==');
for (let i = 1; i < rows.length; i++) {
  const a = rows[i - 1], b = rows[i];
  const growth = b.share / a.share;
  const provincesAdded = b.n - a.n;
  console.log(`  ${a.n} -> ${b.n} provinces (+${provincesAdded}): area +${((b.area / a.area - 1) * 100).toFixed(0)}%, ` +
    `drawn footprint x${growth.toFixed(2)}`);
}
console.log('\nIf "drawn footprint" grows slower than the province count, merging is a losing move for');
console.log('box space and the late game gets easier.');

console.log('\n== how much room is left as the box fills? ==');
console.log('single pieces are laid side by side: sum of drawn areas vs the box');
let singles = 0;
for (const p of GP.PROV) if (p) singles += p.area;
console.log(`all 34 provinces kept apart: real area would be ${(singles / 1e4).toFixed(0)}万 km2`);
