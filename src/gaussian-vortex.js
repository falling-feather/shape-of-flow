/** Axisymmetric Gaussian vortex in uniform axial strain, in unbounded space.
 * Constant parameters: s=a², s'=4ν-αs. This includes Oseen and steady Burgers.
 * The mathematical axial coordinate is rendered along world Y.
 */
import {normalizeView} from './view-state.js';
export const GAUSSIAN_MODEL=Object.freeze({dt:1/120,duration:20});
export const GAUSSIAN_DEFAULT=Object.freeze({gamma:3.2,viscosity:.012,strain:.7,initialCore:.55});
export const GAUSSIAN_VIEW=Object.freeze({azimuth:.66,elevation:.16,distance:5.7,skeleton:false});
export const GAUSSIAN_FORMAT='shape-of-flow/gaussian-1';
export const GAUSSIAN_REVISION='gaussian-strain-1';
export const GAUSSIAN_PRESETS=Object.freeze({
  diffusion:{title:'只看扩散',parameters:{...GAUSSIAN_DEFAULT,strain:0}},
  stretching:{title:'拉伸竞争',parameters:{...GAUSSIAN_DEFAULT}},
  balance:{title:'平衡初态',parameters:{...GAUSSIAN_DEFAULT,strain:4*GAUSSIAN_DEFAULT.viscosity/(.4**2),initialCore:.4}},
});

export function validateGaussianParameters(parameters){
  const ranges={gamma:[1,5],viscosity:[.004,.04],strain:[0,1.2],initialCore:[.18,.85]};
  for(const [key,[min,max]] of Object.entries(ranges)){
    if(!Number.isFinite(parameters?.[key])||parameters[key]<min||parameters[key]>max)throw new Error('参数超出当前解析实验范围。');
  }
  return Object.fromEntries(Object.keys(ranges).map(key=>[key,parameters[key]]));
}

export function gaussianState(parameters,time){
  const {gamma,viscosity,strain,initialCore}=parameters;
  const decay=Math.exp(-strain*time);
  const core2=initialCore**2*decay+4*viscosity*(strain===0?time:-Math.expm1(-strain*time)/strain);
  return {gamma,viscosity,strain,initialCore,core2,time};
}

function angularRate(radius2,state){
  const q=radius2/state.core2;
  return state.gamma/(2*Math.PI*state.core2)*(q===0?1:-Math.expm1(-q)/q);
}

export function gaussianVelocity(point,state){
  const [x,y,z]=point,rotation=angularRate(x*x+z*z,state),a=state.strain;
  return [-a*x/2+rotation*z,a*y,-a*z/2-rotation*x];
}

/** Exact radial/axial transport; Simpson quadrature of angular displacement.
 * A Cartesian RK2 rotation would artificially increase radius at high Γ/ν.
 */
export function advanceGaussianTracer(point,before,after,dt){
  const [x,y,z]=point,r2=x*x+z*z,decay=Math.exp(-after.strain*dt/2);
  const middle={...after,core2:(before.core2*decay+after.core2)/(1+decay)};
  const angle=dt/6*(angularRate(r2,before)+4*angularRate(r2*decay,middle)+angularRate(r2*decay*decay,after));
  const c=Math.cos(angle),s=Math.sin(angle);
  return [(x*c+z*s)*decay,y/(decay*decay),(z*c-x*s)*decay];
}

/** Pressure divided by constant density. Only its gradient affects momentum. */
export function pressureGradient(point,state){
  const [x,y,z]=point,a=state.strain,k=angularRate(x*x+z*z,state)**2-a*a/4;
  return [k*x,-a*a*y,k*z];
}

export function enclosedCirculation(radius,state){
  return state.gamma*-Math.expm1(-radius*radius/state.core2);
}

export function vorticityBudget(radius,state){
  const {gamma,viscosity:nu,strain:a,core2:s}=state,r2=radius*radius;
  const omega=gamma/(Math.PI*s)*Math.exp(-r2/s);
  const transport=-a*r2/s*omega,stretch=a*omega,diffusion=4*nu*(r2/(s*s)-1/s)*omega;
  return {radius,omega,transport,stretch,diffusion,net:transport+stretch+diffusion};
}

export class GaussianWorld {
  constructor(parameters=GAUSSIAN_DEFAULT){
    this.parameters=validateGaussianParameters(parameters);this.config={...GAUSSIAN_MODEL};
    this.kind='gaussian';this.tick=0;this.input=null;this.rings=[];
  }
  get time(){return this.tick*this.config.dt;}
  state(){return gaussianState(this.parameters,this.time);}
  field(){const s=this.state();return {kind:'gaussian',analytic:[s.gamma,s.core2,s.strain],count:0,positions:new Float64Array(0),vectors:new Float64Array(0)};}
  step(){const before=this.field();this.tick++;return {before,after:this.field()};}
  metrics(){
    const s=this.state();return {tick:this.tick,time:this.time,core:Math.sqrt(s.core2),core2:s.core2,
      peak:s.gamma/(Math.PI*s.core2),circulation:s.gamma,center:[0,0,0],centers:[],span:5.2,
      equilibrium:s.strain>0?Math.sqrt(4*s.viscosity/s.strain):null,coreRate:4*s.viscosity-s.strain*s.core2,finite:true};
  }
  snapshot(){return {kind:this.kind,tick:this.tick,time:this.time,parameters:{...this.parameters},state:this.state(),rings:[],input:null,metrics:this.metrics()};}
}

export function encodeGaussianPlan(parameters,tick,view=GAUSSIAN_VIEW,probe=0,reference=null){
  const normalized=validateGaussianParameters(parameters);
  if(!Number.isInteger(tick)||tick<0||tick>GAUSSIAN_MODEL.duration/GAUSSIAN_MODEL.dt)throw new Error('观察时刻不合法。');
  const normalizedView=normalizeView(view,{allowSkeleton:false});
  if(!Number.isFinite(probe)||probe<0||probe>2.4)throw new Error('探针半径不合法。');
  if(reference!==null){
    if(typeof reference!=='object'||Array.isArray(reference))throw new Error('对照条件不合法。');
    if(!Number.isInteger(reference.tick)||reference.tick<0||reference.tick>GAUSSIAN_MODEL.duration/GAUSSIAN_MODEL.dt)throw new Error('对照时刻不合法。');
    reference={parameters:validateGaussianParameters(reference.parameters),tick:reference.tick};
  }
  return {format:GAUSSIAN_FORMAT,solver:GAUSSIAN_REVISION,model:{...GAUSSIAN_MODEL},parameters:normalized,tick,
    view:normalizedView,probe,reference};
}

export function readGaussianPlan(text){
  if(typeof text!=='string'||text.length>1000000)throw new Error('方案需为不超过 1 MB 的 JSON。');
  let plan;try{plan=JSON.parse(text);}catch{throw new Error('不是有效的 JSON。');}
  if(plan?.format==='shape-of-flow/vortex-1')throw new Error('这是涡环工坊方案，请从涡环工坊载入。');
  if(plan?.format==='shape-of-flow/1')throw new Error('这是二维方案，请从二维实验载入。');
  if(plan?.format!==GAUSSIAN_FORMAT||plan?.solver!==GAUSSIAN_REVISION)throw new Error('这不是当前方程剧场的方案。');
  if(!plan.model||Object.entries(GAUSSIAN_MODEL).some(([key,value])=>plan.model[key]!==value))throw new Error('时间步配置不兼容。');
  return encodeGaussianPlan(plan.parameters,plan.tick,plan.view,plan.probe,plan.reference??null);
}
