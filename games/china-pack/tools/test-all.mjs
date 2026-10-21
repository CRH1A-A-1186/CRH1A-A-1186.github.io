/* Run the whole verification suite.
 *
 * Each verifier is a separate process that only reads the built bundle, so they run in parallel.
 * The slow ones take broad measurements by default; pass --quick to run them against a smaller
 * sample when iterating, or --full to have them scan exhaustively.
 *
 * Run: node tools/test-all.mjs [--quick|--full] [--only=verify,verify-islands]
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;

const ALL = [
  { name: 'verify', time: 'few s', what: 'pack, adjacency, regions, merge rules, difficulty' },
  { name: 'verify-standard-map', time: '~20 s', what: '标准地图：岛屿、四极、争议段、国界界标、铺满' },
  { name: 'verify-deadlock', time: 'few s', what: '京津冀 / 粤港澳 grouping' },
  { name: 'verify-islands', time: '~1 min', what: 'strait crossings actually merge' },
  { name: 'verify-shake', time: 'few s', what: 'a shake never leaks into the next round' },
  { name: 'verify-testmode', time: '~1 min', what: 'ordered deal + size knobs' },
  { name: 'verify-finale', time: '~10 s', what: 'finale and round advance' },
  { name: 'verify-winnable', time: '~1 min', what: 'how far a mergeable chain reaches' },
  { name: 'stress-physics', time: '~2 min', what: '48 rounds, no engine crashes' },
  { name: 'diag-outline', time: 'few s', what: 'collision outline deviation' },
];

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const full = args.includes('--full');
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.split('=')[1].split(',') : null;

const todo = ALL.filter((t) => !only || only.includes(t.name));
const extra = [];
if (quick) extra.push('--quick');
if (full) extra.push('--full');

console.log(`running ${todo.length} verifiers in parallel${quick ? ' (quick)' : full ? ' (full)' : ''}`);
console.log(todo.map((t) => `  ${t.name.padEnd(18)} ${t.time.padEnd(7)} ${t.what}`).join('\n'));
console.log('');

const started = Date.now();
const results = await Promise.all(todo.map((t) => new Promise((resolve) => {
  const child = spawn(NODE, [path.join(HERE, `${t.name}.mjs`), ...extra], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  child.on('close', (code) => resolve({ ...t, code, out, err, ms: Date.now() - started }));
})));

let failed = 0;
for (const r of results) {
  const ok = r.code === 0;
  if (!ok) failed++;
  const tail = (r.out.trim().split('\n').pop() || '').trim() || '(no output)';
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(18)} ${(r.ms / 1000).toFixed(1).padStart(6)}s  ${tail}`);
  if (!ok) {
    // show the failing detail lines, which the verifiers prefix with two spaces and "!!"
    const lines = r.out.split('\n').filter((l) => l.includes('!!') || l.includes('problem'));
    for (const l of lines.slice(0, 8)) console.log(`        ${l.trim()}`);
    if (r.err.trim()) console.log(`        stderr: ${r.err.trim().split('\n').slice(-3).join(' | ')}`);
  }
}
console.log(`\n${results.length - failed}/${results.length} passed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
process.exit(failed ? 1 : 0);
