import test from 'node:test';
import assert from 'node:assert/strict';
import {LearningJournal,makeLearningPlan,expectedObservation,readLearningResult,LESSONS,transferFinding,measureLearningObservation} from '../src/learning-core.js';
import {GaussianWorld} from '../src/gaussian-vortex.js';

test('松手实验在同刻比较，停止输入后环量保持且涡环继续前进',()=>{
  const a=expectedObservation(1,'A'),b=expectedObservation(1,'B');
  assert.equal(a.time,b.time);assert.ok(a.gamma>b.gamma);assert.ok(b.afterReleaseDistance>.02);
  assert.equal(b.gamma,b.releaseGamma);
});

test('只改黏性便可在同一拉伸下得到相反核宽变化',()=>{
  const a=expectedObservation(2,'A'),b=expectedObservation(2,'B',.032);
  assert.equal(a.time,b.time);assert.equal(a.gamma,b.gamma);assert.equal(a.alpha,b.alpha);
  assert.ok(a.core<a.initialCore);assert.ok(b.core>b.initialCore);
  assert.ok(a.budget.net>0);assert.ok(b.budget.net<0);
});

test('学习记录先观察再预测，不接受伪造观测或未检验的完成状态',()=>{
  const journal=new LearningJournal();
  assert.throws(()=>journal.predict(1,'continues'));
  journal.record(1,'A',expectedObservation(1,'A'));
  journal.predict(1,'continues');
  assert.throws(()=>journal.record(1,'B',{...expectedObservation(1,'B'),gamma:999}));
  journal.record(1,'B',expectedObservation(1,'B'));
  assert.equal(journal.complete(1),false);
  journal.explain(1,'self-induced');assert.equal(journal.complete(1),true);
});

test('黏性未跨过分界时允许重试，不把收细错误标作增宽发现',()=>{
  const journal=new LearningJournal();journal.record(2,'A',expectedObservation(2,'A'));journal.predict(2,'can-widen');
  journal.record(2,'B',expectedObservation(2,'B',.006),.006);
  assert.equal(journal.goal(2),false);assert.equal(journal.complete(2),false);
  journal.record(2,'B',expectedObservation(2,'B',.032),.032);journal.explain(2,'diffusion');
  assert.equal(journal.complete(2),true);
});

test('研究窗口只记录标度释读，核心能量与全域能量清楚区分',()=>{
  const journal=new LearningJournal();journal.record(3,'A',expectedObservation(3,'A'));journal.predict(3,'volume-matters');
  journal.record(3,'B',expectedObservation(3,'B',6),6);journal.explain(3,'whole-energy-zero');
  assert.equal(journal.complete(3),false);journal.explain(3,'core-scaling');assert.equal(journal.complete(3),true);
  assert.equal(LESSONS[2].nature,'文献标度释读');
});

test('保存恢复保留预测、条件和数据，不信任被改写的结果数字',()=>{
  const journal=new LearningJournal();journal.record(1,'A',expectedObservation(1,'A'));journal.predict(1,'continues');journal.record(1,'B',expectedObservation(1,'B'));journal.explain(1,'self-induced');
  const text=journal.serialize(),restored=readLearningResult(text);assert.equal(restored.complete(1),true);
  const bad=JSON.parse(text);bad.lessons[0].trials.B.measurement.gamma=999;
  assert.throws(()=>readLearningResult(JSON.stringify(bad)));
  const plan=makeLearningPlan(2,'B',.032);assert.equal(plan.parameters.strain,.7);assert.equal(plan.parameters.viscosity,.032);
});

test('迁移核对从同环量初态解析值导出四分之一，不虚构学习成绩',()=>{
  const result=transferFinding();assert.ok(Math.abs(result.ratio-.25)<1e-12);
  assert.equal(result.time,0);assert.ok(result.originalPeak>result.doubledCorePeak);
});

test('学习记录校验真实显示模型的观测，不以参数重算覆盖错误读数',()=>{
  const plan=makeLearningPlan(2,'A'),world=new GaussianWorld(plan.parameters);world.tick=plan.tick;
  const model=world.snapshot();model.metrics.core*=2;
  const measured=measureLearningObservation(2,'A',{family:'gaussian',model,probe:0});
  assert.equal(measured.core,model.metrics.core);
  assert.throws(()=>new LearningJournal().record(2,'A',measured));
});
