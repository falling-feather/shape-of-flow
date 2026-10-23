import { Fluid } from './physics.js';
import { Renderer } from './renderer.js';
import { MODEL, INITIAL_OBSTACLE, TOTAL_STEPS, GOAL, validObstacle, makePlan, readPlan, evaluate } from './experiment.js';

const $ = id => document.getElementById(id);
const renderer = new Renderer($('flow-canvas'));
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
const cache = { A: [], B: [] };
const empty = new Fluid().snapshot();
const LOCAL_KEY = 'shape-of-flow/plan';
let stage = 'intro', view = 'A', running = false, id = 0, activeKind = 'A';
let index = 0, obstacle = { ...INITIAL_OBSTACLE }, restoring = null, exportData = null;
let dragging = false, previewPoint = null, toastTimer;
let failure = null;

function toast(message) {
  const parent = document.querySelector('dialog[open]') || document.body;
  parent.append($('toast'));
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}
function pause() {
  worker.postMessage({ type: 'pause', id }); running = false; update();
}
function start(kind, until = TOTAL_STEPS, realtime = true) {
  cache[kind] = [new Fluid(MODEL, kind === 'A' ? null : obstacle).snapshot()];
  if (kind === 'A') cache.B = [];
  activeKind = kind; view = kind; stage = kind === 'A' ? 'baseline' : 'trial';
  index = 0; running = true; previewPoint = null; failure = null;
  worker.postMessage({ type: 'run', id: ++id, kind, obstacle: kind === 'A' ? null : { ...obstacle }, until, realtime });
  update();
}
function enterEdit() {
  worker.postMessage({ type: 'pause', id });
  id++; running = false; restoring = null; failure = null; stage = 'edit'; view = 'B'; cache.B = [];
  index = Math.max(0, cache.A.length - 1); previewPoint = null; update();
}
function selectedFrame() {
  if (stage === 'edit' && view === 'B') return cache.A.at(-1) || empty;
  return cache[view][index] || cache[activeKind][index] || cache.A.at(-1) || empty;
}
function comparisonFrames() {
  const trial = cache.B[index];
  return { trial, baseline: trial && cache.A.find(frame => frame.diagnostics.step === trial.diagnostics.step) };
}
function update() {
  const frame = selectedFrame(), d = frame.diagnostics;
  renderer.setFrame(frame, stage === 'edit' && view === 'B' ? { ...(previewPoint || obstacle), valid: !previewPoint || validObstacle(previewPoint) } : null);
  $('flow-canvas').classList.toggle('editable', stage === 'edit' && view === 'B');
  $('view-a').classList.toggle('selected', view === 'A'); $('view-a').setAttribute('aria-pressed', String(view === 'A'));
  $('view-b').classList.toggle('selected', view === 'B'); $('view-b').setAttribute('aria-pressed', String(view === 'B'));
  $('view-b').disabled = stage !== 'edit' && cache.B.length === 0;
  $('run-status').classList.toggle('running', running);
  $('run-status').textContent = failure ? '计算异常' : running ? `${restoring ? '重算' : '试流'}中 · ${activeKind}` : stage === 'intro' ? '等待开始' : stage === 'edit' ? '边界编辑中' : stage === 'compare' ? '同条件对照' : '已暂停';
  $('time-label').textContent = `t = ${d.time.toFixed(2)} / ${MODEL.duration.toFixed(2)}`;
  $('timeline-value').textContent = d.time.toFixed(2);
  const available = cache.B.length > 0 ? cache.B.length : cache.A.length;
  $('time-slider').max = Math.max(0, available - 1); $('time-slider').value = index;
  $('time-slider').disabled = Boolean(failure) || running || stage === 'intro' || stage === 'edit' || available < 2;
  $('edit-controls').hidden = stage !== 'edit';
  $('obstacle-x').value = obstacle.x; $('obstacle-y').value = obstacle.y;
  $('obstacle-position').textContent = `(${obstacle.x.toFixed(2)}, ${obstacle.y.toFixed(2)})`;
  const primary = failure ? failure.reload ? '重新载入' : '从起点重试' : running ? '暂停试流' : stage === 'intro' ? '开始基准试流' : stage === 'edit' ? '从起点试流 B' : stage === 'compare' ? '调整边界再试' : '继续试流';
  $('primary-text').textContent = primary; $('primary-icon').textContent = running ? 'Ⅱ' : stage === 'compare' ? '↻' : '▶';
  $('reset-button').disabled = stage === 'intro' || stage === 'edit';
  $('reset-button').title = `从起点重跑 ${activeKind}`;
  $('reset-button').setAttribute('aria-label', `从起点重跑 ${activeKind}`);
  $('edit-button').hidden = running || stage !== 'trial';
  $('save-button').disabled = Boolean(failure) || view !== 'B' || stage === 'edit' || running || cache.B.length < 2 || !frame.obstacle;
  const ordinal = { intro: 0, baseline: 0, edit: 1, trial: 2, compare: 3 }[stage];
  document.querySelectorAll('.steps li').forEach((li, n) => {
    li.classList.toggle('current', n === ordinal); li.classList.toggle('done', n < ordinal);
  });
  const instructions = {
    intro: '先观察一段基准流动。随后，你将得到一块可以移动的阻片。',
    baseline: running ? '观察没有阻片时，染料怎样通过画场。基准完成后将开放边界编辑。' : '基准已暂停；可以继续，也可以从起点重新观察。',
    edit: '拖动阻片或使用下方滑杆。虚线是待确认边界，背景仍是基准 A；确认后从起点重算。',
    trial: running ? '这次只改变了阻片。观察流动怎样绕行；你可以随时暂停查看。' : '已暂停。可以继续、回看时间轴，或点击“调整边界”建立新运行；↻ 从起点重跑同一方案。',
    compare: '切换 A / B 比较同一时刻。你可以继续调整，也可以保存这次流动。',
  };
  $('instruction').querySelector('p').textContent = failure ? `计算异常：${failure.message} 本次结果不参与评价。` : restoring ? '正在用保存的条件重新计算。计算完成后，将恢复原方案的观察时刻。' : instructions[stage];
  $('instruction-mark').textContent = ['①', '②', '③', '④'][ordinal];
  $('field-caption').textContent = stage === 'edit' && view === 'B' ? '边界预览 · 背景为基准 A' : `${view === 'A' ? '基准 A · 无阻片' : '方案 B · 静态阻片'} · 固定输入时程`;
  $('comparison').hidden = Boolean(failure) || cache.B.length < 2 || stage === 'edit';
  if (!$('comparison').hidden) {
    const { trial, baseline } = comparisonFrames();
    const result = evaluate(baseline?.diagnostics, trial?.diagnostics);
    if (result.valid) {
      $('baseline-rate').textContent = `${(result.baselineRate * 100).toFixed(1)}%`;
      $('trial-rate').textContent = `${(result.rate * 100).toFixed(1)}%`;
      $('gain-badge').textContent = `${result.gain >= 0 ? '+' : ''}${(result.gain * 100).toFixed(1)} pp`;
      $('gain-badge').classList.toggle('negative', result.gain < 0);
      const completed = trial.diagnostics.step === TOTAL_STEPS;
      $('result-title').textContent = !completed ? '观察这一刻的分配' : result.reached ? '你为流动打开了另一条路。' : '边界变了，还可以再试一次。';
      $('result-detail').textContent = `总通过量 ${(result.throughput * 100).toFixed(1)}%。${!completed ? `目标在 t = ${MODEL.duration.toFixed(2)} 时判断。` : result.reached ? '上侧到达量与通过量均达到本次目标。' : result.throughput < GOAL.throughput ? '先给主流留下足够的通路。' : '试着改变阻片上下两侧的空间分配。'}`;
    } else {
      $('baseline-rate').textContent = '—'; $('trial-rate').textContent = '—'; $('gain-badge').textContent = '—';
      $('result-title').textContent = '继续观察'; $('result-detail').textContent = result.reason;
    }
  }
  $('diag-divergence').textContent = `${d.projectionBefore.toExponential(1)} → ${d.divergence.toExponential(1)}`;
  $('diag-mass').textContent = d.massError.toExponential(2);
  $('diag-wall').textContent = d.wallFlux.toExponential(1);
}

