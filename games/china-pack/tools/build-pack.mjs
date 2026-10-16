// Generate the province pack for the port.
//
// Input : data/sources/datav-provinces.json  (DataV.GeoAtlas provincial boundaries, GeoJSON)
// Output: data/china-pack.json               (km frame, rings, adjacency, size model)
//         data/preview.svg                   (assembled map, for eyeballing the geometry)
//
// Output frame: equirectangular, kilometres, exactly like the original Japan pack, so the
// game's physics, size model and layout constants can all be reused unchanged.
//
// Run: node tools/build-pack.mjs      (from the china-pack directory)
import fs from 'node:fs';

const SRC = 'data/sources/datav-provinces.json';
const OUT_JSON = 'data/china-pack.json';
const OUT_SVG = 'data/preview.svg';

// ---- projection frame ----
const LAT0 = 36.89;                     // centre latitude of the mainland: keeps x/y scale uniform
const KM_PER_DEG = (6371 * Math.PI) / 180;
const KY = KM_PER_DEG;
const KX = KM_PER_DEG * Math.cos((LAT0 * Math.PI) / 180);

// ---- geometry helpers (same algorithms as the original pack) ----
function ringAreaKm2(ring) {
  const R = 6371;
  let total = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) {
    const [lon1, lat1] = ring[i], [lon2, lat2] = ring[i + 1];
    total += ((lon2 - lon1) * Math.PI) / 180 * (2 + Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180));
  }
  return Math.abs((total * R * R) / 2);
}
function polyArea(p) {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const q = p[i], r = p[(i + 1) % n];
    a += q[0] * r[1] - r[0] * q[1];
  }
  return a / 2;
}
function polyCentroid(p) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % n];
    const c = x1 * y2 - x2 * y1;
    a += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c;
  }
  return [cx / (3 * a), cy / (3 * a), Math.abs(a / 2)];
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
  pts.forEach((q, i) => {
    const d = (q[0] - pts[0][0]) ** 2 + (q[1] - pts[0][1]) ** 2;
    if (d > fd) { fd = d; far = i; }
  });
  const a = dpOpen(pts.slice(0, far + 1), tol), b = dpOpen(pts.slice(far).concat([pts[0]]), tol);
  return a.slice(0, -1).concat(b.slice(0, -1));
}
function lonLatRing(ring) {
  return ring.map(([lon, lat]) => [lon * KX, -lat * KY]);
}
function bboxOf(rings) {
  let a = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of rings) for (const [x, y] of ring) {
    if (x < a[0]) a[0] = x; if (y < a[1]) a[1] = y;
    if (x > a[2]) a[2] = x; if (y > a[3]) a[3] = y;
  }
  return a;
}

// ---- read source ----
const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const provinces = [];
for (const f of src.features) {
  const p = f.properties;
  if (p.level !== 'province' || !f.geometry) continue;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  provinces.push({ code: p.adcode, name: p.name, polys });
}
if (provinces.length !== 34) throw new Error(`expected 34 provinces, got ${provinces.length}`);
console.log('provinces:', provinces.length);

// ---- pick rings: the main landmass plus nearby islands; drop far-flung islets ----
// Hainan's entry also carries the South China Sea islets down to 7 N, which would blow the
// piece's bounding box up by 1500 km, so islands must sit near the province's main landmass.
const ISLAND_MIN_KM2 = 400;              // keep Zhoushan/Chongming/Hainan-scale islands
const ISLAND_MAX_DEG = 4.0;              // and only within ~450 km of it
for (const p of provinces) {
  const rings = [];
  for (const poly of p.polys) {
    const outer = poly[0];
    if (outer.length < 5) continue;
    rings.push({ ring: outer, km2: ringAreaKm2(outer) });
  }
  rings.sort((a, b) => b.km2 - a.km2);
  const main = rings[0];
  const mc = polyCentroid(lonLatRing(main.ring));
  const keep = [main];
  for (let i = 1; i < rings.length; i++) {
    const r = rings[i];
    if (r.km2 < ISLAND_MIN_KM2) continue;
    const [cx, cy] = polyCentroid(lonLatRing(r.ring));
    const dDeg = Math.hypot(cx - mc[0], cy - mc[1]) / KX;
    if (dDeg > ISLAND_MAX_DEG) continue;
    keep.push(r);
  }
  p.rings = keep;
  p.km2 = keep.reduce((a, r) => a + r.km2, 0);
  p.mainKm2 = main.km2;
  p.rawRings = keep.map((r) => r.ring);
}

