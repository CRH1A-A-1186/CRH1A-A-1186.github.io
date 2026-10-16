// Concatenate the third-party libraries, the generated province pack and the game source into
// one classic script, so index.html works straight from file:// with no bundler and no CDN.
//
// Input : src/vendor/matter.min.js, src/vendor/poly-decomp.min.js, src/pack-data.js, src/game.js
// Output: game.js              (loaded by index.html)
//         tools/game.node.js   (the same code, for the headless checks)
//
// Run: node tools/bundle.mjs      (from the china-pack directory)
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const matter = read('src/vendor/matter.min.js');
const decomp = read('src/vendor/poly-decomp.min.js');
const pack = read('src/pack-data.js');
let game = read('src/game.js');

// splice the generated data block into the game source
const begin = game.indexOf('/*PACK-BEGIN*/');
const end = game.indexOf('/*PACK-END*/');
if (begin < 0 || end < 0) throw new Error('PACK markers missing from src/game.js');
game = game.slice(0, begin) + pack.trim() + game.slice(end + '/*PACK-END*/'.length);

const header = `/*!
 * 中国省份游戏 (China Province Pack)
 * 移植自 https://sns.dopagamelab.com/pref-pack/ (都道府県ゲーム, by dopagamelab)
 *
 * 打包顺序：
 *   matter-js 0.19.0 (MIT, (c) Liam Brummitt and contributors)  二维物理
 *   poly-decomp 0.3.0 (MIT, (c) 2013 Stefan Hedman)             凹多边形分解
 *   省级行政区轮廓：DataV.GeoAtlas，由 tools/build-pack.mjs 转换到公里坐标系
 *   游戏代码：本移植版
 *
 * 本文件由 tools/bundle.mjs 生成，请修改 src/ 下的源文件。
 */
`;
const out = `${header}${matter}\n${decomp}\n${game}`;
fs.writeFileSync('game.js', out, 'utf8');
console.log('wrote game.js', out.length, 'bytes');

// Node-side bundle for the headless checks in tools/*.mjs
fs.writeFileSync('tools/game.node.js', `${matter}\n${decomp}\n${game}`, 'utf8');
console.log('wrote tools/game.node.js', fs.statSync('tools/game.node.js').size, 'bytes');