worker.onmessage = ({ data }) => {
  if (data.id !== id) return;
  if (data.type === 'error') { running = false; failure = { message: data.message, reload: false }; update(); return; }
  const frames = cache[data.kind];
  if (frames.at(-1)?.diagnostics.step !== data.snapshot.diagnostics.step) frames.push(data.snapshot);
  index = frames.length - 1;
  if (data.complete) {
    running = false;
    if (data.kind === 'A') {
      if (restoring) { start('B', restoring.step, false); return; }
      enterEdit(); toast('基准已记录。现在，安排你的第一块阻片。'); return;
    }
    stage = 'compare'; restoring = null;
  }
  update();
};
worker.onerror = event => { running = false; failure = { message: event.message || '请通过本地 HTTP 服务打开作品。', reload: true }; update(); };

$('primary-button').onclick = () => {
  if (failure) { if (failure.reload) location.reload(); else start(activeKind); return; }
  if (running) { pause(); return; }
  if (stage === 'intro') start('A');
  else if (stage === 'edit') start('B');
  else if (stage === 'compare') enterEdit();
  else { running = true; worker.postMessage({ type: 'resume', id }); index = cache[activeKind].length - 1; update(); }
};
$('reset-button').onclick = () => {
  restoring = null; start(activeKind);
};
$('edit-button').onclick = () => enterEdit();
for (const kind of ['A', 'B']) $(`view-${kind.toLowerCase()}`).onclick = () => { view = kind; update(); };
$('time-slider').oninput = event => { index = Number(event.target.value); update(); };
for (const axis of ['x', 'y']) $(`obstacle-${axis}`).oninput = event => {
  if (stage !== 'edit') return;
  const next = { ...obstacle, [axis]: Number(event.target.value) };
  if (validObstacle(next)) { obstacle = next; update(); }
};

