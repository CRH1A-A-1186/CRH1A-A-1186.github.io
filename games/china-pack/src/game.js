'use strict';
/*PACK-BEGIN*/
// 这里会被 tools/bundle.mjs 换成由 tools/emit-data.mjs 生成的省份数据：
// PROVS（各省轮廓，km）、ADJ（相邻关系）、REGION_DEFS（大区划分）、COLORS（配色）。
const PROVS = [];
/*PACK-END*/

// ===================================================================================================
// 数值调节
// ===================================================================================================
const BW = 300, BH = 372;               // 箱体内尺寸（世界单位）
const MARGIN = 10;                      // 箱体外侧留白
const TOP = 150;                        // 箱口上方的投放区（标题 + 悬停的方块）
const W = BW + MARGIN * 2, H = TOP + BH + 12;
const BOX_L = MARGIN, BOX_R = MARGIN + BW, RIM_Y = TOP, FLOOR_Y = TOP + BH;
const LINE_Y = RIM_Y + 36;              // 溢出警戒线（红色虚线）：只是视觉提示，真正的界限是箱口
const WALL_T = 200;                     // 物理墙/地板厚度（防止穿透）

const SIZE_REF_CODE = 460000;           // 海南：面积最小的"有实体范围"的省，作为尺寸基准
const SIZE_REF_SIDE = 0.08925;
let SIZE_EXP = 0.28;                    // 单省方块：边长 ∝ 面积^指数
// 合并块单独用一个大一点的指数。合并时指数作用在各成员面积之"和"上，所以调大它主要让
// 大块变大（终盘箱子更挤、压力回来），而对单个省的大小几乎没影响。
// 只用 SIZE_EXP 的话这两个效果会绑在一起：指数调大，新疆也跟着涨，澳门香港反而缩小。
let MERGE_EXP = 0.32;
const MIN_PIECE_SIDE = 13;              // 方块在屏幕上的最小边长（澳门只有 46 km²，否则小到看不见）
const PIECE_SCALE = 0.92;               // 整体缩放。1.0 时 30 块加起来约是箱体面积的 1.5 倍，
                                        // 只有不断合并才装得下；0.92 配上 MERGE_EXP=0.32 实测
                                        // 箱子能填到 ~35%、约一半的局因溢出结束（见 README「难度」）
const MERGED_MAX = 0.9;                 // 合并后方块的宽/高不超过箱宽的 90%

const STEP_MS = 1000 / 60;
const SUBSTEPS = 2;                     // 每帧两次物理更新：一次太弱，堆叠的方块会互相嵌入
const GRAVITY = 1.3;
const MAX_SPEED = 16;                   // 单位/步
const MAX_SPIN = 0.3;                   // 弧度/步
const DROP_WAIT = 600;                  // 下一个方块出现前的等待（ms）
const FRESH_MS = 1500;                  // 还在从箱口上方落下的方块最多豁免这么久
const FINALE_MS = 5000;                 // 全国拼合完成：点亮、庆祝、飞出
const FINALE_MOVE = 600, FINALE_LIT = 2000, FINALE_OUT = 3900;
const FINALE_SHOT = 3000;               // 在这一刻绘制"拼合完成"的分享图
const ROUND_MS = 1000;
const TIME_LIMIT_MS = 16000;            // 最后一块投放后：在此之前连成整幅中国地图，否则游戏结束
const SHAKE_MS = 1000;                  // 摇动时长（按钮锁定）
const SHAKE_GRACE = SHAKE_MS + 1500;    // 摇动开始后这段时间内不做溢出判定：光是摇动不会结束游戏
const SHAKE_AMP = 0.03 * BW;            // 左右振幅
const SHAKE_CYCLES = 3;
const KICK_MIN = 3.2, KICK_MAX = 7.2;   // 向上弹起的力度（单位/步），重..轻
const KICK_SIDE = 2.0;
const KICK2_AT = 450, KICK2_POWER = 0.5;
const PLACE_R = 0.15 * BW;              // 合并后方块：先在此半径内找位置，再向上找
const PLACE_STEP = 3;
const PLACE_TOL = 1;                    // 放置时允许的相互嵌入量（世界单位）
const GLIDE_MS = 250;                   // 放置移动的插值时长
const STUCK_DEPTH = 2;                  // 相互卡住超过这个深度 ...
const STUCK_MS = 250;                   // ... 持续这么久，就把它们分开
const BIAS = 0.6;                       // 优先抽取与箱内已有省份相邻的未抽省份的概率
const LABEL_MIN_PX = 9.5;               // 屏幕上最小的标签字号（css px）

const HASHTAG = '中国省份游戏';
const SHARE_URL = 'https://crh1a-a-1186.github.io/games/china-pack/';                   // 留空则分享链接不带网址

const REGIONS = REGION_DEFS.map((r) => ({ ...r, from: r.codes[0], to: r.codes[r.codes.length - 1] }));
const C_PAPER = '#f4f1ea', C_BOX = '#6b8fa8', C_INK = '#3b4752';
const C_OUTLINE = 'rgba(72,84,96,.55)';

// ===================================================================================================
// 几何工具
// ===================================================================================================
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
function pointInPoly(p, x, y) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
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

// ===================================================================================================
// 省级行政区数据（km，与地图同一坐标系）
// ===================================================================================================
const PROV = [];
const ADJM = {};
PROVS.forEach(([code, name, label, area, rings]) => {
  const pts = rings.map((ring) => {
    const p = [];
    for (let i = 0; i < ring.length; i += 2) p.push([ring[i], ring[i + 1]]);
    return p;
  });
  // 名称与正文统一用官方全称，绘制时用简称
  const region = REGIONS.find((r) => r.codes.includes(code));
  // 用面积最大的那一块环来定位（省域可能有离岛）
  const main = pts.reduce((m, p) => (Math.abs(polyArea(p)) > Math.abs(polyArea(m)) ? p : m));
  const [cx, cy, aproj] = polyCentroid(main);
  PROV[code] = { code, name, label, area, pts, cx, cy, aproj: Math.abs(aproj), region: region.key };
  ADJM[code] = new Set();
});
ADJ.forEach(([a, b]) => { ADJM[a].add(b); ADJM[b].add(a); });
REGIONS.forEach((r) => { r.codes = r.codes.slice(); });
// 基准省的“边长”，单省方块和合并块各自用它自己的指数归一化到同一个参照上，
// 这样改 MERGE_EXP 只影响合并块，不会把整个比例尺一起挪动。
let SIZE_K = (SIZE_REF_SIDE * BW) / Math.pow(PROV[SIZE_REF_CODE].area, SIZE_EXP) * PIECE_SCALE;
let MERGE_K = (SIZE_REF_SIDE * BW) / Math.pow(PROV[SIZE_REF_CODE].area, MERGE_EXP) * PIECE_SCALE;

// 物理碰撞用的凸多边形。碰撞轮廓比绘制轮廓粗糙，并且取决于该省在屏幕上有多大：
// 合并成大方块后每个省都很小，所以几块凸多边形就够了。
const PHYS_F0 = 0.02, PHYS_STEP = 1.5, PHYS_LEVELS = 8;
const PHYS_TOL_UNITS = 2.0;             // 碰撞轮廓允许的最大误差（世界单位）
function physLevel(p, s) {
  const base = Math.sqrt(p.aproj) * PHYS_F0 * s;
  let L = 0;
  while (L + 1 < PHYS_LEVELS && base * Math.pow(PHYS_STEP, L + 1) <= PHYS_TOL_UNITS) L++;
  return L;
}
function hullPart(ring) {
  const hull = Matter.Vertices.hull(ring.map(([x, y]) => ({ x, y }))).map((v) => [v.x, v.y]);
  decomp.makeCCW(hull);
  hull.area = Math.abs(polyArea(hull));
  return [hull];
}
function physParts(p, level = 0) {
  p.phys = p.phys || [];
  if (p.phys[level]) return p.phys[level];
  const tol0 = Math.sqrt(p.aproj) * PHYS_F0 * Math.pow(PHYS_STEP, level);
  const main = p.pts.reduce((m, r) => (Math.abs(polyArea(r)) > Math.abs(polyArea(m)) ? r : m));
  let result = null;
  if (level < PHYS_LEVELS - 1) {
    for (const k of [1, 0.85, 0.7, 0.55, 0.4, 0.25, 0]) {
      let poly = k ? dpClosed(main, tol0 * k) : main.map((q) => q.slice());
      if (poly.length < 4 || !decomp.isSimple(poly)) continue;
      poly = poly.map((q) => [q[0], q[1]]);
      decomp.makeCCW(poly);
      decomp.removeCollinearPoints(poly, 0.01);
      const want = Math.abs(polyArea(poly));
      const parts = decomp.quickDecomp(poly);
      const got = parts.reduce((acc, q) => acc + Math.abs(polyArea(q)), 0);
      if (parts.length && Math.abs(got - want) < 0.01 * want) {
        parts.forEach((q) => { q.area = Math.abs(polyArea(q)); });
        result = parts;
        break;
      }
    }
  }
  p.phys[level] = result || hullPart(main);
  return p.phys[level];
}
// 每个省的包围盒（构建方块、摆放、尺寸下限都要用），只算一次
PROV.forEach((p) => {
  if (!p) return;
  let a = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of p.pts) for (const [x, y] of ring) {
    if (x < a[0]) a[0] = x; if (y < a[1]) a[1] = y;
    if (x > a[2]) a[2] = x; if (y > a[3]) a[3] = y;
  }
  p.bb = a;
  p.w = a[2] - a[0];
  p.h = a[3] - a[1];
});
// 标签锚点：重心；重心落在省域外时，改用最大一块凸多边形的中心
PROV.forEach((p) => {
  if (!p) return;
  const inside = p.pts.some((ring) => pointInPoly(ring, p.cx, p.cy));
  if (inside) { p.lx = p.cx; p.ly = p.cy; return; }
  const big = p.pts.reduce((m, r) => (Math.abs(polyArea(r)) > Math.abs(polyArea(m)) ? r : m));
  [p.lx, p.ly] = polyCentroid(big);
});

// ===================================================================================================
// 方块（一个或多个省份，保持真实相对位置）
// ===================================================================================================
function clusterName(codes) {
  if (codes.length === PROVS.length) return '中国地图';
  if (codes.length === 1) return PROV[codes[0]].name;
  const set = new Set(codes);
  const regs = REGIONS.filter((r) => !r.single && r.codes.every((c) => set.has(c)));
  if (regs.length) {
    const rest = codes.length - regs.reduce((s, r) => s + r.codes.length, 0);
    return regs.map((r) => r.name).join('+') + (rest ? ` 等${rest}省` : '');
  }
  const sorted = codes.slice().sort((a, b) => a - b);
  if (codes.length === 2) return `${PROV[sorted[0]].name}+${PROV[sorted[1]].name}`;
  return `${PROV[sorted[0]].name} 等${codes.length}省`;
}

// 仅离线检查用：复用已经构造过的方块（合并块的凸分解很贵）
const pieceCache = new Map();

