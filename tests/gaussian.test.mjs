import test from 'node:test';
import assert from 'node:assert/strict';
import {GaussianWorld,gaussianState,gaussianVelocity,advanceGaussianTracer,pressureGradient,vorticityBudget,enclosedCirculation,encodeGaussianPlan,readGaussianPlan,GAUSSIAN_DEFAULT} from '../src/gaussian-vortex.js';
import {researchScales,RESEARCH_H,encodeResearchPlan,readResearchPlan,researchEnvelope} from '../src/research-scales.js';
import {explainGaussian} from '../src/gaussian-explanation.js';

const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);

test('无拉伸时退化为 Oseen 扩散，恒定拉伸趋向 Burgers 核宽',()=>{
  const diffusion=gaussianState({...GAUSSIAN_DEFAULT,strain:0},4);
  near(diffusion.core2,GAUSSIAN_DEFAULT.initialCore**2+16*GAUSSIAN_DEFAULT.viscosity);
  const steady=gaussianState(GAUSSIAN_DEFAULT,100);
  near(steady.core2,4*GAUSSIAN_DEFAULT.viscosity/GAUSSIAN_DEFAULT.strain);
  const a=gaussianState({...GAUSSIAN_DEFAULT,strain:1e-9},4);
  near(a.core2,diffusion.core2,1e-8);
});

test('轴心速度有限且无假截断，环量积分符合高斯解析值',()=>{
  const state=gaussianState(GAUSSIAN_DEFAULT,2);
  assert.ok(gaussianVelocity([0,0,0],state).every(value=>value===0));
  const r=1e-8,v=gaussianVelocity([r,0,0],state);
  near(-v[2]/r,state.gamma/(2*Math.PI*state.core2));
  near(enclosedCirculation(Math.sqrt(state.core2),state),state.gamma*(1-Math.exp(-1)));
  near(enclosedCirculation(10,state),state.gamma);
});

test('解析速度无散，curl 与高斯涡量相符',()=>{
  const state=gaussianState(GAUSSIAN_DEFAULT,2),p=[.27,.19,-.21],e=1e-5;
  const deriv=axis=>{const a=[...p],b=[...p];a[axis]+=e;b[axis]-=e;const u=gaussianVelocity(a,state),v=gaussianVelocity(b,state);return u.map((x,i)=>(x-v[i])/(2*e));};
  const [dx,dy,dz]=[0,1,2].map(deriv);
  near(dx[0]+dy[1]+dz[2],0);
  near(dz[0]-dx[2],state.gamma/(Math.PI*state.core2)*Math.exp(-(p[0]**2+p[2]**2)/state.core2),1e-6);
});

test('非稳态高斯拉伸涡满足完整 NS 动量关系，不只核宽关系',()=>{
  for(const strain of [0,.7])for(const point of [[.3,.2,.1],[.08,-.3,-.18],[0,.2,0]]){
    const config={...GAUSSIAN_DEFAULT,strain},t=1.7,e=1e-4,state=gaussianState(config,t),u=gaussianVelocity(point,state);
    const plus=gaussianVelocity(point,gaussianState(config,t+e)),minus=gaussianVelocity(point,gaussianState(config,t-e));
    const time=plus.map((v,k)=>(v-minus[k])/(2*e)),conv=[0,0,0],lap=[0,0,0];
    for(let a=0;a<3;a++){const p=[...point],m=[...point];p[a]+=e;m[a]-=e;const v=gaussianVelocity(p,state),w=gaussianVelocity(m,state);
      for(let k=0;k<3;k++){conv[k]+=u[a]*(v[k]-w[k])/(2*e);lap[k]+=(v[k]-2*u[k]+w[k])/(e*e);}}
    const grad=pressureGradient(point,state);
    for(let k=0;k<3;k++)near(time[k]+conv[k]+grad[k]-config.viscosity*lap[k],0,2e-5);
  }
});

test('探针展示的输运、拉伸、扩散逐项相加等于实际时间导数',()=>{
  const config=GAUSSIAN_DEFAULT,t=2,state=gaussianState(config,t);
  for(const r of [0,.2,.8]){const b=vorticityBudget(r,state),e=1e-5;
    const w=s=>s.gamma/(Math.PI*s.core2)*Math.exp(-r*r/s.core2);
    const derivative=(w(gaussianState(config,t+e))-w(gaussianState(config,t-e)))/(2*e);
    near(b.transport+b.stretch+b.diffusion,derivative,1e-6);near(b.net,derivative,1e-6);
  }
});

