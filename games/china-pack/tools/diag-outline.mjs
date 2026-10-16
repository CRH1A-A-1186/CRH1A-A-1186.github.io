// Diagnose the physics outlines: a simplified convex outline that deviates from the drawn
// shape leaves a visible gap and, worse, stops neighbouring provinces from touching.
import { loadGame } from './harness.mjs';

const { GP } = loadGame();

function polyArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; }
  return a / 2;
}
function dpOpen(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const [x1, y1] = pts[0], [x2, y2] = pts[pts.length - 1];
  const dx = x2 - x1, dy = y2 - y1, n = Math.hypot(dx, dy) || 1e-9;
  let best = -1, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / n;
    if (d > best) { best = d; idx = i; }
  }
  if (best <= tol) return [pts[0], pts[pts.length - 1]];
  return dpOpen(pts.slice(0, idx + 1), tol).slice(0, -1).concat(dpOpen(pts.slice(idx), tol));
}
function dpClosed(pts, tol) {
  let far = 0, fd = -1;
  pts.forEach((q, i) => { const d = (q[0] - pts[0][0]) ** 2 + (q[1] - pts[0][1]) ** 2; if (d > fd) { fd = d; far = i; } });
  const a = dpOpen(pts.slice(0, far + 1), tol), b = dpOpen(pts.slice(far).concat([pts[0]]), tol);
  return a.slice(0, -1).concat(b.slice(0, -1));
}
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function distToRing(px, py, ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    best = Math.min(best, distToSeg(px, py, a[0], a[1], b[0], b[1]));
  }
  return best;
}

console.log('How far the physics outline departs from the drawn outline, at each province\'s own scale.');
console.log('  (deviation is in world units at the size the province actually appears)\n');
console.log('province          s(units/km)  ring pts  outline pts  max dev  rms dev  level');
const rows = [];
for (const code of Object.keys(GP.PROV).map(Number)) {
  const p = GP.PROV[code];
  if (!p) continue;
  const s = (GP.SIZE_K * Math.pow(p.area, 0.35)) / Math.sqrt(p.aproj);
  const PHYS_F0 = 0.02, PHYS_STEP = 1.5, PHYS_LEVELS = 8, PHYS_TOL_UNITS = 2.0;
  const base = Math.sqrt(p.aproj) * PHYS_F0 * s;
  let level = 0;
  while (level + 1 < PHYS_LEVELS && base * Math.pow(PHYS_STEP, level + 1) <= PHYS_TOL_UNITS) level++;
  const tol0 = Math.sqrt(p.aproj) * PHYS_F0 * Math.pow(PHYS_STEP, level);
  const main = p.pts.reduce((m, r) => (Math.abs(polyArea(r)) > Math.abs(polyArea(m)) ? r : m));
  let chosen = null, kUsed = null;
  for (const k of [1, 0.85, 0.7, 0.55, 0.4, 0.25, 0]) {
    const poly = k ? dpClosed(main, tol0 * k) : main.map((q) => q.slice());
    if (poly.length < 4) continue;
    chosen = poly; kUsed = k; break;
  }
  if (!chosen) chosen = main;
  const devs = main.map(([x, y]) => distToRing(x, y, chosen));
  const maxDev = Math.max(...devs) * s;
  const rms = Math.sqrt(devs.reduce((a, d) => a + d * d, 0) / devs.length) * s;
  rows.push({ name: p.name, s, verts: main.length, pts: chosen.length, maxDev, rms, level, kUsed });
}
rows.sort((a, b) => b.maxDev - a.maxDev);
for (const r of rows) {
  console.log(`${r.name.padEnd(16)} ${r.s.toFixed(3).padStart(9)} ${String(r.verts).padStart(9)} ${String(r.pts).padStart(12)} ` +
    `${r.maxDev.toFixed(2).padStart(8)} ${r.rms.toFixed(2).padStart(8)} ${String(r.level).padStart(6)}`);
}
const worst = rows[0];
const med = rows[Math.floor(rows.length / 2)].maxDev;
const boxes = GP.BW;
console.log(`\nworst deviation : ${worst.name} ${worst.maxDev.toFixed(2)} units = ${(worst.maxDev / boxes * 100).toFixed(1)}% of box width`);
console.log(`median deviation: ${med.toFixed(2)} units`);
console.log(`(a deviation of 2 units is the game's intended ceiling, PHYS_TOL_UNITS)`);