// 离线检查会重复构造同一个方块（同一组合、同一比例尺），而合并块越大，凸分解越贵
// （21 个省约 7.5 ms）。所以按“省份组合 + 角度 + 尺寸版本”缓存一下。
// 方块对象在游戏里是只读使用的，缓存安全；测试里改尺寸旋钮时 bumpSizeGen() 会清空缓存。
function buildPiece(codes, angle = 0) {
  const key = codeListKey(codes) + '|' + angle;
  const hit = pieceCache.get(key);
  if (hit) return hit;
  const built = buildPieceUncached(codes, angle);
  if (pieceCache.size > 400) pieceCache.clear();
  pieceCache.set(key, built);
  return built;
}
function bumpSizeGen() { pieceCache.clear(); }
function codeListKey(codes) {
  return codes.slice().sort((a, b) => a - b).join(',');
}
function buildPieceUncached(codes, angle) {
  codes = codes.slice().sort((a, b) => a - b);
  let at = 0, ap = 0, sx = 0, sy = 0;
  for (const c of codes) {
    const p = PROV[c];
    at += p.area; ap += p.aproj; sx += p.cx * p.aproj; sy += p.cy * p.aproj;
  }
  const cx = sx / ap, cy = sy / ap;
  // 单省方块和合并块用不同的指数：合并时指数作用在成员面积之和上，调大它主要放大块
  let s = (codes.length === 1 ? SIZE_K : MERGE_K) * Math.pow(at, codes.length === 1 ? SIZE_EXP : MERGE_EXP) / Math.sqrt(ap);
  // 太小的省（澳门、香港）放大到屏幕上看得见；太大的省（内蒙古、新疆）收进箱体宽度内
  if (codes.length === 1 && PROV[codes[0]].w * s < MIN_PIECE_SIDE) s = MIN_PIECE_SIDE / PROV[codes[0]].w;
  if (codes.length > 1) {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, r0 = Infinity, r1 = -Infinity;
    for (const c of codes) for (const ring of PROV[c].pts) for (const [x, y] of ring) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      const rx = (x - cx) * ca - (y - cy) * sa;
      r0 = Math.min(r0, rx); r1 = Math.max(r1, rx);
    }
    const lim = MERGED_MAX * BW;
    s = Math.min(s, lim / (x1 - x0), lim / (y1 - y0), lim / (r1 - r0));
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const parts = codes.map((c) => {
    const p = PROV[c];
    const path = new Path2D();
    for (const ring of p.pts) {
      ring.forEach(([x, y], i) => {
        const X = (x - cx) * s, Y = (y - cy) * s;
        if (i) path.lineTo(X, Y); else path.moveTo(X, Y);
        minX = Math.min(minX, X); maxX = Math.max(maxX, X);
        minY = Math.min(minY, Y); maxY = Math.max(maxY, Y);
      });
      path.closePath();
    }
    return { code: c, path, lx: (p.lx - cx) * s, ly: (p.ly - cy) * s, color: COLORS[p.region] };
  });
  const labelOrder = parts.slice().sort((p, q) => PROV[q.code].area - PROV[p.code].area);
  return { codes, s, cx, cy, area: at, parts, labelOrder, minX, maxX, minY, maxY, name: clusterName(codes) };
}

const { Engine, Body, Bodies, Composite, Events, Vertices } = Matter;

function createBody(piece, x, y) {
  const parts = [];
  for (const c of piece.codes) {
    const p = PROV[c];
    for (const poly of physParts(p, physLevel(p, piece.s))) {
      if (poly.area * piece.s * piece.s < 1.5) continue;   // 丢掉过细的碎片
      const verts = poly.map(([kx, ky]) => ({ x: x + (kx - piece.cx) * piece.s, y: y + (ky - piece.cy) * piece.s }));
      const part = Body.create({ position: Vertices.centre(verts), vertices: verts });
      part.code = c;   // 这块凸多边形属于哪个省（只让相邻的省互相连接）
      parts.push(part);
    }
  }
  const body = Body.create({ parts, friction: 0.5, frictionStatic: 0.8, restitution: 0.05, frictionAir: 0.012 });
  // Matter 0.19 把各部分的转动惯量直接相加，漏掉了平行轴项，复合体会转得过于容易、
  // 堆叠时一直晃。这里重新算一遍，保留 Matter 的 4 倍惯性缩放。
  let inertia = 0;
  for (const p of body.parts.slice(1)) {
    inertia += p.inertia / 4 + p.mass * ((p.position.x - body.position.x) ** 2 + (p.position.y - body.position.y) ** 2);
  }
  Body.setInertia(body, inertia * 4);
  body.piece = piece;
  body.off = { x: body.position.x - x, y: body.position.y - y };  // 方块原点 -> 质心
  return body;
}
function pieceOrigin(b) {
  const ca = Math.cos(b.angle), sa = Math.sin(b.angle);
  return [b.position.x - (b.off.x * ca - b.off.y * sa), b.position.y - (b.off.x * sa + b.off.y * ca)];
}

// ===================================================================================================
// 世界
// ===================================================================================================
const TOTAL = PROVS.length;             // 34 个省级行政区
let engine, walls, pieces, pending;
let state = 'title';
let simTime = 0;
let deck, current, next, nextAt, hoverX, hoverY, aiming;
let pointerTop = false;                 // 指针在箱口上方的留白里：松手不投放
let dropped, dealt, lastDropAt, score, completed, timeUpAt;
let round, chinaCount, bestEver, finale, chinaShot;
let shakeStart, shakeX, kicked2, shaking;
let popups, banners, endInfo, lastFinish;
let freePlace = false;                  // 仅离线检查用：关掉溢出判定，方便把方块摆成指定局面
const WALL_H = 3000;
const WALL_X0 = [BOX_L - WALL_T / 2, BOX_R + WALL_T / 2];

function resetWorld() {
  engine = Engine.create({ positionIterations: 12, velocityIterations: 8 });
  engine.gravity.y = GRAVITY;
  const opt = { isStatic: true, friction: 0.5, frictionStatic: 0.8, restitution: 0 };
  walls = {
    left: Bodies.rectangle(WALL_X0[0], FLOOR_Y + WALL_T - WALL_H / 2, WALL_T, WALL_H, opt),
    right: Bodies.rectangle(WALL_X0[1], FLOOR_Y + WALL_T - WALL_H / 2, WALL_T, WALL_H, opt),
    floor: Bodies.rectangle(W / 2, FLOOR_Y + WALL_T / 2, BW + WALL_T * 4, WALL_T, opt),
    ceil: Bodies.rectangle(W / 2, FLOOR_Y + WALL_T - WALL_H - WALL_T / 2, BW + WALL_T * 4, WALL_T, opt),
  };
  Composite.add(engine.world, Object.values(walls));
  Events.on(engine, 'collisionStart', onPairs);
  Events.on(engine, 'collisionActive', onPairs);
  pieces = []; pending = []; stuck = new Map();
  simTime = 0;
  deck = freshDeck();
  current = null; next = null; nextAt = 0;
  hoverX = W / 2; hoverY = 0; aiming = false;
  dropped = 0; dealt = 0; lastDropAt = -1e9; score = 0; completed = new Set(); timeUpAt = null;
  round = 1; chinaCount = 0; bestEver = null; finale = null; chinaShot = null;
  resetShake();          // 重开一局时如果正摇着，墙要回到原位
  popups = []; banners = []; endInfo = null; lastFinish = null;
}

function inBoxCodes() {
  const s = new Set();
  pieces.forEach((b) => b.piece.codes.forEach((c) => s.add(c)));
  // 手里和下一个位置上可能是一整组（比如京津冀），组里每个省都算“已在场上”
  if (current) current.codes.forEach((c) => s.add(c));
  if (next) next.codes.forEach((c) => s.add(c));
  return s;
}
// 有两组省级行政区通往全国的路只有一条，单独发牌会走进死局：
//   北京、天津 只和彼此 + 河北接壤 —— 这一对加起来也只接河北；
//   香港、澳门 只和广东接壤。
// 要是河北（或广东）先被别的省围住、埋进箱子底下，后掉下来的北京就再也碰不到任何能连的省，
// 整幅地图理论上就不可能拼成了。所以这两组不再单独发牌，而是开局就是一整块
// （引擎本来就支持多省方块）："只有一个出口"的省从第一手就已经连进去了。
const DEAL_GROUPS = [
  [110000, 120000, 130000],    // 京津冀
  [440000, 810000, 820000],    // 广东 + 香港 + 澳门
];
const GROUP_OF = new Map();
for (const g of DEAL_GROUPS) for (const c of g) GROUP_OF.set(c, g);

// 这一局的发牌顺序：每组算一个单位，以组的第一码为代表
function freshDeck() {
  const units = [];
  const grouped = new Set(DEAL_GROUPS.map((g) => g[0]));
  for (const p of PROVS) {
    if (GROUP_OF.has(p[0]) && !grouped.has(p[0])) continue;   // 已并入某一组
    units.push(GROUP_OF.get(p[0]) || [p[0]]);
  }
  return units;
}
const PIECE_COUNT = freshDeck().length;            // 一局要投放几块
const codeOf = (u) => (Array.isArray(u) ? u[0] : u);
const codesOf = (u) => (Array.isArray(u) ? u.slice() : [u]);

// 单省方块如果通往全国的路很窄（海南只能靠广东，台湾只能靠福建、广东），
// 它照样会被埋住的伙伴卡死。所以这类方块要等伙伴先落地：伙伴已经在箱内、而且还有露在外面的
// 边（没被压到箱底）时才发。伙伴落地后玩家看得见、能主动去碰，这里只是保证它不会来得太晚。
const NARROW_ROUTE = 2;            // 邻居数不超过这个值的单省方块要等伙伴
function partnerInPlay(codes) {
  for (const b of pieces) {
    if (b.piece.codes.some((c) => codes.includes(c))) {
      if (b.bounds.min.y <= RIM_Y + 40) return true;    // 露在外面，碰得到
    }
  }
  return false;
}
function canDeal(unit) {
  const codes = codesOf(unit);
  if (codes.length > 1) return true;                    // 团体本来就是连在一起的
  const c = codes[0];
  if (ADJM[c].size === 0 || ADJM[c].size > NARROW_ROUTE) return true;
  const nb = [...ADJM[c]];
  if (!nb.some((n) => inBoxCodes().has(n))) return true;   // 伙伴还没出现，随便发
  return partnerInPlay(nb);                                // 伙伴在场上：得还露着
}

// 一局的第二块一定与第一块同区且相邻；顺序表最后一块（含澳门的组）永远最后出现；
// 60% 的概率优先抽取与箱内已有省份相邻的组，让地图自然连起来。
let roundFirst = 0;

// ---- 测试模式 ----
// 打开后发牌不再随机：每一手都从"还能和箱内拼上"的方块里挑，并且优先挑邻居最多的那一块。
// 牌堆快空、剩下的都接不上时自动放宽，保证 30 块一定发得完。
// 用途：随机发牌下连成 20 多省就已经靠运气了，"34 省连成整幅地图"到底做不做得到根本没被验证过；
// 有了这个模式，测试脚本可以稳定地往"能连上"的方向走，用来验证完成条件、完成演出，
// 以及量出物理上到底能连到几个省。正常游戏不受影响。
let orderedDeal = false;
function setOrderedDeal(on) { orderedDeal = !!on; }
// 这个方块和箱内已有方块之间有多少条相邻关系（0 表示现在接不上）
function adjLinksToBox(unit) {
  let n = 0;
  for (const c of codesOf(unit)) {
    for (const o of ADJM[c]) if (inBoxCodes().has(o)) n++;
  }
  return n;
}

