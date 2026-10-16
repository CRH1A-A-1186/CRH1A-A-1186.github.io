// Measure the water gaps between provinces that do NOT share a land border.
// An island can only be merged through a sea crossing, so we need the real distances to decide
// which crossings should count as "adjacent" for the game.
import fs from 'node:fs';

const pack = JSON.parse(fs.readFileSync('data/china-pack.json', 'utf8'));
const byCode = new Map(pack.provinces.map((p) => [p.code, p]));
const adj = new Set(pack.adj.map(([a, b]) => `${a}:${b}`).concat(pack.adj.map(([b, a]) => `${b}:${a}`)));
const name = (c) => byCode.get(c).name;

// grid over all vertices for a quick nearest-neighbour pass
const CELL = 25;   // km
function key(x, y) { return `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`; }

const grid = new Map();
for (const p of pack.provinces) {
  for (const ring of p.rings) for (const [x, y] of ring) {
    const k = key(x, y);
    let arr = grid.get(k);
    if (!arr) grid.set(k, (arr = []));
    arr.push([x, y, p.code]);
  }
}

// minimum distance between two specific provinces
function minDist(a, b) {
  let best = Infinity;
  const pa = byCode.get(a), pb = byCode.get(b);
  if (!pa || !pb) return Infinity;
  for (const ring of pa.rings) for (const [x, y] of ring) {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const arr = grid.get(`${cx + dx},${cy + dy}`);
      if (!arr) continue;
      for (const [qx, qy, qc] of arr) {
        if (qc !== b) continue;                 // only the other province counts
        const d = Math.hypot(x - qx, y - qy);
        if (d < best) best = d;
      }
    }
  }
  return best;
}

// every non-adjacent pair, with the ones under 400 km reported
const rows = [];
const codes = pack.provinces.map((p) => p.code);
for (let i = 0; i < codes.length; i++) {
  for (let j = i + 1; j < codes.length; j++) {
    const a = codes[i], b = codes[j];
    if (adj.has(`${a}:${b}`)) continue;
    const d = minDist(a, b);
    if (d < 400) rows.push({ a, b, d });
  }
}
rows.sort((x, y) => x.d - y.d);
console.log('non-adjacent province pairs closer than 400 km (sea crossings / near misses):');
for (const r of rows) {
  console.log(`  ${name(r.a).padEnd(12)} - ${name(r.b).padEnd(12)} ${r.d.toFixed(0).padStart(5)} km`);
}

console.log('\nislands:');
for (const c of [460000, 710000]) {
  const p = byCode.get(c);
  const near = [];
  for (const q of pack.provinces) {
    if (q.code === c) continue;
    near.push({ n: name(q.code), d: minDist(c, q.code) });
  }
  near.sort((x, y) => x.d - y.d);
  console.log(`  ${name(c)}: ${near.slice(0, 4).map((v) => `${v.n} ${v.d.toFixed(0)}km`).join(', ')}`);
}
