import { Fluid } from '../src/physics.js';
import { MODEL, INITIAL_OBSTACLE, TOTAL_STEPS, evaluate } from '../src/experiment.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const cases = [
  ['baseline', null],
  ['initial', INITIAL_OBSTACLE],
  ['upper-route', { x: 0.68, y: 0.57, radius: 0.12 }],
  ['lower-route', { x: 0.68, y: 0.43, radius: 0.12 }],
];
const results = [];
let baseline;
for (const [name, obstacle] of cases) {
  const fluid = new Fluid(MODEL, obstacle);
  const start = performance.now();
  let maxDivergence = 0, maxMassError = 0;
  for (let n = 0; n < TOTAL_STEPS; n++) {
    fluid.step();
    if (n % 30 === 29) {
      const d = fluid.diagnostics();
      maxDivergence = Math.max(maxDivergence, d.divergence);
      maxMassError = Math.max(maxMassError, d.massError);
      assert.ok(d.finite && d.wallFlux === 0);
    }
  }
  const elapsedMs = performance.now() - start;
  const diagnostics = fluid.diagnostics();
  if (!baseline) baseline = diagnostics;
  const result = { name, obstacle, elapsedMs: Math.round(elapsedMs),
    msPerStep: +(elapsedMs / TOTAL_STEPS).toFixed(3), maxDivergence, maxMassError,
    diagnostics, comparison: evaluate(baseline, diagnostics) };
  results.push(result);
  console.log(JSON.stringify(result));
}
assert.ok(results[2].comparison.reached, '上方引流方案应有经过验证的有效解');
assert.ok(results[2].comparison.rate > results[3].comparison.rate + 0.08, '不同布局应产生有意义的取舍');
const folder = new URL('../output/verification/', import.meta.url);
await mkdir(folder, { recursive: true });
await writeFile(new URL('physics.json', folder), JSON.stringify({ model: MODEL, results }, null, 2));
console.log(`Physics evidence: ${fileURLToPath(new URL('physics.json', folder))}`);