function drawFromDeck() {
  if (!deck.length) return null;
  const inPlay = inBoxCodes();
  const lastUnit = deck[deck.length - 1];
  const rest = deck.length > 1 ? deck.filter((u) => u !== lastUnit) : deck;
  let pool;
  if (orderedDeal) {
    // 测试模式：先要能接上，再要接得多；都接不上才退回剩下的
    const linked = rest.filter((u) => adjLinksToBox(u) > 0);
    pool = linked.length ? linked : rest;
  } else if (deck.length === PIECE_COUNT - 1) {
    pool = rest.filter((u) => codesOf(u).some((c) => ADJM[roundFirst].has(c)) && PROV[codeOf(u)].region === PROV[roundFirst].region);
  } else {
    const cand = rest.filter((u) => codesOf(u).some((c) => [...ADJM[c]].some((o) => inPlay.has(o))));
    pool = cand.length && Math.random() < BIAS ? cand : rest;
  }
  if (!pool.length) pool = rest;
  // 要等伙伴的先放到一边；一手全是这种方块就照发（只会发生在牌堆快空的时候）
  const ready = pool.filter(canDeal);
  if (ready.length) pool = ready;
  // 测试模式下在候选里挑邻居最多的，让每一手尽可能都真的能拼进去
  const unit = orderedDeal
    ? pool.reduce((best, u) => (adjLinksToBox(u) > adjLinksToBox(best) ? u : best), pool[0])
    : pool[Math.floor(Math.random() * pool.length)];
  deck.splice(deck.indexOf(unit), 1);
  if (deck.length === PIECE_COUNT - 1) roundFirst = codeOf(unit);
  return { code: codeOf(unit), codes: codesOf(unit), piece: buildPiece(codesOf(unit)) };
}

function hoverPos(piece) {
  const x = Math.max(BOX_L + 3 - piece.minX, Math.min(BOX_R - 3 - piece.maxX, hoverX));
  const y = hoverY || Math.max(RIM_Y - 6 - piece.maxY, 4 - piece.minY);
  return [x, y];
}

// 仅离线检查用：复用一个临时刚体去探测碰撞，避免每问一次就把合并块重新凸分解一遍
let probe = null, probeFor = null;
function probeBody() {
  if (!current) return null;
  if (probeFor !== current) {
    probe = createBody(current.piece, 0, 0);
    probeFor = current;
  }
  return probe;
}

function drop() {
  if (state !== 'play' || !current) return;
  const [x, y] = hoverPos(current.piece);
  const b = createBody(current.piece, x, y);
  b.dropAt = simTime;
  b.entering = true;   // 还在从箱口上方落下：完全进入箱体前豁免溢出判定
  // 摇动尚未结束时投放的方块，也享受这次摇动的豁免时间
  if (shakeStart !== null && simTime < shakeStart + SHAKE_GRACE) b.graceUntil = shakeStart + SHAKE_GRACE;
  Composite.add(engine.world, b);
  pieces.push(b);
  dropped += current.codes.length;      // 已投放的省级行政区数（团体算它包含的每个省）
  dealt++;                             // 已投放的方块数（团体算一块）
  lastDropAt = simTime;
  noteBest(b.piece);
  checkRegions(b.piece);
  // 判断"是不是最后一块"不能只看牌堆空不空：发牌时 current 和 next 都已经抽出来了，
  // 所以牌堆先空、最后一块还躺在 next 里。要连 next 一起算，否则会早一手开始倒计时、
  // 提前发全投放奖励（下一帧 next 才变成 current）。
  if (!deck.length && !next) {
    timeUpAt = simTime + TIME_LIMIT_MS;
    addScore(1000);
    popups.push({ text: `${TOTAL} 个省级行政区全部投放 +1,000`, x: W / 2, y: RIM_Y + 70, t0: performance.now(), big: true });
  }
  current = null;
  nextAt = simTime + DROP_WAIT;
}
function noteBest(piece) {
  if (!bestEver || piece.codes.length > bestEver.codes.length) bestEver = piece;
}
// 本局所有方块都已投放，但还没连成一整块：趁时间还没到赶紧摇一摇
function allDropped() {
  return state === 'play' && dealt === PIECE_COUNT && !finale;
}

function addScore(n) { score += n; }

function checkRegions(piece) {
  const set = new Set(piece.codes);
  for (const r of REGIONS) {
    if (r.single) continue;
    if (completed.has(r.key) || !r.codes.every((c) => set.has(c))) continue;
    completed.add(r.key);
    const pts = r.codes.length * 100;
    addScore(pts);
    banners.push({ title: `${r.name} 已连成!`, sub: `+${pts.toLocaleString('zh-CN')}分` });
  }
}

// ---- 合并 ----
// 碰撞是按凸多边形逐块上报的，所以只比较真正挨在一起的那两个省
function onPairs(e) {
  for (const pr of e.pairs) {
    const a = pr.bodyA.parent, b = pr.bodyB.parent;
    if (a !== b && a.piece && b.piece && ADJM[pr.bodyA.code]?.has(pr.bodyB.code)) pending.push([a, b]);
  }
}
function resolveMerges() {
  if (!pending.length) return;
  const used = new Set();
  for (const [a, b] of pending) {
    if (used.has(a) || used.has(b) || !pieces.includes(a) || !pieces.includes(b)) continue;
    used.add(a); used.add(b);
    merge(a, b);
  }
  pending.length = 0;
}
function merge(a, b) {
  const big = a.piece.area >= b.piece.area ? a : b;
  const ma = a.mass, mb = b.mass, m = ma + mb;
  const pos = { x: (a.position.x * ma + b.position.x * mb) / m, y: (a.position.y * ma + b.position.y * mb) / m };
  const va = Body.getVelocity(a), vb = Body.getVelocity(b);
  const vel = { x: (va.x * ma + vb.x * mb) / m, y: (va.y * ma + vb.y * mb) / m };
  const piece = buildPiece(a.piece.codes.concat(b.piece.codes), big.angle);
  Composite.remove(engine.world, [a, b]);
  pieces = pieces.filter((p) => p !== a && p !== b);
  const nb = createBody(piece, 0, 0);
  Body.setAngle(nb, big.angle);
  Body.setPosition(nb, pos);
  Body.setVelocity(nb, { x: vel.x * 0.5, y: vel.y * 0.5 });
  Body.setAngularVelocity(nb, Body.getAngularVelocity(big) * 0.5);
  // 与还在落下的方块合并时保留那份豁免；仅仅合并本身不会带来豁免
  const entering = [a, b].filter((p) => p.entering);
  nb.entering = entering.length > 0;
  nb.dropAt = Math.max(...(entering.length ? entering : [a, b]).map((p) => p.dropAt));
  nb.popAt = performance.now();
  nb.graceUntil = Math.max(a.graceUntil || 0, b.graceUntil || 0);
  clampInside(nb, true);
  const [dx, dy] = placeMerged(nb);
  if (dx || dy) {
    nb.glide = { x: -dx, y: -dy, t0: performance.now() };
    pos.x += dx; pos.y += dy;
  }
  Composite.add(engine.world, nb);
  pieces.push(nb);
  const n = piece.codes.length;
  addScore(n * n * 10);
  // 两个单独的省合并时显示两个名字，否则显示合并后的地区名
  const popText = a.piece.codes.length === 1 && b.piece.codes.length === 1
    ? `${PROV[a.piece.codes[0]].name}+${PROV[b.piece.codes[0]].name}` : piece.name;
  popups.push({ text: popText, x: pos.x, y: pos.y, t0: performance.now() });
  noteBest(piece);
  checkRegions(piece);
  if (n === TOTAL) startFinale(nb);
}

// 结束摇动并把墙放回原位。
// 摇动是直接挪墙实现的（updateShake 每帧把左/右墙和地板按 shakeX 偏移），所以任何"中途打断摇动"
// 的地方（完成演出、重开一局）都必须同时把 shakeX 归零并把墙摆回去，否则箱子会一直偏一个振幅，
// 下一局丢下的方块刚进场就被偏掉的墙推到边上。
function resetShake() {
  shakeStart = null;
  shakeX = 0;
  shaking = false;
  kicked2 = true;
  Body.setPosition(walls.left, { x: WALL_X0[0], y: walls.left.position.y }, true);
  Body.setPosition(walls.right, { x: WALL_X0[1], y: walls.right.position.y }, true);
  Body.setPosition(walls.floor, { x: W / 2, y: walls.floor.position.y }, true);
}

// ---- 全国拼合完成：展示、消失、进入下一局 ----
function startFinale(b) {
  Composite.remove(engine.world, b);
  pieces = pieces.filter((p) => p !== b);
  pending.length = 0;
  const [ox, oy] = pieceOrigin(b), pc = b.piece;
  let a0 = b.angle % (2 * Math.PI);
  if (a0 > Math.PI) a0 -= 2 * Math.PI; else if (a0 < -Math.PI) a0 += 2 * Math.PI;
  const k1 = Math.min((0.9 * BW) / (pc.maxX - pc.minX), (0.62 * BH) / (pc.maxY - pc.minY));
  finale = {
    piece: pc, t0: simTime, a0, ox0: ox, oy0: oy, k1,
    ox1: W / 2 - ((pc.minX + pc.maxX) / 2) * k1, oy1: RIM_Y + BH * 0.6 - ((pc.minY + pc.maxY) / 2) * k1,
    // 自南向北依次点亮
    lit: pc.parts.slice().sort((p, q) => PROV[q.code].cy - PROV[p.code].cy),
    shot: false,
  };
  chinaCount++;
  timeUpAt = null;
  addScore(10000);
  banners.length = 0;
  popups.length = 0;
  resetShake();          // 摇动可能正在进行的途中完成拼图：这里要连墙一起复位
  updateButtons();
}
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
function finalePose(t) {
  const f = finale;
  if (t < FINALE_MOVE) {
    const e = easeInOut(t / FINALE_MOVE);
    return { x: f.ox0 + (f.ox1 - f.ox0) * e, y: f.oy0 + (f.oy1 - f.oy0) * e, a: f.a0 * (1 - e), k: 1 + (f.k1 - 1) * e, alpha: 1 };
  }
  if (t < FINALE_OUT) return { x: f.ox1, y: f.oy1 + Math.sin((t - FINALE_MOVE) / 520) * 3, a: 0, k: f.k1, alpha: 1 };
  const u = clamp01((t - FINALE_OUT) / (FINALE_MS - FINALE_OUT)), e = u * u;
  const mx = (f.piece.minX + f.piece.maxX) / 2, my = (f.piece.minY + f.piece.maxY) / 2;
  const k = f.k1 * (1 - 0.55 * e), lift = (f.oy1 + my * f.k1 + 120) * e * 1.05;
  return { x: f.ox1 + mx * (f.k1 - k), y: f.oy1 + my * (f.k1 - k) - lift, a: 0, k, alpha: 1 - clamp01((u - 0.7) / 0.3) };
}
function updateFinale() {
  const t = simTime - finale.t0;
  if (!finale.shot && t >= FINALE_SHOT) {
    finale.shot = true;
    chinaShot = document.createElement('canvas');
    chinaShot.width = SHARE_IMG_W; chinaShot.height = SHARE_IMG_H;
    render(chinaShot.getContext('2d'), SHARE_IMG_W / W);
  }
  if (t >= FINALE_MS) startRound();
}
function startRound() {
  finale = null;
  round++;
  deck = freshDeck();
  dropped = 0; dealt = 0; lastDropAt = simTime; completed = new Set();
  stuck = new Map(); pending.length = 0;
  resetShake();          // 上一局可能是在摇动中拼完的：墙必须回到原位，否则新方块一进场就被推到边上
  current = null;
  next = drawFromDeck();
  nextAt = simTime + ROUND_MS;
  banners.push({ title: `第 ${round} 局`, sub: `中国地图 已拼成 ${chinaCount} 次`, dur: ROUND_MS + 400 });
  updateButtons();
}