// ---- adjacency from the raw geometry ----
// Neighbours share a border line, so their boundary vertices lie within a few hundred metres.
// Vertex proximity beats exact-vertex matching because each province is generalised independently.
const CELL = 0.01;                       // ~1.1 km cells
const R2 = 0.0045 ** 2;                  // ~500 m tolerance, squared (degrees)
const grid = new Map();
const allVerts = [];
for (const p of provinces) {
  for (const ring of p.rawRings) for (const [lon, lat] of ring) {
    const k = `${Math.round(lon / CELL)},${Math.round(lat / CELL)}`;
    let arr = grid.get(k);
    if (!arr) grid.set(k, (arr = []));
    arr.push([lon, lat, p.code]);
    allVerts.push([lon, lat, p.code]);
  }
}
const pairCount = new Map();
for (const [lon, lat, code] of allVerts) {
  const cx = Math.round(lon / CELL), cy = Math.round(lat / CELL);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const arr = grid.get(`${cx + dx},${cy + dy}`);
    if (!arr) continue;
    for (const [lo2, la2, code2] of arr) {
      if (code2 <= code) continue;
      if ((lon - lo2) ** 2 + (lat - la2) ** 2 <= R2) {
        const k = code + ':' + code2;
        pairCount.set(k, (pairCount.get(k) || 0) + 1);
      }
    }
  }
}
const adj = [];
for (const [k, n] of pairCount) if (n >= 4) adj.push([+k.split(':')[0], +k.split(':')[1]]);
adj.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
console.log('--- adjacency (shared border within ~500 m) ---');
for (const p of provinces) {
  const nb = adj.filter((q) => q[0] === p.code || q[1] === p.code).map((q) => (q[0] === p.code ? q[1] : q[0]));
  console.log(`  ${p.name.padEnd(12)} ${String(nb.length).padStart(2)} : ${nb.join(' ')}`);
}

// ---- sea crossings ----
// Adjacency above only finds provinces that share a *border line*. Islands share none, so 海南
// and 台湾 come out with zero neighbours: dropping one on the province it faces does nothing.
// For the player, "facing each other across a strait" is the same relationship as "next to each
// other", so the crossings the map obviously shows are added here as first-class adjacency.
//
// 海南 - 广东    琼州海峡，最窄约 20 km（雷州半岛到海南岛北岸）
// 海南 - 广西    北部湾，约 50 km
// 台湾 - 福建    台湾海峡最窄处（平潭到新竹），约 130 km
// 台湾 - 广东    台湾海峡南口，约 390 km —— 让台湾有两条路，不至于只能靠福建
// 山东 - 辽宁    渤海海峡（蓬莱到旅顺），约 105 km —— 比台湾海峡还近，没理由不收
//
// 判据是"两省最近处 < 一个台湾海峡"，不是"同一个海"。世界其他海峡（直布罗陀、多佛）不在
// 这个数据集里，不需要特殊处理。
const SEA_CROSSINGS = [
  [440000, 460000],    // 广东 - 海南
  [450000, 460000],    // 广西 - 海南
  [350000, 710000],    // 福建 - 台湾
  [440000, 710000],    // 广东 - 台湾
  [370000, 210000],    // 山东 - 辽宁（渤海海峡）
];

