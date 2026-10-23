import { Fluid } from './physics.js';
import { MODEL, TOTAL_STEPS, validObstacle } from './experiment.js';

let job = null;
let timer;
function tick() {
  if (!job || job.paused) return;
  const active = job;
  try {
    const until = Math.min(active.until, active.fluid.stepCount + MODEL.snapshotEvery);
    while (active.fluid.stepCount < until) active.fluid.step();
    const snapshot = active.fluid.snapshot();
    const complete = active.fluid.stepCount >= active.until;
    const computeMs = performance.now() - active.started;
    postMessage({ type: 'snapshot', id: active.id, kind: active.kind, snapshot, complete, computeMs },
      [snapshot.dye.buffer, snapshot.u.buffer, snapshot.v.buffer, snapshot.solid.buffer]);
    if (complete) { active.paused = true; return; }
    const target = active.started + (active.fluid.stepCount + MODEL.snapshotEvery) * MODEL.dt * 1000;
    timer = setTimeout(tick, active.realtime ? Math.max(0, target - performance.now()) : 0);
  } catch (error) {
    active.paused = true;
    postMessage({ type: 'error', id: active.id, message: error.message });
  }
}

onmessage = ({ data }) => {
  clearTimeout(timer);
  if (data.type === 'run') {
    if (data.obstacle !== null && !validObstacle(data.obstacle)) {
      postMessage({ type: 'error', id: data.id, message: '阻片超出有效区。' }); return;
    }
    job = { id: data.id, kind: data.kind, fluid: new Fluid(MODEL, data.obstacle),
      until: Math.min(TOTAL_STEPS, Math.max(0, data.until ?? TOTAL_STEPS)),
      started: performance.now(), paused: false, realtime: data.realtime !== false };
    tick();
  } else if (job && data.id === job.id) {
    if (data.type === 'pause') job.paused = true;
    if (data.type === 'resume') {
      job.paused = false;
      job.started = performance.now() - job.fluid.time * 1000;
      tick();
    }
  }
};