// ---- 合并后重新放置 ----
// 重新排布后的形状常常戳进邻居里，而 Matter 一旦让凹形互相咬住就推不开，所以先找位置：
// 先在 PLACE_R 半径内找最近的空位，再往正上方找，都不行就取重叠最少的位置。
const PLACE_OFFSETS = (() => {
  const o = [[0, 0]];
  for (let r = PLACE_STEP; r <= PLACE_R; r += PLACE_STEP) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / 6));
    for (let k = 0; k < n; k++) o.push([r * Math.cos((2 * Math.PI * k) / n), r * Math.sin((2 * Math.PI * k) / n)]);
  }
  for (let r = PLACE_R + PLACE_STEP; r <= FLOOR_Y; r += PLACE_STEP) o.push([0, -r]);
  return o;
})();
function penetration(b, others, limit) {
  let max = 0;
  for (let i = 1; i < b.parts.length; i++) {
    const p = b.parts[i], pb = p.bounds;
    for (const q of others) {
      const qb = q.bounds;
      if (qb.max.x < pb.min.x || qb.min.x > pb.max.x || qb.max.y < pb.min.y || qb.min.y > pb.max.y) continue;
      const c = Matter.Collision.collides(p, q);
      if (c && c.depth > max) { max = c.depth; if (max >= limit) return max; }
    }
  }
  return max;
}
function partsExcept(b) {
  const out = [];
  for (const o of pieces) if (o !== b) for (let i = 1; i < o.parts.length; i++) out.push(o.parts[i]);
  return out;
}
function findRoom(nb, topY, skipZero) {
  const others = partsExcept(nb);
  const x0 = nb.position.x, y0 = nb.position.y;
  let best = [0, 0], bestD = Infinity;
  for (const [dx, dy] of PLACE_OFFSETS) {
    if (skipZero && !dx && !dy) continue;
    Body.setPosition(nb, { x: x0 + dx, y: y0 + dy });
    const bb = nb.bounds;
    if (bb.min.x < BOX_L || bb.max.x > BOX_R || bb.max.y > FLOOR_Y || bb.min.y < topY) continue;
    const d = penetration(nb, others, bestD);
    if (d < bestD) { bestD = d; best = [dx, dy]; if (d <= PLACE_TOL) break; }
  }
  Body.setPosition(nb, { x: x0 + best[0], y: y0 + best[1] });
  return [best, bestD];
}
function placeMerged(nb) {
  return findRoom(nb, 4, false)[0];
}

// ---- 兜底：把互相咬住的方块分开 ----
let stuck = new Map();
function unstick() {
  const deep = new Map();
  for (const pr of engine.pairs.list) {
    if (!pr.isActive || pr.collision.depth <= STUCK_DEPTH) continue;
    const a = pr.bodyA.parent, b = pr.bodyB.parent;
    if (a === b || !a.piece || !b.piece) continue;
    deep.set(a.id < b.id ? a.id + ':' + b.id : b.id + ':' + a.id, [a, b]);
  }
  const since = new Map();
  for (const key of deep.keys()) since.set(key, stuck.has(key) ? stuck.get(key) : simTime);
  stuck = since;
  const moved = new Set();
  for (const [key, t] of stuck) {
    const [a, b] = deep.get(key);
    if (simTime - t < STUCK_MS || moved.has(a) || moved.has(b) || !pieces.includes(a) || !pieces.includes(b)) continue;
    for (const p of a.piece.area <= b.piece.area ? [a, b] : [b, a]) {
      const x0 = p.position.x, y0 = p.position.y;
      const [[dx, dy], d] = findRoom(p, p.entering ? 4 : RIM_Y, true);
      if (d > PLACE_TOL) { Body.setPosition(p, { x: x0, y: y0 }); continue; }
      Body.setVelocity(p, { x: 0, y: 0 });
      Body.setAngularVelocity(p, 0);
      p.glide = { x: -dx, y: -dy, t0: performance.now() };
      moved.add(p);
      stuck.delete(key);
      break;
    }
  }
}

// ---- 兜底：把所有东西留在箱内 ----
function clampInside(b, hard) {
  const L = BOX_L + shakeX, R = BOX_R + shakeX, tol = hard ? 0 : 6;
  let dx = 0, dy = 0;
  const bw = b.bounds.max.x - b.bounds.min.x;
  if (bw >= R - L) dx = (L + R) / 2 - (b.bounds.min.x + b.bounds.max.x) / 2;
  else if (b.bounds.min.x < L - tol) dx = L - b.bounds.min.x;
  else if (b.bounds.max.x > R + tol) dx = R - b.bounds.max.x;
  if (b.bounds.max.y > FLOOR_Y + tol) dy = FLOOR_Y - b.bounds.max.y;
  if (dx || dy) {
    Body.setPosition(b, { x: b.position.x + dx, y: b.position.y + dy });
    if (!hard) {
      const v = Body.getVelocity(b);
      Body.setVelocity(b, { x: dx ? 0 : v.x * 0.5, y: dy ? Math.min(0, v.y) : v.y });
    }
  }
}
function limitMotion(b) {
  const v = Body.getVelocity(b), speed = Math.hypot(v.x, v.y);
  if (speed > MAX_SPEED) {
    const k = MAX_SPEED / speed;
    Body.setVelocity(b, { x: v.x * k, y: v.y * k });
  }
  const av = Body.getAngularVelocity(b);
  if (Math.abs(av) > MAX_SPIN) Body.setAngularVelocity(b, Math.sign(av) * MAX_SPIN);
}

// ---- 摇一摇 ----
function startShake() {
  if (state !== 'play' || shaking) return;
  shaking = true;
  shakeStart = simTime;
  kicked2 = false;
  kick(1);
  updateButtons();
}
const LIGHT_REF = (() => {
  let m = Infinity;
  for (const p of PROVS) {
    const q = PROV[p[0]], s = SIZE_K * Math.pow(q.area, SIZE_EXP) / Math.sqrt(q.aproj);
    m = Math.min(m, q.aproj * s * s);
  }
  return m;
})();
function kick(power) {
  for (const b of pieces) {
    // 被弹起的方块短时间内不会溢出；已经在箱口之上的不再延长豁免
    if (b.entering || b.bounds.min.y >= RIM_Y) b.graceUntil = shakeStart + SHAKE_GRACE;
    const light = Math.min(1, Math.sqrt(LIGHT_REF / b.area));
    const vy = (KICK_MIN + (KICK_MAX - KICK_MIN) * light) * power * (0.85 + Math.random() * 0.3);
    const vx = (Math.random() * 2 - 1) * KICK_SIDE * power * (0.5 + light);
    const v = Body.getVelocity(b);
    Body.setVelocity(b, { x: v.x + vx, y: Math.min(v.y, 0) - vy });
    Body.setAngularVelocity(b, Body.getAngularVelocity(b) + (Math.random() * 2 - 1) * 0.05 * power);
  }
}
function updateShake() {
  if (shakeStart === null) return;
  const t = simTime - shakeStart;
  const prev = shakeX;
  if (t < SHAKE_MS) {
    shakeX = SHAKE_AMP * Math.sin((2 * Math.PI * SHAKE_CYCLES * t) / SHAKE_MS);
  } else {
    shakeX = 0;
    if (shaking) { shaking = false; updateButtons(); }
  }
  if (!kicked2 && t >= KICK2_AT) { kicked2 = true; kick(KICK2_POWER); }
  if (shakeX !== prev || t < SHAKE_MS + 100) {
    Body.setPosition(walls.left, { x: WALL_X0[0] + shakeX, y: walls.left.position.y }, true);
    Body.setPosition(walls.right, { x: WALL_X0[1] + shakeX, y: walls.right.position.y }, true);
    Body.setPosition(walls.floor, { x: W / 2 + shakeX, y: walls.floor.position.y }, true);
  }
  if (t > SHAKE_GRACE && !shaking) shakeStart = null;
}

// ---- 规则 ----
function topCode(b) {
  const [ox, oy] = pieceOrigin(b), ca = Math.cos(b.angle), sa = Math.sin(b.angle), pc = b.piece;
  let best = pc.codes[0], by = Infinity;
  for (const c of pc.codes) for (const ring of PROV[c].pts) for (const [kx, ky] of ring) {
    const x = (kx - pc.cx) * pc.s, y = (ky - pc.cy) * pc.s;
    const wy = oy + x * sa + y * ca;
    if (wy < by) { by = wy; best = c; }
  }
  return best;
}
// 任一方块冒出箱口就结束，除了还在落下的方块和刚摇完的瞬间；红线只是视觉缓冲
function checkRules() {
  if (freePlace) return;
  for (const b of pieces) {
    if (b.entering && (b.bounds.min.y >= RIM_Y || simTime - b.dropAt >= FRESH_MS)) b.entering = false;
    if (b.bounds.min.y >= RIM_Y) continue;
    if (!b.entering && !(b.graceUntil > simTime)) return finish('overflow', topCode(b));
  }
}

function step() {
  simTime += STEP_MS;
  if (finale) { updateFinale(); return; }
  if (!current && next && simTime >= nextAt) {
    current = next;
    next = drawFromDeck();
  }
  updateShake();
  for (let i = 0; i < SUBSTEPS; i++) {
    Engine.update(engine, STEP_MS / SUBSTEPS);
    resolveMerges();
  }
  for (const b of pieces) { limitMotion(b); clampInside(b, false); }
  unstick();
  checkRules();
  if (state === 'play' && timeUpAt !== null && simTime >= timeUpAt) finish('timeup');
}

function biggest() {
  let best = null;
  for (const b of pieces) {
    if (!best || b.piece.codes.length > best.codes.length || (b.piece.codes.length === best.codes.length && b.piece.area > best.area)) best = b.piece;
  }
  return best;
}

// ===================================================================================================
// 渲染
// ===================================================================================================
const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
let viewScale = 1, dpr = 1;
const FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Source Han Sans SC", sans-serif';

