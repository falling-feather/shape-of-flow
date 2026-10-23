/** Regularized, free-space vortex filaments; not a full 3D Navier–Stokes solver. */
import {normalizeView} from './view-state.js';
export const VORTEX_MODEL = Object.freeze({ dt:1/120, points:96, viscosity:0.00045, duration:30,
  circulationRate:0.45, maxCirculation:2.5, maxStrain:0.35, maxSpan:14, seed:49231 });
export const VORTEX_FORMAT = 'shape-of-flow/vortex-1';
export const VORTEX_REVISION = 'regularized-filament-3';
export const VORTEX_VIEW = Object.freeze({azimuth:0.52,elevation:0.30,distance:5.1,skeleton:false});
export const PRESETS = Object.freeze({
  ring:{title:'一环自走',subtitle:'没有外部输入，涡环为什么仍会前进？'},
  leapfrog:{title:'双环相遇',subtitle:'后方的涡环会追上前方吗？'},
  fold:{title:'折叠与余流',subtitle:'拉长一处，整体会怎样回应？'},
});
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function unit(v) { const n=Math.hypot(...v);return n>1e-12?v.map(x=>x/n):[0,0,1]; }
export function ringCenter(ring) {
  const center=[0,0,0],n=ring.points.length/3;
  for(let i=0;i<ring.points.length;i++)center[i%3]+=ring.points[i]/n;
  return center;
}
export function ringLength(ring) {
  let length=0;const p=ring.points,n=p.length/3;
  for(let i=0;i<n;i++){const j=(i+1)%n;length+=Math.hypot(p[3*j]-p[3*i],p[3*j+1]-p[3*i+1],p[3*j+2]-p[3*i+2]);}
  return length;
}
export function makeRing({center,normal,radius,gamma,core,bend=0},n=VORTEX_MODEL.points) {
  const axis=unit(normal),ref=Math.abs(axis[1])<0.9?[0,1,0]:[1,0,0],u=unit(cross(ref,axis)),v=cross(axis,u);
  const points=new Float64Array(n*3);
  for(let i=0;i<n;i++){const a=i/n*Math.PI*2;for(let k=0;k<3;k++)points[3*i+k]=center[k]+radius*(u[k]*Math.cos(a)+v[k]*Math.sin(a)+axis[k]*bend*Math.sin(3*a));}
  return {points,gamma,core2:core*core};
}
export function packSegments(rings) {
  const count=rings.reduce((s,r)=>s+r.points.length/3,0),positions=new Float64Array(count*4),vectors=new Float64Array(count*4);
  let offset=0;
  for(const ring of rings){const p=ring.points,n=p.length/3;for(let i=0;i<n;i++,offset++){
    const j=(i+1)%n;for(let k=0;k<3;k++){positions[offset*4+k]=(p[3*i+k]+p[3*j+k])*0.5;vectors[offset*4+k]=p[3*j+k]-p[3*i+k];}
    positions[offset*4+3]=ring.core2;vectors[offset*4+3]=ring.gamma;
  }}
  return {count,positions,vectors};
}
export function velocityAt(point,segments) {
  const out=[0,0,0],p=segments.positions,d=segments.vectors;
  for(let i=0;i<segments.count;i++){
    const k=4*i,x=point[0]-p[k],y=point[1]-p[k+1],z=point[2]-p[k+2];
    const r2=x*x+y*y+z*z+p[k+3],factor=d[k+3]/(4*Math.PI*r2*Math.sqrt(r2));
    out[0]+=(d[k+1]*z-d[k+2]*y)*factor;
    out[1]+=(d[k+2]*x-d[k]*z)*factor;
    out[2]+=(d[k]*y-d[k+1]*x)*factor;
  }
  return out;
}
export function strainVelocity(point,input) {
  if(!input||!input.strain)return [0,0,0];
  const n=input.axis,r=point.map((x,i)=>x-input.center[i]),dot=r.reduce((s,x,i)=>s+x*n[i],0);
  return r.map((x,i)=>input.strain*(1.5*n[i]*dot-0.5*x));
}
export function advanceCore(core2,oldLength,newLength,viscosity,dt) {
  return core2*oldLength/newLength+4*viscosity*dt;
}
/** Fixed-node arc-length redistribution. Its interpolation error is a model limitation. */
export function redistribute(ring){
  const p=ring.points,n=p.length/3,lengths=new Float64Array(n+1);
  for(let i=0;i<n;i++){const j=(i+1)%n;lengths[i+1]=lengths[i]+Math.hypot(p[3*j]-p[3*i],p[3*j+1]-p[3*i+1],p[3*j+2]-p[3*i+2]);}
  const q=new Float64Array(p.length);let segment=0;
  for(let i=0;i<n;i++){const target=i/n*lengths[n];while(segment<n-1&&lengths[segment+1]<target)segment++;const t=(target-lengths[segment])/Math.max(1e-12,lengths[segment+1]-lengths[segment]),next=(segment+1)%n;for(let k=0;k<3;k++)q[3*i+k]=p[3*segment+k]*(1-t)+p[3*next+k]*t;}
  ring.points=q;ring.core2*=lengths[n]/ringLength(ring);
}
const cloneRings=rings=>rings.map(r=>({points:r.points.slice(),gamma:r.gamma,core2:r.core2}));
export class VortexWorld {
  constructor(preset='leapfrog',config=VORTEX_MODEL) {
    if(!PRESETS[preset])throw new Error('未知的三维实验。');
    this.config={...config};this.preset=preset;this.tick=0;this.input=null;
    const ring=(center,normal,radius,gamma=1.4,core=0.09,bend=0)=>makeRing({center,normal,radius,gamma,core,bend},config.points);
    this.rings=preset==='ring'?[ring([0,0,0],[0,0,1],1.05)]
      :preset==='leapfrog'?[ring([0,0,-0.42],[0,0,1],1.02),ring([0,0,0.42],[0,0,1],1.02)]
        :[ring([-0.3,0,-0.2],[0.15,0.25,1],1.15,1.3,0.10,0.22),ring([0.3,0,0.25],[-0.2,0.45,1],0.85,1.1,0.09,-0.12)];
    this.initial=this.metrics();
  }
  get time(){return this.tick*this.config.dt;}
  field(){return packSegments(this.rings);}
  apply(event) {
    if(event.type==='release'){this.input=null;return;}
    if(event.type!=='input')throw new Error('未知输入事件。');
    this.input={ring:event.ring,power:event.power,axis:unit(event.axis),center:[...event.center],strain:event.strain};
  }
  step() {
    const dt=this.config.dt,before=packSegments(this.rings),predicted=cloneRings(this.rings),slopes=[];
    for(let r=0;r<this.rings.length;r++){
      const ring=this.rings[r],next=predicted[r],slope=new Float64Array(ring.points.length);slopes.push(slope);
      if(this.input?.ring===r)next.gamma=Math.max(-this.config.maxCirculation,Math.min(this.config.maxCirculation,ring.gamma+dt*this.config.circulationRate*this.input.power));
      for(let j=0;j<ring.points.length;j+=3){const point=Array.from(ring.points.slice(j,j+3)),a=velocityAt(point,before),b=strainVelocity(point,this.input);
        for(let k=0;k<3;k++){slope[j+k]=a[k]+b[k];next.points[j+k]=point[k]+dt*slope[j+k];}}
      next.core2=advanceCore(ring.core2,ringLength(ring),ringLength(next),this.config.viscosity,dt);
    }
    const predictedSegments=packSegments(predicted);
    for(let r=0;r<this.rings.length;r++){
      const ring=this.rings[r],next=predicted[r],oldLength=ringLength(ring);
      for(let j=0;j<ring.points.length;j+=3){const point=Array.from(next.points.slice(j,j+3)),a=velocityAt(point,predictedSegments),b=strainVelocity(point,this.input);
        for(let k=0;k<3;k++)ring.points[j+k]+=dt*0.5*(slopes[r][j+k]+a[k]+b[k]);}
      ring.gamma=next.gamma;ring.core2=advanceCore(ring.core2,oldLength,ringLength(ring),this.config.viscosity,dt);
    }
    this.tick++;if(this.tick%12===0)for(const ring of this.rings)redistribute(ring);
    const metrics=this.metrics();
    if(!metrics.finite||metrics.span>this.config.maxSpan||metrics.core<0.012)throw new Error('本次拉伸超出当前涡丝近似的展示尺度，请重置或减小输入。');
    return {before,after:packSegments(this.rings)};
  }
  metrics() {
    const center=[0,0,0],min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    let length=0,area=0,gamma=0,peak=0,finite=true;
    for(const ring of this.rings){const l=ringLength(ring);length+=l;area+=l*ring.core2;gamma+=Math.abs(ring.gamma);peak=Math.max(peak,Math.abs(ring.gamma)/(Math.PI*ring.core2));
      const c=ringCenter(ring);for(let k=0;k<3;k++)center[k]+=c[k]/this.rings.length;
      for(let j=0;j<ring.points.length;j++){const x=ring.points[j],k=j%3;min[k]=Math.min(min[k],x);max[k]=Math.max(max[k],x);if(!Number.isFinite(x))finite=false;}
      if(!Number.isFinite(ring.gamma)||!Number.isFinite(ring.core2)||ring.core2<=0)finite=false;
    }
    return {tick:this.tick,time:this.time,center,length,core:Math.sqrt(area/length),circulation:gamma,peak,
      span:Math.max(...max.map((x,i)=>x-min[i])),finite,centers:this.rings.map(ringCenter)};
  }
  snapshot(){return {tick:this.tick,time:this.time,preset:this.preset,rings:cloneRings(this.rings),input:this.input?structuredClone(this.input):null,metrics:this.metrics()};}
}

