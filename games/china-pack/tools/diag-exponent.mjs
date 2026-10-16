// Raising the size exponent does two different things:
//   - single provinces keep roughly the same size (they are all near the reference area)
//   - merged pieces grow, because the exponent applies to the SUM of their members
// So the exponent is the knob that controls endgame size without making early play harder.
// This prints both halves of that so a choice can be made on numbers.
import { loadGame } from './harness.mjs';

const { GP } = loadGame();
const { PROV } = GP;
const BOX = GP.BW * GP.BH;
const REF = PROV[460000];
const BASE_SIDE = 0.08925 * GP.BW;

function sideKm(area, aproj, exp) {
  const k = BASE_SIDE / Math.pow(REF.area, exp);
  return k * Math.pow(area, exp) / Math.sqrt(aproj);
}
function boxAreaKm(exp) {
  // how much real area fits in the box at this exponent, using a compact blob's density
  const k = BASE_SIDE / Math.pow(REF.area, exp);
  const s = k * Math.pow(1e6, exp) / 1000;      // rough units-per-km at 1M km2
  return (GP.BW / s) * (GP.BH / s);
}

const ORDER = [110000, 120000, 130000, 140000, 150000, 610000, 620000, 640000, 650000, 630000,
  510000, 500000, 520000, 530000, 540000, 410000, 420000, 430000, 440000, 450000, 370000,
  320000, 340000, 330000, 360000, 350000, 210000, 220000];

function ringArea(r) {
  let a = 0;
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a / 2);
}

console.log('== single provinces: does the exponent change them much? ==');
console.log('province      area(万km2)   exp0.28   exp0.32   exp0.36   (drawn side, units)');
for (const code of [820000, 810000, 310000, 460000, 110000, 440000, 510000, 150000, 650000]) {
  const p = PROV[code];
  if (!p) continue;
  const w = (Math.max(...p.pts.flat().map((q) => q[0])) - Math.min(...p.pts.flat().map((q) => q[0])));
  const row = [0.28, 0.32, 0.36].map((e) => (w * sideKm(p.area, p.aproj, e)).toFixed(0).padStart(9));
  console.log(`${p.name.padEnd(12)} ${(p.area / 1e4).toFixed(1).padStart(10)} ${row.join('')}`);
}

console.log('\n== merged pieces: this is where the exponent bites ==');
console.log('provinces   real area(万km2)   exp0.28   exp0.32   exp0.36   (drawn width, units; box 300)');
for (const n of [3, 6, 10, 15, 20, 24, 28, 34]) {
  const codes = ORDER.slice(0, n);
  let total = 0, aproj = 0;
  for (const c of codes) { total += PROV[c].area; aproj += PROV[c].aproj; }
  const all = codes.flatMap((c) => PROV[c].pts.flat());
  const w0 = Math.max(...all.map((q) => q[0])) - Math.min(...all.map((q) => q[0]));
  const row = [0.28, 0.32, 0.36].map((e) => {
    const s = sideKm(total, aproj, e);
    return (Math.min(w0 * s, 0.9 * GP.BW)).toFixed(0).padStart(9);
  });
  console.log(`${String(n).padStart(9)} ${(total / 1e4).toFixed(0).padStart(14)} ${row.join('')}`);
}

console.log('\n== drawn area share of the box for the full 34-province map ==');
for (const e of [0.28, 0.32, 0.34, 0.36, 0.40]) {
  const codes = PROV.map((p) => p && p.code).filter(Boolean);
  let total = 0, aproj = 0;
  for (const c of codes) { total += PROV[c].area; aproj += PROV[c].aproj; }
  const all = codes.flatMap((c) => PROV[c].pts.flat());
  const w0 = Math.max(...all.map((q) => q[0])) - Math.min(...all.map((q) => q[0]));
  const h0 = Math.max(...all.map((q) => q[1])) - Math.min(...all.map((q) => q[1]));
  let s = sideKm(total, aproj, e);
  s = Math.min(s, 0.9 * GP.BW / w0, 0.62 * GP.BH / h0);      // the finale clamp
  const drawn = (w0 * s) * (h0 * s) / BOX;
  console.log(`  exp=${e.toFixed(2)}: 整幅地图 ${(w0 * s).toFixed(0)} x ${(h0 * s).toFixed(0)} 单位，` +
    `占箱 ${(drawn * 100).toFixed(0)}%（箱 ${GP.BW}x${GP.BH}）`);
}