function drawShape(g, piece, ox, oy, angle, k) {
  g.save();
  g.translate(ox, oy);
  g.rotate(angle);
  if (k !== 1) g.scale(k, k);
  g.lineJoin = 'round';
  g.strokeStyle = C_OUTLINE; g.lineWidth = 2.4 / k;
  for (const p of piece.parts) g.stroke(p.path);
  for (const p of piece.parts) { g.fillStyle = p.color; g.fill(p.path); }
  g.strokeStyle = '#fff'; g.lineWidth = 1.3 / k;
  for (const p of piece.parts) g.stroke(p.path);
  g.restore();
}
const labelWidths = new Map();
function labelWidth(g, text, size) {
  const key = size + ':' + text;
  let w = labelWidths.get(key);
  if (w === undefined) { w = g.measureText(text).width; labelWidths.set(key, w); }
  return w;
}
// 每个成员省在自己的锚点上正着写名字。合并方块里面积大的省先写，写不下（会重叠）的就跳过；
// 白色描边仍然勾出每个成员的范围。
function drawLabels(g, piece, ox, oy, angle, k, size) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  g.font = `bold ${size}px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const placed = [];
  for (const p of piece.labelOrder) {
    const x = ox + (p.lx * ca - p.ly * sa) * k, y = oy + (p.lx * sa + p.ly * ca) * k;
    const t = PROV[p.code].label;
    const hw = labelWidth(g, t, size) / 2 + 1, hh = size * 0.55;
    if (placed.some((q) => Math.abs(q[0] - x) < q[2] + hw && Math.abs(q[1] - y) < q[3] + hh)) continue;
    placed.push([x, y, hw, hh]);
    g.lineWidth = size * 0.28; g.strokeStyle = 'rgba(255,255,255,.78)'; g.strokeText(t, x, y);
    g.fillStyle = C_INK; g.fillText(t, x, y);
  }
}
function popScale(b, now) {
  if (!b.popAt) return 1;
  const t = (now - b.popAt) / 320;
  if (t >= 1) { b.popAt = 0; return 1; }
  return 1 + 0.14 * Math.sin(Math.PI * t) * (1 - t * 0.4);
}
function ellipsize(g, text, maxW) {
  if (g.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + '...').width > maxW) t = t.slice(0, -1);
  return t + '...';
}

function render(g = ctx, m = dpr * viewScale, ox = 0, oy = 0) {
  const now = performance.now();
  g.setTransform(m, 0, 0, m, ox, oy);
  g.fillStyle = C_PAPER;
  g.fillRect(0, 0, W, H);
  const labelSize = Math.max(10, LABEL_MIN_PX / viewScale);

  // 箱体内部
  const bx = BOX_L + shakeX;
  g.fillStyle = 'rgba(255,255,255,.62)';
  g.fillRect(bx, RIM_Y, BW, BH);
  // 溢出警戒线（外观始终一致，不做闪烁警告）
  g.save();
  g.strokeStyle = 'rgba(220,60,60,.6)';
  g.lineWidth = 1.5;
  g.setLineDash([6, 5]);
  g.beginPath(); g.moveTo(bx, LINE_Y); g.lineTo(bx + BW, LINE_Y); g.stroke();
  g.restore();

  // 投放引导线 + 悬停中的方块
  let hover = null;
  if (state === 'play' && current) {
    const [x, y] = hoverPos(current.piece);
    hover = [x, y];
    if (!pointerTop) {
      g.strokeStyle = 'rgba(59,71,82,.2)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x, y + current.piece.maxY + 3); g.lineTo(x, FLOOR_Y); g.stroke();
    }
  }

  // 方块（裁在箱体内，几单位的接触误差不会露到墙外）
  const drawn = [];
  g.save();
  g.beginPath(); g.rect(bx, -H, BW, FLOOR_Y + H); g.clip();
  for (const b of pieces) {
    const [ox, oy] = pieceOrigin(b);
    let gx = 0, gy = 0;
    if (b.glide) {
      const t = (now - b.glide.t0) / GLIDE_MS;
      if (t >= 1) b.glide = null;
      else { const r = (1 - t) ** 3; gx = b.glide.x * r; gy = b.glide.y * r; }
    }
    const k = popScale(b, now);
    const px = b.position.x + gx + (ox - b.position.x) * k, py = b.position.y + gy + (oy - b.position.y) * k;
    drawShape(g, b.piece, px, py, b.angle, k);
    drawn.push([b.piece, px, py, b.angle, k]);
  }
  g.restore();
  if (finale) drawFinale(g, simTime - finale.t0, labelSize);
  if (hover) drawShape(g, current.piece, hover[0], hover[1], 0, 1);
  for (const d of drawn) drawLabels(g, d[0], d[1], d[2], d[3], d[4], labelSize);
  if (hover) drawLabels(g, current.piece, hover[0], hover[1], 0, 1, labelSize);

  // 箱体边框
  g.strokeStyle = C_BOX; g.lineWidth = 8; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(bx, RIM_Y); g.lineTo(bx, FLOOR_Y); g.lineTo(bx + BW, FLOOR_Y); g.lineTo(bx + BW, RIM_Y); g.stroke();
  g.lineCap = 'butt';

  if (state !== 'title') drawHud(g);
  if (allDropped() && timeUpAt !== null) {
    const left = Math.max(0, Math.ceil((timeUpAt - simTime) / 1000));
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.font = `bold 15px ${FONT}`;
    const lw = g.measureText('还剩').width;
    g.font = `bold 40px ${FONT}`;
    const nw = g.measureText(String(left)).width, x0 = W / 2 - (lw + 6 + nw) / 2;
    g.lineWidth = 5; g.strokeStyle = C_PAPER;
    g.fillStyle = left <= 5 ? '#c2453a' : '#2d5d80';
    g.textAlign = 'left';
    g.strokeText(String(left), x0 + lw + 6, RIM_Y - 46); g.fillText(String(left), x0 + lw + 6, RIM_Y - 46);
    g.font = `bold 15px ${FONT}`;
    g.strokeText('还剩', x0, RIM_Y - 42); g.fillText('还剩', x0, RIM_Y - 42);
    g.textAlign = 'center'; g.font = `bold 14px ${FONT}`; g.lineWidth = 4; g.fillStyle = '#2d5d80';
    g.strokeText('摇一摇，把 34 个省级行政区连成整幅中国地图', W / 2, RIM_Y - 14);
    g.fillText('摇一摇，把 34 个省级行政区连成整幅中国地图', W / 2, RIM_Y - 14);
  }
  if (finale) drawFinaleTop(g, simTime - finale.t0);

  // 合并提示
  popups = popups.filter((p) => now - p.t0 < 1300);
  for (const p of popups) {
    const t = (now - p.t0) / 1300;
    g.globalAlpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
    const base = p.big ? 15 : 13;
    g.font = `bold ${base}px ${FONT}`;
    const w0 = g.measureText(p.text).width, room = BW - 12;
    const size = w0 > room ? base * room / w0 : base;
    g.font = `bold ${size}px ${FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const tw = g.measureText(p.text).width;
    const x = Math.max(BOX_L + tw / 2 + 4, Math.min(BOX_R - tw / 2 - 4, p.x)), y = p.y - 26 * t;
    g.lineWidth = 4; g.strokeStyle = '#fff'; g.strokeText(p.text, x, y);
    g.fillStyle = '#2d5d80'; g.fillText(p.text, x, y);
    g.globalAlpha = 1;
  }
  // 地区完成横幅（一次只显示一条）
  if (banners.length) {
    const bn = banners[0];
    if (!bn.t0) bn.t0 = now;
    const t = (now - bn.t0) / (bn.dur || 1800);
    if (t >= 1) banners.shift();
    else {
      const k = t < 0.12 ? 0.6 + 0.4 * (t / 0.12) * (1.15 - 0.15 * (t / 0.12)) : 1;
      g.save();
      g.globalAlpha = t > 0.85 ? (1 - t) / 0.15 : 1;
      g.translate(W / 2, RIM_Y + BH * 0.42);
      g.scale(k, k);
      g.fillStyle = 'rgba(47,58,68,.88)';
      roundRect(g, -128, -36, 256, 72, 16); g.fill();
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `bold 24px ${FONT}`;
      const bw0 = g.measureText(bn.title).width;
      if (bw0 > 236) g.font = `bold ${24 * 236 / bw0}px ${FONT}`;
      g.fillText(bn.title, 0, -9);
      g.font = `bold 14px ${FONT}`; g.fillStyle = '#ffe9a8'; g.fillText(bn.sub, 0, 18);
      g.restore();
    }
  }
}
// ---- 全国拼合完成的演出 ----
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const CONFETTI = (() => {
  const r = seeded(7), pal = ['#e8505b', '#f2c14e', '#4bb3a6', '#5b8bd9', '#f08a4b', '#a77bd6', '#ffffff', '#7cc46a'];
  return Array.from({ length: 110 }, () => ({
    x: r() * W, y0: -20 - r() * 260, vy: 85 + r() * 90, sway: 8 + r() * 22, ph: r() * 6.28, sp: 4 + r() * 8,
    rot: r() * 6.28, rs: (r() - 0.5) * 8, w: 3.5 + r() * 3, h: 6 + r() * 5, c: pal[Math.floor(r() * pal.length)],
    delay: r() * 700,
  }));
})();
const FIREWORKS = [[2150, 0.22, 0.36], [2450, 0.80, 0.30], [2750, 0.50, -0.12], [3100, 0.20, 0.62], [3400, 0.82, 0.52]].map(([t0, fx, fy], i) => {
  const r = seeded(100 + i);
  const hue = [['#ffd75e', '#fff3b8'], ['#ff6b6b', '#ffd0d0'], ['#6bc8ff', '#e0f4ff'], ['#ffd75e', '#ff9f43'], ['#b28dff', '#f0e6ff']][i];
  return {
    t0, x: BOX_L + BW * fx, y: RIM_Y + BH * fy,
    parts: Array.from({ length: 40 }, (_, j) => ({ a: (2 * Math.PI * j) / 40 + r() * 0.15, v: 95 + r() * 55, c: hue[j % 2] })),
  };
});
const BURST = (() => {
  const r = seeded(55);
  return Array.from({ length: 46 }, (_, i) => ({ a: (2 * Math.PI * i) / 46 + r() * 0.2, v: 110 + r() * 170, r: 2 + r() * 3.5 }));
})();

