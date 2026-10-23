import { Fluid } from '../src/physics.js';
import { MODEL, evaluate } from '../src/experiment.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const results = [];
for (const [name, config] of [
  ['coarser-grid', { ...MODEL, nx: 64, ny: 40 }],
  ['half-time-step', { ...MODEL, dt: MODEL.dt / 2 }],
]) {
  const pair = [];
  for (const obstacle of [null, { x: 0.68, y: 0.57, radius: 0.12 }]) {
    const f = new Fluid(config, obstacle), start = performance.now();
    for (let n = 0; n < Math.round(config.duration / config.dt); n++) f.step();
    pair.push({ ...f.diagnostics(), elapsedMs: Math.round(performance.now() - start) });
  }
  const result = { name, nx: config.nx, ny: config.ny, dt: config.dt, pair, comparison: evaluate(pair[0], pair[1]) };
  assert.ok(result.comparison.valid && result.comparison.reached);
  results.push(result); console.log(JSON.stringify(result));
}
const alternative = new Fluid(MODEL, { x: 0.9, y: 0.58, radius: 0.12 });
for (let n = 0; n < Math.round(MODEL.duration / MODEL.dt); n++) alternative.step();
const d = alternative.diagnostics();
const production = JSON.parse(await readFile(new URL('../output/verification/physics.json', import.meta.url), 'utf8'));
assert.deepEqual(production.model, MODEL, '请先运行 npm run verify 生成当前配置的基准统计');
assert.ok(evaluate(production.results.find(result => result.name === 'baseline').diagnostics, d).reached);
results.push({ name: 'second-valid-layout', obstacle: alternative.obstacle, diagnostics: d });
console.log(JSON.stringify(results.at(-1)));
await mkdir(new URL('../output/verification/', import.meta.url), { recursive: true });
await writeFile(new URL('../output/verification/sensitivity.json', import.meta.url), JSON.stringify(results, null, 2));