// The measured gap is printed for every added crossing, so the numbers above cannot silently
// drift if the source data is ever swapped out.
function gapKm(pa, pb) {
  const search = 4;                                  // degrees of window: covers ~440 km
  const grid2 = new Map();
  const cell = 0.05;
  for (const ring of pb.rawRings) for (const [lon, lat] of ring) {
    const k = `${Math.floor(lon / cell)},${Math.floor(lat / cell)}`;
    let arr = grid2.get(k);
    if (!arr) grid2.set(k, (arr = []));
    arr.push([lon, lat]);
  }
  let best = Infinity;
  for (const ring of pa.rawRings) for (const [lon, lat] of ring) {
    const cx = Math.floor(lon / cell), cy = Math.floor(lat / cell);
    const span = Math.ceil(search / cell);
    for (let dx = -span; dx <= span; dx++) for (let dy = -span; dy <= span; dy++) {
      const arr = grid2.get(`${cx + dx},${cy + dy}`);
      if (!arr) continue;
      for (const [qlon, qlat] of arr) {
        const dlat = (lat - qlat) * 111.19;
        const dlon = (lon - qlon) * 111.19 * Math.cos(((lat + qlat) / 2) * Math.PI / 180);
        const d = Math.hypot(dlat, dlon);
        if (d < best) best = d;
      }
    }
  }
  return best;
}
const hasAdj = (a, b) => adj.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
console.log('--- sea crossings added ---');
for (const [a, b] of SEA_CROSSINGS) {
  const pa = provinces.find((p) => p.code === a), pb = provinces.find((p) => p.code === b);
  const gap = gapKm(pa, pb);
  if (hasAdj(a, b)) {
    console.log(`  ${pa.name} - ${pb.name}: 已有陆路相邻，跳过（实测最近 ${gap.toFixed(0)} km）`);
    continue;
  }
  adj.push([a, b]);
  console.log(`  ${pa.name} - ${pb.name}: 最近 ${gap.toFixed(0)} km（隔海相望）`);
}
adj.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
console.log(`adjacency pairs now: ${adj.length}`);

// ---- centre the frame on the mainland (Hainan and Taiwan are the detached islands) ----
const DETACHED = new Set([460000, 710000]);
let CX, CY;
{
  const rings = [];
  for (const p of provinces) {
    if (DETACHED.has(p.code)) continue;
    for (const r of p.rawRings) rings.push(lonLatRing(r));
  }
  const b = bboxOf(rings);
  CX = (b[0] + b[2]) / 2; CY = (b[1] + b[3]) / 2;
  console.log(`mainland extent ${(b[2] - b[0]).toFixed(0)} x ${(b[3] - b[1]).toFixed(0)} km, centre (${CX.toFixed(0)}, ${CY.toFixed(0)})`);
}

// ---- project + simplify ----
const SIMPLIFY_TOL = 1.2;                 // km: invisible at piece scale, keeps the file small
for (const p of provinces) {
  const rings = p.rawRings.map((ring) => {
    let pts = ring.map(([lon, lat]) => [lon * KX - CX, -lat * KY - CY]);
    const a = pts[0], b = pts[pts.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) pts = pts.slice(0, -1);
    return pts;
  });
  p.pts = rings.map((pts) => {
    let out = dpClosed(pts, SIMPLIFY_TOL);
    if (out.length < 3) out = pts;
    const clean = [];
    for (const q of out) {
      const last = clean[clean.length - 1];
      if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > 0.3) clean.push(q);
    }
    if (clean.length >= 2 && Math.hypot(clean[0][0] - clean.at(-1)[0], clean[0][1] - clean.at(-1)[1]) <= 0.3) clean.pop();
    return clean;
  }).filter((r) => r.length >= 3);
  p.verts = p.pts.reduce((a, r) => a + r.length, 0);
  const big = p.pts.reduce((m, r) => (Math.abs(polyArea(r)) > Math.abs(polyArea(m)) ? r : m));
  const [cx, cy, aproj] = polyCentroid(big);
  p.cx = cx; p.cy = cy; p.aproj = Math.abs(aproj);
}
console.log('total vertices:', provinces.reduce((a, p) => a + p.verts, 0));

