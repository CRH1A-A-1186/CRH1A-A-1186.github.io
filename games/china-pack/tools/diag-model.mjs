// Compare the current size formula against alternatives, on the one number the player feels:
// how big does a merged piece get, as a share of the box, as provinces join it?
//
//   A (current)  side ~ area^E / sqrt(projected area)      -> saturates; past ~12 provinces it stops growing
//   B (pure area) side ~ (sum of member areas)^E / sqrt(own drawn area)
//                -> drawn share ~ (sum area)^(2E-1), so it keeps growing with every merge
import { loadGame } from './harness.mjs';

const { GP } = loadGame();
const { PROV } = GP;
const BOX = GP.BW * GP.BH;

const ORDER = [110000, 120000, 130000, 140000, 150000, 610000, 620000, 640000, 650000, 630000,
  510000, 500000, 520000, 530000, 540000, 410000, 420000, 430000, 440000, 450000, 370000,
  320000, 340000, 330000, 360000, 350000, 210000, 220000];

function ringArea(r) {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a / 2);
}

/* Model the piece builder for a given formula. Returns drawn share of the box and the width. */
function measure(codes, exp, mode) {
  let total = 0, aproj = 0, sx = 0, sy = 0;
  for (const c of codes) {
    const p = PROV[c];
    total += p.area; aproj += p.aproj; sx += p.cx * p.aproj; sy += p.cy * p.aproj;
  }
  const cx = sx / aproj, cy = sy / aproj;
  // A: current model, normalised so 海南 is the reference side
  const ref = PROV[460000];
  const k = 0.08925 * GP.BW / Math.pow(ref.area, exp);
  let s;
  if (mode === 'A') {
    s = k * Math.pow(total, exp) / Math.sqrt(aproj);
  } else {
    // B: the piece keeps an area-proportional footprint; its own drawn extent only sets density
    let own = 0;
    for (const [i, c] of codes.entries()) {
      for (const r of PROV[c].pts) own += ringArea(r);
    }
    s = k * Math.pow(total, exp) / Math.sqrt(own);
  }
  // clamp like the game does for merged pieces
  const all = codes.flatMap((c) => PROV[c].pts.flat());
  const w0 = Math.max(...all.map((q) => q[0])) - Math.min(...all.map((q) => q[0]));
  const h0 = Math.max(...all.map((q) => q[1])) - Math.min(...all.map((q) => q[1]));
  const lim = 0.9 * GP.BW;
  s = Math.min(s, lim / w0, lim / h0);
  let drawn = 0;
  for (const c of codes) for (const r of PROV[c].pts) drawn += ringArea(r) * s * s;
  return { s, drawn: drawn / BOX, w: w0 * s, h: h0 * s, real: total };
}

for (const exp of [0.28, 0.32, 0.36]) {
  for (const mode of ['A', 'B']) {
    const row = [];
    for (const n of [1, 3, 6, 10, 15, 20, 24, 28]) {
      const m = measure(ORDER.slice(0, n), exp, mode);
      row.push(`${String(n).padStart(2)}省:${(m.drawn * 100).toFixed(0).padStart(3)}%`);
    }
    console.log(`模型 ${mode}  exp=${exp.toFixed(2)}  ${row.join('  ')}`);
  }
  console.log('');
}

console.log('(数字 = 该合并块的绘制面积占箱体面积的百分比；希望它随合并稳步上升，终盘能到 50% 以上)');
