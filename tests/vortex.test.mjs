import test from 'node:test';
import assert from 'node:assert/strict';
import {explainEvolution} from '../src/vortex-explanation.js';
import { VortexWorld, makeRing, velocityAt, strainVelocity, packSegments, advanceCore, redistribute,ringLength,ringCenter,encodeVortexPlan, readVortexPlan, replayVortexPlan, demonstrationPlan,VORTEX_MODEL } from '../src/vortex-model.js';

test('规则化环在轴心的速度接近解析积分，且环量变号使速度反向', () => {
  const ring = makeRing({ center:[0,0,0], normal:[0,0,1], radius:1, gamma:1, core:0.1 }, 96);
  const segments = packSegments([ring]);
  const v = velocityAt([0,0,0], segments);
  const expected = 1 / (2 * (1 + 0.1 ** 2) ** 1.5);
  assert.ok(Math.abs(v[2] - expected) / expected < 0.002);
  assert.ok(Math.abs(v[0]) < 1e-12 && Math.abs(v[1]) < 1e-12);
  ring.gamma = -1;
  assert.ok(Math.abs(velocityAt([0,0,0], packSegments([ring]))[2] + v[2]) < 1e-12);
});
test('核内速度有限，闭合涡丝场在远离涡核处近似无散', () => {
  const ring = makeRing({ center:[0,0,0], normal:[0,0,1], radius:1, gamma:1, core:0.1 });
  const segments = packSegments([ring]);
  assert.ok(velocityAt(Array.from(ring.points.slice(0,3)), segments).every(Number.isFinite));
  const point = [0.25,0.31,0.45], eps = 1e-4;
  let divergence = 0;
  for (let axis=0;axis<3;axis++) {
    const p = [...point], m = [...point]; p[axis]+=eps;m[axis]-=eps;
    divergence += (velocityAt(p,segments)[axis]-velocityAt(m,segments)[axis])/(2*eps);
  }
  assert.ok(Math.abs(divergence)<1e-6);
});
test('外部线性拉伸无散，并沿指定轴拉长、横向收缩', () => {
  assert.deepEqual(strainVelocity([2,1,0],{ axis:[1,0,0],center:[0,0,0],strain:0.4 }),[0.8,-0.2,0]);
  const e=1e-4, input={axis:[0,0,1],center:[0,0,0],strain:0.6};
  const div=[0,1,2].reduce((sum,a)=>{const p=[0,0,0];p[a]=e;return sum+strainVelocity(p,input)[a]/e;},0);
  assert.ok(Math.abs(div)<1e-12);
});
test('弧长重分布保留环量和近似涡管体积，不引入开口',()=>{
  const ring=makeRing({center:[0,0,0],normal:[0,0,1],radius:1,gamma:1,core:.1,bend:.2});
  const volume=ringLength(ring)*ring.core2;redistribute(ring);
  assert.equal(ring.gamma,1);assert.ok(Math.abs(ringLength(ring)*ring.core2-volume)<1e-12);
  assert.equal(ring.points.length,VORTEX_MODEL.points*3);assert.ok(ring.points.every(Number.isFinite));
});
test('涡管拉长使核截面缩小，黏性独立增大核面积', () => {
  assert.equal(advanceCore(0.04,1,2,0,0.1),0.02);
  assert.equal(advanceCore(0.04,1,1,0.002,0.1),0.0408);
});
test('无外部输入仍有自诱导运动，环量保持、涡核扩散', () => {
  const w=new VortexWorld('ring');const z0=w.metrics().center[2];const g=w.rings[0].gamma, a=w.rings[0].core2;
  for(let n=0;n<120;n++)w.step();
  assert.ok(w.metrics().center[2]>z0+0.1);
  assert.equal(w.rings[0].gamma,g);assert.ok(w.rings[0].core2>a);
  assert.ok(w.metrics().finite);
});
test('输入和释放作用到模型，释放后不会继续增加环量', () => {
  const w=new VortexWorld('ring');const gamma=w.rings[0].gamma;
  w.apply({type:'input',ring:0,power:1,axis:[1,0,0],center:[0,0,0],strain:0.4});
  for(let n=0;n<120;n++)w.step();
  assert.ok(w.rings[0].gamma>gamma);assert.ok(w.metrics().length>w.initial.length*1.03);
  w.apply({type:'release'});const after=w.rings[0].gamma;
  for(let n=0;n<60;n++)w.step();
  assert.equal(w.rings[0].gamma,after);
});
test('同一事件方案重放一致，旧二维格式与不合法事件被明确拒绝', () => {
  const events=[{step:12,type:'input',ring:0,power:1,axis:[1,0,0],center:[0,0,0],strain:0.3},{step:90,type:'release'}];
  const plan=encodeVortexPlan('ring',events,180);
  assert.deepEqual(readVortexPlan(JSON.stringify(plan)),plan);
  const a=replayVortexPlan(plan), b=new VortexWorld('ring');
  for(let n=0;n<180;n++){for(const e of events)if(e.step===n)b.apply(e);b.step();}
  assert.deepEqual(a.rings[0].points,b.rings[0].points);
  assert.equal(a.rings[0].gamma,b.rings[0].gamma);
  assert.throws(()=>readVortexPlan('{"format":"shape-of-flow/1"}'));
  assert.throws(()=>readVortexPlan(JSON.stringify({...plan,events:[{...events[0],axis:[null,0,0]}]})));
  assert.throws(()=>readVortexPlan(JSON.stringify({...plan,model:{...VORTEX_MODEL,dt:1}})));
});
test('保存时刻恰好松手，重放包含端点释放事件',()=>{
  const events=[{step:0,type:'input',ring:0,power:1,axis:[1,0,0],center:[0,0,0],strain:0},{step:60,type:'release'}];
  const world=replayVortexPlan(encodeVortexPlan('ring',events,60));assert.equal(world.input,null);
});
test('核宽变大时解释拉伸与扩散竞争，不虚构核收细',()=>{
  const w=new VortexWorld('ring'),model=w.snapshot();model.input={ring:0,strain:.3};model.context={inputStart:{length:model.metrics.length*.8,core:model.metrics.core*.9}};
  assert.match(explainEvolution(model).text,/拉伸与扩散同时/);
});
test('回看的解释使用该时刻记录的松手状态',()=>{
  const w=new VortexWorld('ring'),model=w.snapshot();model.time=2;model.context={released:{time:1,core:model.metrics.core}};
  assert.match(explainEvolution(model).index,/余流/);assert.match(explainEvolution(model).evidence,/1.00 t/);
});
test('余流中涡核仍在收缩时不声称净增宽',()=>{
  const model=new VortexWorld('ring').snapshot();model.time=2;model.context={released:{time:1,core:model.metrics.core*1.1}};
  assert.match(explainEvolution(model).text,/仍在收细/);
});

test('刚松手且核宽未变时不声称已经增宽或收细',()=>{
  const model=new VortexWorld('ring').snapshot();model.context={released:{time:model.time,core:model.metrics.core}};
  assert.doesNotMatch(explainEvolution(model).text,/更宽|仍在收细/);
});
test('三步示范真实改变长度与环量，并在松手后继续演变',()=>{
  const plan=demonstrationPlan(),end=replayVortexPlan(plan),atRelease=replayVortexPlan({...plan,tick:330});
  assert.equal(end.input,null);assert.ok(end.metrics().length>end.initial.length*1.05);
  assert.ok(end.metrics().circulation>end.initial.circulation);assert.equal(end.rings[0].gamma,atRelease.rings[0].gamma);
  assert.ok(Math.hypot(...ringCenter(end.rings[0]).map((x,i)=>x-ringCenter(atRelease.rings[0])[i]))>.02);
});
