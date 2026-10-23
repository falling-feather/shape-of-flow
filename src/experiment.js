/** The single definition of the prototype's model, input schedule and replay format. */
export const FORMAT = 'shape-of-flow/1';
export const SOLVER_REVISION = 'mac-viscous-2';
export const MODEL = Object.freeze({
  nx: 80, ny: 50, width: 1.6, height: 1,
  dt: 1 / 120, duration: 8, viscosity: 0.0008,
  inletSpeed: 0.65, inletRamp: 0.5, pressureTolerance: 2e-7, pressureIterations: 160,
  sourceMin: 0.43, sourceMax: 0.57,
  gateMin: 0.10, gateMax: 0.40,
  snapshotEvery: 4,
});
export const INITIAL_OBSTACLE = Object.freeze({ x: 0.68, y: 0.30, radius: 0.12 });
export const GOAL = Object.freeze({ gain: 0.08, throughput: 0.40 });
export const TOTAL_STEPS = Math.round(MODEL.duration / MODEL.dt);
export const SOURCE_PULSES = Object.freeze(Array.from({ length: 6 }, (_, i) =>
  Object.freeze([+(0.5 + i * 1.3).toFixed(2), +Math.min(7.5, 1.35 + i * 1.3).toFixed(2)])));

/** Fixed, dimensionless simulation times. No wall-clock time or randomness enters physics. */
export function sourceFraction(time, dt) {
  return SOURCE_PULSES.reduce((sum, [begin, end]) => sum + Math.max(0, Math.min(time + dt, end) - Math.max(time, begin)), 0) / dt;
}

export function validObstacle(obstacle) {
  return obstacle !== null && typeof obstacle === 'object'
    && Number.isFinite(obstacle.x) && Number.isFinite(obstacle.y)
    && obstacle.radius === INITIAL_OBSTACLE.radius
    && obstacle.x >= 0.35 && obstacle.x <= 1.12
    && obstacle.y >= 0.20 && obstacle.y <= 0.80;
}

export function makePlan(obstacle = INITIAL_OBSTACLE, step = TOTAL_STEPS, display = { dye: true, lines: true }) {
  if (!validObstacle(obstacle)) throw new Error('阻片需位于有效区内，半径固定为 0.12。');
  if (!Number.isInteger(step) || step < 0 || step > TOTAL_STEPS || step % MODEL.snapshotEvery !== 0) throw new Error('观察时刻需为本实验范围内的记录步。');
  if (typeof display?.dye !== 'boolean' || typeof display?.lines !== 'boolean') throw new Error('展示选项无效。');
  return { format: FORMAT, solver: SOLVER_REVISION, experiment: 'around-flow',
    model: { ...MODEL }, sourcePulses: SOURCE_PULSES.map(interval => [...interval]),
    obstacle: { ...obstacle }, step, display: { ...display } };
}

export function readPlan(text) {
  if (typeof text !== 'string' || text.length > 20000) throw new Error('方案需为不超过 20 KB 的 JSON 文本。');
  let plan;
  try { plan = JSON.parse(text); } catch { throw new Error('方案不是有效的 JSON。'); }
  if (plan?.format !== FORMAT || plan?.solver !== SOLVER_REVISION || plan?.experiment !== 'around-flow') {
    throw new Error('方案格式或求解器版本不兼容，请使用当前绕流原型导出的文件。');
  }
  if (!plan.model || Object.entries(MODEL).some(([key, value]) => plan.model[key] !== value)) {
    throw new Error('网格、输入或求解参数不同，不能作为本实验的同条件方案载入。');
  }
  if (JSON.stringify(plan.sourcePulses) !== JSON.stringify(SOURCE_PULSES)) throw new Error('注染时程不同，不能作为本实验的同条件方案载入。');
  return makePlan(plan.obstacle, plan.step, plan.display ?? null);
}

export function evaluate(baseline, trial) {
  if (!baseline || !trial || baseline.step !== trial.step) return { valid: false, reason: '请比较同一模拟时刻。' };
  if (baseline.injected <= 0 || trial.injected <= 0) return { valid: false, reason: '尚无示踪剂输入。' };
  if (![baseline, trial].every(s => s.finite && s.divergence < 0.002 && s.massError < 0.00001 && s.wallFlux < 1e-12)) {
    return { valid: false, reason: '计算诊断未通过，本次结果不参与目标判断。' };
  }
  const baselineRate = baseline.gateOut / baseline.injected;
  const rate = trial.gateOut / trial.injected;
  const throughput = trial.outflow / trial.injected;
  const gain = rate - baselineRate;
  return { valid: true, baselineRate, rate, gain, throughput,
    reached: gain >= GOAL.gain && throughput >= GOAL.throughput };
}