function validateEvent(event,maxTick) {
  if(!Number.isInteger(event?.step)||event.step<0||event.step>maxTick)throw new Error('输入事件时刻不合法。');
  if(event.type==='release')return {step:event.step,type:'release'};
  if(event.type!=='input'||!Number.isInteger(event.ring)||event.ring<0||event.ring>1||!Number.isFinite(event.power)||Math.abs(event.power)>1.5
    ||!Number.isFinite(event.strain)||event.strain<0||event.strain>VORTEX_MODEL.maxStrain)throw new Error('旋转输入或拉伸参数不合法。');
  for(const key of ['axis','center'])if(!Array.isArray(event[key])||event[key].length!==3||!event[key].every(x=>Number.isFinite(x)&&Math.abs(x)<=100))throw new Error('输入空间坐标不合法。');
  if(Math.hypot(...event.axis)<0.01)throw new Error('拉伸方向不能为零。');
  return {step:event.step,type:'input',ring:event.ring,power:event.power,axis:[...event.axis],center:[...event.center],strain:event.strain};
}
export function encodeVortexPlan(preset,events,tick,view=VORTEX_VIEW) {
  if(!PRESETS[preset]||!Number.isInteger(tick)||tick<0||tick>VORTEX_MODEL.duration/VORTEX_MODEL.dt)throw new Error('实验或观察时刻不合法。');
  if(!Array.isArray(events)||events.length>5000)throw new Error('输入事件数量超出范围。');
  let last=-1;const normalized=events.map(event=>{const e=validateEvent(event,tick);if(e.step<last)throw new Error('输入事件顺序不合法。');last=e.step;if(preset==='ring'&&e.ring===1)throw new Error('该实验没有第二个涡环。');return e;});
  return {format:VORTEX_FORMAT,solver:VORTEX_REVISION,model:{...VORTEX_MODEL},preset,events:normalized,tick,view:normalizeView(view)};
}
export function readVortexPlan(text) {
  if(typeof text!=='string'||text.length>1000000)throw new Error('方案需为不超过 1 MB 的 JSON。');
  let plan;try{plan=JSON.parse(text);}catch{throw new Error('不是有效的 JSON 方案。');}
  if(plan?.format==='shape-of-flow/1')throw new Error('这是二维绕流方案，请在“二维实验”中载入。');
  if(plan?.format!==VORTEX_FORMAT||plan?.solver!==VORTEX_REVISION)throw new Error('三维方案格式或模型版本不兼容。');
  if(!plan.model||Object.entries(VORTEX_MODEL).some(([k,v])=>plan.model[k]!==v))throw new Error('模型配置不兼容，不能按相同条件重放。');
  return encodeVortexPlan(plan.preset,plan.events,plan.tick,plan.view??null);
}
export function replayVortexPlan(plan) {
  const world=new VortexWorld(plan.preset);let cursor=0;
  for(let n=0;n<plan.tick;n++){while(plan.events[cursor]?.step===n)world.apply(plan.events[cursor++]);world.step();}
  while(plan.events[cursor]?.step===plan.tick)world.apply(plan.events[cursor++]);
  return world;
}
/** A recorded intervention, replayed by the same integrator as a visitor's gestures. */
export function demonstrationPlan(){
  return encodeVortexPlan('ring',[
    {step:90,type:'input',ring:0,power:1,axis:[1,0,0],center:[0,0,.25],strain:0},
    {step:120,type:'input',ring:0,power:1,axis:[1,0,0],center:[0,0,.25],strain:.1},
    {step:150,type:'input',ring:0,power:1,axis:unit([.9,.3,.15]),center:[0,0,.25],strain:.2},
    {step:210,type:'input',ring:0,power:1,axis:unit([.7,.5,.2]),center:[0,0,.25],strain:.3},
    {step:330,type:'release'},
  ],840);
}