test('强旋转示踪保留精确径向收缩与轴向伸长，不产生数值膨胀',()=>{
  const config={gamma:5,viscosity:.004,strain:1.2,initialCore:.18},dt=1/120,initial=[.05,.001,.03];let p=[...initial];
  for(let n=0;n<120;n++)p=advanceGaussianTracer(p,gaussianState(config,5+n*dt),gaussianState(config,5+(n+1)*dt),dt);
  near(Math.hypot(p[0],p[2]),Math.hypot(initial[0],initial[2])*Math.exp(-config.strain/2),1e-12);
  near(p[1],initial[1]*Math.exp(config.strain),1e-12);
});

test('参数重放一致且拒绝跨模型、不合法参数、时刻和视角',()=>{
  const plan=encodeGaussianPlan(GAUSSIAN_DEFAULT,720),decoded=readGaussianPlan(JSON.stringify(plan));
  assert.deepEqual(decoded,plan);
  const a=new GaussianWorld(decoded.parameters);for(let i=0;i<720;i++)a.step();
  near(a.metrics().core,Math.sqrt(gaussianState(GAUSSIAN_DEFAULT,6).core2));
  assert.equal(a.metrics().circulation,GAUSSIAN_DEFAULT.gamma);
  assert.throws(()=>readGaussianPlan('{"format":"shape-of-flow/vortex-1"}'));
  assert.throws(()=>encodeGaussianPlan({...GAUSSIAN_DEFAULT,viscosity:0},120));
  assert.throws(()=>encodeGaussianPlan(GAUSSIAN_DEFAULT,NaN));
  assert.throws(()=>readGaussianPlan(JSON.stringify({...plan,view:{...plan.view,distance:0}})));
});

test('论文代表幂律两向都缩小、细长度增加、速度增大而核心能量下降',()=>{
  const a=researchScales(0),b=researchScales(6);
  assert.ok(RESEARCH_H>0&&RESEARCH_H<.01);
  assert.ok(b.radial<a.radial&&b.axial<a.axial&&b.aspect>a.aspect);
  assert.ok(b.speed>a.speed&&b.coreEnergy<a.coreEnergy);
  near(b.coreEnergy,b.volume*b.speed**2,1e-12);
  assert.throws(()=>researchScales(Infinity));assert.throws(()=>researchScales(-1));
});

test('研究包络遵守相似坐标关系，研究方案拒绝错误来源且不导入额外相机属性',()=>{
  const scales=researchScales(3),eta=.4,point=researchEnvelope(eta,.7,scales),q=scales.tau/(1-eta*eta);
  near((point[0]**2+point[2]**2)/(2*q),.05,1e-12);near(point[1],q**(.5-RESEARCH_H)*eta,1e-12);
  const view={azimuth:.6,elevation:.2,distance:5,skeleton:false},plan=encodeResearchPlan(3,true,view);
  assert.deepEqual(readResearchPlan({...plan,view:{...view,target:[999,0,0]}}).view,view);
  assert.throws(()=>readResearchPlan({...plan,h:.4}));assert.throws(()=>readResearchPlan({...plan,source:'other'}));
  assert.throws(()=>readResearchPlan({...plan,window:{...plan.window,X:.4}}));
  assert.throws(()=>readResearchPlan({...plan,view:{...view,distance:0}}));
});

test('稳态初态与渐近平衡被区分，存在拉伸也可能净增宽',()=>{
  const steady=new GaussianWorld({...GAUSSIAN_DEFAULT,initialCore:Math.sqrt(4*GAUSSIAN_DEFAULT.viscosity/GAUSSIAN_DEFAULT.strain)});
  assert.match(explainGaussian(steady.snapshot()).phase,/^平衡/);
  const transient=new GaussianWorld();transient.tick=2400;assert.match(explainGaussian(transient.snapshot()).phase,/接近平衡/);
  const widening=new GaussianWorld({...GAUSSIAN_DEFAULT,strain:1.2,viscosity:.04,initialCore:.18});
  assert.match(explainGaussian(widening.snapshot()).phase,/扩散占上风/);
});

test('学习卡方案保留对照条件和观察时刻，不用当前条件覆盖 A',()=>{
  const reference={parameters:{...GAUSSIAN_DEFAULT,strain:0},tick:720};
  const plan=readGaussianPlan(JSON.stringify(encodeGaussianPlan(GAUSSIAN_DEFAULT,720,undefined,.2,reference)));
  assert.equal(plan.reference.parameters.strain,0);assert.equal(plan.parameters.strain,.7);assert.equal(plan.reference.tick,720);
  assert.throws(()=>encodeGaussianPlan(GAUSSIAN_DEFAULT,720,undefined,0,{...reference,tick:-1}));
  assert.throws(()=>encodeGaussianPlan(GAUSSIAN_DEFAULT,720,undefined,0,false));
});
