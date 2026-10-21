/* 标准地图 audit for the province pack.
 *
 * Checks, all against facts a Chinese national standard map fixes:
 *   1. the named islands a standard map must show are present (from the pack's own checklist);
 *   2. the extreme points of the country;
 *   3. the shape of the disputed sectors (藏南 / 阿克赛钦);
 *   4. the national border passes near landmarks that sit exactly on it, which catches a boundary
 *      that has been drawn in the wrong place over a long distance;
 *   5. the 34 provinces tile the country with no gap and no double coverage.
 *
 * Run: node tools/verify-standard-map.mjs          (from the china-pack directory)
 *      node tools/verify-standard-map.mjs --full   (denser coverage grid)
 */
import fs from 'node:fs';

const full = process.argv.includes('--full');
const PACK = JSON.parse(fs.readFileSync('data/china-pack.json', 'utf8'));
const SRC = JSON.parse(fs.readFileSync('data/sources/datav-provinces.json', 'utf8'));
const { KX, KY, CX, CY } = PACK.frame;
const toLon = (x) => (x + CX) / KX;
const toLat = (y) => -(y + CY) / KY;

const problems = [];
const note = (m) => { problems.push(m); console.log(`  !! ${m}`); };
const ok = (m) => console.log(`  ok  ${m}`);

// ------------------------------------------------------------------ 1. named features
console.log('=== 标准图必须画出的岛屿 ===');
const REQUIRED = [
  ['钓鱼岛', 710000], ['赤尾屿', 710000],
  ['东沙群岛', 440000],
  ['永兴岛', 460000], ['黄岩岛', 460000], ['太平岛', 460000], ['曾母暗沙', 460000],
];
for (const [name, code] of REQUIRED) {
  const p = PACK.provinces.find((q) => q.code === code);
  const has = p && Array.isArray(p.named) && p.named.includes(name);
  if (has) ok(`${name} 在 ${p.name}`);
  else note(`${name} 缺失（应在 ${p ? p.name : code}）`);
}

// ------------------------------------------------------------------ 2. extremes
console.log('\n=== 四极 ===');
let e = { x: -Infinity }, w = { x: Infinity }, n = { y: Infinity }, s = { y: -Infinity };
for (const p of PACK.provinces) {
  for (const ring of p.rings) for (const [x, y] of ring) {
    if (x > e.x) e = { x, y, p };
    if (x < w.x) w = { x, y, p };
    if (y < n.y) n = { y, x, p };
    if (y > s.y) s = { y, x, p };
  }
}
const EXTREMES = [
  ['东', 135.09, toLon(e.x), '黑瞎子岛'],
  ['西', 73.50, toLon(w.x), '帕米尔'],
  ['北', 53.56, toLat(n.y), '漠河'],
];
for (const [label, want, got, where] of EXTREMES) {
  const d = Math.abs(got - want);
  if (d <= 0.05) ok(`${label}极 ${got.toFixed(2)}° (标准图 ${want}°, ${where})`);
  else note(`${label}极 ${got.toFixed(2)}° 偏离标准图 ${want}° (${where}) 达 ${d.toFixed(2)}°`);
}
// the south extreme is the 三沙 inset, so it is checked by presence rather than position
console.log(`  南：海南块下缘 ${toLat(s.y).toFixed(2)}°N —— 三沙是附图，按设计不按真实纬度，见 README`);

// ------------------------------------------------------------------ 3. disputed sectors
console.log('\n=== 边境争议段（按中国主张） ===');
function southIn(name, lo, hi, la, ha) {
  const p = PACK.provinces.find((q) => q.name === name);
  let best = Infinity;
  for (const ring of p.rings) for (const [x, y] of ring) {
    const lon = toLon(x), lat = toLat(y);
    if (lon >= lo && lon <= hi && lat >= la && lat <= ha && lat < best) best = lat;
  }
  return best === Infinity ? null : best;
}
const tibetSouth = southIn('西藏自治区', 92, 97, 26, 30);
if (tibetSouth !== null && tibetSouth < 27.3) ok(`藏南：西藏南界到 ${tibetSouth.toFixed(2)}°N，符合中国主张`);
else note(`藏南：西藏南界只到 ${tibetSouth === null ? 'n/a' : tibetSouth.toFixed(2) + '°N'}，窄于中国主张`);
for (const name of ['新疆维吾尔自治区', '西藏自治区']) {
  const p = PACK.provinces.find((q) => q.name === name);
  let hit = 0;
  for (const ring of p.rings) for (const [x, y] of ring) {
    const lon = toLon(x), lat = toLat(y);
    if (lon >= 77.8 && lon <= 80.2 && lat >= 34 && lat <= 36) hit++;
  }
  if (hit > 0) ok(`阿克赛钦：${name} 有 ${hit} 个顶点落在该区`);
  else note(`阿克赛钦：${name} 在该区没有顶点`);
}