// ---- detached islands: leave them where they really are ----
// 海南 sits 16 km off 广东 and 台湾 124 km off 福建. Every piece's screen coordinates come from
// this shared km frame, so an island only merges with the province it faces if the two really
// are that close in the frame: drop both at the same x and they land touching. Shifting an
// island aside (which is what the original Japan pack does with 冲绳) would look tidier but
// would move its geometry a thousand km away from its neighbour, and dropping one on the other
// would then do nothing at all.
//
// Set SHIFT_ISLANDS = true to reproduce that tidy-but-unmergeable layout for comparison.
const SHIFT_ISLANDS = process.argv.includes('--shift-islands');
const offsets = {};
if (SHIFT_ISLANDS) {
  const shape = (code) => {
    const p = provinces.find((q) => q.code === code);
    const sb = bboxOf(p.pts);
    return { p, w: sb[2] - sb[0], h: sb[3] - sb[1], b: sb };
  };
  const hai = shape(460000), tai = shape(710000);
  const colX = 1820;                       // common column centre, east of the Fujian coast
  const gap = 60;                          // km between the two islands
  let y = -170;
  for (const s of [hai, tai]) {
    const sb = bboxOf(s.p.pts);
    offsets[s.p.code] = [colX - (sb[0] + sb[2]) / 2, y - sb[1]];
    y += s.h + gap;
  }
  for (const p of provinces) {
    const o = offsets[p.code];
    if (!o) continue;
    p.pts = p.pts.map((r) => r.map(([x, y2]) => [x + o[0], y2 + o[1]]));
    p.cx += o[0]; p.cy += o[1];
  }
  console.log('NOTE: islands relocated into a compact column (--shift-islands)');
}
const mainExt = bboxOf(provinces.filter((p) => !DETACHED.has(p.code)).flatMap((p) => p.pts));
const full = bboxOf(provinces.flatMap((p) => p.pts));
console.log(`mainland extent:  ${(mainExt[2] - mainExt[0]).toFixed(0)} x ${(mainExt[3] - mainExt[1]).toFixed(0)} km`);
console.log(`assembled extent: ${(full[2] - full[0]).toFixed(0)} x ${(full[3] - full[1]).toFixed(0)} km  [${full.map((v) => v.toFixed(0)).join(', ')}]`);

// how far apart are the pairs that must be able to merge when dropped together? Checked below,
// once the piece size model (SIZE_K) is known.

// ---- piece size model: read by the game, kept here as a sanity check ----
const BW_DESIGN = 300;
const SIZE_EXP = 0.35;
const REF_SIDE = 0.08925;
const REF = provinces.find((p) => p.code === 460000);   // Hainan: smallest province with real extent
const SIZE_K = (REF_SIDE * BW_DESIGN) / Math.pow(REF.km2, SIZE_EXP);
console.log(`SIZE_K=${SIZE_K.toFixed(4)} (ref ${REF.name} ${REF.km2.toFixed(0)} km2 -> side ${(REF_SIDE * BW_DESIGN).toFixed(1)} units)`);
let widest = 0, widestName = '', areaSum = 0;
const sizes = [];
for (const p of provinces) {
  const s = (SIZE_K * Math.pow(p.km2, SIZE_EXP)) / Math.sqrt(p.aproj);
  const b = bboxOf(p.pts);
  const w = (b[2] - b[0]) * s, h = (b[3] - b[1]) * s;
  if (w > widest) { widest = w; widestName = p.name; }
  areaSum += w * h;
  sizes.push(`  ${p.name.padEnd(12)} s=${s.toFixed(3)} piece ${w.toFixed(0).padStart(3)} x ${h.toFixed(0).padStart(3)}  box-area share ${((w * h) / (BW_DESIGN * 420) * 100).toFixed(1)}%`);
}
console.log(sizes.join('\n'));
console.log(`widest single piece: ${widestName} ${widest.toFixed(0)} units (box width ${BW_DESIGN})`);

