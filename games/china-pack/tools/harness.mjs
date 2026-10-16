/* Minimal browser stubs so the game bundle can run under Node for headless checks.
 * Shared by tools/verify.mjs, tools/verify-finale.mjs and tools/diag-outline.mjs. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_BUNDLE = path.join(HERE, 'game.node.js');

function makeCtx2d(canvas) {
  const noop = () => {};
  const grad = { addColorStop: noop };
  return {
    canvas,
    save: noop, restore: noop, translate: noop, rotate: noop, scale: noop, transform: noop,
    setTransform: noop, resetTransform: noop, clip: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, arc: noop, arcTo: noop, rect: noop, fill: noop, stroke: noop,
    fillRect: noop, clearRect: noop, strokeRect: noop, fillText: noop, strokeText: noop,
    setLineDash: noop, drawImage: noop,
    createLinearGradient: () => grad, createRadialGradient: () => grad, createPattern: () => null,
    measureText: (t) => ({ width: String(t).length * 8 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData: noop,
  };
}

export function makeEl(tag) {
  const el = {
    tagName: String(tag).toUpperCase(), style: {}, hidden: false, disabled: false,
    textContent: '', className: '', href: '', width: 300, height: 200,
    clientWidth: 420, clientHeight: 800,
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    addEventListener: () => {}, setAttribute: () => {}, appendChild: () => {}, remove: () => {},
    querySelector: () => makeEl('div'), contains: () => false, focus: () => {}, click: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: el.width, height: el.height }),
  };
  if (String(tag).toLowerCase() === 'canvas') {
    el.getContext = () => makeCtx2d(el);
    el.toBlob = (cb) => cb(null);
    el.setPointerCapture = () => {};
  }
  return el;
}

const IDS = ['app', 'stage', 'cv', 'title', 'result', 'controls', 'start', 'shuffle', 'reset', 'reset-icon',
  'reset-label', 'share', 'retry', 'hero', 'r-head', 'r-count', 'r-score', 'r-big', 'r-regions', 'r-japan'];

/* Load the game bundle in a VM context with stubs in place.
 * Returns { GP, sandbox, tick, setNow } where GP is the game's debug surface. */
export function loadGame({ bundle = DEFAULT_BUNDLE } = {}) {
  const elements = new Map(IDS.map((id) => [id, makeEl(id === 'cv' || id === 'hero' ? 'canvas' : 'div')]));
  elements.get('cv').width = 320; elements.get('cv').height = 546;

  const document = {
    getElementById: (id) => elements.get(id) || makeEl('div'),
    createElement: (tag) => makeEl(tag),
    addEventListener: () => {},
    querySelector: () => makeEl('div'),
    elementFromPoint: () => null,
  };

  const clock = { now: 0 };
  const sandbox = {
    console, document, window: null,
    navigator: { share: () => Promise.resolve(), canShare: () => false },
    performance: { now: () => clock.now },
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    setTimeout: (fn) => { fn(); return 0; }, clearTimeout: () => {},
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {}, removeEventListener: () => {},
    devicePixelRatio: 1,
    getComputedStyle: () => ({ paddingLeft: '0px', paddingRight: '0px', paddingTop: '0px', paddingBottom: '0px' }),
    Path2D: class { moveTo() {} lineTo() {} closePath() {} },
    URLSearchParams, File: class {}, FileReader: class { readAsDataURL() {} }, Image: class {},
    Math, JSON, Date, Object, Array, String, Number, Boolean, Set, Map, Promise, Error,
    isNaN, parseInt, parseFloat,
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;

  vm.runInContext(fs.readFileSync(bundle, 'utf8'), vm.createContext(sandbox), { filename: 'game.node.js' });

  const STEP = 1000 / 60;
  let frames = 0;
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) { clock.now += STEP; sandbox.window.__cnPack.step(); frames++; }
  };
  return { GP: sandbox.window.__cnPack, sandbox, tick, STEP, frames: () => frames };
}