function finaleCenter(t) {
  const f = finale, p = finalePose(t);
  return [p.x + ((f.piece.minX + f.piece.maxX) / 2) * p.k, p.y + ((f.piece.minY + f.piece.maxY) / 2) * p.k];
}
function drawStar(g, x, y, r, c) {
  const q = r * 0.32;
  g.fillStyle = c; g.beginPath();
  g.moveTo(x, y - r * 2); g.lineTo(x + q, y - q); g.lineTo(x + r * 2, y); g.lineTo(x + q, y + q);
  g.lineTo(x, y + r * 2); g.lineTo(x - q, y + q); g.lineTo(x - r * 2, y); g.lineTo(x - q, y - q);
  g.closePath(); g.fill();
}
// 整屏泛金（离地图越近越亮），让光线看起来像光而不是灰纸：省份点亮到一半时开始，全亮后到位
function drawBackdrop(g, t) {
  const warm = 0.5 * clamp01((t - FINALE_MOVE) / (FINALE_LIT - FINALE_MOVE));
  const a = Math.max(warm, clamp01((t - FINALE_LIT) / 300)) * (1 - clamp01((t - FINALE_OUT) / 600));
  if (a <= 0) return;
  const [cx, cy] = finaleCenter(t);
  const bg = g.createRadialGradient(cx, cy, 30, cx, cy, 560);
  bg.addColorStop(0, `rgba(255,246,206,${a})`);
  bg.addColorStop(0.55, `rgba(253,226,140,${a})`);
  bg.addColorStop(1, `rgba(246,200,96,${a})`);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = `rgba(255,255,250,${0.3 * a})`; g.fillRect(BOX_L, RIM_Y, BW, BH);
}
function drawRays(g, t) {
  const a = clamp01((t - FINALE_LIT) / 400) * (1 - clamp01((t - FINALE_OUT) / 500));
  if (a <= 0) return;
  const [cx, cy] = finaleCenter(t), R = 560, n = 18;
  g.save();
  g.translate(cx, cy);
  g.rotate((t / 1000) * 0.35);
  const grad = g.createRadialGradient(0, 0, 20, 0, 0, R);
  grad.addColorStop(0, `rgba(255,255,244,${0.85 * a})`);
  grad.addColorStop(0.5, `rgba(255,250,222,${0.45 * a})`);
  grad.addColorStop(1, 'rgba(255,250,222,0)');
  g.fillStyle = grad;
  for (let i = 0; i < n; i++) {
    const a0 = (2 * Math.PI * i) / n, w = (Math.PI / n) * 0.55;
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, a0 - w, a0 + w); g.closePath(); g.fill();
  }
  const halo = g.createRadialGradient(0, 0, 0, 0, 0, 200);
  halo.addColorStop(0, `rgba(255,248,214,${0.7 * a})`); halo.addColorStop(1, 'rgba(255,248,214,0)');
  g.fillStyle = halo; g.beginPath(); g.arc(0, 0, 200, 0, Math.PI * 2); g.fill();
  g.restore();
}
function drawGlow(g, f, pose, t, strength) {
  const pulse = Math.sin(t / 260) ** 2;
  g.save();
  g.translate(pose.x, pose.y); g.scale(pose.k, pose.k);
  g.lineJoin = 'round';
  g.shadowColor = 'rgba(255,200,60,.9)'; g.shadowBlur = (18 + 14 * pulse) * strength;
  g.strokeStyle = `rgba(240,190,60,${(0.35 + 0.3 * pulse) * strength})`; g.lineWidth = (14 + 10 * pulse) / pose.k;
  for (const p of f.piece.parts) g.stroke(p.path);
  g.shadowBlur = 0;
  g.strokeStyle = `rgba(255,224,110,${(0.7 + 0.3 * pulse) * strength})`; g.lineWidth = 5 / pose.k;
  for (const p of f.piece.parts) g.stroke(p.path);
  g.restore();
}
// 自南向北逐个点亮：先白光一闪，再染成金色；还没点亮的显得发灰
function drawLightUp(g, f, pose, t) {
  const dt = (FINALE_LIT - FINALE_MOVE) / f.lit.length;
  g.save();
  g.translate(pose.x, pose.y); g.scale(pose.k, pose.k);
  f.lit.forEach((p, i) => {
    const ti = t - (FINALE_MOVE + i * dt);
    g.fillStyle = ti < 0 ? 'rgba(244,241,234,.55)' : `rgba(255,236,150,${0.28 + 0.6 * Math.max(0, 1 - ti / 280)})`;
    g.fill(p.path);
  });
  g.restore();
  f.lit.forEach((p, i) => {
    const ti = t - (FINALE_MOVE + i * dt);
    if (ti < 0 || ti > 420) return;
    const u = ti / 420;
    drawStar(g, pose.x + p.lx * pose.k, pose.y + p.ly * pose.k - 10 * u, 5 * (1 - u * 0.4), `rgba(255,214,70,${1 - u})`);
  });
}
function drawFinaleBanner(g, t) {
  if (t < FINALE_LIT) return;
  const u = (t - FINALE_LIT) / 260;
  const s = u < 1 ? 2.1 - 1.25 * easeInOut(u) : 1 + 0.15 * Math.max(0, 1 - (u - 1) * 3) * Math.sin((u - 1) * 18);
  const alpha = Math.min(1, u * 2) * (1 - clamp01((t - FINALE_OUT) / 500));
  if (alpha <= 0) return;
  g.save();
  g.globalAlpha = alpha;
  g.translate(W / 2, RIM_Y + 64); g.scale(s, s);
  g.fillStyle = '#b77d14';
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.moveTo(sx * 130, -16); g.lineTo(sx * 172, -16); g.lineTo(sx * 158, 6); g.lineTo(sx * 172, 28); g.lineTo(sx * 130, 28);
    g.closePath(); g.fill();
  }
  const grad = g.createLinearGradient(0, -42, 0, 42);
  grad.addColorStop(0, '#fbe38a'); grad.addColorStop(0.5, '#f2c14e'); grad.addColorStop(1, '#d99a22');
  g.fillStyle = grad;
  g.shadowColor = 'rgba(120,80,0,.35)'; g.shadowBlur = 10; g.shadowOffsetY = 3;
  roundRect(g, -146, -42, 292, 84, 20); g.fill();
  g.shadowColor = 'transparent';
  g.strokeStyle = '#fff6d6'; g.lineWidth = 3; g.stroke();
  const sw = ((t - FINALE_LIT - 300) % 1400) / 1400;
  if (t - FINALE_LIT > 300 && sw < 0.45) {
    g.save();
    roundRect(g, -146, -42, 292, 84, 20); g.clip();
    const x = -220 + (sw / 0.45) * 440;
    const sh = g.createLinearGradient(x - 40, 0, x + 40, 0);
    sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,.75)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sh; g.transform(1, 0, -0.4, 1, 0, 0); g.fillRect(x - 40, -60, 80, 120);
    g.restore();
  }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.fillStyle = '#5a3d06'; g.font = `900 30px ${FONT}`;
  g.lineWidth = 5; g.strokeStyle = 'rgba(255,248,220,.9)';
  g.strokeText('中国地图 拼成!', 0, -10); g.fillText('中国地图 拼成!', 0, -10);
  const cnt = Math.round(10000 * clamp01((t - FINALE_LIT - 150) / 650));
  g.font = `bold 17px ${FONT}`; g.fillText(`+${cnt.toLocaleString('zh-CN')}分`, 0, 24);
  g.restore();
}
function drawTrail(g, t, pose) {
  if (t < FINALE_OUT) return;
  const r = seeded(Math.floor(t / 60)), [cx, cy] = finaleCenter(t);
  for (let i = 0; i < 10; i++) {
    const x = cx + (r() - 0.5) * 140 * pose.k / finale.k1, y = cy + 40 + r() * 160;
    drawStar(g, x, y, 1.5 + r() * 2, `rgba(255,214,90,${0.4 + r() * 0.5})`);
  }
}
function drawFinale(g, t, labelSize) {
  const f = finale, pose = finalePose(t);
  drawBackdrop(g, t);
  drawRays(g, t);
  g.save();
  g.globalAlpha = pose.alpha;
  const glow = clamp01((t - FINALE_LIT) / 200) * (1 - clamp01((t - FINALE_OUT) / 400));
  if (glow > 0) drawGlow(g, f, pose, t, glow);
  drawShape(g, f.piece, pose.x, pose.y, pose.a, pose.k);
  if (t >= FINALE_MOVE && t < FINALE_OUT) drawLightUp(g, f, pose, t);
  if (t < FINALE_OUT) drawLabels(g, f.piece, pose.x, pose.y, pose.a, pose.k, labelSize);
  g.restore();
  drawTrail(g, t, pose);
  drawFinaleBanner(g, t);
}
function drawFinaleTop(g, t) {
  for (const fw of FIREWORKS) {
    const tt = (t - fw.t0) / 1000;
    if (tt < -0.25 || tt > 1.2) continue;
    if (tt < 0) {
      g.fillStyle = 'rgba(255,240,190,.9)';
      g.beginPath(); g.arc(fw.x, fw.y - (tt / 0.25) * 120, 2, 0, Math.PI * 2); g.fill();
      continue;
    }
    if (tt < 0.12) {
      g.fillStyle = `rgba(255,255,240,${0.9 * (1 - tt / 0.12)})`;
      g.beginPath(); g.arc(fw.x, fw.y, 26 * (tt / 0.12 + 0.3), 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1 - tt / 1.2; g.lineWidth = 2.2; g.lineCap = 'round';
    const d = (95 / 2.6) * 2.2 * (1 - Math.exp(-tt * 2.6)), fall = 40 * tt * tt;
    for (const p of fw.parts) {
      const dd = d * (p.v / 95), d2 = Math.max(0, dd - 14), ca = Math.cos(p.a), sa = Math.sin(p.a);
      g.strokeStyle = p.c;
      g.beginPath(); g.moveTo(fw.x + ca * d2, fw.y + sa * d2 + fall); g.lineTo(fw.x + ca * dd, fw.y + sa * dd + fall); g.stroke();
    }
    g.globalAlpha = 1; g.lineCap = 'butt';
  }
  if (t >= FINALE_LIT) {
    const fade = 1 - clamp01((t - (FINALE_MS - 500)) / 500);
    for (const c of CONFETTI) {
      const tt = (t - FINALE_LIT - c.delay) / 1000;
      if (tt < 0) continue;
      const y = c.y0 + c.vy * tt;
      if (y > H + 20) continue;
      g.save();
      g.globalAlpha = fade;
      g.translate(c.x + Math.sin(c.ph + tt * c.sp) * c.sway, y); g.rotate(c.rot + c.rs * tt);
      g.scale(1, Math.cos(c.ph + tt * c.sp * 1.3));
      g.fillStyle = c.c; g.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      g.restore();
    }
  }
  const tb = (t - FINALE_OUT - 700) / 1000;
  if (tb >= 0 && tb <= 0.9) {
    for (const p of BURST) {
      const d = p.v * tb;
      drawStar(g, W / 2 + Math.cos(p.a) * d, RIM_Y - 10 + Math.sin(p.a) * d + 70 * tb * tb, p.r, `rgba(255,205,70,${1 - tb / 0.9})`);
    }
  }
  const uf = (t - FINALE_LIT) / 320;
  if (uf >= 0 && uf <= 1) { g.fillStyle = `rgba(255,252,235,${0.75 * (1 - uf)})`; g.fillRect(0, 0, W, H); }
}
// 分数 / 进度 / 当前最大块 / 下一个。画在方块之后、半透明的纸片底上，
// 这样悬停的高方块（比如黑龙江）不会把它盖住。
function drawHud(g) {
  const sc = score.toLocaleString('zh-CN');
  if (finale) {
    const countText = round > 1 ? `${dealt} / ${PIECE_COUNT} 块  第${round}局` : `${dealt} / ${PIECE_COUNT} 块`;
    g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(255,252,240,.95)'; g.fillStyle = C_INK;
    g.font = `bold 24px ${FONT}`;
    const sw = g.measureText(sc).width;
    g.lineWidth = 5; g.strokeText(sc, 12, 30); g.fillText(sc, 12, 30);
    g.font = `bold 12px ${FONT}`; g.lineWidth = 4; g.strokeText('分', 15 + sw, 30); g.fillText('分', 15 + sw, 30);
    g.font = `bold 13px ${FONT}`; g.strokeText(countText, 12, 48); g.fillText(countText, 12, 48);
    return;
  }
  const bg = biggest();
  const bigText = `最大: ${bg ? `${bg.name} (${bg.codes.length}省)` : '-'}`;
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.font = `bold 24px ${FONT}`;
  const sw = g.measureText(sc).width;
  g.font = `12px ${FONT}`;
  const big = ellipsize(g, bigText, 226);
  const bw = g.measureText(big).width;
  g.font = `bold 13px ${FONT}`;
  const countText = round > 1 ? `${dealt} / ${PIECE_COUNT} 块  第${round}局` : `${dealt} / ${PIECE_COUNT} 块`;
  const cw = g.measureText(countText).width;
  g.fillStyle = 'rgba(244,241,234,.86)';
  roundRect(g, 6, 6, Math.max(sw + 30, bw, cw) + 12, 64, 8); g.fill();
  g.fillStyle = C_INK;
  g.font = `bold 24px ${FONT}`; g.fillText(sc, 12, 30);
  g.font = `bold 12px ${FONT}`; g.fillText('分', 15 + sw, 30);
  g.font = `bold 13px ${FONT}`; g.fillText(countText, 12, 48);
  g.font = `12px ${FONT}`; g.fillStyle = '#56616b'; g.fillText(big, 12, 64);
  // 下一个
  g.fillStyle = 'rgba(244,241,234,.86)';
  roundRect(g, W - 62, 4, 56, 64, 8); g.fill();
  g.textAlign = 'right'; g.font = `bold 11px ${FONT}`; g.fillStyle = '#56616b';
  g.fillText('下一个', W - 12, 16);
  if (next) {
    const pc = next.piece, k = Math.min(46 / (pc.maxX - pc.minX), 40 / (pc.maxY - pc.minY), 0.8);
    const cx = W - 34 - ((pc.minX + pc.maxX) / 2) * k, cy = 44 - ((pc.minY + pc.maxY) / 2) * k;
    drawShape(g, pc, cx, cy, 0, k);
  }
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// ===================================================================================================
// 界面、输入、主循环
// ===================================================================================================
function layout() {
  const app = $('app'), cs = getComputedStyle(app);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const availW = Math.min(app.clientWidth - padX, 480);
  const availH = app.clientHeight - padY - 56 - 8;
  const cssW = Math.max(200, Math.floor(Math.min(availW, (availH * W) / H)));
  const cssH = Math.floor((cssW * H) / W);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewScale = cssW / W;
  cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
  cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  $('stage').style.width = cssW + 'px'; $('stage').style.height = cssH + 'px';
  $('controls').style.width = cssW + 'px';
  drawHero();
}

// 标题页的小插画：几块拼在一起的中国地图局部
function drawHero() {
  const hc = $('hero');
  const cssW = Math.max(160, $('stage').clientWidth - 56), cssH = Math.round(cssW * 0.42);
  const d = Math.min(window.devicePixelRatio || 1, 2);
  hc.width = Math.round(cssW * d); hc.height = Math.round(cssH * d);
  hc.style.height = cssH + 'px';
  const g = hc.getContext('2d');
  const hw = 300, hh = 126, k = cssW / hw;
  g.setTransform(d * k, 0, 0, d * k, 0, 0);
  g.clearRect(0, 0, hw, hh);
  const items = [
    [[110000, 120000, 130000], 42, 52, -0.10],                  // 京津冀
    [[310000, 320000, 330000, 340000], 124, 60, 0.05],          // 长三角
    [[440000, 810000, 820000, 450000, 460000], 200, 66, -0.06], // 粤港澳 + 海南
    [[510000, 500000], 276, 46, 0.12],                          // 成渝
  ];
  for (const [codes, ax, ay, a] of items) {
    const pc = buildPiece(codes);
    let x = ax, y = ay;
    const f = Math.min(1, 74 / (pc.maxX - pc.minX), 96 / (pc.maxY - pc.minY));
    const ca = Math.cos(a), sa = Math.sin(a);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const c of pc.codes) for (const ring of PROV[c].pts) for (const [kx, ky] of ring) {
      const lx = (kx - pc.cx) * pc.s * f, ly = (ky - pc.cy) * pc.s * f;
      const rx = lx * ca - ly * sa, ry = lx * sa + ly * ca;
      x0 = Math.min(x0, rx); x1 = Math.max(x1, rx); y0 = Math.min(y0, ry); y1 = Math.max(y1, ry);
    }
    x = Math.max(3 - x0, Math.min(hw - 3 - x1, x));
    y = Math.max(3 - y0, Math.min(hh - 3 - y1, y));
    drawShape(g, pc, x, y, a, f);
    if (codes.length <= 2) drawLabels(g, pc, x, y, a, f, Math.max(9, 9.5 / k));
  }
}

function updateButtons() {
  const play = state === 'play';
  $('shuffle').hidden = state === 'over';
  $('shuffle').disabled = !play || shaking || !!finale;
  $('reset').hidden = state === 'over';
  $('reset').disabled = !play || !!finale;
  if (!play || finale) disarmReset();
  $('share').hidden = state !== 'over';
  $('retry').hidden = state !== 'over';
}

function startGame() {
  resetWorld();
  current = drawFromDeck();
  next = drawFromDeck();
  state = 'play';
  $('title').hidden = true;
  $('result').hidden = true;
  updateButtons();
}

function finish(kind, code) {
  if (state !== 'play') return;
  state = 'over';
  current = null;
  aiming = false;
  // 供离线检查：记下这一局是怎么结束的，以及当时箱内的状况（对玩法没有影响）
  lastFinish = {
    kind, code, simTime, dropped, score, round,
    pieces: pieces.length,
    biggest: pieces.reduce((m, b) => Math.max(m, b.piece.codes.length), 0),
    topY: pieces.reduce((m, b) => Math.min(m, b.bounds.min.y), FLOOR_Y),
  };
  const bg = bestEver;
  const bigName = bg ? bg.name : '-', bigN = bg ? bg.codes.length : 0;
  const head = $('r-head');
  head.textContent = kind === 'timeup' ? '时间到! 没能连成整幅中国地图' : `${PROV[code].name} 冒出了箱口`;
  head.className = 'r-head ng';
  $('r-count').textContent = String(dealt);
  $('r-score').textContent = score.toLocaleString('zh-CN');
  $('r-big').textContent = bg ? `${bigName} (${bigN}省)` : '-';
  const regs = REGIONS.filter((r) => completed.has(r.key)).map((r) => r.name);
  $('r-regions').textContent = regs.length ? regs.join('、') : '无';
  $('r-japan').hidden = !chinaCount;
  $('r-japan').textContent = chinaCount ? `中国地图 拼成: ${chinaCount} 次 (现在是第 ${round} 局)` : '';
  const text = `中国地图 拼成: ${chinaCount}次\n投放省份: ${dropped} / ${TOTAL}\n得分: ${score.toLocaleString('zh-CN')}分`;
  // 微博的分享入口会自己带上正文，所以链接在点下去的时候才拼（见下面的 share 处理）；
  // 同时在分享图里写上一份文字，图片分享到哪都带着成绩。
  endInfo = { kind, code, text, shareText: `${text}\n#${HASHTAG}${SHARE_URL ? `\n${SHARE_URL}` : ''}` };
  // 结果一出来就把分享链接指向微博（shareHref 是函数声明，会提升，这里可以直接用）。
  // 之前是等点击时才赋值，所以按钮在悬停/右键里显示的还是 "#"。
  $('share').href = shareHref(endInfo.shareText);
  makeShareImage(endInfo.shareText);
  lockResult();
  $('result').hidden = false;
  updateButtons();
}

// 分享图：以固定 1080 px 宽重绘最后这一帧，不加任何额外内容。
// 结果出现时才生成，因为 iOS 只在直接由点击触发的 navigator.share() 里才会弹出分享面板。
const SHARE_IMG_W = 1080, SHARE_IMG_H = Math.round((SHARE_IMG_W * H) / W);
const appShare = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.prefShare;
let shareData = null;
function makeShareImage(text) {
  shareData = null;
  const c = document.createElement('canvas');
  c.width = SHARE_IMG_W; c.height = SHARE_IMG_H;
  render(c.getContext('2d'), SHARE_IMG_W / W);
  const made = endInfo;
  // 拼成中国地图后，先把"拼成的那一刻"发出去，再发箱面
  const shots = chinaShot ? [chinaShot, c] : [c];
  Promise.all(shots.map((s) => new Promise((done) => s.toBlob(done, 'image/png')))).then((blobs) => {
    if (blobs.some((b) => !b) || endInfo !== made) return;   // 期间开了新的一局
    const box = blobs[blobs.length - 1];
    if (appShare) {
      const fr = new FileReader();
      fr.onload = () => { if (endInfo === made) shareData = { app: String(fr.result).split(',')[1], text }; };
      fr.readAsDataURL(box);
      return;
    }
    const files = blobs.map((b) => new File([b], b === box ? 'china-pack.png' : 'china-pack-map.png', { type: 'image/png' }));
    // 只在触屏设备上分享图片：PC 的系统分享面板一般没有微博，用链接更合适
    const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    if (!touch || !navigator.canShare) return;
    if (navigator.canShare({ files })) shareData = { files, text };
    else if (files.length > 1 && navigator.canShare({ files: [files[files.length - 1]] })) shareData = { files: [files[files.length - 1]], text };
  });
}

function aimAt(e) {
  const r = cv.getBoundingClientRect();
  hoverX = ((e.clientX - r.left) / r.width) * W;
  pointerTop = ((e.clientY - r.top) / r.height) * H < RIM_Y;
}
cv.addEventListener('pointerdown', (e) => {
  if (state !== 'play') return;
  aiming = true;
  try { cv.setPointerCapture(e.pointerId); } catch (_) { /* 忽略 */ }
  aimAt(e);
  e.preventDefault();
});
cv.addEventListener('pointermove', (e) => {
  if (state !== 'play') return;
  if (aiming || e.pointerType === 'mouse') aimAt(e);
});
cv.addEventListener('pointerup', (e) => {
  if (!aiming) return;
  aiming = false;
  aimAt(e);
  // 在箱口上方松手：不投放，方块留在原处
  if (!pointerTop) drop();
  if (e.pointerType !== 'mouse') pointerTop = false;
});
cv.addEventListener('pointercancel', () => { aiming = false; pointerTop = false; });
cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !aiming) pointerTop = false; });
$('start').addEventListener('click', startGame);
$('retry').addEventListener('click', () => { if (!resultLocked()) startGame(); });
$('shuffle').addEventListener('click', startShake);
// 重开：第一次只上膛（提示"再按一次"），3 秒内第二次按下才真正开始新的一局
const RESET_ARM_MS = 3000;
let resetTimer = 0;
function disarmReset() {
  clearTimeout(resetTimer); resetTimer = 0;
  $('reset').classList.remove('armed');
  $('reset-label').textContent = '重开一局';
}
$('reset').addEventListener('click', () => {
  if (state !== 'play' || finale) return;
  if (resetTimer) {
    disarmReset();
    startGame();
    return;
  }
  $('reset').classList.add('armed');
  $('reset-label').textContent = '再按一次';
  resetTimer = setTimeout(disarmReset, RESET_ARM_MS);
});
// 快速连点两次不该缩放页面
const DOUBLE_TAP_MS = 350;
let lastTouchEnd = -1e9;
const controls = $('controls');
document.addEventListener('touchend', (e) => {
  if (e.touches.length || e.changedTouches.length > 1) return;
  const t = e.timeStamp, quick = t - lastTouchEnd < DOUBLE_TAP_MS;
  lastTouchEnd = t;
  const onRow = controls.contains(e.target);
  if (!quick && !onRow) return;
  e.preventDefault();
  let el = e.target.closest && e.target.closest('button, a, .card');
  if (el && onRow) {
    const p = e.changedTouches[0], under = document.elementFromPoint(p.clientX, p.clientY);
    if (!under || under.closest('button, a') !== el) el = null;
  }
  if (el && !el.disabled && !el.classList.contains('wait')) el.click();
}, { passive: false });
controls.addEventListener('touchstart', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
controls.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', (e) => { if (controls.contains(e.target)) e.preventDefault(); });
// 结果卡片本身也是"再来一局"的按钮。刚开始的 1 秒内结果页不响应任何操作，
// 这样本来想投放或摇一摇的点击（"再来一局"出现在原来"摇一摇"的位置）不会跳过结果。
const RESULT_GUARD_MS = 1000;
let resultAt = 0, resultTimer = 0;
function setResultLock(on) {
  $('retry').disabled = on;
  $('share').classList.toggle('wait', on);
  $('share').setAttribute('aria-disabled', String(on));
}
function lockResult() {
  resultAt = performance.now();
  setResultLock(true);
  clearTimeout(resultTimer);
  resultTimer = setTimeout(() => setResultLock(false), RESULT_GUARD_MS);
}
const resultLocked = () => performance.now() - resultAt < RESULT_GUARD_MS;
$('result').querySelector('.card').addEventListener('click', () => {
  if (state === 'over' && !resultLocked()) startGame();
});
// ---- 分享 ----
// 原版分享到 X；大陆访问不了推特，所以这里改成微博的网页分享入口（实测返回「分享到微博」页面）。
// 三种情况分别处理：
//   1. 手机上系统分享面板能用（还能带成绩图）-> 走 navigator.share，这是体验最好的
//   2. 网页应用壳（iOS App）-> 交给壳自己弹分享
//   3. 其它情况 -> 成绩复制到剪贴板并给出提示，同时链接打开微博发布页
const WEIBO_SHARE = 'https://service.weibo.com/share/share.php';
function shareHref(text) {
  const params = new URLSearchParams({ title: text });
  if (SHARE_URL) params.set('url', SHARE_URL);
  return `${WEIBO_SHARE}?${params.toString()}`;
}
let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}
function copyText(text) {
  // navigator.clipboard 需要安全上下文：从 file:// 打开时它是 undefined，所以还要留一条老路
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, () => false);
    }
  } catch (_) { /* 落到下面的兜底 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand && document.execCommand('copy');
    document.body.removeChild(ta);
    return Promise.resolve(!!ok);
  } catch (_) {
    return Promise.resolve(false);
  }
}
$('share').addEventListener('click', (e) => {
  if (resultLocked()) { e.preventDefault(); return; }
  const text = (endInfo && endInfo.shareText) || '';
  // 手机上优先用系统分享面板（可以连成绩图一起发出去）
  if (shareData) {
    e.preventDefault();
    if (shareData.app) { appShare.postMessage({ image: shareData.app, text }); return; }
    navigator.share(shareData).catch(() => {});   // 关掉分享面板不算出错
    return;
  }
  // 收不了图：把成绩放进剪贴板再打开微博发布页，两个都能用
  const target = shareHref(text);
  copyText(text).then((ok) => toast(ok ? '成绩已复制，粘贴到微博即可' : '已打开微博，成绩请手动输入'));
  $('share').href = target;
});
window.addEventListener('resize', layout);

let lastTs = 0, acc = 0;
function frame(ts) {
  const dt = Math.min(100, lastTs ? ts - lastTs : STEP_MS);
  lastTs = ts;
  if (state === 'play') {
    acc += dt;
    let n = 0;
    while (acc >= STEP_MS && n < 4 && state === 'play') { step(); acc -= STEP_MS; n++; }
    if (n === 4) acc = 0;
  } else {
    acc = 0;
  }
  render();
  requestAnimationFrame(frame);
}

resetWorld();
layout();
updateButtons();
requestAnimationFrame(frame);

// 供离线检查使用（不影响游戏）
window.__cnPack = {
  PROV, REGIONS, ADJM, TOTAL, buildPiece, SIZE_K, BW, BH, W, H, RIM_Y, FLOOR_Y,
  DEAL_GROUPS, PIECE_COUNT, freshDeck,
  get state() { return state; },
  get pieces() { return pieces; },
  get score() { return score; },
  get dropped() { return dropped; },
  get dealt() { return dealt; },
  get round() { return round; },
  get chinaCount() { return chinaCount; },
  get current() { return current; },
  get timeUpAt() { return timeUpAt; },
  get simTime() { return simTime; },
  get endInfo() { return endInfo; },
  get lastFinish() { return lastFinish; },
  get shakeX() { return shakeX; },
  get shaking() { return shaking; },
  get simNow() { return simTime; },
  // 供离线检查：三面墙当前的横坐标（摇动是直接挪墙实现的，这里用来确认复位）
  get wallXs() {
    return {
      left: walls.left.position.x,
      right: walls.right.position.x,
      floor: walls.floor.position.x,
    };
  },
  // 供离线检查：三面墙应在的位置
  get wallBaseXs() { return { left: WALL_X0[0], right: WALL_X0[1], floor: W / 2 }; },
  setHoverX(x) { hoverX = x; },
  // 供离线检查：给定悬停 x，返回该方块会被放置到的原点
  hoverAt(x) { hoverX = x; return hoverPos(current.piece); },
  // 供离线检查：箱内哪些方块在物理上挨在一起（用各部件的包围盒近似，宽进严出）
  // 供离线检查：设定牌堆顺序、开关自由落点、开关"只发能接上的方块"的测试模式
  setDeck(codes) { deck = codes.slice(); if (deck.length) roundFirst = deck[0]; },
  get deck() { return deck ? deck.slice() : []; },
  setFreePlace(on) { freePlace = !!on; },
  setOrderedDeal(on) { setOrderedDeal(on); },
  get orderedDeal() { return orderedDeal; },
  get hoverX() { return hoverX; },
  // 供离线检查：给定悬停 x，返回游戏自己会算出把方块放到哪个原点（和 drop() 完全一致）
  hoverPosAt(x) { hoverX = x; return hoverPos(current.piece); },
  // 供离线检查：当前方块里某个省在方块本地方向上的锚点（世界单位，已经是该方块自己的比例尺）
  memberAnchor(code) {
    const p = current && current.piece.parts.find((q) => q.code === code);
    return p ? { x: p.lx, y: p.ly } : null;
  },
  // 供离线检查：当前方块放在某处时，和箱内别的方块最深的那次碰撞（深度 + 法线方向）
  //
  // 测试脚本会成千上万次调用这个（二分找落点），而每次 createBody 都要对合并块重新做一遍
  // 凸分解，非常慢。所以这里把临时刚体缓存起来，只在“手上换了一块新的”时重建。
  collisionAt(x, y) {
    const b = probeBody();
    if (b) Body.setPosition(b, { x, y });
    let deepest = null;
    if (b) {
      for (let i = 1; i < b.parts.length; i++) {
        const p = b.parts[i];
        for (const o of pieces) {
          for (let j = 1; j < o.parts.length; j++) {
            const q = o.parts[j];
            const c = Matter.Collision.collides(p, q);
            if (c && c.depth > 0 && (!deepest || c.depth > deepest.depth)) {
              deepest = { depth: c.depth, nx: c.normal.x, ny: c.normal.y };
            }
          }
        }
      }
    }
    return deepest || { depth: 0, nx: 0, ny: 0 };
  },
  // 供离线检查：把当前方块放在指定世界坐标（绕过箱体边界判断）
  placeAt(x, y) {
    freePlace = true;
    const b = createBody(current.piece, x, y);
    b.dropAt = simTime;
    // 和正常投放一样享受溢出豁免，否则测试摆位时会立刻被判出局
    b.entering = true;
    b.graceUntil = simTime + 2000;
    Composite.add(engine.world, b);
    pieces.push(b);
    dropped += current.codes.length;
    dealt++;
    lastDropAt = simTime;
    noteBest(b.piece);
    checkRegions(b.piece);
    if (!deck.length) timeUpAt = simTime + TIME_LIMIT_MS;
    current = null;
    probeFor = null;
    nextAt = simTime + DROP_WAIT;
    freePlace = false;
    return b;
  },
  adjLinksToBox: (unit) => adjLinksToBox(unit),
  setHoverY(y) { hoverY = y; },
  contactPairs() {
    const out = [];
    const parts = pieces.map((b) => ({ body: b, list: b.parts.slice(1) }));
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        let touch = false;
        for (const p of parts[i].list) {
          const pb = p.bounds;
          for (const q of parts[j].list) {
            const qb = q.bounds;
            if (qb.max.x < pb.min.x - 0.5 || qb.min.x > pb.max.x + 0.5) continue;
            if (qb.max.y < pb.min.y - 0.5 || qb.min.y > pb.max.y + 0.5) continue;
            touch = true; break;
          }
          if (touch) break;
        }
        if (touch) out.push([i, j]);
      }
    }
    return out;
  },
  // 供离线检查：调节方块整体大小、单省指数与合并块指数（重新开局后生效）
  setPieceScale(k) {
    SIZE_K = (SIZE_REF_SIDE * BW) / Math.pow(PROV[SIZE_REF_CODE].area, SIZE_EXP) * k;
    MERGE_K = (SIZE_REF_SIDE * BW) / Math.pow(PROV[SIZE_REF_CODE].area, MERGE_EXP) * k;
    bumpSizeGen();
  },
  setSizeModel(exp, mergeExp, k) {
    SIZE_EXP = exp; MERGE_EXP = mergeExp;
    SIZE_K = (SIZE_REF_SIDE * BW) / Math.pow(PROV[SIZE_REF_CODE].area, SIZE_EXP) * k;
    MERGE_K = (SIZE_REF_SIDE * BW) / Math.pow(PROV[SIZE_REF_CODE].area, MERGE_EXP) * k;
    bumpSizeGen();
  },
  // 供离线检查：直接放一整幅中国地图进箱子，用来验证完成演出和进入下一局。不影响玩法。
  forceChina() {
    const all = PROVS.map((p) => p[0]).sort((a, b) => a - b);
    const piece = buildPiece(all);
    const b = createBody(piece, W / 2, RIM_Y + BH * 0.5);
    Body.setVelocity(b, { x: 0, y: 0 });
    Composite.add(engine.world, b);
    pieces.push(b);
    startFinale(b);
    return piece.codes.length;
  },
  // 供离线检查：触发一次摇动（和点「摇一摇」等价）
  startShake,
  drop, startGame, step,
};