// Islands have to be reachable: the player lines the island up horizontally beside the province
// it faces, so what matters is the horizontal gap between the two outlines, not the distance
// between their centres. Both settle on the floor, so vertical separation does not matter.
console.log('--- island reachability (horizontal edge gap, box is 300 units wide) ---');
for (const [island, host] of [[460000, 440000], [460000, 450000], [710000, 350000], [710000, 440000]]) {
  const a = provinces.find((p) => p.code === island), b = provinces.find((p) => p.code === host);
  const sa = (SIZE_K * Math.pow(a.km2, SIZE_EXP)) / Math.sqrt(a.aproj);
  const sb = (SIZE_K * Math.pow(b.km2, SIZE_EXP)) / Math.sqrt(b.aproj);
  const ba = bboxOf(a.pts), bb = bboxOf(b.pts);
  // gap between the facing edges, in units
  const gapUnits = (bb[0] > ba[2]) ? (bb[0] - ba[2]) * ((sa + sb) / 2)
    : (ba[0] > bb[2]) ? (ba[0] - bb[2]) * ((sa + sb) / 2)
      : 0;                                             // they already overlap horizontally
  const boxFits = gapUnits < BW_DESIGN * 0.75;         // must be alignable inside the box
  console.log(`  ${a.name} - ${b.name}: 水平间隙 ${gapUnits.toFixed(0)} 单位 ` +
    `(×向 ${(bb[0] - ba[2] >= 0 ? '+' : '-')}${Math.abs((bb[0] - ba[2]) / 1000).toFixed(1)}k km) -> ` +
    `${boxFits ? '✅ 可以在箱内对齐' : '❌ 对不齐'}`);
  if (!boxFits) console.error(`  !! ${a.name} can never reach ${b.name}: the gap exceeds the box`);
}
console.log(`sum of piece bounding areas = ${(areaSum / (BW_DESIGN * 420)).toFixed(1)}x the box area`);

// ---- report ----
for (const p of provinces.slice().sort((a, b) => b.km2 - a.km2)) {
  console.log(`  ${String(p.code).padEnd(8)} ${p.name.padEnd(12)} km2=${p.km2.toFixed(0).padStart(8)} main=${p.mainKm2.toFixed(0).padStart(8)} rings=${String(p.pts.length).padStart(2)} verts=${String(p.verts).padStart(5)} centroid=(${p.cx.toFixed(0)},${p.cy.toFixed(0)})`);
}

fs.writeFileSync(OUT_JSON, JSON.stringify({
  frame: { LAT0, KX, KY, CX, CY, offsets },
  mainlandExtent: mainExt.map((v) => +v.toFixed(1)),
  extent: full.map((v) => +v.toFixed(1)),
  sizeK: +SIZE_K.toFixed(6),
  provinces: provinces.map((p) => ({
    code: p.code, name: p.name, km2: +p.km2.toFixed(1), mainKm2: +p.mainKm2.toFixed(1),
    cx: +p.cx.toFixed(1), cy: +p.cy.toFixed(1), aproj: +p.aproj.toFixed(1),
    verts: p.verts,
    rings: p.pts.map((r) => r.map(([x, y]) => [+x.toFixed(1), +y.toFixed(1)])),
  })),
  adj,
}, null, 1));
console.log('wrote', OUT_JSON);

// ---- SVG preview of the assembled map ----
const pad = 20, s = (1100 - pad * 2) / (full[2] - full[0]);
const w = (full[2] - full[0]) * s + pad * 2, h = (full[3] - full[1]) * s + pad * 2;
const path = (p) => p.pts.map((r) => 'M' + r.map(([x, y]) => `${((x - full[0]) * s + pad).toFixed(1)},${((y - full[1]) * s + pad).toFixed(1)}`).join('L') + 'Z').join(' ');
const hues = ['#c6ddf1', '#d0e8ba', '#f6cbc4', '#f2e1a2', '#dacdf0', '#f8d2a9', '#b9e2d5', '#edbacb', '#cfe3c0'];
const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(0)}" height="${h.toFixed(0)}" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}">`,
  `<rect width="100%" height="100%" fill="#f4f1ea"/>`];
provinces.forEach((p, i) => {
  svg.push(`<path d="${path(p)}" fill="${hues[i % hues.length]}" stroke="#485560" stroke-width="1"/>`);
  svg.push(`<text x="${((p.cx - full[0]) * s + pad).toFixed(1)}" y="${((p.cy - full[1]) * s + pad).toFixed(1)}" font-size="13" font-family="sans-serif" text-anchor="middle" fill="#3b4752">${p.name.replace(/(省|市|自治区|特别行政区|壮族|维吾尔|回族)$/, '').replace(/(内蒙古|广西|西藏|宁夏|新疆).*/, '$1')}</text>`);
});
svg.push('</svg>');
fs.writeFileSync(OUT_SVG, svg.join('\n'));
console.log('wrote', OUT_SVG);