function moveObstacle(event, commit) {
  if (stage !== 'edit' || view !== 'B') return;
  const point = renderer.point(event.clientX, event.clientY);
  previewPoint = { x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100, radius: obstacle.radius };
  if (validObstacle(previewPoint)) { obstacle = previewPoint; previewPoint = null; }
  else if (commit) { previewPoint = null; toast('请把阻片放在有效区：水平 0.35—1.12，上下 0.20—0.80。'); }
  update();
}
$('flow-canvas').onpointerdown = event => {
  if (stage !== 'edit' || view !== 'B') return;
  dragging = true; $('flow-canvas').setPointerCapture(event.pointerId); $('flow-canvas').focus();
  $('flow-canvas').classList.add('dragging'); moveObstacle(event, false);
};
$('flow-canvas').onpointermove = event => { if (dragging) moveObstacle(event, false); };
$('flow-canvas').onpointerup = event => {
  if (!dragging) return; dragging = false;
  $('flow-canvas').classList.remove('dragging'); moveObstacle(event, true);
};
$('flow-canvas').onpointercancel = () => { dragging = false; previewPoint = null; update(); };
$('flow-canvas').onkeydown = event => {
  if (stage !== 'edit' || view !== 'B' || !event.key.startsWith('Arrow')) return;
  event.preventDefault();
  const amount = event.shiftKey ? 0.05 : 0.01;
  const next = { ...obstacle };
  if (event.key === 'ArrowLeft') next.x -= amount;
  if (event.key === 'ArrowRight') next.x += amount;
  if (event.key === 'ArrowUp') next.y -= amount;
  if (event.key === 'ArrowDown') next.y += amount;
  next.x = Math.round(next.x * 100) / 100; next.y = Math.round(next.y * 100) / 100;
  if (validObstacle(next)) { obstacle = next; update(); }
};
for (const [button, property] of [['layer-dye', 'showDye'], ['layer-lines', 'showLines']]) {
  $(button).onclick = () => {
    renderer[property] = !renderer[property]; $(button).classList.toggle('active', renderer[property]);
    $(button).setAttribute('aria-pressed', String(renderer[property])); renderer.draw();
  };
}
$('diagnostics-button').onclick = () => { $('diagnostics-panel').hidden = !$('diagnostics-panel').hidden; };
$('about-button').onclick = () => $('about-dialog').showModal();
$('load-button').onclick = () => { $('load-error').textContent = ''; $('load-dialog').showModal(); };
document.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => $(button.dataset.close).close(); });

