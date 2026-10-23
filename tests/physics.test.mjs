import test from 'node:test';
import assert from 'node:assert/strict';
import { Fluid } from '../src/physics.js';
import { MODEL, makePlan, readPlan, evaluate, SOURCE_PULSES, sourceFraction } from '../src/experiment.js';

const small = { ...MODEL, nx: 32, ny: 20, pressureIterations: 240 };
function run(fluid, steps) { for (let n = 0; n < steps; n++) fluid.step(); return fluid; }

test('静止场没有输入时不产生运动或染料', () => {
  const f = run(new Fluid({ ...small, inletSpeed: 0 }), 120);
  assert.ok(f.u.every(v => v === 0));
  assert.ok(f.v.every(v => v === 0));
  assert.equal(f.diagnostics().remaining, 0);
});

test('压力投影降低散度，圆形固体的面通量为零', () => {
  const f = new Fluid({ ...small, inletSpeed: 0 }, { x: 0.68, y: 0.56, radius: 0.12 });
  f.u.forEach((_, i) => { f.u[i] = Math.sin(i * 1.93) * 0.1; });
  f.v.forEach((_, i) => { f.v[i] = Math.cos(i * 0.77) * 0.1; });
  f.enforceBoundaries(0);
  const before = f.divergenceNorm();
  f.project();
  assert.ok(f.divergenceNorm() < before * 0.0001);
  assert.equal(f.diagnostics().wallFlux, 0);
});

test('黏性扩散降低内部振荡速度的能量', () => {
  const f = new Fluid({ ...small, inletSpeed: 0 });
  f.u.forEach((_, i) => { f.u[i] = Math.sin(i * 1.7) * 0.01; });
  f.enforceBoundaries(0);
  const energy = () => f.u.reduce((s, v) => s + v * v, 0) + f.v.reduce((s, v) => s + v * v, 0);
  const before = energy();
  f.diffuseVelocity();
  assert.ok(energy() < before);
});

test('平行通道已发展流保持解析抛物线剖面', () => {
  const f = new Fluid(small);
  f.stepCount = 120;
  for (let j = 0; j < f.ny; j++) for (let i = 0; i <= f.nx; i++) {
    const y = (j + 0.5) * f.h;
    f.u[j * (f.nx + 1) + i] = MODEL.inletSpeed * 4 * y * (1 - y);
  }
  run(f, 120);
  let error = 0, reference = 0;
  for (let j = 0; j < f.ny; j++) {
    const y = (j + 0.5) * f.h, expected = MODEL.inletSpeed * 4 * y * (1 - y);
    const actual = f.u[j * (f.nx + 1) + Math.floor(f.nx / 2)];
    error += (actual - expected) ** 2; reference += expected ** 2;
  }
  assert.ok(Math.sqrt(error / reference) < 0.02);
});

test('开放域示踪收支闭合，固体内无染料，不靠清零掩盖损失', () => {
  const f = run(new Fluid(small, { x: 0.68, y: 0.56, radius: 0.12 }), 600);
  const d = f.diagnostics();
  assert.ok(d.injected > 0 && d.outflow > 0);
  assert.ok(d.massError < 1e-10, JSON.stringify(d));
  assert.ok(d.finite && d.divergence < 0.002);
  assert.ok(f.dye.every((v, i) => v >= -1e-10 && (f.solid[i] === 0 || v === 0)));
});

test('相同初态和步数重复一致，边界布局能改变染料场', () => {
  const obstacle = { x: 0.68, y: 0.56, radius: 0.12 };
  const a = run(new Fluid(small, obstacle), 360);
  const b = run(new Fluid(small, obstacle), 360);
  const c = run(new Fluid(small), 360);
  assert.deepEqual(a.dye, b.dye);
  assert.deepEqual(a.u, b.u);
  const difference = a.dye.reduce((s, v, i) => s + Math.abs(v - c.dye[i]), 0);
  assert.ok(difference > 1);
});

test('方案严格往返，并拒绝非有限几何、不同模型和无效时刻', () => {
  const plan = makePlan({ x: 0.68, y: 0.56, radius: 0.12 }, 240);
  assert.deepEqual(readPlan(JSON.stringify(plan)), plan);
  assert.throws(() => readPlan(JSON.stringify({ ...plan, obstacle: { x: null, y: 0.5, radius: 0.12 } })));
  assert.throws(() => readPlan(JSON.stringify({ ...plan, model: { ...plan.model, dt: 0.1 } })));
  assert.throws(() => makePlan(plan.obstacle, -1));
  assert.throws(() => readPlan(JSON.stringify({ ...plan, display: undefined })));
  assert.throws(() => readPlan(JSON.stringify({ ...plan, sourcePulses: [] })));
});

test('不同网格和时间步使用同一积分注染量', () => {
  const flux = [];
  for (const ny of [20, 40, 50]) {
    const f = new Fluid({ ...MODEL, nx: ny * 1.6, ny });
    flux.push(f.sourceWeights.reduce((sum, weight, j) => sum + weight * f.inletProfile[j] * f.h, 0));
  }
  assert.ok(Math.max(...flux) - Math.min(...flux) < 1e-14);
  const expected = SOURCE_PULSES.reduce((sum, [a, b]) => sum + b - a, 0);
  for (const dt of [1 / 120, 1 / 240]) {
    let integrated = 0;
    for (let step = 0; step < Math.round(MODEL.duration / dt); step++) integrated += sourceFraction(step * dt, dt) * dt;
    assert.ok(Math.abs(integrated - expected) < 1e-11);
  }
});

test('未注染、诊断异常和不同时刻均不能算作目标成功', () => {
  const d = { step: 960, finite: true, divergence: 0, massError: 0, wallFlux: 0, injected: 1, outflow: 0.7, gateOut: 0.4 };
  assert.equal(evaluate({ ...d, gateOut: 0.1 }, d).reached, true);
  assert.equal(evaluate({ ...d, injected: 0 }, d).valid, false);
  assert.equal(evaluate(d, { ...d, divergence: 1 }).valid, false);
  assert.equal(evaluate(d, { ...d, step: 200 }).valid, false);
});