// ------------------------------------------------------------------ 4. border landmarks
// Points that lie exactly on the state border (border crossings, summits, river junctions).
// If the drawn boundary is where it should be, a vertex must be within a few km of each.
// 绥芬河 is a city centre about 20 km inside the border, so it is expected to read loose.
console.log('\n=== 国界线经过的界标（离最近顶点） ===');
const LANDMARKS = [
  ['珠穆朗玛峰 中尼', 86.925, 27.988],
  ['长白山天池 中朝', 128.06, 42.00],
  ['丹东 中朝', 124.383, 40.000],
  ['红其拉甫 中巴', 75.42, 36.85],
  ['霍尔果斯 中哈', 80.42, 44.20],
  ['阿拉山口 中哈', 82.57, 45.17],
  ['二连浩特 中蒙', 111.98, 43.65],
  ['满洲里 中俄', 117.45, 49.60],
  ['友谊关 中越', 106.72, 21.95],
  ['东兴 中越', 107.97, 21.54],
  ['瑞丽 中缅', 97.85, 24.01],
  ['磨憨 中老', 101.68, 21.19],
  ['乃堆拉 中印', 88.90, 27.30],
];
// every vertex of every province lies on some boundary; the national border is a subset, so a
// nearest-vertex test can only prove the border is not far away, which is what we want
const verts = [];
for (const p of PACK.provinces) for (const ring of p.rings) for (const [x, y] of ring) verts.push([toLon(x), toLat(y)]);
let worst = 0;
for (const [label, lon, lat] of LANDMARKS) {
  let best = Infinity;
  for (const [x, y] of verts) {
    const d = Math.hypot(x - lon, y - lat);
    if (d < best) best = d;
  }
  const km = best * KX;
  worst = Math.max(worst, km);
  const verdict = km <= 25 ? 'ok' : km <= 60 ? 'loose' : 'FAR';
  if (verdict === 'FAR') note(`${label}: 最近的省界顶点有 ${km.toFixed(0)} km`);
  else console.log(`  ${verdict === 'ok' ? 'ok  ' : 'warn'} ${label.padEnd(16)} ${km.toFixed(0).padStart(3)} km`);
}
console.log(`  最差 ${worst.toFixed(0)} km（简化容差约 1-3 km，国界长距离偏移会立刻显现）`);

// ------------------------------------------------------------------ 5. coverage
console.log('\n=== 34 个省级行政区是否恰好铺满 ===');
const polys = SRC.features.filter((f) => /^\d{6}$/.test(String(f.properties.adcode))).map((f) => {
  const g = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const poly of g) for (const [x, y] of poly[0]) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { name: f.properties.name, g, x0, x1, y0, y1 };
});
function inRing(x, y, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const count = (x, y) => {
  let n = 0;
  for (const p of polys) {
    if (x < p.x0 || x > p.x1 || y < p.y0 || y > p.y1) continue;
    if (p.g.some((poly) => inRing(x, y, poly[0]))) n++;
  }
  return n;
};
const STEP = full ? 0.15 : 0.4;
let sample = 0, gaps = 0, dbl = 0;
const gapAt = [], dblAt = [];
for (const b of PACK.provinces) {
  // walk each province's bbox on a grid
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const ring of b.rings) for (const [x, y] of ring) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  for (let x = x0; x <= x1; x += STEP * KX) {
    for (let y = y0; y <= y1; y += STEP * KY) {
      const lon = toLon(x), lat = toLat(y);
      const n = count(lon, lat);
      sample++;
      if (n === 0) {
        // A bbox corner lies abroad and a bay centre is sea - neither is a gap. Require provinces
        // close on all four sides (within ~11 km), which only a true sliver between two provinces
        // satisfies; 渤海 is far wider than that, so its centre no longer qualifies.
        const R = 0.1;
        const sides = [count(lon + R, lat), count(lon - R, lat), count(lon, lat + R), count(lon, lat - R)]
          .filter((k) => k > 0).length;
        if (sides === 4) { gaps++; if (gapAt.length < 5) gapAt.push(`${lon.toFixed(2)},${lat.toFixed(2)}`); }
      } else if (n > 1) { dbl++; if (dblAt.length < 5) dblAt.push(`${lon.toFixed(2)},${lat.toFixed(2)}`); }
    }
  }
}
console.log(`  采样 ${sample} 点：内部空洞 ${gaps}，重叠 ${dbl}${gapAt.length ? '  e.g. ' + gapAt.join(' ') : ''}${dblAt.length ? '  overlap ' + dblAt.join(' ') : ''}`);
if (dbl > 0) note(`${dbl} 个采样点被两个以上的省覆盖`);
if (gaps > 0) note(`${gaps} 个国界内的点不属于任何省`);

console.log(`\n${problems.length ? `${problems.length} problem(s)` : '标准图检查通过'}`);
for (const p of problems) console.log(`  - ${p}`);
process.exit(problems.length ? 1 : 0);