$('save-button').onclick = () => {
  const frame = selectedFrame();
  if (running || stage === 'edit' || view !== 'B' || !frame.obstacle) return;
  const artworkId = `FLOW-${Date.now().toString(36).toUpperCase()}`;
  const plan = { ...makePlan(obstacle, frame.diagnostics.step, { dye: renderer.showDye, lines: renderer.showLines }), artworkId };
  const image = renderer.exportCanvas(frame, artworkId);
  exportData = { plan, image, id: artworkId };
  $('export-image').href = image.toDataURL('image/png');
  $('export-image').download = `${artworkId}.png`;
  $('export-plan').href = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(plan, null, 2))}`;
  $('export-plan').download = `${artworkId}.json`;
  const preview = $('export-preview'); preview.width = 800; preview.height = 575;
  preview.getContext('2d').drawImage(image, 0, 0, preview.width, preview.height);
  $('export-summary').textContent = `${artworkId} · 观察时刻 t = ${frame.diagnostics.time.toFixed(2)} · 阻片 (${obstacle.x.toFixed(2)}, ${obstacle.y.toFixed(2)})`;
  $('save-dialog').showModal();
};
$('export-image').onclick = () => {
  toast('已发起图像下载。请同时导出方案，保留它的生成条件。');
};
$('export-plan').onclick = () => {
  toast('已发起方案下载，可通过“载入方案”重新计算。');
};
$('remember-button').onclick = () => {
  if (!exportData) return;
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(exportData.plan)); toast('已在这台浏览器保存方案。'); }
  catch { toast('浏览器未允许本地保存，请使用 JSON 导出。'); }
};
$('plan-file').onchange = async event => {
  const file = event.target.files?.[0]; if (!file) return;
  if (file.size > 20000) { $('load-error').textContent = '方案文件不能超过 20 KB。'; return; }
  try { $('plan-text').value = await file.text(); $('load-error').textContent = ''; }
  catch { $('load-error').textContent = '文件读取失败，请重新选择。'; }
};
function restore(text) {
  try {
    const plan = readPlan(text);
    obstacle = { ...plan.obstacle }; restoring = plan;
    renderer.showDye = plan.display.dye; renderer.showLines = plan.display.lines;
    for (const [button, selected] of [['layer-dye', renderer.showDye], ['layer-lines', renderer.showLines]]) {
      $(button).classList.toggle('active', selected); $(button).setAttribute('aria-pressed', String(selected));
    }
    $('load-dialog').close(); start('A', plan.step, false);
  } catch (error) { $('load-error').textContent = error.message; }
}
$('import-plan').onclick = () => restore($('plan-text').value);
$('restore-button').onclick = () => {
  try {
    const text = localStorage.getItem(LOCAL_KEY);
    if (!text) { $('load-error').textContent = '这台浏览器还没有保存的方案。'; return; }
    restore(text);
  } catch { $('load-error').textContent = '浏览器未允许读取本地保存，请粘贴导出的 JSON。'; }
};
update();
